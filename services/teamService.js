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

function normalizeOverride(override) {
  return {
    module: String(override.module || "").trim().toLowerCase(),
    action: String(override.action || "").trim().toLowerCase(),
    allow: Boolean(override.allow),
  };
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
    const teamPayload = payload.team || {};

    const requiresOrgAdmin = teamPayload.type === "dynamic";
    if (requiresOrgAdmin) {
      assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);
    } else {
      assert(accessContext.isOrgAdmin || accessContext.isManager, "You do not have permission to perform this action.", 403);
    }

    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const teamId = generateId("team");
    await teamModel.createTeam(
      {
        id: teamId,
        orgId,
        name: teamPayload.name.trim(),
        description: teamPayload.description || null,
        type: teamPayload.type || "static",
        dynamicFilter: teamPayload.dynamicFilter || null,
        createdBy: authUser.id,
      },
      client
    );

    if (Array.isArray(teamPayload.permissionOverrides)) {
      const overrides = teamPayload.permissionOverrides.map(normalizeOverride);
      await teamModel.replaceTeamPermissionOverrides(teamId, overrides, client);
    }

    if ((teamPayload.type || "static") === "static" && Array.isArray(teamPayload.memberIds) && teamPayload.memberIds.length) {
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

    const updates = payload.team || {};
    await teamModel.updateTeam(
      teamId,
      {
        ...(Object.prototype.hasOwnProperty.call(updates, "name") ? { name: updates.name.trim() } : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, "description") ? { description: updates.description || null } : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, "dynamicFilter") ? { dynamicFilter: updates.dynamicFilter || null } : {}),
      },
      client
    );

    if (Object.prototype.hasOwnProperty.call(updates, "permissionOverrides")) {
      const overrides = (updates.permissionOverrides || []).map(normalizeOverride);
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
