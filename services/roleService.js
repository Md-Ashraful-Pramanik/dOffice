const db = require("../config/db");
const roleModel = require("../models/roleModel");
const teamModel = require("../models/teamModel");
const { generateId } = require("../utils/id");
const {
  assert,
  getAccessContext,
  assertOrgAccess,
  assertOrganizationExists,
  assertUserExists,
} = require("./accessService");

const PERMISSION_CATALOG = {
  organizations: ["create", "read", "update", "delete", "archive", "move", "merge", "clone"],
  users: ["create", "read", "update", "delete", "deactivate", "assign_role"],
  messaging: ["create_channel", "delete_channel", "send_message", "delete_message", "pin_message", "moderate"],
  tasks: ["create_project", "delete_project", "create_task", "assign_task", "delete_task", "manage_sprint"],
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredString(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : "";
  assert(normalized, `${fieldName} is required.`, 422);
  return normalized;
}

function normalizeNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value).trim() || null;
}

function normalizePermission(permission) {
  return {
    module: String(permission.module || "").trim().toLowerCase(),
    action: String(permission.action || "").trim().toLowerCase(),
    allow: Boolean(permission.allow),
  };
}

function dedupePermissions(permissions = []) {
  const map = new Map();
  permissions.forEach((permission) => {
    const key = `${permission.module}:${permission.action}`;
    map.set(key, permission);
  });
  return Array.from(map.values());
}

function normalizeOptionalId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function validatePermissionEntries(permissions, message, requireAtLeastOne = false) {
  assert(Array.isArray(permissions), message, 422);
  if (requireAtLeastOne) {
    assert(permissions.length > 0, message, 422);
  }

  permissions.forEach((permission) => {
    assert(isPlainObject(permission), message, 422);
    const normalized = normalizePermission(permission);
    assert(normalized.module, message, 422);
    assert(normalized.action, message, 422);
    assert(typeof permission.allow === "boolean", message, 422);
  });
}

async function assertValidInheritance(orgId, roleId, inheritsFrom, client) {
  if (!inheritsFrom) {
    return;
  }

  assert(inheritsFrom !== roleId, "A role cannot inherit from itself.", 422);

  const visited = new Set([roleId]);
  let currentRoleId = inheritsFrom;

  while (currentRoleId) {
    assert(!visited.has(currentRoleId), "Role inheritance cycle detected.", 422);
    visited.add(currentRoleId);

    const inheritedRole = await roleModel.findRoleById(currentRoleId, orgId, client);
    assert(inheritedRole, "Resource not found.", 404);

    currentRoleId = inheritedRole.inherits_from || null;
  }
}

async function getSerializedRole(role, client = db) {
  const permissions = await roleModel.listEffectiveRolePermissions([role.id], role.org_id, client);
  return serializeRole(role, permissions);
}

function serializeRole(role, permissions) {
  return {
    role: {
      id: role.id,
      name: role.name,
      description: role.description,
      type: role.type,
      inheritsFrom: role.inherits_from,
      orgId: role.org_id,
      permissions: permissions.map((permission) => ({
        module: permission.module,
        action: permission.action,
        allow: permission.allow,
      })),
      createdAt: role.created_at,
      updatedAt: role.updated_at,
    },
  };
}

