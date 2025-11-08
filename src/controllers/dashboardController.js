import mongoose from "mongoose";
import WorkflowLog from "../models/Workflow.js";
import User from "../models/User.js";

// Kullanıcının genel istatistiklerini döndürür
export const getDashboardStats = async (req, res) => {
  try {
    // 🔹 userId ya query’den ya da auth middleware’den alınır
    const userId = req.query.userId || req.auth?.userId;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // 🔹 Kullanıcı bilgilerini çek
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 🔹 Log istatistikleri
    const totalLogs = await WorkflowLog.countDocuments({ userId });
    const successLogs = await WorkflowLog.countDocuments({ userId, status: "success" });
    const errorLogs = await WorkflowLog.countDocuments({ userId, status: "error" });

    const successRate = totalLogs ? ((successLogs / totalLogs) * 100).toFixed(1) : 0;

    // 🔹 Son 7 gün için işlem sayısı (grafik verisi)
    const last7Days = await WorkflowLog.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 7 },
    ]);

    // 🔹 Plan limit bilgisi
    const logsLimit = user?.limits?.maxLogs ?? 1000;
    const mailLimit = user?.limits?.maxMailAccounts ?? 1;

    res.json({
      totalLogs,
      successLogs,
      errorLogs,
      successRate,
      last7Days,
      plan: user.plan || "Free",
      limits: {
        maxLogs: logsLimit,
        maxMailAccounts: mailLimit,
      },
    });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
};