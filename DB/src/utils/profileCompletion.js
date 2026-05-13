import { getDefaultAvatarUrl } from './defaultAvatars.js';

export const resolveProfileImageUrl = (user = {}) => {
  const uploadedUrl = String(user?.profileImage?.url || '').trim();
  if (uploadedUrl) return uploadedUrl;

  const legacyProfile = String(user?.profilePic || '').trim();
  if (legacyProfile && !legacyProfile.includes('dicebear.com/7.x/adventurer/svg?seed=')) {
    return legacyProfile;
  }

  return getDefaultAvatarUrl(user?.selectedAvatar);
};

export const computeProfileCompletion = (user = {}) => {
  const requiredChecks = [
    Boolean(String(user?.name || '').trim()),
    Boolean(String(user?.phone || '').trim()),
    Boolean(resolveProfileImageUrl(user)),
  ];

  const completed = requiredChecks.filter(Boolean).length;
  const percentage = Math.round((completed / requiredChecks.length) * 100);

  return {
    isProfileCompleted: completed === requiredChecks.length,
    profileCompletionPercentage: percentage,
  };
};

export const sanitizeVerificationDocuments = (documents = {}) => {
  const sanitize = (doc) => {
    if (!doc || !doc.url) {
      return {
        url: '',
        type: '',
        mimeType: '',
        uploadedAt: null,
        status: 'pending',
        rejectionReason: '',
      };
    }

    return {
      url: String(doc.url || ''),
      type: String(doc.type || ''),
      mimeType: String(doc.mimeType || ''),
      uploadedAt: doc.uploadedAt || null,
      status: String(doc.status || 'pending'),
      rejectionReason: String(doc.rejectionReason || ''),
    };
  };

  return {
    idProof: sanitize(documents?.idProof),
    drivingLicense: sanitize(documents?.drivingLicense),
    vehicleDocument: sanitize(documents?.vehicleDocument),
  };
};

export const normalizeVehicleForClient = (vehicle = {}) => ({
  type: String(vehicle?.type || ''),
  brand: String(vehicle?.brand || ''),
  model: String(vehicle?.model || ''),
  number: String(vehicle?.number || ''),
  seats:
    Number.isFinite(Number(vehicle?.seats)) && Number(vehicle?.seats) > 0
      ? Number(vehicle.seats)
      : null,
  image: String(vehicle?.image || ''),
});

export const normalizeUserForClient = (userDoc) => {
  if (!userDoc) return null;
  const user = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  const resolvedProfilePic = resolveProfileImageUrl(user);
  const completion = computeProfileCompletion(user);
  const location = user?.currentLocation || null;
  const currentLocation =
    location?.lat !== undefined && location?.lng !== undefined
      ? {
          name: location.name || 'Current location',
          lat: Number(location.lat),
          lng: Number(location.lng),
          updatedAt: location.updatedAt || null,
        }
      : Array.isArray(location?.coordinates) && location.coordinates.length >= 2
        ? {
            name: location.name || 'Current location',
            lat: Number(location.coordinates[1]),
            lng: Number(location.coordinates[0]),
            updatedAt: location.updatedAt || null,
          }
        : null;

  return {
    id: user?._id || user?.id,
    _id: user?._id || user?.id,
    name: String(user?.name || ''),
    email: String(user?.email || ''),
    phone: String(user?.phone || ''),
    bio: String(user?.bio || ''),
    role: String(user?.role || 'user'),
    rating: Number(user?.rating || 0),
    rideCount: Number(user?.rideCount || 0),
    isVerified: Boolean(user?.isVerified),
    trustedContact: user?.trustedContact || {},
    verification: user?.verification || {},
    safetyPreferences: user?.safetyPreferences || {},
    createdAt: user?.createdAt || null,
    updatedAt: user?.updatedAt || null,
    profilePic: resolvedProfilePic,
    selectedAvatar: String(user?.selectedAvatar || ''),
    profileImage: {
      url: String(user?.profileImage?.url || ''),
      uploadedAt: user?.profileImage?.uploadedAt || null,
    },
    verificationDocuments: sanitizeVerificationDocuments(user?.verificationDocuments),
    vehicle: normalizeVehicleForClient(user?.vehicle),
    currentLocation,
    isProfileCompleted: completion.isProfileCompleted,
    profileCompletionPercentage: completion.profileCompletionPercentage,
  };
};
