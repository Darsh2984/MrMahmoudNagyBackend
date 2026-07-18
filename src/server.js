const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const jwt = require("jsonwebtoken");
const prisma = require("./config/prisma");
const {
  assertTicketAccess,
} = require("./services/ticket.service");
const { Server } = require("socket.io");

dotenv.config();

const authenticate = require("./middleware/auth.middleware");
const authRoutes = require("./routes/auth.routes");
const unitRoutes = require("./routes/unit.routes");
const chapterRoutes = require("./routes/chapter.routes");
const topicRoutes = require("./routes/topic.routes");
const resourceRoutes = require("./routes/resource.routes");
const groupRoutes = require("./routes/group.routes");
const assistantAssignmentRoutes = require("./routes/assistantAssignment.routes");
const studentRoutes = require("./routes/student.routes");
const sessionRoutes = require("./routes/session.routes");
const liveQuestionRoutes = require("./routes/liveQuestion.routes");
const taskRoutes = require("./routes/task.routes");
const submissionRoutes = require("./routes/submission.routes");
const delegationRoutes = require("./routes/delegation.routes");
const ticketCategoryRoutes = require("./routes/ticketCategory.routes");
const ticketRoutes = require("./routes/ticket.routes");
const assistantStatsRoutes = require("./routes/assistantStats.routes");
const notificationRoutes = require("./routes/notification.routes");
const yearRoutes = require("./routes/year.routes");
const schoolRoutes = require("./routes/school.routes");
const questionRoutes = require("./routes/question.routes");
const quizRoutes = require("./routes/quiz.routes");
const quizStudentRoutes = require("./routes/quizStudent.routes");
const inClassQuizRoutes = require("./routes/inClassQuiz.routes");
const videoCheckpointRoutes = require("./routes/videoCheckpoint.routes");
const adminRoutes = require("./routes/admin.routes");
const performanceRoutes = require("./routes/performance.routes");
const dashboardSummaryRoutes = require("./routes/dashboardSummary.routes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.FRONTEND_URL || "*" } });
app.set("io", io);

app.use(cors());
app.use(express.json());
app.use(authenticate); // attaches req.user (or null) on every request

app.use("/api/auth", authRoutes);
app.use("/api/units", unitRoutes);
app.use("/api/chapters", chapterRoutes);
app.use("/api/topics", topicRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/assistant-assignments", assistantAssignmentRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/live-questions", liveQuestionRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/delegations", delegationRoutes);
app.use("/api/ticket-categories", ticketCategoryRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/assistant-stats", assistantStatsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/years", yearRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/quiz-student", quizStudentRoutes);
app.use("/api/inclassquiz", inClassQuizRoutes);
app.use("/api/videocheckpoint", videoCheckpointRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/dashboard", dashboardSummaryRoutes);

// Additional route modules get mounted here as each phase is built, see PROJECT_SPEC.md.

io.use(async (socket, next) => {
  try {
    const rawToken =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization;

    const token =
      typeof rawToken === "string" &&
      rawToken.startsWith("Bearer ")
        ? rawToken.slice(7)
        : rawToken;

    if (!token) {
      return next(
        new Error("Authentication required")
      );
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.id,
      },

      select: {
        id: true,
        name: true,
        role: true,
        isHeadAssistant: true,
      },
    });

    if (!user) {
      return next(
        new Error("User not found")
      );
    }

    socket.user = user;

    next();
  } catch (error) {
    next(new Error("Invalid authentication token"));
  }
});

io.on("connection", (socket) => {
  console.log(
    `Socket connected: ${socket.id} (${socket.user.name})`
  );

  socket.on(
    "join-ticket",
    async ({ ticketId }, callback) => {
      try {
        if (!ticketId) {
          throw {
            status: 400,
            msg: "Ticket ID is required",
          };
        }

        const ticket =
          await prisma.ticket.findUnique({
            where: {
              id: String(ticketId),
            },

            select: {
              id: true,
              createdById: true,
              assignedAssistantId: true,
            },
          });

        if (!ticket) {
          throw {
            status: 404,
            msg: "Ticket not found",
          };
        }

        assertTicketAccess(
          ticket,
          socket.user
        );

        socket.join(String(ticketId));

        callback?.({
          ok: true,
        });
      } catch (error) {
        callback?.({
          ok: false,
          msg:
            error.msg ||
            "Unable to join ticket",
        });
      }
    }
  );

  socket.on(
    "ticket-typing-start",
    ({ ticketId }) => {
      if (
        !ticketId ||
        !socket.rooms.has(String(ticketId))
      ) {
        return;
      }

      socket
        .to(String(ticketId))
        .emit("ticket-user-typing", {
          ticketId: String(ticketId),
          user: socket.user,
          isTyping: true,
        });
    }
  );

  socket.on(
    "ticket-typing-stop",
    ({ ticketId }) => {
      if (
        !ticketId ||
        !socket.rooms.has(String(ticketId))
      ) {
        return;
      }

      socket
        .to(String(ticketId))
        .emit("ticket-user-typing", {
          ticketId: String(ticketId),
          user: socket.user,
          isTyping: false,
        });
    }
  );

  socket.on(
    "leave-ticket",
    ({ ticketId }) => {
      if (!ticketId) {
        return;
      }

      socket
        .to(String(ticketId))
        .emit("ticket-user-typing", {
          ticketId: String(ticketId),
          user: socket.user,
          isTyping: false,
        });

      socket.leave(String(ticketId));
    }
  );

  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room === socket.id) {
        continue;
      }

      socket
        .to(room)
        .emit("ticket-user-typing", {
          ticketId: room,
          user: socket.user,
          isTyping: false,
        });
    }
  });

  socket.on("disconnect", () => {
    console.log(
      `Socket disconnected: ${socket.id}`
    );
  });
});

// Multer (file upload) errors arrive as plain objects/errors, not JSON responses by
// default — normalize them here so the frontend always gets consistent JSON.
app.use((err, req, res, next) => {
  if (err) {
    return res.status(err.status || 400).json({ msg: err.msg || err.message || "Upload error" });
  }
  next();
});

const PORT = process.env.PORT || 6000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
