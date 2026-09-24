import { createApp } from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { initRealtime, closeRealtime } from "./services/realtime";
import { initJobs } from "./jobs";
import { closeQueues } from "./services/queue";
import { closeCache } from "./services/cache";

// How long shutdown is allowed to take (in-flight requests finishing, the
// DB connection closing) before giving up and force-exiting anyway  a
// deploy/restart must not be able to hang forever on a stuck connection.
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  await connectDB();
  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`[learnova-api] listening on http://localhost:${env.port}`);
  });
  initRealtime(server);
  initJobs();

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[learnova-api] received ${signal}, shutting down gracefully...`);

    const forceExit = setTimeout(() => {
      logger.error("[learnova-api] shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      // Stop accepting new connections and let in-flight requests finish
      // first, then tear down realtime sockets and the DB connection.
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      await closeRealtime();
      await closeQueues();
      await closeCache();
      await disconnectDB();
      logger.info("[learnova-api] shutdown complete");
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "[learnova-api] error during shutdown");
      clearTimeout(forceExit);
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "[learnova-api] failed to start");
  process.exit(1);
});
