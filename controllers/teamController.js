const teamService = require("../services/teamService");

async function listTeams(req, res, next) {
  try {
    const response = await teamService.listTeams(req.auth.user, req.params.orgId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function getTeam(req, res, next) {
  try {
    const response = await teamService.getTeam(req.auth.user, req.params.orgId, req.params.teamId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function createTeam(req, res, next) {
  try {
    const response = await teamService.createTeam(req.auth.user, req.params.orgId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function updateTeam(req, res, next) {
  try {
    const response = await teamService.updateTeam(req.auth.user, req.params.orgId, req.params.teamId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function deleteTeam(req, res, next) {
  try {
    await teamService.deleteTeam(req.auth.user, req.params.orgId, req.params.teamId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function addMembers(req, res, next) {
  try {
    const response = await teamService.addMembers(req.auth.user, req.params.orgId, req.params.teamId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function removeMember(req, res, next) {
  try {
    await teamService.removeMember(req.auth.user, req.params.orgId, req.params.teamId, req.params.userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listTeams,
  getTeam,
  createTeam,
  updateTeam,
  deleteTeam,
  addMembers,
  removeMember,
};
