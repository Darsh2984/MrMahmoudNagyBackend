const schoolService = require("../services/school.service");

async function createSchool(req, res) {
  try {
    const school = await schoolService.createSchool(req.body);
    res.json({ msg: "School created", school });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating school" });
  }
}

async function listSchools(req, res) {
  try {
    const schools = await schoolService.listSchools();
    res.json(schools);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing schools" });
  }
}

async function deleteSchool(req, res) {
  try {
    await schoolService.deleteSchool(req.params.schoolId);
    res.json({ msg: "School deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting school" });
  }
}

module.exports = { createSchool, listSchools, deleteSchool };
