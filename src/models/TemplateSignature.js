// models/TemplateSignature.js
import mongoose from "mongoose";

const TemplateSignatureSchema = new mongoose.Schema(
  {
    // Bu kullanıcının (veya workspace'in) kimliği
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Hangi mail hesabına ait (user birden fazla mail bağlayabilir)
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // Bu mail tipini temsil eden hash key
    templateKey: {
      type: String,
      required: true,
      index: true,
    },

    // Bilgi amaçlı saklıyoruz (debug / analiz için)
    senderDomain: {
      type: String,
      required: true,
    },

    // Normalize edilmiş subject (örn: sayılar # yapılmış)
    subjectPattern: {
      type: String,
      required: true,
    },

    // Senin dinamik tag sistemindeki path ile aynı olmalı:
    // Örnek: "Finance/Invoices", "Marketing/Newsletters" vb.
    labelPath: {
      type: String,
      required: true,
    },

    // Bu template için genelde cevap gerekiyor mu?
    replyNeeded: {
      type: Boolean,
      default: false,
    },

    // Bu template ile kaç mail gördük?
    sampleCount: {
      type: Number,
      default: 1,
    },

    // Son ne zaman bu template'e denk geldik?
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Aynı user + email + templateKey sadece 1 tane olsun:
TemplateSignatureSchema.index(
  { userId: 1, email: 1, templateKey: 1 },
  { unique: true }
);

export default mongoose.model("TemplateSignature", TemplateSignatureSchema);