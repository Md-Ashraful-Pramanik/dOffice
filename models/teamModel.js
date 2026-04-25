const db = require("../config/db");

async function listTeams(orgId, filters = {}, client = db) {
  const { search = null, type = null, limit = 20, offset = 0 } = filters;
  const params = [orgId];
  const where = ["t.org_id = $1", "t.deleted_at IS NULL"];

  if (search) {
    params.push(`%${search}%`);
    where.push(`t.name ILIKE $${params.length}`);
  }

  if (type) {
    params.push(type);
    where.push(`t.type = $${params.length}`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const totalResult = await client.query(
    `SELECT COUNT(*)::int AS total_count
     FROM doffice_teams t
     ${whereSql}`,
    params
  );

  const dataParams = [...params, limit, offset];
  const rowsResult = await client.query(
    `SELECT t.id, t.name, t.type,
      CASE
        WHEN t.type = 'dynamic' THEN (
          SELECT COUNT(*)::int
          FROM doffice_users u
          WHERE u.org_id = t.org_id
            AND u.deleted_at IS NULL
            AND (
              t.dynamic_filter IS NULL
              OR (
                (NOT (t.dynamic_filter ? 'designation') OR LOWER(COALESCE(u.designation, '')) = LOWER(t.dynamic_filter->>'designation'))
                AND (NOT (t.dynamic_filter ? 'department') OR LOWER(COALESCE(u.department, '')) = LOWER(t.dynamic_filter->>'department'))
                AND (NOT (t.dynamic_filter ? 'location') OR LOWER(COALESCE(u.location, '')) = LOWER(t.dynamic_filter->>'location'))
                AND (NOT (t.dynamic_filter ? 'status') OR LOWER(COALESCE(u.status, '')) = LOWER(t.dynamic_filter->>'status'))
              )
            )
        )
        ELSE (
          SELECT COUNT(*)::int
          FROM doffice_team_members tm
          WHERE tm.team_id = t.id
            AND tm.deleted_at IS NULL
        )
      END AS member_count
     FROM doffice_teams t
     ${whereSql}
     ORDER BY t.created_at DESC
     LIMIT $${dataParams.length - 1}
     OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    teams: rowsResult.rows,
    totalCount: totalResult.rows[0].total_count,
  };
}

async function findTeamById(teamId, orgId = null, client = db) {
  const params = [teamId];
  const where = ["t.id = $1", "t.deleted_at IS NULL"];

  if (orgId) {
    params.push(orgId);
    where.push(`t.org_id = $${params.length}`);
  }

  const result = await client.query(
    `SELECT t.id, t.org_id, t.name, t.description, t.type, t.dynamic_filter, t.created_by,
            t.created_at, t.updated_at
     FROM doffice_teams t
     WHERE ${where.join(" AND ")}
     LIMIT 1`,
    params
  );

  return result.rows[0] || null;
}

async function createTeam(payload, client = db) {
  const { id, orgId, name, description, type, dynamicFilter, createdBy } = payload;

  const result = await client.query(
    `INSERT INTO doffice_teams (id, org_id, name, description, type, dynamic_filter, created_by)
     VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(200),
      $4::text,
      $5::varchar(32),
      $6::jsonb,
      $7::varchar(64)
     )
     RETURNING id`,
    [id, orgId, name, description || null, type || "static", JSON.stringify(dynamicFilter || null), createdBy || null]
  );

  return result.rows[0] || null;
}

async function updateTeam(teamId, updates = {}, client = db) {
  const fields = [];
  const params = [];

  const setField = (column, value) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    setField("name", updates.name);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "description")) {
    setField("description", updates.description);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "dynamicFilter")) {
    params.push(JSON.stringify(updates.dynamicFilter || null));
    fields.push(`dynamic_filter = $${params.length}::jsonb`);
  }

  if (!fields.length) {
    return null;
  }

  fields.push("updated_at = NOW()");
  params.push(teamId);

  const result = await client.query(
    `UPDATE doffice_teams
     SET ${fields.join(", ")}
     WHERE id = $${params.length}
       AND deleted_at IS NULL
     RETURNING id`,
    params
  );

  return result.rows[0] || null;
}

async function softDeleteTeam(teamId, deletedBy, client = db) {
  const result = await client.query(
    `UPDATE doffice_teams
     SET deleted_at = NOW(),
         deleted_by = $2,
         updated_at = NOW()
     WHERE id = $1
       AND deleted_at IS NULL
     RETURNING id`,
    [teamId, deletedBy || null]
  );

  return result.rows[0] || null;
}

async function listTeamMembers(team, client = db) {
  if (!team) {
    return [];
  }

  if (team.type === "dynamic") {
    const params = [team.org_id];
    const filters = [];

    const pushFilter = (column, value) => {
      params.push(String(value).trim().toLowerCase());
      filters.push(`LOWER(COALESCE(u.${column}, '')) = $${params.length}`);
    };

    if (team.dynamic_filter && typeof team.dynamic_filter === "object") {
      if (team.dynamic_filter.designation) {
        pushFilter("designation", team.dynamic_filter.designation);
      }
      if (team.dynamic_filter.department) {
        pushFilter("department", team.dynamic_filter.department);
      }
      if (team.dynamic_filter.location) {
        pushFilter("location", team.dynamic_filter.location);
      }
      if (team.dynamic_filter.status) {
        pushFilter("status", team.dynamic_filter.status);
      }
    }

    const where = ["u.org_id = $1", "u.deleted_at IS NULL", ...filters];

    const result = await client.query(
      `SELECT u.id AS user_id, u.username, u.name, u.avatar
       FROM doffice_users u
       WHERE ${where.join(" AND ")}
       ORDER BY u.name ASC NULLS LAST, u.username ASC`,
      params
    );

    return result.rows;
  }

  const result = await client.query(
    `SELECT u.id AS user_id, u.username, u.name, u.avatar
     FROM doffice_team_members tm
     INNER JOIN doffice_users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
       AND tm.deleted_at IS NULL
       AND u.deleted_at IS NULL
     ORDER BY u.name ASC NULLS LAST, u.username ASC`,
    [team.id]
  );

  return result.rows;
}

async function replaceTeamPermissionOverrides(teamId, overrides = [], client = db) {
  await client.query(
    `UPDATE doffice_team_permission_overrides
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE team_id = $1::varchar(64)
       AND deleted_at IS NULL`,
    [teamId]
  );

  if (!overrides.length) {
    return;
  }

  const values = [];
  const params = [];

  overrides.forEach((override, index) => {
    const base = index * 3;
    values.push(
      `($1::varchar(64), $${base + 2}::varchar(100), $${base + 3}::varchar(100), $${base + 4}::boolean)`
    );
    params.push(override.module, override.action, override.allow);
  });

  await client.query(
    `INSERT INTO doffice_team_permission_overrides (team_id, module, action, allow)
     VALUES ${values.join(", ")}`,
    [teamId, ...params]
  );
}

async function getTeamPermissionOverrides(teamId, client = db) {
  const result = await client.query(
    `SELECT module, action, allow
     FROM doffice_team_permission_overrides
     WHERE team_id = $1
       AND deleted_at IS NULL
     ORDER BY module ASC, action ASC`,
    [teamId]
  );

  return result.rows;
}

async function addMembersToTeam(teamId, userIds = [], addedBy, client = db) {
  for (const userId of userIds) {
    await client.query(
      `UPDATE doffice_team_members
       SET deleted_at = NULL,
           added_by = $3::varchar(64),
           created_at = NOW()
       WHERE team_id = $1::varchar(64)
         AND user_id = $2::varchar(64)`,
      [teamId, userId, addedBy || null]
    );

    await client.query(
      `INSERT INTO doffice_team_members (team_id, user_id, added_by)
       SELECT $1::varchar(64), $2::varchar(64), $3::varchar(64)
       WHERE NOT EXISTS (
         SELECT 1
         FROM doffice_team_members
         WHERE team_id = $1
           AND user_id = $2
           AND deleted_at IS NULL
       )`,
      [teamId, userId, addedBy || null]
    );
  }
}

async function softRemoveMember(teamId, userId, client = db) {
  const result = await client.query(
    `UPDATE doffice_team_members
     SET deleted_at = NOW()
     WHERE team_id = $1::varchar(64)
       AND user_id = $2::varchar(64)
       AND deleted_at IS NULL
     RETURNING id`,
    [teamId, userId]
  );

  return result.rows[0] || null;
}

async function listUserTeamOverrides(userId, orgId, client = db) {
  const result = await client.query(
    `SELECT t.id AS team_id, t.type, t.dynamic_filter, t.org_id, o.module, o.action, o.allow
     FROM doffice_teams t
     INNER JOIN doffice_team_permission_overrides o ON o.team_id = t.id AND o.deleted_at IS NULL
     WHERE t.org_id = $2
       AND t.deleted_at IS NULL
       AND (
        (t.type = 'static' AND EXISTS (
          SELECT 1
          FROM doffice_team_members tm
          WHERE tm.team_id = t.id
            AND tm.user_id = $1
            AND tm.deleted_at IS NULL
        ))
        OR (t.type = 'dynamic' AND EXISTS (
          SELECT 1
          FROM doffice_users u
          WHERE u.id = $1
            AND u.org_id = t.org_id
            AND u.deleted_at IS NULL
            AND (
              t.dynamic_filter IS NULL
              OR (
                (NOT (t.dynamic_filter ? 'designation') OR LOWER(COALESCE(u.designation, '')) = LOWER(t.dynamic_filter->>'designation'))
                AND (NOT (t.dynamic_filter ? 'department') OR LOWER(COALESCE(u.department, '')) = LOWER(t.dynamic_filter->>'department'))
                AND (NOT (t.dynamic_filter ? 'location') OR LOWER(COALESCE(u.location, '')) = LOWER(t.dynamic_filter->>'location'))
                AND (NOT (t.dynamic_filter ? 'status') OR LOWER(COALESCE(u.status, '')) = LOWER(t.dynamic_filter->>'status'))
              )
            )
        ))
       )
     ORDER BY t.id ASC`,
    [userId, orgId]
  );

  return result.rows;
}

module.exports = {
  listTeams,
  findTeamById,
  createTeam,
  updateTeam,
  softDeleteTeam,
  listTeamMembers,
  replaceTeamPermissionOverrides,
  getTeamPermissionOverrides,
  addMembersToTeam,
  softRemoveMember,
  listUserTeamOverrides,
};
