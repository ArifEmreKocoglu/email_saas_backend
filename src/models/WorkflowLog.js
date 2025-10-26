import mongoose from "mongoose";

const workflowLogSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  workflowName: String,
  status: { type: String, enum: ["success", "failed"], default: "success" },
  message: String,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("WorkflowLog", workflowLogSchema);
