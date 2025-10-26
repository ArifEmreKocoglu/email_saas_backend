import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectMongo from "./config/mongo.js";
import oauthRoutes from "./routes/oauth.js";
import n8nRoutes from "./routes/n8nRoutes.js";
import gmailRoutes from "./routes/gmail.js"; 
import gmailPushRoutes from "./routes/gmailPush.js";



dotenv.config();
const app = express();
app.use(cors());
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
