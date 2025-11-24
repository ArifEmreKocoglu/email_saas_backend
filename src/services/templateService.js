// src/services/templateService.js
import TemplateSignature from "../models/TemplateSignature.js";
import { computeTemplateKey } from "../utils/templateKey.js";

/**
 * LLM veya kural sonrası oluşan final label'a göre
 * bu mail tipini TemplateSignature tablosuna yazar / günceller.
 */
export async function upsertTemplateFromMessage({
  userId,
  email,
  message,
  labelPath,
  replyNeeded = false,
}) {
  if (!userId || !email || !labelPath || !message) return;

  const senderDomain = extractDomainFromEmail(
    message.from_addr || message.from || message.emailAddress || "",
    message.link_domains || []      // 🔹 fallback verelim
  );
  if (!senderDomain) {
    console.warn("[TemplateSignature] skip: no senderDomain", {
      userId: String(userId),
      email,
      from: message.from_addr || message.from || message.emailAddress,
      link_domains: message.link_domains,
    });
    return;
  }

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

  console.log("[TemplateSignature] upsert", {
    userId: String(userId),
    email,
    senderDomain,
    subjectPattern,
    labelPath,
    replyNeeded: !!replyNeeded,
    templateKey,
  });

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
 * Eğer From içinde email yoksa, link_domains[0] fallback kullan.
 */
function extractDomainFromEmail(emailAddress = "", linkDomains = []) {
  const s = String(emailAddress).toLowerCase().trim();

  // "Foo <bar@domain.com>" senaryosu dahil
  const match = s.match(/@([^>\s]+)/);
  if (match) {
    return match[1].replace(/>$/, "").replace(/^www\./, "");
  }

  // 🔹 Fallback: normalize_and_hash’ten gelen link_domains
  if (Array.isArray(linkDomains) && linkDomains.length > 0) {
    return String(linkDomains[0]).toLowerCase().replace(/^www\./, "");
  }

  return null;
}