const db = require("../config/db");

const USER_BASE_SELECT = `
  SELECT id, username, email, password_hash, name, employee_id, designation, department, bio, avatar,
         status, contact_phone, contact_address, org_id, is_super_admin, manager_id, location, skills,
         last_seen_at, deleted_at, created_at, updated_at
  FROM doffice_users
`;

async function getUserCount(client = db) {
  const result = await client.query(
    "SELECT COUNT(*)::int AS count FROM doffice_users WHERE deleted_at IS NULL"
  );
  return result.rows[0].count;
}

async function getUserTotalCount(client = db) {
  const result = await client.query("SELECT COUNT(*)::int AS count FROM doffice_users");
  return result.rows[0].count;
}

async function findByEmail(email, client = db) {
  const result = await client.query(
    `${USER_BASE_SELECT}
     WHERE LOWER(email) = LOWER($1)
       AND deleted_at IS NULL
     LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

async function findById(id, client = db, options = {}) {
  const { includeDeleted = false } = options;
  const whereDeleted = includeDeleted ? "" : "AND deleted_at IS NULL";

  const result = await client.query(
    `${USER_BASE_SELECT}
     WHERE id = $1
       ${whereDeleted}
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createUser(userPayload, client = db) {
  const {
    id,
    username,
    email,
    passwordHash,
    name,
    employeeId,
    designation,
    department,
    bio,
    avatar,
    status,
    contactPhone,
    contactAddress,
    orgId,
    isSuperAdmin,
    managerId,
    location,
    skills,
  } = userPayload;

  const result = await client.query(
    `INSERT INTO doffice_users (
      id, username, email, password_hash, name, employee_id, designation, department, bio,
      avatar, status, contact_phone, contact_address, org_id, is_super_admin, manager_id, location, skills
    ) VALUES (
      $1, $2, LOWER($3), $4, $5, $6, $7, $8, $9,
      $10, COALESCE($11, 'active'), $12, $13, $14, $15, $16, $17, COALESCE($18::text[], ARRAY[]::text[])
    )
    RETURNING id, username, email, name, employee_id, designation, department, bio, avatar,
              status, contact_phone, contact_address, org_id, is_super_admin, manager_id, location,
              skills, last_seen_at, created_at, updated_at`,
    [
      id,
      username,
      email,
      passwordHash,
      name || null,
      employeeId || null,
      designation || null,
      department || null,
      bio || null,
      avatar || null,
      status || "active",
      contactPhone || null,
      contactAddress || null,
      orgId || null,
      Boolean(isSuperAdmin),
      managerId || null,
      location || null,
      Array.isArray(skills) ? skills : [],
    ]
  );

  return result.rows[0];
}

async function assignRole(userId, roleId, client = db) {
  await client.query(
    `UPDATE doffice_user_roles
     SET deleted_at = NULL,
         created_at = NOW()
     WHERE user_id = $1
       AND role_id = $2
       AND COALESCE(org_id, '__global__') = '__global__'`,
    [userId, roleId]
  );

  await client.query(
    `INSERT INTO doffice_user_roles (user_id, role_id, org_id)
     SELECT $1, $2, NULL
     WHERE NOT EXISTS (
       SELECT 1
       FROM doffice_user_roles
       WHERE user_id = $1
         AND role_id = $2
         AND COALESCE(org_id, '__global__') = '__global__'
         AND deleted_at IS NULL
     )`,
    [userId, roleId]
  );
}

async function replaceUserRoles(userId, roleIds = [], client = db) {
  await client.query(
    `UPDATE doffice_user_roles
     SET deleted_at = NOW()
     WHERE user_id = $1
       AND deleted_at IS NULL`,
    [userId]
  );

  for (const roleId of roleIds) {
    await assignRole(userId, roleId, client);
  }
}

async function getRoleIdsByUserId(userId, client = db) {
  const result = await client.query(
    `SELECT role_id
     FROM doffice_user_roles ur
     INNER JOIN doffice_roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
       AND ur.deleted_at IS NULL
       AND r.deleted_at IS NULL
     ORDER BY role_id ASC`,
    [userId]
  );
  return result.rows.map((row) => row.role_id);
}

async function updateUser(userId, updates = {}, client = db) {
  const fields = [];
  const params = [];

  const setField = (column, value) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };

  if (Object.prototype.hasOwnProperty.call(updates, "passwordHash")) {
    setField("password_hash", updates.passwordHash);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    setField("name", updates.name);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "designation")) {
    setField("designation", updates.designation);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "department")) {
    setField("department", updates.department);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "status")) {
    setField("status", updates.status);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "bio")) {
    setField("bio", updates.bio);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "avatar")) {
    setField("avatar", updates.avatar);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "contactPhone")) {
    setField("contact_phone", updates.contactPhone);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "contactAddress")) {
    setField("contact_address", updates.contactAddress);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "location")) {
    setField("location", updates.location);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "managerId")) {
    setField("manager_id", updates.managerId);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "skills")) {
    params.push(Array.isArray(updates.skills) ? updates.skills : []);
    fields.push(`skills = $${params.length}::text[]`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "deletedAt")) {
    setField("deleted_at", updates.deletedAt);
  }

  if (!fields.length) {
    return null;
  }

  fields.push("updated_at = NOW()");
  params.push(userId);

  const result = await client.query(
    `UPDATE doffice_users
     SET ${fields.join(", ")}
     WHERE id = $${params.length}
     RETURNING id`,
    params
  );

  return result.rows[0] || null;
}

