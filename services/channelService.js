const db = require("../config/db");
const channelModel = require("../models/channelModel");
const channelCategoryModel = require("../models/channelCategoryModel");
const { generateId } = require("../utils/id");
const {
  assert,
  getAccessContext,
  assertOrgAccess,
  assertOrganizationExists,
  assertUserExists,
} = require("./accessService");

const CHANNEL_TYPES = new Set(["public", "private", "announcement", "cross-org"]);
const MEMBER_ROLES = new Set(["admin", "moderator", "member"]);
const CREATE_CHANNEL_FIELDS = ["name", "type", "description", "categoryId", "topic", "memberIds", "e2ee"];
const UPDATE_CHANNEL_FIELDS = ["name", "description", "topic", "categoryId", "type"];

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

function normalizeRequiredString(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : "";
  assert(normalized, `${fieldName} is required.`, 422);
  return normalized;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeChannelType(value) {
  const normalized = normalizeRequiredString(value, "type").toLowerCase();
  assert(CHANNEL_TYPES.has(normalized), "type is invalid.", 422);
  return normalized;
}

function normalizeMemberRole(value) {
  const normalized = normalizeRequiredString(value, "role").toLowerCase();
  assert(MEMBER_ROLES.has(normalized), "role is invalid.", 422);
  return normalized;
}

function normalizeBooleanQuery(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  assert(false, `${fieldName} must be true or false.`, 422);
}

function normalizeDistinctUserIds(userIds = []) {
  assert(Array.isArray(userIds), "userIds must be an array of user IDs.", 422);

  const seen = new Set();
  const normalized = [];

  userIds.forEach((userId) => {
    const id = normalizeRequiredString(userId, "userId");
    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  });

  return normalized;
}

function assertAllowedKeys(value, allowedKeys, messagePrefix) {
  assert(isPlainObject(value), messagePrefix, 422);

  const allowed = new Set(allowedKeys);
  const invalidKeys = Object.keys(value).filter((key) => !allowed.has(key));
  assert(!invalidKeys.length, `${messagePrefix} Invalid fields: ${invalidKeys.join(", ")}.`, 422);
}

function toChannel(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    topic: row.topic,
    categoryId: row.category_id,
    orgId: row.org_id,
    memberCount: Number(row.member_count || 0),
    e2ee: Boolean(row.e2ee),
    slowModeInterval: Number(row.slow_mode_interval || 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toChannelListItem(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    memberCount: Number(row.member_count || 0),
    categoryId: row.category_id,
    topic: row.topic,
  };
}

function toMemberUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    designation: row.designation,
    department: row.department,
    avatar: row.avatar,
    status: row.status,
  };
}

function toMemberResponse(row) {
  return {
    member: {
      userId: row.id,
      role: row.channel_role,
      joinedAt: row.joined_at,
      user: {
        id: row.id,
        username: row.username,
        name: row.name,
        designation: row.designation,
        department: row.department,
        avatar: row.avatar,
        status: row.status,
      },
    },
  };
}

function canManageChannel(accessContext, membership) {
  return Boolean(accessContext.isOrgAdmin || accessContext.isSuperAdmin || membership?.role === "admin");
}

function isChannelAdmin(membership) {
  return membership?.role === "admin";
}

function canInviteToChannel(membership) {
  return Boolean(membership && (membership.role === "admin" || membership.role === "moderator"));
}

function assertChannelVisibility(channel, membership) {
  if (channel.type !== "private") {
    return;
  }

  assert(membership, "You do not have permission to perform this action.", 403);
}

async function assertCategoryInOrg(categoryId, orgId, client) {
  if (!categoryId) {
    return null;
  }

  const category = await channelCategoryModel.findById(categoryId, orgId, client);
  assert(category, "Category not found.", 404);
  return category;
}

