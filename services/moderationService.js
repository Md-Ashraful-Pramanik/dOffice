const db = require("../config/db");
const channelModel = require("../models/channelModel");
const messagingModel = require("../models/messagingModel");
const moderationModel = require("../models/moderationModel");
const userModel = require("../models/userModel");
const { generateId } = require("../utils/id");
const {
  assert,
  getAccessContext,
  assertOrgAccess,
} = require("./accessService");

const REPORT_REASONS = new Set(["spam", "harassment", "inappropriate", "other"]);
const REPORT_STATUSES = new Set(["pending", "reviewed", "dismissed"]);
const RESOLVE_ACTIONS = new Set(["dismiss", "warn_user", "delete_message", "suspend_user"]);

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

function toReport(row) {
  return {
    id: row.id,
    messageId: row.message_id,
    reportedBy: row.reported_by,
    reason: row.reason,
    details: row.details,
    status: row.status,
    ...(row.action ? { action: row.action } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.resolved_by ? { resolvedBy: row.resolved_by } : {}),
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertCanModerateOrg(authUser, orgId, client = db) {
  const accessContext = await getAccessContext(authUser, client);
  assertOrgAccess(orgId, accessContext);

  if (accessContext.isSuperAdmin || accessContext.isOrgAdmin) {
    return accessContext;
  }

  const isModerator = await moderationModel.isOrgModerator(authUser.id, orgId, client);
  assert(isModerator, "You do not have permission to perform this action.", 403);

  return accessContext;
}

async function assertMessageVisibility(authUser, message, client = db) {
  if (message.target_type === "channel") {
    const channel = await channelModel.findById(message.channel_id, client);
    assert(channel, "Resource not found.", 404);

    const accessContext = await getAccessContext(authUser, client);
    assertOrgAccess(channel.org_id, accessContext);

    const membership = await channelModel.findMembership(channel.id, authUser.id, client);
    if (channel.type === "private") {
      assert(membership || accessContext.isOrgAdmin || accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);
    }

    return channel.org_id;
  }

  const participant = await messagingModel.findConversationParticipant(message.conversation_id, authUser.id, client);
  assert(participant, "You do not have permission to perform this action.", 403);

  const sender = await userModel.findById(message.sender_id, client);
  assert(sender?.org_id, "Resource not found.", 404);
  return sender.org_id;
}

async function reportMessage(authUser, messageId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const reason = normalizeRequiredString(payload?.reason, "reason").toLowerCase();
    assert(REPORT_REASONS.has(reason), "reason is invalid.", 422);

    const message = await messagingModel.findMessageById(messageId, client);
    assert(message, "Resource not found.", 404);

    const orgId = await assertMessageVisibility(authUser, message, client);

    const report = await moderationModel.createMessageReport(
      {
        id: generateId("rpt"),
        orgId,
        messageId,
        reportedBy: authUser.id,
        reason,
        details: normalizeOptionalString(payload?.details),
      },
      client
    );

    await client.query("COMMIT");
    return { report: toReport(report) };
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      assert(false, "You already reported this message.", 422);
    }

    throw error;
  } finally {
    client.release();
  }
}

async function listReportedMessages(authUser, orgId, query) {
  await assertCanModerateOrg(authUser, orgId);

  const status = query?.status ? normalizeRequiredString(query.status, "status").toLowerCase() : null;
  if (status) {
    assert(REPORT_STATUSES.has(status), "status is invalid.", 422);
  }

  const limit = parseLimit(query?.limit, 20, 100);
  const offset = parseNonNegativeInt(query?.offset, 0, "offset");

  const result = await moderationModel.listReports(orgId, {
    status,
    limit,
    offset,
  });

  return {
    reports: result.reports.map(toReport),
    totalCount: result.totalCount,
    limit,
    offset,
  };
}

async function resolveReport(authUser, orgId, reportId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    await assertCanModerateOrg(authUser, orgId, client);

    const report = await moderationModel.findReportById(reportId, client);
    assert(report, "Resource not found.", 404);
    assert(report.org_id === orgId, "Resource not found.", 404);
    assert(report.status === "pending", "Report has already been resolved.", 422);

    const action = normalizeRequiredString(payload?.action, "action").toLowerCase();
    assert(RESOLVE_ACTIONS.has(action), "action is invalid.", 422);

    if (action === "delete_message") {
      const message = await messagingModel.findMessageById(report.message_id, client);
      if (message) {
        await messagingModel.updateMessage(
          report.message_id,
          {
            deletedAt: new Date(),
            deletedBy: authUser.id,
          },
          client
        );
      }
    }

    if (action === "suspend_user" || action === "warn_user") {
      const message = await messagingModel.findMessageById(report.message_id, client, { includeDeleted: true });
      assert(message, "Resource not found.", 404);

      if (action === "suspend_user") {
        await userModel.updateUser(
          message.sender_id,
          {
            status: "suspended",
          },
          client
        );
      }
    }

    const updated = await moderationModel.updateReport(
      reportId,
      {
        status: action === "dismiss" ? "dismissed" : "reviewed",
        action,
        notes: normalizeOptionalString(payload?.notes),
        resolvedBy: authUser.id,
        resolvedAt: new Date(),
      },
      client
    );

    await client.query("COMMIT");
    return { report: toReport(updated) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  reportMessage,
  listReportedMessages,
  resolveReport,
};
