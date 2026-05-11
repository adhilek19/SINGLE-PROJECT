import webPush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import { env } from '../config/env.js';
import { BadRequest } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { getSocketIO } from '../socket/socketEmitter.js';
import { chatRoomName, toId, userRoomName } from './chatAccessService.js';

webPush.setVapidDetails(
  env.VAPID_SUBJECT,
  env.VAPID_PUBLIC_KEY,
  env.VAPID_PRIVATE_KEY
);

const MAX_TITLE_LENGTH = 90;
const MAX_BODY_LENGTH = 180;

const cleanText = (value, maxLength) =>
  String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const safePath = (value) => {
  const path = String(value || '').trim();
  if (/^\/(chats|rides)\/[A-Za-z0-9:_-]+$/.test(path)) return path;
  return '/';
};

const sanitizeData = (data = {}) => {
  const safe = {};
  ['chatId', 'rideId', 'requestId', 'callId', 'type'].forEach((key) => {
    const value = cleanText(data[key], 128);
    if (value) safe[key] = value;
  });
  return safe;
};

const sanitizePayload = (payload = {}) => {
  const url = safePath(payload.url);
  return {
    title: cleanText(payload.title || 'SahaYatri', MAX_TITLE_LENGTH),
    body: cleanText(payload.body || 'You have a new update.', MAX_BODY_LENGTH),
    url,
    tag: cleanText(payload.tag || url || 'sahayatri', 128),
    data: sanitizeData(payload.data),
  };
};

const normalizeSubscription = (subscription = {}) => {
  const endpoint = cleanText(subscription.endpoint, 2048);
  const keys = subscription.keys || {};
  const p256dh = cleanText(keys.p256dh, 512);
  const auth = cleanText(keys.auth, 256);

  if (!endpoint || !p256dh || !auth) {
    throw BadRequest('Invalid push subscription');
  }

  return {
    endpoint,
    keys: {
      p256dh,
      auth,
    },
  };
};

const getSenderName = (message = {}) =>
  cleanText(message?.sender?.name || message?.senderName || 'Someone', 50);

const getMessageBody = (message = {}) => {
  switch (message.type) {
    case 'image':
      return 'sent you a photo.';
    case 'video':
      return 'sent you a video.';
    case 'audio':
      return 'sent you an audio file.';
    case 'voice':
      return 'sent you a voice note.';
    case 'file':
      return 'sent you a file.';
    default:
      return 'sent you a message.';
  }
};

const isExpiredOrInvalidSubscription = (err) => {
  const statusCode = Number(err?.statusCode || err?.status);
  return [400, 404, 410].includes(statusCode);
};

const isUserFocusedInChat = async ({ userId, chatId }) => {
  const io = getSocketIO();
  const safeUserId = toId(userId);
  const safeChatId = toId(chatId);
  if (!io || !safeUserId || !safeChatId) return false;

  try {
    const sockets = await io.in(userRoomName(safeUserId)).fetchSockets();
    return sockets.some((socket) => {
      const data = socket.data || {};
      return (
        toId(data.activeChatId) === safeChatId &&
        data.pageVisible === true &&
        socket.rooms?.has?.(chatRoomName(safeChatId))
      );
    });
  } catch (err) {
    logger.warn(`Unable to inspect chat focus for push suppression: ${err.message}`);
    return false;
  }
};

const fireAndForget = (promise, label) => {
  Promise.resolve(promise).catch((err) => {
    logger.warn(`${label} push failed: ${err.message}`);
  });
};

