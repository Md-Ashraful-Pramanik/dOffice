const db = require("../config/db");

const CHANNEL_SELECT = `
  SELECT
    c.id,
    c.name,
    c.type,
    c.description,
    c.topic,
    c.category_id,
    c.org_id,
    c.e2ee,
    c.slow_mode_interval,
    c.created_by,
    c.deleted_by,
    c.deleted_at,
    c.created_at,
    c.updated_at,
    cat.position AS category_position,
    COALESCE(member_counts.member_count, 0)::int AS member_count
  FROM doffice_channels c
  LEFT JOIN doffice_channel_categories cat
    ON cat.id = c.category_id
   AND cat.deleted_at IS NULL
  LEFT JOIN (
    SELECT channel_id, COUNT(*)::int AS member_count
    FROM doffice_channel_members
    WHERE deleted_at IS NULL
    GROUP BY channel_id
  ) member_counts ON member_counts.channel_id = c.id
`;

function buildChannelVisibilityClause({ viewerUserParamIndex, bypassPrivateRestriction, joined }) {
  const clauses = [];

  if (!bypassPrivateRestriction) {
    clauses.push(`(
      c.type <> 'private'
      OR EXISTS (
        SELECT 1
        FROM doffice_channel_members viewer_membership
        WHERE viewer_membership.channel_id = c.id
          AND viewer_membership.user_id = $${viewerUserParamIndex}::varchar(64)
          AND viewer_membership.deleted_at IS NULL
      )
    )`);
  }

  if (joined) {
    clauses.push(`EXISTS (
      SELECT 1
      FROM doffice_channel_members joined_membership
      WHERE joined_membership.channel_id = c.id
        AND joined_membership.user_id = $${viewerUserParamIndex}::varchar(64)
        AND joined_membership.deleted_at IS NULL
    )`);
  }

  return clauses;
}

async function listChannels(orgId, filters = {}, client = db) {
  const {
    search = null,
    type = null,
    categoryId = null,
    joined = false,
    userId,
    bypassPrivateRestriction = false,
    limit = 50,
    offset = 0,
  } = filters;

  const params = [orgId];
  const where = ["c.org_id = $1", "c.deleted_at IS NULL"];

  let viewerUserParamIndex = null;
  if (userId) {
    params.push(userId);
    viewerUserParamIndex = params.length;
  }

  if (search) {
    params.push(`%${search}%`);
    where.push(`c.name ILIKE $${params.length}`);
  }

  if (type) {
    params.push(type);
    where.push(`c.type = $${params.length}`);
  }

  if (categoryId) {
    params.push(categoryId);
    where.push(`c.category_id = $${params.length}`);
  }

  if ((joined || !bypassPrivateRestriction) && !viewerUserParamIndex) {
    return { channels: [], totalCount: 0 };
  }

  where.push(
    ...buildChannelVisibilityClause({
      viewerUserParamIndex,
      bypassPrivateRestriction,
      joined,
    })
  );

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const totalResult = await client.query(
    `SELECT COUNT(*)::int AS total_count
     FROM doffice_channels c
     ${whereSql}`,
    params
  );

  const dataParams = [...params, limit, offset];
  const result = await client.query(
    `${CHANNEL_SELECT}
     ${whereSql}
     ORDER BY COALESCE(cat.position, 2147483647) ASC, LOWER(c.name) ASC, c.created_at ASC
     LIMIT $${dataParams.length - 1}
     OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    channels: result.rows,
    totalCount: totalResult.rows[0].total_count,
  };
}

async function findById(channelId, client = db) {
  const result = await client.query(
    `${CHANNEL_SELECT}
     WHERE c.id = $1
       AND c.deleted_at IS NULL
     LIMIT 1`,
    [channelId]
  );

  return result.rows[0] || null;
}

async function createChannel(payload, client = db) {
  const {
    id,
    orgId,
    categoryId,
    name,
    type,
    description,
    topic,
    e2ee,
    slowModeInterval,
    createdBy,
  } = payload;

  const result = await client.query(
    `INSERT INTO doffice_channels (
      id, org_id, category_id, name, type, description, topic, e2ee, slow_mode_interval, created_by
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(64),
      $4::varchar(160),
      $5::varchar(32),
      $6::text,
      $7::text,
      $8::boolean,
      $9::int,
      $10::varchar(64)
    )
    RETURNING id`,
    [
      id,
      orgId,
      categoryId || null,
      name,
      type,
      description || null,
      topic || null,
      Boolean(e2ee),
      Number.isInteger(slowModeInterval) ? slowModeInterval : 0,
      createdBy || null,
    ]
  );

  return result.rows[0] || null;
}

async function updateChannel(channelId, updates = {}, client = db) {
  const fields = [];
  const params = [];

  const setField = (column, value, cast = "") => {
    params.push(value);
    fields.push(`${column} = $${params.length}${cast}`);
  };

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    setField("name", updates.name);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "description")) {
    setField("description", updates.description);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "topic")) {
    setField("topic", updates.topic);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "categoryId")) {
    setField("category_id", updates.categoryId);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "type")) {
    setField("type", updates.type);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "e2ee")) {
    setField("e2ee", Boolean(updates.e2ee), "::boolean");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "deletedBy")) {
    setField("deleted_by", updates.deletedBy);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "deletedAt")) {
    setField("deleted_at", updates.deletedAt);
  }

  if (!fields.length) {
    return null;
  }

  fields.push("updated_at = NOW()");
  params.push(channelId);

  const result = await client.query(
    `UPDATE doffice_channels
     SET ${fields.join(", ")}
     WHERE id = $${params.length}
     RETURNING id`,
    params
  );

  return result.rows[0] || null;
}

async function softDeleteChannel(channelId, deletedBy, client = db) {
  const result = await client.query(
    `UPDATE doffice_channels
     SET deleted_at = NOW(),
         deleted_by = $2::varchar(64),
         updated_at = NOW()
     WHERE id = $1::varchar(64)
       AND deleted_at IS NULL
     RETURNING id`,
    [channelId, deletedBy || null]
  );

  return result.rows[0] || null;
}

async function findMembership(channelId, userId, client = db) {
  const result = await client.query(
    `SELECT channel_id, user_id, role, invited_by, joined_at, created_at, updated_at
     FROM doffice_channel_members
     WHERE channel_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
     LIMIT 1`,
    [channelId, userId]
  );

  return result.rows[0] || null;
}

async function listActiveMembershipsByUserIds(channelId, userIds = [], client = db) {
  if (!Array.isArray(userIds) || !userIds.length) {
    return [];
  }

  const result = await client.query(
    `SELECT channel_id, user_id, role, invited_by, joined_at, created_at, updated_at
     FROM doffice_channel_members
     WHERE channel_id = $1::varchar(64)
       AND user_id = ANY($2::varchar(64)[])
       AND deleted_at IS NULL`,
    [channelId, userIds]
  );

  return result.rows;
}

async function upsertChannelMember(payload, client = db) {
  const { channelId, userId, role, invitedBy } = payload;

  const result = await client.query(
    `INSERT INTO doffice_channel_members (
      channel_id, user_id, role, invited_by, joined_at
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(16),
      $4::varchar(64),
      NOW()
    )
    ON CONFLICT (channel_id, user_id)
    DO UPDATE SET
      role = CASE
        WHEN doffice_channel_members.deleted_at IS NULL THEN doffice_channel_members.role
        ELSE EXCLUDED.role
      END,
      invited_by = EXCLUDED.invited_by,
      joined_at = CASE
        WHEN doffice_channel_members.deleted_at IS NOT NULL THEN NOW()
        ELSE doffice_channel_members.joined_at
      END,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING channel_id, user_id, role, invited_by, joined_at, created_at, updated_at`,
    [channelId, userId, role, invitedBy || null]
  );

  return result.rows[0] || null;
}

async function softRemoveMember(channelId, userId, client = db) {
  const result = await client.query(
    `UPDATE doffice_channel_members
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE channel_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
     RETURNING channel_id, user_id`,
    [channelId, userId]
  );

  return result.rows[0] || null;
}

async function softDeleteAllMembers(channelId, client = db) {
  await client.query(
    `UPDATE doffice_channel_members
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE channel_id = $1::varchar(64)
       AND deleted_at IS NULL`,
    [channelId]
  );
}

async function countMembersByRole(channelId, role, client = db) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM doffice_channel_members
     WHERE channel_id = $1::varchar(64)
       AND role = $2::varchar(16)
       AND deleted_at IS NULL`,
    [channelId, role]
  );

  return result.rows[0].count;
}

