const moderationService = require("../services/moderationService");

function setAudit(res, action, metadata) {
  res.locals.auditAction = action;
  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    ...(metadata || {}),
  };
}

async function reportMessage(req, res, next) {
  try {
    const response = await moderationService.reportMessage(req.auth.user, req.params.messageId, req.body);
    setAudit(res, "message.report", {
      messageId: req.params.messageId,
      reportId: response.report.id,
      reason: response.report.reason,
    });
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function listReportedMessages(req, res, next) {
  try {
    const response = await moderationService.listReportedMessages(req.auth.user, req.params.orgId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function resolveReport(req, res, next) {
  try {
    const response = await moderationService.resolveReport(req.auth.user, req.params.orgId, req.params.reportId, req.body);
    setAudit(res, "message.report.resolve", {
      orgId: req.params.orgId,
      reportId: req.params.reportId,
      action: req.body?.action,
    });
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  reportMessage,
  listReportedMessages,
  resolveReport,
};
