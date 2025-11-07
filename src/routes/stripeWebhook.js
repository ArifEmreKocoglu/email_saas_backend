import express from "express";
import Stripe from "stripe";
import User from "../models/User.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ PriceId → Plan eşleme
const PLAN_MAP = {
  price_1SPqCQFdfrLPvtbm0MvGEbux: {
    name: "Basic",
    limits: { maxMailAccounts: 2, maxLogs: 500 },
  },
  price_1SPqCiFdfrLPvtbm3ltEdMiI: {
    name: "Pro",
    limits: { maxMailAccounts: 5, maxLogs: 2500 },
  },
  price_1SPqCyFdfrLPvtbmB9JqkK2W: {
    name: "Enterprise",
    limits: { maxMailAccounts: 9999, maxLogs: 999999 },
  },
};

router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("⚠️ Stripe webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;

          // ✅ Email ve priceId yakalama
          const customerEmail =
            session.customer_email ||
            session.customer_details?.email ||
            null;
          const priceId =
            session.metadata?.priceId ||
            session?.line_items?.[0]?.price?.id ||
            session?.subscription_data?.items?.[0]?.price?.id ||
            null;

          if (!customerEmail) {
            console.warn("⚠️ Missing customer email in session");
            break;
          }

          const planData = PLAN_MAP[priceId];
          if (!planData) {
            console.warn("⚠️ Unknown priceId received:", priceId);
            break;
          }

          // ✅ Kullanıcının planını güncelle
          const user = await User.findOne({ email: customerEmail });
          if (user) {
            user.plan = planData.name;
            user.limits = planData.limits;
            await user.save();
            console.log(`✅ ${customerEmail} upgraded to ${planData.name}`);
          } else {
            console.warn("⚠️ User not found:", customerEmail);
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const customer = await stripe.customers.retrieve(invoice.customer);
          const user = await User.findOne({ email: customer.email });
          if (user) {
            user.plan = "Inactive";
            user.limits = { maxMailAccounts: 0, maxLogs: 0 };
            await user.save();
            console.log(`⚠️ Downgraded ${customer.email} to Inactive`);
          }
          break;
        }

        default:
          console.log(`ℹ️ Unhandled event type: ${event.type}`);
      }

      res.status(200).send("ok");
    } catch (err) {
      console.error("❌ Stripe webhook processing error:", err);
      res.status(500).send("Internal Server Error");
    }
  }
);

export default router;