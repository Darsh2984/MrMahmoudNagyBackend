const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const authenticate = require("./middleware/auth.middleware");
const authRoutes = require("./routes/auth.routes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.FRONTEND_URL || "*" } });
app.set("io", io);

app.use(cors());
app.use(express.json());
app.use(authenticate); // attaches req.user (or null) on every request

app.use("/api/auth", authRoutes);

// Additional route modules get mounted here as each phase is built:
// app.use("/api/units", require("./routes/unit.routes"));
// app.use("/api/tickets", require("./routes/ticket.routes"));
// ...etc, see PROJECT_SPEC.md Phase checklist.

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  // Ticket room join/leave logic to be ported from old server.js in Phase 3.
});

const PORT = process.env.PORT || 6000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
