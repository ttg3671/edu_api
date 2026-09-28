import cloudinary from "../config/cloudinary.js";
import { asyncHandler, sendSuccess } from "../utils/paginationHelper.js";
import { handleValidationErrors, createError } from "../utils/validationHelper.js";

/**
 * Generates a signed Cloudinary upload signature.
 * Used on the client-side for secure direct uploads.
 */
export const getSignature = asyncHandler(async (req, res) => {
    handleValidationErrors(req);

    const timestamp = Math.round(Date.now() / 1000);

    // ONLY include params Cloudinary expects.
    // The frontend must send every one of these (except the signature inputs it doesn't own) in the upload request,
    // otherwise Cloudinary rejects the upload with "Invalid Signature".
    const paramsToSign = {
        timestamp,
        folder: "uploads",
        // Incoming transformation: shrink large originals to fit 1920x1080 (keeps aspect ratio, never upscales)
        // and recompress before storing, so every delivered image starts from a small source
        transformation: "c_limit,w_1920,h_1080/q_auto:good",
        allowed_formats: "jpg,jpeg,png,webp"
    };

    const signature = cloudinary.utils.api_sign_request(
        paramsToSign,
        cloudinary.config().api_secret
    );

    sendSuccess(res, {
        ...paramsToSign,
        signature,
        cloud_name: cloudinary.config().cloud_name,
        api_key: cloudinary.config().api_key
    });
});


/**
 * Deletes an asset from Cloudinary.
 * Expects public_id in req.body.
 */

export const deleteAsset = asyncHandler(async (req, res) => {
    handleValidationErrors(req);
    const { public_id } = req.body;

    // Directly delete the asset from Cloudinary using your server's SDK credentials
    const result = await cloudinary.uploader.destroy(public_id);

    // console.log(result);

    return sendSuccess(res, null);
});