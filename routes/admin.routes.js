import { Router } from "express";

import {
  category_groups_get,
  category_groups_post,
  category_groups_update,
  category_groups_delete,
  categories_get,
  categories_post,
  categories_update,
  category_delete,
  nav_pills_get,
  nav_pills_post,
  nav_pills_update,
  nav_pills_delete,
  collections_get,
  collections_post,
  collections_update,
  collections_delete,
  nav_pill_collections_get,
  nav_pill_collections_post,
  nav_pill_collections_update,
  nav_pill_collections_reorder,
  nav_pill_collections_delete,
  collection_modules_get,
  collection_modules_post,
  collection_modules_update,
  collection_modules_reorder,
  collection_modules_delete,
  home_page_config_get,
  home_page_config_post,
  home_page_config_update,
  home_page_config_reorder,
  home_page_config_delete,
  get_all_modules,
  modules_post,
  modules_edit,
  modules_update,
  modules_delete,
  modules_filter,
  modules_get_syllabus,
  syllabus_get,
  syllabus_post,
  syllabus_edit,
  syllabus_update,
  syllabus_reorder,
  syllabus_delete,
  syllabus_get_lessons,
  lessons_post,
  lessons_edit,
  lessons_update,
  lessons_reorder,
  lessons_delete,
  lessons_search,
  getVideoByLessonID,
  createVideo,
  updateVideo,
  deleteVideo,
  getUsers,
  getPlans,
  addPlan,
  updatePlan,
  deletePlan,
} from "../controllers/admin.controllers.js";

import {
  categoryGroupValidators,
  categoryValidators,
  navPillValidators,
  collectionValidators,
  navPillCollectionValidators,
  collectionModuleValidators,
  homePageConfigValidators,
  eduModuleValidators,
  syllabusValidators,
  lessonValidators,
  videoValidators,
  userValidators,
  planValidators
} from '../validators/admin.validators.js';

import authMiddleware from "../middleware/auth.middleware.js";
import authorizeRoles from "../middleware/role.middleware.js";
import { UserRole } from "../utils/enums.js";
import { asyncHandler, sendSuccess } from "../utils/paginationHelper.js";
import { getDeliveryStats } from "../services/emailSecurity.service.js";


const adminRouter = Router();

adminRouter.use(authMiddleware, authorizeRoles(UserRole.ADMIN));

// ------------ CATEGORY GROUPS ------------
adminRouter.get("/category-groups", categoryGroupValidators.all, category_groups_get);
adminRouter.post("/category-groups", categoryGroupValidators.create, category_groups_post);
adminRouter.put("/category-groups/:id", categoryGroupValidators.update, category_groups_update);
adminRouter.delete("/category-groups/:id", categoryGroupValidators.delete, category_groups_delete);

// ------------ CATEGORIES ------------
adminRouter.get("/categories", categoryValidators.all, categories_get);
adminRouter.get("/categories/:group_id", categoryValidators.all, categories_get);
adminRouter.post("/categories", categoryValidators.create, categories_post);
adminRouter.put("/categories/:id", categoryValidators.update, categories_update);
adminRouter.delete("/categories/:id", categoryValidators.delete, category_delete);

// ------------ NAV PILLS ------------
adminRouter.get("/nav-pills", navPillValidators.all, nav_pills_get);
adminRouter.post("/nav-pills", navPillValidators.create, nav_pills_post);
adminRouter.put("/nav-pills/:id", navPillValidators.update, nav_pills_update);
adminRouter.delete("/nav-pills/:id", navPillValidators.delete, nav_pills_delete);

// ------------ COLLECTIONS ------------
adminRouter.get("/collections", collectionValidators.all, collections_get);
adminRouter.post("/collections", collectionValidators.create, collections_post);
adminRouter.put("/collections/:id", collectionValidators.update, collections_update);
adminRouter.delete("/collections/:id", collectionValidators.delete, collections_delete);

// ------------ NAV PILL COLLECTIONS ------------
adminRouter.get("/nav-pill-collections/:nav_pill_id", navPillCollectionValidators.get, nav_pill_collections_get);
adminRouter.post("/nav-pill-collections", navPillCollectionValidators.upsert, nav_pill_collections_post);
adminRouter.put("/nav-pill-collections/reorder", navPillCollectionValidators.reorder, nav_pill_collections_reorder);
adminRouter.put("/nav-pill-collections/:nav_pill_id", navPillCollectionValidators.update, nav_pill_collections_update);
adminRouter.delete("/nav-pill-collections/:id", navPillCollectionValidators.delete, nav_pill_collections_delete);

