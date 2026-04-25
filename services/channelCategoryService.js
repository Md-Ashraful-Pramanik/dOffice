const db = require("../config/db");
const channelCategoryModel = require("../models/channelCategoryModel");
const { generateId } = require("../utils/id");
const {
  assert,
  getAccessContext,
  assertOrgAccess,
  assertOrganizationExists,
} = require("./accessService");

function toCategoryResponse(row) {
  return {
    id: row.id,
    name: row.name,
    orgId: row.org_id,
    position: Number(row.position || 0),
    channelCount: Number(row.channel_count || 0),
  };
}

function toCategoryListItem(row) {
  return {
    id: row.id,
    name: row.name,
    position: Number(row.position || 0),
    channelCount: Number(row.channel_count || 0),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredString(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : "";
  assert(normalized, `${fieldName} is required.`, 422);
  return normalized;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizePosition(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  assert(!Number.isNaN(parsed) && parsed > 0, "position must be a positive integer.", 422);
  return parsed;
}

function clampPosition(position, maxPosition) {
  if (position < 1) {
    return 1;
  }

  if (position > maxPosition) {
    return maxPosition;
  }

  return position;
}

function buildOrderedIds(existingCategories, prioritizedIds = []) {
  const seen = new Set();
  const orderedIds = [];

  prioritizedIds.forEach((categoryId) => {
    if (!seen.has(categoryId)) {
      seen.add(categoryId);
      orderedIds.push(categoryId);
    }
  });

  existingCategories.forEach((category) => {
    if (!seen.has(category.id)) {
      seen.add(category.id);
      orderedIds.push(category.id);
    }
  });

  return orderedIds;
}

async function listCategories(authUser, orgId) {
  const accessContext = await getAccessContext(authUser);
  await assertOrganizationExists(orgId);
  assertOrgAccess(orgId, accessContext);

  const categories = await channelCategoryModel.listCategories(orgId);
  return {
    categories: categories.map(toCategoryListItem),
  };
}

async function createCategory(authUser, orgId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);
    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const categoryPayload = isPlainObject(payload?.category) ? payload.category : null;
    assert(categoryPayload, "category is required.", 422);
    assert(
      Object.keys(categoryPayload).every((key) => ["name", "position"].includes(key)),
      "category contains invalid fields.",
      422
    );

    const categories = await channelCategoryModel.listCategories(orgId, client);
    const categoryId = generateId("cat");
    const requestedPosition = normalizePosition(categoryPayload.position, categories.length + 1);
    const position = clampPosition(requestedPosition, categories.length + 1);

    await channelCategoryModel.createCategory(
      {
        id: categoryId,
        orgId,
        name: normalizeRequiredString(categoryPayload.name, "name"),
        position,
        createdBy: authUser.id,
      },
      client
    );

    const orderedIds = buildOrderedIds(
      categories,
      [
        ...categories.slice(0, position - 1).map((category) => category.id),
        categoryId,
      ]
    );

    await channelCategoryModel.setCategoryPositions(orgId, orderedIds, client);

    const created = await channelCategoryModel.findById(categoryId, orgId, client);
    await client.query("COMMIT");

    return {
      category: toCategoryResponse(created),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateCategory(authUser, orgId, categoryId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);
    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const categoryPayload = isPlainObject(payload?.category) ? payload.category : null;
    assert(categoryPayload, "category is required.", 422);
    assert(
      Object.keys(categoryPayload).every((key) => ["name", "position"].includes(key)),
      "category contains invalid fields.",
      422
    );

    const category = await channelCategoryModel.findById(categoryId, orgId, client);
    assert(category, "Resource not found.", 404);

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(categoryPayload, "name")) {
      updates.name = normalizeRequiredString(categoryPayload.name, "name");
    }

    if (Object.keys(updates).length) {
      await channelCategoryModel.updateCategory(categoryId, updates, client);
    }

    if (Object.prototype.hasOwnProperty.call(categoryPayload, "position")) {
      const categories = await channelCategoryModel.listCategories(orgId, client);
      const requestedPosition = normalizePosition(categoryPayload.position, category.position);
      const remaining = categories.filter((item) => item.id !== categoryId);
      const position = clampPosition(requestedPosition, categories.length);
      const orderedIds = buildOrderedIds(remaining, [
        ...remaining.slice(0, position - 1).map((item) => item.id),
        categoryId,
      ]);
      await channelCategoryModel.setCategoryPositions(orgId, orderedIds, client);
    }

    const updated = await channelCategoryModel.findById(categoryId, orgId, client);
    await client.query("COMMIT");

    return {
      category: toCategoryResponse(updated),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteCategory(authUser, orgId, categoryId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);
    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    const category = await channelCategoryModel.findById(categoryId, orgId, client);
    assert(category, "Resource not found.", 404);

    await channelCategoryModel.clearCategoryFromChannels(categoryId, client);
    await channelCategoryModel.softDeleteCategory(categoryId, authUser.id, client);

    const remainingCategories = await channelCategoryModel.listCategories(orgId, client);
    await channelCategoryModel.setCategoryPositions(
      orgId,
      remainingCategories.map((item) => item.id),
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

async function reorderCategories(authUser, orgId, payload) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const accessContext = await getAccessContext(authUser, client);
    assert(accessContext.isOrgAdmin, "You do not have permission to perform this action.", 403);
    await assertOrganizationExists(orgId, client);
    assertOrgAccess(orgId, accessContext);

    assert(
      isPlainObject(payload) && Object.keys(payload).every((key) => ["order"].includes(key)),
      "order payload contains invalid fields.",
      422
    );

    const order = Array.isArray(payload?.order) ? payload.order.map((item) => normalizeOptionalString(item)).filter(Boolean) : null;
    assert(order, "order must be an array of category IDs.", 422);

    const categories = await channelCategoryModel.listCategories(orgId, client);
    const availableIds = new Set(categories.map((category) => category.id));
    const duplicateCount = new Set(order).size !== order.length;
    assert(!duplicateCount, "order cannot contain duplicate category IDs.", 422);
    assert(order.length === categories.length, "order must include every active category exactly once.", 422);

    order.forEach((categoryId) => {
      assert(availableIds.has(categoryId), "order contains category IDs outside the organization.", 422);
    });

    await channelCategoryModel.setCategoryPositions(orgId, order, client);

    const updated = await channelCategoryModel.listCategories(orgId, client);
    await client.query("COMMIT");

    return {
      categories: updated.map(toCategoryListItem),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
};
