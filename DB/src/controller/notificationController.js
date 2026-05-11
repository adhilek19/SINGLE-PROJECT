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
