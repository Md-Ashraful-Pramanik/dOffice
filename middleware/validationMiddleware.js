function validateRegisterPayload(req, res, next) {
  const user = req.body && req.body.user;

  if (!user || typeof user !== "object") {
    return res.status(400).json({ error: "Invalid request body. Expected user object." });
  }

  const { username, email, password } = user;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Required fields: username, email, password." });
  }

  next();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseNonNegativeInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (parsed < 0) {
    return null;
  }

  return parsed;
}

function validateListOrganizationsQuery(req, res, next) {
  const validStatuses = new Set(["active", "archived", "deactivated"]);
  const { search, status, parentId, limit, offset } = req.query || {};

  if (search !== undefined && typeof search !== "string") {
    return res.status(400).json({ error: "Invalid query parameter: search must be a string." });
  }

  if (status !== undefined) {
    if (!isNonEmptyString(status) || !validStatuses.has(status)) {
      return res.status(400).json({ error: "Invalid query parameter: status must be active, archived, or deactivated." });
    }
  }

  if (parentId !== undefined && !isNonEmptyString(parentId)) {
    return res.status(400).json({ error: "Invalid query parameter: parentId must be a non-empty string." });
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(400).json({ error: "Invalid query parameter: limit must be a non-negative integer." });
  }

  if (offset !== undefined && parseNonNegativeInteger(offset) === null) {
    return res.status(400).json({ error: "Invalid query parameter: offset must be a non-negative integer." });
  }

  next();
}

function validateOrganizationTreeQuery(req, res, next) {
  const { rootId, depth } = req.query || {};

  if (rootId !== undefined && !isNonEmptyString(rootId)) {
    return res.status(400).json({ error: "Invalid query parameter: rootId must be a non-empty string." });
  }

  if (depth !== undefined && parseNonNegativeInteger(depth) === null) {
    return res.status(400).json({ error: "Invalid query parameter: depth must be a non-negative integer." });
  }

  next();
}

function validateLoginPayload(req, res, next) {
  const user = req.body && req.body.user;

  if (!user || typeof user !== "object") {
    return res.status(400).json({ error: "Invalid request body. Expected user object." });
  }

  const { email, password } = user;

  if (!email || !password) {
    return res.status(400).json({ error: "Required fields: email, password." });
  }

  next();
}

function validateCreateOrganizationPayload(req, res, next) {
  const organization = req.body && req.body.organization;

  if (!isPlainObject(organization)) {
    return res.status(400).json({ error: "Invalid request body. Expected organization object." });
  }

  const { name, code } = organization;

  if (!isNonEmptyString(name) || !isNonEmptyString(code)) {
    return res.status(400).json({ error: "Required fields: name, code." });
  }

  if (Object.prototype.hasOwnProperty.call(organization, "type") && !isNonEmptyString(organization.type)) {
    return res.status(400).json({ error: "Invalid field: type must be a non-empty string." });
  }

  if (Object.prototype.hasOwnProperty.call(organization, "logo") && organization.logo !== null && typeof organization.logo !== "string") {
    return res.status(400).json({ error: "Invalid field: logo must be a string or null." });
  }

  if (Object.prototype.hasOwnProperty.call(organization, "metadata") && !isPlainObject(organization.metadata)) {
    return res.status(400).json({ error: "Invalid field: metadata must be an object." });
  }

  if (Object.prototype.hasOwnProperty.call(organization, "parentId") && !isNonEmptyString(organization.parentId)) {
    return res.status(400).json({ error: "Invalid field: parentId must be a non-empty string." });
  }

  next();
}

