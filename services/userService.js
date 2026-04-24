const bcrypt = require("bcryptjs");

const db = require("../config/db");
const userModel = require("../models/userModel");
const sessionModel = require("../models/sessionModel");
const organizationModel = require("../models/organizationModel");
const { generateId } = require("../utils/id");

const USER_STATUSES = new Set(["active", "suspended", "on-leave", "deactivated", "retired"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assert(condition, message, status = 400) {
  if (!condition) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }
}

function parseNonNegativeInt(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    const error = new Error(`Invalid query parameter: ${fieldName} must be a non-negative integer.`);
    error.status = 400;
    throw error;
  }

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    const error = new Error(`Invalid query parameter: ${fieldName} must be a non-negative integer.`);
    error.status = 400;
    throw error;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    const error = new Error(`Invalid query parameter: ${fieldName} must be a non-negative integer.`);
    error.status = 400;
    throw error;
  }

  return parsed;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertValidEmail(email) {
  assert(isNonEmptyString(email), "Email is required.", 422);
  const normalized = email.trim();
  assert(normalized.length <= 254 && EMAIL_REGEX.test(normalized), "Email is invalid.", 422);
}

async function getAccessContext(authUser, client = db) {
  const roleIds = await userModel.getRoleIdsByUserId(authUser.id, client);
  const isSuperAdmin = Boolean(authUser.is_super_admin || roleIds.includes("role_super_admin"));
  const isOrgAdmin = Boolean(isSuperAdmin || roleIds.includes("role_org_admin"));

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
    accessibleOrgIds,
  };
}

function assertOrgAccess(orgId, accessContext) {
  if (accessContext.isSuperAdmin) {
    return;
  }

  assert(accessContext.accessibleOrgIds.includes(orgId), "You do not have permission to perform this action.", 403);
}

async function assertOrganizationExists(orgId, client = db) {
  const organization = await organizationModel.findById(orgId, {}, client);
  assert(organization, "Resource not found.", 404);
  return organization;
}

function toUserResponse(user, roleIds = []) {
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      employeeId: user.employee_id,
      designation: user.designation,
      department: user.department,
      bio: user.bio,
      avatar: user.avatar,
      status: user.status,
      contactInfo: {
        phone: user.contact_phone,
        address: user.contact_address,
      },
      orgId: user.org_id,
      roleIds,
      token: null,
      refreshToken: null,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
  };
}

function toUserProfileResponse(user) {
  const now = Date.now();
  const lastSeen = user.last_seen_at ? new Date(user.last_seen_at).getTime() : 0;
  const presence = now - lastSeen <= 5 * 60 * 1000 ? "online" : "offline";

  return {
    profile: {
      id: user.id,
      username: user.username,
      name: user.name,
      designation: user.designation,
      department: user.department,
      bio: user.bio,
      avatar: user.avatar,
      status: user.status,
      presence,
      orgId: user.org_id,
    },
  };
}

function toMultipleUsersResponse(result, limit, offset) {
  return {
    users: result.users.map((row) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      designation: row.designation,
      department: row.department,
      avatar: row.avatar,
      status: row.status,
    })),
    totalCount: result.totalCount,
    limit,
    offset,
  };
}

function toDirectoryResponse(result, limit, offset) {
  const now = Date.now();

  return {
    directory: result.directory.map((row) => {
      const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
      const presence = now - lastSeen <= 5 * 60 * 1000 ? "online" : "offline";

      return {
        id: row.id,
        name: row.name,
        username: row.username,
        designation: row.designation,
        department: row.department,
        location: row.location,
        avatar: row.avatar,
        presence,
      };
    }),
    totalCount: result.totalCount,
    limit,
    offset,
  };
}

function buildOrgChart(rootOrg, users) {
  const nodeMap = new Map();
  users.forEach((user) => {
    nodeMap.set(user.id, {
      userId: user.id,
      name: user.name,
      designation: user.designation,
      avatar: user.avatar,
      reports: [],
      _managerId: user.manager_id,
    });
  });

  const roots = [];
  nodeMap.forEach((node) => {
    if (node._managerId && nodeMap.has(node._managerId)) {
      nodeMap.get(node._managerId).reports.push(node);
    } else {
      roots.push(node);
    }
  });

  const prune = (node) => ({
    userId: node.userId,
    name: node.name,
    designation: node.designation,
    avatar: node.avatar,
    reports: node.reports.map(prune),
  });

  const head = roots[0] ? prune(roots[0]) : null;

  return {
    orgChart: {
      orgId: rootOrg.id,
      orgName: rootOrg.name,
      head,
    },
  };
}

async function getCurrentUser(authUser) {
  const user = await userModel.findById(authUser.id);
  assert(user, "Resource not found.", 404);

  const roleIds = await userModel.getRoleIdsByUserId(user.id);
  return toUserResponse(user, roleIds);
}

