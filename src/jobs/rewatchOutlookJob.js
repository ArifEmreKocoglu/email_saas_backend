// src/jobs/rewatchOutlookJob.js
import MailAccount from "../models/MailAccount.js";
import JobLock from "../models/JobLock.js";
import { createOrRenewOutlookSubscription } from "../controllers/outlookController.js";

const HOUR = 60 * 60 * 1000;
const JOB_NAME = "rewatch-outlook";
const LOCK_TTL_MS = 10 * 60 * 1000;   // 10 dk
const SCAN_INTERVAL_MS = 6 * HOUR;    // 6 saatte bir
const RENEW_BEFORE_HOURS = 24;        // süresi bitmeden 24 saat önce yenile
const BATCH_LIMIT = 100;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function acquireLock() {
  const now = new Date();
  const expires = new Date(Date.now() + LOCK_TTL_MS);

  const res = await JobLock.findOneAndUpdate(
    {
      jobName: JOB_NAME,
      $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }],
    },
    { $set: { jobName: JOB_NAME, lockedAt: now, expiresAt: expires } },
    { upsert: true, new: true }
  ).lean();

  return !!(res && new Date(res.expiresAt) > now);
}

async function releaseLock() {
  await JobLock.updateOne(
    { jobName: JOB_NAME },
    { $set: { expiresAt: new Date(0) } }
  );
}

async function scanAndRenew() {
  await sleep(Math.floor(Math.random() * 30000)); // jitter

  const gotLock = await acquireLock();
  if (!gotLock) {
    console.log("[outlook rewatch] skipped (lock held)");
    return;
  }

  try {
    const nowMs = Date.now();
    const renewBefore = new Date(nowMs + RENEW_BEFORE_HOURS * HOUR);

    const candidates = await MailAccount.find({
      provider: "outlook",
      status: "active",
      isActive: true,
      $or: [
        { "outlook.subscriptionExpiration": { $exists: false } },
        { "outlook.subscriptionExpiration": null },
        { "outlook.subscriptionExpiration": { $lte: renewBefore } },
        { "outlook.subscriptionId": { $exists: false } },
        { "outlook.subscriptionId": null },
      ],
    })
      .select("_id email outlook.subscriptionId outlook.subscriptionExpiration")
      .limit(BATCH_LIMIT)
      .lean();

    console.log(`[outlook rewatch] candidates: ${candidates.length}`);

    let ok = 0, fail = 0;
    for (const c of candidates) {
      try {
        await sleep(250 + Math.floor(Math.random() * 500));

        const acc = await MailAccount.findById(c._id);
        if (!acc) continue;

        await createOrRenewOutlookSubscription(acc);

        ok++;
        console.log(
          `[outlook rewatch] ok: ${acc.email} → exp:${acc.outlook?.subscriptionExpiration?.toISOString?.() || "-"}`
        );
      } catch (e) {
        fail++;
        console.error("[outlook rewatch] fail:", c.email, e?.response?.data || e?.message || e);
      }
    }

    console.log(`[outlook rewatch] done — ok:${ok} fail:${fail}`);
  } finally {
    await releaseLock();
  }
}

export function startRewatchOutlookJob() {
  scanAndRenew().catch(err =>
    console.error("[outlook rewatch] initial error:", err?.message || err)
  );

  setInterval(() => {
    scanAndRenew().catch(err =>
      console.error("[outlook rewatch] interval error:", err?.message || err)
    );
  }, SCAN_INTERVAL_MS);
}
