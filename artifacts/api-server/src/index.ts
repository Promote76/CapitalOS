import app from "./app";
import { logger } from "./lib/logger";
import { ensureSeedData } from "./services/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// Seed eagerly for warm starts, but never block the process liveness boundary.
// Request context repeats this idempotent initialization before serving
// database-backed routes, so a bootstrap failure remains visible to callers.
void ensureSeedData().catch((error) => {
  logger.error({ err: error }, "Database bootstrap failed");
});
