import crypto from 'crypto';
import { BadRequest, Forbidden, NotFound } from '../utils/AppError.js';
import { rideRepository } from '../repositories/rideRepository.js';
import { rideRequestRepository } from '../repositories/rideRequestRepository.js';
import { userRepository } from '../repositories/userRepository.js';

const toId = (val) => (val && typeof val === 'object' ? val._id : val)?.toString?.() || '';

const toSafeLocation = (loc) => {
  if (!loc) return null;

  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  const safe = {
    name: String(loc.name || '').trim(),
  };

  if (Number.isFinite(lat) && lat >= -90 && lat <= 90) {
    safe.lat = lat;
  }

  if (Number.isFinite(lng) && lng >= -180 && lng <= 180) {
    safe.lng = lng;
  }

  return safe.name || safe.lat !== undefined || safe.lng !== undefined ? safe : null;
};

const generatePin = () => String(crypto.randomInt(1000, 10000));
const hashPin = (pin) => crypto.createHash('sha256').update(String(pin)).digest('hex');

const sanitizeRequestForUser = (request, viewerId) => {
  if (!request) return request;
  const obj = request.toObject ? request.toObject() : { ...request };
  const viewer = String(viewerId || '');
  const passengerId = toId(obj.passenger);
  const driverId = toId(obj.driver);

  // Passenger must see own 4-digit PIN after request is accepted.
  if (!(viewer === passengerId && obj.status === 'accepted')) {
    delete obj.startPin;
  }

  // Driver should never receive the plain PIN, only verification status.
  if (viewer === driverId) {
    delete obj.startPin;
  }

  delete obj.startPinHash;
  return obj;
};

