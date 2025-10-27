import mongoose from "mongoose";
import MailAccount from "../models/MailAccount.js";

export async function listByUser(req, res) {
  try {
    const { userId } = req.query;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: "Invalid userId" });

    const items = await MailAccount.find({ userId, status: { $ne: "deleted" } })
      .select("email provider status connectedAt watchExpiration lastHistoryId")
      .sort({ connectedAt: -1 })
      .lean();

    return res.json({ items });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
