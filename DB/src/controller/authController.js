import { authService } from '../services/authService.js';
import { successResponse } from '../utils/apiResponse.js';
import { AppError, BadRequest, NotFound } from '../utils/AppError.js';
import { userRepository } from '../repositories/userRepository.js';
import { Review } from '../models/Review.js';
import Ride from '../models/Ride.js';
import { logger } from '../utils/logger.js';
import {
  refreshTokenCookieBaseOptions,
  refreshTokenCookieOptions,
} from '../utils/authCookie.js';
import {
  normalizeUserForClient,
  normalizeVehicleForClient,
} from '../utils/profileCompletion.js';
import {
  destroyCloudinaryAsset,
  uploadBufferToCloudinary,
} from '../utils/cloudinary.js';

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

const allowedDocumentTypes = new Set([
  'idProof',
  'drivingLicense',
  'vehicleDocument',
]);

const toResourceTypeFromMime = (mimeType = '') => {
  const safeMime = String(mimeType || '').toLowerCase();
  if (safeMime.includes('pdf')) return 'raw';
  return 'image';
};

const clearDocumentPayload = () => ({
  url: '',
  publicId: '',
  type: '',
  mimeType: '',
  uploadedAt: null,
  status: 'pending',
  rejectionReason: '',
});

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
    const user = await userRepository.findById(req.userId);
    if (!user) throw NotFound('User not found');

    const allowed = [
      'name',
      'phone',
      'bio',
      'selectedAvatar',
      'trustedContact',
      'safetyPreferences',
    ];

    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        user[key] = req.body[key];
      }
    });

    if (req.body.profilePic !== undefined) {
      user.profilePic = String(req.body.profilePic || '').trim();
    }

    if (req.body.vehicle !== undefined) {
      const incomingVehicle = req.body.vehicle || {};
      user.vehicle = {
        ...(user.vehicle?.toObject?.() || user.vehicle || {}),
        ...incomingVehicle,
      };
      if (user.vehicle?.number) {
        user.vehicle.number = String(user.vehicle.number).trim().toUpperCase();
      }
    }

    if (req.body.currentLocation !== undefined) {
      const geoLocation = toGeoLocation(req.body.currentLocation);
      user.currentLocation = geoLocation;
    }

    await userRepository.save(user);

    return successResponse(res, 200, 'Profile updated', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};

export const patchProfile = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.userId);
    if (!user) throw NotFound('User not found');

    const updatable = ['name', 'phone', 'bio', 'selectedAvatar', 'trustedContact', 'safetyPreferences'];
    updatable.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await userRepository.save(user);

    return successResponse(res, 200, 'Profile updated', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};

export const uploadProfileImage = async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      throw BadRequest('Profile image file is required');
    }

    const user = await userRepository.findById(req.userId);
    if (!user) throw NotFound('User not found');

    const previousPublicId = String(user?.profileImage?.publicId || '').trim();
    const uploadResult = await uploadBufferToCloudinary({
      buffer: req.file.buffer,
      folder: 'sahayatri/profile-images',
      publicId: `user_${req.userId}_${Date.now()}`,
      resourceType: 'image',
    });

    user.profileImage = {
      url: String(uploadResult?.secure_url || ''),
      publicId: String(uploadResult?.public_id || ''),
      uploadedAt: new Date(),
    };
    await userRepository.save(user);

    if (previousPublicId && previousPublicId !== user.profileImage.publicId) {
      destroyCloudinaryAsset(previousPublicId, 'image').catch((err) => {
        logger.warn({
          event: 'profile_image_destroy_failed',
          userId: req.userId,
          reason: err?.message || 'unknown',
        });
      });
    }

    return successResponse(res, 200, 'Profile image uploaded', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};

export const deleteProfileImage = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.userId);
    if (!user) throw NotFound('User not found');

    const previousPublicId = String(user?.profileImage?.publicId || '').trim();
    user.profileImage = { url: '', publicId: '', uploadedAt: null };
    await userRepository.save(user);

    if (previousPublicId) {
      destroyCloudinaryAsset(previousPublicId, 'image').catch((err) => {
        logger.warn({
          event: 'profile_image_destroy_failed',
          userId: req.userId,
          reason: err?.message || 'unknown',
        });
      });
    }

    return successResponse(res, 200, 'Profile image removed', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};

