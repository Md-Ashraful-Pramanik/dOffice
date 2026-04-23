const express = require("express");

const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const auditRoutes = require("./auditRoutes");
const organizationRoutes = require("./organizationRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use(userRoutes);
router.use(auditRoutes);
router.use(organizationRoutes);

module.exports = router;
