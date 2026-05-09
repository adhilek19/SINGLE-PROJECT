import { chatRepository } from '../repositories/chatRepository.js';
import { messageRepository } from '../repositories/messageRepository.js';
import { BadRequest, Forbidden, NotFound } from '../utils/AppError.js';
import { ensureChatAccess, toId } from './chatAccessService.js';

const sanitizeMessage = (message) => {
  if (!message) return message;
  const payload = message.toObject ? message.toObject() : { ...message };
  return payload;
};

const createMessageInChat = async ({
  chatId,
  senderId,
  type,
  text = '',
  media = null,
  clientMessageId = '',
}) => {
  const access = await ensureChatAccess({ chatId, userId: senderId });
  const sender = toId(senderId);
  const receiverId =
    sender === access.driverId ? access.passengerId : access.driverId;
  const safeClientMessageId = String(clientMessageId || '').trim();

  if (safeClientMessageId) {
    const existing = await messageRepository.findByClientMessageId({
      chatId: access.chatId,
      senderId: sender,
      clientMessageId: safeClientMessageId,
    });

    if (existing) {
      return {
        message: sanitizeMessage(existing),
        receiverId,
        chatId: access.chatId,
        rideId: toId(access.ride._id),
        deduped: true,
      };
    }
  }

  const messagePayload = {
    chat: access.chatId,
    ride: access.ride._id,
    sender,
    receiver: receiverId,
    type,
    text,
    clientMessageId: safeClientMessageId,
    seenBy: [sender],
    deliveredTo: [sender],
    isDeleted: false,
  };

  if (media) {
    messagePayload.url = String(media.url || '').trim();
    messagePayload.publicId = String(media.publicId || '').trim();
    messagePayload.fileName = String(media.fileName || '').trim();
    messagePayload.fileSize = Number(media.fileSize || 0);
    messagePayload.mimeType = String(media.mimeType || '').trim();
  }

  const message = await messageRepository.create(messagePayload);

  await chatRepository.setLastMessageAndIncrementUnread({
    chatId: access.chatId,
    messageId: message._id,
    messageAt: message.createdAt || new Date(),
    senderId: sender,
    receiverId,
  });

  const populated = await messageRepository.findById(message._id);

  return {
    message: sanitizeMessage(populated),
    receiverId,
    chatId: access.chatId,
    rideId: toId(access.ride._id),
    deduped: false,
  };
};

export const messageService = {
  async sendTextMessage({ chatId, senderId, text, clientMessageId = '' }) {
    const content = String(text || '').trim();
    if (!content) throw BadRequest('Message text is required');

    return createMessageInChat({
      chatId,
      senderId,
      type: 'text',
      text: content,
      clientMessageId,
    });
  },

  async sendMediaMessage({ chatId, senderId, media, clientMessageId = '' }) {
    if (!media?.url || !media?.publicId) {
      throw BadRequest('Media upload failed');
    }
    if (!media?.fileName || !media?.fileSize || !media?.mimeType) {
      throw BadRequest('Invalid media metadata');
    }

    const mediaType = String(media.type || '').trim();
    if (!['image', 'video', 'audio', 'file'].includes(mediaType)) {
      throw BadRequest('Invalid media message type');
    }

    return createMessageInChat({
      chatId,
      senderId,
      type: mediaType,
      text: '',
      media,
      clientMessageId,
    });
  },

  async getMessages({ chatId, userId, page = 1, limit = 50 }) {
    const access = await ensureChatAccess({ chatId, userId });

    const [messages, total] = await Promise.all([
      messageRepository.getChatMessages({
        chatId: access.chatId,
        page,
        limit,
      }),
      messageRepository.countChatMessages(access.chatId),
    ]);

    return {
      messages: messages.map(sanitizeMessage),
      total,
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(100, Math.max(1, Number(limit) || 50)),
    };
  },

  async markMessageDelivered({ messageId, userId }) {
    const rawMessage = await messageRepository.findRawById(messageId);
    if (!rawMessage) throw NotFound('Message not found');

    await ensureChatAccess({ chatId: rawMessage.chat, userId });
    const receiverId = toId(rawMessage.receiver);
    const actor = toId(userId);
    if (receiverId !== actor) {
      return { message: sanitizeMessage(rawMessage), changed: false };
    }

    const updated = await messageRepository.markMessageDelivered({
      messageId: rawMessage._id,
      userId: actor,
    });

    return {
      message: sanitizeMessage(updated || rawMessage),
      changed: Boolean(updated),
    };
  },

  async markMessageSeen({ messageId, userId }) {
    const rawMessage = await messageRepository.findRawById(messageId);
    if (!rawMessage) throw NotFound('Message not found');

    await ensureChatAccess({ chatId: rawMessage.chat, userId });
    const receiverId = toId(rawMessage.receiver);
    const actor = toId(userId);

    if (receiverId !== actor) {
      throw Forbidden('Only message receiver can mark message as seen');
    }

    const updated = await messageRepository.markMessageSeen({
      messageId: rawMessage._id,
      userId: actor,
    });

    await chatRepository.resetUnreadCount({
      chatId: toId(rawMessage.chat),
      userId: actor,
    });

    return sanitizeMessage(updated || rawMessage);
  },

  async markAllDeliveredForUserInChat({ chatId, userId }) {
    const access = await ensureChatAccess({ chatId, userId });
    const actor = toId(userId);

    const pending = await messageRepository.findUndeliveredForUser({
      chatId: access.chatId,
      userId: actor,
    });
    const pendingIds = pending.map((message) => toId(message._id)).filter(Boolean);

    if (!pendingIds.length) return [];

    await messageRepository.markManyDeliveredByIds({
      messageIds: pendingIds,
      userId: actor,
    });

    return pendingIds;
  },

  async softDeleteMessage({ messageId, userId }) {
    const rawMessage = await messageRepository.findRawById(messageId);
    if (!rawMessage) throw NotFound('Message not found');

    await ensureChatAccess({ chatId: rawMessage.chat, userId });
    const senderId = toId(rawMessage.sender);
    const actor = toId(userId);

    if (senderId !== actor) {
      throw Forbidden('You can only delete your own message');
    }

    if (!rawMessage.isDeleted) {
      rawMessage.isDeleted = true;
      await messageRepository.save(rawMessage);
    }

    const updated = await messageRepository.findById(rawMessage._id);
    return sanitizeMessage(updated || rawMessage);
  },

  async reactToMessage({ messageId, userId, emoji }) {
    const rawMessage = await messageRepository.findRawById(messageId);
    if (!rawMessage) throw NotFound('Message not found');

    await ensureChatAccess({ chatId: rawMessage.chat, userId });

    const normalizedEmoji = String(emoji || '').trim();
    if (normalizedEmoji.length > 16) {
      throw BadRequest('Reaction emoji is too long');
    }

    const updated = await messageRepository.setReaction({
      messageId: rawMessage._id,
      userId: toId(userId),
      emoji: normalizedEmoji,
    });

    return sanitizeMessage(updated || rawMessage);
  },
};
