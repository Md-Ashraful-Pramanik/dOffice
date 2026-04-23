const auditService = require("../services/auditService");

async function getAudits(req, res, next) {
  try {
    const response = await auditService.getAuditsForUser(req.auth.user.id);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAudits,
};
