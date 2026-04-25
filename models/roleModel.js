const db = require("../config/db");

async function listRoles(orgId, filters = {}, client = db) {
  const { search = null, type = null } = filters;
  const params = [orgId];
  const where = ["r.deleted_at IS NULL", "(r.org_id = $1 OR r.org_id IS NULL)"];

  if (search) {
    params.push(`%${search}%`);
    where.push(`r.name ILIKE $${params.length}`);
  }

  if (type) {
    params.push(type);
    where.push(`r.type = $${params.length}`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const countResult = await client.query(
    `SELECT COUNT(*)::int AS total_count
     FROM doffice_roles r
     ${whereSql}`,
    params
  );

  const dataResult = await client.query(
    `SELECT r.id, r.name, r.type, r.org_id
     FROM doffice_roles r
     ${whereSql}
     ORDER BY r.type ASC, r.name ASC`,
    params
  );

  return {
    roles: dataResult.rows,
    totalCount: countResult.rows[0].total_count,
  };
}

async function findRoleById(roleId, orgId = null, client = db) {
  const params = [roleId];
  const where = ["r.id = $1", "r.deleted_at IS NULL"];

  if (orgId) {
    params.push(orgId);
    where.push(`(r.org_id = $${params.length} OR r.org_id IS NULL)`);
  }

  const result = await client.query(
    `SELECT r.id, r.name, r.description, r.type, r.inherits_from, r.org_id, r.is_system,
            r.created_at, r.updated_at
     FROM doffice_roles r
     WHERE ${where.join(" AND ")}
     LIMIT 1`,
    params
  );

  return result.rows[0] || null;
}

async function createRole(payload, client = db) {
  const { id, name, description, type, inheritsFrom, orgId, createdBy } = payload;

  const result = await client.query(
    `INSERT INTO doffice_roles (
      id, name, description, type, inherits_from, org_id, is_system, created_by
    ) VALUES (
      $1, $2, $3, COALESCE($4, 'custom'), $5, $6, FALSE, $7
    )
    RETURNING id`,
    [id, name, description || null, type || "custom", inheritsFrom || null, orgId || null, createdBy || null]
  );

  return result.rows[0] || null;
}

async function updateRole(roleId, updates = {}, client = db) {
  const fields = [];
  const params = [];

  const setField = (column, value) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    setField("name", updates.name);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "description")) {
    setField("description", updates.description);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "inheritsFrom")) {
    setField("inherits_from", updates.inheritsFrom);
  }

  if (!fields.length) {
    return null;
  }

  fields.push("updated_at = NOW()");
  params.push(roleId);

  const result = await client.query(
    `UPDATE doffice_roles
     SET ${fields.join(", ")}
     WHERE id = $${params.length}
       AND deleted_at IS NULL
     RETURNING id`,
    params
  );

  return result.rows[0] || null;
}

async function softDeleteRole(roleId, client = db) {
  const result = await client.query(
    `UPDATE doffice_roles
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND deleted_at IS NULL
     RETURNING id`,
    [roleId]
  );

  return result.rows[0] || null;
}

async function listRolePermissions(roleIds = [], client = db) {
  if (!roleIds.length) {
    return [];
  }

  const result = await client.query(
    `SELECT role_id, module, action, allow
     FROM doffice_role_permissions
     WHERE role_id = ANY($1::varchar[])
       AND deleted_at IS NULL
     ORDER BY role_id ASC, module ASC, action ASC`,
    [roleIds]
  );

  return result.rows;
}

