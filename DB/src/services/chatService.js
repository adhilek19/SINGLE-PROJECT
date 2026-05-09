import { chatRepository } from '../repositories/chatRepository.js';
import {
  ensureRideChatPair,
  ensureChatAccess,
  toId,
} from './chatAccessService.js';

const normalizeUnreadCounts = (chat, userId) => {
  if (!chat) return chat;
  const payload = chat.toObject ? chat.toObject() : { ...chat };
  const unreadObj =
    payload.unreadCounts instanceof Map
      ? Object.fromEntries(payload.unreadCounts.entries())
      : { ...(payload.unreadCounts || {}) };
  payload.unreadCounts = unreadObj;
  payload.unreadCount = Number(unreadObj[String(userId)] || 0);
  return payload;
};

export const chatService = {
  async createOrGetRideChat({ rideId, requesterId, targetUserId }) {
    await chatRepository.ensureLegacyIndexCleanup();

    const pair = await ensureRideChatPair({ rideId, requesterId, targetUserId });

    const existingChat = await chatRepository.findByRideAndParticipants({
      rideId,
      participants: pair.participants,
    });

    if (existingChat) {
      return normalizeUnreadCounts(existingChat, requesterId);
    }

    const unreadCounts = {
      [pair.driverId]: 0,
      [pair.passengerId]: 0,
    };

    try {
      await chatRepository.create({
        ride: rideId,
        participants: pair.participants,
        unreadCounts,
        lastMessage: null,
        lastMessageAt: null,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }

    const chat = await chatRepository.findByRideAndParticipants({
      rideId,
      participants: pair.participants,
    });

    return normalizeUnreadCounts(chat, requesterId);
  },

  async getMyChats(userId) {
    const chats = await chatRepository.findMyChats(userId);
    const checks = await Promise.all(
      chats.map(async (chat) => {
        try {
          await ensureChatAccess({ chatId: chat._id, userId });
          return normalizeUnreadCounts(chat, userId);
        } catch {
          return null;
        }
      })
    );
    return checks.filter(Boolean);
  },

  async getChatByIdForUser(chatId, userId) {
    await ensureChatAccess({ chatId, userId });
    const chat = await chatRepository.findById(chatId);
    return normalizeUnreadCounts(chat, userId);
  },

  async resetUnreadForUser({ chatId, userId }) {
    await ensureChatAccess({ chatId, userId });
    const updated = await chatRepository.resetUnreadCount({
      chatId,
      userId: toId(userId),
    });
    return normalizeUnreadCounts(updated, userId);
  },
};
