const authService = require("../services/authService");

async function getCurrentUser(req, res, next) {
  try {
    const response = await authService.getCurrentUser(req.auth.user.id);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCurrentUser,
};
