const unitService = require(
  "../services/unit.service"
);

async function createUnit(req, res) {
  try {
    const unit =
      await unitService.createUnit({
        name: req.body.name,
        yearId: req.body.yearId,
        teacherId: req.user.id,
      });

    res.json({
      msg: "Unit created",
      unit,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error creating unit",
      });
  }
}

async function listUnits(req, res) {
  try {
    const units =
      await unitService.listUnits({
        yearId: req.query.yearId,
      });

    res.json(units);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error listing units",
      });
  }
}

async function listUnitsByYear(req, res) {
  try {
    const units =
      await unitService.listUnitsByYear(
        req.params.yearId
      );

    res.json(units);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error listing units for year",
      });
  }
}

async function getUnit(req, res) {
  try {
    const unit =
      await unitService.getUnitWithChapters(
        req.params.unitId
      );

    res.json(unit);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error fetching unit",
      });
  }
}

async function updateUnit(req, res) {
  try {
    const unit =
      await unitService.updateUnit(
        req.params.unitId,
        {
          name: req.body.name,
          yearId: req.body.yearId,
        }
      );

    res.json({
      msg: "Unit updated",
      unit,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error updating unit",
      });
  }
}

async function deleteUnit(req, res) {
  try {
    await unitService.deleteUnit(
      req.params.unitId
    );

    res.json({
      msg: "Unit deleted",
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error deleting unit",
      });
  }
}

module.exports = {
  createUnit,
  listUnits,
  listUnitsByYear,
  getUnit,
  updateUnit,
  deleteUnit,
};