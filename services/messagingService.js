const db = require("../config/db");
const channelModel = require("../models/channelModel");
const messagingModel = require("../models/messagingModel");
const { generateId } = require("../utils/id");
const {
  assert,
  getAccessContext,
  assertOrgAccess,
  assertUserExists,
} = require("./accessService");
const { broadcastToUsers } = require("../realtime/websocketServer");

const CONVERSATION_TYPES = new Set(["dm", "group"]);
const MESSAGE_FORMATS = new Set(["plaintext", "markdown", "encrypted"]);
const MESSAGE_TYPES = new Set(["regular", "poll"]);
const EMOJI_PATTERN = /^[^\s]{1,64}$/u;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseNonNegativeInt(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  assert(!Number.isNaN(parsed) && parsed >= 0, `${fieldName} must be a non-negative integer.`, 422);
  return parsed;
}

function parsePositiveInt(value, fieldName) {
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

function normalizeDistinctIds(userIds = [], fieldName = "userIds", options = {}) {
  assert(Array.isArray(userIds), `${fieldName} must be an array of user IDs.`, 422);

  const { rejectDuplicates = false } = options;

  const seen = new Set();
  const normalized = [];
  userIds.forEach((value) => {
    const id = normalizeRequiredString(value, fieldName.slice(0, -1) || "userId");
    if (seen.has(id)) {
      assert(!rejectDuplicates, `${fieldName} contains duplicate user IDs.`, 422);
      return;
    }

    seen.add(id);
    normalized.push(id);
  });

  return normalized;
}

function normalizeConversationType(value) {
  const normalized = normalizeRequiredString(value, "type").toLowerCase();
  assert(CONVERSATION_TYPES.has(normalized), "type is invalid.", 422);
  return normalized;
}

function normalizeMessageFormat(value, fallback = "plaintext") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  assert(MESSAGE_FORMATS.has(normalized), "format is invalid.", 422);
  return normalized;
}

function normalizeAttachments(value) {
  if (value === undefined) {
    return [];
  }

  assert(Array.isArray(value), "attachments must be an array.", 422);
  return value.map((attachment, index) => {
    assert(isPlainObject(attachment), `attachments[${index}] is invalid.`, 422);

    const fileId = normalizeRequiredString(attachment.fileId, `attachments[${index}].fileId`);
    const filename = normalizeRequiredString(attachment.filename, `attachments[${index}].filename`);
    const mimeType = normalizeRequiredString(attachment.mimeType, `attachments[${index}].mimeType`);
    const size = Number(attachment.size);
    assert(Number.isFinite(size) && size >= 0, `attachments[${index}].size is invalid.`, 422);

    return {
      fileId,
      filename,
      mimeType,
      size,
      url: attachment.url || `/api/v1/files/${fileId}/download`,
    };
  });
}

function normalizeMentions(value) {
  if (value === undefined) {
    return [];
  }

  return normalizeDistinctIds(value, "mentions");
}

function normalizeEncryption(value, format) {
  if (value === undefined || value === null) {
    return null;
  }

  assert(format === "encrypted", "encryption metadata is only allowed for encrypted messages.", 422);
  assert(isPlainObject(value), "encryption is invalid.", 422);

  const protocol = normalizeRequiredString(value.protocol, "encryption.protocol");
  const senderKeyId = normalizeRequiredString(value.senderKeyId, "encryption.senderKeyId");
  const sessionId = normalizeRequiredString(value.sessionId, "encryption.sessionId");
  const messageIndex = parsePositiveInt(value.messageIndex, "encryption.messageIndex");

  return {
    protocol,
    senderKeyId,
    sessionId,
    messageIndex,
  };
}

function normalizeBooleanQuery(value, fieldName) {
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

function toParticipant(row) {
  return {
    userId: row.user_id,
    username: row.username,
    name: row.name,
    avatar: row.avatar,
  };
}

function toLastMessage(row) {
  if (!row?.last_message_id) {
    return null;
  }

  return {
    id: row.last_message_id,
    body: row.last_message_body,
    senderId: row.last_message_sender_id,
    createdAt: row.last_message_created_at,
  };
}

function formatAttachment(attachment) {
  if (!attachment) {
    return null;
  }

  return {
    fileId: attachment.fileId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: Number(attachment.size || 0),
    url: attachment.url || `/api/v1/files/${attachment.fileId}/download`,
  };
}

function createReactionMap(rows = []) {
  const reactionMap = new Map();
  rows.forEach((row) => {
    if (!reactionMap.has(row.message_id)) {
      reactionMap.set(row.message_id, []);
    }

    reactionMap.get(row.message_id).push({
      emoji: row.emoji,
      count: Number(row.count || 0),
      users: Array.isArray(row.users) ? row.users : [],
    });
  });

  return reactionMap;
}

function toMessage(row, reactions = []) {
  return {
    id: row.id,
    body: row.body,
    format: row.format,
    sender: {
      id: row.sender_id,
      username: row.sender_username,
      name: row.sender_name,
      avatar: row.sender_avatar,
    },
    targetType: row.target_type,
    targetId: row.target_type === "channel" ? row.channel_id : row.conversation_id,
    threadParentId: row.thread_parent_id,
    threadReplyCount: Number(row.thread_reply_count || 0),
    replyTo: row.reply_to_message_id,
    attachments: Array.isArray(row.attachments) ? row.attachments.map(formatAttachment) : [],
    mentions: Array.isArray(row.mentions) ? row.mentions : [],
    reactions,
    pinned: Boolean(row.is_pinned),
    edited: Boolean(row.edited),
    editedAt: row.edited_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.encryption ? { encryption: row.encryption } : {}),
  };
}

