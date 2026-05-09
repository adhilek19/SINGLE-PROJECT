import { authService } from '../services/authService.js';
import { successResponse } from '../utils/apiResponse.js';
import { AppError, NotFound } from '../utils/AppError.js';
import { userRepository } from '../repositories/userRepository.js';
import { Review } from '../models/Review.js';
import Ride from '../models/Ride.js';
import {
  refreshTokenCookieBaseOptions,
  refreshTokenCookieOptions,
} from '../utils/authCookie.js';

const toClientLocation = (location) => {
  if (!location) return null;

  if (location.lat !== undefined && location.lng !== undefined) {
    return {
      name: location.name || 'Current location',
      lat: Number(location.lat),
      lng: Number(location.lng),
      updatedAt: location.updatedAt,
    };
  }

  const coords = location.coordinates || [];
  if (Array.isArray(coords) && coords.length >= 2) {
    return {
      name: location.name || 'Current location',
      lat: Number(coords[1]),
      lng: Number(coords[0]),
      updatedAt: location.updatedAt,
    };
  }

  return null;
};

const normalizeUserForClient = (userDoc) => {
  if (!userDoc) return userDoc;
  const user = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  user.currentLocation = toClientLocation(user.currentLocation);
  return user;
};

const sanitizePublicRide = (rideDoc) => {
  if (!rideDoc) return null;

  const ride = rideDoc.toObject ? rideDoc.toObject() : { ...rideDoc };
  const vehicle = ride.vehicle || {};

  return {
    _id: ride._id,
    driver: ride.driver,
    source: ride.source,
    destination: ride.destination,
    departureTime: ride.departureTime,
    estimatedEndTime: ride.estimatedEndTime,
    status: ride.status,
    price: ride.price,
    vehicle: {
      type: vehicle.type || '',
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      image: vehicle.image || '',
      verified: Boolean(vehicle.verified),
    },
    seatsAvailable: ride.seatsAvailable,
    bookedSeats: ride.bookedSeats,
    createdAt: ride.createdAt,
  };
};

const toGeoLocation = (location) => {
  if (!location) return undefined;

  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    const lng = Number(location.coordinates[0]);
    const lat = Number(location.coordinates[1]);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        type: 'Point',
        coordinates: [lng, lat],
        updatedAt: new Date(),
      };
    }
  }

  const lat = Number(location.lat);
  const lng = Number(location.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return undefined;
  }

  return {
    type: 'Point',
    coordinates: [lng, lat],
    updatedAt: new Date(),
  };
};

export const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    return successResponse(res, 201, result.message);
  } catch (err) {
    next(err);
  }
};

export const resendVerificationOtp = async (req, res, next) => {
  try {
    const result = await authService.resendVerificationOtp(req.body.email);
    return successResponse(res, 200, result.message);
  } catch (err) {
    next(err);
  }
};

export const verifyEmailOtp = async (req, res, next) => {
  try {
    const result = await authService.verifyEmailOtp(req.body);
    return successResponse(res, 200, result.message);
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { accessToken, refreshToken, user } = await authService.login(req.body);

    res.cookie('refreshToken', refreshToken, refreshTokenCookieOptions);

    return successResponse(res, 200, 'Login successful', {
      accessToken,
      user,
    });
  } catch (err) {
    next(err);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) return next(new AppError('Refresh token missing', 401));

    const { accessToken } = await authService.refreshAccessToken(token);

    return successResponse(res, 200, 'Token refreshed', {
      accessToken,
    });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res, next) => {
  try {
    const result = await authService.logout(
      req.userId,
      req.tokenJti,
      req.cookies?.refreshToken
    );

    res.clearCookie('refreshToken', refreshTokenCookieBaseOptions);
    // Backward compatibility for older cookies that were set on root path.
    res.clearCookie('refreshToken', {
      ...refreshTokenCookieBaseOptions,
      path: '/',
    });

    return successResponse(res, 200, result.message);
  } catch (err) {
    next(err);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.forgotPassword(req.body.email);
    return successResponse(res, 200, result.message);
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const result = await authService.resetPassword(req.body);
    return successResponse(res, 200, result.message);
  } catch (err) {
    next(err);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.userId).select('-password');

    return successResponse(res, 200, 'Profile fetched', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const allowed = [
      'name',
      'phone',
      'bio',
      'profilePic',
      'vehicle',
      'trustedContact',
      'safetyPreferences',
      'currentLocation',
    ];

    const data = {};

    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        data[key] = req.body[key];
      }
    });

    if (data.vehicle) {
      data.vehicle = {
        ...data.vehicle,
        ...(data.vehicle.type ? { type: data.vehicle.type } : {}),
      };

      if (!data.vehicle.type) {
        delete data.vehicle.type;
      }
    }

    if (data.currentLocation) {
      const geoLocation = toGeoLocation(data.currentLocation);
      if (geoLocation) {
        data.currentLocation = geoLocation;
      } else {
        delete data.currentLocation;
      }
    }

    const user = await userRepository
      .updateById(req.userId, data)
      .select('-password');

    return successResponse(res, 200, 'Profile updated', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};

