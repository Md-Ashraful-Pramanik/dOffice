const express = require("express");

const auditController = require("../controllers/auditController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/audits", requireAuth, auditController.getAudits);

module.exports = router;
