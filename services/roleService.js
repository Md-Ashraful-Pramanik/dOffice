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

  const permissions = await roleModel.listRolePermissions([role.id]);
  return serializeRole(role, permissions);
}

async function createRole(authUser, orgId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);

    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const rolePayload = payload.role || {};
    const roleId = generateId("role");

    const inheritsFrom = normalizeOptionalId(rolePayload.inheritsFrom);
    if (inheritsFrom) {
      const inheritedRole = await roleModel.findRoleById(inheritsFrom, orgId, client);
      assert(inheritedRole, "Resource not found.", 404);
    }

    await roleModel.createRole(
      {
        id: roleId,
        name: rolePayload.name.trim(),
        description: rolePayload.description || null,
        type: "custom",
        inheritsFrom,
        orgId,
        createdBy: authUser.id,
      },
      client
    );

    const permissions = dedupePermissions((rolePayload.permissions || []).map(normalizePermission));
    await roleModel.replaceRolePermissions(roleId, permissions, client);

    const role = await roleModel.findRoleById(roleId, orgId, client);
    const rolePermissions = await roleModel.listRolePermissions([roleId], client);

    await client.query("COMMIT");
    return serializeRole(role, rolePermissions);
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

    const updates = payload.role || {};

    if (Object.prototype.hasOwnProperty.call(updates, "name") ||
      Object.prototype.hasOwnProperty.call(updates, "description") ||
      Object.prototype.hasOwnProperty.call(updates, "inheritsFrom")) {
      const inheritsFrom = Object.prototype.hasOwnProperty.call(updates, "inheritsFrom")
        ? normalizeOptionalId(updates.inheritsFrom)
        : undefined;

      if (Object.prototype.hasOwnProperty.call(updates, "inheritsFrom") && inheritsFrom) {
        const inheritedRole = await roleModel.findRoleById(inheritsFrom, orgId, client);
        assert(inheritedRole, "Resource not found.", 404);
      }

      await roleModel.updateRole(
        roleId,
        {
          ...(Object.prototype.hasOwnProperty.call(updates, "name") ? { name: updates.name.trim() } : {}),
          ...(Object.prototype.hasOwnProperty.call(updates, "description") ? { description: updates.description || null } : {}),
          ...(Object.prototype.hasOwnProperty.call(updates, "inheritsFrom") ? { inheritsFrom } : {}),
        },
        client
      );
    }

    if (Object.prototype.hasOwnProperty.call(updates, "permissions")) {
      const permissions = dedupePermissions((updates.permissions || []).map(normalizePermission));
      await roleModel.replaceRolePermissions(roleId, permissions, client);
    }

    const role = await roleModel.findRoleById(roleId, orgId, client);
    const permissions = await roleModel.listRolePermissions([roleId], client);

    await client.query("COMMIT");
    return serializeRole(role, permissions);
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
  const accessContext = await getAccessContext(authUser);
  assert(accessContext.roleIds.length > 0 || accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);

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
    const rolePermissions = await roleModel.listRolePermissions(roleIds, client);

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
