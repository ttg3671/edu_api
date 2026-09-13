import { body, param, query } from 'express-validator';

// Common Name Validator for reusability
// Regex allows: letters (including Spanish), numbers, spaces, underscores, and hyphens.
// Whitelisting naturally prevents malicious code like <script> by excluding < > and other special characters.
const safeStringRegex = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s&?,.:'¿¡!()\-\s]+$/;

const nameValidation = (fieldLabel = 'Name', fieldName = 'name') =>
  body(fieldName)
    .trim()
    .notEmpty()
    .withMessage(`${fieldLabel} is required`)
    .bail()
    .isLength({ min: 2, max: 100 })
    .withMessage(`${fieldLabel} must be between 2 and 100 characters`)
    .bail()
    .matches(safeStringRegex)
    .withMessage(`${fieldLabel} contains invalid characters (only letters, numbers, spaces, &, and single quotes are allowed)`);

const titleValidation = (fieldLabel = 'Title') =>
  body('title')
    .trim()
    .notEmpty()
    .withMessage(`${fieldLabel} is required`)
    .bail()
    .isLength({ min: 2, max: 100 })
    .withMessage(`${fieldLabel} must be between 2 and 100 characters`)
    .bail()
    .matches(safeStringRegex)
    .withMessage(`${fieldLabel} contains invalid characters (only letters, numbers, spaces, &, and single quotes are allowed)`);

export const categoryGroupValidators = {
  all: [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ],
  create: [
    nameValidation('Group name', 'group_name')
  ],
  update: [
    param('id').isInt({ gt: 0 }).withMessage('Valid ID required'),
    nameValidation('Group name', 'group_name')
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid ID required')
  ]
};

export const categoryValidators = {
  all: [
    param('group_id').optional().isInt({ min: 1 }).toInt(),
    query('group_id').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ],
  create: [
    body('group_id').notEmpty().withMessage('Group ID is required').bail().isInt({ gt: 0 }).withMessage('Valid Group ID required'),
    nameValidation('Category name')
  ],
  update: [
    param('id').isInt({ gt: 0 }).withMessage('Valid Category ID required'),
    body('group_id').notEmpty().withMessage('Group ID is required').bail().isInt({ gt: 0 }).withMessage('Valid Group ID required'),
    nameValidation('Category name')
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid Category ID required')
  ]
};

export const navPillValidators = {
  all: [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ],
  create: [
    nameValidation('Nav pill name'),
    body('active_color').optional().isHexColor().withMessage('Invalid hex color'),
    body('ui_style').optional().isIn(['grid', 'list', 'scroll']).withMessage('Invalid UI style')
  ],
  update: [
    param('id').isInt({ gt: 0 }).withMessage('Valid ID required'),
    nameValidation('Nav pill name'),
    body('active_color').optional().isHexColor().withMessage('Invalid hex color'),
    body('ui_style').optional().isIn(['grid', 'list', 'scroll']).withMessage('Invalid UI style')
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid ID required')
  ]
};

export const collectionValidators = {
  all: [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ],
  create: [
    nameValidation('Collection name'),
    body('layout_type').optional().isIn(['horizontal_scroll', 'vertical_grid', 'featured_hero']).withMessage('Invalid layout type'),
    body('aspect_ratio').optional().matches(/^\d+:\d+$/).withMessage('Invalid aspect ratio format (e.g. 16:9)')
  ],
  update: [
    param('id').isInt({ gt: 0 }).withMessage('Valid ID required'),
    nameValidation('Collection name'),
    body('layout_type').optional().isIn(['horizontal_scroll', 'vertical_grid', 'featured_hero']).withMessage('Invalid layout type'),
    body('aspect_ratio').optional().matches(/^\d+:\d+$/).withMessage('Invalid aspect ratio format (e.g. 16:9)')
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid ID required')
  ]
};

export const navPillCollectionValidators = {
  get: [
    param('nav_pill_id').isInt({ gt: 0 }).withMessage('Valid Nav Pill ID required')
  ],
  upsert: [
    body('nav_pill_id').notEmpty().withMessage('Nav Pill ID is required').bail().isInt({ gt: 0 }).withMessage('Valid Nav Pill ID required'),
    body('collection_ids').notEmpty().withMessage('Collection IDs are required').bail().isArray({ min: 1 }).withMessage('Collection IDs must be a non-empty array'),
    body('collection_ids.*').isInt({ gt: 0 }).withMessage('Each Collection ID must be a valid integer'),
  ],
  update: [
    param('nav_pill_id').isInt({ gt: 0 }).withMessage('Valid Nav Pill ID required'),
    body('collection_ids').notEmpty().withMessage('Collection IDs are required').bail().isArray({ min: 1 }).withMessage('Collection IDs must be a non-empty array'),
    body('collection_ids.*').isInt({ gt: 0 }).withMessage('Each Collection ID must be a valid integer'),
  ],
  reorder: [
    body('id').notEmpty().withMessage('ID is required').bail().isInt({ gt: 0 }).withMessage('Valid ID required'),
    body('new_position').optional().isFloat({ min: 0 }).withMessage('New position must be a non-negative integer'),
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid ID required')
  ]
};

