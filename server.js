const express = require("express");
const cors = require("cors");

const routes = require("./routes");
const { attachAuditLogger } = require("./middleware/auditMiddleware");
const { notFoundHandler, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

app.use(cors());
app.use(express.json());
app.use(attachAuditLogger);

app.get("/hello", (req, res) => {
  res.status(200).send("hello world");
});

app.use("/api/v1", routes);
app.use("/api", routes);
app.use("/", routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
