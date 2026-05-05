import { Router } from 'express';
import * as rideController from '../controller/rideController.js';
import * as rideRequestController from '../controller/rideRequestController.js';
import { protect } from '../middleware/protect.js';
import { validate } from '../middleware/validate.js';
import {
  createRideSchema,
  updateRideSchema,
  cancelRideSchema,
  ratePassengerSchema,
  updateRideStatusSchema,
  rideReviewSchema,
  rideReportSchema,
} from '../utils/validators.js';
import { upload } from '../utils/cloudinary.js';

const router = Router();

router.get('/', rideController.listRides);
router.get('/search', rideController.searchRides);

router.post(
  '/',
  protect,
  upload.single('vehicleImage'),
  validate(createRideSchema),
  rideController.createRide
);
router.get('/user/me', protect, rideController.getUserRides);

// Public discovery: Find Ride page should work before login.
router.get('/nearby', rideController.getNearbyRides);
router.get('/track/:token', rideController.getPublicTracking);
// Public matching result; joining/requesting still needs login.
router.get('/match', rideController.getMatchedRides);

router.post('/:rideId/requests', protect, rideRequestController.createRideRequest);
router.get('/:rideId/requests', protect, rideRequestController.getRideRequests);
router.patch('/requests/:requestId/accept', protect, rideRequestController.acceptRideRequest);
router.patch('/requests/:requestId/reject', protect, rideRequestController.rejectRideRequest);
router.patch('/requests/:requestId/cancel', protect, rideRequestController.cancelRideRequest);
router.patch('/requests/:requestId/confirm-pickup', protect, rideRequestController.confirmPickup);
router.patch('/requests/:requestId/no-show', protect, rideRequestController.markNoShow);

router.get('/:id', rideController.getRideById);
router.put(
  '/:id',
  protect,
  upload.single('vehicleImage'),
  validate(updateRideSchema),
  rideController.updateRide
);
router.put('/:id/status', protect, validate(updateRideStatusSchema), rideController.updateRideStatus);
router.put('/:id/start', protect, rideController.startRide);
router.put('/:id/end', protect, rideController.endRide);
router.put('/:id/complete', protect, rideController.completeRide);
router.post('/:id/cancel', protect, validate(cancelRideSchema), rideController.cancelRide);
router.post('/:id/rate-passenger', protect, validate(ratePassengerSchema), rideController.ratePassenger);
router.post('/:id/review', protect, validate(rideReviewSchema), rideController.createRideReview);
router.post('/:id/report', protect, validate(rideReportSchema), rideController.createRideReport);
router.delete('/:id', protect, rideController.deleteRide);
router.post('/:id/join', protect, rideController.joinRide);
router.post('/:id/leave', protect, rideController.leaveRide);

export default router;
