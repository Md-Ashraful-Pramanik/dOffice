const db = require("../config/db");

const RELATIONSHIP_SELECT = `
  SELECT
    id,
    source_org_id,
    target_org_id,
    type,
    description,
    shared_modules,
    created_at
  FROM doffice_org_relationships
`;

async function listRelationshipsByOrgId(orgId, client = db) {
  const result = await client.query(
    `${RELATIONSHIP_SELECT}
     WHERE deleted_at IS NULL
       AND (source_org_id = $1 OR target_org_id = $1)
     ORDER BY created_at DESC`,
    [orgId]
  );

  return result.rows;
}

async function findById(relationshipId, options = {}, client = db) {
  const { includeDeleted = false } = options;

  const where = ["id = $1"];
  if (!includeDeleted) {
    where.push("deleted_at IS NULL");
  }

  const result = await client.query(
    `${RELATIONSHIP_SELECT}
     WHERE ${where.join(" AND ")}
     LIMIT 1`,
    [relationshipId]
  );

  return result.rows[0] || null;
}

async function createRelationship(payload, client = db) {
  const {
    id,
    sourceOrgId,
    targetOrgId,
    type,
    description,
    sharedModules,
    createdBy,
  } = payload;

  const result = await client.query(
    `INSERT INTO doffice_org_relationships (
      id, source_org_id, target_org_id, type, description, shared_modules, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, COALESCE($6::text[], ARRAY[]::text[]), $7
    )
    RETURNING id`,
    [
      id,
      sourceOrgId,
      targetOrgId,
      type,
      description || null,
      Array.isArray(sharedModules) ? sharedModules : [],
      createdBy || null,
    ]
  );

  return result.rows[0] || null;
}

async function softDeleteRelationship(relationshipId, deletedBy, client = db) {
  const result = await client.query(
    `UPDATE doffice_org_relationships
     SET deleted_at = NOW(),
         deleted_by = $2,
         updated_at = NOW()
     WHERE id = $1
       AND deleted_at IS NULL
     RETURNING id`,
    [relationshipId, deletedBy || null]
  );

  return result.rows[0] || null;
}

module.exports = {
  listRelationshipsByOrgId,
  findById,
  createRelationship,
  softDeleteRelationship,
};
