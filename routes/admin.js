const express = require("express");
const router = express.Router();
const ExcelJS = require("exceljs");

const User = require("../models/User"); // adjust path

// GET /api/admin/export-users
router.get("/export-users", async (req, res) => {
  try {
    // 🔹 Fetch users with parent + school populated
    const users = await User.find({})
      .populate("parentId", "name email parentPhone")
      .populate("schoolId", "name");

    // 🔹 Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Users");

    // 🔹 Define columns
    worksheet.columns = [
      { header: "Name", key: "name", width: 25 },
      { header: "Role", key: "role", width: 15 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone Number", key: "phone", width: 20 },
      { header: "School", key: "school", width: 25 },
      { header: "Parent Name", key: "parentName", width: 25 },
      { header: "Parent Email", key: "parentEmail", width: 30 },
      { header: "Parent Phone", key: "parentPhone", width: 20 },
    ];

    // 🔹 Add rows
    users.forEach((u) => {
      let phone = "N/A";

      if (u.role === "student") phone = u.studentPhone || "N/A";
      if (u.role === "parent") phone = u.parentPhone || "N/A";
      if (u.role === "teacher") phone = u.teacherPhone || "N/A"; // if you later add

      worksheet.addRow({
        name: u.name,
        role: u.role,
        email: u.email,
        phone,
        school: u.schoolId?.name || "N/A",
        parentName: u.parentId?.name || "N/A",
        parentEmail: u.parentId?.email || "N/A",
        parentPhone: u.parentId?.parentPhone || "N/A",
      });
    });

    // 🔹 Style header
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B3C49" }, // deep teal
    };

    // 🔹 Send file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Error exporting users:", err);
    res.status(500).json({ msg: "❌ Failed to export users" });
  }
});

module.exports = router;
