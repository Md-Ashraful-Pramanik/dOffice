const keyService = require("../services/keyService");

function setAudit(res, action, metadata) {
  res.locals.auditAction = action;
  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    ...(metadata || {}),
  };
}

async function uploadPreKeyBundle(req, res, next) {
  try {
    await keyService.uploadPreKeyBundle(req.auth.user, req.auth.sessionId, req.body);
    setAudit(res, "keys.upload", {
      userId: req.auth.user.id,
    });
    res.status(201).send();
  } catch (error) {
    next(error);
  }
}

async function getUserPreKeyBundle(req, res, next) {
  try {
    const response = await keyService.getUserPreKeyBundle(req.auth.user, req.params.userId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function listUserDevices(req, res, next) {
  try {
    const response = await keyService.listUserDevices(req.auth.user, req.auth.sessionId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function removeDevice(req, res, next) {
  try {
    await keyService.removeDevice(req.auth.user, req.params.deviceId, req.auth.sessionId);
    setAudit(res, "device.remove", {
      deviceId: req.params.deviceId,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function getUserKeyFingerprint(req, res, next) {
  try {
    const response = await keyService.getUserKeyFingerprint(req.auth.user, req.params.userId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  uploadPreKeyBundle,
  getUserPreKeyBundle,
  listUserDevices,
  removeDevice,
  getUserKeyFingerprint,
};
