const express = require("express");

const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const auditRoutes = require("./auditRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use(userRoutes);
router.use(auditRoutes);

module.exports = router;
