const express = require("express");

const delegationController = require("../controllers/delegationController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  validateListDelegationsQuery,
  validateCreateDelegationPayload,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.get(
  "/users/:userId/delegations",
  requireAuth,
  validateListDelegationsQuery,
  delegationController.listDelegations
);
router.post(
  "/users/:userId/delegations",
  requireAuth,
  validateCreateDelegationPayload,
  delegationController.createDelegation
);
router.delete(
  "/users/:userId/delegations/:delegationId",
  requireAuth,
  delegationController.revokeDelegation
);

module.exports = router;
