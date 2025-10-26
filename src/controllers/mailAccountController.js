import MailAccount from "../models/MailAccount.js";
import User from "../models/User.js";

// Get all mail accounts for a user
export const getAccounts = async (req, res) => {
  try {
    const { userId } = req.query;
    const accounts = await MailAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    console.error("Error fetching mail accounts:", err);
    res.status(500).json({ error: "Failed to fetch mail accounts" });
  }
};

// Add a new mail account (after Google OAuth)
export const addAccount = async (req, res) => {
  try {
    const { userId, email, accessToken, refreshToken } = req.body;

    // limit kontrolü
    const user = await User.findById(userId);
    const currentCount = await MailAccount.countDocuments({ userId });

    if (currentCount >= user.limits.maxMailAccounts) {
      return res.status(403).json({ error: "Mail account limit reached" });
    }

    const account = await MailAccount.create({
      userId,
      email,
      accessToken,
      refreshToken,
    });

    // Kullanıcıya bağlı hesap sayısını artır
    user.connectedAccounts = currentCount + 1;
    await user.save();

    res.status(201).json(account);
  } catch (err) {
    console.error("Error adding mail account:", err);
    res.status(500).json({ error: "Failed to add mail account" });
  }
};

// Optional: deactivate / remove account
export const deactivateAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    await MailAccount.findByIdAndUpdate(accountId, { isActive: false });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to deactivate account" });
  }
};
