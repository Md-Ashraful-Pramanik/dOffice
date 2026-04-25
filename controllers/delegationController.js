const delegationService = require("../services/delegationService");

async function listDelegations(req, res, next) {
  try {
    const response = await delegationService.listDelegations(req.auth.user, req.params.userId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function createDelegation(req, res, next) {
  try {
    const response = await delegationService.createDelegation(req.auth.user, req.params.userId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function revokeDelegation(req, res, next) {
  try {
    await delegationService.revokeDelegation(req.auth.user, req.params.userId, req.params.delegationId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listDelegations,
  createDelegation,
  revokeDelegation,
};
