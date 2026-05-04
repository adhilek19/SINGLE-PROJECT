import 'dotenv/config';
import joi from 'joi';

const envSchema = joi.object({
  NODE_ENV:joi.string().valid('development', 'production', 'test').default('development'),
  PORT:joi.number().default(5000),
  BACKEND_URL: joi.string().uri().default('http://localhost:5000'),
  CLIENT_URL:joi.string().uri().trim().required(),
  MONGO_URI:joi.string().uri().required(),

  ACCESS_SECRET:joi.string().min(32).required(),
  ACCESS_EXPIRES_IN:joi.string().default('15m'),
  REFRESH_SECRET:joi.string().min(32).required(),     
  REFRESH_EXPIRES_IN:joi.string().default('7d'),          

  EMAIL_HOST:joi.string().required(),
  EMAIL_PORT:joi.number().default(587),
  EMAIL_USER:joi.string().required(),
  EMAIL_PASS:joi.string().required(),
  EMAIL_FROM:joi.string().email().required(),

  GOOGLE_CLIENT_ID:joi.string().required(),
  GOOGLE_CLIENT_SECRET: joi.string().required(),
  GOOGLE_CALLBACK_URL: joi.string().uri().optional(),

  // Prefer URL to match current `.env` and cloud Redis setups.
  REDIS_URL: joi.string().uri().required(),
  
  CLOUDINARY_CLOUD_NAME: joi.string().required(),
  CLOUDINARY_API_KEY: joi.string().required(),
  CLOUDINARY_API_SECRET: joi.string().required(),
}).unknown();

const { error, value } = envSchema.validate(process.env, { abortEarly: false });

if (error) {
  throw new Error(`ENV validation failed: ${error.message}`);
}

export const env = value;
if (!env.GOOGLE_CALLBACK_URL) {
  env.GOOGLE_CALLBACK_URL = `${env.BACKEND_URL.replace(/\/$/, '')}/api/auth/google/callback`;
}
