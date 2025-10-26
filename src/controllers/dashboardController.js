import WorkflowLog from "../models/WorkflowLog.js";

// Kullanıcının genel istatistiklerini döndürür
export const getDashboardStats = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const totalLogs = await WorkflowLog.countDocuments({ userId });
    const successLogs = await WorkflowLog.countDocuments({ userId, status: "success" });
    const errorLogs = await WorkflowLog.countDocuments({ userId, status: "error" });

    // Son 7 gün için işlem sayısı (grafik verisi)
    const last7Days = await WorkflowLog.aggregate([
      { $match: { userId: { $eq: new mongoose.Types.ObjectId(userId) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 7 },
    ]);

    res.json({
      totalLogs,
      successLogs,
      errorLogs,
      successRate: totalLogs ? ((successLogs / totalLogs) * 100).toFixed(1) : 0,
      last7Days,
    });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
};
