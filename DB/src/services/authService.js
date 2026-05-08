import crypto from 'crypto';

import { userRepository } from '../repositories/userRepository.js';
import { sendOtpEmail, getEmailDebugConfig } from '../utils/email.js';
import { env } from '../config/env.js';
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
import { logger } from '../utils/logger.js';
import { safeRedis } from '../utils/redis.js';

const OTP_EXPIRY_SECONDS = 10 * 60;
const OTP_LIMIT = 5;
const LOCK_TIME = 15 * 60;

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) =>
  crypto.createHash('sha256').update(String(otp)).digest('hex');

const memoryCache = new Map();

const setMemory = (key, seconds, value) => {
  memoryCache.set(key, {
    value: String(value),
    expiresAt: Date.now() + Number(seconds) * 1000,
  });
};

const getMemory = (key) => {
  const item = memoryCache.get(key);
  if (!item) return null;

  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }

  return item.value;
};

const delMemory = (key) => {
  memoryCache.delete(key);
};

const cache = {
  async setex(key, seconds, value) {
    const redisResult = await safeRedis.setex(key, seconds, value);
    if (redisResult === null || redisResult === undefined) {
      setMemory(key, seconds, value);
    }
    return true;
  },

  async get(key) {
    const redisValue = await safeRedis.get(key);
    return redisValue ?? getMemory(key);
  },

  async del(key) {
    await safeRedis.del(key);
    delMemory(key);
    return true;
  },
};

const buildOtpResponse = (baseMessage, deliveryResult) => ({
  message: baseMessage,
  ...(deliveryResult?.devOtp
    ? {
        devOtp: deliveryResult.devOtp,
        emailDelivery: 'failed_dev_fallback',
        emailError: deliveryResult.emailError,
        emailConfig: deliveryResult.emailConfig,
      }
    : { emailDelivery: 'sent' }),
});

const deliverOtpOrFallback = async ({ email, otp, type }) => {
  try {
    await sendOtpEmail(email, otp, type);
    return { delivered: true };
  } catch (error) {
    const emailConfig = getEmailDebugConfig();

    if (env.EMAIL_FAIL_OPEN) {
      logger.warn({
        event: 'otp_email_fail_open',
        email,
        type,
        otp: env.EMAIL_LOG_OTP ? otp : undefined,
        error: error.message,
        emailConfig,
      });

      return {
        delivered: false,
        devOtp: env.EMAIL_LOG_OTP ? otp : undefined,
        emailError: error.message,
        emailConfig,
      };
    }

    throw new AppError(
      'OTP email sending failed. Please verify BREVO_API_KEY and EMAIL_FROM, then redeploy.',
      502
    );
  }
};


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

const verifyOtpKey = (email) => `otp:verify:${email}`;
const resetOtpKey = (email) => `otp:reset:${email}`;
const verifyAttemptKey = (email) => `otp_attempts:${email}`;
const resetAttemptKey = (email) => `reset_attempts:${email}`;

