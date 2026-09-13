import { Router } from "express";

import {
  get_search_data,
  get_home_data,
  get_nav_pill_collections,
  getModuleDetails,
  get_section_content,
  getModulesLessonsData,
  get_lesson_data,
  getPlans,
  get_latest_subscription,
  update_continue_watching,
  get_continue_watching_list,
  get_continue_watching_by_id
} from "../controllers/user.controllers.js";

import { userValidator } from "../validators/user.validators.js";

import authMiddleware from "../middleware/auth.middleware.js";
import { cacheMiddleware } from "../middleware/cache.middleware.js";

import authorizeRoles from "../middleware/role.middleware.js";
import { UserRole } from "../utils/enums.js";
import requireVerifiedEmail from "../middleware/emailVerified.middleware.js";

const userRouter = Router();

// Get users plans
userRouter.get(
  "/plans", 
  getPlans
);

// Get search data by term and date
userRouter.get(
  "/search", 
  userValidator.searchData, 
  get_search_data
);

// Get home page data
userRouter.get(
  "/home", 
  userValidator.getHomeData, 
  get_home_data
);

userRouter.get(
  "/nav-pill/:nav_pill_id", 
  userValidator.getNavPillById, 
  get_nav_pill_collections
);

// Get more content for a specific section (infinite scroll)
userRouter.get(
  "/section/:section_id", 
  userValidator.getSectionById, 
  get_section_content
);

// Get module details by module_id
userRouter.get(
  "/modules/:module_id",
  userValidator.getModuleDetails, 
  getModuleDetails
);

// Get module with lessons (paginated)
userRouter.get(
  "/modules-lessons/:module_id", 
  authMiddleware, 
  authorizeRoles(UserRole.USER), 
  requireVerifiedEmail,
  userValidator.getModulesLessons, 
  getModulesLessonsData
);

// Get individual lesson data
userRouter.get(
  "/lesson/:video_provider_id/:ui_style", 
  authMiddleware, 
  authorizeRoles(UserRole.USER), 
  requireVerifiedEmail,
  userValidator.getLessonData, 
  get_lesson_data
);

// Get user's latest subscription details
userRouter.get(
  "/latest-subscription", 
  authMiddleware, 
  authorizeRoles(UserRole.USER), 
  get_latest_subscription
);

// Continue Watching Routes
userRouter.get(
  "/continue-watching",
  authMiddleware,
  authorizeRoles(UserRole.USER),
  userValidator.getContinueWatching,
  get_continue_watching_list
);

userRouter.post(
  "/continue-watching",
  authMiddleware,
  authorizeRoles(UserRole.USER),
  userValidator.updateContinueWatching,
  update_continue_watching
);

userRouter.put(
  "/continue-watching",
  authMiddleware,
  authorizeRoles(UserRole.USER),
  userValidator.updateContinueWatching,
  update_continue_watching
);

userRouter.get(
  "/continue-watching/:video_id",
  authMiddleware,
  authorizeRoles(UserRole.USER),
  get_continue_watching_by_id
);

export default userRouter;
