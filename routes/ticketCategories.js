const express = require("express");
const TicketCategory = require("../models/TicketCategory");
const User = require("../models/User");

const router = express.Router();

/**
 * STUDENT – list active categories
 */
router.get("/public", async (req, res) => {
  const categories = await TicketCategory.find({ isActive: true })
    .select("name description")
    .sort({ name: 1 });

  res.json(categories);
});

/**
 * ADMIN – list all categories
 */
router.get("/", async (req, res) => {
  const isAdminTeacher =
    req.user.role === "teacher" && req.user.assistantOf === null;

  if (!isAdminTeacher) {
    return res.status(403).json({ message: "Admin only" });
  }

  const categories = await TicketCategory.find()
    .populate("assignedAssistants", "name email")
    .sort({ createdAt: -1 });

  res.json(categories);
});

/**
 * ADMIN – create category
 */
router.post("/", async (req, res) => {
  const isAdminTeacher =
    req.user.role === "teacher" && req.user.assistantOf === null;

  if (!isAdminTeacher) {
    return res.status(403).json({ message: "Admin only" });
  }

  const { name, description, assignedAssistants = [] } = req.body;

  const assistants = await User.find({
    _id: { $in: assignedAssistants },
    assistantOf: { $ne: null },
  });

  const category = await TicketCategory.create({
    name,
    description,
    createdBy: req.user._id,
    assignedAssistants: assistants.map((a) => a._id),
  });

  res.status(201).json(category);
});

/**
 * ADMIN – update category (soft edit)
 */
router.put("/:id", async (req, res) => {
  const isAdminTeacher =
    req.user.role === "teacher" && req.user.assistantOf === null;

  if (!isAdminTeacher) {
    return res.status(403).json({ message: "Admin only" });
  }

  const update = {};

  if (req.body.name !== undefined) update.name = req.body.name;
  if (req.body.description !== undefined)
    update.description = req.body.description;
  if (req.body.isActive !== undefined) update.isActive = req.body.isActive;

  if (req.body.assignedAssistants) {
    const assistants = await User.find({
      _id: { $in: req.body.assignedAssistants },
      assistantOf: { $ne: null },
    });
    update.assignedAssistants = assistants.map((a) => a._id);
  }

  const category = await TicketCategory.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true }
  );

  res.json(category);
});

/**
 * ADMIN – soft delete category
 */
router.delete("/:id", async (req, res) => {
  const isAdminTeacher =
    req.user.role === "teacher" && req.user.assistantOf === null;

  if (!isAdminTeacher) {
    return res.status(403).json({ message: "Admin only" });
  }

  await TicketCategory.findByIdAndUpdate(req.params.id, {
    isActive: false,
  });

  res.json({ message: "Category deactivated" });
});

module.exports = router;
