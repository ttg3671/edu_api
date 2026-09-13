import { body } from 'express-validator';

/**
 * Validates parameters for signed Cloudinary upload signature request.
 */
export const getSignatureValidator = [
    // You can add more specific validation if you want to restrict folders or transformations
    body('folder').optional().isString().trim(),
    body('public_id').optional().isString().trim(),
    body('upload_preset').optional().isString().trim(),
    body('tags').optional().isString().trim(),
    body('context').optional().isString().trim(),
    body('metadata').optional().isString().trim(),
    body('transformation').optional().isString().trim(),
    body('resource_type').optional().isIn(['image', 'video', 'raw', 'auto']).withMessage('Invalid resource_type'),
];

/**
 * Validates parameters for deleting an asset.
 */
export const deleteAssetValidator = [
    body('public_id')
        .trim()
        .notEmpty()
        .withMessage('public_id is required')
        .bail()
        .isString()
        .withMessage('public_id must be a string'),
    body('resource_type').optional().isIn(['image', 'video', 'raw']).withMessage('Invalid resource_type'),
];
