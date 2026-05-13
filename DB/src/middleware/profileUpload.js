import multer from 'multer';
import { BadRequest } from '../utils/AppError.js';

const PROFILE_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PROFILE_DOC_MAX_SIZE_BYTES = 10 * 1024 * 1024;

const allowedProfileImageMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const allowedDocumentMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const profileImageMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_IMAGE_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!allowedProfileImageMimeTypes.has(String(file?.mimetype || '').toLowerCase())) {
      cb(BadRequest('Unsupported profile image type. Use JPG, JPEG, PNG, or WEBP.'));
      return;
    }
    cb(null, true);
  },
});

const profileDocumentMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_DOC_MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!allowedDocumentMimeTypes.has(String(file?.mimetype || '').toLowerCase())) {
      cb(BadRequest('Unsupported document type. Use image or PDF files only.'));
      return;
    }
    cb(null, true);
  },
});

const mapMulterError = (err, fallbackMessage) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    if (fallbackMessage.includes('document')) {
      return BadRequest('Document too large. Maximum size is 10MB.');
    }
    return BadRequest('Profile image too large. Maximum size is 5MB.');
  }

  if (err?.statusCode) return err;
  return BadRequest(err?.message || fallbackMessage);
};

export const uploadProfileImage = (req, res, next) => {
  profileImageMulter.single('image')(req, res, (err) => {
    if (!err) return next();
    return next(mapMulterError(err, 'Invalid profile image upload'));
  });
};

export const uploadProfileDocument = (req, res, next) => {
  profileDocumentMulter.single('document')(req, res, (err) => {
    if (!err) return next();
    return next(mapMulterError(err, 'Invalid profile document upload'));
  });
};
