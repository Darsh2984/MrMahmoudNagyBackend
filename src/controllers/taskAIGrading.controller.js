const service = require("../services/taskAIGrading.service");
const pdfService = require("../services/taskAIGradingPdf.service");
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
async function saveCorrectionReview(req, res) {
  try { return res.json(await service.saveCorrectionReview(req.params.submissionId, req.params.correctionId, req.user, req.body.result)); }
  catch (error) { return sendError(res, error); }
}
async function confirmCorrectionReview(req, res) {
  try { return res.json(await service.confirmCorrectionReview(req.params.submissionId, req.params.correctionId, req.user)); }
  catch (error) { return sendError(res, error); }
}
async function reopenCorrectionReview(req, res) {
  try { return res.json(await service.reopenCorrectionReview(req.params.submissionId, req.params.correctionId, req.user)); }
  catch (error) { return sendError(res, error); }
}
async function exportCorrectionPdf(req, res) {
  try {
    const data = await service.confirmedCorrectionForExport(req.params.submissionId, req.params.correctionId, req.user);
    const pdf = await pdfService.createCorrectionPdf(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdf.body.length);
    res.setHeader("Content-Disposition", `attachment; filename="ai-grading-review.pdf"; filename*=UTF-8''${encodeURIComponent(pdf.fileName)}`);
    return res.end(pdf.body);
  } catch (error) {
    console.error("AI grading PDF export failed:", error);
    return sendError(res, error);
  }
}
module.exports = {
  authorizeTask,
  getPack,
  uploadPack,
  retryPack,
  approvePack,
  getCorrections,
  startCorrection,
  saveCorrectionReview,
  confirmCorrectionReview,
  reopenCorrectionReview,
  exportCorrectionPdf,
};
