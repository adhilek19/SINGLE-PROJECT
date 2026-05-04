import { Router } from 'express';
import { protect } from '../middleware/protect.js';
import * as rideRequestController from '../controller/rideRequestController.js';

const router = Router();

router.patch('/:requestId/accept', protect, rideRequestController.acceptRideRequest);
router.patch('/:requestId/reject', protect, rideRequestController.rejectRideRequest);
router.patch('/:requestId/cancel', protect, rideRequestController.cancelRideRequest);
router.patch('/:requestId/confirm-pickup', protect, rideRequestController.confirmPickup);
router.patch('/:requestId/no-show', protect, rideRequestController.markNoShow);

export default router;
