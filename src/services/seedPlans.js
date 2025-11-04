// src/services/seedPlans.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Plan from "../models/Plan.js";

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI);

await Plan.deleteMany({});
await Plan.insertMany([
  {
    name: "Basic",
    price: 4.99,
    limits: { maxMailAccounts: 2, maxLogs: 500 },
    features: ["Up to 2 mail accounts", "500 logs limit"],
    stripePriceId: "price_1SPqCQFdfrLPvtbm0MvGEbux",
  },
  {
    name: "Pro",
    price: 19.99,
    limits: { maxMailAccounts: 5, maxLogs: 2500 },
    features: ["Up to 5 mail accounts", "2500 logs limit", "Priority Support"],
    stripePriceId: "price_1SPqCiFdfrLPvtbm3ltEdMiI",
  },
  {
    name: "Enterprise",
    price: 49.99,
    limits: { maxMailAccounts: 9999, maxLogs: 999999 },
    features: ["Unlimited mail accounts", "Unlimited logs", "Dedicated Support"],
    stripePriceId: "price_1SPqCyFdfrLPvtbmB9JqkK2W",
  },
]);

console.log("✅ Plans seeded successfully");
process.exit();