async function updateCurrentUser(authUser, payload) {
  const userPayload = payload.user || {};
  const allowedFields = new Set(["password", "avatar", "bio", "designation", "contactInfo"]);

  const provided = Object.keys(userPayload);
  assert(provided.length > 0, "At least one updatable field is required.", 422);
  assert(provided.every((field) => allowedFields.has(field)), "One or more fields are not allowed for this endpoint.", 422);

  const updates = {};
  if (Object.prototype.hasOwnProperty.call(userPayload, "avatar")) {
    updates.avatar = userPayload.avatar || null;
  }
  if (Object.prototype.hasOwnProperty.call(userPayload, "bio")) {
    updates.bio = userPayload.bio || null;
  }
  if (Object.prototype.hasOwnProperty.call(userPayload, "designation")) {
    updates.designation = userPayload.designation || null;
  }
  if (Object.prototype.hasOwnProperty.call(userPayload, "contactInfo")) {
    const contactInfo = userPayload.contactInfo || {};
    updates.contactPhone = Object.prototype.hasOwnProperty.call(contactInfo, "phone") ? (contactInfo.phone || null) : undefined;
    updates.contactAddress = Object.prototype.hasOwnProperty.call(contactInfo, "address") ? (contactInfo.address || null) : undefined;
  }
  if (Object.prototype.hasOwnProperty.call(userPayload, "password")) {
    updates.passwordHash = await bcrypt.hash(userPayload.password, 12);
  }

  await userModel.updateUser(authUser.id, updates);

  const updated = await userModel.findById(authUser.id);
  const roleIds = await userModel.getRoleIdsByUserId(authUser.id);
  return toUserResponse(updated, roleIds);
}

async function listOrganizationUsers(authUser, orgId, query) {
  const accessContext = await getAccessContext(authUser);
  assertOrgAccess(orgId, accessContext);
  await assertOrganizationExists(orgId);

  const status = query.status || null;
  if (status) {
    assert(USER_STATUSES.has(status), "Invalid query parameter: status.", 400);
  }

  const limit = parseNonNegativeInt(query.limit, 20, "limit");
  const offset = parseNonNegativeInt(query.offset, 0, "offset");

  const result = await userModel.listUsersInOrganization({
    orgId,
    search: query.search || null,
    status,
    department: query.department || null,
    designation: query.designation || null,
    location: query.location || null,
    roleId: query.roleId || null,
    limit,
    offset,
  });

  return toMultipleUsersResponse(result, limit, offset);
}

async function getUserProfile(authUser, userId) {
  const accessContext = await getAccessContext(authUser);
  const user = await userModel.findById(userId);
  assert(user, "Resource not found.", 404);
  assertOrgAccess(user.org_id, accessContext);

  return toUserProfileResponse(user);
}

async function createUserInOrganization(authUser, orgId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);
    assertOrgAccess(orgId, accessContext);

    const organization = await organizationModel.findById(orgId, {}, client);
    assert(organization, "Resource not found.", 404);

    const userPayload = payload.user || {};
    const allowedFields = new Set([
      "username",
      "email",
      "password",
      "name",
      "employeeId",
      "designation",
      "department",
      "roleIds",
      "contactInfo",
      "avatar",
      "bio",
    ]);
    const payloadFields = Object.keys(userPayload);
    assert(payloadFields.every((field) => allowedFields.has(field)), "One or more fields are not allowed for this endpoint.", 422);

    const { username, email, password, name } = userPayload;
    assert(
      isNonEmptyString(username) && isNonEmptyString(email) && isNonEmptyString(password) && isNonEmptyString(name),
      "Required fields: username, email, password, name.",
      422
    );
    assertValidEmail(email);

    const existing = await userModel.findByEmail(email, client);
    assert(!existing, "Email is already in use.", 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await userModel.createUser(
      {
        id: generateId("user"),
        username,
        email,
        passwordHash,
        name,
        employeeId: userPayload.employeeId,
        designation: userPayload.designation,
        department: userPayload.department,
        bio: userPayload.bio,
        avatar: userPayload.avatar,
        status: "active",
        contactPhone: userPayload.contactInfo?.phone,
        contactAddress: userPayload.contactInfo?.address,
        orgId,
        isSuperAdmin: false,
      },
      client
    );

    const roleIds = Array.isArray(userPayload.roleIds) && userPayload.roleIds.length ? userPayload.roleIds : ["role_org_user"];
    await userModel.replaceUserRoles(created.id, roleIds, client);

    await client.query("COMMIT");

    const reloaded = await userModel.findById(created.id);
    const reloadedRoleIds = await userModel.getRoleIdsByUserId(created.id);
    return toUserResponse(reloaded, reloadedRoleIds);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateUserByAdmin(authUser, userId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);

    const targetUser = await userModel.findById(userId, client);
    assert(targetUser, "Resource not found.", 404);
    assertOrgAccess(targetUser.org_id, accessContext);

    const userPayload = payload.user || {};
    const accepted = ["name", "designation", "department", "status", "roleIds", "contactInfo", "avatar", "bio"];
    const provided = Object.keys(userPayload);
    assert(provided.length > 0, "At least one updatable field is required.", 422);
    assert(provided.every((field) => accepted.includes(field)), "One or more fields are not allowed for this endpoint.", 422);

    if (Object.prototype.hasOwnProperty.call(userPayload, "status")) {
      assert(USER_STATUSES.has(userPayload.status), "Invalid user status value.", 422);
      assert(userPayload.status !== targetUser.status, "User already has the requested status.", 422);
    }

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(userPayload, "name")) updates.name = userPayload.name;
    if (Object.prototype.hasOwnProperty.call(userPayload, "designation")) updates.designation = userPayload.designation;
    if (Object.prototype.hasOwnProperty.call(userPayload, "department")) updates.department = userPayload.department;
    if (Object.prototype.hasOwnProperty.call(userPayload, "status")) updates.status = userPayload.status;
    if (Object.prototype.hasOwnProperty.call(userPayload, "avatar")) updates.avatar = userPayload.avatar;
    if (Object.prototype.hasOwnProperty.call(userPayload, "bio")) updates.bio = userPayload.bio;

    if (Object.prototype.hasOwnProperty.call(userPayload, "contactInfo")) {
      updates.contactPhone = Object.prototype.hasOwnProperty.call(userPayload.contactInfo || {}, "phone")
        ? (userPayload.contactInfo.phone || null)
        : undefined;
      updates.contactAddress = Object.prototype.hasOwnProperty.call(userPayload.contactInfo || {}, "address")
        ? (userPayload.contactInfo.address || null)
        : undefined;
    }

    await userModel.updateUser(userId, updates, client);

    if (Array.isArray(userPayload.roleIds)) {
      await userModel.replaceUserRoles(userId, userPayload.roleIds, client);
    }

    await client.query("COMMIT");

    const reloaded = await userModel.findById(userId);
    const roleIds = await userModel.getRoleIdsByUserId(userId);
    return toUserResponse(reloaded, roleIds);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deactivateUser(authUser, userId) {
  const targetUser = await userModel.findById(userId);
  assert(targetUser, "Resource not found.", 404);

  const accessContext = await getAccessContext(authUser);
  assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);
  assertOrgAccess(targetUser.org_id, accessContext);
  assert(targetUser.status !== "deactivated", "User is already deactivated.", 422);

  const response = await updateUserByAdmin(authUser, userId, { user: { status: "deactivated" } });
  return response;
}

