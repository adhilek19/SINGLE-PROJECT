import { rideService } from '../services/rideService.js';
import { rideMatchingService } from '../services/rideMatchingService.js';
import { successResponse } from '../utils/apiResponse.js';
import { BadRequest } from '../utils/AppError.js';
import { notificationService } from '../services/notificationService.js';
import {
  emitRideCancelled,
  emitRideCreated,
  emitRideStarted,
  emitRideTrackingEnabled,
  emitRideUpdated,
  emitPassengerVerified,
} from '../socket/rideEvents.js';

const validateIsoDate = (value, fieldName) => {
  if (!value) return;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw BadRequest(`Invalid ${fieldName}`);
  }
};

// ─── Create ─────────────────────────────────────────────────────

export const createRide = async (req, res, next) => {
  try {
    let data = { ...req.body };

    if (typeof data.vehicle === 'string') {
      data.vehicle = JSON.parse(data.vehicle);
    }

    if (req.file) {
      data.vehicle = data.vehicle || {};
      data.vehicle.image = req.file.path;
    }

    const ride = await rideService.createRide(req.userId, data);
    emitRideCreated(ride);

    return successResponse(res, 201, 'Ride created successfully', ride);
  } catch (err) {
    next(err);
  }
};

// ─── Update ─────────────────────────────────────────────────────

export const updateRide = async (req, res, next) => {
  try {
    let updates = { ...req.body };

    if (typeof updates.vehicle === 'string') {
      updates.vehicle = JSON.parse(updates.vehicle);
    }

    if (req.file) {
      updates.vehicle = updates.vehicle || {};
      updates.vehicle.image = req.file.path;
    }

    const ride = await rideService.updateRide(
      req.params.id,
      req.userId,
      updates
    );
    await emitRideUpdated(ride);

    return successResponse(res, 200, 'Ride updated successfully', ride);
  } catch (err) {
    next(err);
  }
};

// ─── Status Flow ─────────────────────────────────────────────────

export const startRide = async (req, res, next) => {
  try {
    const ride = await rideService.startRide(req.params.id, req.userId, {
      startWithoutPassengers: req.body.startWithoutPassengers,
    });
    await emitRideUpdated(ride);
    emitRideStarted(ride);
    emitRideTrackingEnabled(ride);
    notificationService.notifyRideStarted({
      rideId: ride?._id,
      passengerIds: (ride?.passengers || [])
        .map((p) => p?.user?.toString?.() || '')
        .filter(Boolean),
    });
    notificationService.notifyRideTrackingEnabled({
      rideId: ride?._id,
      passengerIds: (ride?.passengers || [])
        .map((p) => p?.user?.toString?.() || '')
        .filter(Boolean),
    });
    return successResponse(res, 200, 'Ride started successfully', ride);
  } catch (err) {
    next(err);
  }
};

export const verifyPassenger = async (req, res, next) => {
  try {
    const result = await rideService.verifyPassengerBoarding(req.params.id, req.userId, {
      otp: req.body.otp || req.body.pin || req.body.startPin,
      requestId: req.body.requestId,
      passengerId: req.body.passengerId,
    });

    emitPassengerVerified(result);
    if (result?.ride) {
      await emitRideUpdated(result.ride);
    }
    notificationService.notifyPassengerVerified({
      passengerId: result?.request?.passenger,
      rideId: result?.ride?._id || req.params.id,
      requestId: result?.request?._id,
    });

    return successResponse(res, 200, 'Passenger boarding verified', result);
  } catch (err) {
    next(err);
  }
};

export const endRide = async (req, res, next) => {
  try {
    const ride = await rideService.endRide(req.params.id, req.userId);
    await emitRideUpdated(ride);
    return successResponse(res, 200, 'Ride ended successfully', ride);
  } catch (err) {
    next(err);
  }
};

export const completeRide = async (req, res, next) => {
  try {
    const ride = await rideService.completeRide(req.params.id, req.userId);
    await emitRideUpdated(ride);
    const riderIds = [
      ride?.driver?.toString?.() || '',
      ...((ride?.passengers || []).map((p) => p?.user?.toString?.() || '')),
    ].filter(Boolean);
    await notificationService.notifyRideCompleted({
      rideId: ride?._id,
      riderIds,
    });
    return successResponse(res, 200, 'Ride completed successfully', ride);
  } catch (err) {
    next(err);
  }
};

