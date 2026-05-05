import 'dotenv/config';
import joi from 'joi';

const envSchema = joi
  .object({
    NODE_ENV: joi
      .string()
      .valid('development', 'production', 'test')
      .default('development'),
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
    EMAIL_PORT: joi.number().default(587),
    // Do NOT default this to true. For Gmail 587 it must be false/starttls.
    // If omitted, src/utils/email.js infers true only for port 465.
    EMAIL_SECURE: joi.boolean().truthy('true').falsy('false').optional(),
    EMAIL_USER: joi.string().required(),
    EMAIL_PASS: joi.string().required(),
    EMAIL_FROM: joi.string().allow('').optional(),
    DEV_SHOW_OTP: joi.boolean().truthy('true').falsy('false').default(false),

    GOOGLE_CLIENT_ID: joi.string().required(),
    GOOGLE_CLIENT_SECRET: joi.string().required(),
    GOOGLE_CALLBACK_URL: joi.string().uri().optional(),

    REDIS_URL: joi.string().uri().allow('').optional(),

    CLOUDINARY_CLOUD_NAME: joi.string().required(),
    CLOUDINARY_API_KEY: joi.string().required(),
    CLOUDINARY_API_SECRET: joi.string().required(),
  })
  .unknown(true);

const { error, value } = envSchema.validate(process.env, {
  abortEarly: false,
  stripUnknown: false,
});

if (error) {
  throw new Error(`ENV validation failed: ${error.message}`);
}

export const env = value;

const backendBase = (env.BACKEND_URL || env.SERVER_URL || 'http://localhost:5000').replace(/\/$/, '');

if (!env.GOOGLE_CALLBACK_URL) {
  env.GOOGLE_CALLBACK_URL = `${backendBase}/api/auth/google/callback`;
}
