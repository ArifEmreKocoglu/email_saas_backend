// src/services/gmailMessage.js
function b64urlToBuffer(s = "") {
    const pad = (4 - (s.length % 4)) % 4;
    const fixed = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    return Buffer.from(fixed, "base64");
  }
  
  function header(headers = [], name = "") {
    const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
    return h?.value || "";
  }
  
  function extractParts(payload) {
    let html = "", text = "";
    const attachments = [];
  
    const walk = (part) => {
      if (!part) return;
      const mt = part.mimeType || "";
      if ((mt === "text/html" || mt.startsWith("text/html")) && part.body?.data) {
        html += b64urlToBuffer(part.body.data).toString("utf8");
      } else if ((mt === "text/plain" || mt.startsWith("text/plain")) && part.body?.data) {
        text += b64urlToBuffer(part.body.data).toString("utf8");
      } else if (part.filename && part.body?.attachmentId) {
        attachments.push({
          fileName: part.filename,
          mimeType: mt,
          size: part.body?.size || 0,
          attachmentId: part.body.attachmentId,
        });
      }
      if (part.parts) part.parts.forEach(walk);
    };
  
    // single-part mail’ler için de gövdeyi al
    if (payload?.body?.data && (payload?.mimeType?.startsWith("text/"))) {
      if (payload.mimeType.startsWith("text/html")) {
        html += b64urlToBuffer(payload.body.data).toString("utf8");
      } else if (payload.mimeType.startsWith("text/plain")) {
        text += b64urlToBuffer(payload.body.data).toString("utf8");
      }
    }
  
    walk(payload);
    return { html, text, attachments };
  }
  
  export function buildPayload(fullMessage, { emailAddress, accountId, historyId }) {
    const payload = fullMessage?.payload || {};
    const headers = payload.headers || [];
  
    const subject = header(headers, "Subject");
    const from = header(headers, "From");
    const to = header(headers, "To");
    const cc = header(headers, "Cc");
    const bcc = header(headers, "Bcc");
    const date = header(headers, "Date");
  
    const { html, text, attachments } = extractParts(payload);
  
    return {
      emailAddress,
      accountId,
      messageId: fullMessage.id,
      threadId: fullMessage.threadId,
      historyId: String(historyId),
      subject,
      from,
      to,
      cc,
      bcc,
      date,
      internalDate: Number(fullMessage.internalDate) || Date.now(),
      snippet: fullMessage.snippet || "",
      headers,
      html,
      text,
      attachments,
    };
  }