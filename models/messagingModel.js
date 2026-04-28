const db = require("../config/db");

const MESSAGE_BASE_SELECT = `
  SELECT
    m.id,
    m.body,
    m.format,
    m.message_type,
    m.sender_id,
    sender.username AS sender_username,
    sender.name AS sender_name,
    sender.avatar AS sender_avatar,
    m.target_type,
    m.channel_id,
    m.conversation_id,
    m.thread_parent_id,
    m.reply_to_message_id,
    m.attachments,
    m.mentions,
    m.encryption,
    m.client_msg_id,
    m.poll_id,
    m.is_pinned,
    m.pinned_at,
    m.pinned_by,
    m.edited,
    m.edited_at,
    m.deleted_at,
    m.deleted_by,
    m.created_at,
    m.updated_at,
    COALESCE(thread_counts.reply_count, 0)::int AS thread_reply_count
  FROM doffice_messages m
  INNER JOIN doffice_users sender
    ON sender.id = m.sender_id
   AND sender.deleted_at IS NULL
  LEFT JOIN (
    SELECT thread_parent_id, COUNT(*)::int AS reply_count
    FROM doffice_messages
    WHERE deleted_at IS NULL
      AND thread_parent_id IS NOT NULL
    GROUP BY thread_parent_id
  ) thread_counts ON thread_counts.thread_parent_id = m.id
`;

async function findUsersByIds(userIds = [], client = db) {
  if (!Array.isArray(userIds) || !userIds.length) {
    return [];
  }

  const result = await client.query(
    `SELECT id, username, name, avatar, org_id, status
     FROM doffice_users
     WHERE id = ANY($1::varchar(64)[])
       AND deleted_at IS NULL`,
    [userIds]
  );

  return result.rows;
}

async function findUsersByUsernames(usernames = [], orgId = null, client = db) {
  if (!Array.isArray(usernames) || !usernames.length) {
    return [];
  }

  const normalized = [...new Set(usernames.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
  if (!normalized.length) {
    return [];
  }

  const params = [normalized];
  const conditions = ["LOWER(username) = ANY($1::text[])", "deleted_at IS NULL"];

  if (orgId) {
    params.push(orgId);
    conditions.push(`org_id = $${params.length}::varchar(64)`);
  }

  const result = await client.query(
    `SELECT id, username, name, avatar, org_id, status
     FROM doffice_users
     WHERE ${conditions.join(" AND ")}`,
    params
  );

  return result.rows;
}

async function createConversation(payload, client = db) {
  const { id, type, name, createdBy, e2ee, disappearingTimer, dmKey } = payload;

  const result = await client.query(
    `INSERT INTO doffice_conversations (
      id, type, name, created_by, e2ee, disappearing_timer, dm_key
    ) VALUES (
      $1::varchar(64),
      $2::varchar(16),
      $3::varchar(255),
      $4::varchar(64),
      $5::boolean,
      $6::int,
      $7::text
    )
    RETURNING id`,
    [id, type, name || null, createdBy || null, Boolean(e2ee), Number(disappearingTimer || 0), dmKey || null]
  );

  return result.rows[0] || null;
}

async function touchConversation(conversationId, client = db) {
  await client.query(
    `UPDATE doffice_conversations
     SET updated_at = NOW()
     WHERE id = $1::varchar(64)`,
    [conversationId]
  );
}

async function updateConversation(conversationId, updates = {}, client = db) {
  const fields = [];
  const params = [];

  const setField = (column, value, cast = "") => {
    params.push(value);
    fields.push(`${column} = $${params.length}${cast}`);
  };

  if (Object.prototype.hasOwnProperty.call(updates, "createdBy")) {
    setField("created_by", updates.createdBy);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "deletedBy")) {
    setField("deleted_by", updates.deletedBy);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "deletedAt")) {
    setField("deleted_at", updates.deletedAt, "::timestamptz");
  }

  if (!fields.length) {
    return null;
  }

  fields.push("updated_at = NOW()");
  params.push(conversationId);

  const result = await client.query(
    `UPDATE doffice_conversations
     SET ${fields.join(", ")}
     WHERE id = $${params.length}::varchar(64)
     RETURNING id, type, name, created_by, e2ee, disappearing_timer, dm_key, deleted_at, created_at, updated_at`,
    params
  );

  return result.rows[0] || null;
}

