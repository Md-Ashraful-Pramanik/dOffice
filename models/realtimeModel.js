const db = require("../config/db");

async function findUserPresence(userId, client = db) {
  if (!userId) {
    return null;
  }

  const result = await client.query(
    `SELECT user_id, status, custom_text, last_seen_at, updated_at
     FROM doffice_user_presence
     WHERE user_id = $1::varchar(64)
       AND deleted_at IS NULL
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

async function listUserPresences(userIds = [], client = db) {
  const ids = Array.isArray(userIds) ? [...new Set(userIds.filter(Boolean))] : [];
  if (!ids.length) {
    return [];
  }

  const result = await client.query(
    `SELECT user_id, status, custom_text, last_seen_at, updated_at
     FROM doffice_user_presence
     WHERE user_id = ANY($1::varchar(64)[])
       AND deleted_at IS NULL`,
    [ids]
  );

  return result.rows;
}

async function upsertUserPresence(payload, client = db) {
  const { userId, status, customText, lastSeenAt } = payload;

  const result = await client.query(
    `INSERT INTO doffice_user_presence (
      user_id, status, custom_text, last_seen_at
    ) VALUES (
      $1::varchar(64),
      $2::varchar(16),
      $3::text,
      COALESCE($4::timestamptz, NOW())
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      custom_text = EXCLUDED.custom_text,
      last_seen_at = EXCLUDED.last_seen_at,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING user_id, status, custom_text, last_seen_at, updated_at`,
    [userId, status, customText || null, lastSeenAt || null]
  );

  return result.rows[0] || null;
}

async function upsertTypingState(payload, client = db) {
  const { userId, targetType, targetId, isTyping } = payload;

  const result = await client.query(
    `INSERT INTO doffice_typing_states (
      user_id, target_type, target_id, is_typing, expires_at
    ) VALUES (
      $1::varchar(64),
      $2::varchar(24),
      $3::varchar(64),
      $4::boolean,
      CASE WHEN $4::boolean THEN NOW() + INTERVAL '15 seconds' ELSE NULL END
    )
    ON CONFLICT (user_id, target_type, target_id)
    DO UPDATE SET
      is_typing = EXCLUDED.is_typing,
      expires_at = EXCLUDED.expires_at,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING user_id, target_type, target_id, is_typing, updated_at`,
    [userId, targetType, targetId, Boolean(isTyping)]
  );

  return result.rows[0] || null;
}

async function upsertReadMarker(payload, client = db) {
  const { userId, targetType, targetId, lastReadMessageId } = payload;

  const result = await client.query(
    `INSERT INTO doffice_message_reads (
      user_id, target_type, target_id, last_read_message_id, read_at
    ) VALUES (
      $1::varchar(64),
      $2::varchar(24),
      $3::varchar(64),
      $4::varchar(64),
      NOW()
    )
    ON CONFLICT (user_id, target_type, target_id)
    DO UPDATE SET
      last_read_message_id = EXCLUDED.last_read_message_id,
      read_at = NOW(),
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING user_id, target_type, target_id, last_read_message_id, read_at`,
    [userId, targetType, targetId, lastReadMessageId]
  );

  return result.rows[0] || null;
}

async function upsertVoiceParticipation(payload, client = db) {
  const { id, channelId, userId } = payload;

  await client.query(
    `UPDATE doffice_voice_channel_participants
     SET left_at = NOW(),
         deleted_at = NOW(),
         updated_at = NOW()
     WHERE channel_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
       AND left_at IS NULL`,
    [channelId, userId]
  );

  const result = await client.query(
    `INSERT INTO doffice_voice_channel_participants (
      id, channel_id, user_id
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(64)
    )
    RETURNING id, channel_id, user_id, joined_at`,
    [id, channelId, userId]
  );

  return result.rows[0] || null;
}

async function leaveVoiceParticipation(payload, client = db) {
  const { channelId, userId } = payload;

  const result = await client.query(
    `UPDATE doffice_voice_channel_participants
     SET left_at = NOW(),
         deleted_at = NOW(),
         updated_at = NOW()
     WHERE channel_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
       AND left_at IS NULL
     RETURNING id, channel_id, user_id, left_at`,
    [channelId, userId]
  );

  return result.rows[0] || null;
}

async function createRtcSignal(payload, client = db) {
  const {
    id,
    callId,
    fromUserId,
    targetUserId,
    signalType,
    signalPayload,
  } = payload;

  const result = await client.query(
    `INSERT INTO doffice_rtc_signals (
      id, call_id, from_user_id, target_user_id, signal_type, payload
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(64),
      $4::varchar(64),
      $5::varchar(24),
      COALESCE($6::jsonb, '{}'::jsonb)
    )
    RETURNING id, call_id, from_user_id, target_user_id, signal_type, payload, created_at`,
    [id, callId, fromUserId, targetUserId, signalType, JSON.stringify(signalPayload || {})]
  );

  return result.rows[0] || null;
}

async function listOrgUserIds(orgId, client = db) {
  if (!orgId) {
    return [];
  }

  const result = await client.query(
    `SELECT id
     FROM doffice_users
     WHERE org_id = $1::varchar(64)
       AND deleted_at IS NULL`,
    [orgId]
  );

  return result.rows.map((row) => row.id);
}

module.exports = {
  findUserPresence,
  listUserPresences,
  upsertUserPresence,
  upsertTypingState,
  upsertReadMarker,
  upsertVoiceParticipation,
  leaveVoiceParticipation,
  createRtcSignal,
  listOrgUserIds,
};
