const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Generate unique filename
    // Note: req.user should be available since protect middleware runs before upload
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const userId = req.user?.id?.toString() || 'anonymous';
    const publicId = `subscription-${userId}-${uniqueSuffix}`;
    
    return {
      folder: 'cash-logix/subscription-screenshots',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      public_id: publicId,
      transformation: [
        {
          width: 1920,
          height: 1920,
          crop: 'limit',
          quality: 'auto'
        }
      ]
    };
  }
});

module.exports = {
  cloudinary,
  storage
};
