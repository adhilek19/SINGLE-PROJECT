import 'dotenv/config';
import joi from 'joi';

const envSchema = joi
  .object({
    NODE_ENV: joi.string().valid('development', 'production', 'test').default('development'),
    PORT: joi.number().default(5000),
    BACKEND_URL: joi.string().uri().default('http://localhost:5000'),
    SERVER_URL: joi.string().uri().optional(),
    CLIENT_URL: joi.string().uri().trim().required(),
    CLIENT_URLS: joi.string().allow('').optional(),
    MONGO_URI: joi.string().uri().required(),

    ACCESS_SECRET: joi.string().min(32).required(),
    ACCESS_EXPIRES_IN: joi.string().default('15m'),
    REFRESH_SECRET: joi.string().min(32).required(),
    REFRESH_EXPIRES_IN: joi.string().default('7d'),

    // Keep optional at startup so deployment does not crash if mail vars are missing.
    // OTP endpoints still fail with clear errors when these are absent.
    EMAIL_FROM: joi.string().trim().allow('').optional(),
    BREVO_API_KEY: joi.string().trim().allow('').optional(),
    // In development/local, OTP endpoints should not break the whole auth flow
    // when email delivery fails due provider/network issues. In production keep this false.
    EMAIL_FAIL_OPEN: joi.boolean().truthy('true').falsy('false').optional(),
    EMAIL_LOG_OTP: joi.boolean().truthy('true').falsy('false').optional(),
    EMAIL_PROVIDER_BLOCK_SECONDS: joi.number().integer().min(30).max(86400).optional(),

    GOOGLE_CLIENT_ID: joi.string().required(),
    GOOGLE_CLIENT_SECRET: joi.string().required(),
    GOOGLE_CALLBACK_URL: joi.string().uri().optional(),

    REDIS_URL: joi.string().uri().required(),

    CLOUDINARY_CLOUD_NAME: joi.string().required(),
    CLOUDINARY_API_KEY: joi.string().required(),
    CLOUDINARY_API_SECRET: joi.string().required(),
    CHAT_MEDIA_MAX_SIZE_MB: joi.number().integer().min(1).max(100).optional(),
    CHAT_MEDIA_CLOUDINARY_FOLDER: joi.string().trim().allow('').optional(),
    CHAT_VOICE_MAX_SIZE_MB: joi.number().integer().min(1).max(100).optional(),
    CHAT_VOICE_MAX_DURATION_SEC: joi.number().integer().min(1).max(1800).optional(),
    WEBRTC_STUN_URL: joi.string().trim().allow('').optional(),
    WEBRTC_TURN_URLS: joi.string().trim().allow('').optional(),
    WEBRTC_TURN_USERNAME: joi.string().trim().allow('').optional(),
    WEBRTC_TURN_CREDENTIAL: joi.string().trim().allow('').optional(),
    WEBRTC_CALL_RING_TIMEOUT_MS: joi.number().integer().min(5000).max(120000).optional(),
  })
  .unknown();

const { error, value } = envSchema.validate(process.env, {
  abortEarly: false,
  convert: true,
});

if (error) {
  throw new Error(`ENV validation failed: ${error.message}`);
}

// Development fallback only. Set EMAIL_FAIL_OPEN=false in production.
if (value.EMAIL_FAIL_OPEN === undefined) {
  value.EMAIL_FAIL_OPEN = value.NODE_ENV !== 'production';
}

if (value.EMAIL_LOG_OTP === undefined) {
  value.EMAIL_LOG_OTP = value.NODE_ENV !== 'production';
}

if (value.EMAIL_PROVIDER_BLOCK_SECONDS === undefined) {
  value.EMAIL_PROVIDER_BLOCK_SECONDS = 300;
}

export const env = value;

if (!env.GOOGLE_CALLBACK_URL) {
  env.GOOGLE_CALLBACK_URL = `${env.BACKEND_URL.replace(/\/$/, '')}/api/auth/google/callback`;
}

if (env.CHAT_MEDIA_MAX_SIZE_MB === undefined) {
  env.CHAT_MEDIA_MAX_SIZE_MB = 25;
}

if (!env.CHAT_MEDIA_CLOUDINARY_FOLDER) {
  env.CHAT_MEDIA_CLOUDINARY_FOLDER = 'sahayatri/chat';
}

if (env.CHAT_VOICE_MAX_SIZE_MB === undefined) {
  env.CHAT_VOICE_MAX_SIZE_MB = Math.min(10, Number(env.CHAT_MEDIA_MAX_SIZE_MB || 25));
}

if (env.CHAT_VOICE_MAX_DURATION_SEC === undefined) {
  env.CHAT_VOICE_MAX_DURATION_SEC = 180;
}

if (!env.WEBRTC_STUN_URL) {
  env.WEBRTC_STUN_URL = 'stun:stun.l.google.com:19302';
}

if (env.WEBRTC_CALL_RING_TIMEOUT_MS === undefined) {
  env.WEBRTC_CALL_RING_TIMEOUT_MS = 30000;
}
