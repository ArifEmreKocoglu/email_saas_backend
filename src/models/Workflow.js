import mongoose from "mongoose";

const workflowLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    workflowName: { type: String },
    status: { type: String, enum: ["success", "error"], default: "success" },
    message: { type: String },

    email: { type: String },
    subject: { type: String },
    tag: { type: String },
    workflowId: { type: String },
    executionId: { type: String },
    duration: { type: String },
    errorMessage: { type: String, default: null },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("WorkflowLog", workflowLogSchema);