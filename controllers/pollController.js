const messagingService = require("../services/messagingService");

async function createPoll(req, res, next) {
  try {
    const response = await messagingService.createPoll(req.auth.user, req.params.channelId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function voteOnPoll(req, res, next) {
  try {
    const response = await messagingService.voteOnPoll(req.auth.user, req.params.pollId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function getPoll(req, res, next) {
  try {
    const response = await messagingService.getPoll(req.auth.user, req.params.pollId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createPoll,
  voteOnPoll,
  getPoll,
};
