import crypto from 'crypto';

import { userRepository } from '../repositories/userRepository.js';
import { sendOtpEmail } from '../utils/email.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/token.js';
import {
  AppError,
  BadRequest,
  Unauthorized,
  Forbidden,
  Conflict,
} from '../utils/AppError.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { safeRedis } from '../utils/redis.js';

const OTP_EXPIRY_SECONDS = 10 * 60;
const OTP_LIMIT = 5;
const LOCK_TIME = 15 * 60;

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) =>
  crypto.createHash('sha256').update(String(otp)).digest('hex');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const toClientLocation = (location) => {
  if (!location) return null;
  const coords = location.coordinates || [];

  if (Array.isArray(coords) && coords.length >= 2) {
    return {
      name: location.name || 'Current location',
      lat: Number(coords[1]),
      lng: Number(coords[0]),
      updatedAt: location.updatedAt,
    };
  }

  if (location.lat !== undefined && location.lng !== undefined) {
    return {
      name: location.name || 'Current location',
      lat: Number(location.lat),
      lng: Number(location.lng),
      updatedAt: location.updatedAt,
    };
  }

  return null;
};

const verifyOtpKey = (email) => `otp:verify:${normalizeEmail(email)}`;
const resetOtpKey = (email) => `otp:reset:${normalizeEmail(email)}`;
const verifyAttemptKey = (email) => `otp_attempts:${normalizeEmail(email)}`;
const resetAttemptKey = (email) => `reset_attempts:${normalizeEmail(email)}`;

const storeOtp = async ({ email, otp, purpose }) => {
  const otpHash = hashOtp(otp);
  const key = purpose === 'reset' ? resetOtpKey(email) : verifyOtpKey(email);
  const attemptKey = purpose === 'reset' ? resetAttemptKey(email) : verifyAttemptKey(email);

  await safeRedis.setex(key, OTP_EXPIRY_SECONDS, otpHash);
  await safeRedis.del(attemptKey);
};

const sendOtpOrThrow = async ({ email, otp, type }) => {
  try {
    await sendOtpEmail(email, otp, type);

    if (env.DEV_SHOW_OTP && env.NODE_ENV !== 'production') {
      logger.warn({ event: 'dev_otp', email, type, otp });
    }
  } catch (error) {
    if (env.DEV_SHOW_OTP && env.NODE_ENV !== 'production') {
      logger.warn({
        event: 'dev_otp_email_failed_but_otp_is_valid',
        email,
        type,
        otp,
      });
    }

    throw new AppError(
      'OTP email sending failed. Check EMAIL_PORT=587 with EMAIL_SECURE=false, Gmail App Password, and internet/SMTP access.',
      502
    );
  }
};

