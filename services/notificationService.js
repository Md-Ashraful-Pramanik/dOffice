const notificationModel = require("../models/notificationModel");
const { assert } = require("./accessService");

const NOTIFICATION_TYPES = new Set(["mention", "reply", "reaction", "channel_invite", "system"]);

const DEFAULT_PREFERENCES = {
  email: {
    mentions: true,
    directMessages: true,
    channelActivity: false,
  },
  push: {
    mentions: true,
    directMessages: true,
    channelActivity: true,
  },
  inApp: {
    mentions: true,
    directMessages: true,
    channelActivity: true,
  },
  muteChannels: [],
  doNotDisturb: {
    enabled: false,
    from: "22:00",
    to: "08:00",
    timezone: "Asia/Dhaka",
  },
};

function parseBoolean(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  assert(false, `${fieldName} must be true or false.`, 422);
}

function parseNonNegativeInt(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  assert(!Number.isNaN(parsed) && parsed >= 0, `${fieldName} must be a non-negative integer.`, 422);
  return parsed;
}

function parseLimit(value, fallback, max = 100) {
  const parsed = parseNonNegativeInt(value, fallback, "limit");
  assert(parsed > 0, "limit must be greater than 0.", 422);
  assert(parsed <= max, `limit must be less than or equal to ${max}.`, 422);
  return parsed;
}

function toNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    read: Boolean(row.read),
    createdAt: row.created_at,
  };
}

function mergePreferences(input = {}) {
  const next = {
    email: {
      ...DEFAULT_PREFERENCES.email,
      ...(input.email || {}),
    },
    push: {
      ...DEFAULT_PREFERENCES.push,
      ...(input.push || {}),
    },
    inApp: {
      ...DEFAULT_PREFERENCES.inApp,
      ...(input.inApp || {}),
    },
    muteChannels: Array.isArray(input.muteChannels) ? input.muteChannels.filter((id) => typeof id === "string" && id.trim()) : [],
    doNotDisturb: {
      ...DEFAULT_PREFERENCES.doNotDisturb,
      ...(input.doNotDisturb || {}),
    },
  };

  return next;
}

function validateBooleanField(value, fieldPath) {
  assert(typeof value === "boolean", `${fieldPath} must be a boolean.`, 422);
}

