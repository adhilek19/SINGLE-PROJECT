import Joi from 'joi';

const password = Joi.string()
  .min(8)
  .max(72)
  .pattern(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters',
    'string.max': 'Password must not exceed 72 characters',
    'string.pattern.base':
      'Password must contain 1 uppercase, 1 number, 1 special character',
  });

const email = Joi.string().email().lowercase().trim().required();

const otp = Joi.string()
  .pattern(/^\d{4,6}$/)
  .required()
  .messages({
    'string.pattern.base': 'OTP must be a 4 to 6-digit number',
  });

const currentLocationSchema = Joi.object({
  name: Joi.string().trim().allow('').default('Current location'),
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
}).required();

export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).trim().required(),
  email,
  password,
});

export const loginSchema = Joi.object({
  email,
  password: Joi.string().required(),
  currentLocation: currentLocationSchema.optional(),
});

export const emailSchema = Joi.object({
  email,
});

export const verifyOtpSchema = Joi.object({
  email,
  otp,
});

export const forgotPasswordSchema = emailSchema;

export const resetPasswordSchema = Joi.object({
  email,
  otp,
  password,
});

const locationSchema = Joi.object({
  name: Joi.string().trim().required(),
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
}).required();

const vehicleSchema = Joi.object({
  type: Joi.string().valid('bike', 'car', 'auto', 'van').required(),
  brand: Joi.string().trim().optional(),
  model: Joi.string().trim().optional(),
  number: Joi.string().trim().uppercase().allow('').optional(),
  image: Joi.string().uri().allow('').optional(),
  verified: Joi.boolean().optional(),
}).required();


const ridePreferenceSchema = Joi.object({
  womenOnly: Joi.boolean().optional(),
  verifiedOnly: Joi.boolean().optional(),
  hidePhoneNumber: Joi.boolean().optional(),
  requireRideShare: Joi.boolean().optional(),
  smokingAllowed: Joi.boolean().optional(),
  musicAllowed: Joi.boolean().optional(),
  petsAllowed: Joi.boolean().optional(),
  luggageSpace: Joi.boolean().optional(),
  acAvailable: Joi.boolean().optional(),
  conversationLevel: Joi.string().valid('quiet', 'normal', 'talkative').optional(),
  genderPreference: Joi.string().valid('any', 'male', 'female').optional(),
}).optional();

export const createRideSchema = Joi.object({
  source: locationSchema,
  destination: locationSchema,
  departureTime: Joi.date().iso().required(),
  duration: Joi.number().integer().min(1).optional(),
  seatsAvailable: Joi.number().integer().min(1).max(50).required(),
  price: Joi.number().min(0).required(),
  description: Joi.string().trim().max(500).allow('').default(''),
  vehicle: vehicleSchema,
  preferences: ridePreferenceSchema,
});

export const updateRideSchema = Joi.object({
  source: locationSchema.optional(),
  destination: locationSchema.optional(),
  departureTime: Joi.date().iso().optional(),
  duration: Joi.number().integer().min(1).optional(),
  seatsAvailable: Joi.number().integer().min(1).max(50).optional(),
  price: Joi.number().min(0).optional(),
  description: Joi.string().trim().max(500).allow('').optional(),
  vehicle: vehicleSchema.optional(),
  preferences: ridePreferenceSchema,
}).min(1);

export const cancelRideSchema = Joi.object({
  reason: Joi.string().trim().min(3).max(500).required(),
});

export const ratePassengerSchema = Joi.object({
  passengerId: Joi.string().trim().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().trim().max(500).allow('').optional(),
});

export const updateRideStatusSchema = Joi.object({
  status: Joi.string().valid('started', 'ended', 'completed').required(),
  startPin: Joi.string().pattern(/^\d{4}$/).optional(),
});

export const rideReviewSchema = Joi.object({
  revieweeId: Joi.string().trim().optional(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().trim().max(500).allow('').optional(),
});

export const rideReportSchema = Joi.object({
  reportedUserId: Joi.string().trim().optional(),
  reason: Joi.string().trim().min(3).max(300).required(),
  description: Joi.string().trim().min(5).max(1000).required(),
});

export const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50).trim().optional(),
  phone: Joi.string().trim().allow('').optional(),
  bio: Joi.string().trim().max(300).allow('').optional(),
  profilePic: Joi.string().uri().allow('').optional(),
  currentLocation: currentLocationSchema.optional(),
  vehicle: Joi.object({
    type: Joi.string().valid('bike', 'car', 'auto', 'van').allow('').optional(),
    number: Joi.string().trim().uppercase().allow('').optional(),
    model: Joi.string().trim().allow('').optional(),
    image: Joi.string().uri().allow('').optional(),
  }).optional(),
  trustedContact: Joi.object({
    name: Joi.string().trim().allow('').optional(),
    phone: Joi.string().trim().allow('').optional(),
    relationship: Joi.string().trim().allow('').optional(),
  }).optional(),
  verification: Joi.object({
    phone: Joi.boolean().optional(),
    id: Joi.boolean().optional(),
    profilePhoto: Joi.boolean().optional(),
    vehicle: Joi.boolean().optional(),
  }).optional(),
  safetyPreferences: Joi.object({
    womenOnlyRides: Joi.boolean().optional(),
    verifiedOnlyRides: Joi.boolean().optional(),
    hidePhoneNumber: Joi.boolean().optional(),
    requireRideShare: Joi.boolean().optional(),
  }).optional(),
}).min(1);

export const updateLocationSchema = Joi.object({
  lat: Joi.number().required().min(-90).max(90).messages({
    'any.required': 'lat is required',
    'number.base': 'lat must be a number',
    'number.min': 'lat must be >= -90',
    'number.max': 'lat must be <= 90',
  }),
  lng: Joi.number().required().min(-180).max(180).messages({
    'any.required': 'lng is required',
    'number.base': 'lng must be a number',
    'number.min': 'lng must be >= -180',
    'number.max': 'lng must be <= 180',
  }),
  accuracy: Joi.number().min(0).optional().messages({
    'number.base': 'accuracy must be a number',
    'number.min': 'accuracy must be >= 0',
  }),
  heading: Joi.number().min(0).max(360).optional().messages({
    'number.base': 'heading must be a number',
    'number.min': 'heading must be >= 0',
    'number.max': 'heading must be <= 360',
  }),
  speed: Joi.number().min(0).optional().messages({
    'number.base': 'speed must be a number',
    'number.min': 'speed must be >= 0',
  }),
});