export const updateMyLocation = async (req, res, next) => {
  try {
    const { lat, lng } = req.body;

    const user = await userRepository
      .updateById(req.userId, {
        currentLocation: {
          type: 'Point',
          coordinates: [Number(lng), Number(lat)],
          updatedAt: new Date(),
        },
      })
      .select('-password');

    return successResponse(res, 200, 'Location updated', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};


export const blockUser = async (req, res, next) => {
  try {
    const blockedUserId = req.params.userId || req.body.userId;
    if (!blockedUserId) throw new AppError('User ID is required', 400);
    if (blockedUserId.toString() === req.userId.toString()) {
      throw new AppError('You cannot block yourself', 400);
    }

    const target = await userRepository.findById(blockedUserId).select('_id');
    if (!target) throw NotFound('User not found');

    const user = await userRepository.addBlockedUser(req.userId, blockedUserId);
    return successResponse(res, 200, 'User blocked successfully', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};

export const unblockUser = async (req, res, next) => {
  try {
    const blockedUserId = req.params.userId || req.body.userId;
    if (!blockedUserId) throw new AppError('User ID is required', 400);

    const user = await userRepository.removeBlockedUser(req.userId, blockedUserId);
    return successResponse(res, 200, 'User unblocked successfully', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};

export const getPublicProfile = async (req, res, next) => {
  try {
    const user = await userRepository.findPublicById(req.params.id);

    if (!user) {
      throw NotFound('User not found');
    }

    const publicRideStatuses = ['scheduled', 'started', 'ended', 'completed'];

    const [
      reviews,
      recentDriverRides,
      recentPassengerRides,
      driverRideCount,
      passengerRideCount,
    ] = await Promise.all([
      Review.find({ reviewee: req.params.id })
        .populate('reviewer', 'name profilePic isVerified')
        .sort('-createdAt')
        .limit(10),

      Ride.find({
        driver: req.params.id,
        status: { $in: publicRideStatuses },
      })
        .select(
          'driver source destination departureTime estimatedEndTime status price vehicle seatsAvailable bookedSeats createdAt'
        )
        .sort({ departureTime: -1 })
        .limit(6)
        .lean(),

      Ride.find({
        'passengers.user': req.params.id,
        status: 'completed',
      })
        .populate('driver', 'name profilePic rating rideCount isVerified')
        .select(
          'driver source destination departureTime estimatedEndTime status price vehicle createdAt'
        )
        .sort({ departureTime: -1 })
        .limit(6)
        .lean(),

      Ride.countDocuments({
        driver: req.params.id,
        status: { $in: publicRideStatuses },
      }),

      Ride.countDocuments({
        'passengers.user': req.params.id,
        status: 'completed',
      }),
    ]);

    return successResponse(res, 200, 'Public profile fetched', {
      user: normalizeUserForClient(user),
      reviews,
      recentDriverRides: recentDriverRides.map(sanitizePublicRide),
      recentPassengerRides: recentPassengerRides.map(sanitizePublicRide),
      stats: {
        driverRideCount,
        passengerRideCount,
        reviewCount: reviews.length,
      },
    });
  } catch (err) {
    next(err);
  }
};
