const db = require("../config/db");
const delegationModel = require("../models/delegationModel");
const { generateId } = require("../utils/id");
const { assert, getAccessContext, assertOrgAccess, assertUserExists } = require("./accessService");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDelegationScope(scope) {
  if (scope === null || scope === undefined) {
    return {};
  }

  assert(isPlainObject(scope), "scope must be an object.", 422);

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(scope, "modules")) {
    assert(
      Array.isArray(scope.modules) && scope.modules.every((entry) => typeof entry === "string" && entry.trim()),
      "scope.modules must be an array of non-empty strings.",
      422
    );
    normalized.modules = scope.modules.map((entry) => entry.trim());
  }

  if (Object.prototype.hasOwnProperty.call(scope, "permissions")) {
    assert(
      Array.isArray(scope.permissions) && scope.permissions.every((entry) => typeof entry === "string" && entry.trim()),
      "scope.permissions must be an array of non-empty strings.",
      422
    );
    normalized.permissions = scope.permissions.map((entry) => entry.trim());
  }

  return normalized;
}

function computeStatus(row) {
  if (row.status === "revoked" || row.revoked_at) {
    return "revoked";
  }

  const now = Date.now();
  const end = new Date(row.end_date).getTime();
  const start = new Date(row.start_date).getTime();

  if (end < now) {
    return "expired";
  }

  if (start > now) {
    return "active";
  }

  return "active";
}

function serializeSingleDelegation(row) {
  return {
    delegation: {
      id: row.id,
      delegatorUserId: row.delegator_user_id,
      delegateUserId: row.delegate_user_id,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      status: computeStatus(row),
      scope: row.scope || {},
      createdAt: row.created_at,
    },
  };
}

async function listDelegations(authUser, userId, query) {
  const accessContext = await getAccessContext(authUser);
  const isSelf = authUser.id === userId;
  assert(isSelf || accessContext.isOrgAdmin || accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);

  const targetUser = await assertUserExists(userId);
  if (!isSelf && !accessContext.isSuperAdmin) {
    assert(targetUser.org_id, "You do not have permission to perform this action.", 403);
    assertOrgAccess(targetUser.org_id, accessContext);
  }

  const rows = await delegationModel.listDelegationsByUser(userId, query.status || null);
  return {
    delegations: rows.map((row) => ({
      id: row.id,
      delegateUserId: row.delegate_user_id,
      startDate: row.start_date,
      endDate: row.end_date,
      status: computeStatus(row),
    })),
    totalCount: rows.length,
  };
}

async function createDelegation(authUser, userId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    assert(authUser.id === userId, "You do not have permission to perform this action.", 403);
    const delegatorUser = await assertUserExists(userId, client);

    const delegationPayload = payload.delegation || {};
    const delegateUser = await assertUserExists(delegationPayload.delegateUserId, client);
    assert(delegateUser.id !== userId, "Delegate user must be different from delegator.", 422);
    if (delegatorUser.org_id && delegateUser.org_id) {
      assert(delegateUser.org_id === delegatorUser.org_id, "Delegate user must belong to the same organization.", 422);
    }

    const startDate = new Date(delegationPayload.startDate);
    const endDate = new Date(delegationPayload.endDate);
    assert(!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()), "Invalid delegation date range.", 422);
    assert(endDate.getTime() >= startDate.getTime(), "Invalid delegation date range.", 422);
    const scope = normalizeDelegationScope(delegationPayload.scope);

    const delegationId = generateId("del");
    await delegationModel.createDelegation(
      {
        id: delegationId,
        delegatorUserId: userId,
        delegateUserId: delegationPayload.delegateUserId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        reason: delegationPayload.reason || null,
        scope,
      },
      client
    );

    const created = await delegationModel.findDelegationById(delegationId, client);
    await client.query("COMMIT");

    return serializeSingleDelegation(created);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function revokeDelegation(authUser, userId, delegationId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    const isSelf = authUser.id === userId;
    assert(isSelf || accessContext.isOrgAdmin || accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);

    const targetUser = await assertUserExists(userId, client);
    if (!isSelf && !accessContext.isSuperAdmin) {
      assert(targetUser.org_id, "You do not have permission to perform this action.", 403);
      assertOrgAccess(targetUser.org_id, accessContext);
    }

    const delegation = await delegationModel.findDelegationById(delegationId, client);
    assert(delegation && delegation.deleted_at === null, "Resource not found.", 404);
    assert(delegation.delegator_user_id === userId, "Resource not found.", 404);

    const revoked = await delegationModel.revokeDelegation(delegationId, authUser.id, client);
    assert(revoked, "Resource not found.", 404);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listDelegations,
  createDelegation,
  revokeDelegation,
};
