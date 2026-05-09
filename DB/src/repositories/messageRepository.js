import Message from '../models/Message.js';

const CHAT_PARTICIPANT_FIELDS = 'name profilePic isVerified rating rideCount';

const populateMessage = (query) =>
  query
    .populate('sender', CHAT_PARTICIPANT_FIELDS)
    .populate('receiver', CHAT_PARTICIPANT_FIELDS);

export const messageRepository = {
  create(data) {
    return Message.create(data);
  },

  findById(id) {
    return populateMessage(Message.findById(id));
  },

  findRawById(id) {
    return Message.findById(id);
  },

  findByClientMessageId({ chatId, senderId, clientMessageId }) {
    const key = String(clientMessageId || '').trim();
    if (!key) return Promise.resolve(null);
    return populateMessage(
      Message.findOne({
        chat: chatId,
        sender: senderId,
        clientMessageId: key,
      })
    );
  },

  getChatMessages({ chatId, page = 1, limit = 50 }) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const skip = (pageNum - 1) * limitNum;

    return populateMessage(
      Message.find({ chat: chatId })
        .sort({ createdAt: 1, _id: 1 })
        .skip(skip)
        .limit(limitNum)
    );
  },

  countChatMessages(chatId) {
    return Message.countDocuments({ chat: chatId });
  },

  save(message) {
    return message.save();
  },

  markMessageDelivered({ messageId, userId }) {
    return populateMessage(
      Message.findOneAndUpdate(
        {
          _id: messageId,
          deliveredTo: { $ne: userId },
        },
        {
          $addToSet: { deliveredTo: userId },
        },
        {
          returnDocument: 'after',
        }
      )
    );
  },

  markMessageSeen({ messageId, userId }) {
    return populateMessage(
      Message.findByIdAndUpdate(
        messageId,
        {
          $addToSet: {
            seenBy: userId,
            deliveredTo: userId,
          },
        },
        {
          returnDocument: 'after',
        }
      )
    );
  },

  findUndeliveredForUser({ chatId, userId }) {
    return Message.find({
      chat: chatId,
      receiver: userId,
      deliveredTo: { $ne: userId },
    }).select('_id');
  },

  markManyDeliveredByIds({ messageIds, userId }) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return Promise.resolve({ modifiedCount: 0 });
    }

    return Message.updateMany(
      {
        _id: { $in: messageIds },
      },
      {
        $addToSet: { deliveredTo: userId },
      }
    );
  },

  async setReaction({ messageId, userId, emoji }) {
    const message = await Message.findById(messageId);
    if (!message) return null;

    const actor = String(userId || '');
    const reactions = Array.isArray(message.reactions) ? [...message.reactions] : [];
    const existingIndex = reactions.findIndex(
      (entry) => String(entry?.user || '') === actor
    );

    const normalizedEmoji = String(emoji || '').trim();
    if (!normalizedEmoji) {
      if (existingIndex >= 0) {
        reactions.splice(existingIndex, 1);
      }
    } else if (existingIndex >= 0) {
      reactions[existingIndex] = {
        ...reactions[existingIndex],
        user: reactions[existingIndex].user,
        emoji: normalizedEmoji,
        createdAt: new Date(),
      };
    } else {
      reactions.push({
        user: userId,
        emoji: normalizedEmoji,
        createdAt: new Date(),
      });
    }

    message.reactions = reactions;
    await message.save();
    return this.findById(messageId);
  },
};
