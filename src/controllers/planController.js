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



// ✅ Kullanıcı ödeme sonrası geldiğinde session_id ile çağrılacak
export const verifyCheckoutSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    // Stripe’tan oturumu al
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "customer"],
    });

    const email =
      session.customer_email ||
      session.customer_details?.email ||
      session.customer?.email;

    if (!email) {
      return res.status(400).json({ error: "Customer email not found" });
    }

    // Price ID’yi yakala
    const priceId =
      session.metadata?.priceId ||
      session.line_items?.data?.[0]?.price?.id;

    if (!priceId) {
      return res.status(400).json({ error: "Price ID not found in session" });
    }

    // Plan bilgisini bul
    const plan = await Plan.findOne({ stripePriceId: priceId });
    if (!plan) {
      return res.status(404).json({ error: "Plan not found for this priceId" });
    }

    // Kullanıcıyı bul ve planı güncelle
    const user = await (await import("../models/User.js")).default.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.plan = plan.name;
    user.limits = plan.limits;
    await user.save();

    res.json({
      success: true,
      message: `Plan updated to ${plan.name}`,
      plan: plan.name,
      limits: plan.limits,
    });
  } catch (err) {
    console.error("❌ verifyCheckoutSession error:", err);
    res.status(500).json({ error: "Failed to verify checkout session" });
  }
};
