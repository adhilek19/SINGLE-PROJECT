import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const trustedContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    relationship: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const verificationSchema = new mongoose.Schema(
  {
    email: { type: Boolean, default: false },
    phone: { type: Boolean, default: false },
    id: { type: Boolean, default: false },
    profilePhoto: { type: Boolean, default: false },
    vehicle: { type: Boolean, default: false },
  },
  { _id: false }
);

const safetyPreferenceSchema = new mongoose.Schema(
  {
    womenOnlyRides: { type: Boolean, default: false },
    verifiedOnlyRides: { type: Boolean, default: false },
    hidePhoneNumber: { type: Boolean, default: false },
    requireRideShare: { type: Boolean, default: false },
  },
  { _id: false }
);

const currentLocationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true,
    },

    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
      validate: {
        validator(value) {
          if (!Array.isArray(value) || value.length !== 2) return false;

          const [lng, lat] = value.map(Number);

          return (
            Number.isFinite(lng) &&
            Number.isFinite(lat) &&
            lng >= -180 &&
            lng <= 180 &&
            lat >= -90 &&
            lat <= 90
          );
        },
        message:
          'currentLocation.coordinates must be [lng, lat] with valid ranges',
      },
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const vehicleSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['bike', 'car', 'auto', 'van'],
    },

    number: {
      type: String,
      trim: true,
      uppercase: true,
    },

    model: {
      type: String,
      trim: true,
    },

    image: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      select: false,
    },

    googleId: {
      type: String,
      trim: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    role: {
      type: String,
      enum: ['user', 'rider', 'admin'],
      default: 'user',
      index: true,
    },

    profilePic: {
      type: String,
      default: '',
    },

    bio: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },

    phone: {
      type: String,
      trim: true,
      default: '',
    },

    trustedContact: {
      type: trustedContactSchema,
      default: () => ({}),
    },

    verification: {
      type: verificationSchema,
      default: () => ({}),
    },

    safetyPreferences: {
      type: safetyPreferenceSchema,
      default: () => ({}),
    },

    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // IMPORTANT:
    // No default here. Save location only when coordinates exist.
    currentLocation: {
      type: currentLocationSchema,
      default: undefined,
    },

    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    rideCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    vehicle: {
      type: vehicleSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

userSchema.pre('validate', function () {
  this.verification = this.verification || {};

  this.verification.email = Boolean(this.isVerified);
  this.verification.profilePhoto = Boolean(this.profilePic);
  this.verification.phone = Boolean(this.phone);
  this.verification.vehicle = Boolean(
    this.vehicle?.type ||
      this.vehicle?.model ||
      this.vehicle?.number ||
      this.vehicle?.image
  );
});

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (plain) {
  if (!this.password) return false;
  return bcrypt.compare(plain, this.password);
};

userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ role: 1, isVerified: 1 });
userSchema.index({ blockedUsers: 1 });

userSchema.index(
  { currentLocation: '2dsphere' },
  {
    sparse: true,
    partialFilterExpression: {
      'currentLocation.coordinates': { $exists: true },
    },
  }
);

export default mongoose.model('User', userSchema);