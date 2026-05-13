import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    entityId: {
      type: String,
      trim: true,
      default: '',
      maxlength: 120,
      index: true,
    },
    entityType: {
      type: String,
      trim: true,
      default: '',
      maxlength: 80,
      index: true,
    },
    url: {
      type: String,
      trim: true,
      default: '/',
      maxlength: 400,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
    dedupeKey: {
      type: String,
      trim: true,
      default: '',
      maxlength: 220,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

notificationSchema.index({ receiver: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ receiver: 1, createdAt: -1 });
notificationSchema.index({ receiver: 1, type: 1, createdAt: -1 });
notificationSchema.index(
  { receiver: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $exists: true, $ne: '' } },
  }
);

export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
