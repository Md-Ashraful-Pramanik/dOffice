function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      status: 404,
      message: "Resource not found.",
    },
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error?.code === "23505") {
    return res.status(409).json({
      error: {
        status: 409,
        message: "Resource conflict: duplicate value violates a unique constraint.",
      },
    });
  }

  if (error?.code === "23503") {
    return res.status(400).json({
      error: {
        status: 400,
        message: "Invalid reference to a related resource.",
      },
    });
  }

  if (error?.status === 422) {
    return res.status(422).json({
      errors: {
        body: [error.message || "Validation error."],
      },
    });
  }

  const status = error.status || 500;
  const message = error.message || "An unexpected error occurred. Please try again.";

  res.status(status).json({
    error: {
      status,
      message,
    },
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
