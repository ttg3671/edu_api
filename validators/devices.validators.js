import { body } from 'express-validator';

export const deviceValidator = {
  get: [
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
  ],
  delete: [
    body("current_device_id")
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
  ]
};
