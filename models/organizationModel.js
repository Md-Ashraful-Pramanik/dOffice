const db = require("../config/db");

const ORGANIZATION_SELECT = `
  SELECT
    o.id,
    o.name,
    o.code,
    o.type,
    o.status,
    o.logo,
    o.parent_id,
    o.depth,
    o.metadata,
    o.created_at,
    o.updated_at,
    COALESCE(children.children_count, 0)::int AS children_count,
    COALESCE(users.user_count, 0)::int AS user_count
  FROM doffice_organizations o
  LEFT JOIN (
    SELECT parent_id, COUNT(*)::int AS children_count
    FROM doffice_organizations
    WHERE deleted_at IS NULL
    GROUP BY parent_id
  ) children ON children.parent_id = o.id
  LEFT JOIN (
    SELECT org_id, COUNT(*)::int AS user_count
    FROM doffice_users
    WHERE status = 'active'
    GROUP BY org_id
  ) users ON users.org_id = o.id
`;

async function getDescendantOrgIds(orgId, client = db) {
  if (!orgId) {
    return [];
  }

  const result = await client.query(
    `WITH RECURSIVE org_tree AS (
      SELECT id
      FROM doffice_organizations
      WHERE id = $1 AND deleted_at IS NULL
      UNION ALL
      SELECT child.id
      FROM doffice_organizations child
      INNER JOIN org_tree parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )
    SELECT id FROM org_tree`,
    [orgId]
  );

  return result.rows.map((row) => row.id);
}

async function listOrganizations(filters = {}, client = db) {
  const {
    search = null,
    status = null,
    parentId = null,
    limit = 20,
    offset = 0,
    accessibleOrgIds = null,
  } = filters;

  const params = [];
  const whereClauses = ["o.deleted_at IS NULL"];

  if (search) {
    params.push(`%${search}%`);
    whereClauses.push(`o.name ILIKE $${params.length}`);
  }

  if (status) {
    params.push(status);
    whereClauses.push(`o.status = $${params.length}`);
  }

  if (parentId !== undefined && parentId !== null) {
    params.push(parentId);
    whereClauses.push(`o.parent_id = $${params.length}`);
  }

  if (Array.isArray(accessibleOrgIds)) {
    if (!accessibleOrgIds.length) {
      return { organizations: [], totalCount: 0 };
    }

    params.push(accessibleOrgIds);
    whereClauses.push(`o.id = ANY($${params.length}::varchar[])`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countQuery = `
    SELECT COUNT(*)::int AS total_count
    FROM doffice_organizations o
    ${whereSql}
  `;

  const countResult = await client.query(countQuery, params);

  const dataParams = [...params, limit, offset];
  const dataQuery = `
    ${ORGANIZATION_SELECT}
    ${whereSql}
    ORDER BY o.created_at DESC
    LIMIT $${dataParams.length - 1}
    OFFSET $${dataParams.length}
  `;

  const result = await client.query(dataQuery, dataParams);

  return {
    organizations: result.rows,
    totalCount: countResult.rows[0].total_count,
  };
}

async function findById(orgId, options = {}, client = db) {
  const { includeDeleted = false } = options;

  const params = [orgId];
  const whereClauses = ["o.id = $1"];

  if (!includeDeleted) {
    whereClauses.push("o.deleted_at IS NULL");
  }

  const query = `
    ${ORGANIZATION_SELECT}
    WHERE ${whereClauses.join(" AND ")}
    LIMIT 1
  `;

  const result = await client.query(query, params);
  return result.rows[0] || null;
}

async function createOrganization(payload, client = db) {
  const {
    id,
    name,
    code,
    type,
    logo,
    status,
    parentId,
    depth,
    metadata,
  } = payload;

  const result = await client.query(
    `INSERT INTO doffice_organizations (
      id, name, code, type, logo, status, parent_id, depth, metadata
    ) VALUES (
      $1, $2, $3, COALESCE($4, 'root'), $5, COALESCE($6, 'active'), $7, COALESCE($8, 0), COALESCE($9::jsonb, '{}'::jsonb)
    )
    RETURNING id`,
    [
      id,
      name,
      code,
      type || null,
      logo || null,
      status || "active",
      parentId || null,
      typeof depth === "number" ? depth : 0,
      JSON.stringify(metadata || {}),
    ]
  );

  return result.rows[0];
}

async function updateOrganization(orgId, payload, client = db) {
  const fields = [];
  const params = [];

  const setField = (column, value) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    setField("name", payload.name);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "code")) {
    setField("code", payload.code);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "type")) {
    setField("type", payload.type);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "logo")) {
    setField("logo", payload.logo);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    setField("status", payload.status);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "parentId")) {
    setField("parent_id", payload.parentId);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "depth")) {
    setField("depth", payload.depth);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "deletedAt")) {
    setField("deleted_at", payload.deletedAt);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "metadata")) {
    setField("metadata", JSON.stringify(payload.metadata || {}));
    fields[fields.length - 1] = `${fields[fields.length - 1]}::jsonb`;
  }

  if (!fields.length) {
    return null;
  }

  fields.push("updated_at = NOW()");

  params.push(orgId);

  const query = `
    UPDATE doffice_organizations
    SET ${fields.join(", ")}
    WHERE id = $${params.length}
    RETURNING id
  `;

  const result = await client.query(query, params);
  return result.rows[0] || null;
}

