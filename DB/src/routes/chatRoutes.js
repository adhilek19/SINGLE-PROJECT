import { Router } from 'express';
import { protect } from '../middleware/protect.js';
import * as chatController from '../controller/chatController.js';

const router = Router();

router.post('/ride/:rideId/user/:userId', protect, chatController.createOrGetRideChat);
router.get('/', protect, chatController.getMyChats);
router.get('/:chatId/messages', protect, chatController.getChatMessages);

export default router;
