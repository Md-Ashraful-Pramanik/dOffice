const express = require("express");

const organizationController = require("../controllers/organizationController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  validateCreateOrganizationPayload,
  validateUpdateOrganizationPayload,
  validateMoveOrganizationPayload,
  validateMergeOrganizationsPayload,
  validateCloneOrganizationPayload,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.get("/organizations", requireAuth, organizationController.listOrganizations);
router.get("/organizations/tree", requireAuth, organizationController.getOrganizationTree);
router.get("/organizations/:orgId", requireAuth, organizationController.getOrganization);

router.post(
  "/organizations",
  requireAuth,
  validateCreateOrganizationPayload,
  organizationController.createOrganization
);

router.post(
  "/organizations/:orgId/children",
  requireAuth,
  validateCreateOrganizationPayload,
  organizationController.createSubOrganization
);

router.put(
  "/organizations/:orgId",
  requireAuth,
  validateUpdateOrganizationPayload,
  organizationController.updateOrganization
);

router.post(
  "/organizations/:orgId/move",
  requireAuth,
  validateMoveOrganizationPayload,
  organizationController.moveOrganization
);

router.post(
  "/organizations/merge",
  requireAuth,
  validateMergeOrganizationsPayload,
  organizationController.mergeOrganizations
);

router.post(
  "/organizations/:orgId/clone",
  requireAuth,
  validateCloneOrganizationPayload,
  organizationController.cloneOrganization
);

router.post("/organizations/:orgId/archive", requireAuth, organizationController.archiveOrganization);
router.post("/organizations/:orgId/restore", requireAuth, organizationController.restoreOrganization);
router.delete("/organizations/:orgId", requireAuth, organizationController.deleteOrganization);

module.exports = router;
