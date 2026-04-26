const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");

const sessionModel = require("../models/sessionModel");
const userModel = require("../models/userModel");
const { sha256 } = require("../utils/crypto");

let websocketServer = null;
const socketsByUserId = new Map();

function getTokenFromRequest(request) {
  try {
    const requestUrl = new URL(request.url, "http://localhost");
    const token = requestUrl.searchParams.get("token");
    return typeof token === "string" && token.trim() ? token.trim() : null;
  } catch (error) {
    return null;
  }
}

function addSocket(userId, socket) {
  if (!socketsByUserId.has(userId)) {
    socketsByUserId.set(userId, new Set());
  }

  socketsByUserId.get(userId).add(socket);
}

function removeSocket(userId, socket) {
  const sockets = socketsByUserId.get(userId);
  if (!sockets) {
    return;
  }

  sockets.delete(socket);
  if (!sockets.size) {
    socketsByUserId.delete(userId);
  }
}

function sendEvent(socket, event, data) {
  if (!socket || socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify({ event, data }));
}

async function authenticateSocket(request) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
  if (!decoded?.sub || !decoded?.sid) {
    return null;
  }

  const session = await sessionModel.findActiveSessionById(decoded.sid);
  if (!session || session.access_token_hash !== sha256(token)) {
    return null;
  }

  const user = await userModel.findById(decoded.sub);
  if (!user) {
    return null;
  }

  return {
    token,
    session,
    user,
  };
}

async function handleConnection(socket, request) {
  const auth = await authenticateSocket(request);
  if (!auth) {
    socket.close(1008, "Unauthorized");
    return;
  }

  socket.auth = auth;
  addSocket(auth.user.id, socket);

  sendEvent(socket, "connection:ready", {
    userId: auth.user.id,
    connectedAt: new Date().toISOString(),
  });

  socket.on("message", (rawBuffer) => {
    try {
      const payload = JSON.parse(String(rawBuffer || ""));
      if (payload?.event === "ping") {
        sendEvent(socket, "pong", { now: new Date().toISOString() });
      }
    } catch (error) {
      sendEvent(socket, "error", {
        message: "Invalid WebSocket payload.",
      });
    }
  });

  socket.on("close", () => {
    removeSocket(auth.user.id, socket);
  });
}

function initializeWebSocketServer(server) {
  if (websocketServer) {
    return websocketServer;
  }

  websocketServer = new WebSocketServer({
    server,
    path: "/ws",
  });

  websocketServer.on("connection", (socket, request) => {
    handleConnection(socket, request).catch(() => {
      socket.close(1011, "Unable to initialize connection");
    });
  });

  return websocketServer;
}

function broadcastToUsers(userIds = [], event, data) {
  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];

  uniqueUserIds.forEach((userId) => {
    const sockets = socketsByUserId.get(userId);
    if (!sockets) {
      return;
    }

    sockets.forEach((socket) => {
      sendEvent(socket, event, data);
    });
  });
}

module.exports = {
  initializeWebSocketServer,
  broadcastToUsers,
};