function buildHighlights(body, query) {
  if (!query || !body) {
    return [];
  }

  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (!tokens.length) {
    return [];
  }

  const lowerBody = body.toLowerCase();
  for (const token of tokens) {
    const index = lowerBody.indexOf(token.toLowerCase());
    if (index >= 0) {
      const start = Math.max(0, index - 30);
      const end = Math.min(body.length, index + token.length + 30);
      const prefix = start > 0 ? "..." : "";
      const suffix = end < body.length ? "..." : "";
      const snippet = `${prefix}${body.slice(start, end)}${suffix}`;
      return [snippet];
    }
  }

  return [];
}

function createDmKey(userA, userB) {
  return [userA, userB].sort().join("::");
}

async function getChannelAccessContext(authUser, channelId, client = db, options = {}) {
  const { allowAdminBypassPrivateMembership = false } = options;
  const accessContext = await getAccessContext(authUser, client);
  const channel = await channelModel.findById(channelId, client);
  assert(channel, "Resource not found.", 404);
  assertOrgAccess(channel.org_id, accessContext);

  const membership = await channelModel.findMembership(channelId, authUser.id, client);
  if (channel.type === "private") {
    const adminBypass = allowAdminBypassPrivateMembership
      && (accessContext.isSuperAdmin || accessContext.isOrgAdmin);
    assert(membership || adminBypass, "You do not have permission to perform this action.", 403);
  }

  return {
    accessContext,
    channel,
    membership,
  };
}

async function getConversationContext(authUser, conversationId, client = db, options = {}) {
  const { allowAdminBypassParticipant = false } = options;
  const conversation = await messagingModel.findConversationById(conversationId, client);
  assert(conversation, "Resource not found.", 404);

  const participant = await messagingModel.findConversationParticipant(conversationId, authUser.id, client);
  let accessContext = null;

  if (!participant && allowAdminBypassParticipant) {
    accessContext = await getAccessContext(authUser, client);
  }

  const adminBypass = Boolean(accessContext && (accessContext.isSuperAdmin || accessContext.isOrgAdmin));
  assert(participant || adminBypass, "You do not have permission to perform this action.", 403);

  return {
    conversation,
    participant,
    accessContext,
  };
}

function canManageConversationParticipant(conversation, participant, authUserId, accessContext = null) {
  return Boolean(
    conversation.type === "group"
      && (
        participant?.role === "admin"
        || conversation.created_by === authUserId
        || accessContext?.isSuperAdmin
        || accessContext?.isOrgAdmin
      )
  );
}

async function getConversationParticipantManagementContext(authUser, conversationId, client = db) {
  const conversation = await messagingModel.findConversationById(conversationId, client);
  assert(conversation, "Resource not found.", 404);

  const accessContext = await getAccessContext(authUser, client);
  const participant = await messagingModel.findConversationParticipant(conversationId, authUser.id, client);
  const canManage = canManageConversationParticipant(conversation, participant, authUser.id, accessContext);

  assert(canManage, "You do not have permission to perform this action.", 403);

  return {
    conversation,
    participant,
    accessContext,
  };
}

function canModerateChannel(accessContext, membership) {
  return Boolean(
    accessContext.isSuperAdmin
      || accessContext.isOrgAdmin
      || membership?.role === "admin"
      || membership?.role === "moderator"
  );
}

function canSendToAnnouncement(accessContext, membership) {
  return Boolean(
    accessContext.isSuperAdmin
      || accessContext.isOrgAdmin
      || membership?.role === "admin"
      || membership?.role === "moderator"
  );
}

async function buildConversationResponse(authUser, conversation, client = db, options = {}) {
  const participantRows = await messagingModel.listConversationParticipants([conversation.id], client);
  const participants = participantRows
    .filter((row) => options.includeSelf !== false || row.user_id !== authUser.id)
    .map(toParticipant);

  const latestRows = await messagingModel.listMessages(
    {
      targetType: "conversation",
      targetId: conversation.id,
      limit: 1,
      includeThreadReplies: true,
    },
    client
  );
  const current = latestRows[0] || null;

  return {
    conversation: {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      participants,
      e2ee: Boolean(conversation.e2ee),
      disappearingTimer: Number(conversation.disappearing_timer || 0),
      lastMessage: current
        ? {
          id: current.id,
          body: current.body,
          senderId: current.sender_id,
          createdAt: current.created_at,
        }
        : null,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    },
  };
}

async function buildMessagesResponse(rows, query = null, options = {}) {
  const limit = options.limit || rows.length;
  const hasMore = rows.length > limit;
  const normalizedRows = hasMore ? rows.slice(0, limit) : rows.slice();
  const orderedRows = options.reverse ? normalizedRows.reverse() : normalizedRows;
  const reactions = await messagingModel.listReactionSummary(orderedRows.map((row) => row.id));
  const reactionMap = createReactionMap(reactions);

  const messages = orderedRows.map((row) => {
    const message = toMessage(row, reactionMap.get(row.id) || []);
    if (query) {
      message.highlights = buildHighlights(message.body, query);
    }
    return message;
  });

  return {
    messages,
    hasMore,
  };
}

