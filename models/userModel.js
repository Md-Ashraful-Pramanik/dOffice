const db = require("../config/db");

async function getUserCount(client = db) {
  const result = await client.query("SELECT COUNT(*)::int AS count FROM doffice_users");
  return result.rows[0].count;
}

async function findByEmail(email, client = db) {
  const result = await client.query(
    `SELECT id, username, email, password_hash, name, employee_id, designation, department, bio, avatar,
            status, contact_phone, contact_address, org_id, is_super_admin, created_at, updated_at
    FROM doffice_users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

async function findById(id, client = db) {
  const result = await client.query(
    `SELECT id, username, email, password_hash, name, employee_id, designation, department, bio, avatar,
            status, contact_phone, contact_address, org_id, is_super_admin, created_at, updated_at
    FROM doffice_users
     WHERE id = $1
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
  } = userPayload;

  const result = await client.query(
    `INSERT INTO doffice_users (
      id, username, email, password_hash, name, employee_id, designation, department, bio,
      avatar, status, contact_phone, contact_address, org_id, is_super_admin
    ) VALUES (
      $1, $2, LOWER($3), $4, $5, $6, $7, $8, $9,
      $10, COALESCE($11, 'active'), $12, $13, $14, $15
    )
    RETURNING id, username, email, name, employee_id, designation, department, bio, avatar,
              status, contact_phone, contact_address, org_id, is_super_admin, created_at, updated_at`,
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
    ]
  );

  return result.rows[0];
}

async function assignRole(userId, roleId, client = db) {
  await client.query(
    `INSERT INTO doffice_user_roles (user_id, role_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId]
  );
}

async function getRoleIdsByUserId(userId, client = db) {
  const result = await client.query(
    `SELECT role_id
    FROM doffice_user_roles
     WHERE user_id = $1
     ORDER BY role_id ASC`,
    [userId]
  );
  return result.rows.map((row) => row.role_id);
}

module.exports = {
  getUserCount,
  findByEmail,
  findById,
  createUser,
  assignRole,
  getRoleIdsByUserId,
};
