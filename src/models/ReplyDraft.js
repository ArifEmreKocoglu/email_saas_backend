import mongoose from "mongoose";

const ReplyItemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    tone: {
      type: String,
      enum: ["professional", "friendly", "short", "formal"],
      required: true,
    },
    language: { type: String, default: "auto" }, // tr | en | auto

    // n8n / AI metadata
    provider: { type: String, default: "n8n" },
    model: { type: String, default: null },

    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ReplyDraftSchema = new mongoose.Schema(
  {
    // 🔗 hangi log/mail için
    logId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowLog",
      required: true,
      index: true,
      unique: true, // 1 log = 1 reply context
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    provider: {
      type: String,
      enum: ["gmail", "outlook"],
      required: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    // 🧠 üretilen tüm AI reply’lar (max 3)
    replies: {
      type: [ReplyItemSchema],
      default: [],
      validate: {
        validator: (v) => v.length <= 3,
        message: "Maximum 3 AI replies allowed",
      },
    },

    // Kullanıcının seçtiği reply index’i
    selectedIndex: {
      type: Number,
      default: null,
      min: 0,
      max: 2,
    },

    // Provider tarafında oluşturulan draft id
    draftProviderId: {
      type: String,
      default: null, // gmail draftId / outlook messageId
    },

    // Audit / UX
    viewedAt: { type: Date, default: null },
    savedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ["idle", "generating", "completed", "drafted"],
      default: "idle",
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("ReplyDraft", ReplyDraftSchema);