async function reactivateUser(authUser, userId) {
  const targetUser = await userModel.findById(userId);
  assert(targetUser, "Resource not found.", 404);

  const accessContext = await getAccessContext(authUser);
  assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);
  assertOrgAccess(targetUser.org_id, accessContext);
  assert(targetUser.status === "deactivated", "Only deactivated users can be reactivated.", 422);

  const response = await updateUserByAdmin(authUser, userId, { user: { status: "active" } });
  return response;
}

async function deleteUser(authUser, userId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);

    const targetUser = await userModel.findById(userId, client);
    assert(targetUser, "Resource not found.", 404);

    await userModel.updateUser(
      userId,
      {
        status: "deactivated",
        deletedAt: new Date(),
      },
      client
    );

    await sessionModel.revokeAllSessionsByUserId(userId, client);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getOrganizationDirectory(authUser, orgId, query) {
  const accessContext = await getAccessContext(authUser);
  assertOrgAccess(orgId, accessContext);
  await assertOrganizationExists(orgId);

  const limit = parseNonNegativeInt(query.limit, 50, "limit");
  const offset = parseNonNegativeInt(query.offset, 0, "offset");

  const result = await userModel.listDirectoryInOrganization({
    orgId,
    search: query.search || null,
    department: query.department || null,
    designation: query.designation || null,
    location: query.location || null,
    skill: query.skill || null,
    limit,
    offset,
  });

  return toDirectoryResponse(result, limit, offset);
}

async function getOrganizationOrgChart(authUser, orgId) {
  const accessContext = await getAccessContext(authUser);
  assertOrgAccess(orgId, accessContext);

  const org = await organizationModel.findById(orgId);
  assert(org, "Resource not found.", 404);

  const users = await userModel.listOrgChartUsers(orgId);
  return buildOrgChart(org, users);
}

async function listActiveSessions(authUser, currentSessionId) {
  const sessions = await sessionModel.listActiveSessionsByUserId(authUser.id);

  return {
    sessions: sessions.map((session) => ({
      id: session.id,
      deviceType: session.device_type || "web",
      browser: session.browser,
      os: session.os,
      ip: session.ip,
      lastActive: session.last_active_at || session.updated_at,
      current: session.id === currentSessionId,
    })),
  };
}

async function revokeSession(authUser, sessionId) {
  const session = await sessionModel.findSessionByIdAndUserId(sessionId, authUser.id);
  assert(session, "Resource not found.", 404);

  await sessionModel.revokeSession(sessionId);
}

async function revokeOtherSessions(authUser, currentSessionId) {
  await sessionModel.revokeAllOtherSessions(authUser.id, currentSessionId);
}

module.exports = {
  getCurrentUser,
  updateCurrentUser,
  listOrganizationUsers,
  getUserProfile,
  createUserInOrganization,
  updateUserByAdmin,
  deactivateUser,
  reactivateUser,
  deleteUser,
  getOrganizationDirectory,
  getOrganizationOrgChart,
  listActiveSessions,
  revokeSession,
  revokeOtherSessions,
};
