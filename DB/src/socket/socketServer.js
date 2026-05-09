import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import RideRequest from '../models/RideRequest.js';
import { setSocketIO } from './socketEmitter.js';
import {
  chatRoomName,
  ensureChatAccess,
  toId,
  userRoomName,
} from '../services/chatAccessService.js';
import { messageService } from '../services/messageService.js';

const RIDE_ROOM_PREFIX = 'ride:';
const rideRoomName = (rideId) => `${RIDE_ROOM_PREFIX}${rideId}`;

const normalizeOrigin = (origin = '') => String(origin).trim().replace(/\/+$/, '');

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  env.CLIENT_URL,
  ...(env.CLIENT_URLS ? env.CLIENT_URLS.split(',') : []),
]
  .map(normalizeOrigin)
  .filter(Boolean);

const vercelPreviewRegex =
  /^https:\/\/saha-yatri-[a-z0-9-]+-adhilek100-3295s-projects\.vercel\.app$/i;

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOrigins.includes(normalizedOrigin) || vercelPreviewRegex.test(normalizedOrigin);
};

const toKmh = (speedMps) => {
  const n = Number(speedMps);
  if (!Number.isFinite(n) || n < 0) return null;
  return Number((n * 3.6).toFixed(1));
};

const cleanSpeedKmh = ({ speed, speedKmh }) => {
  const directKmh = Number(speedKmh);
  if (Number.isFinite(directKmh) && directKmh >= 0 && directKmh <= 250) {
    return Number(directKmh.toFixed(1));
  }

  return toKmh(speed);
};

const validLat = (lat) => Number.isFinite(lat) && lat >= -90 && lat <= 90;
const validLng = (lng) => Number.isFinite(lng) && lng >= -180 && lng <= 180;

const isAcceptedPassenger = async ({ rideId, userId }) => {
  const accepted = await RideRequest.findOne({
    ride: rideId,
    passenger: userId,
    status: 'accepted',
  }).select('_id');

  if (accepted) return true;

  const ride = await Ride.findById(rideId).select('passengers.user');
  if (!ride) return false;
  return (ride.passengers || []).some((p) => p.user?.toString() === userId.toString());
};

const resolveRideRole = async ({ rideId, user }) => {
  if (user.role === 'admin') return 'admin';

  const ride = await Ride.findById(rideId).select('driver');
  if (!ride) return null;

  if (ride.driver?.toString() === user._id.toString()) return 'driver';

  const accepted = await isAcceptedPassenger({ rideId, userId: user._id });
  if (accepted) return 'passenger';

  return null;
};

const onlineSocketCounts = new Map();

const increaseOnlineCount = (userId) => {
  const current = Number(onlineSocketCounts.get(userId) || 0);
  onlineSocketCounts.set(userId, current + 1);
  return current === 0;
};

const decreaseOnlineCount = (userId) => {
  const current = Number(onlineSocketCounts.get(userId) || 0);
  if (current <= 1) {
    onlineSocketCounts.delete(userId);
    return true;
  }
  onlineSocketCounts.set(userId, current - 1);
  return false;
};

const emitDelivered = ({ io, chatId, messageId, userId }) => {
  io.to(chatRoomName(chatId)).emit('message_delivered', {
    chatId: toId(chatId),
    messageId: toId(messageId),
    userId: toId(userId),
    deliveredAt: new Date().toISOString(),
  });
};

