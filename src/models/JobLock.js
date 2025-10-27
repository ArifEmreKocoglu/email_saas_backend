import mongoose from "mongoose";

const jobLockSchema = new mongoose.Schema({
  jobName: { type: String, unique: true, required: true },
  lockedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }, // lock süresi
});

export default mongoose.model("JobLock", jobLockSchema);