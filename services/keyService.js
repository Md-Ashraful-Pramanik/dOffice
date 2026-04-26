const db = require("../config/db");
const keyModel = require("../models/keyModel");
const userModel = require("../models/userModel");
const { generateId } = require("../utils/id");
const { assert, getAccessContext } = require("./accessService");

function normalizeRequiredString(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : "";
  assert(normalized, `${fieldName} is required.`, 422);
  return normalized;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function isValidPreKey(item) {
  return Boolean(item)
    && Number.isInteger(item.keyId)
    && typeof item.publicKey === "string"
    && item.publicKey.trim().length > 0;
}

function computeFingerprint(value = "") {
  const normalized = String(value).replace(/\s+/g, "");
  const head = normalized.slice(0, 24).toUpperCase();
  return head.match(/.{1,2}/g)?.join(" ") || "";
}

function buildDefaultDeviceName(authUser) {
  return `Device for ${authUser.username || authUser.id}`;
}

function toDeviceResponse(device, currentDeviceId) {
  return {
    id: device.id,
    name: device.name || "Unnamed device",
    identityKeyFingerprint: device.identity_key_fingerprint || "",
    lastSeen: device.last_seen_at,
    current: device.id === currentDeviceId,
  };
}

async function uploadPreKeyBundle(authUser, sessionId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const keys = payload?.keys;
    assert(keys && typeof keys === "object" && !Array.isArray(keys), "keys is required.", 422);

    const identityKey = normalizeRequiredString(keys.identityKey, "identityKey");
    const signedPreKey = keys.signedPreKey;
    assert(signedPreKey && typeof signedPreKey === "object", "signedPreKey is required.", 422);
    assert(Number.isInteger(signedPreKey.keyId), "signedPreKey.keyId is invalid.", 422);
    assert(normalizeRequiredString(signedPreKey.publicKey, "signedPreKey.publicKey"), "signedPreKey.publicKey is required.", 422);
    assert(normalizeRequiredString(signedPreKey.signature, "signedPreKey.signature"), "signedPreKey.signature is required.", 422);

    const oneTimePreKeys = Array.isArray(keys.oneTimePreKeys) ? keys.oneTimePreKeys : null;
    assert(oneTimePreKeys && oneTimePreKeys.length > 0, "oneTimePreKeys is required.", 422);
    assert(oneTimePreKeys.every(isValidPreKey), "oneTimePreKeys contains invalid entries.", 422);

    const explicitDeviceId = normalizeOptionalString(payload?.deviceId);
    const deviceId = explicitDeviceId || sessionId || generateId("dev");
    const identityKeyFingerprint = computeFingerprint(identityKey);

    await keyModel.upsertDevice(
      {
        id: deviceId,
        userId: authUser.id,
        name: normalizeOptionalString(payload?.deviceName) || buildDefaultDeviceName(authUser),
        sessionId: sessionId || null,
        identityKeyFingerprint,
        lastSeenAt: new Date(),
      },
      client
    );

    await keyModel.upsertPreKeyBundle(
      {
        userId: authUser.id,
        deviceId,
        identityKey,
        signedPreKey,
      },
      client
    );

    await keyModel.replaceOneTimePreKeys(
      {
        userId: authUser.id,
        deviceId,
        oneTimePreKeys,
      },
      client
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getUserPreKeyBundle(authUser, userId, query) {
  const targetUser = await userModel.findById(userId);
  assert(targetUser, "Resource not found.", 404);

  const accessContext = await getAccessContext(authUser);
  const sameOrg = authUser.org_id && targetUser.org_id && authUser.org_id === targetUser.org_id;
  assert(sameOrg || accessContext.isOrgAdmin || accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);

  const bundle = await keyModel.findBundleForUser(userId, { deviceId: query?.deviceId || null });
  assert(bundle, "Resource not found.", 404);

  const oneTimePreKey = await keyModel.consumeOneTimePreKey(userId, bundle.device_id);

  return {
    keys: {
      userId,
      deviceId: bundle.device_id,
      identityKey: bundle.identity_key,
      signedPreKey: bundle.signed_pre_key,
      oneTimePreKey,
    },
  };
}

async function listUserDevices(authUser, currentSessionId) {
  const devices = await keyModel.listDevices(authUser.id);

  return {
    devices: devices.map((device) => toDeviceResponse(device, currentSessionId)),
  };
}

async function removeDevice(authUser, deviceId) {
  const device = await keyModel.findDeviceById(deviceId);
  assert(device && device.user_id === authUser.id, "Resource not found.", 404);

  await keyModel.softDeleteDevice(deviceId, authUser.id);
}

async function getUserKeyFingerprint(authUser, userId) {
  const targetUser = await userModel.findById(userId);
  assert(targetUser, "Resource not found.", 404);

  const bundle = await keyModel.findBundleForUser(userId);
  assert(bundle, "Resource not found.", 404);

  const accessContext = await getAccessContext(authUser);
  const sameOrg = authUser.org_id && targetUser.org_id && authUser.org_id === targetUser.org_id;
  assert(sameOrg || accessContext.isOrgAdmin || accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);

  return {
    fingerprint: {
      userId,
      deviceId: bundle.device_id,
      safetyNumber: bundle.identity_key_fingerprint || computeFingerprint(bundle.identity_key),
    },
  };
}

module.exports = {
  uploadPreKeyBundle,
  getUserPreKeyBundle,
  listUserDevices,
  removeDevice,
  getUserKeyFingerprint,
};
