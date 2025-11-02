import mongoose from "mongoose";

const MailAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["gmail"],
      default: "gmail",
      index: true,
    },

    email: { type: String, required: true, lowercase: true, trim: true },
    googleId: { type: String, default: null },

    accessToken: String,
    refreshToken: String,
    expiresAt: Date,

    status: { type: String, enum: ["active", "deleted"], default: "active" },
    isActive: { type: Boolean, default: true },

    historyId: { type: String, default: null },
    lastHistoryId: { type: String, default: null },
    watchExpiration: { type: Date, default: null },

    labelMap: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ✅ Yeni alan: her mail hesabı için LLM etiket yapılandırması
    tagsConfig: {
      type: mongoose.Schema.Types.Mixed, // allowed, awaiting, review, vb.
      default: null,
    },

    connectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Aynı kullanıcıda aynı email + provider tek olsun:
MailAccountSchema.index(
  { userId: 1, provider: 1, email: 1 },
  { unique: true }
);

export default mongoose.model("MailAccount", MailAccountSchema);