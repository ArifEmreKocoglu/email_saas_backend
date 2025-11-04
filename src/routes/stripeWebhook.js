import express from "express";
import Stripe from "stripe";
import User from "../models/User.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// PriceId → Plan eşleme
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
  "/webhook",
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
      console.error("⚠️ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const customerEmail = session.customer_email;
          const priceId = session.metadata?.priceId || session.line_items?.[0]?.price?.id;

          if (!customerEmail) break;

          const planData = PLAN_MAP[priceId];
          if (!planData) {
            console.warn("Unknown priceId:", priceId);
            break;
          }

          const user = await User.findOne({ email: customerEmail });
          if (user) {
            user.plan = planData.name;
            user.limits = planData.limits;
            await user.save();
            console.log(`✅ ${customerEmail} upgraded to ${planData.name}`);
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
          }
          console.log(`⚠️ Payment failed for ${customer.email}`);
          break;
        }

        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      res.status(200).send("ok");
    } catch (err) {
      console.error("❌ Webhook processing error:", err);
      res.status(500).send("Internal Server Error");
    }
  }
);

export default router;