export const updateRideStatus = async (req, res, next) => {
  try {
    const ride = await rideService.updateRideStatus(
      req.params.id,
      req.userId,
      req.body.status
    );
    await emitRideUpdated(ride);
    if (req.body.status === 'started') {
      emitRideStarted(ride);
      emitRideTrackingEnabled(ride);
      notificationService.notifyRideTrackingEnabled({
        rideId: ride?._id,
        passengerIds: (ride?.passengers || [])
          .map((p) => p?.user?.toString?.() || '')
          .filter(Boolean),
      });
    }

    return successResponse(res, 200, 'Ride status updated successfully', ride);
  } catch (err) {
    next(err);
  }
};

export const cancelRide = async (req, res, next) => {
  try {
    const ride = await rideService.cancelRide(
      req.params.id,
      req.userId,
      req.body.reason
    );
    emitRideCancelled(ride);

    return successResponse(res, 200, 'Ride cancelled successfully', ride);
  } catch (err) {
    next(err);
  }
};

// ─── Review / Report ─────────────────────────────────────────────

export const ratePassenger = async (req, res, next) => {
  try {
    const review = await rideService.ratePassenger(
      req.params.id,
      req.userId,
      req.body
    );

    return successResponse(res, 201, 'Passenger rated successfully', review);
  } catch (err) {
    next(err);
  }
};

export const createRideReview = async (req, res, next) => {
  try {
    const review = await rideService.createRideReview(
      req.params.id,
      req.userId,
      req.body
    );

    return successResponse(res, 201, 'Review submitted successfully', review);
  } catch (err) {
    next(err);
  }
};

export const createRideReport = async (req, res, next) => {
  try {
    const report = await rideService.createRideReport(
      req.params.id,
      req.userId,
      req.body
    );

    return successResponse(res, 201, 'Report submitted successfully', report);
  } catch (err) {
    next(err);
  }
};

// ─── Delete ─────────────────────────────────────────────────────

export const deleteRide = async (req, res, next) => {
  try {
    await rideService.deleteRide(req.params.id, req.userId);
    return successResponse(res, 200, 'Ride deleted successfully');
  } catch (err) {
    next(err);
  }
};

// ─── Get Single ─────────────────────────────────────────────────

export const getRideById = async (req, res, next) => {
  try {
    const ride = await rideService.getRideById(req.params.id);
    return successResponse(res, 200, 'Ride details retrieved', ride);
  } catch (err) {
    next(err);
  }
};

export const getPublicTracking = async (req, res, next) => {
  try {
    const ride = await rideService.getPublicTrackingByToken(req.params.token);
    return successResponse(res, 200, 'Public tracking fetched', { ride });
  } catch (err) {
    next(err);
  }
};

// ─── List ───────────────────────────────────────────────────────

export const listRides = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));

    const filters = {};

    // supports old names + frontend aliases + new names
    if (req.query.sourceText || req.query.source || req.query.from) {
      filters.sourceText = req.query.sourceText || req.query.source || req.query.from;
    }

    if (req.query.destinationText || req.query.destination || req.query.to) {
      filters.destinationText =
        req.query.destinationText || req.query.destination || req.query.to;
    }

    if (req.query.date) {
      validateIsoDate(req.query.date, 'date');
      filters.date = req.query.date;
    }
    if (req.query.timeFrom) {
      validateIsoDate(req.query.timeFrom, 'timeFrom');
      filters.timeFrom = req.query.timeFrom;
    }
    if (req.query.timeTo) {
      validateIsoDate(req.query.timeTo, 'timeTo');
      filters.timeTo = req.query.timeTo;
    }
    if (req.query.minPrice) filters.minPrice = req.query.minPrice;
    if (req.query.maxPrice) filters.maxPrice = req.query.maxPrice;
    if (req.query.minSeats || req.query.seats) {
      filters.minSeats = req.query.minSeats || req.query.seats;
    }
    if (req.query.vehicleType) filters.vehicleType = req.query.vehicleType;
    ['womenOnly', 'verifiedOnly', 'smokingAllowed', 'musicAllowed', 'petsAllowed', 'acAvailable', 'genderPreference'].forEach((key) => {
      if (req.query[key] !== undefined && req.query[key] !== '') filters[key] = req.query[key];
    });
    if (req.query.status) filters.status = req.query.status;
    if (req.query.lat) filters.lat = req.query.lat;
    if (req.query.lng) filters.lng = req.query.lng;
    if (req.query.radiusKm) filters.radiusKm = req.query.radiusKm;
    if (req.query.fromLat || req.query.sourceLat) filters.fromLat = req.query.fromLat || req.query.sourceLat;
    if (req.query.fromLng || req.query.sourceLng) filters.fromLng = req.query.fromLng || req.query.sourceLng;
    if (req.query.toLat || req.query.destinationLat) filters.toLat = req.query.toLat || req.query.destinationLat;
    if (req.query.toLng || req.query.destinationLng) filters.toLng = req.query.toLng || req.query.destinationLng;
    if (req.query.sourceRadiusKm) filters.sourceRadiusKm = req.query.sourceRadiusKm;
    if (req.query.destinationRadiusKm) filters.destinationRadiusKm = req.query.destinationRadiusKm;

    const sortBy = req.query.sort || req.query.sortBy || 'departure_time';

    const result = await rideService.listRides({
      filters,
      page,
      limit,
      sortBy,
    });

    return successResponse(res, 200, 'Rides retrieved', result);
  } catch (err) {
    next(err);
  }
};

