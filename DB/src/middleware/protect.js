import { logger } from '../utils/logger.js';
import { authenticateAccessToken } from '../utils/accessAuth.js';
import { Unauthorized } from '../utils/AppError.js';

export const protect = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    logger.warn({
      event: 'rest_auth_missing_token',
      requestId: req.requestId,
      path: req.originalUrl,
      method: req.method,
    });
    return next(Unauthorized('Authentication required'));
  }

  const token = String(header.split(' ')[1] || '').trim();

  try {
    const authResult = await authenticateAccessToken(token);

    req.userId = authResult.userId;
    req.tokenJti = authResult.jti;
    req.userRole = authResult.user.role || 'user';
    req.user = authResult.user;

    next();
  } catch (err) {
    logger.warn({
      event: 'rest_auth_failed',
      requestId: req.requestId,
      path: req.originalUrl,
      method: req.method,
      reason: err?.message || 'Invalid token',
    });
    return next(err);
  }
};
