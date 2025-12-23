import mongoose from "mongoose";

const MailAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ✅ provider genişledi (Gmail aynen kalır)
    provider: {
      type: String,
      enum: ["gmail", "outlook"],
      default: "gmail",
      index: true,
    },

    email: { type: String, required: true, lowercase: true, trim: true },

    // Gmail
    googleId: { type: String, default: null },

    // Outlook / Microsoft (opsiyonel)
    microsoftId: { type: String, default: null }, // oid / homeAccountId vs için kullanacağız
    tenantId: { type: String, default: null },

    // ✅ Token alanları provider bazlı kullanılacak (gmail kodun bozulmaz)
    accessToken: String,
    refreshToken: String,
    expiresAt: Date,

    status: { type: String, enum: ["active", "deleted", "paused"], default: "active" },
    isActive: { type: Boolean, default: true },

    // Gmail watch/history (outlook için boş kalır)
    historyId: { type: String, default: null },
    lastHistoryId: { type: String, default: null },
    watchExpiration: { type: Date, default: null },

    // Outlook realtime/delta için (gmail etkilemez)
    outlook: {
      subscriptionId: { type: String, default: null },
      subscriptionExpiration: { type: Date, default: null },
      clientState: { type: String, default: null }, // ✅ gerekli
      deltaLink: { type: String, default: null },
      lastDeltaSyncAt: { type: Date, default: null },
      lastMessageId: { type: String, default: null },
    },


    labelMap: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Gmail tarafında kullandığın yapı; Outlook’ta da category map’i için reuse edeceğiz (sonraki adım)
    tagsConfig: {
      type: mongoose.Schema.Types.Mixed,
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
