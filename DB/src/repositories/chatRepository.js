import Chat from '../models/Chat.js';

const CHAT_PARTICIPANT_FIELDS = 'name profilePic isVerified rating rideCount';
const CHAT_RIDE_FIELDS =
  'driver source destination departureTime status vehicle.type vehicle.brand vehicle.model';

const populateChat = (query) =>
  query
    .populate('participants', CHAT_PARTICIPANT_FIELDS)
    .populate('ride', CHAT_RIDE_FIELDS)
    .populate({
      path: 'lastMessage',
      select:
        'chat ride sender receiver type clientMessageId text url publicId fileName fileSize mimeType seenBy deliveredTo reactions isDeleted createdAt updatedAt',
      populate: [
        { path: 'sender', select: CHAT_PARTICIPANT_FIELDS },
        { path: 'receiver', select: CHAT_PARTICIPANT_FIELDS },
      ],
    });

const normalizeParticipants = (participants = []) =>
  [...participants].map(String).filter(Boolean).sort();

let legacyIndexChecked = false;

const cleanupLegacyUniqueIndex = async () => {
  if (legacyIndexChecked) return;
  legacyIndexChecked = true;

  try {
    const indexes = await Chat.collection.indexes();
    const legacy = indexes.find(
      (index) =>
        index?.unique === true &&
        index?.key?.ride === 1 &&
        index?.key?.participants === 1
    );

    if (legacy?.name) {
      await Chat.collection.dropIndex(legacy.name);
    }
  } catch {
    // ignore index cleanup failures; fallback logic still prevents duplicates for same pair
  }
};

export const chatRepository = {
  ensureLegacyIndexCleanup() {
    return cleanupLegacyUniqueIndex();
  },

  findById(id) {
    return populateChat(Chat.findById(id));
  },

  findRawById(id) {
    return Chat.findById(id);
  },

  findByRideAndParticipants({ rideId, participants }) {
    const normalized = normalizeParticipants(participants);
    const participantKey = normalized.join(':');
    return populateChat(
      Chat.findOne({
        ride: rideId,
        $or: [{ participantKey }, { participants: normalized }],
      })
    );
  },

  findMyChats(userId) {
    return populateChat(Chat.find({ participants: userId })).sort({
      lastMessageAt: -1,
      updatedAt: -1,
    });
  },

  create(data) {
    return Chat.create(data);
  },

  save(chat) {
    return chat.save();
  },

  setLastMessageAndIncrementUnread({
    chatId,
    messageId,
    messageAt,
    senderId,
    receiverId,
  }) {
    return Chat.findByIdAndUpdate(
      chatId,
      {
        $set: {
          lastMessage: messageId,
          lastMessageAt: messageAt,
          [`unreadCounts.${senderId}`]: 0,
        },
        $inc: {
          [`unreadCounts.${receiverId}`]: 1,
        },
      },
      {
        returnDocument: 'after',
      }
    );
  },

  resetUnreadCount({ chatId, userId }) {
    return Chat.findByIdAndUpdate(
      chatId,
      {
        $set: {
          [`unreadCounts.${userId}`]: 0,
        },
      },
      { returnDocument: 'after' }
    );
  },
};
