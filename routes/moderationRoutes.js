const express = require("express");

const moderationController = require("../controllers/moderationController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  validateListReportsQuery,
  validateResolveReportPayload,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.get(
  "/organizations/:orgId/moderation/reports",
  requireAuth,
  validateListReportsQuery,
  moderationController.listReportedMessages
);

router.put(
  "/organizations/:orgId/moderation/reports/:reportId",
  requireAuth,
  validateResolveReportPayload,
  moderationController.resolveReport
);

module.exports = router;
