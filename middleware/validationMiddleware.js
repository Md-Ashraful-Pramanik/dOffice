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

function isValidEmail(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const normalized = value.trim();
  if (normalized.length > 254) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function isNullableString(value) {
  return value === null || value === undefined || typeof value === "string";
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

function validateUpdateCurrentUserPayload(req, res, next) {
  const user = req.body && req.body.user;
  if (!isPlainObject(user)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  const allowedFields = ["password", "avatar", "bio", "designation", "contactInfo"];
  const fields = Object.keys(user);
  if (!fields.length) {
    return res.status(422).json({ errors: { body: ["must contain at least one updatable field"] } });
  }

  if (!fields.every((field) => allowedFields.includes(field))) {
    return res.status(422).json({ errors: { body: ["contains unsupported fields"] } });
  }

  if (user.contactInfo !== undefined && !isPlainObject(user.contactInfo)) {
    return res.status(422).json({ errors: { contactInfo: ["must be an object"] } });
  }

  next();
}

function validateCreateOrganizationUserPayload(req, res, next) {
  const user = req.body && req.body.user;
  if (!isPlainObject(user)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  const allowedFields = [
    "username",
    "email",
    "password",
    "name",
    "employeeId",
    "designation",
    "department",
    "roleIds",
    "contactInfo",
    "avatar",
    "bio",
  ];

  const fields = Object.keys(user);
  if (!fields.every((field) => allowedFields.includes(field))) {
    return res.status(422).json({ errors: { body: ["contains unsupported fields"] } });
  }

  if (!isNonEmptyString(user.username) || !isNonEmptyString(user.email) || !isNonEmptyString(user.password) || !isNonEmptyString(user.name)) {
    return res.status(422).json({ errors: { body: ["required fields: username, email, password, name"] } });
  }

  if (!isValidEmail(user.email)) {
    return res.status(422).json({ errors: { email: ["is invalid"] } });
  }

  if (user.roleIds !== undefined && (!Array.isArray(user.roleIds) || !user.roleIds.every((roleId) => isNonEmptyString(roleId)))) {
    return res.status(422).json({ errors: { roleIds: ["must be an array of non-empty strings"] } });
  }

  if (user.contactInfo !== undefined && !isPlainObject(user.contactInfo)) {
    return res.status(422).json({ errors: { contactInfo: ["must be an object"] } });
  }

  if (isPlainObject(user.contactInfo)) {
    if (Object.prototype.hasOwnProperty.call(user.contactInfo, "phone") && !isNullableString(user.contactInfo.phone)) {
      return res.status(422).json({ errors: { contactInfo: ["phone must be a string or null"] } });
    }

    if (Object.prototype.hasOwnProperty.call(user.contactInfo, "address") && !isNullableString(user.contactInfo.address)) {
      return res.status(422).json({ errors: { contactInfo: ["address must be a string or null"] } });
    }
  }

  next();
}

function validateUpdateOrganizationUserPayload(req, res, next) {
  const user = req.body && req.body.user;
  if (!isPlainObject(user)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  const allowedFields = ["name", "designation", "department", "status", "roleIds", "contactInfo", "avatar", "bio"];
  const fields = Object.keys(user);
  if (!fields.length) {
    return res.status(422).json({ errors: { body: ["must contain at least one updatable field"] } });
  }

  if (!fields.every((field) => allowedFields.includes(field))) {
    return res.status(422).json({ errors: { body: ["contains unsupported fields"] } });
  }

  if (user.roleIds !== undefined && (!Array.isArray(user.roleIds) || !user.roleIds.every((roleId) => isNonEmptyString(roleId)))) {
    return res.status(422).json({ errors: { roleIds: ["must be an array of non-empty strings"] } });
  }

  if (user.status !== undefined) {
    const validStatuses = new Set(["active", "suspended", "on-leave", "deactivated", "retired"]);
    if (!validStatuses.has(user.status)) {
      return res.status(422).json({ errors: { status: ["is invalid"] } });
    }
  }

  if (user.contactInfo !== undefined && !isPlainObject(user.contactInfo)) {
    return res.status(422).json({ errors: { contactInfo: ["must be an object"] } });
  }

  if (isPlainObject(user.contactInfo)) {
    if (Object.prototype.hasOwnProperty.call(user.contactInfo, "phone") && !isNullableString(user.contactInfo.phone)) {
      return res.status(422).json({ errors: { contactInfo: ["phone must be a string or null"] } });
    }

    if (Object.prototype.hasOwnProperty.call(user.contactInfo, "address") && !isNullableString(user.contactInfo.address)) {
      return res.status(422).json({ errors: { contactInfo: ["address must be a string or null"] } });
    }
  }

  next();
}

function validateListUsersQuery(req, res, next) {
  const validStatuses = new Set(["active", "suspended", "on-leave", "deactivated", "retired"]);
  const { search, status, department, designation, location, roleId, limit, offset } = req.query || {};

  if (search !== undefined && typeof search !== "string") {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: search." } });
  }

  if (status !== undefined && !validStatuses.has(status)) {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: status." } });
  }

  if (department !== undefined && typeof department !== "string") {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: department." } });
  }

  if (designation !== undefined && typeof designation !== "string") {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: designation." } });
  }

  if (location !== undefined && typeof location !== "string") {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: location." } });
  }

  if (roleId !== undefined && typeof roleId !== "string") {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: roleId." } });
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: limit." } });
  }

  if (offset !== undefined && parseNonNegativeInteger(offset) === null) {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: offset." } });
  }

  next();
}

function validateDirectoryQuery(req, res, next) {
  const { search, department, designation, location, skill, limit, offset } = req.query || {};

  if (search !== undefined && typeof search !== "string") {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: search." } });
  }

  if (department !== undefined && typeof department !== "string") {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: department." } });
  }

  if (designation !== undefined && typeof designation !== "string") {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: designation." } });
  }

  if (location !== undefined && typeof location !== "string") {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: location." } });
  }

  if (skill !== undefined && typeof skill !== "string") {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: skill." } });
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: limit." } });
  }

  if (offset !== undefined && parseNonNegativeInteger(offset) === null) {
    return res.status(400).json({ error: { status: 400, message: "Invalid query parameter: offset." } });
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
  validateUpdateCurrentUserPayload,
  validateCreateOrganizationUserPayload,
  validateUpdateOrganizationUserPayload,
  validateListUsersQuery,
  validateDirectoryQuery,
};