async function listUsersInOrganization(filters = {}, client = db) {
  const {
    orgId,
    search = null,
    status = null,
    department = null,
    designation = null,
    location = null,
    roleId = null,
    limit = 20,
    offset = 0,
  } = filters;

  const params = [orgId];
  const whereClauses = ["u.org_id = $1", "u.deleted_at IS NULL"];

  if (search) {
    params.push(`%${search}%`);
    whereClauses.push(`(
      u.name ILIKE $${params.length}
      OR u.username ILIKE $${params.length}
      OR u.email ILIKE $${params.length}
      OR COALESCE(u.employee_id, '') ILIKE $${params.length}
    )`);
  }

  if (status) {
    params.push(status);
    whereClauses.push(`u.status = $${params.length}`);
  }

  if (department) {
    params.push(department);
    whereClauses.push(`u.department ILIKE $${params.length}`);
  }

  if (designation) {
    params.push(designation);
    whereClauses.push(`u.designation ILIKE $${params.length}`);
  }

  if (location) {
    params.push(location);
    whereClauses.push(`u.location ILIKE $${params.length}`);
  }

  if (roleId) {
    params.push(roleId);
    whereClauses.push(`EXISTS (
      SELECT 1 FROM doffice_user_roles ur
      WHERE ur.user_id = u.id AND ur.role_id = $${params.length}
    )`);
  }

  const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

  const totalResult = await client.query(
    `SELECT COUNT(*)::int AS total_count
     FROM doffice_users u
     ${whereSql}`,
    params
  );

  const dataParams = [...params, limit, offset];
  const rowsResult = await client.query(
    `SELECT u.id, u.username, u.name, u.designation, u.department, u.avatar, u.status
     FROM doffice_users u
     ${whereSql}
     ORDER BY u.created_at DESC
     LIMIT $${dataParams.length - 1}
     OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    users: rowsResult.rows,
    totalCount: totalResult.rows[0].total_count,
  };
}

async function listDirectoryInOrganization(filters = {}, client = db) {
  const {
    orgId,
    search = null,
    department = null,
    designation = null,
    location = null,
    skill = null,
    limit = 50,
    offset = 0,
  } = filters;

  const params = [orgId];
  const whereClauses = [
    "u.org_id = $1",
    "u.deleted_at IS NULL",
    "u.status IN ('active', 'on-leave', 'suspended')",
  ];

  if (search) {
    params.push(`%${search}%`);
    whereClauses.push(`(
      u.name ILIKE $${params.length}
      OR COALESCE(u.designation, '') ILIKE $${params.length}
      OR COALESCE(u.department, '') ILIKE $${params.length}
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(u.skills, ARRAY[]::text[])) AS s
        WHERE s ILIKE $${params.length}
      )
    )`);
  }

  if (department) {
    params.push(department);
    whereClauses.push(`u.department ILIKE $${params.length}`);
  }

  if (designation) {
    params.push(designation);
    whereClauses.push(`u.designation ILIKE $${params.length}`);
  }

  if (location) {
    params.push(location);
    whereClauses.push(`u.location ILIKE $${params.length}`);
  }

  if (skill) {
    params.push(skill);
    whereClauses.push(`EXISTS (
      SELECT 1
      FROM unnest(COALESCE(u.skills, ARRAY[]::text[])) AS s
      WHERE s ILIKE $${params.length}
    )`);
  }

  const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

  const totalResult = await client.query(
    `SELECT COUNT(*)::int AS total_count
     FROM doffice_users u
     ${whereSql}`,
    params
  );

  const dataParams = [...params, limit, offset];
  const rowsResult = await client.query(
    `SELECT u.id, u.name, u.username, u.designation, u.department, u.location, u.avatar, u.last_seen_at
     FROM doffice_users u
     ${whereSql}
     ORDER BY u.name ASC NULLS LAST, u.username ASC
     LIMIT $${dataParams.length - 1}
     OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    directory: rowsResult.rows,
    totalCount: totalResult.rows[0].total_count,
  };
}

async function listOrgChartUsers(orgId, client = db) {
  const result = await client.query(
    `SELECT id, name, designation, avatar, manager_id
     FROM doffice_users
     WHERE org_id = $1
       AND deleted_at IS NULL
       AND status IN ('active', 'on-leave', 'suspended')
     ORDER BY created_at ASC`,
    [orgId]
  );

  return result.rows;
}

async function touchUserLastSeen(userId, client = db) {
  await client.query(
    `UPDATE doffice_users
     SET last_seen_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND deleted_at IS NULL`,
    [userId]
  );
}

module.exports = {
  getUserCount,
  getUserTotalCount,
  findByEmail,
  findById,
  createUser,
  assignRole,
  replaceUserRoles,
  getRoleIdsByUserId,
  updateUser,
  listUsersInOrganization,
  listDirectoryInOrganization,
  listOrgChartUsers,
  touchUserLastSeen,
};
