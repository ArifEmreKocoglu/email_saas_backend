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
import { startOutlookWatch, stopOutlookWatch, syncOutlookDelta } from "../controllers/outlookController.js";
import { addOutlookCategories } from "../controllers/outlookController.js";
const router = express.Router();

router.get("/", listByUser);

router.get("/:email/tags/internal", requireInternal, getInternalTagsConfig);


router.post("/:email/tags/init", requireAuth, initTagsConfig);
router.get("/:email/tags", requireAuth, getTagsConfig);
router.post("/:email/tags", requireAuth, saveTagsConfig);
router.delete("/:email/tags/:path", requireAuth, deleteTagPath);

router.delete("/:email", requireAuth, deleteMailAccount);
router.post("/:email/stop-watch", requireAuth, stopMailWatch);


router.post("/:email/outlook/stop-watch", requireAuth, stopOutlookWatch);
router.post("/:email/outlook/start-watch", requireAuth, startOutlookWatch);
router.post("/:email/outlook/categories", requireAuth, addOutlookCategories);
router.post("/:email/outlook/sync-delta", requireAuth, syncOutlookDelta);


export default router;