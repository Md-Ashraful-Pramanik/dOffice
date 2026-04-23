function notFoundHandler(req, res) {
  res.status(404).json({ error: "Route not found." });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.status || 500;
  const message = error.message || "Internal server error.";

  res.status(status).json({ error: message });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
