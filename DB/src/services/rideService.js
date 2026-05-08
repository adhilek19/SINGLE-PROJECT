import mongoose from 'mongoose';
import { rideRepository } from '../repositories/rideRepository.js';
import { BadRequest, NotFound, Forbidden } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { Review } from '../models/Review.js';
import { Report } from '../models/Report.js';
import { userRepository } from '../repositories/userRepository.js';
import { rideRequestRepository } from '../repositories/rideRequestRepository.js';
import { rideRequestService } from './rideRequestService.js';

const ALLOWED_STATUS_TRANSITIONS = {
  scheduled: ['started', 'cancelled'],
  started: ['ended'],
  ended: ['completed'],
  completed: [],
  cancelled: [],
};

const canTransition = (from, to) => (ALLOWED_STATUS_TRANSITIONS[from] || []).includes(to);
const toObjectId = (id) => new mongoose.Types.ObjectId(id);

const recalculateUserRating = async (userId) => {
  const revieweeId = toObjectId(userId);

  const [agg] = await Review.aggregate([
    { $match: { reviewee: revieweeId } },
    { $group: { _id: '$reviewee', avgRating: { $avg: '$rating' }, total: { $sum: 1 } } },
  ]);

  await userRepository.updateById(revieweeId, {
    rating: agg ? Number(agg.avgRating.toFixed(2)) : 0,
    rideCount: agg ? agg.total : 0,
  });
};

const ensureFutureDeparture = (dateValue) => {
  const departure = new Date(dateValue);

  if (Number.isNaN(departure.getTime())) {
    throw BadRequest('Invalid departure time');
  }

  if (departure <= new Date()) {
    throw BadRequest('Departure time must be in the future');
  }

  return departure;
};

const ensureRideCanStartNow = (ride) => {
  const departure = new Date(ride?.departureTime);
  if (Number.isNaN(departure.getTime())) {
    throw BadRequest('Ride has an invalid scheduled departure time');
  }

  if (Date.now() < departure.getTime()) {
    throw BadRequest(
      `Ride can be started only at or after scheduled departure time (${departure.toISOString()})`
    );
  }
};

const getPassengerSeatCount = (ride, userId) => {
  const passenger = ride.passengers?.find(
    (p) => p.user?.toString() === userId.toString()
  );

  return passenger ? Number(passenger.seats || 1) : 0;
};