async function buildSingleMessageResponse(messageRow) {
  const reactions = await messagingModel.listReactionSummary([messageRow.id]);
  const reactionMap = createReactionMap(reactions);
  return {
    message: toMessage(messageRow, reactionMap.get(messageRow.id) || []),
  };
}

async function resolveTargetAudience(targetType, targetId, client = db) {
  if (targetType === "channel") {
    return messagingModel.listChannelMemberUserIds(targetId, client);
  }

  const participants = await messagingModel.listConversationParticipants([targetId], client);
  return participants.map((participant) => participant.user_id);
}

async function listConversations(authUser, query) {
  const limit = parseLimit(query.limit, 30, 100);
  const offset = parseNonNegativeInt(query.offset, 0, "offset");
  const type = query.type ? normalizeConversationType(query.type) : null;
  const search = normalizeOptionalString(query.search);

  const result = await messagingModel.listConversations(authUser.id, {
    type,
    search,
    limit,
    offset,
  });

  const participantRows = await messagingModel.listConversationParticipants(
    result.conversations.map((row) => row.id)
  );

  const participantMap = new Map();
  participantRows.forEach((row) => {
    if (!participantMap.has(row.conversation_id)) {
      participantMap.set(row.conversation_id, []);
    }

    participantMap.get(row.conversation_id).push(row);
  });

  return {
    conversations: result.conversations.map((row) => ({
      id: row.id,
      type: row.type,
      ...(row.name ? { name: row.name } : {}),
      participants: (participantMap.get(row.id) || [])
        .filter((participant) => participant.user_id !== authUser.id)
        .map(toParticipant),
      lastMessage: toLastMessage(row),
    })),
    totalCount: result.totalCount,
    limit,
    offset,
  };
}

async function getConversation(authUser, conversationId) {
  const { conversation } = await getConversationContext(authUser, conversationId);
  return buildConversationResponse(authUser, conversation, db, { includeSelf: true });
}