function validateUpdateOrganizationPayload(req, res, next) {
  const organization = req.body && req.body.organization;

  if (!isPlainObject(organization)) {
    return res.status(400).json({ error: "Invalid request body. Expected organization object." });
  }

  const allowedFields = ["name", "code", "logo", "type", "metadata"];
  const hasAllowedField = allowedFields.some((field) => Object.prototype.hasOwnProperty.call(organization, field));

  if (!hasAllowedField) {
    return res.status(400).json({ error: "At least one updatable field is required." });
  }

  if (Object.prototype.hasOwnProperty.call(organization, "name") && !isNonEmptyString(organization.name)) {
    return res.status(400).json({ error: "Invalid field: name must be a non-empty string." });
  }

  if (Object.prototype.hasOwnProperty.call(organization, "code") && !isNonEmptyString(organization.code)) {
    return res.status(400).json({ error: "Invalid field: code must be a non-empty string." });
  }

  if (Object.prototype.hasOwnProperty.call(organization, "type") && !isNonEmptyString(organization.type)) {
    return res.status(400).json({ error: "Invalid field: type must be a non-empty string." });
  }

  if (Object.prototype.hasOwnProperty.call(organization, "logo") && organization.logo !== null && typeof organization.logo !== "string") {
    return res.status(400).json({ error: "Invalid field: logo must be a string or null." });
  }

  if (Object.prototype.hasOwnProperty.call(organization, "metadata") && !isPlainObject(organization.metadata)) {
    return res.status(400).json({ error: "Invalid field: metadata must be an object." });
  }

  next();
}

function validateMoveOrganizationPayload(req, res, next) {
  const { newParentId } = req.body || {};

  if (!isNonEmptyString(newParentId)) {
    return res.status(400).json({ error: "Required field: newParentId." });
  }

  next();
}

function validateMergeOrganizationsPayload(req, res, next) {
  const { sourceOrgId, targetOrgId } = req.body || {};

  if (!isNonEmptyString(sourceOrgId) || !isNonEmptyString(targetOrgId)) {
    return res.status(400).json({ error: "Required fields: sourceOrgId, targetOrgId." });
  }

  next();
}

function validateCloneOrganizationPayload(req, res, next) {
  const { newName, newCode, includeRoles, includeNavConfig, includeUsers } = req.body || {};

  if (!isNonEmptyString(newName) || !isNonEmptyString(newCode)) {
    return res.status(400).json({ error: "Required fields: newName, newCode." });
  }

  if (includeRoles !== undefined && typeof includeRoles !== "boolean") {
    return res.status(400).json({ error: "Invalid field: includeRoles must be a boolean." });
  }

  if (includeNavConfig !== undefined && typeof includeNavConfig !== "boolean") {
    return res.status(400).json({ error: "Invalid field: includeNavConfig must be a boolean." });
  }

  if (includeUsers !== undefined && typeof includeUsers !== "boolean") {
    return res.status(400).json({ error: "Invalid field: includeUsers must be a boolean." });
  }

  next();
}

function validateCreateRelationshipPayload(req, res, next) {
  const relationship = req.body && req.body.relationship;

  if (!isPlainObject(relationship)) {
    return res.status(400).json({ error: "Invalid request body. Expected relationship object." });
  }

  const { targetOrgId, type, description, sharedModules } = relationship;

  if (!isNonEmptyString(targetOrgId) || !isNonEmptyString(type)) {
    return res.status(400).json({ error: "Required fields: targetOrgId, type." });
  }

  if (description !== undefined && description !== null && typeof description !== "string") {
    return res.status(400).json({ error: "Invalid field: description must be a string or null." });
  }

  if (sharedModules !== undefined) {
    if (!Array.isArray(sharedModules) || !sharedModules.every((item) => isNonEmptyString(item))) {
      return res.status(400).json({ error: "Invalid field: sharedModules must be an array of non-empty strings." });
    }
  }

  next();
}

module.exports = {
  validateRegisterPayload,
  validateLoginPayload,
  validateListOrganizationsQuery,
  validateOrganizationTreeQuery,
  validateCreateOrganizationPayload,
  validateUpdateOrganizationPayload,
  validateMoveOrganizationPayload,
  validateMergeOrganizationsPayload,
  validateCloneOrganizationPayload,
  validateCreateRelationshipPayload,
};