// ------------ COLLECTION MODULES ------------
adminRouter.get("/collection-modules/:collection_id", collectionModuleValidators.get, collection_modules_get);
adminRouter.post("/collection-modules", collectionModuleValidators.upsert, collection_modules_post);
adminRouter.put("/collection-modules/reorder", collectionModuleValidators.reorder, collection_modules_reorder);
adminRouter.put("/collection-modules/:collection_id", collectionModuleValidators.update, collection_modules_update);
adminRouter.delete("/collection-modules/:id", collectionModuleValidators.delete, collection_modules_delete);

// ------------ HOME PAGE CONFIG ------------
adminRouter.get("/home-config", home_page_config_get);
adminRouter.post("/home-config", homePageConfigValidators.create, home_page_config_post);
adminRouter.put("/home-config/reorder", homePageConfigValidators.reorder, home_page_config_reorder);
adminRouter.put("/home-config/:id", homePageConfigValidators.update, home_page_config_update);
adminRouter.delete("/home-config/:id", homePageConfigValidators.delete, home_page_config_delete);

// ------------ MODULES ------------
adminRouter.get("/modules", eduModuleValidators.all, get_all_modules);
adminRouter.post("/modules", eduModuleValidators.create, modules_post);
adminRouter.get("/modules/filter", eduModuleValidators.search, modules_filter);
adminRouter.get("/modules/:id", eduModuleValidators.get, modules_edit);
adminRouter.put("/modules/:id", eduModuleValidators.update, modules_update);
adminRouter.delete("/modules/:id", eduModuleValidators.delete, modules_delete);
adminRouter.get("/modules/syllabus/:id", eduModuleValidators.get, modules_get_syllabus);

// ------------ SYLLABUS ------------
adminRouter.get("/syllabus", syllabusValidators.all, syllabus_get);
adminRouter.post("/syllabus", syllabusValidators.create, syllabus_post);
adminRouter.put("/syllabus/reorder", syllabusValidators.reorder, syllabus_reorder);
adminRouter.get("/syllabus/:id", syllabusValidators.get, syllabus_edit);
adminRouter.put("/syllabus/:id", syllabusValidators.update, syllabus_update);
adminRouter.delete("/syllabus/:id", syllabusValidators.delete, syllabus_delete);
adminRouter.get("/syllabus/lessons/:id", syllabusValidators.get, syllabus_get_lessons);

// ------------ LESSONS ------------
adminRouter.post("/lessons", lessonValidators.create, lessons_post);
adminRouter.put("/lessons/reorder", lessonValidators.reorder, lessons_reorder);
adminRouter.get("/lessons/search", lessonValidators.search, lessons_search);
adminRouter.get("/lessons/:id", lessonValidators.get, lessons_edit);
adminRouter.put("/lessons/:id", lessonValidators.update, lessons_update);
adminRouter.delete("/lessons/:id", lessonValidators.delete, lessons_delete);

// ------------ VIDEOS ------------
adminRouter.get("/video/:lesson_id", videoValidators.get, getVideoByLessonID);
adminRouter.post("/video", videoValidators.create, createVideo);
adminRouter.put("/video/:id", videoValidators.update, updateVideo);
adminRouter.delete("/video/:video_provider_id/:lesson_id", videoValidators.delete, deleteVideo);

// ------------ USERS ------------
adminRouter.get("/users", userValidators.get, getUsers);

// ------------ PLANS ------------
adminRouter.get("/plans", planValidators.all, getPlans);
adminRouter.post("/plans", planValidators.add, addPlan);
adminRouter.put("/plans/:id", planValidators.update, updatePlan);
adminRouter.delete("/plans/:id", planValidators.delete, deletePlan);

// ------------ EMAIL DELIVERY MONITORING ------------
adminRouter.get("/email-stats", asyncHandler(async (req, res) => {
  const stats = await getDeliveryStats();
  return sendSuccess(res, stats, "Email delivery statistics retrieved successfully.");
}));

export default adminRouter;

