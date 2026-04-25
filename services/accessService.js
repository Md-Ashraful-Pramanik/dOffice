const db = require("../config/db");
const userModel = require("../models/userModel");
const organizationModel = require("../models/organizationModel");

function assert(condition, message, status = 400) {
  if (!condition) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }
}

async function getAccessContext(authUser, client = db) {
  const roleIds = await userModel.getRoleIdsByUserId(authUser.id, client);
  const isSuperAdmin = Boolean(authUser.is_super_admin || roleIds.includes("role_super_admin"));
  const isOrgAdmin = Boolean(isSuperAdmin || roleIds.includes("role_org_admin"));
  const isManager = Boolean(isOrgAdmin || roleIds.includes("role_manager"));

  let accessibleOrgIds = null;
  if (!isSuperAdmin) {
    if (!authUser.org_id) {
      accessibleOrgIds = [];
    } else {
      accessibleOrgIds = await organizationModel.getDescendantOrgIds(authUser.org_id, client);
    }
  }

  return {
    roleIds,
    isSuperAdmin,
    isOrgAdmin,
    isManager,
    accessibleOrgIds,
  };
}

function hasOrgAccess(orgId, accessContext) {
  if (accessContext.isSuperAdmin) {
    return true;
  }

  return Array.isArray(accessContext.accessibleOrgIds) && accessContext.accessibleOrgIds.includes(orgId);
}

function assertOrgAccess(orgId, accessContext) {
  assert(hasOrgAccess(orgId, accessContext), "You do not have permission to perform this action.", 403);
}

async function assertOrganizationExists(orgId, client = db) {
  const organization = await organizationModel.findById(orgId, {}, client);
  assert(organization, "Resource not found.", 404);
  return organization;
}

async function assertUserExists(userId, client = db) {
  const user = await userModel.findById(userId, client);
  assert(user, "Resource not found.", 404);
  return user;
}

module.exports = {
  assert,
  getAccessContext,
  hasOrgAccess,
  assertOrgAccess,
  assertOrganizationExists,
  assertUserExists,
};
