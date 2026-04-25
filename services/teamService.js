const db = require("../config/db");
const teamModel = require("../models/teamModel");
const { generateId } = require("../utils/id");
const {
  assert,
  getAccessContext,
  assertOrgAccess,
  assertOrganizationExists,
  assertUserExists,
} = require("./accessService");

function serializeTeam(team, members = [], overrides = []) {
  return {
    team: {
      id: team.id,
      name: team.name,
      description: team.description,
      type: team.type,
      orgId: team.org_id,
      memberCount: members.length,
      members: members.map((member) => ({
        userId: member.user_id,
        username: member.username,
        name: member.name,
        avatar: member.avatar,
      })),
      permissionOverrides: overrides.map((override) => ({
        module: override.module,
        action: override.action,
        allow: override.allow,
      })),
      createdAt: team.created_at,
      updatedAt: team.updated_at,
    },
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredString(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : "";
  assert(normalized, `${fieldName} is required.`, 422);
  return normalized;
}

function normalizeNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value).trim() || null;
}

function normalizeOverride(override) {
  return {
    module: String(override.module || "").trim().toLowerCase(),
    action: String(override.action || "").trim().toLowerCase(),
    allow: Boolean(override.allow),
  };
}

function dedupeOverrides(overrides = []) {
  const map = new Map();
  overrides.forEach((override) => {
    map.set(`${override.module}:${override.action}`, override);
  });
  return Array.from(map.values());
}

function validateOverrideEntries(overrides, message) {
  assert(Array.isArray(overrides), message, 422);

  overrides.forEach((override) => {
    assert(isPlainObject(override), message, 422);
    const normalized = normalizeOverride(override);
    assert(normalized.module, message, 422);
    assert(normalized.action, message, 422);
    assert(typeof override.allow === "boolean", message, 422);
  });
}

function validateDynamicFilter(value) {
  assert(isPlainObject(value), "dynamicFilter must be an object.", 422);
  const invalidEntry = Object.values(value).some(
    (entry) => entry !== null && entry !== undefined && typeof entry !== "string"
  );
  assert(!invalidEntry, "dynamicFilter values must be strings.", 422);
}

function parseNonNegativeInt(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    const error = new Error("Invalid query parameter.");
    error.status = 400;
    throw error;
  }

  return parsed;
}

async function listTeams(authUser, orgId, query) {
  const accessContext = await getAccessContext(authUser);
  await assertOrganizationExists(orgId);
  assertOrgAccess(orgId, accessContext);

  const limit = parseNonNegativeInt(query.limit, 20);
  const offset = parseNonNegativeInt(query.offset, 0);

  const result = await teamModel.listTeams(orgId, {
    search: query.search || null,
    type: query.type || null,
    limit,
    offset,
  });

  return {
    teams: result.teams.map((team) => ({
      id: team.id,
      name: team.name,
      type: team.type,
      memberCount: team.member_count,
    })),
    totalCount: result.totalCount,
    limit,
    offset,
  };
}

async function getTeam(authUser, orgId, teamId) {
  const accessContext = await getAccessContext(authUser);
  await assertOrganizationExists(orgId);
  assertOrgAccess(orgId, accessContext);

  const team = await teamModel.findTeamById(teamId, orgId);
  assert(team, "Resource not found.", 404);

  const members = await teamModel.listTeamMembers(team);
  const overrides = await teamModel.getTeamPermissionOverrides(team.id);
  return serializeTeam(team, members, overrides);
}

