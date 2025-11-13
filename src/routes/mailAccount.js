import express from "express";
import {
  listByUser,
  initTagsConfig,
  getTagsConfig,
  saveTagsConfig,
  deleteTagPath,
  deleteMailAccount, stopMailWatch, 
  getInternalTagsConfig
} from "../controllers/mailAccountController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireInternal } from "../middlewares/requireInternal.js";

const router = express.Router();

router.get("/", listByUser);

// INTERNAL ROUTE FIRST!!! 🔥
router.get("/:email/tags/internal", requireInternal, getInternalTagsConfig);

// AUTH ROUTES
router.post("/:email/tags/init", requireAuth, initTagsConfig);
router.get("/:email/tags", requireAuth, getTagsConfig);
router.post("/:email/tags", requireAuth, saveTagsConfig);
router.delete("/:email/tags/:path", requireAuth, deleteTagPath);

router.delete("/:email", requireAuth, deleteMailAccount);
router.post("/:email/stop-watch", requireAuth, stopMailWatch);

export default router;