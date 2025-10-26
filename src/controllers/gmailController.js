import axios from "axios";
import User from "../models/User.js";

export const gmailWatch = async (req, res) => {
  try {
    const user = await User.findOne({ googleId: req.params.googleId });
    if (!user || !user.accessToken)
      return res.status(404).json({ error: "User or token not found" });

    const response = await axios.post(
      "https://gmail.googleapis.com/gmail/v1/users/me/watch",
      {
        topicName: "projects/entrfy-mail-saas/topics/gmail-inbox-watch",
        labelIds: ["INBOX"],
      },
      {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
        },
      }
    );

    res.json({
      success: true,
      watchResponse: response.data,
    });
  } catch (err) {
    console.error("Watch error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
};
