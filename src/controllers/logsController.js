import WorkflowLog from "../models/Workflow.js";
import mongoose from "mongoose";

export async function createLog(req, res) {
  try {
    const {
      userId,
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

export async function listLogs(req, res) {
  try {
    const userId = String(req.query.userId || "");
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 100);

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: "userId is required" });
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      WorkflowLog.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WorkflowLog.countDocuments({ userId }),
    ]);

    return res.json({
      items,
      page,
      limit,
      total,
      hasMore: skip + items.length < total,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}