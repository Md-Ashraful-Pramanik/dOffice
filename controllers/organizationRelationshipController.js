const relationshipService = require("../services/organizationRelationshipService");

async function listRelationships(req, res, next) {
  try {
    const response = await relationshipService.listRelationships(req.auth.user, req.params.orgId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function createRelationship(req, res, next) {
  try {
    const response = await relationshipService.createRelationship(req.auth.user, req.params.orgId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function deleteRelationship(req, res, next) {
  try {
    await relationshipService.deleteRelationship(req.auth.user, req.params.orgId, req.params.relationshipId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listRelationships,
  createRelationship,
  deleteRelationship,
};