export const collectionModuleValidators = {
  get: [
    param('collection_id').isInt({ gt: 0 }).withMessage('Valid Collection ID required')
  ],
  upsert: [
    body('collection_id').notEmpty().withMessage('Collection ID is required').bail().isInt({ gt: 0 }).withMessage('Valid Collection ID required'),
    body('module_ids').notEmpty().withMessage('Module IDs are required').bail().isArray({ min: 1 }).withMessage('Module IDs must be a non-empty array'),
    body('module_ids.*').isInt({ gt: 0 }).withMessage('Each Module ID must be a valid integer'),
  ],
  update: [
    param('collection_id').isInt({ gt: 0 }).withMessage('Valid Collection ID required'),
    body('module_ids').notEmpty().withMessage('Module IDs are required').bail().isArray({ min: 1 }).withMessage('Module IDs must be a non-empty array'),
    body('module_ids.*').isInt({ gt: 0 }).withMessage('Each Module ID must be a valid integer'),
  ],
  reorder: [
    body('id').notEmpty().withMessage('ID is required').bail().isInt({ gt: 0 }).withMessage('Valid ID required'),
    body('new_position').optional().isFloat({ min: 0 }).withMessage('New position must be a non-negative integer'),
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid ID required')
  ]
};

export const homePageConfigValidators = {
  create: [
    body('nav_pill_id').notEmpty().withMessage('Nav Pill ID is required').bail().isInt({ gt: 0 }).withMessage('Valid Nav Pill ID required'),
    body('is_visible').optional().isBoolean().toBoolean()
  ],
  update: [
    param('id').isInt({ gt: 0 }).withMessage('Valid ID required'),
    body('nav_pill_id').notEmpty().withMessage('Nav Pill ID is required').bail().isInt({ gt: 0 }).withMessage('Valid Nav Pill ID required'),
    body('is_visible').optional().isBoolean().toBoolean()
  ],
  reorder: [
    body('id').notEmpty().withMessage('ID is required').bail().isInt({ gt: 0 }).withMessage('Valid ID required'),
    body('new_position').optional().isFloat({ min: 0 }).withMessage('New position must be a non-negative integer')
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid ID required')
  ]
};

