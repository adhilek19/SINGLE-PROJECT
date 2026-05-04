import { Router } from 'express';
import { protect } from '../middleware/protect.js';
import * as rideRequestController from '../controller/rideRequestController.js';

const router = Router();

router.get('/ride-requests', protect, rideRequestController.getMyRideRequests);

export default router;
