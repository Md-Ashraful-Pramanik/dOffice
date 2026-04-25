const express = require("express");

const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const auditRoutes = require("./auditRoutes");
const organizationRoutes = require("./organizationRoutes");
const roleRoutes = require("./roleRoutes");
const teamRoutes = require("./teamRoutes");
const delegationRoutes = require("./delegationRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use(userRoutes);
router.use(auditRoutes);
router.use(organizationRoutes);
router.use(roleRoutes);
router.use(teamRoutes);
router.use(delegationRoutes);

module.exports = router;
