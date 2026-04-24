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
  const unauthorized = (message) => {
    return res.status(401).json({
      error: {
        status: 401,
        message,
      },
    });
  };

  try {
    const token = extractToken(req.headers.authorization);
    if (!token) {
      return unauthorized("Missing or invalid authentication token.");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    if (!decoded?.sub || !decoded?.sid) {
      return unauthorized("Missing or invalid authentication token.");
    }

    const session = await sessionModel.findActiveSessionById(decoded.sid);
    if (!session) {
      return unauthorized("Missing or invalid authentication token.");
    }

    const tokenHash = sha256(token);
    if (session.access_token_hash !== tokenHash) {
      return unauthorized("Missing or invalid authentication token.");
    }

    const user = await userModel.findById(decoded.sub);
    if (!user) {
      return unauthorized("Missing or invalid authentication token.");
    }

    req.auth = {
      token,
      sessionId: session.id,
      user,
    };

    await Promise.all([
      sessionModel.touchSessionActivity(session.id),
      userModel.touchUserLastSeen(user.id),
    ]);

    next();
  } catch (error) {
    return unauthorized("Missing or invalid authentication token.");
  }
}

module.exports = {
  requireAuth,
};
