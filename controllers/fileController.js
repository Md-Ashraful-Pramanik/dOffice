const fileService = require("../services/fileService");

function setAudit(res, action, metadata) {
  res.locals.auditAction = action;
  res.locals.auditMetadata = {
    ...(res.locals.auditMetadata || {}),
    ...(metadata || {}),
  };
}

async function uploadFile(req, res, next) {
  try {
    const response = await fileService.uploadFile(req.auth.user, {
      orgId: req.body?.orgId,
      context: req.body?.context,
      contextId: req.body?.contextId,
      file: req.file,
    });
    setAudit(res, "file.upload", {
      fileId: response.file.id,
      orgId: response.file.orgId,
      context: req.body?.context,
      contextId: req.body?.contextId || null,
    });
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

async function getFileMetadata(req, res, next) {
  try {
    const response = await fileService.getFileMetadata(req.auth.user, req.params.fileId);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

async function downloadFile(req, res, next) {
  try {
    const response = await fileService.getFileDownload(req.auth.user, req.params.fileId);
    res.setHeader("Content-Type", response.file.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename=\"${response.file.filename}\"`);
    response.stream.on("error", next);
    response.stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

async function deleteFile(req, res, next) {
  try {
    await fileService.deleteFile(req.auth.user, req.params.fileId);
    setAudit(res, "file.delete", {
      fileId: req.params.fileId,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  uploadFile,
  getFileMetadata,
  downloadFile,
  deleteFile,
};