export const notificationService = {
  getVapidPublicKey() {
    return env.VAPID_PUBLIC_KEY;
  },

  async saveSubscription({ userId, subscription, userAgent = '' }) {
    const normalized = normalizeSubscription(subscription);
    const now = new Date();

    const update = {
      $set: {
        user: userId,
        keys: normalized.keys,
        userAgent: cleanText(userAgent, 512),
        lastUsedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    };

    try {
      return await PushSubscription.findOneAndUpdate(
        { endpoint: normalized.endpoint },
        update,
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (err) {
      if (err?.code !== 11000) throw err;
      return PushSubscription.findOneAndUpdate(
        { endpoint: normalized.endpoint },
        update,
        { new: true }
      );
    }
  },

  async removeSubscription({ userId, endpoint }) {
    const safeEndpoint = cleanText(endpoint, 2048);
    if (!safeEndpoint) return { deletedCount: 0 };

    return PushSubscription.deleteMany({
      user: userId,
      endpoint: safeEndpoint,
    });
  },

  async sendPushToUser(userId, payload) {
    const safeUserId = toId(userId);
    if (!safeUserId) return { sent: 0, removed: 0 };

    const subscriptions = await PushSubscription.find({ user: safeUserId });
    if (!subscriptions.length) return { sent: 0, removed: 0 };

    const body = JSON.stringify(sanitizePayload(payload));
    let sent = 0;
    let removed = 0;

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: subscription.keys,
            },
            body,
            { TTL: 60 * 60 }
          );

          sent += 1;
          subscription.lastUsedAt = new Date();
          await subscription.save();
        } catch (err) {
          if (isExpiredOrInvalidSubscription(err)) {
            removed += 1;
            await PushSubscription.deleteOne({ _id: subscription._id });
            return;
          }

          logger.warn(`Web push delivery failed: ${err.message}`);
        }
      })
    );

    return { sent, removed };
  },

  async sendChatMessagePush({ receiverId, senderId, chatId, rideId, message }) {
    if (!receiverId || toId(receiverId) === toId(senderId)) return;
    if (await isUserFocusedInChat({ userId: receiverId, chatId })) return;

    const senderName = getSenderName(message);
    await this.sendPushToUser(receiverId, {
      title: `New message from ${senderName}`,
      body: getMessageBody(message),
      url: `/chats/${toId(chatId)}`,
      tag: `chat:${toId(chatId)}`,
      data: {
        type: 'chat_message',
        chatId: toId(chatId),
        rideId: toId(rideId),
      },
    });
  },

  notifyChatMessage(args) {
    fireAndForget(this.sendChatMessagePush(args), 'Chat message');
  },

  async sendIncomingCallPush({ calleeId, callerId, callerName, chatId, rideId, callId }) {
    if (!calleeId || toId(calleeId) === toId(callerId)) return;
    if (await isUserFocusedInChat({ userId: calleeId, chatId })) return;

    await this.sendPushToUser(calleeId, {
      title: 'Incoming audio call',
      body: `${cleanText(callerName || 'Someone', 50)} is calling you.`,
      url: `/chats/${toId(chatId)}`,
      tag: `call:${toId(callId) || toId(chatId)}`,
      data: {
        type: 'incoming_call',
        chatId: toId(chatId),
        rideId: toId(rideId),
        callId: toId(callId),
      },
    });
  },

  notifyIncomingCall(args) {
    fireAndForget(this.sendIncomingCallPush(args), 'Incoming call');
  },

  async sendMissedCallPush({ calleeId, callerId, callerName, chatId, rideId, callId }) {
    if (!calleeId || toId(calleeId) === toId(callerId)) return;
    if (await isUserFocusedInChat({ userId: calleeId, chatId })) return;

    await this.sendPushToUser(calleeId, {
      title: 'Missed audio call',
      body: `You missed a call from ${cleanText(callerName || 'someone', 50)}.`,
      url: `/chats/${toId(chatId)}`,
      tag: `call:${toId(callId) || toId(chatId)}`,
      data: {
        type: 'missed_call',
        chatId: toId(chatId),
        rideId: toId(rideId),
        callId: toId(callId),
      },
    });
  },

  notifyMissedCall(args) {
    fireAndForget(this.sendMissedCallPush(args), 'Missed call');
  },

  async sendRideRequestPush({ driverId, passengerId, passengerName, rideId, requestId }) {
    if (!driverId || toId(driverId) === toId(passengerId)) return;

    await this.sendPushToUser(driverId, {
      title: 'New ride join request',
      body: `${cleanText(passengerName || 'A passenger', 50)} requested to join your ride.`,
      url: `/rides/${toId(rideId)}`,
      tag: `ride-request:${toId(requestId)}`,
      data: {
        type: 'ride_join_request',
        rideId: toId(rideId),
        requestId: toId(requestId),
      },
    });
  },

  notifyRideRequest(args) {
    fireAndForget(this.sendRideRequestPush(args), 'Ride request');
  },

  async sendRideDecisionPush({ passengerId, driverId, status, rideId, requestId }) {
    if (!passengerId || toId(passengerId) === toId(driverId)) return;
    const accepted = status === 'accepted';

    await this.sendPushToUser(passengerId, {
      title: accepted ? 'Ride request accepted' : 'Ride request rejected',
      body: accepted
        ? 'Your ride request was accepted. Tap to view trip details.'
        : 'Your ride request was rejected. Tap to view trip details.',
      url: `/rides/${toId(rideId)}`,
      tag: `ride-request:${toId(requestId)}`,
      data: {
        type: accepted ? 'ride_request_accepted' : 'ride_request_rejected',
        rideId: toId(rideId),
        requestId: toId(requestId),
      },
    });
  },

  notifyRideDecision(args) {
    fireAndForget(this.sendRideDecisionPush(args), 'Ride decision');
  },
};

export default notificationService;