async function findConversationById(conversationId, client = db) {
  const result = await client.query(
    `SELECT id, type, name, created_by, e2ee, disappearing_timer, dm_key, deleted_at, created_at, updated_at
     FROM doffice_conversations
     WHERE id = $1::varchar(64)
       AND deleted_at IS NULL
     LIMIT 1`,
    [conversationId]
  );

  return result.rows[0] || null;
}

async function findConversationByDmKey(dmKey, client = db) {
  const result = await client.query(
    `SELECT id, type, name, created_by, e2ee, disappearing_timer, dm_key, deleted_at, created_at, updated_at
     FROM doffice_conversations
     WHERE dm_key = $1::text
       AND type = 'dm'
       AND deleted_at IS NULL
     LIMIT 1`,
    [dmKey]
  );

  return result.rows[0] || null;
}

async function upsertConversationParticipant(payload, client = db) {
  const { conversationId, userId, role, addedBy } = payload;

  const result = await client.query(
    `INSERT INTO doffice_conversation_participants (
      conversation_id, user_id, role, added_by, joined_at
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(16),
      $4::varchar(64),
      NOW()
    )
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET
      role = CASE
        WHEN doffice_conversation_participants.deleted_at IS NULL THEN doffice_conversation_participants.role
        ELSE EXCLUDED.role
      END,
      added_by = EXCLUDED.added_by,
      joined_at = CASE
        WHEN doffice_conversation_participants.deleted_at IS NOT NULL THEN NOW()
        ELSE doffice_conversation_participants.joined_at
      END,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING conversation_id, user_id, role, added_by, joined_at, created_at, updated_at`,
    [conversationId, userId, role, addedBy || null]
  );

  return result.rows[0] || null;
}

async function findConversationParticipant(conversationId, userId, client = db) {
  const result = await client.query(
    `SELECT conversation_id, user_id, role, added_by, joined_at, created_at, updated_at
     FROM doffice_conversation_participants
     WHERE conversation_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
     LIMIT 1`,
    [conversationId, userId]
  );

  return result.rows[0] || null;
}

async function listConversationParticipants(conversationIds, client = db) {
  const ids = Array.isArray(conversationIds) ? conversationIds.filter(Boolean) : [];
  if (!ids.length) {
    return [];
  }

  const result = await client.query(
    `SELECT
       cp.conversation_id,
       cp.user_id,
       cp.role,
       cp.joined_at,
       u.username,
       u.name,
       u.avatar
     FROM doffice_conversation_participants cp
     INNER JOIN doffice_users u
       ON u.id = cp.user_id
      AND u.deleted_at IS NULL
     WHERE cp.conversation_id = ANY($1::varchar(64)[])
       AND cp.deleted_at IS NULL
     ORDER BY cp.joined_at ASC, cp.user_id ASC`,
    [ids]
  );

  return result.rows;
}

async function softRemoveConversationParticipant(conversationId, userId, client = db) {
  const result = await client.query(
    `UPDATE doffice_conversation_participants
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE conversation_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
     RETURNING conversation_id, user_id`,
    [conversationId, userId]
  );

  return result.rows[0] || null;
}

async function updateConversationParticipantRole(conversationId, userId, role, client = db) {
  const result = await client.query(
    `UPDATE doffice_conversation_participants
     SET role = $3::varchar(16),
         updated_at = NOW()
     WHERE conversation_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
     RETURNING conversation_id, user_id, role, added_by, joined_at, created_at, updated_at`,
    [conversationId, userId, role]
  );

  return result.rows[0] || null;
}

