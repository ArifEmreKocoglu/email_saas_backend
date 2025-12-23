// src/controllers/outlookController.js
import axios from "axios";
import crypto from "crypto";
import MailAccount from "../models/MailAccount.js";

function must(name) {
  if (!process.env[name]) throw new Error(`${name} is missing`);
}

async function ensureMsToken(acc) {
  const now = Date.now();
  if (acc.expiresAt && acc.expiresAt.getTime() > now + 60_000) return; // 1dk buffer

  must("MICROSOFT_CLIENT_ID");
  must("MICROSOFT_CLIENT_SECRET");

    const rt = acc.refreshToken || acc.outlook?.refreshToken; // ✅ legacy fallback
    if (!rt) throw new Error("Missing Microsoft refreshToken");

    const form = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: rt,
      scope: [
        "openid",
        "email",
        "profile",
        "offline_access",
        "https://graph.microsoft.com/User.Read",
        "https://graph.microsoft.com/Mail.ReadWrite",
      ].join(" "),

    });

    const tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

    const { data } = await axios.post(tokenUrl, form.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });


    acc.accessToken = data.access_token;

    // ✅ her durumda root’a yaz
    if (data.refresh_token) acc.refreshToken = data.refresh_token;
    else if (!acc.refreshToken && rt) acc.refreshToken = rt;

    acc.expiresAt = new Date(now + Number(data.expires_in || 3600) * 1000);
    await acc.save();
}

async function graphGet(acc, url) {
  await ensureMsToken(acc);
  return axios.get(url, {
    headers: { Authorization: `Bearer ${acc.accessToken}` },
  });
}

function pickAddress(emailAddress) {
  if (!emailAddress) return "";
  const name = emailAddress.name || "";
  const addr = emailAddress.address || "";
  return name ? `${name} <${addr}>` : addr;
}

function toHeaderList(arr) {
  if (!Array.isArray(arr)) return "";
  return arr
    .map((x) => pickAddress(x.emailAddress))
    .filter(Boolean)
    .join(", ");
}

