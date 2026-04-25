const channelCategoryService = require("../services/channelCategoryService");

async function listCategories(req, res, next) {
  try {
    const response = await channelCategoryService.listCategories(req.auth.user, req.params.orgId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function createCategory(req, res, next) {
  try {
    const response = await channelCategoryService.createCategory(req.auth.user, req.params.orgId, req.body);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const response = await channelCategoryService.updateCategory(req.auth.user, req.params.orgId, req.params.categoryId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function deleteCategory(req, res, next) {
  try {
    await channelCategoryService.deleteCategory(req.auth.user, req.params.orgId, req.params.categoryId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function reorderCategories(req, res, next) {
  try {
    const response = await channelCategoryService.reorderCategories(req.auth.user, req.params.orgId, req.body);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
};
