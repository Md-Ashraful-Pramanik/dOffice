const express = require("express");

const conversationController = require("../controllers/conversationController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  validateListConversationsQuery,
  validateCreateConversationPayload,
  validateConversationParticipantsPayload,
  validateListMessagesQuery,
  validateCreateMessagePayload,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.get(
  "/conversations",
  requireAuth,
  validateListConversationsQuery,
  conversationController.listConversations
);

router.post(
  "/conversations",
  requireAuth,
  validateCreateConversationPayload,
  conversationController.createConversation
);

router.get(
  "/conversations/:conversationId",
  requireAuth,
  conversationController.getConversation
);

router.post(
  "/conversations/:conversationId/participants",
  requireAuth,
  validateConversationParticipantsPayload,
  conversationController.addConversationParticipants
);

router.delete(
  "/conversations/:conversationId/participants/:userId",
  requireAuth,
  conversationController.removeConversationParticipant
);

router.get(
  "/conversations/:conversationId/messages",
  requireAuth,
  validateListMessagesQuery,
  conversationController.listConversationMessages
);

router.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  validateCreateMessagePayload,
  conversationController.sendConversationMessage
);

module.exports = router;
