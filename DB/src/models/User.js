import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { DEFAULT_AVATAR_KEYS, getDefaultAvatarUrl } from '../utils/defaultAvatars.js';

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

    brand: {
      type: String,
      trim: true,
      default: '',
    },

    number: {
      type: String,
      trim: true,
      uppercase: true,
    },

    model: {
      type: String,
      trim: true,
      default: '',
    },

    seats: {
      type: Number,
      min: 1,
      max: 12,
      default: null,
    },

    image: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const profileImageSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, default: '' },
    publicId: { type: String, trim: true, default: '' },
    uploadedAt: { type: Date, default: null },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, default: '' },
    publicId: { type: String, trim: true, default: '' },
    type: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    uploadedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const verificationDocumentsSchema = new mongoose.Schema(
  {
    idProof: { type: documentSchema, default: () => ({}) },
    drivingLicense: { type: documentSchema, default: () => ({}) },
    vehicleDocument: { type: documentSchema, default: () => ({}) },
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
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },

    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    profilePic: {
      type: String,
      default: '',
    },

    profileImage: {
      type: profileImageSchema,
      default: () => ({}),
    },

    selectedAvatar: {
      type: String,
      enum: [...DEFAULT_AVATAR_KEYS, ''],
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

    verificationDocuments: {
      type: verificationDocumentsSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

userSchema.pre('validate', function () {
  // Legacy compatibility: migrate any stale "rider" role value to "user"
  // to avoid validation failures on existing documents during saves.
  if (this.role === 'rider') {
    this.role = 'user';
  }

  this.verification = this.verification || {};

  const uploadedProfileUrl = String(this.profileImage?.url || '').trim();
  const selectedAvatarUrl = getDefaultAvatarUrl(this.selectedAvatar);
  const legacyProfileUrl = String(this.profilePic || '').trim();

  if (uploadedProfileUrl) {
    this.profilePic = uploadedProfileUrl;
  } else if (selectedAvatarUrl) {
    this.profilePic = selectedAvatarUrl;
  } else if (!legacyProfileUrl || legacyProfileUrl.includes('dicebear.com/7.x/adventurer/svg?seed=')) {
    this.profilePic = '';
  }

  this.verification.email = Boolean(this.isVerified);
  this.verification.profilePhoto = Boolean(uploadedProfileUrl || selectedAvatarUrl || legacyProfileUrl);
  this.verification.phone = Boolean(this.phone);
  this.verification.id = Boolean(
    this.verificationDocuments?.idProof?.status === 'approved' ||
      this.verificationDocuments?.drivingLicense?.status === 'approved'
  );
  this.verification.vehicle = Boolean(
    this.vehicle?.type ||
      this.vehicle?.brand ||
      this.vehicle?.model ||
      this.vehicle?.number ||
      this.vehicle?.image ||
      this.verificationDocuments?.vehicleDocument?.status === 'approved'
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
