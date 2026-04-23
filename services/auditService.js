const auditModel = require("../models/auditModel");

async function recordAudit(payload) {
  if (!payload?.userId) {
    return null;
  }

  const action = payload.action || `${payload.method} ${payload.endpoint}`;

  return auditModel.createAudit({
    userId: payload.userId,
    action,
    method: payload.method,
    endpoint: payload.endpoint,
    statusCode: payload.statusCode,
    metadata: payload.metadata || {},
  });
}

async function getAuditsForUser(userId) {
  const audits = await auditModel.listAuditsByUserId(userId);
  return {
    audits,
  };
}

module.exports = {
  recordAudit,
  getAuditsForUser,
};
