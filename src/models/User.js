import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: Date,
  lastHistoryId: { type: String, default: null },

  name: String,
  picture: String,
  plan: { type: String, default: "Free" },
  limits: {
    maxMailAccounts: { type: Number, default: 1 },
    maxLogs: { type: Number, default: 1000 },
  },
  connectedAccounts: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", userSchema);
