const express = require('express');
const router = express.Router();
const { uploadLogo, deleteLogo } = require('../controllers/establishmentProfileController');
const { protectEstablishment } = require('../middleware/auth');
const upload = require('../config/multer');

// Logo management
router.post('/logo', protectEstablishment, upload.single('logo'), uploadLogo);
router.delete('/logo', protectEstablishment, deleteLogo);

module.exports = router;

