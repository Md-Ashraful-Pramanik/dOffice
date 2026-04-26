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
    timezone: "UTC",
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
  assert(preferencesPayload && typeof preferencesPayload === "object" && !Array.isArray(preferencesPayload), "preferences is required.", 422);

  const merged = mergePreferences(preferencesPayload);
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
