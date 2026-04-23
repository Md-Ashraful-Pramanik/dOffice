const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");
const userModel = require("../models/userModel");
const sessionModel = require("../models/sessionModel");
const { generateId } = require("../utils/id");
const { sha256 } = require("../utils/crypto");

const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.JWT_EXPIRES_IN_SECONDS || 60 * 60 * 24);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_EXPIRES_IN_SECONDS || 60 * 60 * 24 * 30);

function toUserResponse(user, roleIds, token, refreshToken) {
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      employeeId: user.employee_id,
      designation: user.designation,
      department: user.department,
      bio: user.bio,
      avatar: user.avatar,
      status: user.status,
      contactInfo: {
        phone: user.contact_phone,
        address: user.contact_address,
      },
      orgId: user.org_id,
      roleIds,
      token,
      refreshToken,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
  };
}

function buildTokens(userId, sessionId) {
  const secret = process.env.JWT_SECRET || "dev_secret";
  const refreshSecret = process.env.JWT_REFRESH_SECRET || secret;

  const token = jwt.sign({ sub: userId, sid: sessionId, typ: "access" }, secret, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });

  const refreshToken = jwt.sign({ sub: userId, sid: sessionId, typ: "refresh" }, refreshSecret, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });

  return { token, refreshToken };
}

async function createSessionForUser(userId, client = db) {
  const sessionId = generateId("session");
  const { token, refreshToken } = buildTokens(userId, sessionId);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);

  await sessionModel.createSession(
    {
      id: sessionId,
      userId,
      accessTokenHash: sha256(token),
      refreshTokenHash: sha256(refreshToken),
      expiresAt,
    },
    client
  );

  return { token, refreshToken };
}

async function registerSuperAdmin(payload) {
  const { username, email, password } = payload;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const userCount = await userModel.getUserCount(client);
    if (userCount > 0) {
      const error = new Error("Super admin is already registered.");
      error.status = 403;
      throw error;
    }

    const existingEmail = await userModel.findByEmail(email, client);
    if (existingEmail) {
      const error = new Error("Email is already in use.");
      error.status = 409;
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = generateId("user");

    const user = await userModel.createUser(
      {
        id: userId,
        username,
        email,
        passwordHash,
        isSuperAdmin: true,
      },
      client
    );

    await userModel.assignRole(user.id, "role_super_admin", client);

    const { token, refreshToken } = await createSessionForUser(user.id, client);
    const roleIds = await userModel.getRoleIdsByUserId(user.id, client);

    await client.query("COMMIT");
    return toUserResponse(user, roleIds, token, refreshToken);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function login(payload) {
  const { email, password } = payload;
  const user = await userModel.findByEmail(email);

  if (!user) {
    const error = new Error("Invalid credentials.");
    error.status = 401;
    throw error;
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    const error = new Error("Invalid credentials.");
    error.status = 401;
    throw error;
  }

  const { token, refreshToken } = await createSessionForUser(user.id);
  const roleIds = await userModel.getRoleIdsByUserId(user.id);

  return toUserResponse(user, roleIds, token, refreshToken);
}

async function logout(sessionId) {
  const revoked = await sessionModel.revokeSession(sessionId);
  if (!revoked) {
    const error = new Error("Session already invalidated or not found.");
    error.status = 401;
    throw error;
  }

  return {
    message: "Logged out successfully.",
  };
}

async function getCurrentUser(userId) {
  const user = await userModel.findById(userId);
  if (!user) {
    const error = new Error("User not found.");
    error.status = 404;
    throw error;
  }

  const roleIds = await userModel.getRoleIdsByUserId(userId);
  return toUserResponse(user, roleIds);
}

module.exports = {
  registerSuperAdmin,
  login,
  logout,
  getCurrentUser,
};
