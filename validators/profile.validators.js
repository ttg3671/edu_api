import { body, query } from 'express-validator';

const safeStringRegex = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s_\-]+$/;

export const profileValidator = {
  getDetails: [
    query('device_id')
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
  ],

  updateDetails: [
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

    body('name')
      .trim()
      .notEmpty()
      .withMessage("Name required")
      .bail()
      .isLength({ min: 2, max: 100 })
      .withMessage("Name must be between 2 and 100 characters.")
      .bail()
      .matches(safeStringRegex)
      .withMessage("Name contains invalid characters (only letters, numbers, spaces, _ and - allowed)."),

    body('avatar_url')
      .optional()
      .trim()
      .isLength({ max: 100 }),

    body('bio')
      .optional()
      .trim()
  ]
};
