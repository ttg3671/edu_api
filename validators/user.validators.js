import {body, query, param} from 'express-validator';
import { CategoryType } from '../utils/categoryType.js';

const safeStringRegex = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s_\-]+$/;

export const userValidator = {
  searchData: [
    query("term")
      .optional()
      .trim()
      .isString()
      .bail()
      .isLength({ min: 1, max: 100 })
      .withMessage("Search term must be between 1 and 100 characters")
      .bail()
      .matches(safeStringRegex)
      .withMessage("Invalid search term"),
    query("year").optional().isInt().withMessage("Year must be numeric"),
    query("month").optional().isInt({ min: 1, max: 12 }).withMessage("Month must be between 1 and 12"),
    query("page_items").optional().isInt({ min: 1 }).withMessage("Items must be a positive number"),
    query("pgNo").optional().isInt({ min: 1 }).withMessage("Page must be a positive number")
  ],

  getHomeData: [
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("cursor").optional().isInt({ min: 0 }).toInt()
  ],

  getNavPillById: [
    param("nav_pill_id")
      .trim()
      .notEmpty()
      .withMessage("ID is required")
      .bail()
      .isInt({ gt: 0 })
      .withMessage("ID must be a positive number"),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("cursor").optional().isInt({ min: 0 }).toInt()
  ],

  getSectionById: [
    param("section_id")
      .trim()
      .notEmpty()
      .withMessage("ID is required")
      .bail()
      .isInt({ gt: 0 })
      .withMessage("ID must be a positive number"),
    query("category_id")
      .optional()
      .isInt({ gt: 0 })
      .withMessage("ID must be a positive number"),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("cursor").optional().isInt({ min: 0 }).toInt()
  ],

  getModuleDetails: [
    param("module_id")
      .trim()
      .notEmpty()
      .withMessage("Module ID is required")
      .bail()
      .isInt({ gt: 0 })
      .withMessage("Module ID must be a positive number")
  ],

  getModulesLessons: [
    param("module_id")
      .trim()
      .notEmpty()
      .withMessage("Module ID is required")
      .bail()
      .isInt({ gt: 0 })
      .withMessage("Module ID must be a positive number"),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("cursor").optional().isInt({ min: 0 }).toInt(),
    query("syllabus_id").optional().isInt({ gt: 0 }).toInt()
  ],

  getLessonData: [
    param("video_provider_id")
      .trim()
      .notEmpty()
      .withMessage("Video provider ID is required")
      .bail()
      .isString()
      .withMessage("Invalid video provider ID"),
    param('ui_style')
      .trim()
      .notEmpty()
      .withMessage("UI Style is required")
      .bail()
      .isIn(['horizontal', 'vertical'])
      .withMessage('Invalid UI style')
  ],

  getFromWatchlist: [
    query("device")
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

    query('pgNo').optional().isInt({min:1}).toInt(),
    query('page_items').optional().isInt({min:1}).toInt(),
  ],

  getContinueWatching: [
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("cursor").optional().isInt({ min: 0 }).toInt(),
    query("pgNo").optional().isInt({ min: 1 }).toInt(),
    query("page_items").optional().isInt({ min: 1 }).toInt(),
  ],

  updateContinueWatching: [
    body("video_provider_id")
      .notEmpty()
      .trim()
      .withMessage()
      .bail()
      .isString()
      .withMessage("video_provider_id must be a string"),
    body("last_position_ms")
      .notEmpty()
      .withMessage("last_position_ms is required")
      .bail()
      .isInt({ min: 0 })
      .withMessage("last_position_ms must be a non-negative integer (milliseconds)")
      .bail()
      .custom((value, { req }) => {
        if (req.body.total_duration_ms !== undefined && Number(value) > Number(req.body.total_duration_ms)) {
          throw new Error("invalid timing");
        }
        return true;
      }),
    body("total_duration_ms")
      .notEmpty()
      .withMessage()
      .bail()
      .isInt({ min: 0 })
      .withMessage("total_duration_ms must be a non-negative integer (milliseconds)")
  ]
};
