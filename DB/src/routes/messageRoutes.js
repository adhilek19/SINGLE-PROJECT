import { Router } from 'express';
import { protect } from '../middleware/protect.js';
import * as messageController from '../controller/messageController.js';
import { uploadChatMedia } from '../middleware/chatMediaUpload.js';

const router = Router();

router.post('/', protect, messageController.sendMessage);
router.post('/media', protect, uploadChatMedia, messageController.sendMediaMessage);
router.patch('/:messageId/seen', protect, messageController.markMessageSeen);
router.patch('/:messageId/reaction', protect, messageController.setMessageReaction);
router.delete('/:messageId', protect, messageController.softDeleteMessage);

export default router;
