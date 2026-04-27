const db = require("../config/db");

async function listNotifications(userId, filters = {}, client = db) {
  const {
    unread = null,
    type = null,
    limit = 30,
    offset = 0,
  } = filters;

  const params = [userId];
  const where = ["n.user_id = $1::varchar(64)", "n.deleted_at IS NULL"];

  if (typeof unread === "boolean") {
    params.push(unread);
    where.push(`n.read = $${params.length}::boolean`);
  }

  if (type) {
    params.push(type);
    where.push(`n.type = $${params.length}::varchar(32)`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const totalResult = await client.query(
    `SELECT
       COUNT(*)::int AS total_count,
       COUNT(*) FILTER (WHERE n.read = FALSE)::int AS unread_count
     FROM doffice_notifications n
     ${whereSql}`,
    params
  );

  const dataParams = [...params, limit, offset];
  const result = await client.query(
    `SELECT id, type, title, body, link, read, created_at
     FROM doffice_notifications n
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT $${dataParams.length - 1}
     OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    notifications: result.rows,
    totalCount: totalResult.rows[0]?.total_count || 0,
    unreadCount: totalResult.rows[0]?.unread_count || 0,
  };
}

async function markNotificationRead(notificationId, userId, client = db) {
  const result = await client.query(
    `UPDATE doffice_notifications
     SET read = TRUE,
         read_at = NOW(),
         updated_at = NOW()
     WHERE id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
     RETURNING id`,
    [notificationId, userId]
  );

  return result.rows[0] || null;
}

async function markAllNotificationsRead(userId, client = db) {
  await client.query(
    `UPDATE doffice_notifications
     SET read = TRUE,
         read_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1::varchar(64)
       AND deleted_at IS NULL
       AND read = FALSE`,
    [userId]
  );
}

async function findNotificationPreferences(userId, client = db) {
  const result = await client.query(
    `SELECT user_id, preferences
     FROM doffice_notification_preferences
     WHERE user_id = $1::varchar(64)
       AND deleted_at IS NULL
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

async function upsertNotificationPreferences(userId, preferences, client = db) {
  const result = await client.query(
    `INSERT INTO doffice_notification_preferences (
      user_id, preferences
    ) VALUES (
      $1::varchar(64),
      $2::jsonb
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      preferences = EXCLUDED.preferences,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING user_id, preferences`,
    [userId, JSON.stringify(preferences)]
  );

  return result.rows[0] || null;
}

async function createNotifications(notifications = [], client = db) {
  const rows = Array.isArray(notifications) ? notifications.filter(Boolean) : [];
  if (!rows.length) {
    return [];
  }

  const inserted = [];
  for (const item of rows) {
    const result = await client.query(
      `INSERT INTO doffice_notifications (
        id, user_id, type, title, body, link, metadata
      ) VALUES (
        $1::varchar(64),
        $2::varchar(64),
        $3::varchar(32),
        $4::varchar(255),
        $5::text,
        $6::text,
        COALESCE($7::jsonb, '{}'::jsonb)
      )
      RETURNING id, user_id, type, title, body, link, metadata, read, created_at`,
      [
        item.id,
        item.userId,
        item.type,
        item.title,
        item.body || null,
        item.link || null,
        item.metadata ? JSON.stringify(item.metadata) : JSON.stringify({}),
      ]
    );

    if (result.rows[0]) {
      inserted.push(result.rows[0]);
    }
  }

  return inserted;
}

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  findNotificationPreferences,
  upsertNotificationPreferences,
  createNotifications,
};