async function countConversationAdmins(conversationId, client = db) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM doffice_conversation_participants
     WHERE conversation_id = $1::varchar(64)
       AND role = 'admin'
       AND deleted_at IS NULL`,
    [conversationId]
  );

  return result.rows[0]?.count || 0;
}

async function listConversations(userId, filters = {}, client = db) {
  const {
    type = null,
    search = null,
    limit = 30,
    offset = 0,
  } = filters;

  const params = [userId];
  const where = [
    `EXISTS (
      SELECT 1
      FROM doffice_conversation_participants cp_viewer
      WHERE cp_viewer.conversation_id = c.id
        AND cp_viewer.user_id = $1::varchar(64)
        AND cp_viewer.deleted_at IS NULL
    )`,
    "c.deleted_at IS NULL",
  ];

  if (type) {
    params.push(type);
    where.push(`c.type = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const searchParam = `$${params.length}`;
    where.push(`(
      COALESCE(c.name, '') ILIKE ${searchParam}
      OR EXISTS (
        SELECT 1
        FROM doffice_conversation_participants cp_search
        INNER JOIN doffice_users u_search ON u_search.id = cp_search.user_id
        WHERE cp_search.conversation_id = c.id
          AND cp_search.deleted_at IS NULL
          AND u_search.deleted_at IS NULL
          AND cp_search.user_id <> $1::varchar(64)
          AND (
            COALESCE(u_search.name, '') ILIKE ${searchParam}
            OR u_search.username ILIKE ${searchParam}
          )
      )
    )`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const totalResult = await client.query(
    `SELECT COUNT(*)::int AS total_count
     FROM doffice_conversations c
     ${whereSql}`,
    params
  );

  const dataParams = [...params, limit, offset];
  const result = await client.query(
    `SELECT
       c.id,
       c.type,
       c.name,
       c.created_by,
       c.e2ee,
       c.disappearing_timer,
       c.created_at,
       c.updated_at,
       lm.id AS last_message_id,
       lm.body AS last_message_body,
       lm.sender_id AS last_message_sender_id,
       lm.created_at AS last_message_created_at
     FROM doffice_conversations c
     LEFT JOIN LATERAL (
       SELECT id, body, sender_id, created_at
       FROM doffice_messages m
       WHERE m.conversation_id = c.id
         AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 1
     ) lm ON TRUE
     ${whereSql}
     ORDER BY COALESCE(lm.created_at, c.updated_at) DESC, c.id ASC
     LIMIT $${dataParams.length - 1}
     OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    conversations: result.rows,
    totalCount: totalResult.rows[0]?.total_count || 0,
  };
}

async function listChannelMemberUserIds(channelId, client = db) {
  const result = await client.query(
    `SELECT user_id
     FROM doffice_channel_members
     WHERE channel_id = $1::varchar(64)
       AND deleted_at IS NULL`,
    [channelId]
  );

  return result.rows.map((row) => row.user_id);
}

async function findLatestChannelMessageBySender(channelId, senderId, client = db) {
  const result = await client.query(
    `SELECT id, created_at
     FROM doffice_messages
     WHERE channel_id = $1::varchar(64)
       AND sender_id = $2::varchar(64)
       AND deleted_at IS NULL
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [channelId, senderId]
  );

  return result.rows[0] || null;
}

async function createMessage(payload, client = db) {
  const {
    id,
    body,
    format,
    messageType,
    senderId,
    targetType,
    channelId,
    conversationId,
    threadParentId,
    replyToMessageId,
    attachments,
    mentions,
    encryption,
    clientMsgId,
    pollId,
  } = payload;

  const result = await client.query(
    `INSERT INTO doffice_messages (
      id,
      body,
      format,
      message_type,
      sender_id,
      target_type,
      channel_id,
      conversation_id,
      thread_parent_id,
      reply_to_message_id,
      attachments,
      mentions,
      encryption,
      client_msg_id,
      poll_id
    ) VALUES (
      $1::varchar(64),
      $2::text,
      $3::varchar(24),
      $4::varchar(24),
      $5::varchar(64),
      $6::varchar(24),
      $7::varchar(64),
      $8::varchar(64),
      $9::varchar(64),
      $10::varchar(64),
      COALESCE($11::jsonb, '[]'::jsonb),
      COALESCE($12::text[], ARRAY[]::text[]),
      $13::jsonb,
      $14::varchar(128),
      $15::varchar(64)
    )
    RETURNING id`,
    [
      id,
      body,
      format,
      messageType || "regular",
      senderId,
      targetType,
      channelId || null,
      conversationId || null,
      threadParentId || null,
      replyToMessageId || null,
      JSON.stringify(Array.isArray(attachments) ? attachments : []),
      Array.isArray(mentions) ? mentions : [],
      encryption ? JSON.stringify(encryption) : null,
      clientMsgId || null,
      pollId || null,
    ]
  );

  return result.rows[0] || null;
}

