const express = require("express");

const messageController = require("../controllers/messageController");
const pollController = require("../controllers/pollController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  validateListMessagesQuery,
  validateCreateMessagePayload,
  validateUpdateMessagePayload,
  validateThreadListQuery,
  validateReactionPayload,
  validateBookmarksQuery,
  validateBookmarkPayload,
  validateCreatePollPayload,
  validateVotePollPayload,
  validateSearchMessagesQuery,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.get(
  "/messages/search",
  requireAuth,
  validateSearchMessagesQuery,
  messageController.searchMessages
);

router.get(
  "/channels/:channelId/messages",
  requireAuth,
  validateListMessagesQuery,
  messageController.listChannelMessages
);

router.post(
  "/channels/:channelId/messages",
  requireAuth,
  validateCreateMessagePayload,
  messageController.sendChannelMessage
);

router.get(
  "/messages/:messageId",
  requireAuth,
  messageController.getMessage
);

router.put(
  "/messages/:messageId",
  requireAuth,
  validateUpdateMessagePayload,
  messageController.updateMessage
);

router.delete(
  "/messages/:messageId",
  requireAuth,
  messageController.deleteMessage
);

router.get(
  "/messages/:messageId/edits",
  requireAuth,
  messageController.getMessageEditHistory
);

router.get(
  "/messages/:messageId/thread",
  requireAuth,
  validateThreadListQuery,
  messageController.listThreadMessages
);

router.post(
  "/messages/:messageId/thread",
  requireAuth,
  validateCreateMessagePayload,
  messageController.replyInThread
);

router.post(
  "/messages/:messageId/reactions",
  requireAuth,
  validateReactionPayload,
  messageController.addReaction
);

router.delete(
  "/messages/:messageId/reactions/:emoji",
  requireAuth,
  messageController.removeReaction
);

router.get(
  "/channels/:channelId/pins",
  requireAuth,
  messageController.listPinnedMessages
);

router.post(
  "/messages/:messageId/pin",
  requireAuth,
  messageController.pinMessage
);

router.delete(
  "/messages/:messageId/pin",
  requireAuth,
  messageController.unpinMessage
);

router.get(
  "/user/bookmarks",
  requireAuth,
  validateBookmarksQuery,
  messageController.listBookmarks
);

router.post(
  "/user/bookmarks",
  requireAuth,
  validateBookmarkPayload,
  messageController.addBookmark
);

router.delete(
  "/user/bookmarks/:messageId",
  requireAuth,
  messageController.removeBookmark
);

router.post(
  "/channels/:channelId/polls",
  requireAuth,
  validateCreatePollPayload,
  pollController.createPoll
);

router.post(
  "/polls/:pollId/vote",
  requireAuth,
  validateVotePollPayload,
  pollController.voteOnPoll
);

router.get(
  "/polls/:pollId",
  requireAuth,
  pollController.getPoll
);

module.exports = router;
