import { Router } from 'express';
import { protect } from '../middleware/protect.js';
import * as notificationController from '../controller/notificationController.js';

const router = Router();

router.get('/vapid-public-key', protect, notificationController.getVapidPublicKey);
router.post('/subscribe', protect, notificationController.subscribe);
router.delete('/unsubscribe', protect, notificationController.unsubscribe);
router.get('/', protect, notificationController.listNotifications);
router.get('/unread-count', protect, notificationController.unreadCount);
router.patch('/read-all', protect, notificationController.markAllRead);
router.patch('/:id/read', protect, notificationController.markRead);

export default router;
