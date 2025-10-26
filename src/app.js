import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectMongo from "./config/mongo.js";
import oauthRoutes from "./routes/oauth.js";
import n8nRoutes from "./routes/n8nRoutes.js";
import gmailRoutes from "./routes/gmail.js"; 
import gmailPushRoutes from "./routes/gmailPush.js";
import mailAccountRoutes from "./routes/mailAccount.js";
import planRoutes from "./routes/plan.js";
import logRoutes from "./routes/logs.js";
import dashboardRoutes from "./routes/dashboard.js";





dotenv.config();
const app = express();
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

// Connect DB
connectMongo();

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Backend running" });
});

app.use("/auth", oauthRoutes);
app.use("/api", n8nRoutes);
app.use("/api/gmail", gmailRoutes);
app.use("/webhook/gmail", gmailPushRoutes);
app.use("/api/mail-accounts", mailAccountRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/dashboard", dashboardRoutes);


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
