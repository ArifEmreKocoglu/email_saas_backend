import Plan from "../models/Plan.js";

export const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({});
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch plans" });
  }
};
