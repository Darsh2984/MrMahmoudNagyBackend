// runWeeklyNow.js
// ✅ Manual Weekly Report Runner
// ✅ Safe DB connect
// ✅ Safe DB disconnect
// ✅ Proper error handling

require("dotenv").config({ path: __dirname + "/../.env" });

const mongoose = require("mongoose");
const { sendWeeklyReports } = require("./weeklyReport");

async function run() {
  console.log("=========================================");
  console.log("🚀 Manual Weekly Report Trigger Started");
  console.log("=========================================");

  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is undefined. Check your .env file.");
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: true,
    });

    console.log("✅ MongoDB connected");

    console.log("📤 Executing sendWeeklyReports()...");
    await sendWeeklyReports();

    console.log("✅ Weekly reports completed successfully");

  } catch (err) {
    console.error("❌ Manual run failed:", err.message);
  } finally {
    try {
      await mongoose.disconnect();
      console.log("🔌 MongoDB disconnected");
    } catch (err) {
      console.error("⚠️ Failed to disconnect Mongo:", err.message);
    }

    console.log("=========================================");
    console.log("🏁 Manual Weekly Report Finished");
    console.log("=========================================");

    process.exit(0);
  }
}

run();