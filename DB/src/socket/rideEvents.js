import { getSocketIO } from './socketEmitter.js';
import { toId, userRoomName } from '../services/chatAccessService.js';
import { rideRepository } from '../repositories/rideRepository.js';

const emitGlobal = (event, payload) => {
  const io = getSocketIO();
  if (!io) return;
  io.emit(event, payload);
};

const emitToUsers = (event, userIds = [], payload = {}) => {
  const io = getSocketIO();
  if (!io) return;

  const targets = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((id) => toId(id))
        .filter(Boolean)
    )
  );

  targets.forEach((userId) => {
    io.to(userRoomName(userId)).emit(event, payload);
  });
};

const withTimestamp = (payload = {}) => ({
  ...payload,
  at: new Date().toISOString(),
});

export const emitRideCreated = (ride) => {
  emitGlobal(
    'ride_created',
    withTimestamp({
      ride,
      rideId: toId(ride?._id),
    })
  );
};

const resolveRideId = (ride) => {
  if (!ride) return '';
  if (typeof ride === 'string') return String(ride);
  if (typeof ride === 'object') {
    if (ride._id) return toId(ride._id);
    if (ride.rideId) return toId(ride.rideId);
  }
  return '';
};

export const emitRideUpdated = async (ride) => {
  const rideId = resolveRideId(ride);
  let payloadRide =
    ride && typeof ride === 'object' && !Array.isArray(ride) ? ride : null;

  if (rideId) {
    try {
      const canonicalRide = await rideRepository.findDetailedById(rideId);
      if (canonicalRide) payloadRide = canonicalRide;
    } catch {
      // Fall back to non-canonical payload to avoid dropping realtime update.
    }
  }

  emitGlobal(
    'ride_updated',
    withTimestamp({
      ride: payloadRide,
      rideId: toId(payloadRide?._id || rideId),
    })
  );
};

export const emitRideCancelled = (ride) => {
  emitGlobal(
    'ride_cancelled',
    withTimestamp({
      ride,
      rideId: toId(ride?._id),
    })
  );
};

const resolveRidePayload = (request, ride) =>
  (ride && typeof ride === 'object' && !Array.isArray(ride))
    ? ride
    : (request?.ride && typeof request.ride === 'object' ? request.ride : null);

export const emitRideJoinRequested = (request, ride = null) => {
  emitToUsers(
    'ride_join_requested',
    [request?.driver, request?.passenger],
    withTimestamp({
      request,
      ride: resolveRidePayload(request, ride),
      requestId: toId(request?._id),
      rideId: toId(request?.ride),
    })
  );
};

export const emitRideJoinAccepted = (request, ride = null) => {
  emitToUsers(
    'ride_join_accepted',
    [request?.driver, request?.passenger],
    withTimestamp({
      request,
      ride: resolveRidePayload(request, ride),
      requestId: toId(request?._id),
      rideId: toId(request?.ride),
    })
  );
};

export const emitRideJoinRejected = (request, ride = null) => {
  emitToUsers(
    'ride_join_rejected',
    [request?.driver, request?.passenger],
    withTimestamp({
      request,
      ride: resolveRidePayload(request, ride),
      requestId: toId(request?._id),
      rideId: toId(request?.ride),
    })
  );
};

const collectRideAudience = (ride) => {
  const toUserId = (value) => {
    if (!value) return '';
    if (typeof value === 'object' && value._id) return String(value._id);
    return value.toString?.() || '';
  };

  const ids = [];
  const driverId = toUserId(ride?.driver || ride?.driverInfo?._id);
  if (driverId) ids.push(driverId);

  (ride?.passengers || []).forEach((passenger) => {
    const passengerId = toUserId(passenger?.user);
    if (passengerId) ids.push(passengerId);
  });

  return ids;
};

export const emitPassengerVerified = ({ request, ride }) => {
  emitToUsers(
    'passenger_verified',
    collectRideAudience(ride),
    withTimestamp({
      request,
      ride,
      requestId: toId(request?._id),
      rideId: toId(ride?._id || request?.ride),
      passengerId: toId(request?.passenger),
    })
  );
};

export const emitRideStarted = (ride) => {
  emitToUsers(
    'ride_started',
    collectRideAudience(ride),
    withTimestamp({
      ride,
      rideId: toId(ride?._id),
    })
  );
};

export const emitRideTrackingEnabled = (ride) => {
  emitToUsers(
    'ride_tracking_enabled',
    collectRideAudience(ride),
    withTimestamp({
      ride,
      rideId: toId(ride?._id),
    })
  );
};