export const uploadProfileDocument = async (req, res, next) => {
  try {
    const documentType = String(req.body?.documentType || '').trim();
    if (!allowedDocumentTypes.has(documentType)) {
      throw BadRequest('Invalid document type');
    }
    if (!req.file?.buffer) {
      throw BadRequest('Document file is required');
    }

    const user = await userRepository.findById(req.userId);
    if (!user) throw NotFound('User not found');

    const oldDoc = user?.verificationDocuments?.[documentType] || {};
    const oldPublicId = String(oldDoc?.publicId || '').trim();
    const oldMime = String(oldDoc?.mimeType || '');

    const uploadResult = await uploadBufferToCloudinary({
      buffer: req.file.buffer,
      folder: 'sahayatri/profile-documents',
      publicId: `user_${req.userId}_${documentType}_${Date.now()}`,
      resourceType: toResourceTypeFromMime(req.file.mimetype),
    });

    user.verificationDocuments = user.verificationDocuments || {};
    user.verificationDocuments[documentType] = {
      url: String(uploadResult?.secure_url || ''),
      publicId: String(uploadResult?.public_id || ''),
      type: String(req.file.originalname || '').split('.').pop()?.toLowerCase() || '',
      mimeType: String(req.file.mimetype || '').toLowerCase(),
      uploadedAt: new Date(),
      status: 'pending',
      rejectionReason: '',
    };
    await userRepository.save(user);

    if (oldPublicId) {
      destroyCloudinaryAsset(oldPublicId, toResourceTypeFromMime(oldMime)).catch((err) => {
        logger.warn({
          event: 'profile_document_destroy_failed',
          userId: req.userId,
          documentType,
          reason: err?.message || 'unknown',
        });
      });
    }

    return successResponse(res, 200, 'Document uploaded', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};

export const deleteProfileDocument = async (req, res, next) => {
  try {
    const documentType = String(req.params.documentType || '').trim();
    if (!allowedDocumentTypes.has(documentType)) {
      throw BadRequest('Invalid document type');
    }

    const user = await userRepository.findById(req.userId);
    if (!user) throw NotFound('User not found');

    const existing = user?.verificationDocuments?.[documentType] || {};
    const oldPublicId = String(existing?.publicId || '').trim();
    const oldMime = String(existing?.mimeType || '');

    user.verificationDocuments = user.verificationDocuments || {};
    user.verificationDocuments[documentType] = clearDocumentPayload();
    await userRepository.save(user);

    if (oldPublicId) {
      destroyCloudinaryAsset(oldPublicId, toResourceTypeFromMime(oldMime)).catch((err) => {
        logger.warn({
          event: 'profile_document_destroy_failed',
          userId: req.userId,
          documentType,
          reason: err?.message || 'unknown',
        });
      });
    }

    return successResponse(res, 200, 'Document removed', {
      user: normalizeUserForClient(user),
    });
  } catch (err) {
    next(err);
  }
};

export const patchVehicle = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.userId);
    if (!user) throw NotFound('User not found');

    user.vehicle = {
      ...(user.vehicle?.toObject?.() || {}),
      ...req.body,
      number: String(req.body?.number || '').trim().toUpperCase(),
    };
    await userRepository.save(user);

    return successResponse(res, 200, 'Vehicle updated', {
      user: normalizeUserForClient(user),
      vehicle: normalizeVehicleForClient(user.vehicle),
    });
  } catch (err) {
    next(err);
  }
};

export const deleteVehicle = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.userId);
    if (!user) throw NotFound('User not found');

    user.vehicle = {};
    await userRepository.save(user);

    return successResponse(res, 200, 'Vehicle removed', {
      user: normalizeUserForClient(user),
      vehicle: normalizeVehicleForClient(user.vehicle),
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
