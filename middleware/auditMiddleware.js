const auditService = require("../services/auditService");

function attachAuditLogger(req, res, next) {
  res.once("finish", async () => {
    if (!req.originalUrl.startsWith("/api")) {
      return;
    }

    const userId = req.auth?.user?.id || res.locals.auditUserId || null;
    if (!userId) {
      return;
    }

    try {
      const auditMetadata = {
        ip: req.ip,
        userAgent: req.get("user-agent") || null,
        ...(res.locals.auditMetadata || {}),
      };

      await auditService.recordAudit({
        userId,
        method: req.method,
        endpoint: req.originalUrl,
        statusCode: res.statusCode,
        action: res.locals.auditAction,
        metadata: auditMetadata,
      });
    } catch (error) {
      console.error("Failed to write audit log", error.message);
    }
  });

  next();
}

module.exports = {
  attachAuditLogger,
};
