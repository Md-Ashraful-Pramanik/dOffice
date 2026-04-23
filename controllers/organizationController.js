const organizationService = require("../services/organizationService");

async function listOrganizations(req, res, next) {
  try {
    const response = await organizationService.listOrganizations(req.auth.user, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function getOrganizationTree(req, res, next) {
  try {
    const response = await organizationService.getOrganizationTree(req.auth.user, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function getOrganization(req, res, next) {
  try {
    const response = await organizationService.getOrganization(req.auth.user, req.params.orgId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function createOrganization(req, res, next) {
  try {
    const response = await organizationService.createOrganization(req.auth.user, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function createSubOrganization(req, res, next) {
  try {
    const response = await organizationService.createSubOrganization(req.auth.user, req.params.orgId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function updateOrganization(req, res, next) {
  try {
    const response = await organizationService.updateOrganization(req.auth.user, req.params.orgId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function moveOrganization(req, res, next) {
  try {
    const response = await organizationService.moveOrganization(req.auth.user, req.params.orgId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function mergeOrganizations(req, res, next) {
  try {
    const response = await organizationService.mergeOrganizations(req.auth.user, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function cloneOrganization(req, res, next) {
  try {
    const response = await organizationService.cloneOrganization(req.auth.user, req.params.orgId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function archiveOrganization(req, res, next) {
  try {
    const response = await organizationService.archiveOrganization(req.auth.user, req.params.orgId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function restoreOrganization(req, res, next) {
  try {
    const response = await organizationService.restoreOrganization(req.auth.user, req.params.orgId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function deleteOrganization(req, res, next) {
  try {
    await organizationService.deleteOrganization(req.auth.user, req.params.orgId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listOrganizations,
  getOrganizationTree,
  getOrganization,
  createOrganization,
  createSubOrganization,
  updateOrganization,
  moveOrganization,
  mergeOrganizations,
  cloneOrganization,
  archiveOrganization,
  restoreOrganization,
  deleteOrganization,
};
