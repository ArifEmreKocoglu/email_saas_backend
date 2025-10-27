import mongoose from "mongoose";
import WorkflowLog from "../models/Workflow.js";

export async function listLogs(req, res) {
  try {
    const { userId } = req.query;
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const items = await WorkflowLog.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({ items, page, limit, hasMore: items.length === limit });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}