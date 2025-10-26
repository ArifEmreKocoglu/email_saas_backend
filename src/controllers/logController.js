import WorkflowLog from "../models/WorkflowLog.js";

// 🔹 n8n'den log kaydı almak için
export const createLog = async (req, res) => {
  try {
    const logData = req.body;

    // zorunlu alanlar kontrolü
    if (!logData.userId || !logData.status) {
      return res.status(400).json({ error: "userId and status are required" });
    }

    const log = await WorkflowLog.create({
      userId: logData.userId,
      workflowName: logData.workflowName || "Unnamed Workflow",
      status: logData.status || "success",
      message: logData.message || "",
      email: logData.email || null,
      subject: logData.subject || null,
      tag: logData.tag || null,
      workflowId: logData.workflowId || null,
      executionId: logData.executionId || null,
      duration: logData.duration || null,
      errorMessage: logData.errorMessage || null,
    });

    res.status(201).json(log);
  } catch (err) {
    console.error("❌ Error creating workflow log:", err);
    res.status(500).json({ error: "Failed to create log" });
  }
};

// 🔹 kullanıcının loglarını listelemek için
export const getLogs = async (req, res) => {
  try {
    const { userId, limit = 50 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const logs = await WorkflowLog.find({ userId })
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json(logs);
  } catch (err) {
    console.error("❌ Error fetching logs:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};
