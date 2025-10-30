// controllers/logsController.js  (tam içerik)
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import WorkflowLog from "../models/Workflow.js"; 
import MailAccount from "../models/MailAccount.js";

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

    // 1) userId yoksa email -> MailAccount ile çöz
    if (!userId && email) {
      const acc = await MailAccount.findOne({ email: String(email).toLowerCase() }).lean();
      if (acc?.userId) userId = acc.userId.toString();
    }
    // 2) hâlâ yoksa cookie'den çöz
    if (!userId) userId = uidFromReq(req);

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: "userId is required" });
    }

    const doc = await WorkflowLog.create({
      userId,
      workflowName: workflowName || "",
      status: status === "error" ? "error" : "success",
      message: message || "",
      email: email || "",
      subject: subject || "",
      tag: tag || "",
      workflowId: workflowId || "",
      executionId: executionId || "",
      duration: duration || "",
      errorMessage: errorMessage || null,
    });

    return res.json({ ok: true, id: doc._id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// UI -> log listele (query'de userId yoksa cookie'den al)
export async function listLogs(req, res) {
  try {
    const userId = String(req.auth?.userId || "");  // ← middleware’den geliyor
    const page  = Math.max(parseInt(req.query.page  || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      WorkflowLog.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WorkflowLog.countDocuments({ userId }),
    ]);

    return res.json({ items, page, limit, total, hasMore: skip + items.length < total });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}