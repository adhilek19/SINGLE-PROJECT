import { getSocketIO } from './socketEmitter.js';
import { toId, userRoomName } from '../services/chatAccessService.js';

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

export const emitRideUpdated = (ride) => {
  emitGlobal(
    'ride_updated',
    withTimestamp({
      ride,
      rideId: toId(ride?._id),
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

export const emitRideJoinRequested = (request) => {
  emitToUsers(
    'ride_join_requested',
    [request?.driver, request?.passenger],
    withTimestamp({
      request,
      requestId: toId(request?._id),
      rideId: toId(request?.ride),
    })
  );
};

export const emitRideJoinAccepted = (request) => {
  emitToUsers(
    'ride_join_accepted',
    [request?.driver, request?.passenger],
    withTimestamp({
      request,
      requestId: toId(request?._id),
      rideId: toId(request?.ride),
    })
  );
};

export const emitRideJoinRejected = (request) => {
  emitToUsers(
    'ride_join_rejected',
    [request?.driver, request?.passenger],
    withTimestamp({
      request,
      requestId: toId(request?._id),
      rideId: toId(request?.ride),
    })
  );
};
