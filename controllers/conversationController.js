const messagingService = require("../services/messagingService");

function setAudit(res, action, metadata) {
  res.locals.auditAction = action;
  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    ...(metadata || {}),
  };
}

async function listConversations(req, res, next) {
  try {
    const response = await messagingService.listConversations(req.auth.user, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function getConversation(req, res, next) {
  try {
    const response = await messagingService.getConversation(req.auth.user, req.params.conversationId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function createConversation(req, res, next) {
  try {
    const { response, created } = await messagingService.createConversation(req.auth.user, req.body);
    setAudit(res, "conversation.create", {
      conversationId: response.conversation.id,
      type: response.conversation.type,
      participantCount: Array.isArray(response.conversation.participants) ? response.conversation.participants.length : 0,
    });
    res.status(created ? 201 : 200).json(response);
  } catch (error) {
    next(error);
  }
}

async function addConversationParticipants(req, res, next) {
  try {
    const response = await messagingService.addConversationParticipants(req.auth.user, req.params.conversationId, req.body);
    setAudit(res, "conversation.participants.add", {
      conversationId: req.params.conversationId,
      userIds: req.body?.userIds || [],
      participantCount: Array.isArray(response.conversation?.participants) ? response.conversation.participants.length : undefined,
    });
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function removeConversationParticipant(req, res, next) {
  try {
    await messagingService.removeConversationParticipant(req.auth.user, req.params.conversationId, req.params.userId);
    setAudit(res, "conversation.participant.remove", {
      conversationId: req.params.conversationId,
      removedUserId: req.params.userId,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function listConversationMessages(req, res, next) {
  try {
    const response = await messagingService.listConversationMessages(req.auth.user, req.params.conversationId, req.query);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function sendConversationMessage(req, res, next) {
  try {
    const response = await messagingService.sendConversationMessage(req.auth.user, req.params.conversationId, req.body);
    setAudit(res, "conversation.message.create", {
      conversationId: req.params.conversationId,
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

module.exports = {
  listConversations,
  getConversation,
  createConversation,
  addConversationParticipants,
  removeConversationParticipant,
  listConversationMessages,
  sendConversationMessage,
};
