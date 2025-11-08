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
      workflowId,
      executionId,
      duration,
      errorMessage,
    } = req.body || {};

    let userId = userIdRaw;

    // userId yoksa email'den çöz
    if (!userId && email) {
      const acc = await MailAccount.findOne({ email: String(email).toLowerCase() }).lean();
      if (acc?.userId) userId = acc.userId.toString();
    }

    // hala yoksa JWT cookie'den çöz
    if (!userId) userId = uidFromReq(req);

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: "User not found or invalid userId" });
    }

    const log = await WorkflowLog.create({
      userId,
      workflowName: workflowName || "unknown",
      status: status === "error" ? "error" : "success",
      message: message || "",
      email: email || "",
      subject: subject || "",
      tag: tag || "General",
      workflowId: workflowId || "",
      executionId: executionId || "",
      duration: duration || "",
      errorMessage: errorMessage || null,
    });

    // --- LOG COUNT UPDATE ---
    const totalLogs = await WorkflowLog.countDocuments({ userId });
    await User.updateOne(
      { _id: userId },
      { $set: { "limits.currentLogs": totalLogs } }
    );

    return res.json({ ok: true, id: log._id });
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