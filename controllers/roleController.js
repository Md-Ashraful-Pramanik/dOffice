const roleService = require("../services/roleService");

async function listRoles(req, res, next) {
  try {
    const response = await roleService.listRoles(req.auth.user, req.params.orgId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function getRole(req, res, next) {
  try {
    const response = await roleService.getRole(req.auth.user, req.params.orgId, req.params.roleId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function createRole(req, res, next) {
  try {
    const response = await roleService.createRole(req.auth.user, req.params.orgId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function updateRole(req, res, next) {
  try {
    const response = await roleService.updateRole(req.auth.user, req.params.orgId, req.params.roleId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function deleteRole(req, res, next) {
  try {
    await roleService.deleteRole(req.auth.user, req.params.orgId, req.params.roleId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function assignRoleToUser(req, res, next) {
  try {
    const response = await roleService.assignRoleToUser(req.auth.user, req.params.userId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function removeRoleFromUser(req, res, next) {
  try {
    const response = await roleService.removeRoleFromUser(
      req.auth.user,
      req.params.userId,
      req.params.roleId,
      req.query.orgId || null
    );
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function listAllPermissions(req, res, next) {
  try {
    const response = await roleService.listAllPermissions(req.auth.user);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function getEffectivePermissions(req, res, next) {
  try {
    const response = await roleService.getEffectivePermissions(
      req.auth.user,
      req.params.userId,
      req.query.orgId || null
    );
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  assignRoleToUser,
  removeRoleFromUser,
  listAllPermissions,
  getEffectivePermissions,
};
