import { createApp } from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";
import { initRealtime } from "./services/realtime";

async function main() {
  await connectDB();
  const app = createApp();
  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[learnova-api] listening on http://localhost:${env.port}`);
  });
  initRealtime(server);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[learnova-api] failed to start", err);
  process.exit(1);
});
