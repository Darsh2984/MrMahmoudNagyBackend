const service = require("../services/taskAIGrading.service");
const { removeTempFiles } = require("../services/aiCorrection.service");
function sendError(res, error) {
  return res.status(error.status || 500).json({ msg: error.message || "AI grading request failed." });
}
async function authorizeTask(req, res, next) {
  try { await service.assertTaskAccess(req.params.taskId, req.user); next(); }
  catch (error) { return sendError(res, error); }
}
async function getPack(req, res) {
  try { return res.json({ pack: await service.getTaskPack(req.params.taskId, req.user) }); }
  catch (error) { return sendError(res, error); }
}
async function uploadPack(req, res) {
  try {
    return res.status(202).json({ pack: await service.uploadTaskPack(req.params.taskId, req.user, req.files) });
  } catch (error) { return sendError(res, error); }
  finally { await removeTempFiles(req.files); }
}
async function retryPack(req, res) {
  try { return res.status(202).json({ pack: await service.retryPack(req.params.taskId, req.user) }); }
  catch (error) { return sendError(res, error); }
}
async function approvePack(req, res) {
  try { return res.json({ pack: await service.approvePack(req.params.taskId, req.user, req.body.packId) }); }
  catch (error) { return sendError(res, error); }
}
async function getCorrections(req, res) {
  try { return res.json(await service.listCorrections(req.params.submissionId, req.user)); }
  catch (error) { return sendError(res, error); }
}
async function startCorrection(req, res) {
  try { return res.status(202).json(await service.startCorrection(req.params.submissionId, req.user, req.body.fileIds)); }
  catch (error) { return sendError(res, error); }
}
module.exports = { authorizeTask, getPack, uploadPack, retryPack, approvePack, getCorrections, startCorrection };
