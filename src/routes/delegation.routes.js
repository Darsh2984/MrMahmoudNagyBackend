const express =
  require("express");

const router =
  express.Router();

const delegationController =
  require("../controllers/delegation.controller");

const {
  requireAdminLevel,
} = require("../middleware/rbac.middleware");

/**
 * Delegate one submission.
 */
router.post(
  "/",
  requireAdminLevel,
  delegationController.delegateSubmission,
);

/**
 * Delegate multiple submissions to one assistant.
 */
router.post(
  "/bulk",
  requireAdminLevel,
  delegationController.bulkDelegateSubmissions,
);

/**
 * Reassign a pending delegation.
 */
router.patch(
  "/:delegationId/reassign",
  requireAdminLevel,
  delegationController.reassignDelegation,
);

/**
 * Remove a pending delegation and return the
 * submission to the unassigned queue.
 *
 * Express supports a JSON body on DELETE,
 * but the reason is optional.
 */
router.delete(
  "/:delegationId",
  requireAdminLevel,
  delegationController.removeDelegation,
);

/**
 * View delegation history for one submission.
 */
router.get(
  "/submission/:submissionId/history",
  requireAdminLevel,
  delegationController.getSubmissionDelegationHistory,
);

/**
 * Delegation workload counts.
 */
router.get(
  "/counts",
  requireAdminLevel,
  delegationController.getDelegationCounts,
);

module.exports = router;