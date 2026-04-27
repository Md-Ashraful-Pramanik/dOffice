const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const db = require("../config/db");
const channelModel = require("../models/channelModel");
const fileModel = require("../models/fileModel");
const messagingModel = require("../models/messagingModel");
const { generateId } = require("../utils/id");
const {
  assert,
  getAccessContext,
  assertOrgAccess,
} = require("./accessService");

const FILE_CONTEXTS = new Set(["channel", "conversation", "avatar"]);

function normalizeRequiredString(value, fieldName) {
  const normalized = typeof value === "string" ? value.trim() : "";
  assert(normalized, `${fieldName} is required.`, 422);
  return normalized;
}

function resolveUploadsDirectory() {
  return path.resolve(process.cwd(), "uploads");
}

function toFileObject(row) {
  return {
    file: {
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: Number(row.size || 0),
      url: `/api/v1/files/${row.id}/download`,
      uploadedBy: row.uploaded_by,
      orgId: row.org_id,
      createdAt: row.created_at,
    },
  };
}

async function assertChannelFileAccess(authUser, file, client = db) {
  const accessContext = await getAccessContext(authUser, client);
  assertOrgAccess(file.org_id, accessContext);

  const channel = await channelModel.findById(file.context_id, client);
  assert(channel, "Resource not found.", 404);

  if (channel.type === "private") {
    const membership = await channelModel.findMembership(channel.id, authUser.id, client);
    assert(membership || accessContext.isOrgAdmin || accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);
  }

  return accessContext;
}

async function assertConversationFileAccess(authUser, file, client = db) {
  const conversation = await messagingModel.findConversationById(file.context_id, client);
  assert(conversation, "Resource not found.", 404);

  const participant = await messagingModel.findConversationParticipant(file.context_id, authUser.id, client);
  assert(participant, "You do not have permission to perform this action.", 403);

  return null;
}

async function assertFileAccess(authUser, file, client = db) {
  if (file.context === "conversation") {
    return assertConversationFileAccess(authUser, file, client);
  }

  if (file.context === "channel") {
    return assertChannelFileAccess(authUser, file, client);
  }

  const accessContext = await getAccessContext(authUser, client);
  assertOrgAccess(file.org_id, accessContext);
  return accessContext;
}

async function validateFileContext(authUser, context, contextId, orgId, client = db) {
  if (context === "avatar") {
    return;
  }

  assert(contextId, "contextId is required for this context.", 422);

  if (context === "channel") {
    const channel = await channelModel.findById(contextId, client);
    assert(channel, "Resource not found.", 404);
    assert(channel.org_id === orgId, "Resource not found.", 404);

    if (channel.type === "private") {
      const accessContext = await getAccessContext(authUser, client);
      const membership = await channelModel.findMembership(channel.id, authUser.id, client);
      assert(membership || accessContext.isOrgAdmin || accessContext.isSuperAdmin, "You do not have permission to perform this action.", 403);
    }

    return;
  }

  const conversation = await messagingModel.findConversationById(contextId, client);
  assert(conversation, "Resource not found.", 404);
  const participant = await messagingModel.findConversationParticipant(contextId, authUser.id, client);
  assert(participant, "You do not have permission to perform this action.", 403);
}

async function uploadFile(authUser, input) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const orgId = normalizeRequiredString(input?.orgId, "orgId");
    const context = normalizeRequiredString(input?.context, "context").toLowerCase();
    const contextId = input?.contextId ? String(input.contextId).trim() : null;
    const file = input?.file;

    assert(FILE_CONTEXTS.has(context), "context is invalid.", 422);
    assert(file, "file is required.", 422);

    const accessContext = await getAccessContext(authUser, client);
    assertOrgAccess(orgId, accessContext);

    await validateFileContext(authUser, context, contextId, orgId, client);

    const uploadsDir = resolveUploadsDirectory();
    await fsp.mkdir(uploadsDir, { recursive: true });

    const fileId = generateId("file");
    const extension = path.extname(file.originalname || "");
    const safeExt = extension ? extension.slice(0, 16) : "";
    const storageFilename = `${fileId}${safeExt}`;
    const storagePath = path.join(uploadsDir, storageFilename);

    await fsp.writeFile(storagePath, file.buffer);

    const created = await fileModel.createFile(
      {
        id: fileId,
        orgId,
        uploadedBy: authUser.id,
        context,
        contextId,
        filename: file.originalname || storageFilename,
        mimeType: file.mimetype || "application/octet-stream",
        size: file.size || 0,
        storagePath,
      },
      client
    );

    await client.query("COMMIT");
    return toFileObject(created);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getFileMetadata(authUser, fileId) {
  const file = await fileModel.findById(fileId);
  assert(file, "Resource not found.", 404);

  await assertFileAccess(authUser, file);
  return toFileObject(file);
}

async function getFileDownload(authUser, fileId) {
  const file = await fileModel.findById(fileId);
  assert(file, "Resource not found.", 404);

  await assertFileAccess(authUser, file);
  assert(fs.existsSync(file.storage_path), "Resource not found.", 404);

  return {
    file,
    stream: fs.createReadStream(file.storage_path),
  };
}

async function deleteFile(authUser, fileId) {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const file = await fileModel.findById(fileId, client);
    assert(file, "Resource not found.", 404);

    const accessContext = await assertFileAccess(authUser, file, client);
    const canDelete = file.uploaded_by === authUser.id || Boolean(accessContext?.isOrgAdmin || accessContext?.isSuperAdmin);
    assert(canDelete, "You do not have permission to perform this action.", 403);

    await fileModel.softDeleteFile(fileId, authUser.id, client);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  uploadFile,
  getFileMetadata,
  getFileDownload,
  deleteFile,
};
