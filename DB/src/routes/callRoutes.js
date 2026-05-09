import { Router } from 'express';
import { protect } from '../middleware/protect.js';
import * as callController from '../controller/callController.js';

const router = Router();

router.get('/ice-servers', protect, callController.getIceServers);

export default router;
