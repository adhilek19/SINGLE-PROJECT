
import rateLimit from 'express-rate-limit';

const limiter = (max, windowMin, message) =>
  rateLimit({
    windowMs: windowMin * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
  });

export const loginLimiter    = limiter(10, 15, 'Too many login attempts. Try again in 15 minutes.');
export const registerLimiter = limiter(5, 60, 'Too many registrations from this IP.');
export const forgotLimiter   = limiter(5, 60, 'Too many password reset requests.');
export const apiLimiter      = limiter(200, 15, 'Too many requests.');