function serializeUser(user, roleIds) {
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

async function listRoles(authUser, orgId, query) {
  const accessContext = await getAccessContext(authUser);
  await assertOrganizationExists(orgId);
  assertOrgAccess(orgId, accessContext);

  const result = await roleModel.listRoles(orgId, {
    search: query.search || null,
    type: query.type || null,
  });

  return {
    roles: result.roles.map((role) => ({
      id: role.id,
      name: role.name,
      type: role.type,
      orgId: role.org_id,
    })),
    totalCount: result.totalCount,
  };
}

async function getRole(authUser, orgId, roleId) {
  const accessContext = await getAccessContext(authUser);
  await assertOrganizationExists(orgId);
  assertOrgAccess(orgId, accessContext);

  const role = await roleModel.findRoleById(roleId, orgId);
  assert(role, "Resource not found.", 404);

  return getSerializedRole(role);
}

async function createRole(authUser, orgId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);

    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const rolePayload = isPlainObject(payload?.role) ? payload.role : {};
    validatePermissionEntries(rolePayload.permissions, "permissions must be a non-empty list of permissions", true);

    const roleId = generateId("role");
    const name = normalizeRequiredString(rolePayload.name, "name");

    const inheritsFrom = normalizeOptionalId(rolePayload.inheritsFrom);
    await assertValidInheritance(orgId, roleId, inheritsFrom, client);

    await roleModel.createRole(
      {
        id: roleId,
        name,
        description: normalizeNullableString(rolePayload.description),
        type: "custom",
        inheritsFrom,
        orgId,
        createdBy: authUser.id,
      },
      client
    );

    const permissions = dedupePermissions(rolePayload.permissions.map(normalizePermission));
    await roleModel.replaceRolePermissions(roleId, permissions, client);

    const role = await roleModel.findRoleById(roleId, orgId, client);

    await client.query("COMMIT");
    return getSerializedRole(role);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateRole(authUser, orgId, roleId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);
    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const existing = await roleModel.findRoleById(roleId, orgId, client);
    assert(existing, "Resource not found.", 404);

    const updates = isPlainObject(payload?.role) ? payload.role : {};
    assert(Object.keys(updates).length > 0, "At least one updatable field is required.", 422);

    if (Object.prototype.hasOwnProperty.call(updates, "name") ||
      Object.prototype.hasOwnProperty.call(updates, "description") ||
      Object.prototype.hasOwnProperty.call(updates, "inheritsFrom")) {
      const inheritsFrom = Object.prototype.hasOwnProperty.call(updates, "inheritsFrom")
        ? normalizeOptionalId(updates.inheritsFrom)
        : undefined;

      if (Object.prototype.hasOwnProperty.call(updates, "inheritsFrom")) {
        await assertValidInheritance(orgId, roleId, inheritsFrom, client);
      }

      await roleModel.updateRole(
        roleId,
        {
          ...(Object.prototype.hasOwnProperty.call(updates, "name")
            ? { name: normalizeRequiredString(updates.name, "name") }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(updates, "description")
            ? { description: normalizeNullableString(updates.description) }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(updates, "inheritsFrom") ? { inheritsFrom } : {}),
        },
        client
      );
    }

    if (Object.prototype.hasOwnProperty.call(updates, "permissions")) {
      validatePermissionEntries(updates.permissions, "permissions must be a list of permissions");
      const permissions = dedupePermissions((updates.permissions || []).map(normalizePermission));
      await roleModel.replaceRolePermissions(roleId, permissions, client);
    }

    const role = await roleModel.findRoleById(roleId, orgId, client);

    await client.query("COMMIT");
    return getSerializedRole(role);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteRole(authUser, orgId, roleId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);

    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const role = await roleModel.findRoleById(roleId, orgId, client);
    assert(role, "Resource not found.", 404);
    assert(!role.is_system, "Cannot delete system roles.", 422);

    await roleModel.softDeleteRole(roleId, client);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function assignRoleToUser(authUser, userId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);

    const { roleId, orgId } = payload;
    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const user = await assertUserExists(userId, client);
    assert(user.org_id === orgId, "User is not part of this organization.", 422);
    const role = await roleModel.findRoleById(roleId, orgId, client);
    assert(role, "Resource not found.", 404);

    await roleModel.assignRoleToUser(user.id, role.id, orgId, authUser.id, client);

    const assignments = await roleModel.listUserRoleAssignments(user.id, orgId, client);
    const roleIds = assignments.map((item) => item.role_id);

    await client.query("COMMIT");
    return serializeUser(user, roleIds);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function removeRoleFromUser(authUser, userId, roleId, orgId = null) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);

    const user = await assertUserExists(userId, client);
    const scopeOrgId = orgId || user.org_id;
    if (scopeOrgId) {
      await assertOrganizationExists(scopeOrgId, client);
      assertOrgAccess(scopeOrgId, accessContext);
    } else {
      assert(accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);
    }

    const role = await roleModel.findRoleById(roleId, scopeOrgId, client);
    assert(role, "Resource not found.", 404);

    const removed = await roleModel.softRemoveRoleFromUser(user.id, role.id, scopeOrgId, client);
    assert(removed, "Resource not found.", 404);

    const assignments = await roleModel.listUserRoleAssignments(user.id, scopeOrgId, client);
    const roleIds = assignments.map((item) => item.role_id);

    await client.query("COMMIT");
    return serializeUser(user, roleIds);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listAllPermissions(authUser) {
  await getAccessContext(authUser);

  return {
    permissions: PERMISSION_CATALOG,
  };
}

async function getEffectivePermissions(authUser, userId, orgId) {
  const client = await db.pool.connect();

  try {
    const accessContext = await getAccessContext(authUser, client);
    const targetUser = await assertUserExists(userId, client);
    const targetOrgId = orgId || targetUser.org_id;

    assert(targetOrgId, "orgId is required.", 422);
    await assertOrganizationExists(targetOrgId, client);

    const isSelf = authUser.id === userId;
    assert(isSelf || accessContext.isOrgAdmin || accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);
    assertOrgAccess(targetOrgId, accessContext);

    const assignments = await roleModel.listUserRoleAssignments(userId, targetOrgId, client);
    const roleIds = assignments.map((item) => item.role_id);
    const rolePermissions = await roleModel.listEffectiveRolePermissions(roleIds, targetOrgId, client);

    const teamOverrides = await teamModel.listUserTeamOverrides(userId, targetOrgId, client);

    const computedMap = new Map();

    roleIds.forEach((roleId) => {
      rolePermissions
        .filter((permission) => permission.role_id === roleId)
        .forEach((permission) => {
          computedMap.set(`${permission.module}:${permission.action}`, {
            module: permission.module,
            action: permission.action,
            allow: permission.allow,
            source: `role:${roleId}`,
          });
        });
    });

    teamOverrides.forEach((override) => {
      computedMap.set(`${override.module}:${override.action}`, {
        module: override.module,
        action: override.action,
        allow: override.allow,
        source: `team:${override.team_id}`,
      });
    });

    const computed = Array.from(computedMap.values()).sort((left, right) => {
      const leftKey = `${left.module}:${left.action}`;
      const rightKey = `${right.module}:${right.action}`;
      return leftKey.localeCompare(rightKey);
    });

    return {
      effectivePermissions: {
        userId,
        orgId: targetOrgId,
        computed,
      },
    };
  } finally {
    client.release();
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
