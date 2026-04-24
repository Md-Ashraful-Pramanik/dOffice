const express = require("express");

const userController = require("../controllers/userController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
	validateUpdateCurrentUserPayload,
	validateCreateOrganizationUserPayload,
	validateUpdateOrganizationUserPayload,
	validateListUsersQuery,
	validateDirectoryQuery,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.get("/user", requireAuth, userController.getCurrentUser);
router.put("/user", requireAuth, validateUpdateCurrentUserPayload, userController.updateCurrentUser);

router.get("/organizations/:orgId/users", requireAuth, validateListUsersQuery, userController.listOrganizationUsers);
router.post(
	"/organizations/:orgId/users",
	requireAuth,
	validateCreateOrganizationUserPayload,
	userController.createUser
);

router.get("/users/:userId", requireAuth, userController.getUserProfile);
router.put("/users/:userId", requireAuth, validateUpdateOrganizationUserPayload, userController.updateUser);
router.post("/users/:userId/deactivate", requireAuth, userController.deactivateUser);
router.post("/users/:userId/reactivate", requireAuth, userController.reactivateUser);
router.delete("/users/:userId", requireAuth, userController.deleteUser);

router.get("/organizations/:orgId/directory", requireAuth, validateDirectoryQuery, userController.getDirectory);
router.get("/organizations/:orgId/orgchart", requireAuth, userController.getOrgChart);

router.get("/user/sessions", requireAuth, userController.listSessions);
router.delete("/user/sessions/:sessionId", requireAuth, userController.revokeSession);
router.post("/user/sessions/revoke-others", requireAuth, userController.revokeOtherSessions);

module.exports = router;
