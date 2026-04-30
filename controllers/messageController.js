const messagingService = require("../services/messagingService");

function setAudit(res, action, metadata) {
  res.locals.auditAction = action;
  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    ...(metadata || {}),
  };
}

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
    setAudit(res, "channel.message.create", {
      channelId: req.params.channelId,
      messageId: response.message.id,
      format: response.message.format,
      attachmentCount: Array.isArray(response.message.attachments) ? response.message.attachments.length : 0,
      mentionCount: Array.isArray(response.message.mentions) ? response.message.mentions.length : 0,
      isThreadReply: Boolean(response.message.threadParentId),
      isReply: Boolean(response.message.replyTo),
    });
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
    setAudit(res, "message.update", {
      messageId: req.params.messageId,
      targetType: response.message.targetType,
      targetId: response.message.targetId,
    });
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function updateChannelMessage(req, res, next) {
  try {
    const channelId = req.params.channelId || req.params.channel_id;
    const messageId = req.params.messageId || req.params.msgId || req.params.msg_id;
    const response = await messagingService.updateChannelMessage(req.auth.user, channelId, messageId, req.body);
    setAudit(res, "message.update", {
      messageId,
      targetType: response.message.targetType,
      targetId: response.message.targetId,
    });
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function deleteMessage(req, res, next) {
  try {
    await messagingService.deleteMessage(req.auth.user, req.params.messageId);
    setAudit(res, "message.delete", {
      messageId: req.params.messageId,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function deleteChannelMessage(req, res, next) {
  try {
    const channelId = req.params.channelId || req.params.channel_id;
    const messageId = req.params.messageId || req.params.msgId || req.params.msg_id;
    await messagingService.deleteChannelMessage(req.auth.user, channelId, messageId);
    setAudit(res, "message.delete", {
      messageId,
      channelId,
    });
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
    setAudit(res, "message.thread.reply", {
      parentMessageId: req.params.messageId,
      messageId: response.message.id,
      targetType: response.message.targetType,
      targetId: response.message.targetId,
    });
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function addReaction(req, res, next) {
  try {
    const response = await messagingService.addReaction(req.auth.user, req.params.messageId, req.body);
    setAudit(res, "message.reaction.add", {
      messageId: req.params.messageId,
      emoji: req.body?.emoji,
      reactionCount: Array.isArray(response.reactions) ? response.reactions.length : 0,
    });
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function removeReaction(req, res, next) {
  try {
    await messagingService.removeReaction(req.auth.user, req.params.messageId, req.params.emoji);
    setAudit(res, "message.reaction.remove", {
      messageId: req.params.messageId,
      emoji: req.params.emoji,
    });
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
    setAudit(res, "message.pin", {
      messageId: req.params.messageId,
      channelId: response.message.targetId,
    });
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function unpinMessage(req, res, next) {
  try {
    await messagingService.unpinMessage(req.auth.user, req.params.messageId);
    setAudit(res, "message.unpin", {
      messageId: req.params.messageId,
    });
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
    setAudit(res, "bookmark.add", {
      messageId: req.body?.messageId,
    });
    res.status(201).send();
  } catch (error) {
    next(error);
  }
}

async function removeBookmark(req, res, next) {
  try {
    await messagingService.removeBookmark(req.auth.user, req.params.messageId);
    setAudit(res, "bookmark.remove", {
      messageId: req.params.messageId,
    });
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
  updateChannelMessage,
  deleteMessage,
  deleteChannelMessage,
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
