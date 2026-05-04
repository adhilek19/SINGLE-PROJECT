import { rideService } from '../services/rideService.js';
import { successResponse } from '../utils/apiResponse.js';

export const createReport = async (req, res, next) => {
  try {
    const { rideId, reportedUserId, reason, description } = req.body;
    const report = await rideService.createRideReport(rideId, req.userId, {
      reportedUserId,
      reason,
      description,
    });

    return successResponse(res, 201, 'Report submitted successfully', report);
  } catch (err) {
    next(err);
  }
};
