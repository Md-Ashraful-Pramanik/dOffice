const express = require("express");

const teamController = require("../controllers/teamController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  validateListTeamsQuery,
  validateCreateTeamPayload,
  validateUpdateTeamPayload,
  validateAddMembersPayload,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.get("/organizations/:orgId/teams", requireAuth, validateListTeamsQuery, teamController.listTeams);
router.get("/organizations/:orgId/teams/:teamId", requireAuth, teamController.getTeam);
router.post("/organizations/:orgId/teams", requireAuth, validateCreateTeamPayload, teamController.createTeam);
router.put("/organizations/:orgId/teams/:teamId", requireAuth, validateUpdateTeamPayload, teamController.updateTeam);
router.delete("/organizations/:orgId/teams/:teamId", requireAuth, teamController.deleteTeam);
router.post(
  "/organizations/:orgId/teams/:teamId/members",
  requireAuth,
  validateAddMembersPayload,
  teamController.addMembers
);
router.delete(
  "/organizations/:orgId/teams/:teamId/members/:userId",
  requireAuth,
  teamController.removeMember
);

module.exports = router;
