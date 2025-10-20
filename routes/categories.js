const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { protect } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// @route   GET /api/categories
// @desc    Get all categories (predefined + custom for user)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const categories = await Category.getAllCategories(req.user.id);

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: {
        english: 'Error fetching categories',
        arabic: 'حدث خطأ في جلب الفئات'
      }
    });
  }
});

// @route   GET /api/categories/predefined
// @desc    Get predefined categories only
// @access  Private
router.get('/predefined', protect, async (req, res) => {
  try {
    const predefinedCategories = Category.getPredefinedCategories();

    res.json({
      success: true,
      data: predefinedCategories
    });
  } catch (error) {
    console.error('Error fetching predefined categories:', error);
    res.status(500).json({
      success: false,
      error: {
        english: 'Error fetching predefined categories',
        arabic: 'حدث خطأ في جلب الفئات المحددة مسبقاً'
      }
    });
  }
});

// @route   GET /api/categories/custom
// @desc    Get user's custom categories
// @access  Private
router.get('/custom', protect, async (req, res) => {
  try {
    const customCategories = await Category.find({
      type: 'custom',
      createdBy: req.user.id,
      isActive: true
    }).select('name description icon color usageCount createdAt');

    res.json({
      success: true,
      data: customCategories
    });
  } catch (error) {
    console.error('Error fetching custom categories:', error);
    res.status(500).json({
      success: false,
      error: {
        english: 'Error fetching custom categories',
        arabic: 'حدث خطأ في جلب الفئات المخصصة'
      }
    });
  }
});

// @route   POST /api/categories
// @desc    Create a new custom category
// @access  Private
router.post('/', [
  protect,
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icon cannot exceed 50 characters'),
  body('color')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Color cannot exceed 20 characters')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          english: 'Validation error',
          arabic: 'خطأ في التحقق من البيانات',
          details: errors.array()
        }
      });
    }

    const { name, description, icon, color } = req.body;

    // Check if category already exists (case insensitive)
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      createdBy: req.user.id
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        error: {
          english: 'Category already exists',
          arabic: 'هذه الفئة موجودة بالفعل'
        }
      });
    }

    // Create new category
    const category = new Category({
      name: name.trim(),
      description: description?.trim() || '',
      type: 'custom',
      createdBy: req.user.id,
      icon: icon?.trim() || '',
      color: color?.trim() || ''
    });

    await category.save();

    res.status(201).json({
      success: true,
      data: category,
      message: {
        english: 'Category created successfully',
        arabic: 'تم إنشاء الفئة بنجاح'
      }
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      error: {
        english: 'Error creating category',
        arabic: 'حدث خطأ في إنشاء الفئة'
      }
    });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update a custom category
// @access  Private
router.put('/:id', [
  protect,
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Category name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icon cannot exceed 50 characters'),
  body('color')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Color cannot exceed 20 characters')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          english: 'Validation error',
          arabic: 'خطأ في التحقق من البيانات',
          details: errors.array()
        }
      });
    }

    const { name, description, icon, color } = req.body;

    // Find the category
    const category = await Category.findOne({
      _id: req.params.id,
      type: 'custom',
      createdBy: req.user.id
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: {
          english: 'Category not found',
          arabic: 'الفئة غير موجودة'
        }
      });
    }

    // Check if new name conflicts with existing category
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        createdBy: req.user.id,
        _id: { $ne: req.params.id }
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          error: {
            english: 'Category name already exists',
            arabic: 'اسم الفئة موجود بالفعل'
          }
        });
      }
    }

    // Update category
    if (name) category.name = name.trim();
    if (description !== undefined) category.description = description.trim();
    if (icon !== undefined) category.icon = icon.trim();
    if (color !== undefined) category.color = color.trim();

    await category.save();

    res.json({
      success: true,
      data: category,
      message: {
        english: 'Category updated successfully',
        arabic: 'تم تحديث الفئة بنجاح'
      }
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      error: {
        english: 'Error updating category',
        arabic: 'حدث خطأ في تحديث الفئة'
      }
    });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete a custom category
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      type: 'custom',
      createdBy: req.user.id
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: {
          english: 'Category not found',
          arabic: 'الفئة غير موجودة'
        }
      });
    }

    // Soft delete by setting isActive to false
    category.isActive = false;
    await category.save();

    res.json({
      success: true,
      message: {
        english: 'Category deleted successfully',
        arabic: 'تم حذف الفئة بنجاح'
      }
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      error: {
        english: 'Error deleting category',
        arabic: 'حدث خطأ في حذف الفئة'
      }
    });
  }
});

// @route   POST /api/categories/:id/increment-usage
// @desc    Increment usage count for a category
// @access  Private
router.post('/:id/increment-usage', protect, async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: {
          english: 'Category not found',
          arabic: 'الفئة غير موجودة'
        }
      });
    }

    await category.incrementUsage();

    res.json({
      success: true,
      data: { usageCount: category.usageCount }
    });
  } catch (error) {
    console.error('Error incrementing category usage:', error);
    res.status(500).json({
      success: false,
      error: {
        english: 'Error incrementing category usage',
        arabic: 'حدث خطأ في تحديث عدد الاستخدام'
      }
    });
  }
});

module.exports = router;
