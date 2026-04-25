const express = require("express");

const channelController = require("../controllers/channelController");
const channelCategoryController = require("../controllers/channelCategoryController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  validateListChannelsQuery,
  validateCreateChannelPayload,
  validateUpdateChannelPayload,
  validateInviteChannelMembersPayload,
  validateListChannelMembersQuery,
  validateSetChannelMemberRolePayload,
  validateListCategoriesQuery,
  validateCreateCategoryPayload,
  validateUpdateCategoryPayload,
  validateReorderCategoriesPayload,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.get(
  "/organizations/:orgId/channels",
  requireAuth,
  validateListChannelsQuery,
  channelController.listChannels
);

router.post(
  "/organizations/:orgId/channels",
  requireAuth,
  validateCreateChannelPayload,
  channelController.createChannel
);

router.get(
  "/channels/:channelId",
  requireAuth,
  channelController.getChannel
);

router.put(
  "/channels/:channelId",
  requireAuth,
  validateUpdateChannelPayload,
  channelController.updateChannel
);

router.delete(
  "/channels/:channelId",
  requireAuth,
  channelController.deleteChannel
);

router.post(
  "/channels/:channelId/join",
  requireAuth,
  channelController.joinChannel
);

router.post(
  "/channels/:channelId/leave",
  requireAuth,
  channelController.leaveChannel
);

router.post(
  "/channels/:channelId/invite",
  requireAuth,
  validateInviteChannelMembersPayload,
  channelController.inviteToChannel
);

router.get(
  "/channels/:channelId/members",
  requireAuth,
  validateListChannelMembersQuery,
  channelController.listChannelMembers
);

router.put(
  "/channels/:channelId/members/:userId",
  requireAuth,
  validateSetChannelMemberRolePayload,
  channelController.setChannelMemberRole
);

router.delete(
  "/channels/:channelId/members/:userId",
  requireAuth,
  channelController.removeMember
);

router.get(
  "/organizations/:orgId/channel-categories",
  requireAuth,
  validateListCategoriesQuery,
  channelCategoryController.listCategories
);

router.post(
  "/organizations/:orgId/channel-categories",
  requireAuth,
  validateCreateCategoryPayload,
  channelCategoryController.createCategory
);

router.put(
  "/organizations/:orgId/channel-categories/reorder",
  requireAuth,
  validateReorderCategoriesPayload,
  channelCategoryController.reorderCategories
);

router.put(
  "/organizations/:orgId/channel-categories/:categoryId",
  requireAuth,
  validateUpdateCategoryPayload,
  channelCategoryController.updateCategory
);

router.delete(
  "/organizations/:orgId/channel-categories/:categoryId",
  requireAuth,
  channelCategoryController.deleteCategory
);

module.exports = router;
