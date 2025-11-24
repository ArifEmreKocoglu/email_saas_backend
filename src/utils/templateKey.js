// src/utils/templateKey.js
import crypto from "crypto";

/**
 * Subject içindeki sayıları normalize et:
 * "Invoice #12345 for Order 9876" -> "invoice # for order #"
 */
export function buildSubjectPattern(subject = "") {
  const s = String(subject || "").toLowerCase().trim();
  return s.replace(/\d+/g, "#");
}

/**
 * Body yapısını kaba bir bucket'a ayır:
 * - kısa / orta / uzun
 * - attachment var mı
 */
export function buildLayoutBucket({ text = "", html = "", hasAttachments = false }) {
  const len = (text || "").length || (html || "").length || 0;

  const lenBucket =
    len < 200 ? "short" :
    len < 1000 ? "medium" :
    "long";

  return [
    lenBucket,
    hasAttachments ? "att" : "noatt",
  ].join("|");
}

/**
 * TemplateKey: domain + subjectPattern + layoutBucket hash'i
 */
export function computeTemplateKey({ senderDomain, subject, text, html, hasAttachments }) {
  const subjectPattern = buildSubjectPattern(subject);
  const layoutBucket = buildLayoutBucket({ text, html, hasAttachments });

  const raw = `${senderDomain}::${subjectPattern}::${layoutBucket}`;
  return {
    templateKey: crypto.createHash("sha1").update(raw).digest("hex"),
    subjectPattern,
  };
}