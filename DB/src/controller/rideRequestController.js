import { successResponse } from '../utils/apiResponse.js';
import { rideRequestService } from '../services/rideRequestService.js';
import {
  emitRideJoinAccepted,
  emitRideJoinRejected,
  emitRideJoinRequested,
  emitRideUpdated,
} from '../socket/rideEvents.js';
import { notificationService } from '../services/notificationService.js';

export const createRideRequest = async (req, res, next) => {
  try {
    const result = await rideRequestService.createRequest(
      req.params.rideId,
      req.userId,
      req.body
    );
    emitRideJoinRequested(result?.request);
    notificationService.notifyRideRequest({
      driverId: result?.request?.driver,
      passengerId: result?.request?.passenger,
      passengerName: result?.request?.passenger?.name,
      rideId: result?.request?.ride,
      requestId: result?.request?._id,
    });

    return successResponse(res, 201, 'Ride request created', result);
  } catch (err) {
    next(err);
  }
};

export const getRideRequests = async (req, res, next) => {
  try {
    const requests = await rideRequestService.getRideRequests(
      req.params.rideId,
      req.userId
    );

    return successResponse(res, 200, 'Ride requests fetched', {
      requests,
      count: requests.length,
    });
  } catch (err) {
    next(err);
  }
};

export const getMyRideRequests = async (req, res, next) => {
  try {
    const requests = await rideRequestService.getMyRequests(req.userId);
    return successResponse(res, 200, 'My ride requests fetched', {
      requests,
      count: requests.length,
    });
  } catch (err) {
    next(err);
  }
};

export const acceptRideRequest = async (req, res, next) => {
  try {
    const request = await rideRequestService.acceptRequest(
      req.params.requestId,
      req.userId
    );
    emitRideJoinAccepted(request);
    notificationService.notifyRideDecision({
      passengerId: request?.passenger,
      driverId: request?.driver,
      status: 'accepted',
      rideId: request?.ride,
      requestId: request?._id,
    });

    return successResponse(res, 200, 'Ride request accepted', { request });
  } catch (err) {
    next(err);
  }
};

export const rejectRideRequest = async (req, res, next) => {
  try {
    const request = await rideRequestService.rejectRequest(
      req.params.requestId,
      req.userId
    );
    emitRideJoinRejected(request);
    notificationService.notifyRideDecision({
      passengerId: request?.passenger,
      driverId: request?.driver,
      status: 'rejected',
      rideId: request?.ride,
      requestId: request?._id,
    });

    return successResponse(res, 200, 'Ride request rejected', { request });
  } catch (err) {
    next(err);
  }
};

export const cancelRideRequest = async (req, res, next) => {
  try {
    const request = await rideRequestService.cancelRequest(
      req.params.requestId,
      req.userId
    );
    emitRideJoinRejected(request);

    return successResponse(res, 200, 'Ride request cancelled', { request });
  } catch (err) {
    next(err);
  }
};


export const confirmPickup = async (req, res, next) => {
  try {
    const request = await rideRequestService.confirmPickup(
      req.params.requestId,
      req.userId,
      req.body
    );
    emitRideUpdated(request?.ride);

    return successResponse(res, 200, 'Pickup location confirmed', { request });
  } catch (err) {
    next(err);
  }
};

export const markNoShow = async (req, res, next) => {
  try {
    const request = await rideRequestService.markNoShow(
      req.params.requestId,
      req.userId,
      req.body.reason
    );
    emitRideUpdated(request?.ride);

    return successResponse(res, 200, 'No-show marked', { request });
  } catch (err) {
    next(err);
  }
};
