const db = require("../config/db");
const userModel = require("../models/userModel");
const organizationModel = require("../models/organizationModel");
const { generateId } = require("../utils/id");

const VALID_STATUSES = new Set(["active", "archived", "deactivated"]);

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function toOrganizationResponse(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    code: row.code,
    type: row.type,
    status: row.status,
    logo: row.logo,
    parentId: row.parent_id,
    depth: row.depth,
    childrenCount: Number(row.children_count || 0),
    userCount: Number(row.user_count || 0),
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTreeNode(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    type: row.type,
    status: row.status,
    children: [],
  };
}

function assert(condition, message, status = 400) {
  if (!condition) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }
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
    roleIds,
    isSuperAdmin,
    isOrgAdmin,
    accessibleOrgIds,
  };
}

function assertOrgAccess(orgId, accessContext) {
  if (accessContext.isSuperAdmin) {
    return;
  }

  assert(accessContext.accessibleOrgIds.includes(orgId), "Forbidden organization access.", 403);
}

async function getOrganizationOrThrow(orgId, client = db) {
  const organization = await organizationModel.findById(orgId, {}, client);
  assert(organization, "Organization not found.", 404);
  return organization;
}

async function listOrganizations(authUser, query) {
  const accessContext = await getAccessContext(authUser);

  const status = query.status || null;
  if (status) {
    assert(VALID_STATUSES.has(status), "Invalid status filter.", 400);
  }

  const limit = parsePositiveInt(query.limit, 20);
  const offset = parsePositiveInt(query.offset, 0);

  const filters = {
    search: query.search || null,
    status,
    parentId: query.parentId || null,
    limit,
    offset,
    accessibleOrgIds: accessContext.accessibleOrgIds,
  };

  const result = await organizationModel.listOrganizations(filters);

  return {
    organizations: result.organizations.map(toOrganizationResponse),
    totalCount: result.totalCount,
    limit,
    offset,
  };
}

async function getOrganizationTree(authUser, query) {
  const accessContext = await getAccessContext(authUser);

  let depthLimit = null;
  if (query.depth !== undefined && query.depth !== null && query.depth !== "") {
    depthLimit = Number.parseInt(query.depth, 10);
    assert(!Number.isNaN(depthLimit) && depthLimit >= 0, "Invalid depth query parameter.", 400);
  }

  let rootIds = null;

  if (query.rootId) {
    const rootOrg = await getOrganizationOrThrow(query.rootId);
    assertOrgAccess(rootOrg.id, accessContext);
    rootIds = [rootOrg.id];
  } else if (!accessContext.isSuperAdmin) {
    rootIds = await organizationModel.listAccessibleRootIds(accessContext.accessibleOrgIds || []);
  }

  const nodes = await organizationModel.getTreeNodes({
    rootIds,
    accessibleOrgIds: accessContext.accessibleOrgIds,
  });

  if (!nodes.length) {
    return { tree: [] };
  }

  const nodeMap = new Map();
  const rootDepthById = new Map();
  nodes.forEach((row) => {
    nodeMap.set(row.id, {
      ...toTreeNode(row),
      _depth: row.depth,
      _parentId: row.parent_id,
    });

    if (!row.parent_id || (Array.isArray(rootIds) && rootIds.includes(row.id))) {
      rootDepthById.set(row.id, row.depth);
    }
  });

  const explicitRootSet = new Set(rootIds || []);
  const tree = [];

  const resolveRootDepth = (node) => {
    let current = node;
    while (current) {
      if (rootDepthById.has(current.id)) {
        return rootDepthById.get(current.id);
      }
      current = current._parentId ? nodeMap.get(current._parentId) : null;
    }

    return node._depth;
  };

  nodeMap.forEach((node) => {
    const rootDepth = resolveRootDepth(node);
    const withinDepth = depthLimit === null ? true : node._depth - rootDepth <= depthLimit;

    if (!withinDepth) {
      return;
    }

    const parent = node._parentId ? nodeMap.get(node._parentId) : null;
    if (parent) {
      const parentRootDepth = resolveRootDepth(parent);
      const parentWithinDepth = depthLimit === null ? true : parent._depth - parentRootDepth <= depthLimit;

      if (parentWithinDepth) {
        parent.children.push(node);
      }
      return;
    }

    if (!explicitRootSet.size || explicitRootSet.has(node.id)) {
      tree.push(node);
    }
  });

  const prune = (items) => {
    return items.map((item) => {
      return {
        id: item.id,
        name: item.name,
        code: item.code,
        type: item.type,
        status: item.status,
        children: prune(item.children),
      };
    });
  };

  const finalTree = prune(tree);
  return { tree: finalTree };
}

