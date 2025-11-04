import dotenv from "dotenv";
dotenv.config();
import Plan from "../models/Plan.js";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({});
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch plans" });
  }
};


export const createCheckoutSession = async (req, res) => {
  try {
    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ error: "Missing priceId" });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
      subscription_data: {
        trial_period_days: 7,
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
};
