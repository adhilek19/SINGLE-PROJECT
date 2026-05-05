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

    EMAIL_HOST: joi.string().default('smtp.gmail.com'),
    // Gmail STARTTLS uses 587 + secure=false. Port 465 uses secure=true.
    EMAIL_PORT: joi.number().valid(465, 587).default(587),
    EMAIL_SECURE: joi.boolean().truthy('true').falsy('false').optional(),
    EMAIL_USER: joi.string().required(),
    EMAIL_PASS: joi.string().required(),
    EMAIL_FROM: joi.string().allow('').optional(),
    // In development/local, OTP endpoints should not break the whole auth flow
    // when SMTP is blocked by hosting/network. In production keep this false.
    EMAIL_FAIL_OPEN: joi.boolean().truthy('true').falsy('false').optional(),
    EMAIL_LOG_OTP: joi.boolean().truthy('true').falsy('false').optional(),

    GOOGLE_CLIENT_ID: joi.string().required(),
    GOOGLE_CLIENT_SECRET: joi.string().required(),
    GOOGLE_CALLBACK_URL: joi.string().uri().optional(),

    REDIS_URL: joi.string().uri().required(),

    CLOUDINARY_CLOUD_NAME: joi.string().required(),
    CLOUDINARY_API_KEY: joi.string().required(),
    CLOUDINARY_API_SECRET: joi.string().required(),
  })
  .unknown();

const { error, value } = envSchema.validate(process.env, {
  abortEarly: false,
  convert: true,
});

if (error) {
  throw new Error(`ENV validation failed: ${error.message}`);
}

const port = Number(value.EMAIL_PORT || 587);

// If EMAIL_SECURE is not explicitly set, choose the correct value by port.
// 465 = implicit TLS true, 587 = STARTTLS false.
if (value.EMAIL_SECURE === undefined) {
  value.EMAIL_SECURE = port === 465;
}

// Development fallback only. Set EMAIL_FAIL_OPEN=false in production.
if (value.EMAIL_FAIL_OPEN === undefined) {
  value.EMAIL_FAIL_OPEN = value.NODE_ENV !== 'production';
}

if (value.EMAIL_LOG_OTP === undefined) {
  value.EMAIL_LOG_OTP = value.NODE_ENV !== 'production';
}

if (!value.EMAIL_FROM) {
  value.EMAIL_FROM = `SahaYatri <${value.EMAIL_USER}>`;
}

export const env = value;

if (!env.GOOGLE_CALLBACK_URL) {
  env.GOOGLE_CALLBACK_URL = `${env.BACKEND_URL.replace(/\/$/, '')}/api/auth/google/callback`;
}
