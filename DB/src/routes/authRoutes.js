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

const clientUrl = env.CLIENT_URL.replace(/\/$/, '');

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post(
  '/register',
  registerLimiter,
  validate(registerSchema),
  auth.register
);

router.post(
  '/verify-otp',
  loginLimiter,
  validate(verifyOtpSchema),
  auth.verifyEmailOtp
);

router.post(
  '/resend-verification-otp',
  forgotLimiter,
  validate(emailSchema),
  auth.resendVerificationOtp
);

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  auth.login
);

router.post(
  '/forgot-password',
  forgotLimiter,
  validate(forgotPasswordSchema),
  auth.forgotPassword
);

router.post(
  '/reset-password',
  loginLimiter,
  validate(resetPasswordSchema),
  auth.resetPassword
);

router.post('/refresh-token', auth.refreshToken);

router.get('/users/:id/public', auth.getPublicProfile);

router.get('/me', protect, auth.getProfile);

router.put(
  '/me',
  protect,
  validate(updateProfileSchema),
  auth.updateProfile
);

router.put(
  '/me/location',
  protect,
  validate(updateLocationSchema),
  auth.updateMyLocation
);

router.post('/me/block/:userId', protect, auth.blockUser);

router.delete('/me/block/:userId', protect, auth.unblockUser);

router.post('/logout', protect, auth.logout);

/**
 * Google OAuth start
 * Final URL:
 * GET /api/auth/google
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

/**
 * Google OAuth callback
 * Final URL:
 * GET /api/auth/google/callback
 */
router.get('/google/callback', (req, res, next) => {
  passport.authenticate(
    'google',
    {
      session: false,
    },
    async (err, payload) => {
      try {
        if (err) {
          console.error('Google OAuth error:', err);
          return res.redirect(
            `${clientUrl}/login?error=${encodeURIComponent('google_oauth_failed')}`
          );
        }

        if (!payload) {
          return res.redirect(
            `${clientUrl}/login?error=${encodeURIComponent('google_oauth_failed')}`
          );
        }

        const user = payload.user || payload;

        if (!user?._id) {
          console.error('Google OAuth user missing:', payload);
          return res.redirect(
            `${clientUrl}/login?error=${encodeURIComponent('google_user_missing')}`
          );
        }

        const accessToken =
          payload.accessToken || generateAccessToken(user._id);

        const refreshToken =
          payload.refreshToken || generateRefreshToken(user._id);

        res.cookie('refreshToken', refreshToken, refreshCookieOptions);

        const redirectUrl = new URL(clientUrl);
        redirectUrl.searchParams.set('token', accessToken);
        redirectUrl.searchParams.set('name', user.name || 'User');
        redirectUrl.searchParams.set('profilePic', user.profilePic || '');

        return res.redirect(redirectUrl.toString());
      } catch (error) {
        console.error('Google callback handler error:', error);
        return next(error);
      }
    }
  )(req, res, next);
});

export default router;