async function getOrganization(authUser, orgId) {
  const accessContext = await getAccessContext(authUser);
  const organization = await getOrganizationOrThrow(orgId);
  assertOrgAccess(orgId, accessContext);

  return {
    organization: toOrganizationResponse(organization),
  };
}

async function createOrganization(authUser, payload) {
  const accessContext = await getAccessContext(authUser);
  assert(accessContext.isSuperAdmin, "Only super admin can create root organizations.", 403);

  const organization = payload.organization;
  const parentId = organization.parentId || null;
  let depth = 0;

  if (parentId) {
    const parent = await getOrganizationOrThrow(parentId);
    depth = Number(parent.depth) + 1;
  }

  const orgId = generateId("org");

  await organizationModel.createOrganization({
    id: orgId,
    name: organization.name,
    code: organization.code,
    type: organization.type || (parentId ? "division" : "root"),
    logo: organization.logo || null,
    metadata: organization.metadata || {},
    parentId,
    depth,
    status: "active",
  });

  const created = await organizationModel.findById(orgId);

  return {
    organization: toOrganizationResponse(created),
  };
}

async function createSubOrganization(authUser, orgId, payload) {
  const accessContext = await getAccessContext(authUser);
  assert(accessContext.isOrgAdmin, "Only organization admin or super admin can create sub-organizations.", 403);

  const parent = await getOrganizationOrThrow(orgId);
  assertOrgAccess(parent.id, accessContext);

  const organization = payload.organization;
  const childId = generateId("org");

  await organizationModel.createOrganization({
    id: childId,
    name: organization.name,
    code: organization.code,
    type: organization.type || "division",
    logo: organization.logo || null,
    metadata: organization.metadata || {},
    parentId: parent.id,
    depth: Number(parent.depth) + 1,
    status: "active",
  });

  const created = await organizationModel.findById(childId);

  return {
    organization: toOrganizationResponse(created),
  };
}

async function updateOrganization(authUser, orgId, payload) {
  const accessContext = await getAccessContext(authUser);
  assert(accessContext.isOrgAdmin, "Only organization admin or super admin can update organizations.", 403);

  await getOrganizationOrThrow(orgId);
  assertOrgAccess(orgId, accessContext);

  const organization = payload.organization;
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(organization, "name")) {
    updates.name = organization.name;
  }

  if (Object.prototype.hasOwnProperty.call(organization, "code")) {
    updates.code = organization.code;
  }

  if (Object.prototype.hasOwnProperty.call(organization, "type")) {
    updates.type = organization.type;
  }

  if (Object.prototype.hasOwnProperty.call(organization, "logo")) {
    updates.logo = organization.logo;
  }

  if (Object.prototype.hasOwnProperty.call(organization, "metadata")) {
    updates.metadata = organization.metadata;
  }

  await organizationModel.updateOrganization(orgId, updates);

  const updated = await organizationModel.findById(orgId);

  return {
    organization: toOrganizationResponse(updated),
  };
}

