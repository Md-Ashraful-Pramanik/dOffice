const auditService = require("../services/auditService");

function attachAuditLogger(req, res, next) {
  res.on("finish", async () => {
    if (!req.originalUrl.startsWith("/api")) {
      return;
    }

    const userId = req.auth?.user?.id || res.locals.auditUserId || null;
    if (!userId) {
      return;
    }

    try {
      await auditService.recordAudit({
        userId,
        method: req.method,
        endpoint: req.originalUrl,
        statusCode: res.statusCode,
        metadata: {
          ip: req.ip,
          userAgent: req.get("user-agent") || null,
        },
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
