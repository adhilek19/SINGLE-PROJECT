import webPush from 'web-push';
import mongoose from 'mongoose';
import PushSubscription from '../models/PushSubscription.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import RideRequest from '../models/RideRequest.js';
import Ride from '../models/Ride.js';
import { env } from '../config/env.js';
import { BadRequest } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { getSocketIO } from '../socket/socketEmitter.js';
import { chatRoomName, toId, userRoomName } from './chatAccessService.js';
import { redis } from '../utils/redis.js';
import { emailWorkflowService } from './emailWorkflowService.js';

webPush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

const MAX_TITLE_LENGTH = 90;
const MAX_BODY_LENGTH = 180;
const isDev = env.NODE_ENV !== 'production';

const cleanText = (value, maxLength) =>
  String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const debugPushLog = (message, meta = {}) => {
  if (!isDev) return;
  logger.info(`[push] ${message} ${JSON.stringify(meta)}`);
};

const safePath = (value) => {
  const path = String(value || '').trim();
  if (/^\/(chats|rides|notifications|profile|admin)\/?[A-Za-z0-9:_-]*$/.test(path)) return path;
  if (path === '/') return '/';
  return '/';
};

const sanitizeData = (data = {}) => {
  const safe = {};
  [
    'chatId',
    'rideId',
    'requestId',
    'callId',
    'type',
    'notificationId',
    'entityId',
    'entityType',
    'url',
  ].forEach((key) => {
    const value = cleanText(data[key], 180);
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

  return { endpoint, keys: { p256dh, auth } };
};

const endpointPrefix = (endpoint = '') => cleanText(endpoint, 2048).slice(0, 120);

const isExpiredOrInvalidSubscription = (err) => {
  const statusCode = Number(err?.statusCode || err?.status);
  return [400, 404, 410].includes(statusCode);
};

const safeObjectId = (value) => {
  const raw = toId(value) || String(value || '');
  return mongoose.Types.ObjectId.isValid(raw) ? raw : '';
};

const serializeNotification = (doc) => {
  if (!doc) return null;
  const raw = doc.toObject ? doc.toObject() : { ...doc };
  return {
    _id: toId(raw._id),
    sender: raw.sender
      ? {
          _id: toId(raw.sender?._id || raw.sender),
          name: raw.sender?.name || '',
          profilePic: raw.sender?.profilePic || '',
          selectedAvatar: raw.sender?.selectedAvatar || '',
          profileImage: raw.sender?.profileImage || { url: '' },
        }
      : null,
    receiver: toId(raw.receiver),
    type: raw.type || '',
    title: raw.title || '',
    body: raw.body || '',
    entityId: raw.entityId || '',
    entityType: raw.entityType || '',
    url: raw.url || '/',
    isRead: Boolean(raw.isRead),
    deliveredAt: raw.deliveredAt || null,
    readAt: raw.readAt || null,
    metadata: raw.metadata || {},
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
};

const emitUnreadCount = async (receiverId) => {
  const io = getSocketIO();
  const safeReceiverId = toId(receiverId);
  if (!io || !safeReceiverId) return;
  const unreadCount = await Notification.countDocuments({
    receiver: safeReceiverId,
    isRead: false,
  });
  io.to(userRoomName(safeReceiverId)).emit('unread:count', {
    unreadCount,
    at: new Date().toISOString(),
  });
};

const emitNotification = ({ receiverId, notification, event = 'notification:new' }) => {
  const io = getSocketIO();
  const safeReceiverId = toId(receiverId);
  if (!io || !safeReceiverId || !notification) return;
  const payload = {
    notification,
    unreadCount: undefined,
    at: new Date().toISOString(),
  };

  io.to(userRoomName(safeReceiverId)).emit('notification:new', payload);
  if (event && event !== 'notification:new') {
    io.to(userRoomName(safeReceiverId)).emit(event, payload);
  }
};

const isUserOnline = async (userId) => {
  const io = getSocketIO();
  const safeUserId = toId(userId);
  if (!io || !safeUserId) return false;
  const sockets = await io.in(userRoomName(safeUserId)).fetchSockets();
  return sockets.length > 0;
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

const shouldThrottle = async ({ key, ttlSeconds }) => {
  if (!key || redis.status !== 'ready') return false;
  try {
    const result = await redis.set(key, '1', 'EX', Math.max(1, Number(ttlSeconds || 60)), 'NX');
    return result !== 'OK';
  } catch {
    return false;
  }
};

const createNotificationRecord = async ({
  sender = null,
  receiver,
  type,
  title,
  body,
  entityId = '',
  entityType = '',
  url = '/',
  metadata = {},
  dedupeKey = '',
}) => {
  const safeReceiverId = safeObjectId(receiver);
  if (!safeReceiverId) return null;
  const payload = {
    sender: safeObjectId(sender) || null,
    receiver: safeReceiverId,
    type: cleanText(type, 80),
    title: cleanText(title, 120),
    body: cleanText(body, 300),
    entityId: cleanText(entityId, 120),
    entityType: cleanText(entityType, 80),
    url: safePath(url),
    metadata,
    dedupeKey: cleanText(dedupeKey, 220),
    deliveredAt: new Date(),
  };

  if (payload.dedupeKey) {
    const existing = await Notification.findOneAndUpdate(
      { receiver: safeReceiverId, dedupeKey: payload.dedupeKey },
      { $set: { ...payload, updatedAt: new Date() } },
      { new: true }
    );
    if (existing) return existing;
  }

  return Notification.create(payload);
};

const fireAndForget = (promise, label) => {
  Promise.resolve(promise).catch((err) => {
    debugPushLog('dispatch error', {
      reason: 'dispatch_failed',
      label,
      error: err?.message || 'unknown_error',
    });
    logger.warn(`${label} notification dispatch failed: ${err.message}`);
  });
};

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
      return cleanText(message?.text || 'sent you a message.', 120) || 'sent you a message.';
  }
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
      $setOnInsert: { createdAt: now },
    };

    try {
      return await PushSubscription.findOneAndUpdate({ endpoint: normalized.endpoint }, update, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      return PushSubscription.findOneAndUpdate({ endpoint: normalized.endpoint }, update, {
        new: true,
      });
    }
  },

  async removeSubscription({ userId, endpoint }) {
    const safeEndpoint = cleanText(endpoint, 2048);
    if (!safeEndpoint) return { deletedCount: 0 };
    return PushSubscription.deleteMany({ user: userId, endpoint: safeEndpoint });
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
            { endpoint: subscription.endpoint, keys: subscription.keys },
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
          debugPushLog('push error', {
            userId: safeUserId,
            statusCode: Number(err?.statusCode || err?.status || 0),
            endpoint: endpointPrefix(subscription.endpoint),
            type: payload?.data?.type || payload?.tag || 'unknown',
          });
        }
      })
    );
    return { sent, removed };
  },

  async getNotifications({ userId, page = 1, limit = 20 }) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit || 20)));
    const safePage = Math.max(1, Number(page || 1));
    const skip = (safePage - 1) * safeLimit;
    const [items, total] = await Promise.all([
      Notification.find({ receiver: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate('sender', 'name profilePic selectedAvatar profileImage'),
      Notification.countDocuments({ receiver: userId }),
    ]);

    return {
      notifications: items.map(serializeNotification),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  },

  async getUnreadCount(userId) {
    const unreadCount = await Notification.countDocuments({
      receiver: userId,
      isRead: false,
    });
    return { unreadCount };
  },

  async markAsRead({ userId, notificationId }) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, receiver: userId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    ).populate('sender', 'name profilePic selectedAvatar profileImage');

    if (!notification) {
      throw BadRequest('Notification not found');
    }

    const serialized = serializeNotification(notification);
    const io = getSocketIO();
    const safeUserId = toId(userId);
    if (io && safeUserId) {
      io.to(userRoomName(safeUserId)).emit('notification:read', {
        notificationId: serialized._id,
        at: new Date().toISOString(),
      });
    }
    await emitUnreadCount(userId);
    return serialized;
  },

  async markAllAsRead({ userId }) {
    await Notification.updateMany(
      { receiver: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    const io = getSocketIO();
    const safeUserId = toId(userId);
    if (io && safeUserId) {
      io.to(userRoomName(safeUserId)).emit('notification:read', {
        all: true,
        at: new Date().toISOString(),
      });
    }
    await emitUnreadCount(userId);
    return { ok: true };
  },

  async sendChatMessagePush({ receiverId, senderId, chatId, rideId, message }) {
    if (!receiverId || toId(receiverId) === toId(senderId)) return;
    if (await isUserFocusedInChat({ userId: receiverId, chatId })) return;

    const senderName = cleanText(message?.sender?.name || message?.senderName || 'Someone', 50);
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

  async notifyChatMessage({
    receiverId,
    senderId,
    chatId,
    rideId,
    message,
    receiverEmail = '',
  }) {
    const safeReceiverId = toId(receiverId);
    const safeSenderId = toId(senderId);
    if (!safeReceiverId || safeReceiverId === safeSenderId) return;

    const dedupeKey = `chat:${toId(chatId)}:msg:${toId(message?._id) || cleanText(message?.clientMessageId, 60)}`;
    const title = `New message from ${cleanText(message?.sender?.name || 'Someone', 50)}`;
    const body = getMessageBody(message);
    const notification = await createNotificationRecord({
      sender: safeSenderId,
      receiver: safeReceiverId,
      type: 'chat_message',
      title,
      body,
      entityId: toId(chatId),
      entityType: 'chat',
      url: `/chats/${toId(chatId)}`,
      metadata: {
        rideId: toId(rideId),
        messageId: toId(message?._id),
      },
      dedupeKey,
    });

    const serialized = serializeNotification(notification);
    emitNotification({
      receiverId: safeReceiverId,
      notification: serialized,
      event: 'message:new',
    });
    await emitUnreadCount(safeReceiverId);
    await this.sendChatMessagePush({ receiverId, senderId, chatId, rideId, message });

    const online = await isUserOnline(safeReceiverId);
    const safeReceiverEmail =
      receiverEmail ||
      (await User.findById(safeReceiverId).select('email').then((user) => user?.email || ''));
    if (!online && safeReceiverEmail) {
      const throttleKey = `email:fallback:chat:${safeReceiverId}:${toId(chatId)}`;
      const throttled = await shouldThrottle({
        key: throttleKey,
        ttlSeconds: Number(env.NOTIFICATION_EMAIL_FALLBACK_MINUTES || 15) * 60,
      });
      if (!throttled) {
        emailWorkflowService.enqueue({
          template: 'chatFallback',
          to: safeReceiverEmail,
          payload: {
            senderName: message?.sender?.name || 'Someone',
            preview: message?.text || body,
            chatUrl: `${env.CLIENT_URL}/chats/${toId(chatId)}`,
          },
          dedupeKey: `chat-fallback:${toId(message?._id)}`,
        });
      }
    }
  },

  async notifyRideRequest({
    driverId,
    passengerId,
    passengerName,
    rideId,
    requestId,
    driverEmail = '',
  }) {
    const safeDriverId = toId(driverId);
    if (!safeDriverId) return;
    const title = `New ride request received from ${cleanText(passengerName || 'a passenger', 50)}`;
    const body = 'Review and respond to this request now.';

    const notification = await createNotificationRecord({
      sender: passengerId,
      receiver: safeDriverId,
      type: 'ride_request_new',
      title,
      body,
      entityId: toId(requestId) || toId(rideId),
      entityType: 'ride_request',
      url: `/rides/${toId(rideId)}`,
      metadata: {
        requestId: toId(requestId),
        rideId: toId(rideId),
      },
      dedupeKey: `ride-request:new:${toId(requestId)}`,
    });

    const serialized = serializeNotification(notification);
    emitNotification({
      receiverId: safeDriverId,
      notification: serialized,
      event: 'request:new',
    });
    await emitUnreadCount(safeDriverId);

    await this.sendPushToUser(safeDriverId, {
      title: 'New ride request',
      body: `${cleanText(passengerName || 'A passenger', 50)} requested to join your ride.`,
      url: `/rides/${toId(rideId)}`,
      tag: `ride-request:${toId(requestId)}`,
      data: {
        type: 'ride_join_request',
        rideId: toId(rideId),
        requestId: toId(requestId),
      },
    });

    if (driverEmail) {
      const rideDoc = await Ride.findById(rideId).select('source destination departureTime');
      emailWorkflowService.enqueue({
        template: 'rideRequestReceived',
        to: driverEmail,
        payload: {
          passengerName,
          rideRoute: `${rideDoc?.source?.name || 'Source'} -> ${rideDoc?.destination?.name || 'Destination'}`,
          rideTime: rideDoc?.departureTime ? new Date(rideDoc.departureTime).toLocaleString() : 'TBA',
          rideUrl: `${env.CLIENT_URL}/rides/${toId(rideId)}`,
        },
        dedupeKey: `ride-request-received:${toId(requestId)}`,
      });
    }
  },

  async notifyRideDecision({
    passengerId,
    driverId,
    status,
    rideId,
    requestId,
    passengerEmail = '',
  }) {
    const safePassengerId = toId(passengerId);
    if (!safePassengerId) return;
    const accepted = status === 'accepted';

    const notification = await createNotificationRecord({
      sender: driverId,
      receiver: safePassengerId,
      type: accepted ? 'ride_request_accepted' : 'ride_request_rejected',
      title: accepted ? 'Your ride request was accepted' : 'Your ride request was rejected',
      body: accepted
        ? 'Open ride details to see driver and pickup information.'
        : 'The driver rejected your request. You can explore other rides.',
      entityId: toId(requestId) || toId(rideId),
      entityType: 'ride_request',
      url: `/rides/${toId(rideId)}`,
      metadata: {
        requestId: toId(requestId),
        rideId: toId(rideId),
        status: accepted ? 'accepted' : 'rejected',
      },
      dedupeKey: `ride-request:${accepted ? 'accepted' : 'rejected'}:${toId(requestId)}`,
    });

    const serialized = serializeNotification(notification);
    emitNotification({
      receiverId: safePassengerId,
      notification: serialized,
      event: accepted ? 'request:accepted' : 'request:rejected',
    });
    await emitUnreadCount(safePassengerId);

    await this.sendPushToUser(safePassengerId, {
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

    if (accepted && passengerEmail) {
      const [rideDoc, requestDoc, driverDoc] = await Promise.all([
        Ride.findById(rideId).select('source destination departureTime'),
        RideRequest.findById(requestId).select('pickupLocation'),
        User.findById(driverId).select('name'),
      ]);
      emailWorkflowService.enqueue({
        template: 'rideRequestAccepted',
        to: passengerEmail,
        payload: {
          driverName: driverDoc?.name || 'Driver',
          rideRoute: `${rideDoc?.source?.name || 'Source'} -> ${rideDoc?.destination?.name || 'Destination'}`,
          rideTime: rideDoc?.departureTime ? new Date(rideDoc.departureTime).toLocaleString() : 'TBA',
          pickupLocation: requestDoc?.pickupLocation?.name || 'Check ride details',
          rideUrl: `${env.CLIENT_URL}/rides/${toId(rideId)}`,
        },
        dedupeKey: `ride-request-accepted-email:${toId(requestId)}`,
      });
    }
  },

  async notifyRideCompleted({ rideId, riderIds = [] }) {
    const targets = Array.from(new Set((riderIds || []).map((id) => toId(id)).filter(Boolean)));
    if (!targets.length) return;
    const rideDoc = await Ride.findById(rideId).select('source destination updatedAt');
    const routeLabel = `${rideDoc?.source?.name || 'Source'} -> ${rideDoc?.destination?.name || 'Destination'}`;
    const completedLabel = rideDoc?.updatedAt ? new Date(rideDoc.updatedAt).toLocaleString() : new Date().toLocaleString();

    await Promise.all(
      targets.map(async (targetId) => {
        const notification = await createNotificationRecord({
          sender: null,
          receiver: targetId,
          type: 'ride_completed',
          title: 'Thank you for riding with SahaYatri',
          body: 'Your ride has completed. Find nearby rides again anytime.',
          entityId: toId(rideId),
          entityType: 'ride',
          url: '/find-ride',
          metadata: { rideId: toId(rideId) },
          dedupeKey: `ride-completed:${toId(rideId)}:${targetId}`,
        });
        emitNotification({ receiverId: targetId, notification: serializeNotification(notification) });
        await emitUnreadCount(targetId);

        const user = await User.findById(targetId).select('email');
        if (user?.email) {
          emailWorkflowService.enqueue({
            template: 'rideCompleted',
            to: user.email,
            payload: {
              rideRoute: routeLabel,
              rideTime: completedLabel,
              ridesUrl: `${env.CLIENT_URL}/find-ride`,
            },
            dedupeKey: `ride-completed-email:${toId(rideId)}:${targetId}`,
          });
        }
      })
    );
  },

  async notifyUserBlocked({ userId, reason = '' }) {
    const safeUserId = toId(userId);
    if (!safeUserId) return;
    const user = await User.findById(safeUserId).select('email');
    if (!user?.email) return;
    emailWorkflowService.enqueue({
      template: 'userBlocked',
      to: user.email,
      payload: {
        reason,
        supportUrl: `${env.CLIENT_URL}/profile`,
      },
      dedupeKey: `user-blocked:${safeUserId}:${Date.now()}`,
    });
  },

  notifyIncomingCall(args) {
    fireAndForget(
      this.sendPushToUser(args?.calleeId, {
        title: 'Incoming audio call',
        body: `${cleanText(args?.callerName || 'Someone', 50)} is calling you.`,
        url: `/chats/${toId(args?.chatId)}`,
        tag: `call:${toId(args?.callId) || toId(args?.chatId)}`,
        data: {
          type: 'incoming_call',
          chatId: toId(args?.chatId),
          rideId: toId(args?.rideId),
          callId: toId(args?.callId),
        },
      }),
      'Incoming call'
    );
  },

  notifyMissedCall(args) {
    fireAndForget(
      this.sendPushToUser(args?.calleeId, {
        title: 'Missed audio call',
        body: `You missed a call from ${cleanText(args?.callerName || 'someone', 50)}.`,
        url: `/chats/${toId(args?.chatId)}`,
        tag: `call:${toId(args?.callId) || toId(args?.chatId)}`,
        data: {
          type: 'missed_call',
          chatId: toId(args?.chatId),
          rideId: toId(args?.rideId),
          callId: toId(args?.callId),
        },
      }),
      'Missed call'
    );
  },

  notifyRideStarted({ rideId, passengerIds = [] }) {
    fireAndForget(
      Promise.all(
        (passengerIds || []).map((passengerId) =>
          this.sendPushToUser(passengerId, {
            title: 'Ride started',
            body: 'Your ride is now live. Open ride details for tracking.',
            url: `/rides/${toId(rideId)}`,
            tag: `ride-started:${toId(rideId)}`,
            data: { type: 'ride_started', rideId: toId(rideId) },
          })
        )
      ),
      'Ride started'
    );
  },

  notifyPassengerVerified({ passengerId, rideId, requestId }) {
    fireAndForget(
      this.sendPushToUser(passengerId, {
        title: 'Boarding verified',
        body: 'Driver verified your boarding OTP. You are ready for ride start.',
        url: `/rides/${toId(rideId)}`,
        tag: `ride-boarding:${toId(requestId) || toId(rideId)}`,
        data: {
          type: 'passenger_verified',
          rideId: toId(rideId),
          requestId: toId(requestId),
        },
      }),
      'Passenger verified'
    );
  },

  notifyRideTrackingEnabled({ rideId, passengerIds = [] }) {
    fireAndForget(
      Promise.all(
        (passengerIds || []).map((passengerId) =>
          this.sendPushToUser(passengerId, {
            title: 'Live tracking enabled',
            body: 'Ride tracking is active. Open ride details to view live location.',
            url: `/rides/${toId(rideId)}`,
            tag: `ride-tracking:${toId(rideId)}`,
            data: { type: 'ride_tracking_enabled', rideId: toId(rideId) },
          })
        )
      ),
      'Ride tracking enabled'
    );
  },
};

export default notificationService;
