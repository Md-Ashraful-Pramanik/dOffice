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

async function listActiveSessionsByUserId(userId, client = db) {
  const result = await client.query(
    `SELECT id, user_id, is_revoked, created_at, updated_at, expires_at,
            device_type, browser, os, ip, last_active_at
     FROM doffice_user_sessions
     WHERE user_id = $1
       AND is_revoked = FALSE
       AND expires_at > NOW()
     ORDER BY last_active_at DESC NULLS LAST, created_at DESC`,
    [userId]
  );

  return result.rows;
}

async function findSessionByIdAndUserId(sessionId, userId, client = db) {
  const result = await client.query(
    `SELECT id, user_id, is_revoked
     FROM doffice_user_sessions
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [sessionId, userId]
  );

  return result.rows[0] || null;
}

async function revokeAllOtherSessions(userId, currentSessionId, client = db) {
  const result = await client.query(
    `UPDATE doffice_user_sessions
     SET is_revoked = TRUE,
         revoked_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1
       AND id <> $2
       AND is_revoked = FALSE`,
    [userId, currentSessionId]
  );

  return result.rowCount;
}

async function revokeAllSessionsByUserId(userId, client = db) {
  const result = await client.query(
    `UPDATE doffice_user_sessions
     SET is_revoked = TRUE,
         revoked_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1
       AND is_revoked = FALSE`,
    [userId]
  );

  return result.rowCount;
}

async function touchSessionActivity(sessionId, client = db) {
  await client.query(
    `UPDATE doffice_user_sessions
     SET last_active_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [sessionId]
  );
}

module.exports = {
  createSession,
  findActiveSessionById,
  revokeSession,
  listActiveSessionsByUserId,
  findSessionByIdAndUserId,
  revokeAllOtherSessions,
  revokeAllSessionsByUserId,
  touchSessionActivity,
};
