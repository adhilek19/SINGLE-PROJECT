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
import { notificationService } from '../services/notificationService.js';

const allowedVoiceMimeTypes = new Set([
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
]);

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

const normalizeMimeType = (mimeType = '') =>
  String(mimeType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();

const parseWaveform = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

  if (result?.deduped) {
    return messagePayload;
  }

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

  notificationService.notifyChatMessage({
    receiverId: result.receiverId,
    senderId: messagePayload?.sender,
    chatId: result.chatId,
    rideId: result.rideId,
    message: messagePayload,
  });

  return messagePayload;
};

export const sendMessage = async (req, res, next) => {
  try {
    const { chatId, text, clientMessageId } = req.body || {};

    const result = await messageService.sendTextMessage({
      chatId,
      senderId: req.userId,
      text,
      clientMessageId,
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
    const { chatId, clientMessageId, type: requestedType } = req.body || {};
    if (!chatId) throw BadRequest('chatId is required');
    if (!req.file) throw BadRequest('Media file is required');

    await ensureChatAccess({ chatId, userId: req.userId });

    const isVoiceMessage = String(requestedType || '').trim() === 'voice';
    if (isVoiceMessage) {
      const normalizedMimeType = normalizeMimeType(req.file.mimetype);
      if (!allowedVoiceMimeTypes.has(normalizedMimeType)) {
        throw BadRequest('Unsupported voice note audio format');
      }

      const maxVoiceBytes = Number(env.CHAT_VOICE_MAX_SIZE_MB || 10) * 1024 * 1024;
      if (Number(req.file.size || 0) > maxVoiceBytes) {
        throw BadRequest(
          `Voice note too large. Max allowed size is ${Number(
            env.CHAT_VOICE_MAX_SIZE_MB || 10
          )}MB`
        );
      }
    }

    const uploadResult = await uploadBufferToCloudinary(
      req.file,
      env.CHAT_MEDIA_CLOUDINARY_FOLDER
    );
    uploadedPublicId = uploadResult?.public_id || '';

    const duration = Number(req.body?.duration || 0);
    const waveform = parseWaveform(req.body?.waveform)
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry) && entry >= 0)
      .slice(0, 64);

    if (isVoiceMessage) {
      if (!Number.isFinite(duration) || duration <= 0) {
        throw BadRequest('Voice note duration is required');
      }

      if (duration > Number(env.CHAT_VOICE_MAX_DURATION_SEC || 180)) {
        throw BadRequest(
          `Voice note exceeds max duration of ${Number(
            env.CHAT_VOICE_MAX_DURATION_SEC || 180
          )} seconds`
        );
      }
    }

    const media = {
      url: uploadResult?.secure_url || '',
      publicId: uploadResult?.public_id || '',
      type: isVoiceMessage ? 'voice' : detectMessageType(req.file.mimetype),
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
      waveform,
    };

    const result = await messageService.sendMediaMessage({
      chatId,
      senderId: req.userId,
      media,
      clientMessageId,
    });

    if (
      result?.deduped &&
      uploadedPublicId &&
      String(result?.message?.publicId || '') !== uploadedPublicId
    ) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId, {
          resource_type: 'auto',
        });
      } catch {
        // ignore cleanup errors
      } finally {
        uploadedPublicId = '';
      }
    }

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

export const setMessageReaction = async (req, res, next) => {
  try {
    const message = await messageService.reactToMessage({
      messageId: req.params.messageId,
      userId: req.userId,
      emoji: req.body?.emoji || '',
    });

    const io = getSocketIO();
    if (io) {
      io.to(chatRoomName(message.chat)).emit('message_reaction', {
        chatId: toId(message.chat),
        messageId: toId(message._id),
        userId: toId(req.userId),
        message,
      });
    }

    return successResponse(res, 200, 'Reaction updated', {
      message,
    });
  } catch (err) {
    next(err);
  }
};
