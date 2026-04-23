const express = require("express");

const userController = require("../controllers/userController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/user", requireAuth, userController.getCurrentUser);

module.exports = router;
