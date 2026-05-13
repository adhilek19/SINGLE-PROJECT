import { env } from '../config/env.js';
import { logger } from './logger.js';

const DEFAULT_PROD_ORIGIN = 'https://saha-yatri-theta.vercel.app';
const vercelPreviewRegex =
  /^https:\/\/saha-yatri-[a-z0-9-]+(?:-[a-z0-9-]+)?\.vercel\.app$/i;

const normalizeOrigin = (origin = '') => String(origin || '').trim().replace(/\/+$/, '');

const rawOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  DEFAULT_PROD_ORIGIN,
  env.CLIENT_URL,
  ...(String(env.CLIENT_URLS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)),
  String(process.env.FRONTEND_URL || '').trim(),
  String(process.env.CORS_ORIGIN || '').trim(),
];

export const allowedOrigins = Array.from(
  new Set(rawOrigins.map(normalizeOrigin).filter(Boolean))
);

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  return (
    allowedOrigins.includes(normalizedOrigin) ||
    vercelPreviewRegex.test(normalizedOrigin)
  );
};

export const validateCorsOrigin = (origin, callback, source = 'express') => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }

  logger.warn({
    event: 'cors_blocked_origin',
    source,
    origin: String(origin || ''),
  });
  callback(new Error(`CORS blocked for origin: ${origin}`), false);
};
