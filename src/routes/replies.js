import express from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import {
  getReplyContext,
  generateReply,
  getReplyDraft,
  saveReplyDraft,
} from "../controllers/replyController.js";

const router = express.Router();

/* ---------------------------------
   Reply Context (log + mail info)
---------------------------------- */
// Frontend: log detail page load
router.get("/:logId/context", requireAuth, getReplyContext);

/* ---------------------------------
   Generate AI Reply (n8n trigger)
---------------------------------- */
// Frontend: "Generate Reply" button
router.post("/:logId/generate", requireAuth, generateReply);

/* ---------------------------------
   Get Draft State
---------------------------------- */
// Frontend: page refresh / resume
router.get("/:logId", requireAuth, getReplyDraft);

/* ---------------------------------
   Save as Draft (Gmail / Outlook)
---------------------------------- */
// Frontend: "Save as Draft"
router.post("/:logId/save-draft", requireAuth, saveReplyDraft);

export default router;
