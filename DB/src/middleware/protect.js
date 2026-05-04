import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Unauthorized } from '../utils/AppError.js';
import { safeRedis } from '../utils/redis.js';

export const protect = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer '))
    return next(Unauthorized('Authentication required'));

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.ACCESS_SECRET);

    // 🔴 CHECK BLACKLIST
    const blacklisted = await safeRedis.get(`bl:${decoded.jti}`);
    if (blacklisted) {
      return next(Unauthorized('Token invalidated. Please log in again.'));
    }

    req.userId = decoded.id;
    req.tokenJti = decoded.jti;

    next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return next(Unauthorized('Token expired. Please log in again.'));
    }
    return next(Unauthorized('Invalid token'));
  }
};