export const rideService = {
  async createRide(driverId, data) {
    const {
      source,
      destination,
      departureTime,
      seatsAvailable,
      price,
      description,
      vehicle,
      duration,
      preferences,
    } = data;

    const departure = ensureFutureDeparture(departureTime);

    const estimatedEndTime = duration
      ? new Date(departure.getTime() + Number(duration) * 60000)
      : null;

    const ride = await rideRepository.create({
      driver: driverId,
      source,
      destination,
      departureTime: departure,
      estimatedEndTime,
      seatsAvailable: Number(seatsAvailable),
      price: Number(price),
      description: description || '',
      vehicle,
      preferences: preferences || {},
      passengers: [],
      bookedSeats: 0,
      status: 'scheduled',
    });

    logger.info({ event: 'ride_created', rideId: ride._id, driver: driverId });

    return ride;
  },

  async updateRide(rideId, driverId, updates) {
    const ride = await rideRepository.findById(rideId);

    if (!ride) throw NotFound('Ride not found');

    if (ride.driver.toString() !== driverId.toString()) {
      throw Forbidden('You can only edit your own rides');
    }

    if (ride.status !== 'scheduled') {
      throw BadRequest('Cannot edit after ride started');
    }

    if (updates.departureTime) {
      ride.departureTime = ensureFutureDeparture(updates.departureTime);
    }

    if (updates.source !== undefined) ride.source = updates.source;
    if (updates.destination !== undefined) ride.destination = updates.destination;
    if (updates.price !== undefined) ride.price = Number(updates.price);
    if (updates.description !== undefined) ride.description = updates.description || '';

    if (updates.seatsAvailable !== undefined) {
      const nextSeats = Number(updates.seatsAvailable);

      if (ride.bookedSeats > nextSeats) {
        throw BadRequest(`Cannot reduce seats below currently booked count (${ride.bookedSeats})`);
      }

      ride.seatsAvailable = nextSeats;
    }

    if (updates.vehicle !== undefined) {
      ride.vehicle = {
        ...(ride.vehicle?.toObject?.() || ride.vehicle || {}),
        ...updates.vehicle,
      };
    }

    if (updates.preferences !== undefined) {
      ride.preferences = {
        ...(ride.preferences?.toObject?.() || ride.preferences || {}),
        ...updates.preferences,
      };
    }

    if (updates.departureTime || updates.duration !== undefined) {
      const dep = new Date(ride.departureTime);

      const existingDuration = ride.estimatedEndTime
        ? Math.round((new Date(ride.estimatedEndTime) - dep) / 60000)
        : null;

      const dur = updates.duration !== undefined ? Number(updates.duration) : existingDuration;

      ride.estimatedEndTime = dur
        ? new Date(dep.getTime() + dur * 60000)
        : undefined;
    }

    await rideRepository.save(ride);

    logger.info({ event: 'ride_updated', rideId, driver: driverId });

    return ride;
  },

  async updateRideStatus(rideId, driverId, nextStatus) {
    const ride = await rideRepository.findById(rideId);

    if (!ride) throw NotFound('Ride not found');

    if (ride.driver.toString() !== driverId.toString()) {
      throw Forbidden('Only ride owner can update ride status');
    }

    if (!nextStatus) {
      throw BadRequest('Status is required');
    }

    if (!canTransition(ride.status, nextStatus)) {
      throw BadRequest(`Invalid status transition from ${ride.status} to ${nextStatus}`);
    }

    ride.status = nextStatus;

    if (nextStatus === 'started') ride.startTime = new Date();
    if (nextStatus === 'ended') ride.endTime = new Date();
    if (nextStatus === 'completed') {
      if (!ride.endTime) ride.endTime = new Date();
      ride.completedAt = new Date();
    }

    await rideRepository.save(ride);

    return ride;
  },

  async startRide(rideId, driverId, startPin) {
    const ride = await rideRepository.findById(rideId);
    if (!ride) throw NotFound('Ride not found');

    if (ride.driver.toString() !== driverId.toString()) {
      throw Forbidden('Only ride owner can start ride');
    }

    if (ride.status !== 'scheduled') {
      throw BadRequest(`Cannot start ride in ${ride.status} state`);
    }

    ensureRideCanStartNow(ride);

    const acceptedRequests = await rideRequestRepository.findAcceptedByRide(rideId);

    if ((ride.passengers || []).length > 0 || acceptedRequests.length > 0) {
      if (!String(startPin || '').match(/^\d{4}$/)) {
        throw BadRequest('Passenger 4-digit trip PIN is required to start this ride');
      }

      const matchingRequest = acceptedRequests.find((request) =>
        rideRequestService.verifyPinValue(startPin, request.startPinHash)
      );

      if (!matchingRequest) {
        throw BadRequest('Invalid trip PIN');
      }

      matchingRequest.pinVerified = true;
      await rideRequestRepository.save(matchingRequest);
    }

    ride.status = 'started';
    ride.startTime = new Date();
    await rideRepository.save(ride);
    return ride;
  },

  async endRide(rideId, driverId) {
    return this.updateRideStatus(rideId, driverId, 'ended');
  },

  async completeRide(rideId, driverId) {
    return this.updateRideStatus(rideId, driverId, 'completed');
  },

  async cancelRide(rideId, driverId, reason) {
    const ride = await rideRepository.findById(rideId);

    if (!ride) throw NotFound('Ride not found');

    if (ride.driver.toString() !== driverId.toString()) {
      throw Forbidden('You can only cancel your own rides');
    }

    if (!reason?.trim()) {
      throw BadRequest('Cancellation reason is required');
    }

    if (!canTransition(ride.status, 'cancelled')) {
      throw BadRequest(`Cannot cancel ride in ${ride.status} state`);
    }

    ride.status = 'cancelled';
    ride.cancellationReason = reason.trim();
    ride.cancelledAt = new Date();

    await rideRepository.save(ride);

    return ride;
  },

  async joinRide(rideId, userId, seats = 1) {
    const requestedSeats = Math.max(1, Number(seats) || 1);

    const ride = await rideRepository.findById(rideId);

    if (!ride) throw NotFound('Ride not found');

    if (ride.driver.toString() === userId.toString()) {
      throw BadRequest('You cannot join your own ride');
    }

    if (ride.status !== 'scheduled') {
      throw BadRequest('Only scheduled rides can be joined');
    }

    const alreadyJoined = ride.passengers?.some(
      (p) => p.user?.toString() === userId.toString()
    );

    if (alreadyJoined) {
      throw BadRequest('You already joined this ride');
    }

    const seatsLeft = Number(ride.seatsAvailable || 0) - Number(ride.bookedSeats || 0);

    if (seatsLeft < requestedSeats) {
      throw BadRequest(`Only ${Math.max(0, seatsLeft)} seat(s) left`);
    }

    const updatedRide = await rideRepository.atomicJoin({
      rideId,
      userId,
      seats: requestedSeats,
    });

    if (!updatedRide) {
      throw BadRequest('Unable to join ride. Seats may no longer be available.');
    }

    logger.info({
      event: 'ride_joined',
      rideId,
      userId,
      seats: requestedSeats,
    });

    return updatedRide;
  },

  async leaveRide(rideId, userId) {
    const ride = await rideRepository.findById(rideId);

    if (!ride) throw NotFound('Ride not found');

    if (ride.status !== 'scheduled') {
      throw BadRequest('You can leave only before ride starts');
    }

    const seatsToRemove = getPassengerSeatCount(ride, userId);

    if (!seatsToRemove) {
      throw BadRequest('You have not joined this ride');
    }

    const updatedRide = await rideRepository.atomicLeave({
      rideId,
      userId,
      seats: seatsToRemove,
    });

    if (!updatedRide) {
      throw BadRequest('Unable to leave ride');
    }

    logger.info({
      event: 'ride_left',
      rideId,
      userId,
      seats: seatsToRemove,
    });

    return updatedRide;
  },

  async ratePassenger(rideId, driverId, { passengerId, rating, comment }) {
    const ride = await rideRepository.findById(rideId);

    if (!ride) throw NotFound('Ride not found');

    if (ride.driver.toString() !== driverId.toString()) {
      throw Forbidden('You can only rate passengers on your own rides');
    }

    if (ride.status !== 'completed') {
      throw BadRequest('You can only rate passengers after ride completion');
    }

    if (driverId.toString() === passengerId.toString()) {
      throw BadRequest('You cannot rate yourself');
    }

    const isPassenger = ride.passengers?.some(
      (p) => p.user?.toString() === passengerId.toString()
    );

    if (!isPassenger) {
      throw BadRequest('Selected user is not a passenger on this ride');
    }

    try {
      const review = await Review.create({
        ride: rideId,
        reviewer: driverId,
        reviewee: passengerId,
        rating,
        comment,
      });

      if (!ride.reviews.some((id) => id.toString() === review._id.toString())) {
        ride.reviews.push(review._id);
        await rideRepository.save(ride);
      }

      await recalculateUserRating(passengerId);

      return review;
    } catch (err) {
      if (err?.code === 11000) {
        throw BadRequest('Passenger already rated for this ride');
      }

      throw err;
    }
  },

  async createRideReview(rideId, reviewerId, { rating, comment, revieweeId }) {
    const ride = await rideRepository.findById(rideId);

    if (!ride) throw NotFound('Ride not found');

    if (ride.status !== 'completed') {
      throw BadRequest('Reviews are allowed only after ride completion');
    }

    const isDriver = ride.driver.toString() === reviewerId.toString();

    let isPassenger = ride.passengers?.some(
      (p) => p.user?.toString() === reviewerId.toString()
    );

    if (!isDriver && !isPassenger) {
      const acceptedOrCompletedRequest =
        await rideRequestRepository.findAcceptedOrCompletedByRideAndPassenger({
          rideId,
          passengerId: reviewerId,
        });
      isPassenger = Boolean(acceptedOrCompletedRequest);
    }

    if (!isDriver && !isPassenger) {
      throw Forbidden('Only ride participants can review this ride');
    }

    const targetId = revieweeId || (isPassenger ? ride.driver : null);

    if (!targetId) {
      throw BadRequest('Reviewee is required when driver reviews a passenger');
    }

    if (targetId.toString() === reviewerId.toString()) {
      throw BadRequest('You cannot review yourself');
    }

    const targetIsDriver = ride.driver.toString() === targetId.toString();

    let targetIsPassenger = ride.passengers?.some(
      (p) => p.user?.toString() === targetId.toString()
    );

    if (!targetIsDriver && !targetIsPassenger) {
      const targetAcceptedOrCompletedRequest =
        await rideRequestRepository.findAcceptedOrCompletedByRideAndPassenger({
          rideId,
          passengerId: targetId,
        });
      targetIsPassenger = Boolean(targetAcceptedOrCompletedRequest);
    }

    if (!targetIsDriver && !targetIsPassenger) {
      throw BadRequest('The user you are trying to review was not part of this ride');
    }

    let review;

    try {
      review = await Review.create({
        ride: rideId,
        reviewer: reviewerId,
        reviewee: targetId,
        rating,
        comment,
      });
    } catch (err) {
      if (err?.code === 11000) {
        throw BadRequest('You already reviewed this user for this ride');
      }

      throw err;
    }

    if (!ride.reviews.some((id) => id.toString() === review._id.toString())) {
      ride.reviews.push(review._id);
      await rideRepository.save(ride);
    }

    await recalculateUserRating(targetId);

    return review;
  },

  async createRideReport(rideId, reporterId, { reason, description, reportedUser, reportedUserId }) {
    const ride = await rideRepository.findById(rideId);

    if (!ride) throw NotFound('Ride not found');

    const isDriver = ride.driver.toString() === reporterId.toString();

    const isPassenger = ride.passengers?.some(
      (p) => p.user?.toString() === reporterId.toString()
    );

    if (!isDriver && !isPassenger) {
      throw Forbidden('Only ride participants can report this ride');
    }

    const targetUser = reportedUserId || reportedUser || null;

    if (targetUser && targetUser.toString() === reporterId.toString()) {
      throw BadRequest('You cannot report yourself');
    }

    const report = await Report.create({
      ride: rideId,
      reportedBy: reporterId,
      reportedUser: targetUser || undefined,
      reason,
      description,
    });

    if (!ride.reports.some((id) => id.toString() === report._id.toString())) {
      ride.reports.push(report._id);
      await rideRepository.save(ride);
    }

    return report;
  },

  async deleteRide(rideId, driverId) {
    const ride = await rideRepository.findById(rideId);

    if (!ride) throw NotFound('Ride not found');

    if (ride.driver.toString() !== driverId.toString()) {
      throw Forbidden('You can only delete your own rides');
    }

    if (ride.status !== 'scheduled') {
      throw BadRequest('Cannot delete after ride started');
    }

    await rideRepository.deleteById(rideId);

    logger.info({ event: 'ride_deleted', rideId, driver: driverId });

    return true;
  },


  async getPublicTrackingByToken(token) {
    const ride = await rideRepository.findPublicByShareToken(token);
    if (!ride) throw NotFound('Tracking link is invalid or disabled');
    return ride;
  },

  async blockUser(userId, blockedUserId) {
    if (!blockedUserId) throw BadRequest('blockedUserId is required');
    if (userId.toString() === blockedUserId.toString()) {
      throw BadRequest('You cannot block yourself');
    }
    const blockedUser = await userRepository.findById(blockedUserId).select('_id');
    if (!blockedUser) throw NotFound('User not found');
    return userRepository.addBlockedUser(userId, blockedUserId);
  },

  async unblockUser(userId, blockedUserId) {
    if (!blockedUserId) throw BadRequest('blockedUserId is required');
    return userRepository.removeBlockedUser(userId, blockedUserId);
  },

  async getRideById(rideId) {
    const rawRide = await rideRepository.findById(rideId);
    if (!rawRide) throw NotFound('Ride not found');

    if (!rawRide.shareToken) {
      await rideRepository.save(rawRide);
    }

    const ride = await rideRepository.findDetailedById(rideId);
    if (!ride) throw NotFound('Ride not found');

    return ride;
  },

  async listRides(params = {}) {
    return rideRepository.listPaginated(params);
  },

  async searchRides({
    sourceText,
    destinationText,
    date,
    timeFrom,
    timeTo,
    vehicleType,
    minPrice,
    maxPrice,
    minSeats,
    fromLat,
    fromLng,
    toLat,
    toLng,
    sourceRadiusKm,
    destinationRadiusKm,
    page = 1,
    limit = 20,
  } = {}) {
    return rideRepository.searchRides({
      sourceText,
      destinationText,
      date,
      timeFrom,
      timeTo,
      vehicleType,
      minPrice,
      maxPrice,
      minSeats,
      fromLat,
      fromLng,
      toLat,
      toLng,
      sourceRadiusKm,
      destinationRadiusKm,
      page,
      limit,
    });
  },

  async getUserRides(userId) {
    const result = await rideRepository.findUserRides(userId);

    return {
      createdRides: result.createdRides || [],
      joinedRides: result.joinedRides || [],
    };
  },
};
