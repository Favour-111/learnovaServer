import mongoose from "mongoose";
import "./dns";
import { env } from "./env";
import { logger } from "./logger";

export async function connectDB(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongodbUri, {
    // Reuses connections across requests instead of opening a new one each
    // time (the driver already pools by default, but leaving these
    // unstated means "whatever the driver's current default happens to
    // be" rather than a deliberate, documented choice)  100 matches the
    // driver's own default and is a sane ceiling for a single Node process
    // talking to Atlas; raise it only if profiling shows connections are
    // actually the bottleneck, not preemptively.
    maxPoolSize: 100,
    minPoolSize: 5,
    // How long to wait for Atlas to become reachable before failing a
    // connection attempt (default is 30s, which makes a genuine outage
    // hang every in-flight request for half a minute before erroring).
    serverSelectionTimeoutMS: 10_000,
    // How long an individual socket can sit idle mid-operation before the
    // driver gives up on it  protects against a request hanging forever
    // on a half-dead connection during a network partition.
    socketTimeoutMS: 45_000,
  });
  logger.info({ db: mongoose.connection.name }, "[db] connected");

  // A connection that drops after the initial connect (Atlas maintenance,
  // a network blip) previously had zero visibility  these just make that
  // visible in logs; Mongoose's driver already handles automatic
  // reconnection on its own.
  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "[db] connection error");
  });
  mongoose.connection.on("disconnected", () => {
    logger.warn("[db] disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    logger.info("[db] reconnected");
  });
}

// Closes the Mongo connection cleanly  used by server.ts's shutdown
// handler so an in-flight query gets a chance to finish rather than being
// severed mid-operation by the process exiting.
export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
}
