import { successResponse } from '../utils/apiResponse.js';
import { notificationService } from '../services/notificationService.js';

export const getVapidPublicKey = async (_req, res) => {
  return successResponse(res, 200, 'VAPID public key fetched', {
    publicKey: notificationService.getVapidPublicKey(),
  });
};

export const subscribe = async (req, res, next) => {
  try {
    await notificationService.saveSubscription({
      userId: req.userId,
      subscription: req.body?.subscription || req.body,
      userAgent: req.get('user-agent') || '',
    });

    return successResponse(res, 201, 'Push subscription saved');
  } catch (err) {
    next(err);
  }
};

export const unsubscribe = async (req, res, next) => {
  try {
    const endpoint =
      req.body?.endpoint ||
      req.body?.subscription?.endpoint ||
      req.query?.endpoint ||
      '';

    await notificationService.removeSubscription({
      userId: req.userId,
      endpoint,
    });

    return successResponse(res, 200, 'Push subscription removed');
  } catch (err) {
    next(err);
  }
};

export const listNotifications = async (req, res, next) => {
  try {
    const data = await notificationService.getNotifications({
      userId: req.userId,
      page: req.query.page,
      limit: req.query.limit,
    });
    return successResponse(res, 200, 'Notifications fetched', data);
  } catch (err) {
    next(err);
  }
};

export const unreadCount = async (req, res, next) => {
  try {
    const data = await notificationService.getUnreadCount(req.userId);
    return successResponse(res, 200, 'Unread count fetched', data);
  } catch (err) {
    next(err);
  }
};

export const markRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markAsRead({
      userId: req.userId,
      notificationId: req.params.id,
    });
    return successResponse(res, 200, 'Notification marked as read', { notification });
  } catch (err) {
    next(err);
  }
};

export const markAllRead = async (req, res, next) => {
  try {
    await notificationService.markAllAsRead({ userId: req.userId });
    return successResponse(res, 200, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
};
