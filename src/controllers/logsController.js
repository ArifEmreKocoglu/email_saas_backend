// controllers/logsController.js  (tam içerik)
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import WorkflowLog from "../models/Workflow.js"; 
import MailAccount from "../models/MailAccount.js";
import User from "../models/User.js";
// JWT'den kullanıcıyı çöz
function uidFromReq(req) {
  try {
    const tok = req.cookies?.sid || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!tok) return null;
    const { uid } = jwt.verify(tok, process.env.JWT_SECRET);
    return uid || null;
  } catch {
    return null;
  }
}

// n8n -> log yaz (userId yoksa email veya cookie'den çöz)
export async function createLog(req, res) {
  try {
    const {
      userId: userIdRaw,
      workflowName,
      status,
      message,
      email,
      subject,
      tag,
      tagColor,
      awaitingReply,     // ← n8n’den gelecek
      awaitingColor,     // ← n8n’den gelecek
      workflowId,
      executionId,
      duration,
      errorMessage,
    } = req.body || {};

    let userId = userIdRaw;

    // 1) userId lookup
    if (!userId && email) {
      const mailOwner = await MailAccount.findOne({ email: String(email).toLowerCase() }).lean();
      if (mailOwner?.userId) {
        userId = mailOwner.userId.toString();
      } else {
        const userDoc = await User.findOne({ email: String(email).toLowerCase() }).lean();
        if (userDoc?._id) userId = userDoc._id.toString();
      }
    }

    // 2) Cookie token
    if (!userId) userId = uidFromReq(req);

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(404).json({ error: "User not found" });
    }

    // Kullanıcıyı çek (tagColor user.tags’ten override edilecekse)
    const userDoc = await User.findById(userId).lean();

    let finalTagColor = tagColor;
    if (tag) {
      const found = userDoc?.tags?.find(
        (t) => t.label.toLowerCase() === tag.toLowerCase()
      );
      if (found?.color) finalTagColor = found.color;
    }

    // Kaydet
    const doc = await WorkflowLog.create({
      userId,
      workflowName,
      status,
      message,
      email,
      subject,
      tag,
      tagColor: finalTagColor,
      awaitingReply: Boolean(awaitingReply),
      awaitingColor,
      workflowId,
      executionId,
      duration,
      errorMessage,
    });

    return res.json({ ok: true, id: doc._id });
  } catch (e) {
    console.error("❌ Log create error:", e);
    return res.status(500).json({ error: e.message });
  }
}

// UI -> log listele (query'de userId yoksa cookie'den al)
export async function listLogs(req, res) {
  try {
    const userId = req.auth?.userId;

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(401).json({ error: "Unauthorized or invalid userId" });
    }

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      WorkflowLog.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WorkflowLog.countDocuments({ userId }),
    ]);

    return res.json({ items, page, limit, total, hasMore: skip + items.length < total });
  } catch (e) {
    console.error("❌ listLogs error:", e);
    return res.status(500).json({ error: e.message });
  }
}