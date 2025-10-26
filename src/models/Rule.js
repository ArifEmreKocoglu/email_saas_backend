import mongoose from "mongoose";

const ruleSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  condition: String, // Örn: "subject includes 'invoice'"
  action: String, // Örn: "add label: Finance"
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Rule", ruleSchema);
