import mongoose from 'mongoose';

const requestLocationSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
  },
  { _id: false }
);

const rideRequestSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
      index: true,
    },
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    seatsRequested: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    pickupLocation: {
      type: requestLocationSchema,
      default: null,
    },
    dropLocation: {
      type: requestLocationSchema,
      default: null,
    },
    pickupConfirmed: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed', 'no_show'],
      default: 'pending',
      index: true,
    },
    startPin: {
      type: String,
      default: '',
      select: false,
    },
    startPinHash: {
      type: String,
      default: '',
      select: false,
    },
    pinVerified: {
      type: Boolean,
      default: false,
    },
    noShowReason: {
      type: String,
      trim: true,
      default: '',
    },
    acceptedAt: Date,
    rejectedAt: Date,
    cancelledAt: Date,
    completedAt: Date,
    noShowAt: Date,
  },
  { timestamps: true }
);

rideRequestSchema.index({ ride: 1, passenger: 1, status: 1 });

export default mongoose.model('RideRequest', rideRequestSchema);