export const handleOutlookNotification = async (req, res) => {
  try {
    console.log("[outlook notify] HIT", {
      query: req.query,
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      valueLen: req.body?.value?.length
    });

    // ✅ Microsoft Graph validation: query ?validationToken=...
    const validationToken = req.query?.validationToken;
    if (validationToken) {
      res.set("Content-Type", "text/plain");
      return res.status(200).send(String(validationToken));
    }
    console.log("1;");
    // Notification body: { value: [ ... ] }
    const notifications = req.body?.value || [];
    res.sendStatus(202); // hızlı ACK (Graph için ideal)
console.log("2;");
    for (const n of notifications) {
      const subscriptionId = n.subscriptionId;
      const clientState = n.clientState;

      if (!subscriptionId) continue;
console.log("3;");
      // 1) subscriptionId üzerinden account bul
      const acc = await MailAccount.findOne({
        provider: "outlook",
        "outlook.subscriptionId": subscriptionId,
        status: "active",
        isActive: true,
      });

      if (!acc) continue;

      // 2) clientState doğrula
      if (!acc.outlook?.clientState || acc.outlook.clientState !== clientState) {
        console.warn("[outlook notify] clientState mismatch", {
          email: acc.email,
          subscriptionId,
        });
        continue;
      }
console.log("4;");
      // 3) resource: "Users('id')/Messages('id')" veya "Me/Messages('id')"
      const resource = n.resource;
      if (!resource) continue;

      // message id’yi çekelim
      const match = resource.match(/Messages\('([^']+)'\)/i);
      const messageId = match?.[1];
      if (!messageId) continue;
console.log("5;");
      // 4) mail detayını çek
      const msgRes = await graphGet(
        acc,
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
          messageId
        )}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body,conversationId`
      );
console.log("6;");
      const m = msgRes.data;
      const subject = m.subject || "";
      const from = pickAddress(m.from?.emailAddress);
      const to = toHeaderList(m.toRecipients);
      const date = m.receivedDateTime || "";
      const internalDate = date ? Date.parse(date) : Date.now();
      const snippet = m.bodyPreview || "";
console.log("7;");
      const html =
        m.body?.contentType === "html" ? m.body?.content || "" : "";
      const text =
        m.body?.contentType === "text" ? m.body?.content || "" : "";

      const payload = {
        emailAddress: acc.email,
        accountId: acc._id.toString(),
        messageId: m.id,
        threadId: m.conversationId || null,
        historyId: null, // gmail gibi historyId yok
        subject,
        from,
        to,
        date,
        internalDate,
        snippet,
        headers: [], // Outlook’ta raw headers yok; şimdilik boş
        html,
        text,
        attachments: [], // şimdilik boş (istersen ayrı call ekleriz)
        oauth: {
          provider: "outlook",
          email: acc.email,
          accessToken: acc.accessToken,
        },
      };
      console.log("payload-outlook:", payload);
      try {
        console.log("8;");
        await axios.post(`${process.env.N8N_URL}/webhook/mail-ingest-v1`, payload, {
          headers: { "Content-Type": "application/json" },
        });
        console.log("✅ outlook sent to n8n:", m.id);
      } catch (e) {
        console.error(
          "[outlook -> n8n] error:",
          e?.response?.status,
          e?.response?.data || e.message
        );
      }
    }
  } catch (e) {
    console.error("[outlook notify] fatal:", e?.response?.data || e.message);
    // response zaten döndü; sadece log
  }
};

// Subscription yaratma fonksiyonu (microsoftCallback’te çağıracağız)
export async function createOrRenewOutlookSubscription(acc) {
  must("MICROSOFT_NOTIFICATION_URL"); // ör: https://api.entrfy.com/webhook/outlook/notify
  await ensureMsToken(acc);

  // ✅ outlook objesi garanti
  if (!acc.outlook) acc.outlook = {};

  // ✅ clientState nested alanda tutulur
  if (!acc.outlook.clientState) {
    acc.outlook.clientState = crypto.randomBytes(24).toString("hex");
    await acc.save();
  }

  // Inbox only + created
  // NOT: expiration max kısa (genelde ~3 gün). Daha sonra rewatch job ekleyeceğiz.
  const expires = new Date(
    Date.now() + 2.5 * 24 * 60 * 60 * 1000
  ).toISOString();

  const body = {
    changeType: "created",
    notificationUrl: process.env.MICROSOFT_NOTIFICATION_URL,
    resource: "me/mailFolders('inbox')/messages",
    expirationDateTime: expires,
    clientState: acc.outlook.clientState,
  };

  const { data } = await axios.post(
    "https://graph.microsoft.com/v1.0/subscriptions",
    body,
    {
      headers: {
        Authorization: `Bearer ${acc.accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  // ✅ subscription id/expiration nested alanda tutulur
  acc.outlook.subscriptionId = data.id;
  acc.outlook.subscriptionExpiration = data.expirationDateTime
    ? new Date(data.expirationDateTime)
    : null;

  await acc.save();
  return data;
}


// Outlook subscription'ı Graph tarafında sil (best-effort)
async function deleteGraphSubscription(acc) {
  try {
    await ensureMsToken(acc);
    const subId = acc.outlook?.subscriptionId;
    if (!subId) return;

    await axios.delete(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subId)}`, {
      headers: { Authorization: `Bearer ${acc.accessToken}` },
    });
  } catch (e) {
    // ürün davranışı: temizlemeye çalış, olmazsa DB yine güncellensin
    console.warn("[outlook] delete subscription warn:", e?.response?.data || e.message);
  }
}

/**
 * POST /api/mail-accounts/:email/outlook/stop-watch
 * Outlook realtime subscription'ı durdurur (pause)
 */
export async function stopOutlookWatch(req, res) {
  try {
    const email = decodeURIComponent(req.params.email);
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const account = await MailAccount.findOne({ userId, email, provider: "outlook", status: { $ne: "deleted" } });
    if (!account) return res.status(404).json({ error: "Mail account not found" });

    // Graph subscription'ı sil (best-effort)
    await deleteGraphSubscription(account);

    // DB pause
    account.status = "paused";
    account.isActive = false;

    if (!account.outlook) account.outlook = {};
    account.outlook.subscriptionId = null;
    account.outlook.subscriptionExpiration = null;

    await account.save();

    return res.json({ success: true, message: `Stopped Outlook watching for ${email}` });
  } catch (e) {
    console.error("[stopOutlookWatch] error:", e?.response?.data || e.message);
    return res.status(500).json({ error: e.message });
  }
}

/**
 * POST /api/mail-accounts/:email/outlook/start-watch
 * Outlook realtime subscription'ı tekrar başlatır (resume)
 */
export async function startOutlookWatch(req, res) {
  try {
    const email = decodeURIComponent(req.params.email);
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const account = await MailAccount.findOne({ userId, email, provider: "outlook", status: { $ne: "deleted" } });
    if (!account) return res.status(404).json({ error: "Mail account not found" });

    // status aktif yap
    account.status = "active";
    account.isActive = true;
    await account.save();

    // yeni subscription kur
    await createOrRenewOutlookSubscription(account);

    return res.json({
      success: true,
      message: `Started Outlook watching for ${email}`,
      subscriptionId: account.outlook?.subscriptionId || null,
      subscriptionExpiration: account.outlook?.subscriptionExpiration || null,
    });
  } catch (e) {
    console.error("[startOutlookWatch] error:", e?.response?.data || e.message);
    return res.status(500).json({ error: e.message });
  }
}


export async function deleteOutlookSubscriptionBestEffort(acc) {
  try {
    // burada senin içerideki helper'ı çağır
    await deleteGraphSubscription(acc);
  } catch (e) {
    // asla delete işlemini bozma
    console.warn("[outlook] deleteOutlookSubscriptionBestEffort warn:", e?.response?.data || e.message);
  }
}


export async function addOutlookCategories(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { email } = req.params;
    const { messageId, categories } = req.body || {};

    if (!messageId || !Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: "messageId and categories[] required" });
    }

    const acc = await MailAccount.findOne({ userId, email, provider: "outlook", status: "active", isActive: true });
    if (!acc) return res.status(404).json({ error: "Outlook account not found" });

    await ensureMsToken(acc);

    // PATCH message categories (Graph)
    await axios.patch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`,
      { categories },
      { headers: { Authorization: `Bearer ${acc.accessToken}`, "Content-Type": "application/json" } }
    );

    return res.json({ success: true });
  } catch (e) {
    console.error("[addOutlookCategories] error:", e?.response?.data || e.message);
    return res.status(500).json({ error: e.message });
  }
}


