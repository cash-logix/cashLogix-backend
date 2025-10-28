const Establishment = require('../models/Establishment');
const ResponseHelper = require('../utils/responseHelper');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// @desc    Upload establishment logo
// @route   POST /api/establishment/profile/logo
// @access  Private (Establishment)
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return ResponseHelper.error(res, 'common.no_file', 400);
    }

    const establishment = await Establishment.findById(req.establishment._id);

    if (!establishment) {
      return ResponseHelper.error(res, 'common.not_found', 404);
    }

    // Delete old logo if exists
    if (establishment.logo) {
      const oldLogoPath = path.join(__dirname, '../uploads/logos', path.basename(establishment.logo));
      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
    }

    const uploadedFilePath = req.file.path;
    const fileStats = fs.statSync(uploadedFilePath);
    const fileSizeInKB = fileStats.size / 1024;

    let finalFilePath = uploadedFilePath;

    // If file is larger than 200KB, compress it
    if (fileSizeInKB > 200) {
      try {
        const compressedFilename = `compressed-${req.file.filename}`;
        const compressedFilePath = path.join(__dirname, '../uploads/logos', compressedFilename);

        // Compress the image
        await sharp(uploadedFilePath)
          .resize(200, 200, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 85 })
          .toFile(compressedFilePath);

        // Delete original file
        fs.unlinkSync(uploadedFilePath);

        // Update file reference
        finalFilePath = compressedFilePath;
        req.file.filename = compressedFilename;
      } catch (compressError) {
        console.error('Compression error:', compressError);
        // If compression fails, use original file
      }
    }

    // Save new logo path (relative URL)
    establishment.logo = `/uploads/logos/${req.file.filename}`;
    await establishment.save();

    return ResponseHelper.success(res, 'establishment.logo_uploaded', {
      logoUrl: establishment.logo
    });
  } catch (error) {
    return ResponseHelper.serverError(res, error);
  }
};

// @desc    Delete establishment logo
// @route   DELETE /api/establishment/profile/logo
// @access  Private (Establishment)
exports.deleteLogo = async (req, res) => {
  try {
    const establishment = await Establishment.findById(req.establishment._id);

    if (!establishment) {
      return ResponseHelper.error(res, 'common.not_found', 404);
    }

    // Delete logo file if exists
    if (establishment.logo) {
      const logoPath = path.join(__dirname, '../uploads/logos', path.basename(establishment.logo));
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
      establishment.logo = '';
      await establishment.save();
    }

    return ResponseHelper.success(res, 'establishment.logo_deleted');
  } catch (error) {
    return ResponseHelper.serverError(res, error);
  }
};