export const rideRequestService = {
  async createRequest(rideId, passengerId, payload = {}) {
    const ride = await rideRepository.findById(rideId);
    if (!ride) throw NotFound('Ride not found');

    if (ride.driver.toString() === passengerId.toString()) {
      throw BadRequest('Passenger cannot request own ride');
    }

    const passengerBlocked = (await userRepository.getBlockedUserIds(passengerId)).map(String);
    const driverBlocked = (await userRepository.getBlockedUserIds(ride.driver)).map(String);
    if (passengerBlocked.includes(ride.driver.toString()) || driverBlocked.includes(passengerId.toString())) {
      throw Forbidden('Ride request is blocked between these users');
    }

    if (ride.status !== 'scheduled') {
      throw BadRequest('Ride is not accepting requests');
    }

    const alreadyPassenger = (ride.passengers || []).some(
      (p) => p.user?.toString() === passengerId.toString()
    );
    if (alreadyPassenger) {
      throw BadRequest('You are already booked on this ride');
    }

    const seatsRequested = Math.max(1, Number(payload.seatsRequested || 1));
    const seatsLeft = Number(ride.seatsAvailable || 0) - Number(ride.bookedSeats || 0);
    if (seatsRequested > seatsLeft) {
      throw BadRequest(`Only ${Math.max(0, seatsLeft)} seat(s) left`);
    }

    const duplicate = await rideRequestRepository.findPendingOrAccepted({
      rideId,
      passengerId,
    });
    if (duplicate) {
      throw BadRequest('You already have a pending or accepted request for this ride');
    }

    const request = await rideRequestRepository.create({
      ride: rideId,
      passenger: passengerId,
      driver: ride.driver,
      seatsRequested,
      pickupLocation: toSafeLocation(payload.pickupLocation),
      dropLocation: toSafeLocation(payload.dropLocation),
      pickupConfirmed: Boolean(payload.pickupLocation?.lat && payload.pickupLocation?.lng),
      status: 'pending',
      pinVerified: false,
    });

    const populated = await rideRequestRepository.findById(request._id);
    return {
      request: sanitizeRequestForUser(populated, passengerId),
    };
  },

  async getRideRequests(rideId, userId) {
    const ride = await rideRepository.findById(rideId);
    if (!ride) throw NotFound('Ride not found');

    const requests =
      ride.driver.toString() === userId.toString()
        ? await rideRequestRepository.findByRide(rideId)
        : await rideRequestRepository.findByRideAndPassenger({ rideId, passengerId: userId });

    return requests.map((request) => sanitizeRequestForUser(request, userId));
  },

  async getMyRequests(userId) {
    const requests = await rideRequestRepository.findPassengerRequests(userId);
    return requests.map((request) => sanitizeRequestForUser(request, userId));
  },

  async acceptRequest(requestId, userId) {
    const request = await rideRequestRepository.findRawById(requestId);
    if (!request) throw NotFound('Ride request not found');

    const ride = await rideRepository.findById(request.ride);
    if (!ride) throw NotFound('Ride not found');

    if (ride.driver.toString() !== userId.toString()) {
      throw Forbidden('Only ride owner can accept requests');
    }

    if (request.status !== 'pending') {
      throw BadRequest('Only pending requests can be accepted');
    }

    if (ride.status !== 'scheduled') {
      throw BadRequest('Ride is not accepting requests');
    }

    const pin = generatePin();
    const updatedRide = await rideRepository.atomicAttachPassengerFromRequest({
      rideId: ride._id,
      passengerId: request.passenger,
      seats: request.seatsRequested,
      pickupLocation: request.pickupLocation || null,
      pickupConfirmed: Boolean(request.pickupLocation?.lat && request.pickupLocation?.lng),
    });

    if (!updatedRide) {
      const freshRide = await rideRepository.findById(ride._id);
      const passengerAlreadyBooked = (freshRide?.passengers || []).some(
        (p) => p.user?.toString() === request.passenger.toString()
      );
      if (passengerAlreadyBooked) {
        throw BadRequest('Passenger is already booked on this ride');
      }
      throw BadRequest('Not enough seats or ride no longer accepts requests');
    }

    request.status = 'accepted';
    request.acceptedAt = new Date();
    request.startPin = pin;
    request.startPinHash = hashPin(pin);
    request.pinVerified = false;
    await rideRequestRepository.save(request);

    const populated = await rideRequestRepository.findById(request._id);
    return sanitizeRequestForUser(populated, userId);
  },

  async rejectRequest(requestId, userId) {
    const request = await rideRequestRepository.findById(requestId);
    if (!request) throw NotFound('Ride request not found');

    const ride = await rideRepository.findById(toId(request.ride));
    if (!ride) throw NotFound('Ride not found');

    if (ride.driver.toString() !== userId.toString()) {
      throw Forbidden('Only ride owner can reject requests');
    }

    if (request.status !== 'pending') {
      throw BadRequest('Only pending requests can be rejected');
    }

    request.status = 'rejected';
    request.rejectedAt = new Date();
    await rideRequestRepository.save(request);

    const populated = await rideRequestRepository.findById(request._id);
    return sanitizeRequestForUser(populated, userId);
  },

  async cancelRequest(requestId, userId) {
    const request = await rideRequestRepository.findById(requestId);
    if (!request) throw NotFound('Ride request not found');

    if (toId(request.passenger) !== userId.toString()) {
      throw Forbidden('Only passenger can cancel this request');
    }

    const ride = await rideRepository.findById(toId(request.ride));
    if (!ride) throw NotFound('Ride not found');

    if (ride.status !== 'scheduled') {
      throw BadRequest('Passenger can cancel only before ride starts');
    }

    if (!['pending', 'accepted'].includes(request.status)) {
      throw BadRequest('Only pending or accepted requests can be cancelled');
    }

    if (request.status === 'accepted') {
      await rideRepository.atomicRemovePassenger({
        rideId: ride._id,
        passengerId: request.passenger,
        seats: request.seatsRequested,
      });
    }

    request.status = 'cancelled';
    request.cancelledAt = new Date();
    await rideRequestRepository.save(request);

    const populated = await rideRequestRepository.findById(request._id);
    return sanitizeRequestForUser(populated, userId);
  },

  async confirmPickup(requestId, userId, payload = {}) {
    const request = await rideRequestRepository.findById(requestId);
    if (!request) throw NotFound('Ride request not found');

    if (toId(request.passenger) !== userId.toString()) {
      throw Forbidden('Only passenger can confirm pickup location');
    }

    if (!['pending', 'accepted'].includes(request.status)) {
      throw BadRequest('Pickup can be confirmed only before trip starts');
    }

    const location = toSafeLocation(payload.pickupLocation || payload);
    if (!location?.lat || !location?.lng) {
      throw BadRequest('Current pickup lat/lng is required');
    }

    request.pickupLocation = location;
    request.pickupConfirmed = true;
    await rideRequestRepository.save(request);

    const ride = await rideRepository.findById(toId(request.ride));
    if (ride) {
      const passenger = (ride.passengers || []).find((p) => p.user?.toString() === userId.toString());
      if (passenger) {
        passenger.pickupLocation = location;
        passenger.pickupConfirmed = true;
        await rideRepository.save(ride);
      }
    }

    const populated = await rideRequestRepository.findById(request._id);
    return sanitizeRequestForUser(populated, userId);
  },

  async markNoShow(requestId, userId, reason = '') {
    const request = await rideRequestRepository.findById(requestId);
    if (!request) throw NotFound('Ride request not found');

    const ride = await rideRepository.findById(toId(request.ride));
    if (!ride) throw NotFound('Ride not found');

    const isDriver = ride.driver.toString() === userId.toString();
    const isPassenger = toId(request.passenger) === userId.toString();
    if (!isDriver && !isPassenger) {
      throw Forbidden('Only ride driver or passenger can mark no-show');
    }

    if (!['accepted', 'pending'].includes(request.status)) {
      throw BadRequest('Only pending or accepted requests can be marked no-show');
    }

    const targetUser = isDriver ? toId(request.passenger) : ride.driver;

    request.status = 'no_show';
    request.noShowReason = String(reason || '').trim();
    request.noShowAt = new Date();

    if (isDriver && request.status === 'no_show') {
      await rideRepository.atomicRemovePassenger({
        rideId: ride._id,
        passengerId: request.passenger,
        seats: request.seatsRequested,
      });
      const freshRide = await rideRepository.findById(ride._id);
      if (freshRide) {
        ride.passengers = freshRide.passengers || [];
        ride.bookedSeats = Number(freshRide.bookedSeats || 0);
      }
    }

    ride.noShows = ride.noShows || [];
    ride.noShows.push({
      markedBy: userId,
      user: targetUser,
      reason: request.noShowReason,
      createdAt: new Date(),
    });

    await rideRequestRepository.save(request);
    await rideRepository.save(ride);

    const populated = await rideRequestRepository.findById(request._id);
    return sanitizeRequestForUser(populated, userId);
  },

  verifyPinValue(pin, hash) {
    return Boolean(pin && hash && hashPin(pin) === hash);
  },
};
