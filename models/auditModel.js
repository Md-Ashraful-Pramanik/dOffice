const db = require("../config/db");

async function createAudit(payload, client = db) {
  const result = await client.query(
    `INSERT INTO doffice_audits (
      user_id, action, method, endpoint, status_code, metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6::jsonb
    )
    RETURNING id, user_id, action, method, endpoint, status_code, metadata, created_at`,
    [
      payload.userId || null,
      payload.action,
      payload.method,
      payload.endpoint,
      payload.statusCode,
      JSON.stringify(payload.metadata || {}),
    ]
  );

  return result.rows[0];
}

async function listAuditsByUserId(userId, client = db) {
  const result = await client.query(
    `SELECT id, user_id, action, method, endpoint, status_code, metadata, created_at
     FROM doffice_audits
     WHERE user_id = $1
     ORDER BY id DESC`,
    [userId]
  );

  return result.rows;
}

module.exports = {
  createAudit,
  listAuditsByUserId,
};
