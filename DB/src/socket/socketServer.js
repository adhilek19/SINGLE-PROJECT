import { Server } from 'socket.io';
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
import { callService } from '../services/callService.js';
import { notificationService } from '../services/notificationService.js';
import { authenticateAccessToken } from '../utils/accessAuth.js';
import { validateCorsOrigin } from '../utils/corsConfig.js';
import { logger } from '../utils/logger.js';

const RIDE_ROOM_PREFIX = 'ride:';
const trackingRoomName = (rideId) => `${RIDE_ROOM_PREFIX}${rideId}:tracking`;
const publicTrackingRoomName = (rideId) => `public:${RIDE_ROOM_PREFIX}${rideId}:tracking`;

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

const ensureTrackingEnabled = async (rideId) => {
  const ride = await Ride.findById(rideId).select('status');
  if (!ride) return { ok: false, message: 'Ride not found' };
  if (ride.status !== 'started') {
    return { ok: false, message: 'Live tracking is available only after ride has started' };
  }
  return { ok: true, ride };
};

const onlineSocketCounts = new Map();
const lastSeenByUser = new Map();

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

const relayToCallPeer = ({ io, targetUserId, event, payload = {} }) => {
  if (!targetUserId) return;
  io.to(userRoomName(targetUserId)).emit(event, {
    ...payload,
    at: new Date().toISOString(),
  });
};

