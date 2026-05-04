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

    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        validate: {
          validator(value) {
            return (
              Array.isArray(value) &&
              value.length === 2 &&
              Number.isFinite(Number(value[0])) &&
              Number.isFinite(Number(value[1])) &&
              Number(value[1]) >= -90 &&
              Number(value[1]) <= 90 &&
              Number(value[0]) >= -180 &&
              Number(value[0]) <= 180
            );
          },
          message:
            'currentLocation.coordinates must be [lng, lat] with valid ranges',
        },
      },
      updatedAt: {
        type: Date,
      },
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
    },

    vehicle: {
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
  },
  { timestamps: true }
);

userSchema.pre('validate', function () {
  this.verification = this.verification || {};
  this.verification.email = Boolean(this.isVerified);
  this.verification.profilePhoto = Boolean(this.profilePic);
  this.verification.phone = Boolean(this.phone);
  this.verification.vehicle = Boolean(
    this.vehicle?.type && (this.vehicle?.model || this.vehicle?.number || this.vehicle?.image)
  );
});

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ role: 1, isVerified: 1 });
userSchema.index({ currentLocation: '2dsphere' });
userSchema.index({ blockedUsers: 1 });

export default mongoose.model('User', userSchema);
