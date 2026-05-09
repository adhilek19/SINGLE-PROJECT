import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
      index: true,
    },
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
      ],
      required: true,
      validate: {
        validator(value) {
          if (!Array.isArray(value) || value.length !== 2) return false;
          const uniqueIds = new Set(value.map((id) => String(id)));
          return uniqueIds.size === 2;
        },
        message: 'Chat must have exactly two unique participants',
      },
    },
    participantKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    chatKind: {
      type: String,
      enum: ['ride', 'inquiry'],
      default: 'ride',
      index: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

chatSchema.pre('validate', function () {
  if (!Array.isArray(this.participants)) return;

  const normalizedParticipants = Array.from(
    new Set(this.participants.map((id) => String(id)).filter(Boolean))
  ).sort();

  this.participants = normalizedParticipants.map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const unreadCountsObj =
    this.unreadCounts instanceof Map
      ? Object.fromEntries(this.unreadCounts.entries())
      : { ...(this.unreadCounts || {}) };

  normalizedParticipants.forEach((id) => {
    const numeric = Number(unreadCountsObj[id]);
    unreadCountsObj[id] = Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
  });

  this.unreadCounts = unreadCountsObj;
  this.participantKey = normalizedParticipants.join(':');
});

chatSchema.index({ ride: 1, participantKey: 1 }, { unique: true });
chatSchema.index({ participants: 1, lastMessageAt: -1 });
chatSchema.index({ ride: 1, lastMessageAt: -1 });

export const Chat = mongoose.model('Chat', chatSchema);
export default Chat;