export const authService = {
  async register({ name, email, password }) {
    email = normalizeEmail(email);

    let user = await userRepository.findPublicByEmail(email);

    if (user?.isVerified) {
      throw Conflict('Email already registered');
    }

    if (user) {
      user.name = name;
      user.password = password;
      await userRepository.save(user);
    } else {
      user = await userRepository.create({
        name,
        email,
        password,
      });
    }

    const otp = generateOtp();

    await storeOtp({ email, otp, purpose: 'verify' });
    await sendOtpOrThrow({ email, otp, type: 'verify' });

    logger.info({ event: 'otp_sent_register', email });

    return { message: 'Verification OTP sent' };
  },

  async verifyEmailOtp({ email, otp }) {
    email = normalizeEmail(email);

    const user = await userRepository.findPublicByEmail(email);

    if (!user) {
      throw BadRequest('Invalid OTP');
    }

    if (user.isVerified) {
      return { message: 'Email already verified' };
    }

    const attempts = Number((await safeRedis.get(verifyAttemptKey(email))) || 0);

    if (attempts >= OTP_LIMIT) {
      throw Forbidden('Too many attempts. Try later');
    }

    const storedOtpHash = await safeRedis.get(verifyOtpKey(email));

    if (!storedOtpHash) {
      throw BadRequest('OTP expired. Please request a new OTP');
    }

    const incomingHash = hashOtp(otp);

    if (storedOtpHash !== incomingHash) {
      await safeRedis.setex(verifyAttemptKey(email), LOCK_TIME, attempts + 1);
      throw BadRequest('Invalid OTP');
    }

    await safeRedis.del(verifyOtpKey(email));
    await safeRedis.del(verifyAttemptKey(email));

    user.isVerified = true;
    await userRepository.save(user);

    return { message: 'Email verified' };
  },

  async resendVerificationOtp(email) {
    email = normalizeEmail(email);

    const user = await userRepository.findPublicByEmail(email);

    if (!user || user.isVerified) {
      return {
        message:
          'If that email is pending verification, a new OTP has been sent',
      };
    }

    const otp = generateOtp();

    await storeOtp({ email, otp, purpose: 'verify' });
    await sendOtpOrThrow({ email, otp, type: 'verify' });

    logger.info({ event: 'otp_resent', email });

    return {
      message:
        'If that email is pending verification, a new OTP has been sent',
    };
  },

  async login({ email, password, currentLocation }) {
    email = normalizeEmail(email);

    const user = await userRepository.findAuthByEmail(email);

    if (!user) {
      throw Unauthorized('Invalid credentials');
    }

    const lockKey = `login_lock:${email}`;
    const locked = await safeRedis.get(lockKey);

    if (locked) {
      throw Forbidden('Account temporarily locked');
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      const failKey = `login_fail:${email}`;
      const fails = Number((await safeRedis.get(failKey)) || 0) + 1;

      if (fails >= 5) {
        await safeRedis.setex(lockKey, LOCK_TIME, 1);
        await safeRedis.del(failKey);
      } else {
        await safeRedis.setex(failKey, LOCK_TIME, fails);
      }

      throw Unauthorized('Invalid credentials');
    }

    await safeRedis.del(`login_fail:${email}`);

    if (!user.isVerified) {
      throw Forbidden('Verify email first');
    }

    if (
      currentLocation?.lat !== undefined &&
      currentLocation?.lng !== undefined
    ) {
      user.currentLocation = {
        type: 'Point',
        coordinates: [Number(currentLocation.lng), Number(currentLocation.lat)],
        updatedAt: new Date(),
      };

      await userRepository.save(user);
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        profilePic: user.profilePic || '',
        bio: user.bio || '',
        rating: user.rating || 0,
        rideCount: user.rideCount || 0,
        isVerified: user.isVerified,
        role: user.role || 'user',
        trustedContact: user.trustedContact || {},
        verification: user.verification || {},
        safetyPreferences: user.safetyPreferences || {},
        currentLocation: toClientLocation(user.currentLocation),
      },
    };
  },

  async refreshAccessToken(token) {
    let decoded;

    try {
      decoded = verifyRefreshToken(token);
    } catch {
      throw Unauthorized('Invalid refresh token');
    }

    const blacklisted = await safeRedis.get(`rbl:${decoded.jti}`);

    if (blacklisted) {
      throw Unauthorized('Refresh token revoked');
    }

    const accessToken = generateAccessToken(decoded.id);

    return { accessToken };
  },

  async logout(userId, jti) {
    if (jti) {
      await safeRedis.setex(`bl:${jti}`, 60 * 60, 1);
    }

    logger.info({ event: 'logout', userId });

    return { message: 'Logged out' };
  },

  async forgotPassword(email) {
    email = normalizeEmail(email);

    const user = await userRepository.findPublicByEmail(email);

    if (!user || !user.isVerified) {
      return {
        message:
          'If that email is registered, a password-reset OTP has been sent',
      };
    }

    const otp = generateOtp();

    await storeOtp({ email, otp, purpose: 'reset' });
    await sendOtpOrThrow({ email, otp, type: 'reset' });

    logger.info({ event: 'forgot_password', email });

    return {
      message:
        'If that email is registered, a password-reset OTP has been sent',
    };
  },

  async resetPassword({ email, otp, password }) {
    email = normalizeEmail(email);

    const user = await userRepository.findPublicByEmail(email);

    if (!user) {
      throw BadRequest('Invalid request');
    }

    const attempts = Number((await safeRedis.get(resetAttemptKey(email))) || 0);

    if (attempts >= OTP_LIMIT) {
      throw Forbidden('Too many attempts. Try later');
    }

    const storedOtpHash = await safeRedis.get(resetOtpKey(email));

    if (!storedOtpHash) {
      throw BadRequest('OTP expired. Please request a new OTP');
    }

    const incomingHash = hashOtp(otp);

    if (storedOtpHash !== incomingHash) {
      await safeRedis.setex(resetAttemptKey(email), LOCK_TIME, attempts + 1);
      throw BadRequest('Invalid OTP');
    }

    await safeRedis.del(resetOtpKey(email));
    await safeRedis.del(resetAttemptKey(email));

    user.password = password;
    await userRepository.save(user);

    logger.info({ event: 'password_reset', email });

    return { message: 'Password reset successful' };
  },
};
