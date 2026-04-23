function validateRegisterPayload(req, res, next) {
  const user = req.body && req.body.user;

  if (!user || typeof user !== "object") {
    return res.status(400).json({ error: "Invalid request body. Expected user object." });
  }

  const { username, email, password } = user;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Required fields: username, email, password." });
  }

  next();
}

function validateLoginPayload(req, res, next) {
  const user = req.body && req.body.user;

  if (!user || typeof user !== "object") {
    return res.status(400).json({ error: "Invalid request body. Expected user object." });
  }

  const { email, password } = user;

  if (!email || !password) {
    return res.status(400).json({ error: "Required fields: email, password." });
  }

  next();
}

module.exports = {
  validateRegisterPayload,
  validateLoginPayload,
};
