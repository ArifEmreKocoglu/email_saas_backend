import mongoose from "mongoose";
import dotenv from "dotenv";
import connectMongo from "./config/mongo.js";
import Plan from "./models/Plan.js";

dotenv.config();

const seedPlans = async () => {
  await connectMongo();
  const plans = [
    {
      name: "Free",
      price: 0,
      limits: { maxMailAccounts: 1, maxLogs: 1000 },
      features: ["1 Mail Account", "Basic Logs"],
    },
    {
      name: "Pro",
      price: 29,
      limits: { maxMailAccounts: 5, maxLogs: 10000 },
      features: ["Up to 5 Accounts", "Advanced Analytics", "Priority Support"],
    },
    {
      name: "Enterprise",
      price: 99,
      limits: { maxMailAccounts: 50, maxLogs: 50000 },
      features: ["Custom limits", "Dedicated Support", "Full API Access"],
    },
  ];

  await Plan.deleteMany({});
  await Plan.insertMany(plans);
  console.log("✅ Plans seeded successfully");
  mongoose.connection.close();
};

seedPlans();
