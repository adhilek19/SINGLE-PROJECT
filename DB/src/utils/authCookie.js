import { env } from '../config/env.js';

const DEFAULT_REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const parseDurationToMs = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^(\d+)\s*(ms|s|m|h|d|w)$/);
  if (!match) return DEFAULT_REFRESH_MAX_AGE_MS;

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) {
    return DEFAULT_REFRESH_MAX_AGE_MS;
  }

  if (unit === 'ms') return amount;
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  if (unit === 'w') return amount * 7 * 24 * 60 * 60 * 1000;

  return DEFAULT_REFRESH_MAX_AGE_MS;
};

const isProduction = env.NODE_ENV === 'production';

export const refreshTokenCookieBaseOptions = Object.freeze({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/api/auth',
});

export const refreshTokenCookieOptions = Object.freeze({
  ...refreshTokenCookieBaseOptions,
  maxAge: parseDurationToMs(env.REFRESH_EXPIRES_IN),
});

