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

// Development-only seed warmup. Production onboarding owns household creation;
// a deployed process must never create the demo household as a side effect.
if (process.env.NODE_ENV !== "production") {
  void ensureSeedData().catch((error) => {
    logger.error({ err: error }, "Development database bootstrap failed");
  });
}
