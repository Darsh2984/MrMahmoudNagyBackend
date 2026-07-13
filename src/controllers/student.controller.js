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

async function listUnassigned(req, res) {
  try {
    const students = await studentService.listUnassignedStudents();
    res.json(students);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing unassigned students" });
  }
}

async function updateStudent(req, res) {
  try {
    const student = await studentService.updateStudent(req.params.studentId, req.body);
    res.json({ msg: "Student updated", student });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating student" });
  }
}

async function deleteStudent(req, res) {
  try {
    await studentService.deleteStudent(req.params.studentId);
    res.json({ msg: "Student deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting student" });
  }
}

module.exports = { setAttendanceMode, getProfile, listUnassigned, updateStudent, deleteStudent };
