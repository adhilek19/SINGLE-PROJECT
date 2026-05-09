import { successResponse } from '../utils/apiResponse.js';
import { messageService } from '../services/messageService.js';
import {
  chatRoomName,
  ensureChatAccess,
  toId,
  userRoomName,
} from '../services/chatAccessService.js';
import { getSocketIO } from '../socket/socketEmitter.js';
import { cloudinary } from '../utils/cloudinary.js';
import { BadRequest } from '../utils/AppError.js';
import { env } from '../config/env.js';

const emitMessageDelivered = ({ chatId, messageId, userId }) => {
  const io = getSocketIO();
  if (!io) return;
  io.to(chatRoomName(chatId)).emit('message_delivered', {
    chatId: toId(chatId),
    messageId: toId(messageId),
    userId: toId(userId),
    deliveredAt: new Date().toISOString(),
  });
};

const maybeMarkDeliveredIfUserOnline = async ({ message, receiverId, chatId }) => {
  const io = getSocketIO();
  if (!io || !receiverId) {
    return { changed: false, message };
  }

  const sockets = await io.in(userRoomName(receiverId)).fetchSockets();
  if (!sockets.length) {
    return { changed: false, message };
  }

  const delivery = await messageService.markMessageDelivered({
    messageId: message._id,
    userId: receiverId,
  });

  if (delivery.changed) {
    emitMessageDelivered({
      chatId,
      messageId: message._id,
      userId: receiverId,
    });
  }

  return {
    changed: delivery.changed,
    message: delivery.message || message,
  };
};

const detectMessageType = (mimeType = '') => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
};

const uploadBufferToCloudinary = (file, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder,
      },
      (error, result) => {
        if (error) {
          reject(BadRequest('Failed to upload media to Cloudinary'));
          return;
        }
        resolve(result);
      }
    );
    stream.end(file.buffer);
  });

const dispatchMessageToChat = async ({ result }) => {
  let messagePayload = result.message;

  const delivered = await maybeMarkDeliveredIfUserOnline({
    message: result.message,
    receiverId: result.receiverId,
    chatId: result.chatId,
  });

  messagePayload = delivered.message || messagePayload;

  const io = getSocketIO();
  if (io) {
    io.to(chatRoomName(result.chatId)).emit('receive_message', {
      chatId: toId(result.chatId),
      message: messagePayload,
    });
  }

  return messagePayload;
};

export const sendMessage = async (req, res, next) => {
  try {
    const { chatId, text } = req.body || {};

    const result = await messageService.sendTextMessage({
      chatId,
      senderId: req.userId,
      text,
    });

    const messagePayload = await dispatchMessageToChat({ result });

    return successResponse(res, 201, 'Message sent', {
      message: messagePayload,
    });
  } catch (err) {
    next(err);
  }
};

export const sendMediaMessage = async (req, res, next) => {
  let uploadedPublicId = '';
  try {
    const { chatId } = req.body || {};
    if (!chatId) throw BadRequest('chatId is required');
    if (!req.file) throw BadRequest('Media file is required');

    await ensureChatAccess({ chatId, userId: req.userId });

    const uploadResult = await uploadBufferToCloudinary(
      req.file,
      env.CHAT_MEDIA_CLOUDINARY_FOLDER
    );
    uploadedPublicId = uploadResult?.public_id || '';

    const media = {
      url: uploadResult?.secure_url || '',
      publicId: uploadResult?.public_id || '',
      type: detectMessageType(req.file.mimetype),
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    };

    const result = await messageService.sendMediaMessage({
      chatId,
      senderId: req.userId,
      media,
    });

    const messagePayload = await dispatchMessageToChat({ result });

    return successResponse(res, 201, 'Media message sent', {
      message: messagePayload,
    });
  } catch (err) {
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId, {
          resource_type: 'auto',
        });
      } catch {
        // ignore cleanup errors
      }
    }
    next(err);
  }
};

export const markMessageSeen = async (req, res, next) => {
  try {
    const message = await messageService.markMessageSeen({
      messageId: req.params.messageId,
      userId: req.userId,
    });

    const io = getSocketIO();
    if (io) {
      io.to(chatRoomName(message.chat)).emit('message_seen', {
        chatId: toId(message.chat),
        messageId: toId(message._id),
        userId: toId(req.userId),
        seenAt: new Date().toISOString(),
      });
    }

    return successResponse(res, 200, 'Message marked as seen', {
      message,
    });
  } catch (err) {
    next(err);
  }
};

export const softDeleteMessage = async (req, res, next) => {
  try {
    const message = await messageService.softDeleteMessage({
      messageId: req.params.messageId,
      userId: req.userId,
    });

    const io = getSocketIO();
    if (io) {
      io.to(chatRoomName(message.chat)).emit('receive_message', {
        chatId: toId(message.chat),
        message,
      });
    }

    return successResponse(res, 200, 'Message deleted', {
      message,
    });
  } catch (err) {
    next(err);
  }
};
