import mongoose from "mongoose";
import axios from "axios";
import WorkflowLog from "../models/Workflow.js";
import ReplyDraft from "../models/ReplyDraft.js";
import MailAccount from "../models/MailAccount.js";

import { createGmailDraft } from "../services/gmailDraftService.js";
import { createOutlookDraft } from "../services/outlookDraftService.js";

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */
function assertObjectId(id) {
  return mongoose.isValidObjectId(id);
}

function getAuthUser(req) {
  return req.auth?.userId || null;
}

/* -------------------------------------------------
   GET /context
   → Log + mail bilgisi
-------------------------------------------------- */
export async function getReplyContext(req, res) {
  try {
    const { logId } = req.params;
    const userId = getAuthUser(req);

    if (!assertObjectId(logId)) {
      return res.status(400).json({ error: "Invalid logId" });
    }

    const log = await WorkflowLog.findOne({
      _id: logId,
      userId,
      awaitingReply: true,
    }).lean();

    if (!log) {
      return res.status(404).json({ error: "Reply context not found" });
    }

    const draft = await ReplyDraft.findOne({ logId, userId }).lean();

    return res.json({
      log: {
        id: log._id,
        subject: log.subject,
        email: log.email,
        createdAt: log.createdAt,
        workflowName: log.workflowName,
        provider: log.provider || null,
        threadId: log.threadId || null,
      },
      draft: draft || null,
    });
  } catch (e) {
    console.error("[getReplyContext]", e);
    res.status(500).json({ error: e.message });
  }
}

/* -------------------------------------------------
   POST /generate
   → n8n AI reply generate
-------------------------------------------------- */
export async function generateReply(req, res) {
  try {
    const { logId } = req.params;
    const { tone = "professional", language = "auto" } = req.body || {};

    if (!mongoose.isValidObjectId(logId)) {
      return res.status(400).json({ error: "Invalid logId" });
    }

    // ❗️ userId'yi AUTH'TAN ALMIYORUZ
    const log = await WorkflowLog.findOne({
      _id: logId,
      awaitingReply: true,
    });

    if (!log) {
      return res.status(404).json({ error: "Log not found" });
    }

    // ✅ userId burada resolve edilir
    const userId = log.userId;

    let draft = await ReplyDraft.findOne({ logId, userId });

    if (!draft) {
      const acc = await MailAccount.findOne({
        email: log.email,
        userId,
        status: "active",
      }).lean();

      if (!acc) {
        return res.status(404).json({ error: "MailAccount not found" });
      }

      draft = await ReplyDraft.create({
        logId,
        userId,
        provider: acc.provider,
        email: acc.email,
        status: "idle",
        replies: [],
      });
    }

    if (draft.replies.length >= 3) {
      return res.status(400).json({ error: "Reply limit reached (3)" });
    }

    // n8n zaten burayı çağırdığı için,
    // burada AI üretimi yapılmış TEXT bekliyoruz
    const { text, model } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Missing reply text" });
    }

    draft.replies.push({
      text,
      tone,
      language,
      provider: "n8n",
      model: model || null,
    });

    draft.status = "completed";
    await draft.save();

    return res.json({ ok: true });
  } catch (e) {
    console.error("[generateReply]", e);
    res.status(500).json({ error: e.message });
  }
}

/* -------------------------------------------------
   GET /:logId
   → Draft state
-------------------------------------------------- */
export async function getReplyDraft(req, res) {
  try {
    const { logId } = req.params;
    const userId = getAuthUser(req);

    if (!assertObjectId(logId)) {
      return res.status(400).json({ error: "Invalid logId" });
    }

    const draft = await ReplyDraft.findOne({ logId, userId }).lean();
    return res.json(draft || null);
  } catch (e) {
    console.error("[getReplyDraft]", e);
    res.status(500).json({ error: e.message });
  }
}

/* -------------------------------------------------
   POST /save-draft
   → Gmail / Outlook draft (REAL)
-------------------------------------------------- */
export async function saveReplyDraft(req, res) {
  try {
    const { logId } = req.params;
    const userId = getAuthUser(req);
    const { selectedIndex } = req.body || {};

    if (!assertObjectId(logId)) {
      return res.status(400).json({ error: "Invalid logId" });
    }

    const draft = await ReplyDraft.findOne({ logId, userId });
    if (!draft) {
      return res.status(404).json({ error: "Draft not found" });
    }

    const reply = draft.replies[selectedIndex];
    if (!reply) {
      return res.status(400).json({ error: "Invalid reply selection" });
    }

    const log = await WorkflowLog.findById(logId).lean();
    if (!log) {
      return res.status(404).json({ error: "Log not found" });
    }

    let result;

    if (draft.provider === "gmail") {
      result = await createGmailDraft({
        userId,
        email: draft.email,
        to: log.email,
        subject: log.subject,
        body: reply.text,
        threadId: log.threadId || null,
      });
    } else if (draft.provider === "outlook") {
      result = await createOutlookDraft({
        userId,
        email: draft.email,
        to: log.email,
        subject: log.subject,
        body: reply.text,
        threadId: log.threadId || null,
      });
    } else {
      return res.status(400).json({ error: "Unsupported provider" });
    }

    draft.selectedIndex = selectedIndex;
    draft.status = "drafted";
    draft.savedAt = new Date();
    draft.draftProviderId = result.draftId;

    await draft.save();

    return res.json({
      ok: true,
      provider: draft.provider,
      draftId: result.draftId,
      threadId: result.threadId || null,
    });
  } catch (e) {
    console.error("[saveReplyDraft]", e);
    res.status(500).json({ error: e.message });
  }
}


/* -------------------------------------------------
   POST /request-generate
   → Frontend tetikler (n8n async)
-------------------------------------------------- */
export async function requestReplyGeneration(req, res) {
  try {
    const { logId } = req.params;
    const userId = getAuthUser(req);
    const { tone = "professional", language = "auto" } = req.body || {};

    if (!assertObjectId(logId)) {
      return res.status(400).json({ error: "Invalid logId" });
    }

    const log = await WorkflowLog.findOne({
      _id: logId,
      userId,
      awaitingReply: true,
    }).lean();

    if (!log) {
      return res.status(404).json({ error: "Log not found" });
    }

    let draft = await ReplyDraft.findOne({ logId, userId });

    if (!draft) {
      const acc = await MailAccount.findOne({
        email: log.email,
        userId,
        status: "active",
      }).lean();

      if (!acc) {
        return res.status(404).json({ error: "MailAccount not found" });
      }

      draft = await ReplyDraft.create({
        logId,
        userId,
        provider: acc.provider,
        email: acc.email,
        status: "idle",
        replies: [],
      });
    }

    if (draft.replies.length >= 3) {
      return res.status(400).json({ error: "Reply limit reached (3)" });
    }

    // 🔔 n8n ASYNC tetik
    await axios.post(
      `${process.env.N8N_URL}/webhook/reply-generate-v1`,
      {
        logId,
        subject: log.subject,
        email: log.email,
        tone,
        language,
        attempt: draft.replies.length,
        provider: draft.provider,
      },
      { timeout: 10_000 }
    );

    return res.json({
      ok: true,
      status: "queued",
      message: "AI reply generation started",
    });
  } catch (e) {
    console.error("[requestReplyGeneration]", e);
    res.status(500).json({ error: e.message });
  }
}
