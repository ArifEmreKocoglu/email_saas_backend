import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },

    name: { type: String, default: "" },
    picture: { type: String, default: "" },

    authType: {
      type: String,
      enum: ["local", "google", "microsoft"],
      required: true,
      default: "local",
    },

    // Google / Outlook
    googleId: { type: String, default: null },

    /* ===============================
       ✅ MAIL SYSTEM (EKLENENLER)
       =============================== */

    // Email doğrulama
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },
    emailVerify: {
      tokenHash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },

    // Şifre sıfırlama
    passwordReset: {
      tokenHash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },

    /* ===============================
       ⚠️ Mail sync (AYNEN KALIR)
       =============================== */
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    lastHistoryId: { type: String, default: null },

    plan: { type: String, default: "Free" },
    limits: {
      maxMailAccounts: { type: Number, default: 1 },
      maxLogs: { type: Number, default: 1000 },
    },
    connectedAccounts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
