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
const inClassQuizRoutes = require("./routes/inClassQuiz.js") ;
const videoCheckpointRoutes = require("./routes/videoCheckpoint");
const quizStopQuestionRoutes = require("./routes/quizStopQuestionRoutes");
const ticketCategoriesRoutes = require("./routes/ticketCategories");
const ticketRoutes = require("./routes/tickets");
const ticketAnalyticsRoutes = require("./routes/ticketAnalytics");
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
});
app.set("io", io);
const activeTicketUsers = new Map();
// ticketId -> Set(userId)

const socketUsers = new Map();
// socketId -> userId
io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);

  socket.on("join-ticket", ({ ticketId, userId }) => {
    socket.join(ticketId);

    socketUsers.set(socket.id, userId);

    if (!activeTicketUsers.has(ticketId)) {
      activeTicketUsers.set(ticketId, new Set());
    }

    activeTicketUsers.get(ticketId).add(userId);
  });

  socket.on("leave-ticket", ({ ticketId, userId }) => {
    if (activeTicketUsers.has(ticketId)) {
      activeTicketUsers.get(ticketId).delete(userId);

      if (activeTicketUsers.get(ticketId).size === 0) {
        activeTicketUsers.delete(ticketId);
      }
    }
  });

  socket.on("disconnect", () => {
    const userId = socketUsers.get(socket.id);

    if (userId) {
      activeTicketUsers.forEach((users, ticketId) => {
        users.delete(userId);
        if (users.size === 0) {
          activeTicketUsers.delete(ticketId);
        }
      });
    }

    socketUsers.delete(socket.id);
    console.log("🔴 Socket disconnected:", socket.id);
  });
});





require("./cron/weeklyReport");
app.use(cors());
app.use(express.json());
// server.js
require("./cron/deadlineNotifier"); // ✅ starts cron job
app.set("activeTicketUsers", activeTicketUsers);

// DB connect
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error(err));


require("./cron/weeklyReport");
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
app.use("/api/inclassquiz", inClassQuizRoutes);
app.use("/api/videocheckpoint", videoCheckpointRoutes);
app.use("/api/quizstop", quizStopQuestionRoutes);
const auth = require("./middleware/auth");
app.use("/api/ticket-categories", auth, ticketCategoriesRoutes);
app.use("/api/tickets", auth, require("./routes/tickets"));
app.use("/api/ticket-analytics",auth, require("./routes/ticketAnalytics"));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);