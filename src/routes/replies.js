import express from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireInternal } from "../middlewares/requireInternal.js";
import {
  getReplyContext,
  requestReplyGeneration,
  generateReply,
  getReplyDraft,
  saveReplyDraft,
} from "../controllers/replyController.js";

const router = express.Router();

// Reply Context
router.get("/:logId/context", requireAuth, getReplyContext);

// ✅ FRONTEND burayı çağırır (n8n tetiklenir)
router.post("/:logId/request-generate", requireAuth, requestReplyGeneration);

// ✅ SADECE n8n burayı çağırır
router.post("/:logId/generate", requireInternal, generateReply);

// Draft
router.get("/:logId", requireAuth, getReplyDraft);
router.post("/:logId/save-draft", requireAuth, saveReplyDraft);

export default router;
