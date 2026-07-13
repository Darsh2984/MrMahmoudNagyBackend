const yearService = require("../services/year.service");

async function createYear(req, res) {
  try {
    const year = await yearService.createYear({ name: req.body.name, teacherId: req.user.id });
    res.json({ msg: "Year created", year });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating year" });
  }
}

async function listYearsForTeacher(req, res) {
  try {
    const years = await yearService.listYearsForTeacher(req.params.teacherId);
    res.json(years);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing years" });
  }
}

async function getYear(req, res) {
  try {
    const year = await yearService.getYear(req.params.yearId);
    res.json(year);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching year" });
  }
}

async function updateYear(req, res) {
  try {
    const year = await yearService.updateYear(req.params.yearId, req.body);
    res.json({ msg: "Year updated", year });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating year" });
  }
}

async function deleteYear(req, res) {
  try {
    await yearService.deleteYear(req.params.yearId);
    res.json({ msg: "Year deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting year" });
  }
}

async function updateZoomLinks(req, res) {
  try {
    const year = await yearService.updateZoomLinks(req.params.yearId, req.body.zoomLinks);
    res.json({ msg: "Zoom links updated", year });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating zoom links" });
  }
}

async function getZoomLinks(req, res) {
  try {
    const zoomLinks = await yearService.getZoomLinks(req.params.yearId);
    res.json(zoomLinks);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching zoom links" });
  }
}

module.exports = { createYear, listYearsForTeacher, getYear, updateYear, deleteYear, updateZoomLinks, getZoomLinks };
