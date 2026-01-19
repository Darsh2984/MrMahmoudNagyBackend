require("dotenv").config();
const mongoose = require("mongoose");
const { sendWeeklyReports } = require("../cron/weeklyReport");

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ DB connected");

    await sendWeeklyReports();

    console.log("✅ Manual weekly report run finished");
    process.exit(0);
  } catch (err) {
    console.error("❌ Manual run failed:", err.message);
    process.exit(1);
  }
}

run();
