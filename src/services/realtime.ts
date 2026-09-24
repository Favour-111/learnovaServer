import type { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyToken } from "@clerk/backend";
import { User } from "../models/User";
import { env } from "../config/env";
import { logger } from "../config/logger";

let io: SocketIOServer | null = null;

// One socket.io server attached to the same HTTP server Express already
// listens on  no separate port, no separate deploy target. A single
// generic "user:update" event (rather than a growing zoo of specific event
// types) tells every screen the current user has open that SOMETHING about
// their xp/credits/progress/enrollments changed, so it just refetches its
// own queries instead of the server needing to know every payload shape a
// screen might want.
export function initRealtime(httpServer: HTTPServer) {
  // Same fail-closed-in-production reasoning as the main Express CORS
  // config in app.ts: only a browser (the admin panel) is subject to this
  // at all, so tightening it can't affect the mobile app.
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.corsOrigins.length > 0 ? env.corsOrigins : env.isProduction ? false : true, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Unauthorized"));
      const payload = await verifyToken(token, { secretKey: env.clerkSecretKey });
      const user = await User.findOne({ clerkId: payload.sub });
      if (!user) return next(new Error("Unauthorized"));
      socket.data.userId = String(user._id);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    logger.info({ userId: socket.data.userId, socketId: socket.id }, "[realtime] connected");
    socket.on("disconnect", () => {
      logger.info({ userId: socket.data.userId, socketId: socket.id }, "[realtime] disconnected");
    });
  });

  logger.info("[realtime] socket.io attached");
}

export function emitUserUpdate(userId: string, reason: string) {
  io?.to(`user:${userId}`).emit("user:update", { reason, at: Date.now() });
}

// Used by server.ts's graceful-shutdown handler so open sockets are told to
// disconnect cleanly instead of just being severed when the process exits.
export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await new Promise<void>((resolve) => io!.close(() => resolve()));
  io = null;
}
