// src/services/templateService.js
import TemplateSignature from "../models/TemplateSignature.js";
import { computeTemplateKey } from "../utils/templateKey.js";

/**
 * LLM veya kural sonrası oluşan final label'a göre
 * bu mail tipini TemplateSignature tablosuna yazar / günceller.
 */
export async function upsertTemplateFromMessage({
  userId,
  email,          // MailAccount.email
  message,        // normalize_and_hash benzeri payload
  labelPath,      // "Finance/Invoices" vb. (tagsConfig.allowed içinden)
  replyNeeded = false,
}) {
  if (!userId || !email || !labelPath || !message) return;

  const senderDomain = extractDomainFromEmail(
    message.from_addr || message.from || message.emailAddress || ""
  );
  if (!senderDomain) return;

  const hasAttachments = Array.isArray(message.attachments_meta)
    ? message.attachments_meta.length > 0
    : Array.isArray(message.attachments)
    ? message.attachments.length > 0
    : false;

  const { templateKey, subjectPattern } = computeTemplateKey({
    senderDomain,
    subject: message.subject || "",
    text: message.text || "",
    html: message.html || "",
    hasAttachments,
  });

  if (!templateKey) return;

  await TemplateSignature.findOneAndUpdate(
    { userId, email, templateKey },
    {
      $setOnInsert: {
        senderDomain,
        subjectPattern,
      },
      $set: {
        labelPath,
        replyNeeded: !!replyNeeded,
        lastUsedAt: new Date(),
      },
      $inc: { sampleCount: 1 },
    },
    { upsert: true }
  );
}

/**
 * "Foo <bar@domain.com>" / "bar@domain.com" → "domain.com"
 */
function extractDomainFromEmail(emailAddress = "") {
  const s = String(emailAddress).toLowerCase().trim();
  const match = s.match(/@([^>\s]+)/);
  return match ? match[1] : null;
}