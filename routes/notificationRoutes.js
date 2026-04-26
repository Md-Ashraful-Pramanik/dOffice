const express = require("express");

const notificationController = require("../controllers/notificationController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  validateListNotificationsQuery,
  validateUpdateNotificationPreferencesPayload,
} = require("../middleware/validationMiddleware");

const router = express.Router();

router.get(
  "/notifications",
  requireAuth,
  validateListNotificationsQuery,
  notificationController.listNotifications
);

router.put(
  "/notifications/:notificationId/read",
  requireAuth,
  notificationController.markNotificationRead
);

router.post(
  "/notifications/read-all",
  requireAuth,
  notificationController.markAllNotificationsRead
);

router.get(
  "/user/notification-preferences",
  requireAuth,
  notificationController.getNotificationPreferences
);

router.put(
  "/user/notification-preferences",
  requireAuth,
  validateUpdateNotificationPreferencesPayload,
  notificationController.updateNotificationPreferences
);

module.exports = router;
