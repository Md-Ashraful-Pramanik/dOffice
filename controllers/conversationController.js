const messagingService = require("../services/messagingService");

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
    const response = await messagingService.createConversation(req.auth.user, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function addConversationParticipants(req, res, next) {
  try {
    const response = await messagingService.addConversationParticipants(req.auth.user, req.params.conversationId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function removeConversationParticipant(req, res, next) {
  try {
    await messagingService.removeConversationParticipant(req.auth.user, req.params.conversationId, req.params.userId);
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