async function findMessageById(messageId, client = db, options = {}) {
  const { includeDeleted = false } = options;
  const deletedClause = includeDeleted ? "" : "AND m.deleted_at IS NULL";

  const result = await client.query(
    `${MESSAGE_BASE_SELECT}
     WHERE m.id = $1::varchar(64)
       ${deletedClause}
     LIMIT 1`,
    [messageId]
  );

  return result.rows[0] || null;
}

async function listMessages(filters = {}, client = db) {
  const {
    targetType,
    targetId,
    limit = 50,
    offset = 0,
    beforeCursor = null,
    afterCursor = null,
    threadParentId = null,
    pinnedOnly = false,
    includeThreadReplies = false,
    sort = "desc",
  } = filters;

  const params = [];
  const where = ["m.deleted_at IS NULL"];

  if (targetType === "channel") {
    params.push(targetId);
    where.push(`m.channel_id = $${params.length}::varchar(64)`);
  } else if (targetType === "conversation") {
    params.push(targetId);
    where.push(`m.conversation_id = $${params.length}::varchar(64)`);
  }

  if (threadParentId) {
    params.push(threadParentId);
    where.push(`m.thread_parent_id = $${params.length}::varchar(64)`);
  } else if (!includeThreadReplies) {
    where.push("m.thread_parent_id IS NULL");
  }

  if (pinnedOnly) {
    where.push("m.is_pinned = TRUE");
  }

  let orderSql = sort === "asc"
    ? "ORDER BY m.created_at ASC, m.id ASC"
    : "ORDER BY m.created_at DESC, m.id DESC";
  if (beforeCursor) {
    params.push(beforeCursor.created_at);
    params.push(beforeCursor.id);
    where.push(`(
      m.created_at < $${params.length - 1}::timestamptz
      OR (m.created_at = $${params.length - 1}::timestamptz AND m.id < $${params.length}::varchar(64))
    )`);
  }

  if (afterCursor) {
    params.push(afterCursor.created_at);
    params.push(afterCursor.id);
    where.push(`(
      m.created_at > $${params.length - 1}::timestamptz
      OR (m.created_at = $${params.length - 1}::timestamptz AND m.id > $${params.length}::varchar(64))
    )`);
    orderSql = "ORDER BY m.created_at ASC, m.id ASC";
  }

  const queryParams = [...params, limit + 1, offset];
  const result = await client.query(
    `${MESSAGE_BASE_SELECT}
     WHERE ${where.join(" AND ")}
     ${orderSql}
     LIMIT $${queryParams.length - 1}
     OFFSET $${queryParams.length}`,
    queryParams
  );

  return result.rows;
}

async function listMessagesByIds(messageIds = [], client = db) {
  if (!Array.isArray(messageIds) || !messageIds.length) {
    return [];
  }

  const result = await client.query(
    `${MESSAGE_BASE_SELECT}
     WHERE m.id = ANY($1::varchar(64)[])
       AND m.deleted_at IS NULL`,
    [messageIds]
  );

  return result.rows;
}

