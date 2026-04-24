const db = require("../config/db");
const userModel = require("../models/userModel");
const organizationModel = require("../models/organizationModel");
const relationshipModel = require("../models/organizationRelationshipModel");
const { generateId } = require("../utils/id");

function assert(condition, message, status = 400) {
  if (!condition) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }
}

function normalizeType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toRelationshipResponse(row) {
  return {
    id: row.id,
    sourceOrgId: row.source_org_id,
    targetOrgId: row.target_org_id,
    type: row.type,
    description: row.description,
    sharedModules: Array.isArray(row.shared_modules) ? row.shared_modules : [],
    createdAt: row.created_at,
  };
}

async function getAccessContext(authUser, client = db) {
  const roleIds = await userModel.getRoleIdsByUserId(authUser.id, client);
  const isSuperAdmin = Boolean(authUser.is_super_admin || roleIds.includes("role_super_admin"));
  const isOrgAdmin = Boolean(isSuperAdmin || roleIds.includes("role_org_admin"));

  let accessibleOrgIds = null;
  if (!isSuperAdmin) {
    if (!authUser.org_id) {
      accessibleOrgIds = [];
    } else {
      accessibleOrgIds = await organizationModel.getDescendantOrgIds(authUser.org_id, client);
    }
  }

  return {
    isSuperAdmin,
    isOrgAdmin,
    accessibleOrgIds,
  };
}

function hasOrgAccess(orgId, accessContext) {
  if (accessContext.isSuperAdmin) {
    return true;
  }

  return accessContext.accessibleOrgIds.includes(orgId);
}

async function assertOrganizationExists(orgId, client = db) {
  const organization = await organizationModel.findById(orgId, {}, client);
  assert(organization, "Organization not found.", 404);
  return organization;
}

async function listRelationships(authUser, orgId) {
  const accessContext = await getAccessContext(authUser);

  await assertOrganizationExists(orgId);
  assert(hasOrgAccess(orgId, accessContext), "Forbidden organization access.", 403);

  const relationships = await relationshipModel.listRelationshipsByOrgId(orgId);

  return {
    relationships: relationships.map(toRelationshipResponse),
    totalCount: relationships.length,
  };
}

async function createRelationship(authUser, orgId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "Only organization admin or super admin can create relationships.", 403);

    await assertOrganizationExists(orgId, client);

    const relationship = payload.relationship;
    const targetOrgId = relationship.targetOrgId;

    await assertOrganizationExists(targetOrgId, client);

    assert(orgId !== targetOrgId, "Source and target organizations must be different.", 400);
    assert(hasOrgAccess(orgId, accessContext), "Org admin access is required for source organization.", 403);
    assert(hasOrgAccess(targetOrgId, accessContext), "Org admin access is required for target organization.", 403);

    const relationshipId = generateId("rel");

    await relationshipModel.createRelationship(
      {
        id: relationshipId,
        sourceOrgId: orgId,
        targetOrgId,
        type: normalizeType(relationship.type),
        description: relationship.description || null,
        sharedModules: relationship.sharedModules || [],
        createdBy: authUser.id,
      },
      client
    );

    const created = await relationshipModel.findById(relationshipId, {}, client);

    await client.query("COMMIT");

    return {
      relationship: toRelationshipResponse(created),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteRelationship(authUser, orgId, relationshipId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "Only organization admin or super admin can delete relationships.", 403);

    await assertOrganizationExists(orgId, client);

    const relationship = await relationshipModel.findById(relationshipId, {}, client);
    assert(relationship, "Relationship not found.", 404);

    const relationshipIncludesOrg =
      relationship.source_org_id === orgId || relationship.target_org_id === orgId;
    assert(relationshipIncludesOrg, "Relationship does not belong to this organization.", 404);

    const canDelete =
      accessContext.isSuperAdmin ||
      hasOrgAccess(relationship.source_org_id, accessContext) ||
      hasOrgAccess(relationship.target_org_id, accessContext);

    assert(canDelete, "Org admin access is required for either source or target organization.", 403);

    const deleted = await relationshipModel.softDeleteRelationship(relationshipId, authUser.id, client);
    assert(deleted, "Relationship already deleted.", 404);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listRelationships,
  createRelationship,
  deleteRelationship,
};
