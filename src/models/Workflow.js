import mongoose from "mongoose";

const workflowLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    workflowName: String,
    status: { type: String, enum: ["success", "error"], default: "success" },
    message: String,

    email: String,
    subject: String,

    // Ana label
    tag: String,
    tagColor: String,

    // Reply etiketi
    awaitingReply: { type: Boolean, default: false },
    awaitingColor: String,

    workflowId: String,
    executionId: String,
    duration: String,
    errorMessage: { type: String, default: null },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("WorkflowLog", workflowLogSchema);