export const initSocket = ({ httpServer }) => {
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error(`Socket CORS blocked for origin: ${origin}`), false);
      },
      credentials: true,
    },
  });

  setSocketIO(io);

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('Unauthorized'));
      }

      const decoded = jwt.verify(token, env.ACCESS_SECRET);
      const user = await User.findById(decoded.id).select('_id role name profilePic');

      if (!user) {
        return next(new Error('Unauthorized'));
      }

      socket.user = user;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const currentUserId = toId(socket.user?._id);
    const personalRoom = userRoomName(currentUserId);
    socket.join(personalRoom);

    const becameOnline = increaseOnlineCount(currentUserId);
    if (becameOnline) {
      io.emit('user_online', {
        userId: currentUserId,
        at: new Date().toISOString(),
      });
    }

    socket.on('join_chat', async (payload = {}, ack) => {
      try {
        const chatId = String(payload.chatId || '').trim();
        if (!chatId) throw new Error('chatId is required');

        const access = await ensureChatAccess({ chatId, userId: socket.user._id });
        await socket.join(chatRoomName(access.chatId));

        const deliveredIds = await messageService.markAllDeliveredForUserInChat({
          chatId: access.chatId,
          userId: socket.user._id,
        });

        deliveredIds.forEach((messageId) => {
          emitDelivered({
            io,
            chatId: access.chatId,
            messageId,
            userId: socket.user._id,
          });
        });

        if (typeof ack === 'function') {
          ack({
            ok: true,
            chatId: access.chatId,
          });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'join_chat failed' });
        }
      }
    });

    socket.on('leave_chat', async (payload = {}, ack) => {
      try {
        const chatId = String(payload.chatId || '').trim();
        if (chatId) {
          await socket.leave(chatRoomName(chatId));
        }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'leave_chat failed' });
        }
      }
    });

    socket.on('send_message', async (payload = {}, ack) => {
      try {
        const result = await messageService.sendTextMessage({
          chatId: payload.chatId,
          senderId: socket.user._id,
          text: payload.text,
        });

        let messagePayload = result.message;
        const receiverSockets = await io
          .in(userRoomName(result.receiverId))
          .fetchSockets();

        if (receiverSockets.length) {
          const delivered = await messageService.markMessageDelivered({
            messageId: result.message._id,
            userId: result.receiverId,
          });
          messagePayload = delivered.message || messagePayload;
          if (delivered.changed) {
            emitDelivered({
              io,
              chatId: result.chatId,
              messageId: result.message._id,
              userId: result.receiverId,
            });
          }
        }

        io.to(chatRoomName(result.chatId)).emit('receive_message', {
          chatId: toId(result.chatId),
          message: messagePayload,
        });

        if (typeof ack === 'function') {
          ack({
            ok: true,
            message: messagePayload,
          });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'send_message failed' });
        }
      }
    });

    socket.on('typing', async (payload = {}, ack) => {
      try {
        const chatId = String(payload.chatId || '').trim();
        if (!chatId) throw new Error('chatId is required');

        const access = await ensureChatAccess({ chatId, userId: socket.user._id });

        socket.to(chatRoomName(access.chatId)).emit('typing', {
          chatId: access.chatId,
          userId: currentUserId,
          name: socket.user?.name || 'User',
        });

        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'typing failed' });
        }
      }
    });

    socket.on('stop_typing', async (payload = {}, ack) => {
      try {
        const chatId = String(payload.chatId || '').trim();
        if (!chatId) throw new Error('chatId is required');

        const access = await ensureChatAccess({ chatId, userId: socket.user._id });

        socket.to(chatRoomName(access.chatId)).emit('stop_typing', {
          chatId: access.chatId,
          userId: currentUserId,
        });

        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'stop_typing failed' });
        }
      }
    });

    socket.on('message_seen', async (payload = {}, ack) => {
      try {
        const messageId = String(payload.messageId || '').trim();
        if (!messageId) throw new Error('messageId is required');

        const message = await messageService.markMessageSeen({
          messageId,
          userId: socket.user._id,
        });

        io.to(chatRoomName(message.chat)).emit('message_seen', {
          chatId: toId(message.chat),
          messageId: toId(message._id),
          userId: currentUserId,
          seenAt: new Date().toISOString(),
        });

        if (typeof ack === 'function') {
          ack({ ok: true, message });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'message_seen failed' });
        }
      }
    });

    socket.on('message_delivered', async (payload = {}, ack) => {
      try {
        const messageId = String(payload.messageId || '').trim();
        if (!messageId) throw new Error('messageId is required');

        const delivery = await messageService.markMessageDelivered({
          messageId,
          userId: socket.user._id,
        });

        if (delivery.changed && delivery.message?.chat) {
          emitDelivered({
            io,
            chatId: delivery.message.chat,
            messageId: delivery.message._id,
            userId: currentUserId,
          });
        }

        if (typeof ack === 'function') {
          ack({ ok: true, message: delivery.message });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'message_delivered failed' });
        }
      }
    });

    socket.on('joinRide', async (payload = {}, ack) => {
      try {
        const rideId = String(payload.rideId || '').trim();
        if (!rideId) throw new Error('rideId is required');

        const role = await resolveRideRole({ rideId, user: socket.user });
        if (!role) throw new Error('Not allowed to join this ride');

        await socket.join(rideRoomName(rideId));
        if (typeof ack === 'function') ack({ ok: true, rideId, role });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, message: err.message || 'joinRide failed' });
      }
    });

    socket.on('leaveRide', async (payload = {}, ack) => {
      const rideId = String(payload.rideId || '').trim();
      if (rideId) {
        await socket.leave(rideRoomName(rideId));
      }
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('location:update', async (payload = {}, ack) => {
      try {
        const rideId = String(payload.rideId || '').trim();
        const lat = Number(payload.lat);
        const lng = Number(payload.lng);
        const heading =
          payload.heading === undefined || payload.heading === null
            ? null
            : Number(payload.heading);
        const speed =
          payload.speed === undefined || payload.speed === null
            ? null
            : Number(payload.speed);
        const accuracy =
          payload.accuracy === undefined || payload.accuracy === null
            ? null
            : Number(payload.accuracy);
        const speedKmh = cleanSpeedKmh({ speed, speedKmh: payload.speedKmh });

        if (!rideId) throw new Error('rideId is required');
        if (!validLat(lat) || !validLng(lng)) {
          throw new Error('Valid lat and lng are required');
        }

        const role = await resolveRideRole({ rideId, user: socket.user });
        if (!role) throw new Error('Not allowed to update location for this ride');

        const updatedAt = new Date();

        await User.findByIdAndUpdate(socket.user._id, {
          currentLocation: {
            type: 'Point',
            coordinates: [lng, lat],
            updatedAt,
          },
        });

        const rideDoc = await Ride.findById(rideId).select('lastLiveLocations anomalyFlags status');
        if (rideDoc) {
          rideDoc.lastLiveLocations = (rideDoc.lastLiveLocations || []).filter(
            (loc) => loc.user?.toString() !== socket.user._id.toString()
          );
          rideDoc.lastLiveLocations.push({
            user: socket.user._id,
            role: role === 'driver' ? 'driver' : 'passenger',
            name: socket.user.name || '',
            profilePic: socket.user.profilePic || '',
            lat,
            lng,
            heading: Number.isFinite(heading) ? heading : null,
            speed: Number.isFinite(speed) ? speed : null,
            speedKmh,
            accuracy: Number.isFinite(accuracy) ? accuracy : null,
            updatedAt,
          });
          if (rideDoc.lastLiveLocations.length > 10) {
            rideDoc.lastLiveLocations = rideDoc.lastLiveLocations.slice(-10);
          }
          if (rideDoc.status === 'started' && !Number.isFinite(speed)) {
            rideDoc.anomalyFlags = Array.from(
              new Set([...(rideDoc.anomalyFlags || []), 'location_missing'])
            );
          }
          await rideDoc.save();
        }

        const broadcast = {
          rideId,
          userId: socket.user._id.toString(),
          role: role === 'admin' ? 'passenger' : role,
          name: socket.user.name || '',
          profilePic: socket.user.profilePic || '',
          lat,
          lng,
          heading: Number.isFinite(heading) ? heading : null,
          speed: Number.isFinite(speed) ? speed : null,
          speedKmh,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          updatedAt,
        };

        io.to(rideRoomName(rideId)).emit('location:broadcast', broadcast);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, message: err.message || 'location:update failed' });
      }
    });

    socket.on('disconnect', () => {
      const becameOffline = decreaseOnlineCount(currentUserId);
      if (becameOffline) {
        io.emit('user_offline', {
          userId: currentUserId,
          at: new Date().toISOString(),
        });
      }
    });
  });

  return io;
};
