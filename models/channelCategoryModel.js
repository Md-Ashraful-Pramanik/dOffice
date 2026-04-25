const db = require("../config/db");

const CATEGORY_SELECT = `
  SELECT
    cc.id,
    cc.name,
    cc.org_id,
    cc.position,
    cc.created_by,
    cc.deleted_by,
    cc.deleted_at,
    cc.created_at,
    cc.updated_at,
    COALESCE(channels.channel_count, 0)::int AS channel_count
  FROM doffice_channel_categories cc
  LEFT JOIN (
    SELECT category_id, COUNT(*)::int AS channel_count
    FROM doffice_channels
    WHERE deleted_at IS NULL
    GROUP BY category_id
  ) channels ON channels.category_id = cc.id
`;

async function listCategories(orgId, client = db) {
  const result = await client.query(
    `${CATEGORY_SELECT}
     WHERE cc.org_id = $1
       AND cc.deleted_at IS NULL
     ORDER BY cc.position ASC, cc.created_at ASC`,
    [orgId]
  );

  return result.rows;
}

async function findById(categoryId, orgId = null, client = db) {
  const params = [categoryId];
  const where = ["cc.id = $1", "cc.deleted_at IS NULL"];

  if (orgId) {
    params.push(orgId);
    where.push(`cc.org_id = $${params.length}`);
  }

  const result = await client.query(
    `${CATEGORY_SELECT}
     WHERE ${where.join(" AND ")}
     LIMIT 1`,
    params
  );

  return result.rows[0] || null;
}

async function createCategory(payload, client = db) {
  const { id, orgId, name, position, createdBy } = payload;

  const result = await client.query(
    `INSERT INTO doffice_channel_categories (
      id, org_id, name, position, created_by
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(160),
      $4::int,
      $5::varchar(64)
    )
    RETURNING id`,
    [id, orgId, name, position, createdBy || null]
  );

  return result.rows[0] || null;
}

async function updateCategory(categoryId, updates = {}, client = db) {
  const fields = [];
  const params = [];

  const setField = (column, value) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    setField("name", updates.name);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "position")) {
    setField("position", updates.position);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "deletedBy")) {
    setField("deleted_by", updates.deletedBy);
  }

  if (Object.prototype.hasOwnProperty.call(updates, "deletedAt")) {
    setField("deleted_at", updates.deletedAt);
  }

  if (!fields.length) {
    return null;
  }

  fields.push("updated_at = NOW()");
  params.push(categoryId);

  const result = await client.query(
    `UPDATE doffice_channel_categories
     SET ${fields.join(", ")}
     WHERE id = $${params.length}
     RETURNING id`,
    params
  );

  return result.rows[0] || null;
}

async function setCategoryPositions(orgId, orderedIds = [], client = db) {
  for (let index = 0; index < orderedIds.length; index += 1) {
    await client.query(
      `UPDATE doffice_channel_categories
       SET position = $3::int,
           updated_at = NOW()
       WHERE id = $1::varchar(64)
         AND org_id = $2::varchar(64)
         AND deleted_at IS NULL`,
      [orderedIds[index], orgId, index + 1]
    );
  }
}

async function softDeleteCategory(categoryId, deletedBy, client = db) {
  const result = await client.query(
    `UPDATE doffice_channel_categories
     SET deleted_at = NOW(),
         deleted_by = $2::varchar(64),
         updated_at = NOW()
     WHERE id = $1::varchar(64)
       AND deleted_at IS NULL
     RETURNING id`,
    [categoryId, deletedBy || null]
  );

  return result.rows[0] || null;
}

async function clearCategoryFromChannels(categoryId, client = db) {
  await client.query(
    `UPDATE doffice_channels
     SET category_id = NULL,
         updated_at = NOW()
     WHERE category_id = $1::varchar(64)
       AND deleted_at IS NULL`,
    [categoryId]
  );
}

module.exports = {
  listCategories,
  findById,
  createCategory,
  updateCategory,
  setCategoryPositions,
  softDeleteCategory,
  clearCategoryFromChannels,
};