export const eduModuleValidators = {
  all: [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ],
  search: [
    query('searchTerm').optional().trim().isLength({ min: 1, max: 200 }),
    query('category').optional().isInt({ gt: 0 }),
    query('limit').optional().isInt({ min: 1 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ],
  get: [
    param('id').isInt({ gt: 0 }).withMessage('Valid module ID required')
  ],
  create: [
    titleValidation('Module title'),
    body('description').optional({ nullable: true }).trim().isString().withMessage('Description must be a string'),
    body('thumbnail_url').trim().notEmpty().withMessage("Thumbnail URL is required"),
    body('is_active').optional().isBoolean().toBoolean(),
    body('is_free').optional().isBoolean().toBoolean(),
    body('categories').optional().isArray().withMessage('Categories must be an array of IDs'),
    body('categories.*').optional().isInt({ gt: 0 }).withMessage('Each Category ID must be a positive integer')
  ],
  update: [
    param('id').isInt({ gt: 0 }).withMessage('Valid module ID required'),
    titleValidation('Module title'),
    body('description').optional({ nullable: true }).trim().isString().withMessage('Description must be a string'),
    body('thumbnail_url').trim().notEmpty().withMessage("Thumbnail URL is required"),
    body('is_active').optional().isBoolean().toBoolean(),
    body('is_free').optional().isBoolean().toBoolean(),
    body('categories').optional().isArray().withMessage('Categories must be an array of IDs'),
    body('categories.*').optional().isInt({ gt: 0 }).withMessage('Each Category ID must be a positive integer')
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid module ID required')
  ]
};

export const syllabusValidators = {
  all: [
    query('limit').optional().isInt({ min: 1 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ],
  get: [
    param('id').isInt({ gt: 0 }).withMessage('Valid syllabus ID required')
  ],
  create: [
    body('module_id').notEmpty().withMessage('Module ID is required').bail().isInt({ gt: 0 }).withMessage('Valid module ID required'),
    titleValidation('Syllabus title'),
    body('workout_instructions').optional({ nullable: true }).trim().isString().withMessage('Workout instructions must be a string')
  ],
  update: [
    param('id').isInt({ gt: 0 }).withMessage('Valid syllabus ID required'),
    titleValidation('Syllabus title'),
    body('workout_instructions').optional({ nullable: true }).trim().isString().withMessage('Workout instructions must be a string')
  ],
  reorder: [
    body('id').notEmpty().withMessage('ID is required').bail().isInt({ gt: 0 }).withMessage('Valid ID required'),
    body('new_position').optional().isFloat({ min: 0 }).withMessage('New position must be a non-negative integer'),
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid syllabus ID required')
  ]
};

export const lessonValidators = {
  all: [
    query('limit').optional().isInt({ min: 1 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ],
  get: [
    param('id').isInt({ gt: 0 }).withMessage('Valid lesson ID required')
  ],
  create: [
    body('syllabus_id').notEmpty().withMessage('Syllabus ID is required').bail().isInt({ gt: 0 }).withMessage('Valid syllabus ID required'),
    titleValidation('Lesson title'),
    body('workout_instructions').optional({ nullable: true }).trim().isString().withMessage('Workout instructions must be a string')
  ],
  update: [
    param('id').isInt({ gt: 0 }).withMessage('Valid lesson ID required'),
    body('syllabus_id').notEmpty().withMessage('Syllabus ID is required').bail().isInt({ gt: 0 }).withMessage('Valid syllabus ID required'),
    titleValidation('Lesson title'),
    body('workout_instructions').optional({ nullable: true }).trim().isString().withMessage('Workout instructions must be a string')
  ],
  reorder: [
    body('id').notEmpty().withMessage('ID is required').bail().isInt({ gt: 0 }).withMessage('Valid ID required'),
    body('new_position').optional().isFloat({ min: 0 }).withMessage('New position must be a non-negative integer'),
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid lesson ID required')
  ],
  search: [
    query('searchTerm').optional().trim().isLength({ min: 1, max: 200 }),
    query('syllabus_id').optional().isInt({ gt: 0 }),
    query('limit').optional().isInt({ min: 1 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ]
};

export const videoValidators = {
  get: [
    param('lesson_id').isInt({ gt: 0 }).withMessage('Valid lesson ID required')
  ],
  create: [
    body('lesson_id').notEmpty().withMessage('Lesson ID is required').bail().isInt({ gt: 0 }).withMessage('Valid lesson ID required'),
    body('video_provider_id').trim().notEmpty().withMessage("video_provider_id is required"),
    body('ui_style').optional().isIn(['horizontal', 'vertical']).withMessage('Invalid UI style')
  ],
  update: [
    param('id').isInt({ gt: 0 }).withMessage('Video ID required'),
    body('lesson_id').notEmpty().withMessage('Lesson ID is required').bail().isInt({ gt: 0 }).withMessage('Valid lesson ID required'),
    body('video_provider_id').trim().notEmpty().withMessage("video_provider_id is required"),
    body('ui_style').optional().isIn(['horizontal', 'vertical']).withMessage('Invalid UI style')
  ],
  delete: [
    param('video_provider_id').trim().notEmpty().withMessage("video_provider_id is required"),
    param('lesson_id').isInt({ gt: 0 }).withMessage('Valid lesson ID required')
  ]
};

export const userValidators = {
  get: [
    query('limit').optional().isInt({ min: 1 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ]
};

export const planValidators = {
  all: [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ],
  add: [
    nameValidation('Plan name', 'plan_name'),
    body('max_screens').notEmpty().withMessage('Max screens is required').bail().isInt({ min: 1 }).withMessage('Valid number of screens required'),
    body('stripe_price_id').trim().notEmpty().withMessage('Valid stripe_price_id required'),
    body('monthly_price').notEmpty().withMessage('Monthly price is required').bail().isDecimal().withMessage('Valid monthly_price required'),
    body('duration_value').notEmpty().withMessage('Duration value is required').bail().isInt({ min: 1 }).withMessage('Valid number of duration value required'),
    body("duration_unit")
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage("Invalid duration unit"),
    body('is_active').optional().isBoolean().toBoolean()
  ],
  update: [
    param('id').isInt({ gt: 0 }).withMessage('Valid Plan ID required'),
    nameValidation('Plan name', 'plan_name'),
    body('max_screens').notEmpty().withMessage('Max screens is required').bail().isInt({ min: 1 }).withMessage('Valid number of screens required'),
    body('stripe_price_id').trim().notEmpty().withMessage('Valid stripe_price_id required'),
    body('monthly_price').notEmpty().withMessage('Monthly price is required').bail().isDecimal().withMessage('Valid monthly_price required'),
    body('duration_value').notEmpty().withMessage('Duration value is required').bail().isInt({ min: 1 }).withMessage('Valid number of duration value required'),
    body("duration_unit")
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage("Invalid duration unit"),
    body('is_active').optional().isBoolean().toBoolean()
  ],
  delete: [
    param('id').isInt({ gt: 0 }).withMessage('Valid Plan ID required')
  ]
};