async function updateMemberRole(channelId, userId, role, client = db) {
  const result = await client.query(
    `UPDATE doffice_channel_members
     SET role = $3::varchar(16),
         updated_at = NOW()
     WHERE channel_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
     RETURNING channel_id, user_id, role, invited_by, joined_at, created_at, updated_at`,
    [channelId, userId, role]
  );

  return result.rows[0] || null;
}

async function listMembers(channelId, filters = {}, client = db) {
  const {
    search = null,
    role = null,
    limit = 50,
    offset = 0,
  } = filters;

  const params = [channelId];
  const where = ["cm.channel_id = $1", "cm.deleted_at IS NULL", "u.deleted_at IS NULL"];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(
      COALESCE(u.name, '') ILIKE $${params.length}
      OR u.username ILIKE $${params.length}
      OR COALESCE(u.email, '') ILIKE $${params.length}
    )`);
  }

  if (role) {
    params.push(role);
    where.push(`cm.role = $${params.length}`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const totalResult = await client.query(
    `SELECT COUNT(*)::int AS total_count
     FROM doffice_channel_members cm
     INNER JOIN doffice_users u ON u.id = cm.user_id
     ${whereSql}`,
    params
  );

  const dataParams = [...params, limit, offset];
  const result = await client.query(
    `SELECT
       u.id,
       u.username,
       u.name,
       u.designation,
       u.department,
       u.avatar,
       u.status,
       cm.role AS channel_role,
       cm.joined_at
     FROM doffice_channel_members cm
     INNER JOIN doffice_users u ON u.id = cm.user_id
     ${whereSql}
     ORDER BY COALESCE(u.name, u.username) ASC, u.username ASC
     LIMIT $${dataParams.length - 1}
     OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    members: result.rows,
    totalCount: totalResult.rows[0].total_count,
  };
}

async function getMemberWithUserInfo(channelId, userId, client = db) {
  const result = await client.query(
    `SELECT
       u.id,
       u.username,
       u.name,
       u.designation,
       u.department,
       u.avatar,
       u.status,
       cm.role AS channel_role,
       cm.joined_at
     FROM doffice_channel_members cm
     INNER JOIN doffice_users u ON u.id = cm.user_id
     WHERE cm.channel_id = $1::varchar(64)
       AND cm.user_id = $2::varchar(64)
       AND cm.deleted_at IS NULL
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [channelId, userId]
  );

  return result.rows[0] || null;
}

module.exports = {
  listChannels,
  findById,
  createChannel,
  updateChannel,
  softDeleteChannel,
  findMembership,
  listActiveMembershipsByUserIds,
  upsertChannelMember,
  softRemoveMember,
  softDeleteAllMembers,
  countMembersByRole,
  updateMemberRole,
  listMembers,
  getMemberWithUserInfo,
};
