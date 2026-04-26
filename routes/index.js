const express = require("express");

const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const auditRoutes = require("./auditRoutes");
const organizationRoutes = require("./organizationRoutes");
const roleRoutes = require("./roleRoutes");
const teamRoutes = require("./teamRoutes");
const delegationRoutes = require("./delegationRoutes");
const channelRoutes = require("./channelRoutes");
const conversationRoutes = require("./conversationRoutes");
const messageRoutes = require("./messageRoutes");
const moderationRoutes = require("./moderationRoutes");
const fileRoutes = require("./fileRoutes");
const keyRoutes = require("./keyRoutes");
const notificationRoutes = require("./notificationRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use(userRoutes);
router.use(auditRoutes);
router.use(organizationRoutes);
router.use(roleRoutes);
router.use(teamRoutes);
router.use(delegationRoutes);
router.use(channelRoutes);
router.use(conversationRoutes);
router.use(messageRoutes);
router.use(moderationRoutes);
router.use(fileRoutes);
router.use(keyRoutes);
router.use(notificationRoutes);

module.exports = router;
