const jwt = require("jsonwebtoken");

const sessionModel = require("../models/sessionModel");
const userModel = require("../models/userModel");
const { sha256 } = require("../utils/crypto");

function extractToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (!scheme || !token) {
    return null;
  }

  if (scheme === "Bearer" || scheme === "Token") {
    return token;
  }

  return null;
}

async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    if (!decoded?.sub || !decoded?.sid) {
      return res.status(401).json({ error: "Invalid token payload." });
    }

    const session = await sessionModel.findActiveSessionById(decoded.sid);
    if (!session) {
      return res.status(401).json({ error: "Session is invalid or expired." });
    }

    const tokenHash = sha256(token);
    if (session.access_token_hash !== tokenHash) {
      return res.status(401).json({ error: "Token does not match active session." });
    }

    const user = await userModel.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }

    req.auth = {
      token,
      sessionId: session.id,
      user,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Authentication failed." });
  }
}

module.exports = {
  requireAuth,
};