async function createTeam(authUser, orgId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    const teamPayload = isPlainObject(payload?.team) ? payload.team : {};
    const teamType = teamPayload.type || "static";
    const name = normalizeRequiredString(teamPayload.name, "name");

    const requiresOrgAdmin = teamType === "dynamic";
    if (requiresOrgAdmin) {
      assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);
    } else {
      assert(accessContext.isOrgAdmin || accessContext.isManager, "You do not have permission to perform this action.", 403);
    }

    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    if (teamType === "dynamic") {
      validateDynamicFilter(teamPayload.dynamicFilter);
      assert(!Array.isArray(teamPayload.memberIds) || teamPayload.memberIds.length === 0, "Dynamic teams compute members automatically.", 422);
    }

    if (Array.isArray(teamPayload.permissionOverrides)) {
      validateOverrideEntries(teamPayload.permissionOverrides, "permissionOverrides must be a valid permission list");
    }

    if (teamPayload.dynamicFilter !== undefined && teamPayload.dynamicFilter !== null) {
      validateDynamicFilter(teamPayload.dynamicFilter);
    }

    const teamId = generateId("team");
    await teamModel.createTeam(
      {
        id: teamId,
        orgId,
        name,
        description: normalizeNullableString(teamPayload.description),
        type: teamType,
        dynamicFilter: teamPayload.dynamicFilter || null,
        createdBy: authUser.id,
      },
      client
    );

    if (Array.isArray(teamPayload.permissionOverrides)) {
      const overrides = dedupeOverrides(teamPayload.permissionOverrides.map(normalizeOverride));
      await teamModel.replaceTeamPermissionOverrides(teamId, overrides, client);
    }

    if (teamType === "static" && Array.isArray(teamPayload.memberIds) && teamPayload.memberIds.length) {
      for (const userId of teamPayload.memberIds) {
        const user = await assertUserExists(userId, client);
        assert(user.org_id === orgId, "User is not part of this organization.", 422);
      }
      await teamModel.addMembersToTeam(teamId, teamPayload.memberIds, authUser.id, client);
    }

    const team = await teamModel.findTeamById(teamId, orgId, client);
    const members = await teamModel.listTeamMembers(team, client);
    const overrides = await teamModel.getTeamPermissionOverrides(team.id, client);

    await client.query("COMMIT");
    return serializeTeam(team, members, overrides);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateTeam(authUser, orgId, teamId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);

    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const team = await teamModel.findTeamById(teamId, orgId, client);
    assert(team, "Resource not found.", 404);
    const isTeamLead = team.created_by === authUser.id;
    assert(accessContext.isOrgAdmin || isTeamLead, "You do not have permission to perform this action.", 403);

    const updates = isPlainObject(payload?.team) ? payload.team : {};
    assert(Object.keys(updates).length > 0, "At least one updatable field is required.", 422);

    if (Object.prototype.hasOwnProperty.call(updates, "permissionOverrides")) {
      validateOverrideEntries(updates.permissionOverrides, "permissionOverrides must be a valid permission list");
    }

    if (Object.prototype.hasOwnProperty.call(updates, "dynamicFilter")) {
      assert(team.type === "dynamic", "Only dynamic teams can update dynamicFilter.", 422);
      validateDynamicFilter(updates.dynamicFilter);
    }

    await teamModel.updateTeam(
      teamId,
      {
        ...(Object.prototype.hasOwnProperty.call(updates, "name")
          ? { name: normalizeRequiredString(updates.name, "name") }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, "description")
          ? { description: normalizeNullableString(updates.description) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, "dynamicFilter") ? { dynamicFilter: updates.dynamicFilter || null } : {}),
      },
      client
    );

    if (Object.prototype.hasOwnProperty.call(updates, "permissionOverrides")) {
      const overrides = dedupeOverrides((updates.permissionOverrides || []).map(normalizeOverride));
      await teamModel.replaceTeamPermissionOverrides(teamId, overrides, client);
    }

    const updated = await teamModel.findTeamById(teamId, orgId, client);
    const members = await teamModel.listTeamMembers(updated, client);
    const overrides = await teamModel.getTeamPermissionOverrides(updated.id, client);

    await client.query("COMMIT");
    return serializeTeam(updated, members, overrides);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteTeam(authUser, orgId, teamId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);

    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const team = await teamModel.findTeamById(teamId, orgId, client);
    assert(team, "Resource not found.", 404);

    await teamModel.softDeleteTeam(teamId, authUser.id, client);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function addMembers(authUser, orgId, teamId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);

    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const team = await teamModel.findTeamById(teamId, orgId, client);
    assert(team, "Resource not found.", 404);
    const isTeamLead = team.created_by === authUser.id;
    assert(accessContext.isOrgAdmin || isTeamLead, "You do not have permission to perform this action.", 403);
    assert(team.type === "static", "Cannot manually add members to a dynamic team.", 422);

    const userIds = payload.userIds || [];
    for (const userId of userIds) {
      const user = await assertUserExists(userId, client);
      assert(user.org_id === orgId, "User is not part of this organization.", 422);
    }

    await teamModel.addMembersToTeam(team.id, userIds, authUser.id, client);

    const updated = await teamModel.findTeamById(team.id, orgId, client);
    const members = await teamModel.listTeamMembers(updated, client);
    const overrides = await teamModel.getTeamPermissionOverrides(updated.id, client);

    await client.query("COMMIT");
    return serializeTeam(updated, members, overrides);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function removeMember(authUser, orgId, teamId, userId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);

    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const team = await teamModel.findTeamById(teamId, orgId, client);
    assert(team, "Resource not found.", 404);
    const isTeamLead = team.created_by === authUser.id;
    assert(accessContext.isOrgAdmin || isTeamLead, "You do not have permission to perform this action.", 403);
    assert(team.type === "static", "Cannot manually remove members from a dynamic team.", 422);

    const removed = await teamModel.softRemoveMember(team.id, userId, client);
    assert(removed, "Resource not found.", 404);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listTeams,
  getTeam,
  createTeam,
  updateTeam,
  deleteTeam,
  addMembers,
  removeMember,
};
