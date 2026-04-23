const authService = require("../services/authService");

async function register(req, res, next) {
  try {
    const response = await authService.registerSuperAdmin(req.body.user);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const response = await authService.login(req.body.user);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function logout(req, res, next) {
  try {
    const response = await authService.logout(req.auth.sessionId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  logout,
};
