const express = require('express');
const router = express.Router();
const {
  createItem,
  getItems,
  getItem,
  updateItem,
  deleteItem,
  getItemCategories,
  getEstablishmentItems,
} = require('../controllers/itemController');
const { protectEstablishment } = require('../middleware/auth');

// Public route for users to view establishment items
router.get('/establishment/:id', getEstablishmentItems);

// All other routes require establishment authentication
router.use(protectEstablishment);

router.post('/', createItem);
router.get('/', getItems);
router.get('/categories', getItemCategories);
router.get('/:id', getItem);
router.put('/:id', updateItem);
router.delete('/:id', deleteItem);

module.exports = router;

