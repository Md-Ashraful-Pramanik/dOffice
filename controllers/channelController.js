const channelService = require("../services/channelService");

function setAudit(res, action, metadata) {
  res.locals.auditAction = action;
  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    ...(metadata || {}),
  };
}

async function listChannels(req, res, next) {
  try {
    const response = await channelService.listChannels(req.auth.user, req.params.orgId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function getChannel(req, res, next) {
  try {
    const response = await channelService.getChannel(req.auth.user, req.params.channelId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function createChannel(req, res, next) {
  try {
    const response = await channelService.createChannel(req.auth.user, req.params.orgId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function updateChannel(req, res, next) {
  try {
    const response = await channelService.updateChannel(req.auth.user, req.params.channelId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function deleteChannel(req, res, next) {
  try {
    await channelService.deleteChannel(req.auth.user, req.params.channelId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function joinChannel(req, res, next) {
  try {
    const response = await channelService.joinChannel(req.auth.user, req.params.channelId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function leaveChannel(req, res, next) {
  try {
    await channelService.leaveChannel(req.auth.user, req.params.channelId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function inviteToChannel(req, res, next) {
  try {
    const response = await channelService.inviteToChannel(req.auth.user, req.params.channelId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function removeMember(req, res, next) {
  try {
    await channelService.removeMember(req.auth.user, req.params.channelId, req.params.userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function listChannelMembers(req, res, next) {
  try {
    const response = await channelService.listChannelMembers(req.auth.user, req.params.channelId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function setChannelMemberRole(req, res, next) {
  try {
    const response = await channelService.setChannelMemberRole(req.auth.user, req.params.channelId, req.params.userId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function setSlowMode(req, res, next) {
  try {
    const response = await channelService.setSlowMode(req.auth.user, req.params.channelId, req.body);
    setAudit(res, "channel.slow_mode.update", {
      channelId: req.params.channelId,
      intervalSeconds: req.body?.intervalSeconds,
    });
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  joinChannel,
  leaveChannel,
  inviteToChannel,
  removeMember,
  listChannelMembers,
  setChannelMemberRole,
  setSlowMode,
};
