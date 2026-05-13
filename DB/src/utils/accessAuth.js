import User from '../models/User.js';
import { verifyAccessToken } from './token.js';
import { Forbidden, Unauthorized } from './AppError.js';
import { safeRedis } from './redis.js';

const toSafeId = (value) => String(value || '').trim();

export const authenticateAccessToken = async (token) => {
  const safeToken = String(token || '').trim();
  if (!safeToken) {
    throw Unauthorized('Authentication required');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(safeToken);
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      throw Unauthorized('Token expired. Please log in again.');
    }
    throw Unauthorized('Invalid token');
  }

  const jti = toSafeId(decoded?.jti);
  if (jti) {
    const blacklisted = await safeRedis.get(`bl:${jti}`);
    if (blacklisted) {
      throw Unauthorized('Token invalidated. Please log in again.');
    }
  }

  const user = await User.findById(decoded.id).select('_id role isBlocked name profilePic');
  if (!user) {
    throw Unauthorized('User not found. Please log in again.');
  }

  if (user.isBlocked) {
    throw Forbidden('Your account has been blocked. Contact support.');
  }

  return {
    decoded,
    user,
    userId: toSafeId(user._id),
    jti,
  };
};