export const authService = {
  async register({ name, email, password }) {
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
    const otpHash = hashOtp(otp);

    await cache.setex(verifyOtpKey(email), OTP_EXPIRY_SECONDS, otpHash);
    await cache.del(verifyAttemptKey(email));

    const deliveryResult = await deliverOtpOrFallback({
      email,
      otp,
      type: 'verify',
    });

    return buildOtpResponse('Verification OTP sent', deliveryResult);
  },

  async verifyEmailOtp({ email, otp }) {
    const user = await userRepository.findPublicByEmail(email);

    if (!user) {
      throw BadRequest('Invalid OTP');
    }

    if (user.isVerified) {
      return { message: 'Email already verified' };
    }

    const attempts = Number((await cache.get(verifyAttemptKey(email))) || 0);

    if (attempts >= OTP_LIMIT) {
      throw Forbidden('Too many attempts. Try later');
    }

    const storedOtpHash = await cache.get(verifyOtpKey(email));

    if (!storedOtpHash) {
      throw BadRequest('OTP expired. Please request a new OTP');
    }

    const incomingHash = hashOtp(otp);

    if (storedOtpHash !== incomingHash) {
      await cache.setex(verifyAttemptKey(email), LOCK_TIME, attempts + 1);
      throw BadRequest('Invalid OTP');
    }

    await cache.del(verifyOtpKey(email));
    await cache.del(verifyAttemptKey(email));

    user.isVerified = true;
    await userRepository.save(user);

    return { message: 'Email verified' };
  },

  async resendVerificationOtp(email) {
    const user = await userRepository.findPublicByEmail(email);

    if (!user || user.isVerified) {
      return {
        message:
          'If that email is pending verification, a new OTP has been sent',
      };
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    await cache.setex(verifyOtpKey(email), OTP_EXPIRY_SECONDS, otpHash);
    await cache.del(verifyAttemptKey(email));

    const deliveryResult = await deliverOtpOrFallback({
      email,
      otp,
      type: 'verify',
    });

    logger.info({ event: 'otp_resent', email });

    return buildOtpResponse(
      'If that email is pending verification, a new OTP has been sent',
      deliveryResult
    );
  },

  async login({ email, password, currentLocation }) {
    const user = await userRepository.findAuthByEmail(email);

    if (!user) {
      throw Unauthorized('Invalid credentials');
    }

    const lockKey = `login_lock:${email}`;
    const locked = await cache.get(lockKey);

    if (locked) {
      throw Forbidden('Account temporarily locked');
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      const failKey = `login_fail:${email}`;
      const fails = Number((await cache.get(failKey)) || 0) + 1;

      if (fails >= 5) {
        await cache.setex(lockKey, LOCK_TIME, 1);
        await cache.del(failKey);
      } else {
        await cache.setex(failKey, LOCK_TIME, fails);
      }

      throw Unauthorized('Invalid credentials');
    }

    await cache.del(`login_fail:${email}`);

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

    const blacklisted = await cache.get(`rbl:${decoded.jti}`);

    if (blacklisted) {
      throw Unauthorized('Refresh token revoked');
    }

    const accessToken = generateAccessToken(decoded.id);

    return { accessToken };
  },

  async logout(userId, jti, refreshToken) {
    if (jti) {
      await cache.setex(`bl:${jti}`, 60 * 60, 1);
    }

    if (refreshToken) {
      try {
        const decodedRefresh = verifyRefreshToken(refreshToken);
        const ttl = Math.max(1, (decodedRefresh.exp || 0) - Math.floor(Date.now() / 1000));
        await cache.setex(`rbl:${decodedRefresh.jti}`, ttl, 1);
      } catch {
        // Ignore invalid refresh token during logout cleanup.
      }
    }

    logger.info({ event: 'logout', userId });

    return { message: 'Logged out' };
  },

  async forgotPassword(email) {
    const user = await userRepository.findPublicByEmail(email);

    if (!user || !user.isVerified) {
      return {
        message:
          'If that email is registered, a password-reset OTP has been sent',
      };
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    await cache.setex(resetOtpKey(email), OTP_EXPIRY_SECONDS, otpHash);
    await cache.del(resetAttemptKey(email));

    const deliveryResult = await deliverOtpOrFallback({
      email,
      otp,
      type: 'reset',
    });

    logger.info({ event: 'forgot_password', email });

    return buildOtpResponse(
      'If that email is registered, a password-reset OTP has been sent',
      deliveryResult
    );
  },

  async resetPassword({ email, otp, password }) {
    const user = await userRepository.findPublicByEmail(email);

    if (!user) {
      throw BadRequest('Invalid request');
    }

    const attempts = Number((await cache.get(resetAttemptKey(email))) || 0);

    if (attempts >= OTP_LIMIT) {
      throw Forbidden('Too many attempts. Try later');
    }

    const storedOtpHash = await cache.get(resetOtpKey(email));

    if (!storedOtpHash) {
      throw BadRequest('OTP expired. Please request a new OTP');
    }

    const incomingHash = hashOtp(otp);

    if (storedOtpHash !== incomingHash) {
      await cache.setex(resetAttemptKey(email), LOCK_TIME, attempts + 1);
      throw BadRequest('Invalid OTP');
    }

    await cache.del(resetOtpKey(email));
    await cache.del(resetAttemptKey(email));

    user.password = password;
    await userRepository.save(user);

    logger.info({ event: 'password_reset', email });

    return { message: 'Password reset successful' };
  },
};