async function moveOrganization(authUser, orgId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin || accessContext.isSuperAdmin, "Only organization admin or super admin can move organizations.", 403);

    const source = await getOrganizationOrThrow(orgId, client);
    const target = await getOrganizationOrThrow(payload.newParentId, client);

    assert(source.id !== target.id, "Organization cannot be moved under itself.", 400);

    const sourceDescendants = await organizationModel.getDescendantOrgIds(source.id, client);
    assert(!sourceDescendants.includes(target.id), "Cannot move organization under one of its descendants.", 400);

    if (!accessContext.isSuperAdmin) {
      assertOrgAccess(source.id, accessContext);
      assertOrgAccess(target.id, accessContext);
    }

    await organizationModel.updateOrganization(
      source.id,
      {
        parentId: target.id,
        depth: Number(target.depth) + 1,
      },
      client
    );

    await organizationModel.updateSubtreeDepth(source.id, client);

    await client.query("COMMIT");

    const updated = await organizationModel.findById(source.id);
    return { organization: toOrganizationResponse(updated) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function mergeOrganizations(authUser, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isSuperAdmin, "Only super admin can merge organizations.", 403);

    const source = await getOrganizationOrThrow(payload.sourceOrgId, client);
    const target = await getOrganizationOrThrow(payload.targetOrgId, client);

    assert(source.id !== target.id, "sourceOrgId and targetOrgId cannot be the same.", 400);

    await client.query(
      `UPDATE doffice_organizations
       SET parent_id = $1,
           depth = $2,
           updated_at = NOW()
       WHERE parent_id = $3
         AND deleted_at IS NULL`,
      [target.id, Number(target.depth) + 1, source.id]
    );

    await client.query(
      `UPDATE doffice_users
       SET org_id = $1,
           updated_at = NOW()
       WHERE org_id = $2`,
      [target.id, source.id]
    );

    await organizationModel.updateOrganization(
      source.id,
      {
        status: "deactivated",
        deletedAt: new Date(),
      },
      client
    );

    await organizationModel.updateSubtreeDepth(target.id, client);

    await client.query("COMMIT");

    const updatedTarget = await organizationModel.findById(target.id);
    return { organization: toOrganizationResponse(updatedTarget) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function cloneOrganization(authUser, orgId, payload) {
  const accessContext = await getAccessContext(authUser);
  assert(accessContext.isOrgAdmin || accessContext.isSuperAdmin, "Only organization admin or super admin can clone organizations.", 403);

  const source = await getOrganizationOrThrow(orgId);

  if (!accessContext.isSuperAdmin) {
    assertOrgAccess(source.id, accessContext);
  }

  const cloneId = generateId("org");

  await organizationModel.createOrganization({
    id: cloneId,
    name: payload.newName,
    code: payload.newCode,
    type: source.type,
    logo: source.logo,
    status: "active",
    parentId: source.parent_id,
    depth: source.depth,
    metadata: {
      ...(source.metadata || {}),
      cloneOptions: {
        includeRoles: Boolean(payload.includeRoles),
        includeNavConfig: Boolean(payload.includeNavConfig),
        includeUsers: Boolean(payload.includeUsers),
      },
      clonedFromOrgId: source.id,
    },
  });

  const created = await organizationModel.findById(cloneId);

  return {
    organization: toOrganizationResponse(created),
  };
}

async function archiveOrganization(authUser, orgId) {
  const accessContext = await getAccessContext(authUser);
  assert(accessContext.isOrgAdmin || accessContext.isSuperAdmin, "Only organization admin or super admin can archive organizations.", 403);

  await getOrganizationOrThrow(orgId);
  if (!accessContext.isSuperAdmin) {
    assertOrgAccess(orgId, accessContext);
  }

  await organizationModel.updateOrganization(orgId, {
    status: "archived",
  });

  const updated = await organizationModel.findById(orgId);
  return { organization: toOrganizationResponse(updated) };
}

async function restoreOrganization(authUser, orgId) {
  const accessContext = await getAccessContext(authUser);
  assert(accessContext.isOrgAdmin || accessContext.isSuperAdmin, "Only organization admin or super admin can restore organizations.", 403);

  await getOrganizationOrThrow(orgId);
  if (!accessContext.isSuperAdmin) {
    assertOrgAccess(orgId, accessContext);
  }

  await organizationModel.updateOrganization(orgId, {
    status: "active",
    deletedAt: null,
  });

  const updated = await organizationModel.findById(orgId);
  return { organization: toOrganizationResponse(updated) };
}

async function deleteOrganization(authUser, orgId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isSuperAdmin, "Only super admin can delete organizations.", 403);

    const organization = await getOrganizationOrThrow(orgId, client);

    const activeDescendants = await organizationModel.countActiveDescendants(orgId, client);
    assert(activeDescendants === 0, "Cannot delete organization with active children.", 409);

    const activeUsers = await organizationModel.countActiveUsers(orgId, client);
    assert(activeUsers === 0, "Cannot delete organization with active users.", 409);

    await organizationModel.updateOrganization(
      organization.id,
      {
        status: "deactivated",
        deletedAt: new Date(),
      },
      client
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listOrganizations,
  getOrganizationTree,
  getOrganization,
  createOrganization,
  createSubOrganization,
  updateOrganization,
  moveOrganization,
  mergeOrganizations,
  cloneOrganization,
  archiveOrganization,
  restoreOrganization,
  deleteOrganization,
};
