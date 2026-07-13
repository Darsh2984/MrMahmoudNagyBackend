const studentService = require("../services/student.service");

async function setAttendanceMode(req, res) {
  try {
    const student = await studentService.setAttendanceMode(req.params.studentId, req.body.attendanceMode);
    res.json({ msg: "Attendance mode updated", student });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating attendance mode" });
  }
}

async function getProfile(req, res) {
  try {
    const student = await studentService.getStudentProfile(req.params.studentId);
    res.json(student);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching student profile" });
  }
}

module.exports = { setAttendanceMode, getProfile };
