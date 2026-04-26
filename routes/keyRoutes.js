const express = require("express");

const keyController = require("../controllers/keyController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  validateUploadPreKeyBundlePayload,
  validateUserPreKeyBundleQuery,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.post(
  "/user/keys",
  requireAuth,
  validateUploadPreKeyBundlePayload,
  keyController.uploadPreKeyBundle
);

router.get(
  "/users/:userId/keys",
  requireAuth,
  validateUserPreKeyBundleQuery,
  keyController.getUserPreKeyBundle
);

router.get(
  "/users/:userId/keys/fingerprint",
  requireAuth,
  keyController.getUserKeyFingerprint
);

router.get(
  "/user/devices",
  requireAuth,
  keyController.listUserDevices
);

router.delete(
  "/user/devices/:deviceId",
  requireAuth,
  keyController.removeDevice
);

module.exports = router;
