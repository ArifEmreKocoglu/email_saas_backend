import mongoose from "mongoose";

const MailAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  accessToken: String,
  refreshToken: String,
  expiresAt: Date,
  labelIds: [String],
  isActive: { type: Boolean, default: true },
  connectedAt: { type: Date, default: Date.now },
});

export default mongoose.model("MailAccount", MailAccountSchema);
