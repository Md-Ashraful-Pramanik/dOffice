const db = require("../config/db");

async function listDelegationsByUser(userId, status = null, client = db) {
  const params = [userId];
  const where = ["d.delegator_user_id = $1", "d.deleted_at IS NULL"];

  if (status === "active") {
    where.push("d.status = 'active'", "d.end_date >= NOW()", "d.revoked_at IS NULL");
  } else if (status === "expired") {
    where.push("(d.status = 'expired' OR d.end_date < NOW())", "d.revoked_at IS NULL");
  } else if (status === "revoked") {
    where.push("(d.status = 'revoked' OR d.revoked_at IS NOT NULL)");
  }

  const result = await client.query(
    `SELECT d.id, d.delegator_user_id, d.delegate_user_id, d.start_date, d.end_date, d.reason,
            d.status, d.scope, d.created_at, d.updated_at, d.revoked_at
     FROM doffice_delegations d
     WHERE ${where.join(" AND ")}
     ORDER BY d.created_at DESC`,
    params
  );

  return result.rows;
}

async function findDelegationById(id, client = db) {
  const result = await client.query(
    `SELECT id, delegator_user_id, delegate_user_id, start_date, end_date, reason,
            status, scope, created_at, updated_at, revoked_at, deleted_at
     FROM doffice_delegations
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

async function createDelegation(payload, client = db) {
  const { id, delegatorUserId, delegateUserId, startDate, endDate, reason, scope } = payload;

  const result = await client.query(
    `INSERT INTO doffice_delegations (
      id, delegator_user_id, delegate_user_id, start_date, end_date, reason, status, scope
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(64),
      $4::timestamptz,
      $5::timestamptz,
      $6::text,
      'active',
      COALESCE($7::jsonb, '{}'::jsonb)
    )
    RETURNING id`,
    [
      id,
      delegatorUserId,
      delegateUserId,
      startDate,
      endDate,
      reason || null,
      JSON.stringify(scope || {}),
    ]
  );

  return result.rows[0] || null;
}

async function revokeDelegation(id, revokedBy, client = db) {
  const result = await client.query(
    `UPDATE doffice_delegations
     SET status = 'revoked',
         revoked_at = NOW(),
         revoked_by = $2::varchar(64),
         updated_at = NOW()
     WHERE id = $1::varchar(64)
       AND deleted_at IS NULL
       AND (status <> 'revoked' AND revoked_at IS NULL)
     RETURNING id`,
    [id, revokedBy || null]
  );

  return result.rows[0] || null;
}

module.exports = {
  listDelegationsByUser,
  findDelegationById,
  createDelegation,
  revokeDelegation,
};
