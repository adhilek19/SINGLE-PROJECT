import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';
import { Forbidden, Unauthorized } from '../utils/AppError.js';
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

    const user = await User.findById(decoded.id).select('_id role isBlocked');
    if (!user) {
      return next(Unauthorized('User not found. Please log in again.'));
    }

    if (user.isBlocked) {
      return next(Forbidden('Your account has been blocked. Contact support.'));
    }

    req.userId = decoded.id;
    req.tokenJti = decoded.jti;
    req.userRole = user.role || 'user';
    req.user = user;

    next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return next(Unauthorized('Token expired. Please log in again.'));
    }
    return next(Unauthorized('Invalid token'));
  }
};
