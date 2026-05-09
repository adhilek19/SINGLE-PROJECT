import multer from 'multer';
import { env } from '../config/env.js';
import { BadRequest } from '../utils/AppError.js';

const allowedDocumentMimeTypes = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const isAllowedMimeType = (mimeType = '') => {
  if (!mimeType) return false;
  if (mimeType.startsWith('image/')) return true;
  if (mimeType.startsWith('video/')) return true;
  if (mimeType.startsWith('audio/')) return true;
  return allowedDocumentMimeTypes.has(mimeType);
};

const chatMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(env.CHAT_MEDIA_MAX_SIZE_MB || 25) * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMimeType(file?.mimetype)) {
      cb(BadRequest('Unsupported media type'));
      return;
    }
    cb(null, true);
  },
});

export const uploadChatMedia = (req, res, next) => {
  chatMediaUpload.single('media')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(
        BadRequest(
          `File too large. Max allowed size is ${Number(
            env.CHAT_MEDIA_MAX_SIZE_MB || 25
          )}MB`
        )
      );
    }

    if (err?.statusCode) return next(err);
    return next(BadRequest(err.message || 'Invalid media upload'));
  });
};
