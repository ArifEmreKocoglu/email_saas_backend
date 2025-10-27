import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // App oturumu
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null }, // local auth için

    name: { type: String, default: "" },
    picture: { type: String, default: "" },

    // (Opsiyonel) Google profil alanları - artık zorunlu DEĞİL
    googleId: { type: String, default: null },
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