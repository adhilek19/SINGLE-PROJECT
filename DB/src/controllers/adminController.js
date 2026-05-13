import User from '../models/User.js';
import Ride from '../models/Ride.js';
import { Report } from '../models/Report.js';
import { BadRequest, NotFound } from '../utils/AppError.js';
import { successResponse } from '../utils/apiResponse.js';
import { notificationService } from '../services/notificationService.js';

const VALID_USER_ROLES = new Set(['user', 'admin']);
const VALID_RIDE_STATUSES = new Set(['scheduled', 'started', 'ended', 'completed', 'cancelled']);
const VALID_REPORT_STATUSES = new Set(['pending', 'reviewed', 'resolved']);

const toPositiveInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getAdminStats = async (_req, res, next) => {
  try {
    const [
      totalUsers,
      totalRides,
      activeRides,
      completedRides,
      cancelledRides,
      blockedUsers,
      pendingReports,
    ] = await Promise.all([
      User.countDocuments({}),
      Ride.countDocuments({}),
      Ride.countDocuments({ status: 'started' }),
      Ride.countDocuments({ status: 'completed' }),
      Ride.countDocuments({ status: 'cancelled' }),
      User.countDocuments({ isBlocked: true }),
      Report.countDocuments({ status: 'pending' }),
    ]);

    return successResponse(res, 200, 'Admin stats fetched', {
      totalUsers,
      totalRides,
      activeRides,
      completedRides,
      cancelledRides,
      blockedUsers,
      pendingReports,
    });
  } catch (err) {
    return next(err);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const role = String(req.query.role || '').trim().toLowerCase();
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(100, toPositiveInt(req.query.limit, 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: regex }, { email: regex }];
    }

    if (role) {
      if (!VALID_USER_ROLES.has(role)) {
        throw BadRequest('Invalid role filter');
      }
      filter.role = role;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('_id name email role isBlocked isVerified profilePic createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return successResponse(res, 200, 'Users fetched', {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    return next(err);
  }
};

export const blockUser = async (req, res, next) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) throw BadRequest('User id is required');
    if (userId === String(req.userId)) {
      throw BadRequest('You cannot block your own admin account');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { isBlocked: true } },
      { new: true }
    ).select('_id name email role isBlocked createdAt updatedAt');

    if (!user) throw NotFound('User not found');

    await notificationService.notifyUserBlocked({
      userId: user._id,
      reason: 'Violation of platform rules',
    });

    return successResponse(res, 200, 'User blocked', { user });
  } catch (err) {
    return next(err);
  }
};

export const unblockUser = async (req, res, next) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) throw BadRequest('User id is required');

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { isBlocked: false } },
      { new: true }
    ).select('_id name email role isBlocked createdAt updatedAt');

    if (!user) throw NotFound('User not found');

    return successResponse(res, 200, 'User unblocked', { user });
  } catch (err) {
    return next(err);
  }
};

export const makeAdmin = async (req, res, next) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) throw BadRequest('User id is required');

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { role: 'admin' } },
      { new: true, runValidators: true }
    ).select('_id name email role isBlocked createdAt updatedAt');

    if (!user) throw NotFound('User not found');

    return successResponse(res, 200, 'User promoted to admin', { user });
  } catch (err) {
    return next(err);
  }
};

export const getAllRides = async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim().toLowerCase();
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(100, toPositiveInt(req.query.limit, 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) {
      if (!VALID_RIDE_STATUSES.has(status)) {
        throw BadRequest('Invalid ride status filter');
      }
      filter.status = status;
    }

    const [rides, total] = await Promise.all([
      Ride.find(filter)
        .populate('driver', 'name email profilePic')
        .populate('passengers.user', 'name email profilePic')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Ride.countDocuments(filter),
    ]);

    return successResponse(res, 200, 'Rides fetched', {
      rides,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    return next(err);
  }
};

export const updateRideStatus = async (req, res, next) => {
  try {
    const rideId = String(req.params.id || '').trim();
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();

    if (!rideId) throw BadRequest('Ride id is required');
    if (!VALID_RIDE_STATUSES.has(nextStatus)) {
      throw BadRequest('Invalid ride status');
    }

    const ride = await Ride.findById(rideId);
    if (!ride) throw NotFound('Ride not found');

    ride.status = nextStatus;
    await ride.save();

    const hydratedRide = await Ride.findById(rideId)
      .populate('driver', 'name email profilePic')
      .populate('passengers.user', 'name email profilePic');

    return successResponse(res, 200, 'Ride status updated', { ride: hydratedRide });
  } catch (err) {
    return next(err);
  }
};

export const getAllReports = async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim().toLowerCase();
    const page = toPositiveInt(req.query.page, 1);
    const limit = Math.min(100, toPositiveInt(req.query.limit, 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) {
      if (!VALID_REPORT_STATUSES.has(status)) {
        throw BadRequest('Invalid report status filter');
      }
      filter.status = status;
    }

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate('reportedBy', 'name email profilePic')
        .populate('reportedUser', 'name email profilePic')
        .populate('ride', 'source destination status departureTime')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(filter),
    ]);

    return successResponse(res, 200, 'Reports fetched', {
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    return next(err);
  }
};

export const updateReportStatus = async (req, res, next) => {
  try {
    const reportId = String(req.params.id || '').trim();
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();

    if (!reportId) throw BadRequest('Report id is required');
    if (!VALID_REPORT_STATUSES.has(nextStatus)) {
      throw BadRequest('Invalid report status');
    }

    const report = await Report.findByIdAndUpdate(
      reportId,
      { $set: { status: nextStatus } },
      { new: true, runValidators: true }
    )
      .populate('reportedBy', 'name email profilePic')
      .populate('reportedUser', 'name email profilePic')
      .populate('ride', 'source destination status departureTime');

    if (!report) throw NotFound('Report not found');

    return successResponse(res, 200, 'Report status updated', { report });
  } catch (err) {
    return next(err);
  }
};
