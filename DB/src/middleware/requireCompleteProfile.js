import { Forbidden } from '../utils/AppError.js';
import { userRepository } from '../repositories/userRepository.js';
import { computeProfileCompletion } from '../utils/profileCompletion.js';

export const requireCompleteProfile = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.userId);
    if (!user) {
      return next(Forbidden('Complete your profile before posting rides.'));
    }

    const completion = computeProfileCompletion(user);
    if (!completion.isProfileCompleted) {
      return next(
        Forbidden(
          'Profile incomplete. Add name, phone, and profile image or avatar before posting rides.'
        )
      );
    }

    return next();
  } catch (err) {
    return next(err);
  }
};