export async function syncOutlookDelta(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const { email } = req.params;

    const acc = await MailAccount.findOne({
      userId,
      email,
      provider: "outlook",
      status: "active",
      isActive: true,
    });
    if (!acc) return res.status(404).json({ error: "Outlook account not found" });

    await ensureMsToken(acc);

    let deltaUrl =
      acc.outlook?.deltaLink ||
      "https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages/delta";

    let sent = 0;

    while (deltaUrl) {
      const { data } = await axios.get(deltaUrl, {
        headers: { Authorization: `Bearer ${acc.accessToken}` },
      });

      for (const m of data.value || []) {
        // sadece yeni oluşturulan mesajlar
        if (!m.id || !m.receivedDateTime) continue;

        const payload = {
          emailAddress: acc.email,
          accountId: acc._id.toString(),
          messageId: m.id,
          threadId: m.conversationId || null,
          historyId: null,
          subject: m.subject || "",
          from: pickAddress(m.from?.emailAddress),
          to: toHeaderList(m.toRecipients),
          date: m.receivedDateTime,
          internalDate: Date.parse(m.receivedDateTime),
          snippet: m.bodyPreview || "",
          headers: [],
          html: "",
          text: "",
          attachments: [],
          oauth: {
            provider: "outlook",
            email: acc.email,
            accessToken: acc.accessToken,
          },
        };

        await axios.post(
          `${process.env.N8N_URL}/webhook/mail-ingest-v1`,
          payload,
          { headers: { "Content-Type": "application/json" } }
        );

        sent++;
      }

      deltaUrl = data["@odata.nextLink"] || null;

      if (data["@odata.deltaLink"]) {
        acc.outlook.deltaLink = data["@odata.deltaLink"];
        acc.outlook.lastDeltaSyncAt = new Date();
        await acc.save();
        break;
      }
    }

    return res.json({ success: true, sent });
  } catch (e) {
    console.error("[syncOutlookDelta] error:", e?.response?.data || e.message);
    return res.status(500).json({ error: e.message });
  }
}
