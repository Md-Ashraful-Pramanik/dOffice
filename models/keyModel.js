const db = require("../config/db");

async function upsertDevice(payload, client = db) {
  const {
    id,
    userId,
    name,
    sessionId,
    identityKeyFingerprint,
    lastSeenAt,
  } = payload;

  const result = await client.query(
    `INSERT INTO doffice_user_devices (
      id, user_id, name, session_id, identity_key_fingerprint, last_seen_at
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(255),
      $4::varchar(64),
      $5::varchar(255),
      COALESCE($6::timestamptz, NOW())
    )
    ON CONFLICT (id)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      name = EXCLUDED.name,
      session_id = EXCLUDED.session_id,
      identity_key_fingerprint = EXCLUDED.identity_key_fingerprint,
      last_seen_at = COALESCE(EXCLUDED.last_seen_at, NOW()),
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING id, user_id, name, session_id, identity_key_fingerprint, last_seen_at, created_at, updated_at`,
    [id, userId, name || null, sessionId || null, identityKeyFingerprint || null, lastSeenAt || null]
  );

  return result.rows[0] || null;
}

async function upsertPreKeyBundle(payload, client = db) {
  const {
    userId,
    deviceId,
    identityKey,
    signedPreKey,
  } = payload;

  const result = await client.query(
    `INSERT INTO doffice_user_prekeys (
      user_id, device_id, identity_key, signed_pre_key
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::text,
      $4::jsonb
    )
    ON CONFLICT (user_id, device_id)
    DO UPDATE SET
      identity_key = EXCLUDED.identity_key,
      signed_pre_key = EXCLUDED.signed_pre_key,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING user_id, device_id, identity_key, signed_pre_key, created_at, updated_at`,
    [userId, deviceId, identityKey, JSON.stringify(signedPreKey)]
  );

  return result.rows[0] || null;
}

async function replaceOneTimePreKeys(payload, client = db) {
  const { userId, deviceId, oneTimePreKeys } = payload;

  await client.query(
    `UPDATE doffice_user_one_time_prekeys
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1::varchar(64)
       AND device_id = $2::varchar(64)
       AND deleted_at IS NULL`,
    [userId, deviceId]
  );

  for (const item of oneTimePreKeys) {
    await client.query(
      `INSERT INTO doffice_user_one_time_prekeys (
        user_id, device_id, key_id, public_key
      ) VALUES (
        $1::varchar(64),
        $2::varchar(64),
        $3::int,
        $4::text
      )`,
      [userId, deviceId, item.keyId, item.publicKey]
    );
  }
}

async function findBundleForUser(userId, options = {}, client = db) {
  const {
    deviceId = null,
    allowSessionIdFallback = true,
  } = options;

  const params = [userId];
  const where = ["pk.user_id = $1::varchar(64)", "pk.deleted_at IS NULL", "d.deleted_at IS NULL"];

  if (deviceId) {
    params.push(deviceId);
    const deviceParam = `$${params.length}::varchar(64)`;
    if (allowSessionIdFallback) {
      where.push(`(pk.device_id = ${deviceParam} OR d.session_id = ${deviceParam})`);
    } else {
      where.push(`pk.device_id = ${deviceParam}`);
    }
  }

  const result = await client.query(
    `SELECT
       pk.user_id,
       pk.device_id,
       pk.identity_key,
       pk.signed_pre_key,
       d.name AS device_name,
       d.identity_key_fingerprint,
       d.last_seen_at,
       d.created_at AS device_created_at
     FROM doffice_user_prekeys pk
     INNER JOIN doffice_user_devices d
       ON d.id = pk.device_id
      AND d.user_id = pk.user_id
     WHERE ${where.join(" AND ")}
     ORDER BY d.last_seen_at DESC NULLS LAST, d.created_at DESC
     LIMIT 1`,
    params
  );

  return result.rows[0] || null;
}

async function findDeviceBySessionId(userId, sessionId, client = db) {
  const result = await client.query(
    `SELECT id, user_id, name, session_id, identity_key_fingerprint, last_seen_at
     FROM doffice_user_devices
     WHERE user_id = $1::varchar(64)
       AND session_id = $2::varchar(64)
       AND deleted_at IS NULL
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [userId, sessionId]
  );

  return result.rows[0] || null;
}

async function consumeOneTimePreKey(userId, deviceId, client = db) {
  const result = await client.query(
    `UPDATE doffice_user_one_time_prekeys
     SET consumed_at = NOW(),
         updated_at = NOW()
     WHERE id = (
       SELECT id
       FROM doffice_user_one_time_prekeys
       WHERE user_id = $1::varchar(64)
         AND device_id = $2::varchar(64)
         AND deleted_at IS NULL
         AND consumed_at IS NULL
       ORDER BY created_at ASC, id ASC
       LIMIT 1
     )
     RETURNING key_id, public_key`,
    [userId, deviceId]
  );

  return result.rows[0] || null;
}

async function listDevices(userId, client = db) {
  const result = await client.query(
    `SELECT id, name, session_id, identity_key_fingerprint, last_seen_at
     FROM doffice_user_devices
     WHERE user_id = $1::varchar(64)
       AND deleted_at IS NULL
     ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`,
    [userId]
  );

  return result.rows;
}

async function findDeviceById(deviceId, client = db) {
  const result = await client.query(
    `SELECT id, user_id, name, session_id, identity_key_fingerprint, last_seen_at
     FROM doffice_user_devices
     WHERE id = $1::varchar(64)
       AND deleted_at IS NULL
     LIMIT 1`,
    [deviceId]
  );

  return result.rows[0] || null;
}

async function softDeleteDevice(deviceId, userId, client = db) {
  const result = await client.query(
    `UPDATE doffice_user_devices
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
     RETURNING id`,
    [deviceId, userId]
  );

  await client.query(
    `UPDATE doffice_user_prekeys
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1::varchar(64)
       AND device_id = $2::varchar(64)
       AND deleted_at IS NULL`,
    [userId, deviceId]
  );

  await client.query(
    `UPDATE doffice_user_one_time_prekeys
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1::varchar(64)
       AND device_id = $2::varchar(64)
       AND deleted_at IS NULL`,
    [userId, deviceId]
  );

  return result.rows[0] || null;
}

module.exports = {
  upsertDevice,
  upsertPreKeyBundle,
  replaceOneTimePreKeys,
  findBundleForUser,
  findDeviceBySessionId,
  consumeOneTimePreKey,
  listDevices,
  findDeviceById,
  softDeleteDevice,
};
