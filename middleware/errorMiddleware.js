function notFoundHandler(req, res) {
  res.status(404).json({ error: "Route not found." });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error?.code === "23505") {
    return res.status(409).json({ error: "Resource conflict: duplicate value violates a unique constraint." });
  }

  if (error?.code === "23503") {
    return res.status(400).json({ error: "Invalid reference to a related resource." });
  }

  const status = error.status || 500;
  const message = error.message || "Internal server error.";

  res.status(status).json({ error: message });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
