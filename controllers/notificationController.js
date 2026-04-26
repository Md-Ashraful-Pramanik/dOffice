const notificationService = require("../services/notificationService");

function setAudit(res, action, metadata) {
  res.locals.auditAction = action;
  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    ...(metadata || {}),
  };
}

async function listNotifications(req, res, next) {
  try {
    const response = await notificationService.listNotifications(req.auth.user, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    await notificationService.markNotificationRead(req.auth.user, req.params.notificationId);
    setAudit(res, "notification.read", {
      notificationId: req.params.notificationId,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    await notificationService.markAllNotificationsRead(req.auth.user);
    setAudit(res, "notification.read_all", {
      userId: req.auth.user.id,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function getNotificationPreferences(req, res, next) {
  try {
    const response = await notificationService.getNotificationPreferences(req.auth.user);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function updateNotificationPreferences(req, res, next) {
  try {
    const response = await notificationService.updateNotificationPreferences(req.auth.user, req.body);
    setAudit(res, "notification.preferences.update", {
      userId: req.auth.user.id,
    });
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
};
