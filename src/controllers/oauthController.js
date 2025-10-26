import querystring from "querystring";
import axios from "axios";
import User from "../models/User.js"; // ✅ User modelini ekledik

export const googleLogin = async (req, res) => {
  const base = "https://accounts.google.com/o/oauth2/v2/auth";
  const params = querystring.stringify({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: [
      "https://mail.google.com/",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "openid",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
  });

  return res.redirect(`${base}?${params}`);
};

export const googleCallback = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "Missing code" });

  try {
    // 1️⃣ Token isteği
    const { data } = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const { access_token, refresh_token, expires_in, id_token } = data;

    // 2️⃣ Kullanıcı bilgilerini al
    const { data: profile } = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    // 3️⃣ Token süresi hesapla
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // 4️⃣ Kullanıcıyı veritabanına kaydet veya güncelle
    const existingUser = await User.findOne({ googleId: profile.id });

    if (existingUser) {
      existingUser.accessToken = access_token;
      existingUser.refreshToken = refresh_token || existingUser.refreshToken;
      existingUser.expiresAt = expiresAt;
      await existingUser.save();
    } else {
      await User.create({
        googleId: profile.id,
        email: profile.email,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
      });
    }

    // 5️⃣ Sonuç dön
    res.json({ success: true, email: profile.email });
  } catch (err) {
    console.error("OAuth Error:", err.response?.data || err.message);
    res.status(500).json({ error: "OAuth error" });
  }
};
