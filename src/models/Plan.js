import mongoose from "mongoose";

const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  price: { type: Number, default: 0 },
  limits: {
    maxMailAccounts: { type: Number, required: true },
    maxLogs: { type: Number, required: true },
  },
  features: [String],
  stripePriceId: { type: String, required: true },
});

export default mongoose.model("Plan", PlanSchema);