function validateChannelPreferenceObject(value, fieldPath) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${fieldPath} must be an object.`, 422);

  const allowedKeys = new Set(["mentions", "directMessages", "channelActivity"]);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  assert(!unknownKeys.length, `${fieldPath} contains invalid field(s): ${unknownKeys.join(", ")}.`, 422);

  if (Object.prototype.hasOwnProperty.call(value, "mentions")) {
    validateBooleanField(value.mentions, `${fieldPath}.mentions`);
  }

  if (Object.prototype.hasOwnProperty.call(value, "directMessages")) {
    validateBooleanField(value.directMessages, `${fieldPath}.directMessages`);
  }

  if (Object.prototype.hasOwnProperty.call(value, "channelActivity")) {
    validateBooleanField(value.channelActivity, `${fieldPath}.channelActivity`);
  }
}

function validateTimeString(value, fieldPath) {
  assert(typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value), `${fieldPath} must be in HH:mm format.`, 422);
}

function validateNotificationPreferencesPayload(preferencesPayload) {
  assert(preferencesPayload && typeof preferencesPayload === "object" && !Array.isArray(preferencesPayload), "preferences is required.", 422);

  const allowedTopLevel = new Set(["email", "push", "inApp", "muteChannels", "doNotDisturb"]);
  const unknownTopLevel = Object.keys(preferencesPayload).filter((key) => !allowedTopLevel.has(key));
  assert(!unknownTopLevel.length, `preferences contains invalid field(s): ${unknownTopLevel.join(", ")}.`, 422);

  if (Object.prototype.hasOwnProperty.call(preferencesPayload, "email")) {
    validateChannelPreferenceObject(preferencesPayload.email, "preferences.email");
  }

  if (Object.prototype.hasOwnProperty.call(preferencesPayload, "push")) {
    validateChannelPreferenceObject(preferencesPayload.push, "preferences.push");
  }

  if (Object.prototype.hasOwnProperty.call(preferencesPayload, "inApp")) {
    validateChannelPreferenceObject(preferencesPayload.inApp, "preferences.inApp");
  }

  if (Object.prototype.hasOwnProperty.call(preferencesPayload, "muteChannels")) {
    assert(Array.isArray(preferencesPayload.muteChannels), "preferences.muteChannels must be an array of channel IDs.", 422);
    const invalidMuteChannel = preferencesPayload.muteChannels.some((channelId) => typeof channelId !== "string" || !channelId.trim());
    assert(!invalidMuteChannel, "preferences.muteChannels must contain non-empty string values.", 422);
  }

  if (Object.prototype.hasOwnProperty.call(preferencesPayload, "doNotDisturb")) {
    const dnd = preferencesPayload.doNotDisturb;
    assert(dnd && typeof dnd === "object" && !Array.isArray(dnd), "preferences.doNotDisturb must be an object.", 422);

    const allowedDndKeys = new Set(["enabled", "from", "to", "timezone"]);
    const unknownDndKeys = Object.keys(dnd).filter((key) => !allowedDndKeys.has(key));
    assert(!unknownDndKeys.length, `preferences.doNotDisturb contains invalid field(s): ${unknownDndKeys.join(", ")}.`, 422);

    if (Object.prototype.hasOwnProperty.call(dnd, "enabled")) {
      validateBooleanField(dnd.enabled, "preferences.doNotDisturb.enabled");
    }

    if (Object.prototype.hasOwnProperty.call(dnd, "from")) {
      validateTimeString(dnd.from, "preferences.doNotDisturb.from");
    }

    if (Object.prototype.hasOwnProperty.call(dnd, "to")) {
      validateTimeString(dnd.to, "preferences.doNotDisturb.to");
    }

    if (Object.prototype.hasOwnProperty.call(dnd, "timezone")) {
      assert(typeof dnd.timezone === "string" && dnd.timezone.trim().length > 0, "preferences.doNotDisturb.timezone must be a non-empty string.", 422);
    }
  }
}

async function ensurePreferences(userId) {
  const existing = await notificationModel.findNotificationPreferences(userId);
  if (existing) {
    return existing.preferences;
  }

  const created = await notificationModel.upsertNotificationPreferences(userId, DEFAULT_PREFERENCES);
  return created.preferences;
}

async function listNotifications(authUser, query) {
  const unread = parseBoolean(query?.unread, "unread");
  const type = query?.type ? String(query.type).trim() : null;
  if (type) {
    assert(NOTIFICATION_TYPES.has(type), "type is invalid.", 422);
  }

  const limit = parseLimit(query?.limit, 30, 100);
  const offset = parseNonNegativeInt(query?.offset, 0, "offset");

  const result = await notificationModel.listNotifications(authUser.id, {
    unread,
    type,
    limit,
    offset,
  });

  return {
    notifications: result.notifications.map(toNotification),
    totalCount: result.totalCount,
    unreadCount: result.unreadCount,
    limit,
    offset,
  };
}

async function markNotificationRead(authUser, notificationId) {
  const updated = await notificationModel.markNotificationRead(notificationId, authUser.id);
  assert(updated, "Resource not found.", 404);
}

async function markAllNotificationsRead(authUser) {
  await notificationModel.markAllNotificationsRead(authUser.id);
}

async function getNotificationPreferences(authUser) {
  const preferences = await ensurePreferences(authUser.id);
  return { preferences };
}

async function updateNotificationPreferences(authUser, payload) {
  const preferencesPayload = payload?.preferences;
  validateNotificationPreferencesPayload(preferencesPayload);

  const currentPreferences = await ensurePreferences(authUser.id);

  const merged = mergePreferences({
    ...currentPreferences,
    ...preferencesPayload,
    ...(preferencesPayload?.email ? { email: { ...currentPreferences.email, ...preferencesPayload.email } } : {}),
    ...(preferencesPayload?.push ? { push: { ...currentPreferences.push, ...preferencesPayload.push } } : {}),
    ...(preferencesPayload?.inApp ? { inApp: { ...currentPreferences.inApp, ...preferencesPayload.inApp } } : {}),
    ...(preferencesPayload?.doNotDisturb
      ? { doNotDisturb: { ...currentPreferences.doNotDisturb, ...preferencesPayload.doNotDisturb } }
      : {}),
  });

  const updated = await notificationModel.upsertNotificationPreferences(authUser.id, merged);

  return {
    preferences: updated.preferences,
  };
}

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
};
