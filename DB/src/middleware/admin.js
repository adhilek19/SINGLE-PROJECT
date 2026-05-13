import User from '../models/User.js';
import { Forbidden, Unauthorized } from '../utils/AppError.js';

export const adminOnly = async (req, _res, next) => {
  try {
    if (!req.userId) {
      return next(Unauthorized('Authentication required'));
    }

    if (req.userRole === 'admin') {
      return next();
    }

    const user = await User.findById(req.userId).select('_id role');
    if (!user) {
      return next(Unauthorized('User not found. Please log in again.'));
    }

    if (user.role !== 'admin') {
      return next(Forbidden('Admin access required'));
    }

    req.userRole = user.role;
    req.user = req.user || user;
    return next();
  } catch (err) {
    return next(err);
  }
};

export default adminOnly;
