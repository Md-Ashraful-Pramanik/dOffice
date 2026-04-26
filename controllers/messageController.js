const messagingService = require("../services/messagingService");

async function listChannelMessages(req, res, next) {
  try {
    const response = await messagingService.listChannelMessages(req.auth.user, req.params.channelId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function sendChannelMessage(req, res, next) {
  try {
    const response = await messagingService.sendChannelMessage(req.auth.user, req.params.channelId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function getMessage(req, res, next) {
  try {
    const response = await messagingService.getMessage(req.auth.user, req.params.messageId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function updateMessage(req, res, next) {
  try {
    const response = await messagingService.updateMessage(req.auth.user, req.params.messageId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function deleteMessage(req, res, next) {
  try {
    await messagingService.deleteMessage(req.auth.user, req.params.messageId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function getMessageEditHistory(req, res, next) {
  try {
    const response = await messagingService.getMessageEditHistory(req.auth.user, req.params.messageId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function listThreadMessages(req, res, next) {
  try {
    const response = await messagingService.listThreadMessages(req.auth.user, req.params.messageId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function replyInThread(req, res, next) {
  try {
    const response = await messagingService.replyInThread(req.auth.user, req.params.messageId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function addReaction(req, res, next) {
  try {
    const response = await messagingService.addReaction(req.auth.user, req.params.messageId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function removeReaction(req, res, next) {
  try {
    await messagingService.removeReaction(req.auth.user, req.params.messageId, req.params.emoji);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function listPinnedMessages(req, res, next) {
  try {
    const response = await messagingService.listPinnedMessages(req.auth.user, req.params.channelId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function pinMessage(req, res, next) {
  try {
    const response = await messagingService.pinMessage(req.auth.user, req.params.messageId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function unpinMessage(req, res, next) {
  try {
    await messagingService.unpinMessage(req.auth.user, req.params.messageId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function listBookmarks(req, res, next) {
  try {
    const response = await messagingService.listBookmarks(req.auth.user, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function addBookmark(req, res, next) {
  try {
    await messagingService.addBookmark(req.auth.user, req.body);
    res.status(201).send();
  } catch (error) {
    next(error);
  }
}

async function removeBookmark(req, res, next) {
  try {
    await messagingService.removeBookmark(req.auth.user, req.params.messageId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function searchMessages(req, res, next) {
  try {
    const response = await messagingService.searchMessages(req.auth.user, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listChannelMessages,
  sendChannelMessage,
  getMessage,
  updateMessage,
  deleteMessage,
  getMessageEditHistory,
  listThreadMessages,
  replyInThread,
  addReaction,
  removeReaction,
  listPinnedMessages,
  pinMessage,
  unpinMessage,
  listBookmarks,
  addBookmark,
  removeBookmark,
  searchMessages,
};