async function assertUsersEligibleForChannel(userIds, orgId, channelType, client) {
  const uniqueIds = normalizeDistinctUserIds(userIds);

  for (const userId of uniqueIds) {
    const user = await assertUserExists(userId, client);
    if (channelType !== "cross-org") {
      assert(user.org_id === orgId, "User is not part of this organization.", 422);
    }
  }

  return uniqueIds;
}

async function getChannelContext(authUser, channelId, client = db) {
  const accessContext = await getAccessContext(authUser, client);
  const channel = await channelModel.findById(channelId, client);
  assert(channel, "Resource not found.", 404);
  assertOrgAccess(channel.org_id, accessContext);
  const membership = await channelModel.findMembership(channelId, authUser.id, client);

  return {
    accessContext,
    channel,
    membership,
  };
}

async function assertNotRemovingLastAdmin(channelId, userId, nextRole, client) {
  const membership = await channelModel.findMembership(channelId, userId, client);
  if (!membership || membership.role !== "admin" || nextRole === "admin") {
    return;
  }

  const adminCount = await channelModel.countMembersByRole(channelId, "admin", client);
  assert(adminCount > 1, "Channel must have at least one admin.", 422);
}

async function listChannels(authUser, orgId, query) {
  const accessContext = await getAccessContext(authUser);
  await assertOrganizationExists(orgId);
  assertOrgAccess(orgId, accessContext);

  if (query.categoryId) {
    await assertCategoryInOrg(query.categoryId, orgId, db);
  }

  const limit = parseNonNegativeInt(query.limit, 50, "limit");
  const offset = parseNonNegativeInt(query.offset, 0, "offset");
  const joined = normalizeBooleanQuery(query.joined, "joined");
  const type = query.type ? normalizeChannelType(query.type) : null;

  const result = await channelModel.listChannels(orgId, {
    search: normalizeOptionalString(query.search),
    type,
    categoryId: normalizeOptionalString(query.categoryId),
    joined,
    userId: authUser.id,
    bypassPrivateRestriction: false,
    limit,
    offset,
  });

  return {
    channels: result.channels.map(toChannelListItem),
    totalCount: result.totalCount,
    limit,
    offset,
  };
}

async function getChannel(authUser, channelId) {
  const { channel, membership } = await getChannelContext(authUser, channelId);
  assertChannelVisibility(channel, membership);

  return {
    channel: toChannel(channel),
  };
}

