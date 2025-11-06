const Item = require('../models/Item');

// @desc    Create item
// @route   POST /api/items
// @access  Private (Establishment)
exports.createItem = async (req, res) => {
  try {
    const { name, price, category, description } = req.body;
    const establishmentId = req.establishment._id;

    // Check if item already exists for this establishment
    const existingItem = await Item.findOne({ name, establishment: establishmentId });

    if (existingItem) {
      return res.status(400).json({ message: req.t('item.already_exists') });
    }

    // Create item
    const item = await Item.create({
      name,
      price,
      category: category || 'general',
      description: description || '',
      establishment: establishmentId,
    });

    res.status(201).json({
      message: req.t('item.created_successfully'),
      item: {
        id: item._id,
        name: item.name,
        price: item.price,
        category: item.category,
        description: item.description,
        isActive: item.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all items for establishment
// @route   GET /api/items
// @access  Private (Establishment)
exports.getItems = async (req, res) => {
  try {
    const establishmentId = req.establishment._id;
    const { category, isActive } = req.query;

    const query = { establishment: establishmentId };

    if (category) {
      query.category = category;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const items = await Item.find(query)
      .sort({ createdAt: -1 });

    res.json({
      items,
      total: items.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single item
// @route   GET /api/items/:id
// @access  Private (Establishment)
exports.getItem = async (req, res) => {
  try {
    const item = await Item.findOne({
      _id: req.params.id,
      establishment: req.establishment._id,
    });

    if (!item) {
      return res.status(404).json({ message: req.t('item.not_found') });
    }

    res.json({ item });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update item
// @route   PUT /api/items/:id
// @access  Private (Establishment)
exports.updateItem = async (req, res) => {
  try {
    const { name, price, category, description, isActive } = req.body;

    // Check if name is being changed and if it conflicts with another item
    if (name) {
      const existingItem = await Item.findOne({
        name,
        establishment: req.establishment._id,
        _id: { $ne: req.params.id },
      });

      if (existingItem) {
        return res.status(400).json({ message: req.t('item.already_exists') });
      }
    }

    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, establishment: req.establishment._id },
      {
        ...(name && { name }),
        ...(price !== undefined && { price }),
        ...(category && { category }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ message: req.t('item.not_found') });
    }

    res.json({
      message: req.t('item.updated_successfully'),
      item: {
        id: item._id,
        name: item.name,
        price: item.price,
        category: item.category,
        description: item.description,
        isActive: item.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete item
// @route   DELETE /api/items/:id
// @access  Private (Establishment)
exports.deleteItem = async (req, res) => {
  try {
    const item = await Item.findOneAndDelete({
      _id: req.params.id,
      establishment: req.establishment._id,
    });

    if (!item) {
      return res.status(404).json({ message: req.t('item.not_found') });
    }

    res.json({ message: req.t('item.deleted_successfully') });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get item categories for establishment
// @route   GET /api/items/categories
// @access  Private (Establishment)
exports.getItemCategories = async (req, res) => {
  try {
    const establishmentId = req.establishment._id;

    const categories = await Item.distinct('category', {
      establishment: establishmentId,
      isActive: true,
    });

    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get establishment items (public for users)
// @route   GET /api/items/establishment/:id
// @access  Public
exports.getEstablishmentItems = async (req, res) => {
  try {
    const establishmentId = req.params.id;
    const { category } = req.query;

    // Verify establishment exists and is verified
    const Establishment = require('../models/Establishment');
    const establishment = await Establishment.findById(establishmentId);
    
    if (!establishment || !establishment.isVerified) {
      return res.status(404).json({ message: 'Establishment not found' });
    }

    const query = { establishment: establishmentId, isActive: true };

    if (category && category !== 'all') {
      query.category = category;
    }

    const items = await Item.find(query)
      .select('name price category description')
      .sort({ category: 1, name: 1 });

    // Get categories
    const categories = await Item.distinct('category', {
      establishment: establishmentId,
      isActive: true,
    });

    res.json({
      items,
      total: items.length,
      categories,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

