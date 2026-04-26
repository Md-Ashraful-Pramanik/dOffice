const db = require("../config/db");

async function createFile(payload, client = db) {
  const {
    id,
    orgId,
    uploadedBy,
    context,
    contextId,
    filename,
    mimeType,
    size,
    storagePath,
  } = payload;

  const result = await client.query(
    `INSERT INTO doffice_uploaded_files (
      id, org_id, uploaded_by, context, context_id, filename, mime_type, size, storage_path
    ) VALUES (
      $1::varchar(64),
      $2::varchar(64),
      $3::varchar(64),
      $4::varchar(32),
      $5::varchar(64),
      $6::varchar(255),
      $7::varchar(255),
      $8::bigint,
      $9::text
    )
    RETURNING id, org_id, uploaded_by, context, context_id, filename, mime_type, size, storage_path, created_at`,
    [id, orgId, uploadedBy, context, contextId || null, filename, mimeType, size, storagePath]
  );

  return result.rows[0] || null;
}

async function findById(fileId, client = db) {
  const result = await client.query(
    `SELECT id, org_id, uploaded_by, context, context_id, filename, mime_type, size, storage_path, created_at, updated_at
     FROM doffice_uploaded_files
     WHERE id = $1::varchar(64)
       AND deleted_at IS NULL
     LIMIT 1`,
    [fileId]
  );

  return result.rows[0] || null;
}

async function softDeleteFile(fileId, deletedBy, client = db) {
  const result = await client.query(
    `UPDATE doffice_uploaded_files
     SET deleted_at = NOW(),
         deleted_by = $2::varchar(64),
         updated_at = NOW()
     WHERE id = $1::varchar(64)
       AND deleted_at IS NULL
     RETURNING id`,
    [fileId, deletedBy || null]
  );

  return result.rows[0] || null;
}

module.exports = {
  createFile,
  findById,
  softDeleteFile,
};
