import mongoose from 'mongoose';

const CALL_STATUSES = [
  'calling',
  'ringing',
  'connected',
  'ended',
  'rejected',
  'missed',
  'failed',
  'busy',
];

const callLogSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
      index: true,
    },
    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    callee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: CALL_STATUSES,
      default: 'calling',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    ringingAt: {
      type: Date,
      default: Date.now,
    },
    answeredAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    durationSec: {
      type: Number,
      min: 0,
      default: 0,
    },
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    failureReason: {
      type: String,
      trim: true,
      maxlength: 160,
      default: '',
    },
  },
  { timestamps: true }
);

callLogSchema.pre('validate', function () {
  if (this.caller && this.callee && String(this.caller) === String(this.callee)) {
    this.invalidate('callee', 'Caller and callee cannot be same');
  }

  if (this.answeredAt && this.endedAt) {
    const diffSec = Math.max(
      0,
      Math.round(
        (new Date(this.endedAt).getTime() - new Date(this.answeredAt).getTime()) /
          1000
      )
    );
    this.durationSec = diffSec;
  }
});

callLogSchema.index({ chat: 1, createdAt: -1 });
callLogSchema.index({ caller: 1, createdAt: -1 });
callLogSchema.index({ callee: 1, createdAt: -1 });

export const CallLog = mongoose.model('CallLog', callLogSchema);
export default CallLog;
