import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
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
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
      enum: ['text', 'image', 'video', 'audio', 'voice', 'file'],
      default: 'text',
    },
    clientMessageId: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },
    url: {
      type: String,
      trim: true,
      default: '',
    },
    publicId: {
      type: String,
      trim: true,
      default: '',
    },
    fileName: {
      type: String,
      trim: true,
      default: '',
    },
    fileSize: {
      type: Number,
      min: 0,
      default: 0,
    },
    mimeType: {
      type: String,
      trim: true,
      default: '',
    },
    duration: {
      type: Number,
      min: 0,
      default: 0,
    },
    waveform: {
      type: [Number],
      default: [],
    },
    seenBy: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      default: [],
    },
    deliveredTo: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      default: [],
    },
    reactions: {
      type: [
        {
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          emoji: {
            type: String,
            trim: true,
            maxlength: 16,
            required: true,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

messageSchema.pre('validate', function () {
  if (this.type === 'text' && !String(this.text || '').trim()) {
    this.invalidate('text', 'Text message cannot be empty');
  }

  if (this.type !== 'text') {
    if (!String(this.url || '').trim()) {
      this.invalidate('url', 'Media url is required');
    }
    if (!String(this.publicId || '').trim()) {
      this.invalidate('publicId', 'Media publicId is required');
    }
    if (!String(this.fileName || '').trim()) {
      this.invalidate('fileName', 'Media fileName is required');
    }
    if (!Number.isFinite(Number(this.fileSize)) || Number(this.fileSize) <= 0) {
      this.invalidate('fileSize', 'Media fileSize is required');
    }
    if (!String(this.mimeType || '').trim()) {
      this.invalidate('mimeType', 'Media mimeType is required');
    }
  }

  if (this.type === 'voice') {
    if (!Number.isFinite(Number(this.duration)) || Number(this.duration) <= 0) {
      this.invalidate('duration', 'Voice duration is required');
    }
  }

  if (typeof this.text === 'string') {
    this.text = this.text.trim();
  }

  if (typeof this.clientMessageId === 'string') {
    this.clientMessageId = this.clientMessageId.trim();
  }
});

messageSchema.index({ chat: 1, createdAt: 1 });
messageSchema.index({ receiver: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ chat: 1, sender: 1, clientMessageId: 1 });

export const Message = mongoose.model('Message', messageSchema);
export default Message;
