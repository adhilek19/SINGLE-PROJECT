import { Review } from '../models/Review.js';
import { rideService } from '../services/rideService.js';
import { successResponse } from '../utils/apiResponse.js';

export const createReview = async (req, res, next) => {
  try {
    const { rideId, revieweeId, rating, comment } = req.body;
    const review = await rideService.createRideReview(rideId, req.userId, {
      revieweeId,
      rating,
      comment,
    });

    return successResponse(res, 201, 'Review submitted successfully', review);
  } catch (err) {
    next(err);
  }
};

export const getUserReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ reviewee: req.params.userId })
      .populate('reviewer', 'name profilePic')
      .sort('-createdAt');
    return successResponse(res, 200, 'Reviews retrieved successfully', reviews);
  } catch (err) {
    next(err);
  }
};
