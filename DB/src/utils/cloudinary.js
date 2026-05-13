import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import { env } from '../config/env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'sahayatri/rides',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'], // ✅ ADD THIS
    transformation: [{ width: 500, height: 500, crop: 'limit' }],
  },
});

export const upload = multer({ storage: storage });

export const uploadBufferToCloudinary = ({
  buffer,
  folder = 'sahayatri/profile',
  publicId = '',
  resourceType = 'auto',
}) =>
  new Promise((resolve, reject) => {
    if (!buffer) {
      reject(new Error('File buffer is required'));
      return;
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId || undefined,
        resource_type: resourceType,
      },
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      }
    );

    stream.end(buffer);
  });

export const destroyCloudinaryAsset = async (publicId, resourceType = 'image') => {
  const safePublicId = String(publicId || '').trim();
  if (!safePublicId) return;

  await cloudinary.uploader.destroy(safePublicId, {
    invalidate: true,
    resource_type: resourceType,
  });
};

export { cloudinary };
