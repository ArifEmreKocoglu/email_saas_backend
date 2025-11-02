import express from "express";
import {
  listByUser,
  initTagsConfig,
  getTagsConfig,
  saveTagsConfig,
  deleteTagPath,
  deleteMailAccount, stopMailWatch 
} from "../controllers/mailAccountController.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

// 📨 Kullanıcının mail hesaplarını listele
router.get("/", listByUser);

// 🏷️ Tag yönetimi - Auth korumalı
router.post("/:email/tags/init", requireAuth, initTagsConfig);
router.get("/:email/tags", requireAuth, getTagsConfig);
router.post("/:email/tags", requireAuth, saveTagsConfig);
router.delete("/:email/tags/:path", requireAuth, deleteTagPath);

router.delete("/:email", requireAuth, deleteMailAccount);
router.post("/:email/stop-watch", requireAuth, stopMailWatch);

export default router;