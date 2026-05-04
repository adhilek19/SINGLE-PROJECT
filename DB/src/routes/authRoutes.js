import { Router } from 'express';
import passport from 'passport';
import * as auth from '../controller/authController.js';
import { validate } from '../middleware/validate.js';
import { protect } from '../middleware/protect.js';
import {
  loginLimiter,
  registerLimiter,
  forgotLimiter,
} from '../middleware/rateLimit.js';

import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyOtpSchema,
  emailSchema,
  updateProfileSchema,
  updateLocationSchema,
} from '../utils/validators.js';

import { env } from '../config/env.js';
import { generateAccessToken, generateRefreshToken } from '../utils/token.js';

const router = Router();

router.post('/register', registerLimiter, validate(registerSchema), auth.register);
router.post('/verify-otp', loginLimiter, validate(verifyOtpSchema), auth.verifyEmailOtp);
router.post('/resend-verification-otp', forgotLimiter, validate(emailSchema), auth.resendVerificationOtp);
router.post('/login', loginLimiter, validate(loginSchema), auth.login);
router.post('/forgot-password', forgotLimiter, validate(forgotPasswordSchema), auth.forgotPassword);
router.post('/reset-password', loginLimiter, validate(resetPasswordSchema), auth.resetPassword);
router.post('/refresh-token', auth.refreshToken);

router.get('/users/:id/public', auth.getPublicProfile);

router.get('/me', protect, auth.getProfile);
router.put('/me', protect, validate(updateProfileSchema), auth.updateProfile);
router.put('/me/location', protect, validate(updateLocationSchema), auth.updateMyLocation);
router.post('/me/block/:userId', protect, auth.blockUser);
router.delete('/me/block/:userId', protect, auth.unblockUser);

router.post('/logout', protect, auth.logout);

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    state: true,
  })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${env.CLIENT_URL}/login`,
  }),
  async (req, res, next) => {
    try {
      const { user } = req.user;

      const accessToken = generateAccessToken(user._id);
      const refreshToken = generateRefreshToken(user._id);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const name = encodeURIComponent(user.name || 'User');
      const profilePic = encodeURIComponent(user.profilePic || '');
      const baseUrl = env.CLIENT_URL.replace(/\/$/, '');

      res.redirect(
        `${baseUrl}/?token=${encodeURIComponent(accessToken)}&name=${name}&profilePic=${profilePic}`
      );
    } catch (err) {
      next(err);
    }
  }
);

export default router;