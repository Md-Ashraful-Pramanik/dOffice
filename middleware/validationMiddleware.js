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

  if (!organization || typeof organization !== "object") {
    return res.status(400).json({ error: "Invalid request body. Expected organization object." });
  }

  const { name, code } = organization;

  if (!name || !code) {
    return res.status(400).json({ error: "Required fields: name, code." });
  }

  next();
}

function validateUpdateOrganizationPayload(req, res, next) {
  const organization = req.body && req.body.organization;

  if (!organization || typeof organization !== "object") {
    return res.status(400).json({ error: "Invalid request body. Expected organization object." });
  }

  const allowedFields = ["name", "code", "logo", "type", "metadata"];
  const hasAllowedField = allowedFields.some((field) => Object.prototype.hasOwnProperty.call(organization, field));

  if (!hasAllowedField) {
    return res.status(400).json({ error: "At least one updatable field is required." });
  }

  next();
}

function validateMoveOrganizationPayload(req, res, next) {
  const { newParentId } = req.body || {};

  if (!newParentId) {
    return res.status(400).json({ error: "Required field: newParentId." });
  }

  next();
}

function validateMergeOrganizationsPayload(req, res, next) {
  const { sourceOrgId, targetOrgId } = req.body || {};

  if (!sourceOrgId || !targetOrgId) {
    return res.status(400).json({ error: "Required fields: sourceOrgId, targetOrgId." });
  }

  next();
}

function validateCloneOrganizationPayload(req, res, next) {
  const { newName, newCode } = req.body || {};

  if (!newName || !newCode) {
    return res.status(400).json({ error: "Required fields: newName, newCode." });
  }

  next();
}

module.exports = {
  validateRegisterPayload,
  validateLoginPayload,
  validateCreateOrganizationPayload,
  validateUpdateOrganizationPayload,
  validateMoveOrganizationPayload,
  validateMergeOrganizationsPayload,
  validateCloneOrganizationPayload,
};