async function updateMessage(messageId, updates = {}, client = db) {
  const fields = [];
  const params = [];

  const setField = (column, value, cast = "") => {
    params.push(value);
    fields.push(`${column} = $${params.length}${cast}`);
  };

  if (Object.prototype.hasOwnProperty.call(updates, "body")) {
    setField("body", updates.body);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "attachments")) {
    setField("attachments", JSON.stringify(Array.isArray(updates.attachments) ? updates.attachments : []), "::jsonb");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "mentions")) {
    params.push(Array.isArray(updates.mentions) ? updates.mentions : []);
    fields.push(`mentions = $${params.length}::text[]`);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "encryption")) {
    setField("encryption", updates.encryption ? JSON.stringify(updates.encryption) : null, "::jsonb");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "edited")) {
    setField("edited", Boolean(updates.edited), "::boolean");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "editedAt")) {
    setField("edited_at", updates.editedAt, "::timestamptz");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "isPinned")) {
    setField("is_pinned", Boolean(updates.isPinned), "::boolean");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "pinnedAt")) {
    setField("pinned_at", updates.pinnedAt, "::timestamptz");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "pinnedBy")) {
    setField("pinned_by", updates.pinnedBy);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "deletedAt")) {
    setField("deleted_at", updates.deletedAt, "::timestamptz");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "deletedBy")) {
    setField("deleted_by", updates.deletedBy);
  }

  if (!fields.length) {
    return null;
  }

  fields.push("updated_at = NOW()");
  params.push(messageId);

  const result = await client.query(
    `UPDATE doffice_messages
     SET ${fields.join(", ")}
     WHERE id = $${params.length}::varchar(64)
     RETURNING id`,
    params
  );

  return result.rows[0] || null;
}

async function createMessageEdit(payload, client = db) {
  const { messageId, body, editedAt } = payload;

  const result = await client.query(
    `INSERT INTO doffice_message_edits (message_id, body, edited_at)
     VALUES ($1::varchar(64), $2::text, $3::timestamptz)
     RETURNING id`,
    [messageId, body, editedAt]
  );

  return result.rows[0] || null;
}

async function listMessageEdits(messageId, client = db) {
  const result = await client.query(
    `SELECT body, edited_at
     FROM doffice_message_edits
     WHERE message_id = $1::varchar(64)
     ORDER BY edited_at ASC, id ASC`,
    [messageId]
  );

  return result.rows;
}

async function addReaction(messageId, userId, emoji, client = db) {
  const result = await client.query(
    `INSERT INTO doffice_message_reactions (message_id, user_id, emoji)
     VALUES ($1::varchar(64), $2::varchar(64), $3::varchar(64))
     ON CONFLICT (message_id, user_id, emoji)
     DO UPDATE SET deleted_at = NULL
     RETURNING message_id, user_id, emoji`,
    [messageId, userId, emoji]
  );

  return result.rows[0] || null;
}

async function removeReaction(messageId, userId, emoji, client = db) {
  const result = await client.query(
    `UPDATE doffice_message_reactions
     SET deleted_at = NOW()
     WHERE message_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND emoji = $3::varchar(64)
       AND deleted_at IS NULL
     RETURNING message_id, user_id, emoji`,
    [messageId, userId, emoji]
  );

  return result.rows[0] || null;
}

async function listReactionSummary(messageIds = [], client = db) {
  if (!Array.isArray(messageIds) || !messageIds.length) {
    return [];
  }

  const result = await client.query(
    `SELECT
       message_id,
       emoji,
       COUNT(*)::int AS count,
       ARRAY_AGG(user_id ORDER BY user_id ASC) AS users
     FROM doffice_message_reactions
     WHERE message_id = ANY($1::varchar(64)[])
       AND deleted_at IS NULL
     GROUP BY message_id, emoji
     ORDER BY emoji ASC`,
    [messageIds]
  );

  return result.rows;
}

async function addBookmark(userId, messageId, client = db) {
  const result = await client.query(
    `INSERT INTO doffice_user_bookmarks (user_id, message_id)
     VALUES ($1::varchar(64), $2::varchar(64))
     ON CONFLICT (user_id, message_id)
     DO UPDATE SET deleted_at = NULL, created_at = NOW()
     RETURNING user_id, message_id`,
    [userId, messageId]
  );

  return result.rows[0] || null;
}