async function createConversation(authUser, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const conversationPayload = isPlainObject(payload?.conversation) ? payload.conversation : null;
    assert(conversationPayload, "conversation is required.", 422);

    const type = normalizeConversationType(conversationPayload.type);
    const participantIds = normalizeDistinctIds(
      conversationPayload.participantIds || [],
      "participantIds",
      { rejectDuplicates: true }
    )
      .filter((userId) => userId !== authUser.id);

    if (type === "dm") {
      assert(participantIds.length === 1, "participantIds must include exactly one other user for direct messages.", 422);
    }

    if (type === "group") {
      assert(participantIds.length >= 1, "participantIds must include at least one user for group conversations.", 422);
    }

    const users = await messagingModel.findUsersByIds([authUser.id, ...participantIds], client);
    const userMap = new Map(users.map((user) => [user.id, user]));
    participantIds.forEach((userId) => {
      assert(userMap.has(userId), "Resource not found.", 404);
    });

    if (type === "dm") {
      const dmKey = createDmKey(authUser.id, participantIds[0]);
      const existing = await messagingModel.findConversationByDmKey(dmKey, client);
      if (existing) {
        await client.query("COMMIT");
        return {
          response: await buildConversationResponse(authUser, existing, client, { includeSelf: true }),
          created: false,
        };
      }

      const conversationId = generateId("conv");
      await messagingModel.createConversation(
        {
          id: conversationId,
          type: "dm",
          name: null,
          createdBy: authUser.id,
          e2ee: true,
          disappearingTimer: 0,
          dmKey,
        },
        client
      );

      await messagingModel.upsertConversationParticipant(
        { conversationId, userId: authUser.id, role: "admin", addedBy: authUser.id },
        client
      );
      await messagingModel.upsertConversationParticipant(
        { conversationId, userId: participantIds[0], role: "admin", addedBy: authUser.id },
        client
      );

      const created = await messagingModel.findConversationById(conversationId, client);
      await client.query("COMMIT");
      return {
        response: await buildConversationResponse(authUser, created, db, { includeSelf: true }),
        created: true,
      };
    }

    const conversationId = generateId("conv");
    await messagingModel.createConversation(
      {
        id: conversationId,
        type: "group",
        name: normalizeOptionalString(conversationPayload.name),
        createdBy: authUser.id,
        e2ee: false,
        disappearingTimer: 0,
        dmKey: null,
      },
      client
    );

    await messagingModel.upsertConversationParticipant(
      { conversationId, userId: authUser.id, role: "admin", addedBy: authUser.id },
      client
    );

    for (const userId of participantIds) {
      await messagingModel.upsertConversationParticipant(
        { conversationId, userId, role: "member", addedBy: authUser.id },
        client
      );
    }

    const created = await messagingModel.findConversationById(conversationId, client);
    await client.query("COMMIT");
    return {
      response: await buildConversationResponse(authUser, created, db, { includeSelf: true }),
      created: true,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function addConversationParticipants(authUser, conversationId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const { conversation } = await getConversationParticipantManagementContext(authUser, conversationId, client);
    assert(conversation.type === "group", "You do not have permission to perform this action.", 403);

    const userIds = normalizeDistinctIds(payload?.userIds || [], "userIds", { rejectDuplicates: true });
    assert(userIds.length > 0, "userIds must be a non-empty array of user IDs.", 422);

    const existingParticipants = await messagingModel.listConversationParticipants([conversationId], client);
    const existingParticipantIds = new Set(existingParticipants.map((row) => row.user_id));
    const duplicateParticipantIds = userIds.filter((userId) => existingParticipantIds.has(userId));
    assert(!duplicateParticipantIds.length, "One or more users are already participants in the conversation.", 422);

    const users = await messagingModel.findUsersByIds(userIds, client);
    const userMap = new Map(users.map((user) => [user.id, user]));
    userIds.forEach((userId) => {
      assert(userMap.has(userId), "Resource not found.", 404);
    });

    for (const userId of userIds) {
      await messagingModel.upsertConversationParticipant(
        { conversationId, userId, role: "member", addedBy: authUser.id },
        client
      );
    }

    await messagingModel.touchConversation(conversationId, client);
    const updated = await messagingModel.findConversationById(conversationId, client);
    const audience = await resolveTargetAudience("conversation", conversationId, client);
    await client.query("COMMIT");

    broadcastToUsers(audience, "conversation:participants_added", {
      conversationId,
      userIds,
    });

    return buildConversationResponse(authUser, updated, db, { includeSelf: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function removeConversationParticipant(authUser, conversationId, userId) {
  const client = await db.pool.connect();
  const normalizedUserId = normalizeRequiredString(userId, "userId");

  try {
    await client.query("BEGIN");

    const { conversation } = await getConversationParticipantManagementContext(authUser, conversationId, client);
    assert(conversation.type === "group", "You do not have permission to perform this action.", 403);

    const targetParticipant = await messagingModel.findConversationParticipant(conversationId, normalizedUserId, client);
    assert(targetParticipant, "Resource not found.", 404);

    const existingParticipants = await messagingModel.listConversationParticipants([conversationId], client);
    const remainingParticipants = existingParticipants.filter((row) => row.user_id !== normalizedUserId);

    let fallbackAdmin = remainingParticipants.find((participant) => participant.role === "admin") || null;

    if (targetParticipant.role === "admin") {
      const adminCount = await messagingModel.countConversationAdmins(conversationId, client);
      if (adminCount <= 1 && remainingParticipants.length) {
        fallbackAdmin = remainingParticipants[0];
      }
    }

    const removedParticipant = await messagingModel.softRemoveConversationParticipant(conversationId, normalizedUserId, client);
    assert(removedParticipant, "Resource not found.", 404);

    if (targetParticipant.role === "admin" && fallbackAdmin && fallbackAdmin.role !== "admin") {
      await messagingModel.updateConversationParticipantRole(conversationId, fallbackAdmin.user_id, "admin", client);
    }

    if (remainingParticipants.length) {
      if (conversation.created_by === normalizedUserId) {
        const nextCreatorId = (fallbackAdmin && fallbackAdmin.user_id) || remainingParticipants[0].user_id;
        await messagingModel.updateConversation(
          conversationId,
          {
            createdBy: nextCreatorId,
          },
          client
        );
      } else {
        await messagingModel.touchConversation(conversationId, client);
      }
    } else {
      await messagingModel.updateConversation(
        conversationId,
        {
          deletedAt: new Date().toISOString(),
          deletedBy: authUser.id,
          ...(conversation.created_by === normalizedUserId ? { createdBy: null } : {}),
        },
        client
      );
    }

    const audience = await resolveTargetAudience("conversation", conversationId, client);
    await client.query("COMMIT");

    broadcastToUsers([...audience, normalizedUserId], "conversation:participant_removed", {
      conversationId,
      userId: normalizedUserId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getMessageCursor(messageId, client = db) {
  const message = await messagingModel.findMessageById(messageId, client);
  assert(message, "Resource not found.", 404);
  return {
    targetType: message.target_type,
    targetId: message.target_type === "channel" ? message.channel_id : message.conversation_id,
    id: message.id,
    created_at: message.created_at,
  };
}

async function assertMessageAccess(authUser, messageRow, client = db, options = {}) {
  const {
    allowAdminBypassPrivateMembership = false,
    allowAdminBypassConversationParticipant = false,
  } = options;
  assert(messageRow, "Resource not found.", 404);

  if (messageRow.target_type === "channel") {
    const context = await getChannelAccessContext(authUser, messageRow.channel_id, client, {
      allowAdminBypassPrivateMembership,
    });
    return {
      kind: "channel",
      context,
    };
  }

  const context = await getConversationContext(authUser, messageRow.conversation_id, client, {
    allowAdminBypassParticipant: allowAdminBypassConversationParticipant,
  });
  return {
    kind: "conversation",
    context,
  };
}

async function listChannelMessages(authUser, channelId, query) {
  await getChannelAccessContext(authUser, channelId);

  const limit = parseLimit(query.limit, 50, 100);
  const beforeCursor = query.before ? await getMessageCursor(query.before) : null;
  const afterCursor = query.after ? await getMessageCursor(query.after) : null;
  assert(!(beforeCursor && afterCursor), "before and after cannot be used together.", 422);
  if (beforeCursor) {
    assert(beforeCursor.targetType === "channel" && beforeCursor.targetId === channelId, "before must belong to the same target.", 422);
  }
  if (afterCursor) {
    assert(afterCursor.targetType === "channel" && afterCursor.targetId === channelId, "after must belong to the same target.", 422);
  }

  const rows = await messagingModel.listMessages({
    targetType: "channel",
    targetId: channelId,
    limit,
    beforeCursor,
    afterCursor,
  });

  return buildMessagesResponse(rows, null, {
    limit,
    reverse: !afterCursor,
  });
}

async function listConversationMessages(authUser, conversationId, query) {
  await getConversationContext(authUser, conversationId);

  const limit = parseLimit(query.limit, 50, 100);
  const beforeCursor = query.before ? await getMessageCursor(query.before) : null;
  const afterCursor = query.after ? await getMessageCursor(query.after) : null;
  assert(!(beforeCursor && afterCursor), "before and after cannot be used together.", 422);
  if (beforeCursor) {
    assert(beforeCursor.targetType === "conversation" && beforeCursor.targetId === conversationId, "before must belong to the same target.", 422);
  }
  if (afterCursor) {
    assert(afterCursor.targetType === "conversation" && afterCursor.targetId === conversationId, "after must belong to the same target.", 422);
  }

  const rows = await messagingModel.listMessages({
    targetType: "conversation",
    targetId: conversationId,
    limit,
    beforeCursor,
    afterCursor,
  });

  return buildMessagesResponse(rows, null, {
    limit,
    reverse: !afterCursor,
  });
}

async function createMessageForTarget(authUser, target, payload, extra = {}) {
  const messagePayload = isPlainObject(payload?.message) ? payload.message : null;
  assert(messagePayload, "message is required.", 422);

  const body = normalizeRequiredString(messagePayload.body, "body");
  const format = normalizeMessageFormat(messagePayload.format, "plaintext");
  const attachments = normalizeAttachments(messagePayload.attachments);
  const mentions = normalizeMentions(messagePayload.mentions);
  const encryption = normalizeEncryption(messagePayload.encryption, format);
  const replyToMessageId = normalizeOptionalString(messagePayload.replyTo);
  let threadParentId = extra.threadParentId || null;

  if (target.kind === "channel") {
    assert(format !== "encrypted", "format is invalid.", 422);
  }

  if (target.kind === "conversation" && !target.context.conversation.e2ee) {
    assert(format !== "encrypted", "format is invalid.", 422);
  }

  if (target.kind === "conversation" && target.context.conversation.e2ee) {
    assert(format === "encrypted", "Encrypted conversations require format to be encrypted.", 422);
    assert(encryption, "encryption metadata is required for encrypted conversations.", 422);
  }

  if (
    target.kind === "channel"
    && target.context.channel.type === "announcement"
    && !extra.allowThreadReplyInAnnouncement
  ) {
    assert(canSendToAnnouncement(target.context.accessContext, target.context.membership), "You do not have permission to perform this action.", 403);
  }

  if (replyToMessageId) {
    const replyTarget = await messagingModel.findMessageById(replyToMessageId);
    assert(replyTarget, "Resource not found.", 404);
    assert(replyTarget.target_type === target.targetType, "replyTo must belong to the same target.", 422);
    if (target.targetType === "channel") {
      assert(replyTarget.channel_id === target.targetId, "replyTo must belong to the same target.", 422);
    } else {
      assert(replyTarget.conversation_id === target.targetId, "replyTo must belong to the same target.", 422);
    }

    const resolvedThreadParentId = replyTarget.thread_parent_id || replyTarget.id;
    if (threadParentId) {
      assert(resolvedThreadParentId === threadParentId, "replyTo must belong to the same thread.", 422);
    } else {
      threadParentId = resolvedThreadParentId;
    }
  }

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const messageId = generateId("msg");
    const createdAt = new Date().toISOString();
    await messagingModel.createMessage(
      {
        id: messageId,
        body,
        format,
        messageType: extra.messageType || "regular",
        senderId: authUser.id,
        targetType: target.targetType,
        channelId: target.targetType === "channel" ? target.targetId : null,
        conversationId: target.targetType === "conversation" ? target.targetId : null,
        threadParentId,
        replyToMessageId,
        attachments,
        mentions,
        encryption,
        pollId: extra.pollId || null,
      },
      client
    );

    await messagingModel.createMessageEdit(
      {
        messageId,
        body,
        editedAt: createdAt,
      },
      client
    );

    if (target.targetType === "conversation") {
      await messagingModel.touchConversation(target.targetId, client);
    }

    const created = await messagingModel.findMessageById(messageId, client);
    const audience = await resolveTargetAudience(target.targetType, target.targetId, client);
    await client.query("COMMIT");

    const response = await buildSingleMessageResponse(created);
    broadcastToUsers(audience, "message:new", response.message);

    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function sendChannelMessage(authUser, channelId, payload) {
  const context = await getChannelAccessContext(authUser, channelId);
  const target = {
    kind: "channel",
    targetType: "channel",
    targetId: channelId,
    context,
  };

  return createMessageForTarget(authUser, target, payload);
}

async function sendConversationMessage(authUser, conversationId, payload) {
  const context = await getConversationContext(authUser, conversationId);
  const target = {
    kind: "conversation",
    targetType: "conversation",
    targetId: conversationId,
    context,
  };

  return createMessageForTarget(authUser, target, payload);
}

async function getMessage(authUser, messageId) {
  const message = await messagingModel.findMessageById(messageId);
  await assertMessageAccess(authUser, message);
  return buildSingleMessageResponse(message);
}

async function updateMessage(authUser, messageId, payload) {
  const messagePayload = isPlainObject(payload?.message) ? payload.message : null;
  assert(messagePayload, "message is required.", 422);
  const body = normalizeRequiredString(messagePayload.body, "body");

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const message = await messagingModel.findMessageById(messageId, client);
    await assertMessageAccess(authUser, message, client);
    assert(message.sender_id === authUser.id, "You do not have permission to perform this action.", 403);

    const editedAt = new Date().toISOString();
    await messagingModel.updateMessage(
      messageId,
      {
        body,
        edited: true,
        editedAt,
      },
      client
    );

    await messagingModel.createMessageEdit(
      {
        messageId,
        body,
        editedAt,
      },
      client
    );

    const updated = await messagingModel.findMessageById(messageId, client);
    const audience = await resolveTargetAudience(updated.target_type, updated.target_type === "channel" ? updated.channel_id : updated.conversation_id, client);
    await client.query("COMMIT");

    const response = await buildSingleMessageResponse(updated);
    broadcastToUsers(audience, "message:edited", response.message);
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMessage(authUser, messageId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const message = await messagingModel.findMessageById(messageId, client);
    const access = await assertMessageAccess(authUser, message, client, {
      allowAdminBypassPrivateMembership: true,
      allowAdminBypassConversationParticipant: true,
    });

    let allowed = message.sender_id === authUser.id;
    if (!allowed && access.kind === "channel") {
      allowed = canModerateChannel(access.context.accessContext, access.context.membership);
    }
    if (!allowed && access.kind === "conversation") {
      allowed = access.context.conversation.type === "group" && access.context.participant?.role === "admin";
    }

    if (!allowed && access.kind === "conversation") {
      allowed = Boolean(access.context.accessContext?.isSuperAdmin || access.context.accessContext?.isOrgAdmin);
    }

    assert(allowed, "You do not have permission to perform this action.", 403);

    await messagingModel.updateMessage(
      messageId,
      {
        deletedAt: new Date().toISOString(),
        deletedBy: authUser.id,
      },
      client
    );

    const audience = await resolveTargetAudience(message.target_type, message.target_type === "channel" ? message.channel_id : message.conversation_id, client);
    await client.query("COMMIT");

    broadcastToUsers(audience, "message:deleted", {
      messageId,
      targetType: message.target_type,
      targetId: message.target_type === "channel" ? message.channel_id : message.conversation_id,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getMessageEditHistory(authUser, messageId) {
  const message = await messagingModel.findMessageById(messageId);
  await assertMessageAccess(authUser, message);

  const edits = await messagingModel.listMessageEdits(messageId);
  return {
    edits: edits.map((edit) => ({
      body: edit.body,
      editedAt: edit.edited_at,
    })),
  };
}

async function listThreadMessages(authUser, messageId, query) {
  const message = await messagingModel.findMessageById(messageId)
    || await messagingModel.findMessageById(messageId, db, { includeDeleted: true });
  await assertMessageAccess(authUser, message);

  const limit = parseLimit(query.limit, 50, 100);
  const offset = parseNonNegativeInt(query.offset, 0, "offset");
  const rows = await messagingModel.listMessages({
    targetType: message.target_type,
    targetId: message.target_type === "channel" ? message.channel_id : message.conversation_id,
    threadParentId: message.id,
    sort: "asc",
    limit,
    offset,
  });

  return buildMessagesResponse(rows, null, {
    limit,
    reverse: false,
  });
}

async function replyInThread(authUser, messageId, payload) {
  const parent = await messagingModel.findMessageById(messageId);
  await assertMessageAccess(authUser, parent);

  const target = parent.target_type === "channel"
    ? {
      kind: "channel",
      targetType: "channel",
      targetId: parent.channel_id,
      context: await getChannelAccessContext(authUser, parent.channel_id),
    }
    : {
      kind: "conversation",
      targetType: "conversation",
      targetId: parent.conversation_id,
      context: await getConversationContext(authUser, parent.conversation_id),
    };

  return createMessageForTarget(authUser, target, payload, {
    threadParentId: parent.id,
    allowThreadReplyInAnnouncement: true,
  });
}

async function addReaction(authUser, messageId, payload) {
  const emoji = normalizeRequiredString(payload?.emoji, "emoji");
  assert(EMOJI_PATTERN.test(emoji), "emoji is invalid.", 422);

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const message = await messagingModel.findMessageById(messageId, client);
    await assertMessageAccess(authUser, message, client);
    await messagingModel.addReaction(messageId, authUser.id, emoji, client);

    const audience = await resolveTargetAudience(message.target_type, message.target_type === "channel" ? message.channel_id : message.conversation_id, client);
    const summaryRows = await messagingModel.listReactionSummary([messageId], client);
    await client.query("COMMIT");

    const reactions = createReactionMap(summaryRows).get(messageId) || [];
    broadcastToUsers(audience, "reaction:added", {
      messageId,
      reactions,
    });

    return { reactions };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function removeReaction(authUser, messageId, emoji) {
  const normalizedEmoji = normalizeRequiredString(emoji, "emoji");
  assert(EMOJI_PATTERN.test(normalizedEmoji), "emoji is invalid.", 422);

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const message = await messagingModel.findMessageById(messageId, client);
    await assertMessageAccess(authUser, message, client);
    const removedReaction = await messagingModel.removeReaction(messageId, authUser.id, normalizedEmoji, client);
    assert(removedReaction, "Resource not found.", 404);

    const audience = await resolveTargetAudience(message.target_type, message.target_type === "channel" ? message.channel_id : message.conversation_id, client);
    await client.query("COMMIT");

    broadcastToUsers(audience, "reaction:removed", {
      messageId,
      emoji: normalizedEmoji,
      userId: authUser.id,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listPinnedMessages(authUser, channelId) {
  await getChannelAccessContext(authUser, channelId);
  const rows = await messagingModel.listMessages({
    targetType: "channel",
    targetId: channelId,
    pinnedOnly: true,
    limit: 100,
    includeThreadReplies: true,
  });

  return buildMessagesResponse(rows, null, {
    limit: 100,
    reverse: true,
  });
}

async function pinMessage(authUser, messageId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const message = await messagingModel.findMessageById(messageId, client);
    assert(message, "Resource not found.", 404);
    assert(message.target_type === "channel", "You do not have permission to perform this action.", 403);
    const access = await assertMessageAccess(authUser, message, client, {
      allowAdminBypassPrivateMembership: true,
    });
    assert(canModerateChannel(access.context.accessContext, access.context.membership), "You do not have permission to perform this action.", 403);

    await messagingModel.updateMessage(
      messageId,
      {
        isPinned: true,
        pinnedAt: new Date().toISOString(),
        pinnedBy: authUser.id,
      },
      client
    );

    const updated = await messagingModel.findMessageById(messageId, client);
    const audience = await resolveTargetAudience("channel", updated.channel_id, client);
    await client.query("COMMIT");

    const response = await buildSingleMessageResponse(updated);
    broadcastToUsers(audience, "message:pinned", response.message);
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function unpinMessage(authUser, messageId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const message = await messagingModel.findMessageById(messageId, client);
    assert(message, "Resource not found.", 404);
    assert(message.target_type === "channel", "You do not have permission to perform this action.", 403);
    const access = await assertMessageAccess(authUser, message, client, {
      allowAdminBypassPrivateMembership: true,
    });
    assert(canModerateChannel(access.context.accessContext, access.context.membership), "You do not have permission to perform this action.", 403);

    await messagingModel.updateMessage(
      messageId,
      {
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      },
      client
    );

    const audience = await resolveTargetAudience("channel", message.channel_id, client);
    await client.query("COMMIT");

    broadcastToUsers(audience, "message:unpinned", {
      messageId,
      channelId: message.channel_id,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listBookmarks(authUser, query) {
  const limit = parseLimit(query.limit, 30, 100);
  const offset = parseNonNegativeInt(query.offset, 0, "offset");
  const ids = await messagingModel.listBookmarkedMessageIds(authUser.id, limit, offset);
  const hasMore = ids.length > limit;
  const scopedIds = hasMore ? ids.slice(0, limit) : ids;
  const rows = await messagingModel.listMessagesByIds(scopedIds);
  const rowMap = new Map(rows.map((row) => [row.id, row]));

  const accessible = [];
  for (const messageId of scopedIds) {
    const row = rowMap.get(messageId);
    if (!row) {
      continue;
    }

    try {
      await assertMessageAccess(authUser, row);
      accessible.push(row);
    } catch (error) {
      // Ignore bookmarks that are no longer accessible.
    }
  }

  const reactions = await messagingModel.listReactionSummary(accessible.map((row) => row.id));
  const reactionMap = createReactionMap(reactions);

  return {
    messages: accessible.map((row) => toMessage(row, reactionMap.get(row.id) || [])),
    hasMore,
  };
}

async function addBookmark(authUser, payload) {
  const messageId = normalizeRequiredString(payload?.messageId, "messageId");
  const message = await messagingModel.findMessageById(messageId);
  await assertMessageAccess(authUser, message);
  await messagingModel.addBookmark(authUser.id, messageId);
  return { created: true };
}

async function removeBookmark(authUser, messageId) {
  const normalizedMessageId = normalizeRequiredString(messageId, "messageId");
  const removedBookmark = await messagingModel.removeBookmark(authUser.id, normalizedMessageId);
  assert(removedBookmark, "Resource not found.", 404);
}

function toPollResponse(poll, voteRows) {
  const counts = new Map();
  voteRows.forEach((vote) => {
    counts.set(vote.option_index, (counts.get(vote.option_index) || 0) + 1);
  });

  const totalVotes = voteRows.length;
  return {
    poll: {
      id: poll.id,
      channelId: poll.channel_id,
      messageId: poll.message_id,
      question: poll.question,
      options: (Array.isArray(poll.options) ? poll.options : []).map((text, index) => ({
        index,
        text,
        votes: counts.get(index) || 0,
      })),
      totalVotes,
      multipleChoice: Boolean(poll.multiple_choice),
      anonymous: Boolean(poll.anonymous),
      expiresAt: poll.expires_at,
      createdBy: poll.created_by,
      createdAt: poll.created_at,
    },
  };
}

async function createPoll(authUser, channelId, payload) {
  const context = await getChannelAccessContext(authUser, channelId);
  if (context.channel.type === "announcement") {
    assert(canSendToAnnouncement(context.accessContext, context.membership), "You do not have permission to perform this action.", 403);
  }

  const pollPayload = isPlainObject(payload?.poll) ? payload.poll : null;
  assert(pollPayload, "poll is required.", 422);

  const question = normalizeRequiredString(pollPayload.question, "question");
  assert(Array.isArray(pollPayload.options) && pollPayload.options.length >= 2, "options must contain at least two choices.", 422);
  const options = pollPayload.options.map((option, index) => normalizeRequiredString(option, `options[${index}]`));
  const multipleChoice = Boolean(pollPayload.multipleChoice);
  const anonymous = Boolean(pollPayload.anonymous);
  const expiresAt = normalizeOptionalString(pollPayload.expiresAt);
  if (expiresAt) {
    assert(!Number.isNaN(Date.parse(expiresAt)), "expiresAt is invalid.", 422);
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const messageId = generateId("msg");
    const pollId = generateId("poll");
    const createdAt = new Date().toISOString();

    await messagingModel.createMessage(
      {
        id: messageId,
        body: question,
        format: "plaintext",
        messageType: "poll",
        senderId: authUser.id,
        targetType: "channel",
        channelId,
        conversationId: null,
        threadParentId: null,
        replyToMessageId: null,
        attachments: [],
        mentions: [],
        encryption: null,
        pollId,
      },
      client
    );

    await messagingModel.createMessageEdit(
      {
        messageId,
        body: question,
        editedAt: createdAt,
      },
      client
    );

    await messagingModel.createPoll(
      {
        id: pollId,
        channelId,
        messageId,
        question,
        options,
        multipleChoice,
        anonymous,
        expiresAt,
        createdBy: authUser.id,
      },
      client
    );

    const poll = await messagingModel.findPollById(pollId, client);
    const audience = await resolveTargetAudience("channel", channelId, client);
    const message = await messagingModel.findMessageById(messageId, client);
    await client.query("COMMIT");

    const messageResponse = await buildSingleMessageResponse(message);
    broadcastToUsers(audience, "message:new", messageResponse.message);

    return toPollResponse(poll, []);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function voteOnPoll(authUser, pollId, payload) {
  const optionIndex = parsePositiveInt(payload?.optionIndex, "optionIndex");

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const poll = await messagingModel.findPollById(pollId, client);
    assert(poll, "Resource not found.", 404);
    await getChannelAccessContext(authUser, poll.channel_id, client);

    const options = Array.isArray(poll.options) ? poll.options : [];
    assert(optionIndex < options.length, "optionIndex is invalid.", 422);

    if (poll.expires_at) {
      assert(new Date(poll.expires_at).getTime() > Date.now(), "Poll has expired.", 422);
    }

    if (poll.multiple_choice) {
      await messagingModel.addMultiChoiceVote(pollId, authUser.id, optionIndex, client);
    } else {
      await messagingModel.replaceSingleChoiceVote(pollId, authUser.id, optionIndex, client);
    }

    const votes = await messagingModel.listPollVotes(pollId, client);
    const audience = await resolveTargetAudience("channel", poll.channel_id, client);
    await client.query("COMMIT");

    const response = toPollResponse(poll, votes);
    broadcastToUsers(audience, "poll:updated", response.poll);
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getPoll(authUser, pollId) {
  const poll = await messagingModel.findPollById(pollId);
  assert(poll, "Resource not found.", 404);
  await getChannelAccessContext(authUser, poll.channel_id);
  const votes = await messagingModel.listPollVotes(pollId);
  return toPollResponse(poll, votes);
}

async function searchMessages(authUser, query) {
  const accessContext = await getAccessContext(authUser);
  const limit = parseLimit(query.limit, 20, 100);
  const offset = parseNonNegativeInt(query.offset, 0, "offset");
  const q = normalizeRequiredString(query.q, "q");
  assert(!(query.channelId && query.conversationId), "channelId and conversationId cannot be used together.", 422);

  if (query.channelId) {
    await getChannelAccessContext(authUser, query.channelId);
  }

  if (query.conversationId) {
    const context = await getConversationContext(authUser, query.conversationId);
    assert(!context.conversation.e2ee, "Search is unavailable for encrypted conversations.", 422);
  }

  if (query.senderId) {
    await assertUserExists(query.senderId);
  }

  const from = normalizeOptionalString(query.from);
  const to = normalizeOptionalString(query.to);
  if (from) {
    assert(!Number.isNaN(Date.parse(from)), "from is invalid.", 422);
  }
  if (to) {
    assert(!Number.isNaN(Date.parse(to)), "to is invalid.", 422);
  }

  const rows = await messagingModel.searchMessages({
    userId: authUser.id,
    accessibleOrgIds: accessContext.accessibleOrgIds,
    q,
    channelId: normalizeOptionalString(query.channelId),
    conversationId: normalizeOptionalString(query.conversationId),
    senderId: normalizeOptionalString(query.senderId),
    from,
    to,
    hasAttachment: normalizeBooleanQuery(query.hasAttachment, "hasAttachment"),
    hasLink: normalizeBooleanQuery(query.hasLink, "hasLink"),
    isPinned: normalizeBooleanQuery(query.isPinned, "isPinned"),
    limit,
    offset,
  });

  return buildMessagesResponse(rows, q, {
    limit,
    reverse: false,
  });
}

module.exports = {
  listConversations,
  getConversation,
  createConversation,
  addConversationParticipants,
  removeConversationParticipant,
  listChannelMessages,
  listConversationMessages,
  sendChannelMessage,
  sendConversationMessage,
  getMessage,
  updateMessage,
  deleteMessage,
  getMessageEditHistory,
  listThreadMessages,
  replyInThread,
  addReaction,
  removeReaction,
  listPinnedMessages,
  pinMessage,
  unpinMessage,
  listBookmarks,
  addBookmark,
  removeBookmark,
  createPoll,
  voteOnPoll,
  getPoll,
  searchMessages,
};
