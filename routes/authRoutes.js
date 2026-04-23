const express = require("express");

const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");
const { validateRegisterPayload, validateLoginPayload } = require("../middleware/validationMiddleware");

const router = express.Router();

router.post("/register", validateRegisterPayload, authController.register);
router.post("/login", validateLoginPayload, authController.login);
router.post("/logout", requireAuth, authController.logout);

module.exports = router;
