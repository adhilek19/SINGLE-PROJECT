import mongoose from 'mongoose';
import crypto from 'crypto';

const locationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: 'Unknown location',
    },
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
  },
  { _id: false }
);

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(value) {
          return (
            Array.isArray(value) &&
            value.length === 2 &&
            Number.isFinite(Number(value[0])) &&
            Number.isFinite(Number(value[1]))
          );
        },
        message: 'Invalid geo coordinates',
      },
    },
  },
  { _id: false }
);

const vehicleSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['bike', 'car', 'auto', 'van'],
      required: true,
    },
    brand: {
      type: String,
      trim: true,
      default: '',
    },
    model: {
      type: String,
      trim: true,
      default: '',
    },
    number: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    image: {
      type: String,
      default: '',
    },
    verified: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const passengerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    seats: {
      type: Number,
      default: 1,
      min: 1,
    },
    pickupConfirmed: {
      type: Boolean,
      default: false,
    },
    pickupLocation: {
      type: locationSchema,
      default: null,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const ridePreferenceSchema = new mongoose.Schema(
  {
    womenOnly: { type: Boolean, default: false },
    verifiedOnly: { type: Boolean, default: false },
    hidePhoneNumber: { type: Boolean, default: false },
    requireRideShare: { type: Boolean, default: false },
    smokingAllowed: { type: Boolean, default: false },
    musicAllowed: { type: Boolean, default: true },
    petsAllowed: { type: Boolean, default: false },
    luggageSpace: { type: Boolean, default: true },
    acAvailable: { type: Boolean, default: false },
    conversationLevel: {
      type: String,
      enum: ['quiet', 'normal', 'talkative'],
      default: 'normal',
    },
    genderPreference: {
      type: String,
      enum: ['any', 'male', 'female'],
      default: 'any',
    },
  },
  { _id: false }
);

const liveLocationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['driver', 'passenger'], default: 'passenger' },
    name: { type: String, trim: true, default: '' },
    profilePic: { type: String, trim: true, default: '' },
    lat: Number,
    lng: Number,
    heading: Number,
    speed: Number, // browser speed in m/s when available
    speedKmh: Number,
    accuracy: Number,
    updatedAt: Date,
  },
  { _id: false }
);

const noShowSchema = new mongoose.Schema(
  {
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const rideSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    passengers: {
      type: [passengerSchema],
      default: [],
    },

    source: {
      type: locationSchema,
      required: true,
    },

    destination: {
      type: locationSchema,
      required: true,
    },

    sourcePoint: {
      type: pointSchema,
    },

    destinationPoint: {
      type: pointSchema,
    },

    departureTime: {
      type: Date,
      required: true,
      index: true,
    },

    duration: {
      type: Number,
      min: 1,
      default: 60,
    },

    estimatedEndTime: {
      type: Date,
    },

    seatsAvailable: {
      type: Number,
      required: true,
      min: 1,
    },

    bookedSeats: {
      type: Number,
      default: 0,
      min: 0,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },

    vehicle: {
      type: vehicleSchema,
      required: true,
    },

    preferences: {
      type: ridePreferenceSchema,
      default: () => ({}),
    },

    status: {
      type: String,
      enum: ['scheduled', 'started', 'ended', 'completed', 'cancelled', 'active'],
      default: 'scheduled',
      index: true,
    },

    shareToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    shareEnabled: {
      type: Boolean,
      default: true,
    },

    lastLiveLocations: {
      type: [liveLocationSchema],
      default: [],
    },

    anomalyFlags: [
      {
        type: String,
        enum: ['route_deviation', 'long_stop', 'location_missing', 'passenger_far_from_route'],
      },
    ],

    noShows: {
      type: [noShowSchema],
      default: [],
    },

    cancellationReason: {
      type: String,
      trim: true,
      default: '',
    },

    cancelledAt: {
      type: Date,
    },

    startTime: {
      type: Date,
    },

    endTime: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    reviews: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Review',
      },
    ],

    reports: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Report',
      },
    ],
  },
  { timestamps: true }
);

rideSchema.pre('validate', function () {
  if (this.status === 'active') {
    this.status = 'scheduled';
  }

  if (!this.shareToken) {
    this.shareToken = crypto.randomBytes(18).toString('hex');
  }

  if (this.source?.lng !== undefined && this.source?.lat !== undefined) {
    this.sourcePoint = {
      type: 'Point',
      coordinates: [Number(this.source.lng), Number(this.source.lat)],
    };
  }

  if (this.destination?.lng !== undefined && this.destination?.lat !== undefined) {
    this.destinationPoint = {
      type: 'Point',
      coordinates: [Number(this.destination.lng), Number(this.destination.lat)],
    };
  }

  if (this.departureTime && this.duration) {
    this.estimatedEndTime = new Date(
      new Date(this.departureTime).getTime() + Number(this.duration) * 60000
    );
  }

  if (this.vehicle) {
    this.vehicle.verified = Boolean(this.vehicle.number && (this.vehicle.image || this.vehicle.model));
  }

  const safeBooked = Number(this.bookedSeats || 0);
  const safeTotal = Number(this.seatsAvailable || 0);

  if (!Number.isFinite(safeBooked) || safeBooked < 0) {
    this.bookedSeats = 0;
  }

  if (Number.isFinite(safeTotal) && Number.isFinite(safeBooked) && safeBooked > safeTotal) {
    this.invalidate('bookedSeats', 'bookedSeats cannot exceed seatsAvailable');
  }
});

rideSchema.virtual('seatsLeft').get(function () {
  return Math.max(0, (this.seatsAvailable || 0) - (this.bookedSeats || 0));
});

rideSchema.set('toJSON', { virtuals: true });
rideSchema.set('toObject', { virtuals: true });

rideSchema.index({ status: 1, departureTime: 1 });
rideSchema.index({ driver: 1, status: 1 });
rideSchema.index({ sourcePoint: '2dsphere' });
rideSchema.index({ destinationPoint: '2dsphere' });
rideSchema.index({ 'preferences.womenOnly': 1, 'preferences.verifiedOnly': 1 });

export const Ride = mongoose.model('Ride', rideSchema);
export default Ride;