// ─── Search ─────────────────────────────────────────────────────

export const searchRides = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    if (req.query.date) validateIsoDate(req.query.date, 'date');
    if (req.query.timeFrom) validateIsoDate(req.query.timeFrom, 'timeFrom');
    if (req.query.timeTo) validateIsoDate(req.query.timeTo, 'timeTo');

    const result = await rideService.searchRides({
      sourceText: req.query.sourceText || req.query.source || req.query.from,
      destinationText: req.query.destinationText || req.query.destination || req.query.to,
      date: req.query.date,
      timeFrom: req.query.timeFrom,
      timeTo: req.query.timeTo,
      vehicleType: req.query.vehicleType,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      minSeats: req.query.minSeats || req.query.seats,
      fromLat: req.query.fromLat || req.query.sourceLat,
      fromLng: req.query.fromLng || req.query.sourceLng,
      toLat: req.query.toLat || req.query.destinationLat,
      toLng: req.query.toLng || req.query.destinationLng,
      sourceRadiusKm: req.query.sourceRadiusKm,
      destinationRadiusKm: req.query.destinationRadiusKm,
      page,
      limit,
    });

    return successResponse(res, 200, 'Search results', result);
  } catch (err) {
    next(err);
  }
};

// ─── Nearby Ride Discovery ──────────────────────────────────────

export const getNearbyRides = async (req, res, next) => {
  try {
    const result = await rideMatchingService.nearby({
      lat: req.query.lat,
      lng: req.query.lng,
      radiusKm: req.query.radiusKm,
      vehicleType: req.query.vehicleType,
      seats: req.query.seats,
      page: req.query.page,
      limit: req.query.limit,
      userId: req.userId,
    });

    return successResponse(res, 200, 'Nearby rides fetched', {
      rides: result.rides || [],
      count: result.total || 0,
      page: result.page || 1,
      limit: result.limit || 0,
      totalPages: result.totalPages || 0,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Ride Matching ──────────────────────────────────────────────

export const getMatchedRides = async (req, res, next) => {
  try {
    const rides = await rideMatchingService.match({
      sourceLat: req.query.sourceLat,
      sourceLng: req.query.sourceLng,
      destinationLat: req.query.destinationLat,
      destinationLng: req.query.destinationLng,
      departureTime: req.query.departureTime,
      date: req.query.date,
      radiusKm: req.query.radiusKm,
      destinationRadiusKm: req.query.destinationRadiusKm,
      timeWindowHours: req.query.timeWindowHours,
      limit: req.query.limit,
      userId: req.userId,
    });

    return successResponse(res, 200, 'Matched rides fetched', {
      rides,
      count: rides.length,
    });
  } catch (err) {
    next(err);
  }
};

// ─── My Rides ───────────────────────────────────────────────────

export const getUserRides = async (req, res, next) => {
  try {
    const rides = await rideService.getUserRides(req.userId);
    return successResponse(res, 200, 'User rides retrieved', rides);
  } catch (err) {
    next(err);
  }
};

// ─── Join ───────────────────────────────────────────────────────

export const joinRide = async (req, res, next) => {
  try {
    const seats = req.body.seats ? parseInt(req.body.seats) : 1;
    const ride = await rideService.joinRide(req.params.id, req.userId, seats);
    await emitRideUpdated(ride);

    return successResponse(res, 200, 'Successfully joined the ride', ride);
  } catch (err) {
    next(err);
  }
};

// ─── Leave ──────────────────────────────────────────────────────

export const leaveRide = async (req, res, next) => {
  try {
    const ride = await rideService.leaveRide(req.params.id, req.userId);
    await emitRideUpdated(ride);
    return successResponse(res, 200, 'Successfully left the ride', ride);
  } catch (err) {
    next(err);
  }
};
