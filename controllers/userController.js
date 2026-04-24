const userService = require("../services/userService");

async function getCurrentUser(req, res, next) {
  try {
    const response = await userService.getCurrentUser(req.auth.user);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function updateCurrentUser(req, res, next) {
  try {
    const response = await userService.updateCurrentUser(req.auth.user, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function listOrganizationUsers(req, res, next) {
  try {
    const response = await userService.listOrganizationUsers(req.auth.user, req.params.orgId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function getUserProfile(req, res, next) {
  try {
    const response = await userService.getUserProfile(req.auth.user, req.params.userId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function createUser(req, res, next) {
  try {
    const response = await userService.createUserInOrganization(req.auth.user, req.params.orgId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const response = await userService.updateUserByAdmin(req.auth.user, req.params.userId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function deactivateUser(req, res, next) {
  try {
    const response = await userService.deactivateUser(req.auth.user, req.params.userId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function reactivateUser(req, res, next) {
  try {
    const response = await userService.reactivateUser(req.auth.user, req.params.userId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    await userService.deleteUser(req.auth.user, req.params.userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function getDirectory(req, res, next) {
  try {
    const response = await userService.getOrganizationDirectory(req.auth.user, req.params.orgId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function getOrgChart(req, res, next) {
  try {
    const response = await userService.getOrganizationOrgChart(req.auth.user, req.params.orgId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function listSessions(req, res, next) {
  try {
    const response = await userService.listActiveSessions(req.auth.user, req.auth.sessionId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function revokeSession(req, res, next) {
  try {
    await userService.revokeSession(req.auth.user, req.params.sessionId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function revokeOtherSessions(req, res, next) {
  try {
    await userService.revokeOtherSessions(req.auth.user, req.auth.sessionId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCurrentUser,
  updateCurrentUser,
  listOrganizationUsers,
  getUserProfile,
  createUser,
  updateUser,
  deactivateUser,
  reactivateUser,
  deleteUser,
  getDirectory,
  getOrgChart,
  listSessions,
  revokeSession,
  revokeOtherSessions,
};