async function listEffectiveRolePermissions(roleIds = [], orgId = null, client = db) {
  if (!roleIds.length) {
    return [];
  }

  const result = await client.query(
    `WITH RECURSIVE role_tree AS (
      SELECT r.id,
             r.inherits_from,
             r.id AS root_role_id,
             0 AS depth
      FROM doffice_roles r
      WHERE r.id = ANY($1::varchar[])
        AND r.deleted_at IS NULL
        AND ($2::varchar IS NULL OR r.org_id = $2 OR r.org_id IS NULL)

      UNION ALL

      SELECT parent.id,
             parent.inherits_from,
             role_tree.root_role_id,
             role_tree.depth + 1 AS depth
      FROM doffice_roles parent
      INNER JOIN role_tree ON parent.id = role_tree.inherits_from
      WHERE parent.deleted_at IS NULL
        AND role_tree.depth < 20
    )
    SELECT DISTINCT ON (role_tree.root_role_id, rp.module, rp.action)
      role_tree.root_role_id AS role_id,
      rp.module,
      rp.action,
      rp.allow,
      role_tree.depth
    FROM role_tree
    INNER JOIN doffice_role_permissions rp ON rp.role_id = role_tree.id
    WHERE rp.deleted_at IS NULL
    ORDER BY role_tree.root_role_id ASC, rp.module ASC, rp.action ASC, role_tree.depth ASC`,
    [roleIds, orgId]
  );

  return result.rows;
}

async function replaceRolePermissions(roleId, permissions, client = db) {
  await client.query(
    `UPDATE doffice_role_permissions
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE role_id = $1
       AND deleted_at IS NULL`,
    [roleId]
  );

  if (!permissions.length) {
    return;
  }

  const values = [];
  const params = [];

  permissions.forEach((permission, index) => {
    const base = index * 3;
    values.push(`($1, $${base + 2}, $${base + 3}, $${base + 4})`);
    params.push(permission.module, permission.action, permission.allow);
  });

  await client.query(
    `INSERT INTO doffice_role_permissions (role_id, module, action, allow)
     VALUES ${values.join(", ")}`,
    [roleId, ...params]
  );
}

async function listUserRoleAssignments(userId, orgId = null, client = db) {
  const params = [userId];
  const where = ["ur.user_id = $1", "ur.deleted_at IS NULL", "r.deleted_at IS NULL"];

  if (orgId) {
    params.push(orgId);
    where.push(`(ur.org_id = $${params.length} OR ur.org_id IS NULL)`);
  }

  const result = await client.query(
    `SELECT ur.user_id, ur.role_id, ur.org_id, r.name, r.type, r.inherits_from, r.description,
            r.org_id AS role_org_id, r.created_at, r.updated_at
     FROM doffice_user_roles ur
     INNER JOIN doffice_roles r ON r.id = ur.role_id
     WHERE ${where.join(" AND ")}
     ORDER BY r.name ASC`,
    params
  );

  return result.rows;
}

async function assignRoleToUser(userId, roleId, orgId, assignedBy, client = db) {
  await client.query(
    `UPDATE doffice_user_roles
     SET deleted_at = NULL,
         org_id = $3,
         assigned_by = $4,
         created_at = NOW()
     WHERE user_id = $1
       AND role_id = $2
       AND COALESCE(org_id, '__global__') = COALESCE($3, '__global__')`,
    [userId, roleId, orgId || null, assignedBy || null]
  );

  await client.query(
    `INSERT INTO doffice_user_roles (user_id, role_id, org_id, assigned_by)
     SELECT $1, $2, $3, $4
     WHERE NOT EXISTS (
      SELECT 1
      FROM doffice_user_roles
      WHERE user_id = $1
        AND role_id = $2
        AND COALESCE(org_id, '__global__') = COALESCE($3, '__global__')
        AND deleted_at IS NULL
     )`,
    [userId, roleId, orgId || null, assignedBy || null]
  );
}

async function softRemoveRoleFromUser(userId, roleId, orgId = null, client = db) {
  const result = await client.query(
    `UPDATE doffice_user_roles
     SET deleted_at = NOW()
     WHERE user_id = $1
       AND role_id = $2
       AND COALESCE(org_id, '__global__') = COALESCE($3, '__global__')
       AND deleted_at IS NULL
     RETURNING user_id`,
    [userId, roleId, orgId || null]
  );

  return result.rows[0] || null;
}

module.exports = {
  listRoles,
  findRoleById,
  createRole,
  updateRole,
  softDeleteRole,
  listRolePermissions,
  listEffectiveRolePermissions,
  replaceRolePermissions,
  listUserRoleAssignments,
  assignRoleToUser,
  softRemoveRoleFromUser,
};
