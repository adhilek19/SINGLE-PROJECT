import User from '../models/User.js';

const PUBLIC_PROFILE_FIELDS =
  'name profilePic bio rating rideCount isVerified verification safetyPreferences trustedContact vehicle.type vehicle.model vehicle.number vehicle.image currentLocation createdAt';

export const userRepository = {
  findPublicByEmail: (email) => User.findOne({ email }),

  findAuthByEmail: (email) => User.findOne({ email }).select('+password'),

  findById: (id) => User.findById(id),

  findPublicById: (id) => User.findById(id).select(PUBLIC_PROFILE_FIELDS),

  findByGoogleId: (googleId) => User.findOne({ googleId }),

  create: (data) => User.create(data),

  save: (user) => user.save(),

  updateById: (id, data) =>
    User.findByIdAndUpdate(id, data, {
      returnDocument: 'after',
      runValidators: true,
    }),

  addBlockedUser: (userId, blockedUserId) =>
    User.findByIdAndUpdate(
      userId,
      { $addToSet: { blockedUsers: blockedUserId } },
      { returnDocument: 'after', runValidators: true }
    ).select('-password'),

  removeBlockedUser: (userId, blockedUserId) =>
    User.findByIdAndUpdate(
      userId,
      { $pull: { blockedUsers: blockedUserId } },
      { returnDocument: 'after', runValidators: true }
    ).select('-password'),

  getBlockedUserIds: async (userId) => {
    const user = await User.findById(userId).select('blockedUsers');
    return user?.blockedUsers || [];
  },
};