export const initSocket = ({ httpServer }) => {
  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        validateCorsOrigin(origin, callback, 'socket.io');
      },
      credentials: true,
    },
  });

  setSocketIO(io);
  const publicTrackingNamespace = io.of('/public-tracking');

  publicTrackingNamespace.on('connection', (socket) => {
    socket.on('join_public_tracking', async (payload = {}, ack) => {
      try {
        const shareToken = String(payload.token || '').trim();
        if (!shareToken) throw new Error('Tracking token is required');

        const ride = await Ride.findOne({
          shareToken,
          shareEnabled: true,
        }).select('_id status lastLiveLocations');

        if (!ride) throw new Error('Tracking link is invalid or disabled');

        const rideId = ride._id.toString();
        socket.join(publicTrackingRoomName(rideId));

        socket.emit('public_tracking_snapshot', {
          rideId,
          status: ride.status,
          lastLiveLocations: ride.lastLiveLocations || [],
          at: new Date().toISOString(),
        });

        if (typeof ack === 'function') {
          ack({
            ok: true,
            rideId,
            status: ride.status,
          });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({
            ok: false,
            message: err.message || 'Unable to join tracking channel',
          });
        }
      }
    });

    socket.on('leave_public_tracking', (payload = {}, ack) => {
      const rideId = String(payload.rideId || '').trim();
      if (rideId) {
        socket.leave(publicTrackingRoomName(rideId));
      }
      if (typeof ack === 'function') ack({ ok: true });
    });
  });

  const callSessions = new Map();
  const userCallLocks = new Map();

  const lockUserForCall = ({ userId, callId }) => {
    const safeUserId = toId(userId);
    const safeCallId = toId(callId);
    if (!safeUserId || !safeCallId) return;
    userCallLocks.set(safeUserId, safeCallId);
  };

  const unlockUserForCall = ({ userId, callId }) => {
    const safeUserId = toId(userId);
    const safeCallId = toId(callId);
    if (!safeUserId) return;
    const current = toId(userCallLocks.get(safeUserId));
    if (!current) return;
    if (safeCallId && current !== safeCallId) return;
    userCallLocks.delete(safeUserId);
  };

  const clearCallSession = (callId) => {
    const safeCallId = toId(callId);
    if (!safeCallId) return;
    const session = callSessions.get(safeCallId);
    if (!session) return;

    if (session.timeoutHandle) {
      clearTimeout(session.timeoutHandle);
    }

    unlockUserForCall({ userId: session.callerId, callId: safeCallId });
    unlockUserForCall({ userId: session.calleeId, callId: safeCallId });
    callSessions.delete(safeCallId);
  };

  const finalizeCallSession = async ({
    session,
    status,
    endedBy = null,
    failureReason = '',
  }) => {
    const safeStatus = String(status || '').trim() || 'ended';
    try {
      await callService.updateCallStatus({
        callId: session.callId,
        status: safeStatus,
        endedBy,
        failureReason,
      });
    } catch {
      // do not block signaling cleanup on call log persistence failures
    }

    relayToCallPeer({
      io,
      targetUserId: session.callerId,
      event: safeStatus === 'failed' ? 'call_failed' : 'call_ended',
      payload: {
        callId: session.callId,
        chatId: session.chatId,
        rideId: session.rideId,
        status: safeStatus,
        endedBy: toId(endedBy),
        reason: failureReason || '',
      },
    });

    relayToCallPeer({
      io,
      targetUserId: session.calleeId,
      event: safeStatus === 'failed' ? 'call_failed' : 'call_ended',
      payload: {
        callId: session.callId,
        chatId: session.chatId,
        rideId: session.rideId,
        status: safeStatus,
        endedBy: toId(endedBy),
        reason: failureReason || '',
      },
    });

    clearCallSession(session.callId);
  };

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');

      if (!token) {
        logger.warn({
          event: 'socket_auth_missing_token',
          userId: '',
          socketId: socket.id,
        });
        return next(new Error('Socket authentication failed: access token missing'));
      }

      const authResult = await authenticateAccessToken(token);

      socket.user = authResult.user;
      socket.data.userId = authResult.userId;
      if (process.env.NODE_ENV !== 'production') {
        logger.info({
          event: 'socket_auth_success',
          userId: authResult.userId,
        });
      }
      return next();
    } catch (err) {
      logger.warn({
        event: 'socket_auth_failed',
        userId: '',
        socketId: socket.id,
        reason: err?.message || 'Invalid token',
      });
      return next(new Error(err?.message || 'Socket authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const currentUserId = toId(socket.user?._id);
    const personalRoom = userRoomName(currentUserId);
    socket.join(personalRoom);
    socket.data.activeChatId = '';
    socket.data.pageVisible = false;

    socket.emit('online_users', {
      userIds: Array.from(onlineSocketCounts.keys()),
      lastSeenByUser: Object.fromEntries(lastSeenByUser.entries()),
      at: new Date().toISOString(),
    });

    const becameOnline = increaseOnlineCount(currentUserId);
    if (becameOnline) {
      lastSeenByUser.delete(currentUserId);
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
          if (toId(socket.data.activeChatId) === toId(chatId)) {
            socket.data.activeChatId = '';
            socket.data.pageVisible = false;
          }
        }
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'leave_chat failed' });
        }
      }
    });

    socket.on('chat_focus', async (payload = {}, ack) => {
      try {
        const chatId = String(payload.chatId || '').trim();
        if (!chatId) throw new Error('chatId is required');

        const access = await ensureChatAccess({ chatId, userId: socket.user._id });
        socket.data.activeChatId = access.chatId;
        socket.data.pageVisible = payload.visible !== false;

        if (typeof ack === 'function') {
          ack({ ok: true, chatId: access.chatId });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'chat_focus failed' });
        }
      }
    });

    socket.on('chat_blur', async (payload = {}, ack) => {
      const chatId = String(payload.chatId || '').trim();
      if (!chatId || toId(socket.data.activeChatId) === toId(chatId)) {
        socket.data.activeChatId = '';
      }
      socket.data.pageVisible = false;
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('send_message', async (payload = {}, ack) => {
      try {
        const result = await messageService.sendTextMessage({
          chatId: payload.chatId,
          senderId: socket.user._id,
          text: payload.text,
          clientMessageId: payload.clientMessageId,
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

        if (!result?.deduped) {
          notificationService.notifyChatMessage({
            receiverId: result.receiverId,
            senderId: currentUserId,
            chatId: result.chatId,
            rideId: result.rideId,
            message: messagePayload,
          });
        }

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

    socket.on('message_reaction', async (payload = {}, ack) => {
      try {
        const messageId = String(payload.messageId || '').trim();
        const emoji = String(payload.emoji || '').trim();
        if (!messageId) throw new Error('messageId is required');

        const message = await messageService.reactToMessage({
          messageId,
          userId: socket.user._id,
          emoji,
        });

        io.to(chatRoomName(message.chat)).emit('message_reaction', {
          chatId: toId(message.chat),
          messageId: toId(message._id),
          userId: currentUserId,
          message,
        });

        if (typeof ack === 'function') {
          ack({ ok: true, message });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'message_reaction failed' });
        }
      }
    });

    socket.on('call_user', async (payload = {}, ack) => {
      try {
        const chatId = String(payload.chatId || '').trim();
        if (!chatId) throw new Error('chatId is required');

        if (userCallLocks.has(currentUserId)) {
          relayToCallPeer({
            io,
            targetUserId: currentUserId,
            event: 'call_busy',
            payload: {
              chatId,
              reason: 'You are already in another call',
              status: 'busy',
            },
          });
          throw new Error('You are already in another call');
        }

        const access = await ensureChatAccess({ chatId, userId: socket.user._id });
        const calleeId = toId(access.otherUserId);
        const callerId = currentUserId;
        if (!calleeId || !callerId) throw new Error('Invalid call participants');

        if (userCallLocks.has(calleeId)) {
          let busyCall = null;
          try {
            busyCall = await callService.createCallLog({
              chatId: access.chatId,
              rideId: access.ride?._id,
              callerId,
              calleeId,
              status: 'busy',
              failureReason: 'callee_busy',
            });
            if (busyCall?._id) {
              await callService.updateCallStatus({
                callId: busyCall._id,
                status: 'busy',
                endedBy: callerId,
                failureReason: 'callee_busy',
              });
            }
          } catch {
            // do not block signaling on call log creation failure
          }

          relayToCallPeer({
            io,
            targetUserId: callerId,
            event: 'call_busy',
            payload: {
              callId: toId(busyCall?._id),
              chatId: access.chatId,
              calleeId,
              status: 'busy',
              reason: 'User is busy on another call',
            },
          });
          throw new Error('User is busy on another call');
        }

        const calleeSockets = await io.in(userRoomName(calleeId)).fetchSockets();
        if (!calleeSockets.length) {
          let missedCall = null;
          try {
            missedCall = await callService.createCallLog({
              chatId: access.chatId,
              rideId: access.ride?._id,
              callerId,
              calleeId,
              status: 'missed',
              failureReason: 'callee_offline',
            });
            await callService.updateCallStatus({
              callId: missedCall._id,
              status: 'missed',
              failureReason: 'callee_offline',
              endedBy: callerId,
            });
          } catch {
            // do not block signaling on call log creation failure
          }

          relayToCallPeer({
            io,
            targetUserId: callerId,
            event: 'call_failed',
            payload: {
              callId: toId(missedCall?._id),
              chatId: access.chatId,
              calleeId,
              status: 'missed',
              reason: 'User is offline',
            },
          });
          notificationService.notifyMissedCall({
            calleeId,
            callerId,
            callerName: socket.user?.name || 'Someone',
            chatId: access.chatId,
            rideId: access.ride?._id,
            callId: missedCall?._id,
          });
          throw new Error('User is offline');
        }

        const callLog = await callService.createCallLog({
          chatId: access.chatId,
          rideId: access.ride?._id,
          callerId,
          calleeId,
          status: 'ringing',
        });

        const callId = toId(callLog?._id);
        const session = {
          callId,
          chatId: toId(access.chatId),
          rideId: toId(access.ride?._id),
          callerId,
          calleeId,
          callerName: socket.user?.name || 'Someone',
          status: 'ringing',
          createdAt: new Date().toISOString(),
          timeoutHandle: null,
        };

        lockUserForCall({ userId: callerId, callId });
        lockUserForCall({ userId: calleeId, callId });

        session.timeoutHandle = setTimeout(async () => {
          const current = callSessions.get(callId);
          if (!current || current.status !== 'ringing') return;

          try {
            await callService.updateCallStatus({
              callId,
              status: 'missed',
              failureReason: 'no_answer',
            });
          } catch {
            // ignore timeout persistence errors
          }

          relayToCallPeer({
            io,
            targetUserId: current.callerId,
            event: 'call_failed',
            payload: {
              callId: current.callId,
              chatId: current.chatId,
              rideId: current.rideId,
              status: 'missed',
              reason: 'Call missed',
            },
          });

          relayToCallPeer({
            io,
            targetUserId: current.calleeId,
            event: 'call_ended',
            payload: {
              callId: current.callId,
              chatId: current.chatId,
              rideId: current.rideId,
              status: 'missed',
              reason: 'Call missed',
            },
          });

          notificationService.notifyMissedCall({
            calleeId: current.calleeId,
            callerId: current.callerId,
            callerName: current.callerName || 'Someone',
            chatId: current.chatId,
            rideId: current.rideId,
            callId: current.callId,
          });

          clearCallSession(callId);
        }, callService.getRingTimeoutMs());

        callSessions.set(callId, session);

        relayToCallPeer({
          io,
          targetUserId: calleeId,
          event: 'incoming_call',
          payload: {
            callId,
            chatId: access.chatId,
            rideId: toId(access.ride?._id),
            from: {
              _id: callerId,
              name: socket.user?.name || 'User',
              profilePic: socket.user?.profilePic || '',
            },
            status: 'ringing',
          },
        });

        notificationService.notifyIncomingCall({
          calleeId,
          callerId,
          callerName: socket.user?.name || 'Someone',
          chatId: access.chatId,
          rideId: access.ride?._id,
          callId,
        });

        if (typeof ack === 'function') {
          ack({
            ok: true,
            callId,
            chatId: access.chatId,
            calleeId,
            status: 'ringing',
          });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'call_user failed' });
        }
      }
    });

    socket.on('call_accepted', async (payload = {}, ack) => {
      try {
        const callId = String(payload.callId || '').trim();
        if (!callId) throw new Error('callId is required');

        const session = callSessions.get(callId);
        if (!session) throw new Error('Call session not found');

        await ensureChatAccess({ chatId: session.chatId, userId: socket.user._id });
        if (session.calleeId !== currentUserId) {
          throw new Error('Only callee can accept this call');
        }
        if (session.status !== 'ringing') {
          throw new Error('Call is no longer ringing');
        }

        session.status = 'connected';
        session.answeredAt = new Date().toISOString();
        if (session.timeoutHandle) {
          clearTimeout(session.timeoutHandle);
          session.timeoutHandle = null;
        }
        callSessions.set(callId, session);
        try {
          await callService.updateCallStatus({
            callId,
            status: 'connected',
            answeredAt: session.answeredAt,
          });
        } catch {
          // do not block signaling when call-log persistence fails
        }

        relayToCallPeer({
          io,
          targetUserId: session.callerId,
          event: 'call_accepted',
          payload: {
            callId: session.callId,
            chatId: session.chatId,
            rideId: session.rideId,
            acceptedBy: currentUserId,
            status: 'connected',
          },
        });

        relayToCallPeer({
          io,
          targetUserId: session.calleeId,
          event: 'call_accepted',
          payload: {
            callId: session.callId,
            chatId: session.chatId,
            rideId: session.rideId,
            acceptedBy: currentUserId,
            status: 'connected',
          },
        });

        if (typeof ack === 'function') {
          ack({ ok: true, callId: session.callId, status: 'connected' });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'call_accepted failed' });
        }
      }
    });

    socket.on('call_rejected', async (payload = {}, ack) => {
      try {
        const callId = String(payload.callId || '').trim();
        const reason = String(payload.reason || '').trim();
        if (!callId) throw new Error('callId is required');

        const session = callSessions.get(callId);
        if (!session) throw new Error('Call session not found');

        await ensureChatAccess({ chatId: session.chatId, userId: socket.user._id });
        if (session.calleeId !== currentUserId) {
          throw new Error('Only callee can reject this call');
        }

        try {
          await callService.updateCallStatus({
            callId,
            status: 'rejected',
            endedBy: socket.user._id,
            failureReason: reason || 'callee_rejected',
          });
        } catch {
          // do not block cleanup on persistence failures
        }

        relayToCallPeer({
          io,
          targetUserId: session.callerId,
          event: 'call_rejected',
          payload: {
            callId: session.callId,
            chatId: session.chatId,
            rideId: session.rideId,
            rejectedBy: currentUserId,
            status: 'rejected',
            reason: reason || '',
          },
        });

        relayToCallPeer({
          io,
          targetUserId: session.calleeId,
          event: 'call_rejected',
          payload: {
            callId: session.callId,
            chatId: session.chatId,
            rideId: session.rideId,
            rejectedBy: currentUserId,
            status: 'rejected',
            reason: reason || '',
          },
        });

        clearCallSession(callId);

        if (typeof ack === 'function') {
          ack({ ok: true, callId, status: 'rejected' });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'call_rejected failed' });
        }
      }
    });

    socket.on('call_ended', async (payload = {}, ack) => {
      try {
        const callId = String(payload.callId || '').trim();
        if (!callId) throw new Error('callId is required');

        const session = callSessions.get(callId);
        if (!session) throw new Error('Call session not found');

        await ensureChatAccess({ chatId: session.chatId, userId: socket.user._id });
        if (![session.callerId, session.calleeId].includes(currentUserId)) {
          throw new Error('Only call participants can end this call');
        }

        await finalizeCallSession({
          session,
          status: 'ended',
          endedBy: socket.user._id,
          failureReason: '',
        });

        if (typeof ack === 'function') {
          ack({ ok: true, callId, status: 'ended' });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'call_ended failed' });
        }
      }
    });

    socket.on('call_failed', async (payload = {}, ack) => {
      try {
        const callId = String(payload.callId || '').trim();
        const reason = String(payload.reason || '').trim();
        if (!callId) throw new Error('callId is required');

        const session = callSessions.get(callId);
        if (!session) throw new Error('Call session not found');

        await ensureChatAccess({ chatId: session.chatId, userId: socket.user._id });
        if (![session.callerId, session.calleeId].includes(currentUserId)) {
          throw new Error('Only call participants can fail this call');
        }

        await finalizeCallSession({
          session,
          status: 'failed',
          endedBy: socket.user._id,
          failureReason: reason || 'call_failed',
        });

        if (typeof ack === 'function') {
          ack({ ok: true, callId, status: 'failed' });
        }
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'call_failed failed' });
        }
      }
    });

    socket.on('webrtc_offer', async (payload = {}, ack) => {
      try {
        const callId = String(payload.callId || '').trim();
        const sdp = payload.sdp;
        if (!callId) throw new Error('callId is required');
        if (!sdp) throw new Error('Offer SDP is required');

        const session = callSessions.get(callId);
        if (!session) throw new Error('Call session not found');
        await ensureChatAccess({ chatId: session.chatId, userId: socket.user._id });
        if (![session.callerId, session.calleeId].includes(currentUserId)) {
          throw new Error('Only call participants can send offer');
        }

        const targetUserId =
          currentUserId === session.callerId ? session.calleeId : session.callerId;

        relayToCallPeer({
          io,
          targetUserId,
          event: 'webrtc_offer',
          payload: {
            callId: session.callId,
            chatId: session.chatId,
            rideId: session.rideId,
            fromUserId: currentUserId,
            sdp,
          },
        });

        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'webrtc_offer failed' });
        }
      }
    });

    socket.on('webrtc_answer', async (payload = {}, ack) => {
      try {
        const callId = String(payload.callId || '').trim();
        const sdp = payload.sdp;
        if (!callId) throw new Error('callId is required');
        if (!sdp) throw new Error('Answer SDP is required');

        const session = callSessions.get(callId);
        if (!session) throw new Error('Call session not found');
        await ensureChatAccess({ chatId: session.chatId, userId: socket.user._id });
        if (![session.callerId, session.calleeId].includes(currentUserId)) {
          throw new Error('Only call participants can send answer');
        }

        const targetUserId =
          currentUserId === session.callerId ? session.calleeId : session.callerId;

        relayToCallPeer({
          io,
          targetUserId,
          event: 'webrtc_answer',
          payload: {
            callId: session.callId,
            chatId: session.chatId,
            rideId: session.rideId,
            fromUserId: currentUserId,
            sdp,
          },
        });

        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'webrtc_answer failed' });
        }
      }
    });

    socket.on('webrtc_ice_candidate', async (payload = {}, ack) => {
      try {
        const callId = String(payload.callId || '').trim();
        const candidate = payload.candidate;
        if (!callId) throw new Error('callId is required');
        if (!candidate) throw new Error('ICE candidate is required');

        const session = callSessions.get(callId);
        if (!session) throw new Error('Call session not found');
        await ensureChatAccess({ chatId: session.chatId, userId: socket.user._id });
        if (![session.callerId, session.calleeId].includes(currentUserId)) {
          throw new Error('Only call participants can send candidate');
        }

        const targetUserId =
          currentUserId === session.callerId ? session.calleeId : session.callerId;

        relayToCallPeer({
          io,
          targetUserId,
          event: 'webrtc_ice_candidate',
          payload: {
            callId: session.callId,
            chatId: session.chatId,
            rideId: session.rideId,
            fromUserId: currentUserId,
            candidate,
          },
        });

        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'webrtc_ice_candidate failed' });
        }
      }
    });

    const joinTracking = async (payload = {}, ack) => {
      try {
        const rideId = String(payload.rideId || '').trim();
        if (!rideId) throw new Error('rideId is required');

        const tracking = await ensureTrackingEnabled(rideId);
        if (!tracking.ok) throw new Error(tracking.message);

        const role = await resolveRideRole({ rideId, user: socket.user });
        if (!role) throw new Error('Not allowed to join this ride tracking');

        await socket.join(trackingRoomName(rideId));
        if (typeof ack === 'function') ack({ ok: true, rideId, role });
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'join tracking failed' });
        }
      }
    };

    const leaveTracking = async (payload = {}, ack) => {
      const rideId = String(payload.rideId || '').trim();
      if (rideId) {
        await socket.leave(trackingRoomName(rideId));
      }
      if (typeof ack === 'function') ack({ ok: true });
    };

    const locationUpdate = async (payload = {}, ack) => {
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

        const tracking = await ensureTrackingEnabled(rideId);
        if (!tracking.ok) throw new Error(tracking.message);

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

        io.to(trackingRoomName(rideId)).emit('location_broadcast', broadcast);
        io.to(trackingRoomName(rideId)).emit('location:broadcast', broadcast);
        publicTrackingNamespace
          .to(publicTrackingRoomName(rideId))
          .emit('public_tracking_update', {
            ...broadcast,
            status: tracking.ride?.status || 'started',
            at: new Date().toISOString(),
          });
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: err.message || 'location update failed' });
        }
      }
    };

    // New tracking contract
    socket.on('join_tracking', joinTracking);
    socket.on('leave_tracking', leaveTracking);
    socket.on('location_update', locationUpdate);

    // Backward-compatible aliases
    socket.on('joinRide', joinTracking);
    socket.on('leaveRide', leaveTracking);
    socket.on('location:update', locationUpdate);

    socket.on('disconnect', async () => {
      socket.data.activeChatId = '';
      socket.data.pageVisible = false;
      const becameOffline = decreaseOnlineCount(currentUserId);
      if (becameOffline) {
        const activeCallId = toId(userCallLocks.get(currentUserId));
        const activeSession = activeCallId ? callSessions.get(activeCallId) : null;
        if (activeSession) {
          await finalizeCallSession({
            session: activeSession,
            status: activeSession.status === 'connected' ? 'ended' : 'missed',
            endedBy: socket.user._id,
            failureReason: 'peer_disconnected',
          });
        }

        const lastSeenAt = new Date().toISOString();
        lastSeenByUser.set(currentUserId, lastSeenAt);
        io.emit('user_offline', {
          userId: currentUserId,
          at: lastSeenAt,
          lastSeenAt,
        });
      }
    });
  });

  return io;
};
