import { validationResult } from "express-validator";

/**
 * Handles validation errors from express-validator
 * @param {Request} req - Express request object
 * @throws {Error} Throws ValidationError if validation fails
 */
export const handleValidationErrors = (req) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const messages = errors.array().map(err => err.msg).join(', ');
    const validationError = new Error(messages);
    validationError.name = "ValidationError";
    validationError.statusCode = 400;
    throw validationError;
  }
};

/**
 * Creates a custom error with statusCode
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 400)
 * @returns {Error} Error object with statusCode property
 */
export const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

/**
 * Validates if IDs exist in a database table
 * @param {Object} connection - Database connection
 * @param {string} tableName - Name of the table
 * @param {Array<number>} ids - Array of IDs to validate
 * @param {string} errorMessage - Error message if validation fails
 * @throws {Error} Throws error if any ID is invalid
 */
export const validateIdsExist = async (connection, tableName, ids, errorMessage = "Invalid ID found. Try again...") => {
  if (!Array.isArray(ids) || ids.length === 0) {
    return;
  }

  const [rows] = await connection.query(
    `SELECT id FROM ${tableName} WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids
  );

  const foundIds = rows.map(row => row.id);
  const missing = ids.map(Number).filter(id => !foundIds.includes(id));

  if (missing.length > 0) {
    throw createError(errorMessage, 400);
  }
};

/**
 * Validates if a single ID exists in a database table
 * @param {Object} connection - Database connection
 * @param {string} tableName - Name of the table
 * @param {number} id - ID to validate
 * @param {string} errorMessage - Error message if validation fails
 * @throws {Error} Throws error if ID is invalid
 */
export const validateIdExists = async (connection, tableName, id, errorMessage = "Record not found.") => {
  const [[result]] = await connection.query(
    `SELECT 1 FROM ${tableName} WHERE id = ? LIMIT 1`,
    [id]
  );

  if (!result) {
    throw createError(errorMessage, 400);
  }
};

/**
 * Ensures a value is an array
 * @param {any} value - Value to convert
 * @returns {Array} Array version of the value
 */
export const ensureArray = (value) => {
  if (Array.isArray(value)) return value;
  return value !== undefined ? [value] : [];
};