import { successResponse } from '../utils/apiResponse.js';
import { callService } from '../services/callService.js';

export const getIceServers = async (_req, res, next) => {
  try {
    const iceServers = callService.getIceServers();
    return successResponse(res, 200, 'ICE servers fetched', {
      iceServers,
    });
  } catch (err) {
    next(err);
  }
};
