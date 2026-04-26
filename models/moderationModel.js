const db = require("../config/db");

async function createMessageReport(payload, client = db) {
  const {
    id,
    orgId,
    messageId,
    reportedBy,
    reason,
    details,
  } = payload;

  const result = await client.query(
    `INSERT INTO doffice_message_reports (
      id, org_id, message_id, reported_by, reason, details
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(64),
      $4::varchar(64),
      $5::varchar(32),
      $6::text
    )
    RETURNING id, org_id, message_id, reported_by, reason, details, status, action, notes, resolved_by, resolved_at, created_at, updated_at`,
    [id, orgId, messageId, reportedBy, reason, details || null]
  );

  return result.rows[0] || null;
}

async function findReportById(reportId, client = db) {
  const result = await client.query(
    `SELECT id, org_id, message_id, reported_by, reason, details, status, action, notes, resolved_by, resolved_at, created_at, updated_at
     FROM doffice_message_reports
     WHERE id = $1::varchar(64)
       AND deleted_at IS NULL
     LIMIT 1`,
    [reportId]
  );

  return result.rows[0] || null;
}

async function listReports(orgId, filters = {}, client = db) {
  const {
    status = null,
    limit = 20,
    offset = 0,
  } = filters;

  const params = [orgId];
  const where = ["r.org_id = $1::varchar(64)", "r.deleted_at IS NULL"];

  if (status) {
    params.push(status);
    where.push(`r.status = $${params.length}::varchar(32)`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const totalResult = await client.query(
    `SELECT COUNT(*)::int AS total_count
     FROM doffice_message_reports r
     ${whereSql}`,
    params
  );

  const dataParams = [...params, limit, offset];
  const result = await client.query(
    `SELECT
       r.id,
       r.message_id,
       r.reported_by,
       r.reason,
       r.details,
       r.status,
       r.action,
       r.notes,
       r.resolved_by,
       r.resolved_at,
       r.created_at,
       r.updated_at
     FROM doffice_message_reports r
     ${whereSql}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $${dataParams.length - 1}
     OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    reports: result.rows,
    totalCount: totalResult.rows[0]?.total_count || 0,
  };
}

async function updateReport(reportId, updates = {}, client = db) {
  const fields = [];
  const params = [];

  const setField = (column, value, cast = "") => {
    params.push(value);
    fields.push(`${column} = $${params.length}${cast}`);
  };

  if (Object.prototype.hasOwnProperty.call(updates, "status")) {
    setField("status", updates.status, "::varchar(32)");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "action")) {
    setField("action", updates.action, "::varchar(32)");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "notes")) {
    setField("notes", updates.notes, "::text");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "resolvedBy")) {
    setField("resolved_by", updates.resolvedBy, "::varchar(64)");
  }

  if (Object.prototype.hasOwnProperty.call(updates, "resolvedAt")) {
    setField("resolved_at", updates.resolvedAt, "::timestamptz");
  }

  if (!fields.length) {
    return null;
  }

  fields.push("updated_at = NOW()");
  params.push(reportId);

  const result = await client.query(
    `UPDATE doffice_message_reports
     SET ${fields.join(", ")}
     WHERE id = $${params.length}::varchar(64)
       AND deleted_at IS NULL
     RETURNING id, org_id, message_id, reported_by, reason, details, status, action, notes, resolved_by, resolved_at, created_at, updated_at`,
    params
  );

  return result.rows[0] || null;
}

async function isOrgModerator(userId, orgId, client = db) {
  const result = await client.query(
    `SELECT 1
     FROM doffice_channel_members cm
     INNER JOIN doffice_channels ch
       ON ch.id = cm.channel_id
      AND ch.deleted_at IS NULL
     WHERE cm.user_id = $1::varchar(64)
       AND cm.role = 'moderator'
       AND cm.deleted_at IS NULL
       AND ch.org_id = $2::varchar(64)
     LIMIT 1`,
    [userId, orgId]
  );

  return Boolean(result.rows[0]);
}

module.exports = {
  createMessageReport,
  findReportById,
  listReports,
  updateReport,
  isOrgModerator,
};
