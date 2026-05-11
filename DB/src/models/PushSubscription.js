import mongoose from 'mongoose';

const pushSubscriptionKeysSchema = new mongoose.Schema(
  {
    p256dh: {
      type: String,
      required: true,
      trim: true,
    },
    auth: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
      maxlength: 2048,
    },
    keys: {
      type: pushSubscriptionKeysSchema,
      required: true,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 512,
      default: '',
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pushSubscriptionSchema.index({ user: 1, endpoint: 1 }, { unique: true });

export const PushSubscription = mongoose.model(
  'PushSubscription',
  pushSubscriptionSchema
);

export default PushSubscription;