async function removeBookmark(userId, messageId, client = db) {
  const result = await client.query(
    `UPDATE doffice_user_bookmarks
     SET deleted_at = NOW()
     WHERE user_id = $1::varchar(64)
       AND message_id = $2::varchar(64)
       AND deleted_at IS NULL
     RETURNING user_id, message_id`,
    [userId, messageId]
  );

  return result.rows[0] || null;
}

async function listBookmarkedMessageIds(userId, limit = 30, offset = 0, client = db) {
  const result = await client.query(
    `SELECT message_id
     FROM doffice_user_bookmarks
     WHERE user_id = $1::varchar(64)
       AND deleted_at IS NULL
     ORDER BY created_at DESC, message_id ASC
     LIMIT $2::int
     OFFSET $3::int`,
    [userId, limit + 1, offset]
  );

  return result.rows.map((row) => row.message_id);
}

async function createPoll(payload, client = db) {
  const {
    id,
    channelId,
    messageId,
    question,
    options,
    multipleChoice,
    anonymous,
    expiresAt,
    createdBy,
  } = payload;

  const result = await client.query(
    `INSERT INTO doffice_polls (
      id, channel_id, message_id, question, options, multiple_choice, anonymous, expires_at, created_by
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(64),
      $4::text,
      $5::jsonb,
      $6::boolean,
      $7::boolean,
      $8::timestamptz,
      $9::varchar(64)
    )
    RETURNING id`,
    [
      id,
      channelId,
      messageId,
      question,
      JSON.stringify(options),
      Boolean(multipleChoice),
      Boolean(anonymous),
      expiresAt || null,
      createdBy,
    ]
  );

  return result.rows[0] || null;
}

async function findPollById(pollId, client = db) {
  const result = await client.query(
    `SELECT id, channel_id, message_id, question, options, multiple_choice, anonymous, expires_at, created_by, created_at, updated_at
     FROM doffice_polls
     WHERE id = $1::varchar(64)
       AND deleted_at IS NULL
     LIMIT 1`,
    [pollId]
  );

  return result.rows[0] || null;
}

async function listPollVotes(pollId, client = db) {
  const result = await client.query(
    `SELECT user_id, option_index
     FROM doffice_poll_votes
     WHERE poll_id = $1::varchar(64)
       AND deleted_at IS NULL
     ORDER BY option_index ASC, user_id ASC`,
    [pollId]
  );

  return result.rows;
}

async function replaceSingleChoiceVote(pollId, userId, optionIndex, client = db) {
  await client.query(
    `UPDATE doffice_poll_votes
     SET deleted_at = NOW()
     WHERE poll_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL`,
    [pollId, userId]
  );

  const result = await client.query(
    `INSERT INTO doffice_poll_votes (poll_id, user_id, option_index)
     VALUES ($1::varchar(64), $2::varchar(64), $3::int)
     ON CONFLICT (poll_id, user_id, option_index)
     DO UPDATE SET deleted_at = NULL
     RETURNING poll_id, user_id, option_index`,
    [pollId, userId, optionIndex]
  );

  return result.rows[0] || null;
}

async function addMultiChoiceVote(pollId, userId, optionIndex, client = db) {
  const result = await client.query(
    `INSERT INTO doffice_poll_votes (poll_id, user_id, option_index)
     VALUES ($1::varchar(64), $2::varchar(64), $3::int)
     ON CONFLICT (poll_id, user_id, option_index)
     DO UPDATE SET deleted_at = NULL
     RETURNING poll_id, user_id, option_index`,
    [pollId, userId, optionIndex]
  );

  return result.rows[0] || null;
}

