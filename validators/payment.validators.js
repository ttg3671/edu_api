import { query, param, body } from "express-validator";
const safeStringRegex = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s&?,.:'¿¡!()\-\s]+$/;

// Validation rules for subscription endpoint

export const subscriptionValidators = {  
  getIndex: [
    body("token")
      .trim()
      .notEmpty()
      .withMessage("You need to be login. Please log in first.")
      .bail()
      .matches(/^[^<>]*$/)
      .withMessage("Invalid token format."),
  ],

  checkoutOptions: [
    body("plan")
      .trim()
      .notEmpty()
      .withMessage("Plan name is required")
      .bail()
      .toLowerCase()
      .matches(safeStringRegex)
      .withMessage("Plan name must be a string"),
    body('device_id')
      .trim()
      .notEmpty()
      .withMessage("Oops, something went wrong")
      .bail()
      .isLength({ min: 8, max: 255 })
      .withMessage('Oops, something went wrong')
      .bail()
      .matches(/^[^<>]*$/)
      .withMessage('Oops, something went wrong')
      .bail()
      .matches(/^[A-Za-z0-9-:_]+$/)
      .withMessage('Oops, something went wrong'),
    body('device')
      .optional()
      .toLowerCase()
      .isIn(['web', 'app'])
  ],

  subscribe: [
    body("plan")
      .trim()
      .notEmpty()
      .withMessage("Plan name is required")
      .bail()
      .toLowerCase()
      .matches(safeStringRegex)
      .withMessage("Plan name must be a string"),
    body('device_id')
      .trim()
      .notEmpty()
      .withMessage("Oops, something went wrong")
      .bail()
      .isLength({ min: 8, max: 255 })
      .withMessage('Oops, something went wrong')
      .bail()
      .matches(/^[^<>]*$/)
      .withMessage('Oops, something went wrong')
      .bail()
      .matches(/^[A-Za-z0-9-:_]+$/)
      .withMessage('Oops, something went wrong'),
    body('device')
      .optional()
      .toLowerCase()
      .isIn(['web', 'app']),
    body('checksum')
      .trim()
      .notEmpty()
      .withMessage("We couldn't verify your checkout request. Please refresh the page and try again.")
      .bail()
      .matches(/^[a-fA-F0-9]+$/)
      .withMessage("Invalid checksum format")
  ],

  cancelSubscription: [
    body("subs_id")
      .trim()
      .notEmpty()
      .withMessage("Subscription ID is required")
      .bail()
      .isString()
      .withMessage("Subscription ID must be a string")
      .bail()
      .matches(/^[^<>]*$/)
      .withMessage("Invalid subscription ID format")
  ],

  subscriptionStatus: [
    query("session_id")
      .trim()
      .notEmpty()
      .withMessage("Checkout session ID is required")
      .bail()
      .isString()
      .withMessage("Invalid session format")
      .bail()
      .matches(/^[^<>]*$/)
      .withMessage("Invalid session format"),
  ],

  all: [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('cursor').optional().isInt({ min: 1 }).toInt()
  ],

  websiteLink: [
    param('device_id')
      .trim()
      .notEmpty()
      .withMessage("Oops, something went wrong")
      .bail()
      .isLength({ min: 8, max: 255 })
      .withMessage('Oops, something went wrong')
      .bail()
      .matches(/^[^<>]*$/)
      .withMessage('Oops, something went wrong')
      .bail()
      .matches(/^[A-Za-z0-9-:_]+$/)
      .withMessage('Oops, something went wrong'),
  ]
}; 