async function updateSubtreeDepth(rootOrgId, client = db) {
  await client.query(
    `WITH RECURSIVE depth_recalc AS (
      SELECT id, parent_id, depth::int AS depth
      FROM doffice_organizations
      WHERE id = $1

      UNION ALL

      SELECT child.id, child.parent_id, depth_recalc.depth + 1
      FROM doffice_organizations child
      INNER JOIN depth_recalc ON child.parent_id = depth_recalc.id
      WHERE child.deleted_at IS NULL
    )
    UPDATE doffice_organizations org
    SET depth = depth_recalc.depth,
        updated_at = NOW()
    FROM depth_recalc
    WHERE org.id = depth_recalc.id`,
    [rootOrgId]
  );
}

async function listChildren(orgId, options = {}, client = db) {
  const { includeDeleted = false } = options;
  const params = [orgId];

  let query = `
    SELECT id, status
    FROM doffice_organizations
    WHERE parent_id = $1
  `;

  if (!includeDeleted) {
    query += " AND deleted_at IS NULL";
  }

  const result = await client.query(query, params);
  return result.rows;
}

async function countActiveUsers(orgId, client = db) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM doffice_users
     WHERE org_id = $1
       AND status = 'active'`,
    [orgId]
  );

  return result.rows[0].count;
}

async function countActiveDescendants(orgId, client = db) {
  const result = await client.query(
    `WITH RECURSIVE descendants AS (
      SELECT id
      FROM doffice_organizations
      WHERE parent_id = $1
        AND deleted_at IS NULL

      UNION ALL

      SELECT child.id
      FROM doffice_organizations child
      INNER JOIN descendants parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )
    SELECT COUNT(*)::int AS count
    FROM doffice_organizations org
    WHERE org.id IN (SELECT id FROM descendants)
      AND org.status = 'active'`,
    [orgId]
  );

  return result.rows[0].count;
}

async function getTreeNodes(options = {}, client = db) {
  const { rootIds = null, accessibleOrgIds = null } = options;

  let query;
  let params;

  if (Array.isArray(rootIds)) {
    if (!rootIds.length) {
      return [];
    }

    params = [rootIds];
    query = `
      WITH RECURSIVE tree AS (
        SELECT id, name, code, type, status, parent_id, depth, created_at
        FROM doffice_organizations
        WHERE id = ANY($1::varchar[])
          AND deleted_at IS NULL

        UNION ALL

        SELECT child.id, child.name, child.code, child.type, child.status, child.parent_id, child.depth, child.created_at
        FROM doffice_organizations child
        INNER JOIN tree parent ON child.parent_id = parent.id
        WHERE child.deleted_at IS NULL
      )
      SELECT id, name, code, type, status, parent_id, depth
      FROM tree
      ORDER BY depth ASC, created_at ASC
    `;
  } else {
    const whereClauses = ["deleted_at IS NULL"];
    params = [];

    if (Array.isArray(accessibleOrgIds)) {
      if (!accessibleOrgIds.length) {
        return [];
      }

      params.push(accessibleOrgIds);
      whereClauses.push(`id = ANY($${params.length}::varchar[])`);
    }

    query = `
      SELECT id, name, code, type, status, parent_id, depth
      FROM doffice_organizations
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY depth ASC, created_at ASC
    `;
  }

  if (Array.isArray(accessibleOrgIds) && rootIds !== null) {
    params.push(accessibleOrgIds);
    query = `
      SELECT id, name, code, type, status, parent_id, depth
      FROM (${query}) scoped_tree
      WHERE id = ANY($${params.length}::varchar[])
      ORDER BY depth ASC
    `;
  }

  const result = await client.query(query, params);
  return result.rows;
}

async function listAccessibleRootIds(accessibleOrgIds = [], client = db) {
  if (!accessibleOrgIds.length) {
    return [];
  }

  const result = await client.query(
    `SELECT id
     FROM doffice_organizations
     WHERE id = ANY($1::varchar[])
       AND deleted_at IS NULL
       AND (parent_id IS NULL OR parent_id <> ALL($1::varchar[]))
     ORDER BY created_at ASC`,
    [accessibleOrgIds]
  );

  return result.rows.map((row) => row.id);
}

async function existsByCode(code, client = db) {
  const result = await client.query(
    `SELECT 1
     FROM doffice_organizations
     WHERE code = $1
     LIMIT 1`,
    [code]
  );

  return Boolean(result.rows[0]);
}

async function getSubtreeOrganizations(rootOrgId, client = db) {
  const result = await client.query(
    `WITH RECURSIVE org_tree AS (
      SELECT id, name, code, type, status, logo, parent_id, depth, metadata, created_at
      FROM doffice_organizations
      WHERE id = $1
        AND deleted_at IS NULL

      UNION ALL

      SELECT child.id, child.name, child.code, child.type, child.status, child.logo, child.parent_id, child.depth, child.metadata, child.created_at
      FROM doffice_organizations child
      INNER JOIN org_tree parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )
    SELECT id, name, code, type, status, logo, parent_id, depth, metadata
    FROM org_tree
    ORDER BY depth ASC, created_at ASC`,
    [rootOrgId]
  );

  return result.rows;
}

module.exports = {
  getDescendantOrgIds,
  listOrganizations,
  findById,
  createOrganization,
  updateOrganization,
  updateSubtreeDepth,
  listChildren,
  countActiveUsers,
  countActiveDescendants,
  getTreeNodes,
  listAccessibleRootIds,
  existsByCode,
  getSubtreeOrganizations,
};
