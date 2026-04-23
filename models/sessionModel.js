const db = require("../config/db");

async function createSession(session, client = db) {
  const result = await client.query(
    `INSERT INTO doffice_user_sessions (
      id, user_id, access_token_hash, refresh_token_hash, is_revoked, expires_at
    ) VALUES (
      $1, $2, $3, $4, FALSE, $5
    ) RETURNING id, user_id, is_revoked, created_at, updated_at, expires_at`,
    [session.id, session.userId, session.accessTokenHash, session.refreshTokenHash, session.expiresAt]
  );

  return result.rows[0];
}

async function findActiveSessionById(sessionId, client = db) {
  const result = await client.query(
    `SELECT id, user_id, access_token_hash, refresh_token_hash, is_revoked, expires_at
    FROM doffice_user_sessions
     WHERE id = $1
       AND is_revoked = FALSE
       AND expires_at > NOW()
     LIMIT 1`,
    [sessionId]
  );

  return result.rows[0] || null;
}

async function revokeSession(sessionId, client = db) {
  const result = await client.query(
    `UPDATE doffice_user_sessions
     SET is_revoked = TRUE,
         revoked_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND is_revoked = FALSE
     RETURNING id`,
    [sessionId]
  );

  return result.rowCount > 0;
}

module.exports = {
  createSession,
  findActiveSessionById,
  revokeSession,
};
