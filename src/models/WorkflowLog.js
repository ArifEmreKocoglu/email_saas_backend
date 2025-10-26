import mongoose from "mongoose";

const workflowLogSchema = new mongoose.Schema({
  // 🔹 kullanıcıyla ilişki
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // 🔹 mevcut alanlar
  workflowName: { type: String },
  status: { type: String, enum: ["success", "error"], default: "success" },
  message: { type: String },

  // 🔹 yeni eklenen alanlar (frontend & n8n entegrasyonu için)
  email: { type: String },               // işlenen mail adresi
  subject: { type: String },             // mail başlığı
  tag: { type: String },                 // mail sınıfı (örnek: Finance, Marketing)
  workflowId: { type: String },          // n8n workflow ID
  executionId: { type: String },         // n8n execution ID
  duration: { type: String },            // "1.76s" gibi süre bilgisi
  errorMessage: { type: String, default: null }, // hata varsa detay

  // 🔹 tarih
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("WorkflowLog", workflowLogSchema);
