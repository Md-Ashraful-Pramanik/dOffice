function validateRegisterPayload(req, res, next) {
  const user = req.body && req.body.user;

  if (!user || typeof user !== "object") {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  const { username, email, password } = user;

  if (!isNonEmptyString(username) || !isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(422).json({ errors: { body: ["required fields: username, email, password"] } });
  }

  if (!isValidEmail(email)) {
    return res.status(422).json({ errors: { email: ["is invalid"] } });
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

function getUnknownKeys(value, allowedKeys = []) {
  if (!isPlainObject(value)) {
    return [];
  }

  const allowed = new Set(allowedKeys);
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function rejectUnknownPayloadFields(res, value, allowedKeys = []) {
  const unknownKeys = getUnknownKeys(value, allowedKeys);
  if (!unknownKeys.length) {
    return false;
  }

  res.status(422).json({
    errors: {
      body: [`contains invalid field(s): ${unknownKeys.join(", ")}`],
    },
  });

  return true;
}

function rejectUnknownQueryParams(res, query, allowedKeys = []) {
  const unknownKeys = Object.keys(query || {}).filter((key) => !allowedKeys.includes(key));
  if (!unknownKeys.length) {
    return false;
  }

  res.status(422).json({
    errors: {
      query: [`contains invalid parameter(s): ${unknownKeys.join(", ")}`],
    },
  });

  return true;
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
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  const { email, password } = user;

  if (!email || !password) {
    return res.status(422).json({ errors: { body: ["required fields: email, password"] } });
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

function validatePermissionEntry(permission) {
  if (!isPlainObject(permission)) {
    return false;
  }

  return isNonEmptyString(permission.module) && isNonEmptyString(permission.action) && typeof permission.allow === "boolean";
}

function validateDynamicFilterEntry(dynamicFilter) {
  if (!isPlainObject(dynamicFilter)) {
    return false;
  }

  const supportedFields = new Set(["designation", "department", "location", "status"]);
  const keys = Object.keys(dynamicFilter);

  if (!keys.length || keys.some((key) => !supportedFields.has(key))) {
    return false;
  }

  return keys.every((key) => dynamicFilter[key] === null || dynamicFilter[key] === undefined || isNonEmptyString(dynamicFilter[key]));
}

function validateDelegationScope(scope) {
  if (!isPlainObject(scope)) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(scope, "modules") &&
    (!Array.isArray(scope.modules) || !scope.modules.every(isNonEmptyString))
  ) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(scope, "permissions") &&
    (!Array.isArray(scope.permissions) || !scope.permissions.every(isNonEmptyString))
  ) {
    return false;
  }

  return true;
}

function validateListRolesQuery(req, res, next) {
  const { search, type } = req.query || {};

  if (search !== undefined && typeof search !== "string") {
    return res.status(422).json({ errors: { search: ["is invalid"] } });
  }

  if (type !== undefined && type !== "system" && type !== "custom") {
    return res.status(422).json({ errors: { type: ["must be system or custom"] } });
  }

  next();
}

function validateCreateRolePayload(req, res, next) {
  const role = req.body && req.body.role;

  if (!isPlainObject(role)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  if (!isNonEmptyString(role.name)) {
    return res.status(422).json({ errors: { name: ["can't be blank"] } });
  }

  if (!Array.isArray(role.permissions) || !role.permissions.length || !role.permissions.every(validatePermissionEntry)) {
    return res.status(422).json({ errors: { permissions: ["must be a non-empty list of permissions"] } });
  }

  if (role.description !== undefined && role.description !== null && typeof role.description !== "string") {
    return res.status(422).json({ errors: { description: ["must be a string or null"] } });
  }

  if (role.inheritsFrom !== undefined && role.inheritsFrom !== null && !isNonEmptyString(role.inheritsFrom)) {
    return res.status(422).json({ errors: { inheritsFrom: ["must be a non-empty string or null"] } });
  }

  next();
}

function validateUpdateRolePayload(req, res, next) {
  const role = req.body && req.body.role;

  if (!isPlainObject(role)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  const allowedFields = ["name", "description", "permissions", "inheritsFrom"];
  const keys = Object.keys(role);

  if (!keys.length || !keys.every((key) => allowedFields.includes(key))) {
    return res.status(422).json({ errors: { body: ["contains unsupported fields"] } });
  }

  if (Object.prototype.hasOwnProperty.call(role, "name") && !isNonEmptyString(role.name)) {
    return res.status(422).json({ errors: { name: ["can't be blank"] } });
  }

  if (Object.prototype.hasOwnProperty.call(role, "description") && role.description !== null && typeof role.description !== "string") {
    return res.status(422).json({ errors: { description: ["must be a string or null"] } });
  }

  if (
    Object.prototype.hasOwnProperty.call(role, "inheritsFrom") &&
    role.inheritsFrom !== null &&
    !isNonEmptyString(role.inheritsFrom)
  ) {
    return res.status(422).json({ errors: { inheritsFrom: ["must be a non-empty string or null"] } });
  }

  if (
    Object.prototype.hasOwnProperty.call(role, "permissions") &&
    (!Array.isArray(role.permissions) || !role.permissions.every(validatePermissionEntry))
  ) {
    return res.status(422).json({ errors: { permissions: ["must be a list of permissions"] } });
  }

  next();
}

function validateAssignRolePayload(req, res, next) {
  const { roleId, orgId } = req.body || {};

  if (!isNonEmptyString(roleId) || !isNonEmptyString(orgId)) {
    return res.status(422).json({ errors: { body: ["required fields: roleId, orgId"] } });
  }

  next();
}

function validateEffectivePermissionsQuery(req, res, next) {
  const { orgId } = req.query || {};

  if (orgId !== undefined && !isNonEmptyString(orgId)) {
    return res.status(422).json({ errors: { orgId: ["is invalid"] } });
  }

  next();
}

function validateListTeamsQuery(req, res, next) {
  const { search, type, limit, offset } = req.query || {};

  if (search !== undefined && typeof search !== "string") {
    return res.status(422).json({ errors: { search: ["is invalid"] } });
  }

  if (type !== undefined && type !== "static" && type !== "dynamic") {
    return res.status(422).json({ errors: { type: ["must be static or dynamic"] } });
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(422).json({ errors: { limit: ["must be a non-negative integer"] } });
  }

  if (offset !== undefined && parseNonNegativeInteger(offset) === null) {
    return res.status(422).json({ errors: { offset: ["must be a non-negative integer"] } });
  }

  next();
}

function validateCreateTeamPayload(req, res, next) {
  const team = req.body && req.body.team;

  if (!isPlainObject(team)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  if (!isNonEmptyString(team.name)) {
    return res.status(422).json({ errors: { name: ["can't be blank"] } });
  }

  if (team.type !== undefined && team.type !== "static" && team.type !== "dynamic") {
    return res.status(422).json({ errors: { type: ["must be static or dynamic"] } });
  }

  if (team.description !== undefined && team.description !== null && typeof team.description !== "string") {
    return res.status(422).json({ errors: { description: ["must be a string or null"] } });
  }

  if (team.memberIds !== undefined && (!Array.isArray(team.memberIds) || !team.memberIds.every(isNonEmptyString))) {
    return res.status(422).json({ errors: { memberIds: ["must be an array of user IDs"] } });
  }

  if (
    team.permissionOverrides !== undefined &&
    (!Array.isArray(team.permissionOverrides) || !team.permissionOverrides.every(validatePermissionEntry))
  ) {
    return res.status(422).json({ errors: { permissionOverrides: ["must be a valid permission list"] } });
  }

  if (team.dynamicFilter !== undefined && !validateDynamicFilterEntry(team.dynamicFilter)) {
    return res.status(422).json({
      errors: {
        dynamicFilter: ["must be an object with supported fields: designation, department, location, status"],
      },
    });
  }

  if (team.type === "dynamic" && !isPlainObject(team.dynamicFilter)) {
    return res.status(422).json({ errors: { dynamicFilter: ["is required for dynamic teams"] } });
  }

  if (team.type !== "dynamic" && team.dynamicFilter !== undefined) {
    return res.status(422).json({ errors: { dynamicFilter: ["is only allowed for dynamic teams"] } });
  }

  next();
}

function validateUpdateTeamPayload(req, res, next) {
  const team = req.body && req.body.team;

  if (!isPlainObject(team)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  const allowedFields = ["name", "description", "permissionOverrides", "dynamicFilter"];
  const keys = Object.keys(team);

  if (!keys.length || !keys.every((key) => allowedFields.includes(key))) {
    return res.status(422).json({ errors: { body: ["contains unsupported fields"] } });
  }

  if (Object.prototype.hasOwnProperty.call(team, "name") && !isNonEmptyString(team.name)) {
    return res.status(422).json({ errors: { name: ["can't be blank"] } });
  }

  if (Object.prototype.hasOwnProperty.call(team, "description") && team.description !== null && typeof team.description !== "string") {
    return res.status(422).json({ errors: { description: ["must be a string or null"] } });
  }

  if (
    Object.prototype.hasOwnProperty.call(team, "permissionOverrides") &&
    (!Array.isArray(team.permissionOverrides) || !team.permissionOverrides.every(validatePermissionEntry))
  ) {
    return res.status(422).json({ errors: { permissionOverrides: ["must be a valid permission list"] } });
  }

  if (
    Object.prototype.hasOwnProperty.call(team, "dynamicFilter") &&
    !validateDynamicFilterEntry(team.dynamicFilter)
  ) {
    return res.status(422).json({
      errors: {
        dynamicFilter: ["must be an object with supported fields: designation, department, location, status"],
      },
    });
  }

  next();
}

function validateAddMembersPayload(req, res, next) {
  const { userIds } = req.body || {};

  if (!Array.isArray(userIds) || !userIds.length || !userIds.every(isNonEmptyString)) {
    return res.status(422).json({ errors: { userIds: ["must be a non-empty array of user IDs"] } });
  }

  next();
}

function validateListDelegationsQuery(req, res, next) {
  const { status } = req.query || {};

  if (status !== undefined && !["active", "expired", "revoked"].includes(status)) {
    return res.status(422).json({ errors: { status: ["must be active, expired, or revoked"] } });
  }

  next();
}

function validateCreateDelegationPayload(req, res, next) {
  const delegation = req.body && req.body.delegation;

  if (!isPlainObject(delegation)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  if (!isNonEmptyString(delegation.delegateUserId) || !isNonEmptyString(delegation.startDate) || !isNonEmptyString(delegation.endDate)) {
    return res.status(422).json({ errors: { body: ["required fields: delegateUserId, startDate, endDate"] } });
  }

  if (delegation.reason !== undefined && delegation.reason !== null && typeof delegation.reason !== "string") {
    return res.status(422).json({ errors: { reason: ["must be a string or null"] } });
  }

  if (delegation.scope !== undefined && !validateDelegationScope(delegation.scope)) {
    return res.status(422).json({ errors: { scope: ["must be an object with modules and permissions arrays of non-empty strings"] } });
  }

  next();
}

function isPositiveInteger(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return false;
  }

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    return false;
  }

  return Number.parseInt(normalized, 10) > 0;
}

function validateListChannelsQuery(req, res, next) {
  const { search, type, categoryId, joined, limit, offset } = req.query || {};
  const validTypes = new Set(["public", "private", "announcement", "cross-org"]);

  if (rejectUnknownQueryParams(res, req.query, ["search", "type", "categoryId", "joined", "limit", "offset"])) {
    return;
  }

  if (search !== undefined && typeof search !== "string") {
    return res.status(422).json({ errors: { search: ["must be a string"] } });
  }

  if (type !== undefined && (!isNonEmptyString(type) || !validTypes.has(type))) {
    return res.status(422).json({ errors: { type: ["must be public, private, announcement, or cross-org"] } });
  }

  if (categoryId !== undefined && !isNonEmptyString(categoryId)) {
    return res.status(422).json({ errors: { categoryId: ["must be a non-empty string"] } });
  }

  if (joined !== undefined && joined !== "true" && joined !== "false") {
    return res.status(422).json({ errors: { joined: ["must be true or false"] } });
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(422).json({ errors: { limit: ["must be a non-negative integer"] } });
  }

  if (offset !== undefined && parseNonNegativeInteger(offset) === null) {
    return res.status(422).json({ errors: { offset: ["must be a non-negative integer"] } });
  }

  next();
}

function validateCreateChannelPayload(req, res, next) {
  const channel = req.body && req.body.channel;
  const validTypes = new Set(["public", "private", "announcement", "cross-org"]);

  if (!isPlainObject(channel)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  if (rejectUnknownPayloadFields(res, channel, ["name", "type", "description", "categoryId", "topic", "memberIds", "e2ee"])) {
    return;
  }

  if (!isNonEmptyString(channel.name) || !isNonEmptyString(channel.type)) {
    return res.status(422).json({ errors: { body: ["required fields: name, type"] } });
  }

  if (!validTypes.has(channel.type)) {
    return res.status(422).json({ errors: { type: ["is invalid"] } });
  }

  if (channel.type !== "private" && Object.prototype.hasOwnProperty.call(channel, "memberIds")) {
    return res.status(422).json({ errors: { memberIds: ["is only supported for private channels"] } });
  }

  if (channel.type !== "private" && Object.prototype.hasOwnProperty.call(channel, "e2ee")) {
    return res.status(422).json({ errors: { e2ee: ["is only supported for private channels"] } });
  }

  if (channel.description !== undefined && !isNullableString(channel.description)) {
    return res.status(422).json({ errors: { description: ["must be a string or null"] } });
  }

  if (channel.categoryId !== undefined && channel.categoryId !== null && !isNonEmptyString(channel.categoryId)) {
    return res.status(422).json({ errors: { categoryId: ["must be a non-empty string or null"] } });
  }

  if (channel.topic !== undefined && !isNullableString(channel.topic)) {
    return res.status(422).json({ errors: { topic: ["must be a string or null"] } });
  }

  if (channel.memberIds !== undefined) {
    if (!Array.isArray(channel.memberIds) || !channel.memberIds.every(isNonEmptyString)) {
      return res.status(422).json({ errors: { memberIds: ["must be an array of user IDs"] } });
    }
  }

  if (channel.e2ee !== undefined && typeof channel.e2ee !== "boolean") {
    return res.status(422).json({ errors: { e2ee: ["must be a boolean"] } });
  }

  next();
}

function validateUpdateChannelPayload(req, res, next) {
  const channel = req.body && req.body.channel;
  const validTypes = new Set(["public", "private", "announcement", "cross-org"]);

  if (!isPlainObject(channel)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  const allowedFields = ["name", "description", "topic", "categoryId", "type"];
  if (rejectUnknownPayloadFields(res, channel, allowedFields)) {
    return;
  }

  const hasAllowedField = allowedFields.some((field) => Object.prototype.hasOwnProperty.call(channel, field));
  if (!hasAllowedField) {
    return res.status(422).json({ errors: { body: ["at least one updatable field is required"] } });
  }

  if (channel.name !== undefined && !isNonEmptyString(channel.name)) {
    return res.status(422).json({ errors: { name: ["can't be blank"] } });
  }

  if (channel.description !== undefined && !isNullableString(channel.description)) {
    return res.status(422).json({ errors: { description: ["must be a string or null"] } });
  }

  if (channel.topic !== undefined && !isNullableString(channel.topic)) {
    return res.status(422).json({ errors: { topic: ["must be a string or null"] } });
  }

  if (channel.categoryId !== undefined && channel.categoryId !== null && !isNonEmptyString(channel.categoryId)) {
    return res.status(422).json({ errors: { categoryId: ["must be a non-empty string or null"] } });
  }

  if (channel.type !== undefined && (!isNonEmptyString(channel.type) || !validTypes.has(channel.type))) {
    return res.status(422).json({ errors: { type: ["is invalid"] } });
  }

  next();
}

function validateInviteChannelMembersPayload(req, res, next) {
  const { userIds } = req.body || {};

  if (rejectUnknownPayloadFields(res, req.body || {}, ["userIds"])) {
    return;
  }

  if (!Array.isArray(userIds) || !userIds.length || !userIds.every(isNonEmptyString)) {
    return res.status(422).json({ errors: { userIds: ["must be a non-empty array of user IDs"] } });
  }

  next();
}

function validateListChannelMembersQuery(req, res, next) {
  const { search, role, limit, offset } = req.query || {};
  const validRoles = new Set(["admin", "moderator", "member"]);

  if (rejectUnknownQueryParams(res, req.query, ["search", "role", "limit", "offset"])) {
    return;
  }

  if (search !== undefined && typeof search !== "string") {
    return res.status(422).json({ errors: { search: ["must be a string"] } });
  }

  if (role !== undefined && (!isNonEmptyString(role) || !validRoles.has(role))) {
    return res.status(422).json({ errors: { role: ["must be admin, moderator, or member"] } });
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(422).json({ errors: { limit: ["must be a non-negative integer"] } });
  }

  if (offset !== undefined && parseNonNegativeInteger(offset) === null) {
    return res.status(422).json({ errors: { offset: ["must be a non-negative integer"] } });
  }

  next();
}

function validateSetChannelMemberRolePayload(req, res, next) {
  const { role } = req.body || {};
  const validRoles = new Set(["admin", "moderator", "member"]);

  if (rejectUnknownPayloadFields(res, req.body || {}, ["role"])) {
    return;
  }

  if (!isNonEmptyString(role) || !validRoles.has(role)) {
    return res.status(422).json({ errors: { role: ["must be admin, moderator, or member"] } });
  }

  next();
}

function validateListCategoriesQuery(req, res, next) {
  if (rejectUnknownQueryParams(res, req.query, [])) {
    return;
  }

  next();
}

function validateCreateCategoryPayload(req, res, next) {
  const category = req.body && req.body.category;

  if (!isPlainObject(category)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  if (rejectUnknownPayloadFields(res, category, ["name", "position"])) {
    return;
  }

  if (!isNonEmptyString(category.name)) {
    return res.status(422).json({ errors: { name: ["can't be blank"] } });
  }

  if (category.position !== undefined && !isPositiveInteger(category.position)) {
    return res.status(422).json({ errors: { position: ["must be a positive integer"] } });
  }

  next();
}

function validateUpdateCategoryPayload(req, res, next) {
  const category = req.body && req.body.category;

  if (!isPlainObject(category)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  if (rejectUnknownPayloadFields(res, category, ["name", "position"])) {
    return;
  }

  const hasUpdatableField = Object.prototype.hasOwnProperty.call(category, "name")
    || Object.prototype.hasOwnProperty.call(category, "position");
  if (!hasUpdatableField) {
    return res.status(422).json({ errors: { body: ["at least one updatable field is required"] } });
  }

  if (category.name !== undefined && !isNonEmptyString(category.name)) {
    return res.status(422).json({ errors: { name: ["can't be blank"] } });
  }

  if (category.position !== undefined && !isPositiveInteger(category.position)) {
    return res.status(422).json({ errors: { position: ["must be a positive integer"] } });
  }

  next();
}

function validateReorderCategoriesPayload(req, res, next) {
  const { order } = req.body || {};

  if (rejectUnknownPayloadFields(res, req.body || {}, ["order"])) {
    return;
  }

  if (!Array.isArray(order) || !order.every(isNonEmptyString)) {
    return res.status(422).json({ errors: { order: ["must be an array of category IDs"] } });
  }

  next();
}

function validateListConversationsQuery(req, res, next) {
  const { type, search, limit, offset } = req.query || {};
  const validTypes = new Set(["dm", "group"]);

  if (rejectUnknownQueryParams(res, req.query, ["type", "search", "limit", "offset"])) {
    return;
  }

  if (type !== undefined && (!isNonEmptyString(type) || !validTypes.has(type))) {
    return res.status(422).json({ errors: { type: ["must be dm or group"] } });
  }

  if (search !== undefined && typeof search !== "string") {
    return res.status(422).json({ errors: { search: ["must be a string"] } });
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(422).json({ errors: { limit: ["must be a non-negative integer"] } });
  }

  if (offset !== undefined && parseNonNegativeInteger(offset) === null) {
    return res.status(422).json({ errors: { offset: ["must be a non-negative integer"] } });
  }

  next();
}

function validateCreateConversationPayload(req, res, next) {
  const conversation = req.body && req.body.conversation;

  if (!isPlainObject(conversation)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  if (rejectUnknownPayloadFields(res, conversation, ["type", "name", "participantIds"])) {
    return;
  }

  if (!isNonEmptyString(conversation.type) || !Array.isArray(conversation.participantIds) || !conversation.participantIds.length) {
    return res.status(422).json({ errors: { body: ["required fields: type, participantIds"] } });
  }

  if (!["dm", "group"].includes(conversation.type)) {
    return res.status(422).json({ errors: { type: ["must be dm or group"] } });
  }

  if (conversation.name !== undefined && !isNullableString(conversation.name)) {
    return res.status(422).json({ errors: { name: ["must be a string or null"] } });
  }

  if (!conversation.participantIds.every(isNonEmptyString)) {
    return res.status(422).json({ errors: { participantIds: ["must be an array of user IDs"] } });
  }

  next();
}

function validateConversationParticipantsPayload(req, res, next) {
  const { userIds } = req.body || {};

  if (rejectUnknownPayloadFields(res, req.body || {}, ["userIds"])) {
    return;
  }

  if (!Array.isArray(userIds) || !userIds.length || !userIds.every(isNonEmptyString)) {
    return res.status(422).json({ errors: { userIds: ["must be a non-empty array of user IDs"] } });
  }

  next();
}

function validateListMessagesQuery(req, res, next) {
  const { before, after, limit } = req.query || {};

  if (rejectUnknownQueryParams(res, req.query, ["before", "after", "limit"])) {
    return;
  }

  if (before !== undefined && !isNonEmptyString(before)) {
    return res.status(422).json({ errors: { before: ["must be a non-empty string"] } });
  }

  if (after !== undefined && !isNonEmptyString(after)) {
    return res.status(422).json({ errors: { after: ["must be a non-empty string"] } });
  }

  if (before !== undefined && after !== undefined) {
    return res.status(422).json({ errors: { body: ["before and after cannot be used together"] } });
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(422).json({ errors: { limit: ["must be a non-negative integer"] } });
  }

  next();
}

function validateCreateMessagePayload(req, res, next) {
  const message = req.body && req.body.message;

  if (!isPlainObject(message)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  if (rejectUnknownPayloadFields(res, message, ["body", "format", "attachments", "mentions", "replyTo", "encryption"])) {
    return;
  }

  if (!isNonEmptyString(message.body)) {
    return res.status(422).json({ errors: { body: ["required fields: body"] } });
  }

  if (message.format !== undefined && !["plaintext", "markdown", "encrypted"].includes(message.format)) {
    return res.status(422).json({ errors: { format: ["must be plaintext, markdown, or encrypted"] } });
  }

  if (message.replyTo !== undefined && message.replyTo !== null && !isNonEmptyString(message.replyTo)) {
    return res.status(422).json({ errors: { replyTo: ["must be a non-empty string or null"] } });
  }

  if (message.attachments !== undefined) {
    if (!Array.isArray(message.attachments)) {
      return res.status(422).json({ errors: { attachments: ["must be an array"] } });
    }

    const invalidAttachment = message.attachments.some((attachment) => {
      return !isPlainObject(attachment)
        || !isNonEmptyString(attachment.fileId)
        || !isNonEmptyString(attachment.filename)
        || !isNonEmptyString(attachment.mimeType)
        || Number.isNaN(Number(attachment.size));
    });

    if (invalidAttachment) {
      return res.status(422).json({ errors: { attachments: ["contains an invalid attachment"] } });
    }
  }

  if (message.mentions !== undefined && (!Array.isArray(message.mentions) || !message.mentions.every(isNonEmptyString))) {
    return res.status(422).json({ errors: { mentions: ["must be an array of user IDs"] } });
  }

  if (message.encryption !== undefined && !isPlainObject(message.encryption)) {
    return res.status(422).json({ errors: { encryption: ["must be an object"] } });
  }

  next();
}

function validateUpdateMessagePayload(req, res, next) {
  const message = req.body && req.body.message;

  if (!isPlainObject(message)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  if (rejectUnknownPayloadFields(res, message, ["body"])) {
    return;
  }

  if (!isNonEmptyString(message.body)) {
    return res.status(422).json({ errors: { body: ["required fields: body"] } });
  }

  next();
}

function validateThreadListQuery(req, res, next) {
  const { limit, offset } = req.query || {};

  if (rejectUnknownQueryParams(res, req.query, ["limit", "offset"])) {
    return;
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(422).json({ errors: { limit: ["must be a non-negative integer"] } });
  }

  if (offset !== undefined && parseNonNegativeInteger(offset) === null) {
    return res.status(422).json({ errors: { offset: ["must be a non-negative integer"] } });
  }

  next();
}

function validateReactionPayload(req, res, next) {
  const { emoji } = req.body || {};

  if (rejectUnknownPayloadFields(res, req.body || {}, ["emoji"])) {
    return;
  }

  if (!isNonEmptyString(emoji)) {
    return res.status(422).json({ errors: { emoji: ["can't be blank"] } });
  }

  next();
}

function validateBookmarksQuery(req, res, next) {
  const { limit, offset } = req.query || {};

  if (rejectUnknownQueryParams(res, req.query, ["limit", "offset"])) {
    return;
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(422).json({ errors: { limit: ["must be a non-negative integer"] } });
  }

  if (offset !== undefined && parseNonNegativeInteger(offset) === null) {
    return res.status(422).json({ errors: { offset: ["must be a non-negative integer"] } });
  }

  next();
}

function validateBookmarkPayload(req, res, next) {
  const { messageId } = req.body || {};

  if (rejectUnknownPayloadFields(res, req.body || {}, ["messageId"])) {
    return;
  }

  if (!isNonEmptyString(messageId)) {
    return res.status(422).json({ errors: { messageId: ["can't be blank"] } });
  }

  next();
}

function validateCreatePollPayload(req, res, next) {
  const poll = req.body && req.body.poll;

  if (!isPlainObject(poll)) {
    return res.status(422).json({ errors: { body: ["can't be blank"] } });
  }

  if (rejectUnknownPayloadFields(res, poll, ["question", "options", "multipleChoice", "anonymous", "expiresAt"])) {
    return;
  }

  if (!isNonEmptyString(poll.question) || !Array.isArray(poll.options) || !poll.options.length) {
    return res.status(422).json({ errors: { body: ["required fields: question, options"] } });
  }

  if (!poll.options.every(isNonEmptyString)) {
    return res.status(422).json({ errors: { options: ["must be an array of non-empty strings"] } });
  }

  if (poll.multipleChoice !== undefined && typeof poll.multipleChoice !== "boolean") {
    return res.status(422).json({ errors: { multipleChoice: ["must be a boolean"] } });
  }

  if (poll.anonymous !== undefined && typeof poll.anonymous !== "boolean") {
    return res.status(422).json({ errors: { anonymous: ["must be a boolean"] } });
  }

  if (poll.expiresAt !== undefined && poll.expiresAt !== null && !isNonEmptyString(poll.expiresAt)) {
    return res.status(422).json({ errors: { expiresAt: ["must be a valid ISO date string or null"] } });
  }

  next();
}

function validateVotePollPayload(req, res, next) {
  const { optionIndex } = req.body || {};

  if (rejectUnknownPayloadFields(res, req.body || {}, ["optionIndex"])) {
    return;
  }

  if (parseNonNegativeInteger(optionIndex) === null) {
    return res.status(422).json({ errors: { optionIndex: ["must be a non-negative integer"] } });
  }

  next();
}

function validateSearchMessagesQuery(req, res, next) {
  const { q, channelId, conversationId, senderId, from, to, hasAttachment, hasLink, isPinned, limit, offset } = req.query || {};

  if (rejectUnknownQueryParams(res, req.query, ["q", "channelId", "conversationId", "senderId", "from", "to", "hasAttachment", "hasLink", "isPinned", "limit", "offset"])) {
    return;
  }

  if (!isNonEmptyString(q)) {
    return res.status(422).json({ errors: { q: ["can't be blank"] } });
  }

  if (channelId !== undefined && !isNonEmptyString(channelId)) {
    return res.status(422).json({ errors: { channelId: ["must be a non-empty string"] } });
  }

  if (conversationId !== undefined && !isNonEmptyString(conversationId)) {
    return res.status(422).json({ errors: { conversationId: ["must be a non-empty string"] } });
  }

  if (senderId !== undefined && !isNonEmptyString(senderId)) {
    return res.status(422).json({ errors: { senderId: ["must be a non-empty string"] } });
  }

  const booleanFields = { hasAttachment, hasLink, isPinned };
  for (const [field, value] of Object.entries(booleanFields)) {
    if (value !== undefined && value !== "true" && value !== "false") {
      return res.status(422).json({ errors: { [field]: ["must be true or false"] } });
    }
  }

  if (limit !== undefined && parseNonNegativeInteger(limit) === null) {
    return res.status(422).json({ errors: { limit: ["must be a non-negative integer"] } });
  }

  if (offset !== undefined && parseNonNegativeInteger(offset) === null) {
    return res.status(422).json({ errors: { offset: ["must be a non-negative integer"] } });
  }

  if (from !== undefined && !isNonEmptyString(from)) {
    return res.status(422).json({ errors: { from: ["must be a valid ISO date string"] } });
  }

  if (to !== undefined && !isNonEmptyString(to)) {
    return res.status(422).json({ errors: { to: ["must be a valid ISO date string"] } });
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
  validateListRolesQuery,
  validateCreateRolePayload,
  validateUpdateRolePayload,
  validateAssignRolePayload,
  validateEffectivePermissionsQuery,
  validateListTeamsQuery,
  validateCreateTeamPayload,
  validateUpdateTeamPayload,
  validateAddMembersPayload,
  validateListDelegationsQuery,
  validateCreateDelegationPayload,
  validateListChannelsQuery,
  validateCreateChannelPayload,
  validateUpdateChannelPayload,
  validateInviteChannelMembersPayload,
  validateListChannelMembersQuery,
  validateSetChannelMemberRolePayload,
  validateListCategoriesQuery,
  validateCreateCategoryPayload,
  validateUpdateCategoryPayload,
  validateReorderCategoriesPayload,
  validateListConversationsQuery,
  validateCreateConversationPayload,
  validateConversationParticipantsPayload,
  validateListMessagesQuery,
  validateCreateMessagePayload,
  validateUpdateMessagePayload,
  validateThreadListQuery,
  validateReactionPayload,
  validateBookmarksQuery,
  validateBookmarkPayload,
  validateCreatePollPayload,
  validateVotePollPayload,
  validateSearchMessagesQuery,
};
