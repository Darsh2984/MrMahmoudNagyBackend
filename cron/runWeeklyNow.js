require("dotenv").config({ path: __dirname + "/../.env" });

const mongoose = require("mongoose");
const { sendWeeklyReports } = require("./weeklyReport");

(async () => {
  try {
    console.log("🔌 Connecting to MongoDB...");
    console.log("MONGO_URI =", process.env.MONGO_URI);

    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is undefined. Check your .env file.");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    console.log("🚀 Running weekly report manually...");
    await sendWeeklyReports();

    console.log("✅ Done.");
    process.exit();
  } catch (err) {
    console.error("❌ Manual run failed:", err.message);
    process.exit(1);
  }
})();
