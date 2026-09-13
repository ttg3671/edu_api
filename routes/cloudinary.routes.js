import express from 'express';
import * as cloudinaryControllers from '../controllers/cloudinary.controllers.js';
import * as cloudinaryValidators from '../validators/cloudinary.validators.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

/**
 * Route to generate a signed Cloudinary upload signature.
 */
router.get('/signature', cloudinaryControllers.getSignature);

/**
 * Route to delete an asset from Cloudinary.
 */
router.post('/delete', cloudinaryValidators.deleteAssetValidator, cloudinaryControllers.deleteAsset);

export default router;