async function createChannel(authUser, orgId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const channelPayload = isPlainObject(payload?.channel) ? payload.channel : null;
    assert(channelPayload, "channel is required.", 422);
    assertAllowedKeys(channelPayload, CREATE_CHANNEL_FIELDS, "channel contains invalid fields.");

    const name = normalizeRequiredString(channelPayload.name, "name");
    const type = normalizeChannelType(channelPayload.type);
    const hasMemberIds = Object.prototype.hasOwnProperty.call(channelPayload, "memberIds");
    const memberIds = Object.prototype.hasOwnProperty.call(channelPayload, "memberIds")
      ? await assertUsersEligibleForChannel(channelPayload.memberIds, orgId, type, client)
      : [];

    if (hasMemberIds) {
      assert(type === "private", "memberIds is only supported for private channels.", 422);
    }

    const hasE2ee = Object.prototype.hasOwnProperty.call(channelPayload, "e2ee");
    const e2ee = hasE2ee ? Boolean(channelPayload.e2ee) : false;
    if (hasE2ee) {
      assert(type === "private", "e2ee is only supported for private channels.", 422);
    }

    if (type === "announcement" || type === "cross-org") {
      assert(accessContext.isOrgAdmin || accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);
    }

    const categoryId = normalizeOptionalString(channelPayload.categoryId);
    if (categoryId) {
      await assertCategoryInOrg(categoryId, orgId, client);
    }

    const channelId = generateId("ch");
    await channelModel.createChannel(
      {
        id: channelId,
        orgId,
        categoryId,
        name,
        type,
        description: normalizeOptionalString(channelPayload.description),
        topic: normalizeOptionalString(channelPayload.topic),
        e2ee,
        slowModeInterval: 0,
        createdBy: authUser.id,
      },
      client
    );

    await channelModel.upsertChannelMember(
      {
        channelId,
        userId: authUser.id,
        role: "admin",
        invitedBy: authUser.id,
      },
      client
    );

    if (type === "private") {
      for (const memberId of memberIds) {
        const role = memberId === authUser.id ? "admin" : "member";
        await channelModel.upsertChannelMember(
          {
            channelId,
            userId: memberId,
            role,
            invitedBy: authUser.id,
          },
          client
        );
      }
    }

    const created = await channelModel.findById(channelId, client);
    await client.query("COMMIT");

    return {
      channel: toChannel(created),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateChannel(authUser, channelId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const { accessContext, channel, membership } = await getChannelContext(authUser, channelId, client);
    assert(canManageChannel(accessContext, membership), "You do not have permission to perform this action.", 403);

    const channelPayload = isPlainObject(payload?.channel) ? payload.channel : null;
    assert(channelPayload, "channel is required.", 422);
    assertAllowedKeys(channelPayload, UPDATE_CHANNEL_FIELDS, "channel contains invalid fields.");

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(channelPayload, "name")) {
      updates.name = normalizeRequiredString(channelPayload.name, "name");
    }

    if (Object.prototype.hasOwnProperty.call(channelPayload, "description")) {
      updates.description = normalizeOptionalString(channelPayload.description);
    }

    if (Object.prototype.hasOwnProperty.call(channelPayload, "topic")) {
      updates.topic = normalizeOptionalString(channelPayload.topic);
    }

    if (Object.prototype.hasOwnProperty.call(channelPayload, "categoryId")) {
      updates.categoryId = normalizeOptionalString(channelPayload.categoryId);
      if (updates.categoryId) {
        await assertCategoryInOrg(updates.categoryId, channel.org_id, client);
      }
    }

    if (Object.prototype.hasOwnProperty.call(channelPayload, "type")) {
      updates.type = normalizeChannelType(channelPayload.type);
      if ((updates.type === "announcement" || updates.type === "cross-org") && !(accessContext.isOrgAdmin || accessContext.isSuperAdmin)) {
        assert(false, "You do not have permission to perform this action.", 403);
      }
      if (channel.e2ee && updates.type !== "private") {
        assert(false, "Private E2EE channels cannot be converted to another type.", 422);
      }
    }

    assert(Object.keys(updates).length > 0, "At least one updatable field is required.", 422);

    await channelModel.updateChannel(channelId, updates, client);
    const updated = await channelModel.findById(channelId, client);

    await client.query("COMMIT");
    return {
      channel: toChannel(updated),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteChannel(authUser, channelId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const { accessContext, membership } = await getChannelContext(authUser, channelId, client);
    assert(canManageChannel(accessContext, membership), "You do not have permission to perform this action.", 403);

    await channelModel.softDeleteChannel(channelId, authUser.id, client);
    await channelModel.softDeleteAllMembers(channelId, client);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function joinChannel(authUser, channelId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const { channel, membership } = await getChannelContext(authUser, channelId, client);
    assert(channel.type === "public", "Only public channels can be joined directly.", 422);
    assert(!membership, "You have already joined this channel.", 422);

    await channelModel.upsertChannelMember(
      {
        channelId,
        userId: authUser.id,
        role: "member",
        invitedBy: authUser.id,
      },
      client
    );

    const updated = await channelModel.findById(channelId, client);
    await client.query("COMMIT");

    return {
      channel: toChannel(updated),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function leaveChannel(authUser, channelId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const { membership } = await getChannelContext(authUser, channelId, client);
    assert(membership, "Resource not found.", 404);

    await assertNotRemovingLastAdmin(channelId, authUser.id, null, client);
    await channelModel.softRemoveMember(channelId, authUser.id, client);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function inviteToChannel(authUser, channelId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const { channel, membership } = await getChannelContext(authUser, channelId, client);
    assert(canInviteToChannel(membership), "You do not have permission to perform this action.", 403);
    assertAllowedKeys(payload || {}, ["userIds"], "invite payload contains invalid fields.");

    const userIds = await assertUsersEligibleForChannel(payload?.userIds, channel.org_id, channel.type, client);
    assert(userIds.length > 0, "userIds must be a non-empty array of user IDs.", 422);

    const existingMemberships = await channelModel.listActiveMembershipsByUserIds(channelId, userIds, client);
    assert(
      !existingMemberships.length,
      `One or more users are already members of this channel: ${existingMemberships.map((item) => item.user_id).join(", ")}.`,
      422
    );

    for (const userId of userIds) {
      await channelModel.upsertChannelMember(
        {
          channelId,
          userId,
          role: userId === authUser.id && membership?.role === "admin" ? "admin" : "member",
          invitedBy: authUser.id,
        },
        client
      );
    }

    const updated = await channelModel.findById(channelId, client);
    await client.query("COMMIT");

    return {
      channel: toChannel(updated),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function removeMember(authUser, channelId, userId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const { membership } = await getChannelContext(authUser, channelId, client);
    assert(isChannelAdmin(membership), "You do not have permission to perform this action.", 403);

    const targetMembership = await channelModel.findMembership(channelId, userId, client);
    assert(targetMembership, "Resource not found.", 404);

    await assertNotRemovingLastAdmin(channelId, userId, null, client);
    await channelModel.softRemoveMember(channelId, userId, client);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listChannelMembers(authUser, channelId, query) {
  const { channel, membership } = await getChannelContext(authUser, channelId);
  assertChannelVisibility(channel, membership);

  const limit = parseNonNegativeInt(query.limit, 50, "limit");
  const offset = parseNonNegativeInt(query.offset, 0, "offset");
  const role = query.role ? normalizeMemberRole(query.role) : null;

  const result = await channelModel.listMembers(channelId, {
    search: normalizeOptionalString(query.search),
    role,
    limit,
    offset,
  });

  return {
    users: result.members.map(toMemberUser),
    totalCount: result.totalCount,
    limit,
    offset,
  };
}

async function setChannelMemberRole(authUser, channelId, userId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const { membership } = await getChannelContext(authUser, channelId, client);
    assert(isChannelAdmin(membership), "You do not have permission to perform this action.", 403);
    assertAllowedKeys(payload || {}, ["role"], "member role payload contains invalid fields.");

    const role = normalizeMemberRole(payload?.role);
    const targetMembership = await channelModel.findMembership(channelId, userId, client);
    assert(targetMembership, "Resource not found.", 404);

    await assertNotRemovingLastAdmin(channelId, userId, role, client);
    await channelModel.updateMemberRole(channelId, userId, role, client);
    const updated = await channelModel.getMemberWithUserInfo(channelId, userId, client);

    await client.query("COMMIT");
    return toMemberResponse(updated);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function setSlowMode(authUser, channelId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const { accessContext, membership } = await getChannelContext(authUser, channelId, client);
    assert(canManageChannel(accessContext, membership), "You do not have permission to perform this action.", 403);

    const intervalSeconds = Number(payload?.intervalSeconds);
    assert(Number.isInteger(intervalSeconds) && intervalSeconds >= 0, "intervalSeconds must be a non-negative integer.", 422);

    await channelModel.updateChannel(channelId, { slowModeInterval: intervalSeconds }, client);
    const updated = await channelModel.findById(channelId, client);

    await client.query("COMMIT");
    return {
      channel: toChannel(updated),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  joinChannel,
  leaveChannel,
  inviteToChannel,
  removeMember,
  listChannelMembers,
  setChannelMemberRole,
  setSlowMode,
};
