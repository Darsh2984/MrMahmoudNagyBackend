const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();
const app = express();
const yearGroupRoutes = require("./routes/yearGroup");
const sessionRoutes = require("./routes/session");
const taskRoutes = require("./routes/task");
const unitChapterRoutes = require("./routes/unitChapter");
const questionRoutes = require("./routes/question");
const quizStudentRoutes = require("./routes/quizStudent");
const quizRoutes = require("./routes/quiz");
const videoRoutes = require("./routes/video");
const materialRoutes = require("./routes/material");
const schoolRoutes = require("./routes/school");
const adminRoutes = require("./routes/admin");
const studentRoutes = require("./routes/students");
const testRoutes = require("./routes/test");

app.use(cors());
app.use(express.json());

// DB connect
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error(err));

// Routes
app.use("/uploads", express.static("uploads"));
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);
app.use("/api", yearGroupRoutes);
app.use("/api", sessionRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api", unitChapterRoutes);
app.use("/api", questionRoutes);
app.use("/api/quiz", quizRoutes);           // teacher routes
app.use("/api/quiz-student", quizStudentRoutes); // student routes
app.use("/api/performance", require("./routes/performance"));
app.use("/api/video", videoRoutes);
app.use("/api/material", materialRoutes);
app.use("/api/school",schoolRoutes );
app.use("/api/admin", adminRoutes);
app.use("/api/students", studentRoutes);
app.use("/api", testRoutes);











const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
