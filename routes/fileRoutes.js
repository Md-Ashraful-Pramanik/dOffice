const express = require("express");

const fileController = require("../controllers/fileController");
const { requireAuth } = require("../middleware/authMiddleware");
const { upload } = require("../middleware/uploadMiddleware");
const { validateUploadFilePayload } = require("../middleware/validationMiddleware");

const router = express.Router();

router.post(
  "/files",
  requireAuth,
  upload.single("file"),
  validateUploadFilePayload,
  fileController.uploadFile
);

router.get(
  "/files/:fileId",
  requireAuth,
  fileController.getFileMetadata
);

router.get(
  "/files/:fileId/download",
  requireAuth,
  fileController.downloadFile
);

router.delete(
  "/files/:fileId",
  requireAuth,
  fileController.deleteFile
);

module.exports = router;