async function searchMessages(filters = {}, client = db) {
  const {
    userId,
    accessibleOrgIds = [],
    q = null,
    channelId = null,
    conversationId = null,
    senderId = null,
    from = null,
    to = null,
    hasAttachment = null,
    hasLink = null,
    isPinned = null,
    limit = 20,
    offset = 0,
  } = filters;

  const params = [userId];
  const where = [
    "m.deleted_at IS NULL",
    `(
      (
        m.target_type = 'conversation'
        AND EXISTS (
          SELECT 1
          FROM doffice_conversation_participants cp
          WHERE cp.conversation_id = m.conversation_id
            AND cp.user_id = $1::varchar(64)
            AND cp.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM doffice_conversations c_e2ee
          WHERE c_e2ee.id = m.conversation_id
            AND c_e2ee.e2ee = TRUE
            AND c_e2ee.deleted_at IS NULL
        )
      )
      OR (
        m.target_type = 'channel'
        AND EXISTS (
          SELECT 1
          FROM doffice_channels ch
          WHERE ch.id = m.channel_id
            AND ch.deleted_at IS NULL
            AND (
              ch.type <> 'private'
              OR EXISTS (
                SELECT 1
                FROM doffice_channel_members cm
                WHERE cm.channel_id = ch.id
                  AND cm.user_id = $1::varchar(64)
                  AND cm.deleted_at IS NULL
              )
            )
        )
      )
    )`,
    "m.format <> 'encrypted'",
  ];

  if (Array.isArray(accessibleOrgIds)) {
    params.push(accessibleOrgIds);
    const orgParam = `$${params.length}`;
    where.push(`(
      (m.target_type = 'channel' AND EXISTS (
        SELECT 1 FROM doffice_channels ch_scope
        WHERE ch_scope.id = m.channel_id
          AND ch_scope.org_id = ANY(${orgParam}::varchar(64)[])
          AND ch_scope.deleted_at IS NULL
      ))
      OR m.target_type = 'conversation'
    )`);
  }

  if (q) {
    params.push(q);
    where.push(`to_tsvector('simple', COALESCE(m.body, '')) @@ websearch_to_tsquery('simple', $${params.length}::text)`);
  }

  if (channelId) {
    params.push(channelId);
    where.push(`m.channel_id = $${params.length}::varchar(64)`);
  }

  if (conversationId) {
    params.push(conversationId);
    where.push(`m.conversation_id = $${params.length}::varchar(64)`);
  }

  if (senderId) {
    params.push(senderId);
    where.push(`m.sender_id = $${params.length}::varchar(64)`);
  }

  if (from) {
    params.push(from);
    where.push(`m.created_at >= $${params.length}::timestamptz`);
  }

  if (to) {
    params.push(to);
    where.push(`m.created_at <= $${params.length}::timestamptz`);
  }

  if (hasAttachment === true) {
    where.push("jsonb_array_length(COALESCE(m.attachments, '[]'::jsonb)) > 0");
  } else if (hasAttachment === false) {
    where.push("jsonb_array_length(COALESCE(m.attachments, '[]'::jsonb)) = 0");
  }

  if (hasLink === true) {
    where.push(`m.body ~* '(https?://|www\\.)'`);
  } else if (hasLink === false) {
    where.push(`m.body !~* '(https?://|www\\.)'`);
  }

  if (isPinned === true) {
    where.push("m.is_pinned = TRUE");
  } else if (isPinned === false) {
    where.push("m.is_pinned = FALSE");
  }

  const queryParams = [...params, limit + 1, offset];
  const result = await client.query(
    `${MESSAGE_BASE_SELECT}
     WHERE ${where.join(" AND ")}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $${queryParams.length - 1}::int
     OFFSET $${queryParams.length}::int`,
    queryParams
  );

  return result.rows;
}

module.exports = {
  findUsersByIds,
  findUsersByUsernames,
  createConversation,
  touchConversation,
  updateConversation,
  findConversationById,
  findConversationByDmKey,
  upsertConversationParticipant,
  findConversationParticipant,
  listConversationParticipants,
  softRemoveConversationParticipant,
  updateConversationParticipantRole,
  countConversationAdmins,
  listConversations,
  listChannelMemberUserIds,
  findLatestChannelMessageBySender,
  createMessage,
  findMessageById,
  listMessages,
  listMessagesByIds,
  updateMessage,
  createMessageEdit,
  listMessageEdits,
  addReaction,
  removeReaction,
  listReactionSummary,
  addBookmark,
  removeBookmark,
  listBookmarkedMessageIds,
  createPoll,
  findPollById,
  listPollVotes,
  replaceSingleChoiceVote,
  addMultiChoiceVote,
  searchMessages,
};
