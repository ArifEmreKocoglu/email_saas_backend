import axios from "axios";
import { google } from "googleapis";
import MailAccount from "../models/MailAccount.js";
import WorkflowLog from "../models/Workflow.js";
import { buildPayload } from "../services/gmailMessage.js";

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
}

export const handleGmailPush = async (req, res) => {
  try {
    const msg = req.body?.message;
    if (!msg?.data) return res.status(204).end();
    const decoded = JSON.parse(Buffer.from(msg.data, "base64").toString("utf8"));
    const { emailAddress, historyId } = decoded || {};
    res.status(204).end(); // erken ACK

    if (!emailAddress || !historyId) return;

    const acc = await MailAccount.findOne({ provider: "gmail", email: emailAddress });
    if (!acc) {
      console.warn("[gmail push] MailAccount yok:", emailAddress);
      return;
    }

    // Token yenile (gerekirse)
    const now = Date.now();
    if (acc.expiresAt && acc.expiresAt.getTime() <= now) {
      try {
        const { data } = await axios.post("https://oauth2.googleapis.com/token", {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: acc.refreshToken,
          grant_type: "refresh_token",
        });
        acc.accessToken = data.access_token;
        acc.expiresAt = new Date(now + (data.expires_in || 3600) * 1000);
        await acc.save();
      } catch (err) {
        console.error("[token refresh] error:", err?.response?.data || err.message);
        return;
      }
    }

    const auth = oauthClient();
    auth.setCredentials({ access_token: acc.accessToken, refresh_token: acc.refreshToken });
    const gmail = google.gmail({ version: "v1", auth });

    // History akışı (sayfalama + dedupe)
    const startHistoryId = String(acc.lastHistoryId || acc.historyId || historyId);
    let pageToken;
    const seen = new Set();

    do {
      let histRes;
      try {
        histRes = await gmail.users.history.list({
          userId: "me",
          startHistoryId,
          historyTypes: ["messageAdded"],
          pageToken,
        });
      } catch (err) {
        if (err?.code === 404 || err?.errors?.[0]?.reason === "historyIdInvalid") {
          console.warn("[history] historyId too old → reset");
          const prof = await gmail.users.getProfile({ userId: "me" });
          acc.lastHistoryId = String(prof.data.historyId);
          await acc.save();
          return;
        }
        console.error("[history.list] error:", err?.response?.data || err.message);
        return;
      }

      const chunks = histRes.data.history || [];
      for (const h of chunks) {
        for (const m of h.messages || []) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);

          const full = await gmail.users.messages.get({
            userId: "me",
            id: m.id,
            format: "full",
          });

          const payload = buildPayload(full.data, {
            emailAddress,
            accountId: acc._id.toString(),
            historyId,
          });

          const started = Date.now();
          try {
            const n8nRes = await axios.post(
              `${process.env.N8N_URL}${process.env.N8N_INGEST_PATH || "/webhook/mail-ingest-v1"}`,
              payload,
              { headers: { "Content-Type": "application/json" } }
            );

            await WorkflowLog.create({
              userId: acc.userId,
              workflowName: "mail-ingest-v1",
              status: "success",
              message: "Delivered to n8n",
              email: emailAddress,
              subject: payload.subject,
              tag: null,
              workflowId: process.env.MAIL_WORKFLOW_ID || null,
              executionId: n8nRes?.data?.executionId || null,
              duration: `${((Date.now() - started) / 1000).toFixed(2)}s`,
              errorMessage: null,
            });
          } catch (postErr) {
            await WorkflowLog.create({
              userId: acc.userId,
              workflowName: "mail-ingest-v1",
              status: "error",
              message: "n8n webhook error",
              email: emailAddress,
              subject: payload.subject,
              tag: null,
              workflowId: process.env.MAIL_WORKFLOW_ID || null,
              executionId: null,
              duration: `${((Date.now() - started) / 1000).toFixed(2)}s`,
              errorMessage: postErr?.response?.data
                ? JSON.stringify(postErr.response.data).slice(0, 500)
                : postErr.message,
            });
          }
        }
      }

      pageToken = histRes.data.nextPageToken;
    } while (pageToken);

    acc.lastHistoryId = String(historyId);
    await acc.save();
  } catch (e) {
    console.error("[gmail push] fatal:", e);
  }
};