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
    return res.status(422).json({
      errors: {
        body: ["has already been taken"],
      },
    });
  }

  if (error?.code === "23503") {
    return res.status(422).json({
      errors: {
        body: ["is invalid"],
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
