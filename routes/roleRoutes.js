const express = require("express");

const roleController = require("../controllers/roleController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  validateListRolesQuery,
  validateCreateRolePayload,
  validateUpdateRolePayload,
  validateAssignRolePayload,
  validateEffectivePermissionsQuery,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.get("/organizations/:orgId/roles", requireAuth, validateListRolesQuery, roleController.listRoles);
router.get("/organizations/:orgId/roles/:roleId", requireAuth, roleController.getRole);
router.post("/organizations/:orgId/roles", requireAuth, validateCreateRolePayload, roleController.createRole);
router.put("/organizations/:orgId/roles/:roleId", requireAuth, validateUpdateRolePayload, roleController.updateRole);
router.delete("/organizations/:orgId/roles/:roleId", requireAuth, roleController.deleteRole);

router.post("/users/:userId/roles", requireAuth, validateAssignRolePayload, roleController.assignRoleToUser);
router.delete("/users/:userId/roles/:roleId", requireAuth, roleController.removeRoleFromUser);

router.get("/permissions", requireAuth, roleController.listAllPermissions);
router.get(
  "/users/:userId/permissions",
  requireAuth,
  validateEffectivePermissionsQuery,
  roleController.getEffectivePermissions
);

module.exports = router;
