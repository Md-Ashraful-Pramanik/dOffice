require("dotenv").config();

const { createServer } = require("http");
const app = require("./server");
const { runMigrations } = require("./db/migrate");
const { initializeWebSocketServer } = require("./realtime/websocketServer");

const port = Number(process.env.PORT || 3000);

async function bootstrap() {
  await runMigrations();

  const server = createServer(app);
  initializeWebSocketServer(server);
  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start application", error);
  process.exit(1);
});
