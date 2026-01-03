import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import cors from "cors";
import bodyParser from "body-parser"; 
import connectMongo from "./config/mongo.js";
import oauthRoutes from "./routes/oauth.js";
import n8nRoutes from "./routes/n8nRoutes.js";
import gmailRoutes from "./routes/gmail.js"; 
import gmailPushRoutes from "./routes/gmailPush.js";
import mailAccountRoutes from "./routes/mailAccount.js";
import planRoutes from "./routes/plan.js";
import logRoutes from "./routes/logs.js";
import dashboardRoutes from "./routes/dashboard.js";
import { startRewatchJob } from "./jobs/rewatchJob.js";
import { startRewatchOutlookJob } from "./jobs/rewatchOutlookJob.js";
import authLocalRoutes from "./routes/authLocal.js";
import stripeWebhookRoutes from "./routes/stripeWebhook.js";
import outlookPushRoutes from "./routes/outlookPush.js";
import oauthAuthRoutes from "./routes/oauthAuth.js";
import replyRoutes from "./routes/replies.js";


dotenv.config();
const app = express();

// ✅ Geniş izinli ama güvenli CORS ayarı
const allowedOrigins = [
  "http://localhost:3000", // local dev
  "https://entrfy.com",
  "https://www.entrfy.com",
  "https://api.entrfy.com",
  "https://6a7685130209.ngrok-free.app",
  "https://panel.entrfy.com"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed for this origin: " + origin));
      }
    },
    credentials: true,
  })
);

app.use("/api/stripe/webhook", bodyParser.raw({ type: "application/json" }), stripeWebhookRoutes);

app.use(express.json());


app.set("trust proxy", 1);        
app.use(cookieParser());          

// ✅ DB connect
connectMongo();

// ✅ Routes
app.get("/health", (req, res) => res.json({ status: "ok", message: "Backend running" }));
app.use("/auth", oauthRoutes);
app.use("/auth", oauthAuthRoutes);

app.use("/api", n8nRoutes);
app.use("/api/gmail", gmailRoutes);
app.use("/webhook/gmail", gmailPushRoutes);
app.use("/webhook/outlook", outlookPushRoutes);
app.use("/api/mail-accounts", mailAccountRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/auth", authLocalRoutes);
app.use("/api/reply", replyRoutes);


const PORT = process.env.PORT || 4000;
console.log("ENV check → has JWT:", process.env.JWT_SECRET, PORT);


app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  startRewatchJob();
  startRewatchOutlookJob();
});
