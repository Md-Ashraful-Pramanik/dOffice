const messagingService = require("../services/messagingService");

function setAudit(res, action, metadata) {
  res.locals.auditAction = action;
  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    ...(metadata || {}),
  };
}

async function createPoll(req, res, next) {
  try {
    const response = await messagingService.createPoll(req.auth.user, req.params.channelId, req.body);
    setAudit(res, "poll.create", {
      pollId: response.poll.id,
      channelId: req.params.channelId,
      optionCount: Array.isArray(response.poll.options) ? response.poll.options.length : 0,
      multipleChoice: response.poll.multipleChoice,
      anonymous: response.poll.anonymous,
    });
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function voteOnPoll(req, res, next) {
  try {
    const response = await messagingService.voteOnPoll(req.auth.user, req.params.pollId, req.body);
    setAudit(res, "poll.vote", {
      pollId: req.params.pollId,
      optionIndex: req.body?.optionIndex,
      totalVotes: response.poll.totalVotes,
    });
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
