import mongoose from 'mongoose';
import Chat from '../models/Chat.js';
import Ride from '../models/Ride.js';
import RideRequest from '../models/RideRequest.js';
import { BadRequest, Forbidden, NotFound } from '../utils/AppError.js';

export const CHAT_ROOM_PREFIX = 'chat:';
export const USER_ROOM_PREFIX = 'user:';

export const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

export const chatRoomName = (chatId) => `${CHAT_ROOM_PREFIX}${chatId}`;
export const userRoomName = (userId) => `${USER_ROOM_PREFIX}${userId}`;

const assertObjectId = (value, fieldLabel) => {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    throw BadRequest(`Invalid ${fieldLabel}`);
  }
};

const isAcceptedPassenger = async ({ rideId, userId, rideDoc = null }) => {
  const passengerId = toId(userId);
  if (!passengerId) return false;

  const ride = rideDoc || (await Ride.findById(rideId).select('passengers.user'));
  if (!ride) return false;

  const isInPassengerList = (ride.passengers || []).some(
    (entry) => toId(entry.user) === passengerId
  );
  if (isInPassengerList) return true;

  const acceptedRequest = await RideRequest.findOne({
    ride: rideId,
    passenger: passengerId,
    status: { $in: ['accepted', 'completed'] },
  }).select('_id');

  return Boolean(acceptedRequest);
};

const hasRideRequestContext = async ({ rideId, userId }) => {
  const passengerId = toId(userId);
  if (!passengerId) return false;

  const request = await RideRequest.findOne({
    ride: rideId,
    passenger: passengerId,
    status: { $in: ['pending', 'accepted', 'completed'] },
  }).select('_id');

  return Boolean(request);
};

export const ensureRideChatPair = async ({
  rideId,
  requesterId,
  targetUserId,
}) => {
  assertObjectId(rideId, 'ride id');
  assertObjectId(requesterId, 'requester user id');
  assertObjectId(targetUserId, 'target user id');

  const requester = toId(requesterId);
  const target = toId(targetUserId);

  if (requester === target) {
    throw BadRequest('Cannot create chat with yourself');
  }

  const ride = await Ride.findById(rideId).select('driver passengers.user');
  if (!ride) throw NotFound('Ride not found');

  const driverId = toId(ride.driver);
  const requesterIsDriver = driverId === requester;
  const requesterIsAcceptedPassenger = await isAcceptedPassenger({
    rideId,
    userId: requester,
    rideDoc: ride,
  });

  if (requesterIsDriver) {
    const targetIsAcceptedPassenger = await isAcceptedPassenger({
      rideId,
      userId: target,
      rideDoc: ride,
    });

    const targetHasInquiryContext = targetIsAcceptedPassenger
      ? true
      : await hasRideRequestContext({
          rideId,
          userId: target,
        });

    if (!targetHasInquiryContext) {
      throw Forbidden(
        'Driver can only chat with passengers who requested or joined this ride'
      );
    }

    return {
      ride,
      driverId,
      passengerId: target,
      participants: [driverId, target].sort(),
      chatKind: targetIsAcceptedPassenger ? 'ride' : 'inquiry',
      requesterRole: 'driver',
    };
  }

  if (driverId !== target) {
    throw Forbidden('Passenger can only chat with ride driver');
  }

  return {
    ride,
    driverId,
    passengerId: requester,
    participants: [driverId, requester].sort(),
    chatKind: requesterIsAcceptedPassenger ? 'ride' : 'inquiry',
    requesterRole: 'passenger',
  };
};

export const ensureChatAccess = async ({ chatId, userId }) => {
  assertObjectId(chatId, 'chat id');
  assertObjectId(userId, 'user id');

  const chat = await Chat.findById(chatId).select('ride participants chatKind');
  if (!chat) throw NotFound('Chat not found');

  const participantIds = (chat.participants || []).map(toId);
  const currentUserId = toId(userId);

  if (!participantIds.includes(currentUserId)) {
    throw Forbidden('You are not allowed to access this chat');
  }

  const ride = await Ride.findById(chat.ride).select('driver passengers.user');
  if (!ride) throw NotFound('Ride not found');

  const driverId = toId(ride.driver);
  if (!participantIds.includes(driverId)) {
    throw Forbidden('Chat participants are invalid for this ride');
  }

  const passengerId = participantIds.find((id) => id !== driverId);
  if (!passengerId) {
    throw Forbidden('Chat must include one driver and one passenger');
  }

  if (chat.chatKind !== 'inquiry') {
    const passengerStillAccepted = await isAcceptedPassenger({
      rideId: ride._id,
      userId: passengerId,
      rideDoc: ride,
    });

    if (!passengerStillAccepted) {
      throw Forbidden('Passenger is not accepted for this ride');
    }
  }

  const otherUserId = participantIds.find((id) => id !== currentUserId) || '';
  const role = currentUserId === driverId ? 'driver' : 'passenger';

  return {
    chatId: toId(chat._id),
    chat,
    ride,
    driverId,
    passengerId,
    chatKind: chat.chatKind || 'ride',
    role,
    requesterId: currentUserId,
    otherUserId,
  };
};
