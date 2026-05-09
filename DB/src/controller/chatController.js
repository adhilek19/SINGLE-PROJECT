import { chatService } from '../services/chatService.js';
import { messageService } from '../services/messageService.js';
import { successResponse } from '../utils/apiResponse.js';
import { getSocketIO } from '../socket/socketEmitter.js';
import { chatRoomName, toId } from '../services/chatAccessService.js';

const emitDeliveredBatch = ({ chatId, messageIds, userId }) => {
  const io = getSocketIO();
  if (!io || !Array.isArray(messageIds) || !messageIds.length) return;

  messageIds.forEach((messageId) => {
    io.to(chatRoomName(chatId)).emit('message_delivered', {
      chatId: toId(chatId),
      messageId: toId(messageId),
      userId: toId(userId),
      deliveredAt: new Date().toISOString(),
    });
  });
};

export const createOrGetRideChat = async (req, res, next) => {
  try {
    const chat = await chatService.createOrGetRideChat({
      rideId: req.params.rideId,
      requesterId: req.userId,
      targetUserId: req.params.userId,
    });

    return successResponse(res, 200, 'Chat ready', { chat });
  } catch (err) {
    next(err);
  }
};

export const getMyChats = async (req, res, next) => {
  try {
    const chats = await chatService.getMyChats(req.userId);
    return successResponse(res, 200, 'Chats fetched', {
      chats,
      count: chats.length,
    });
  } catch (err) {
    next(err);
  }
};

export const getChatMessages = async (req, res, next) => {
  try {
    const chatId = req.params.chatId;

    const deliveredMessageIds = await messageService.markAllDeliveredForUserInChat({
      chatId,
      userId: req.userId,
    });

    emitDeliveredBatch({
      chatId,
      messageIds: deliveredMessageIds,
      userId: req.userId,
    });

    const result = await messageService.getMessages({
      chatId,
      userId: req.userId,
      page: req.query.page,
      limit: req.query.limit,
    });

    return successResponse(res, 200, 'Messages fetched', result);
  } catch (err) {
    next(err);
  }
};
