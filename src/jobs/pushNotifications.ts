import { Types } from "mongoose";
import { getQueue, registerWorker } from "../services/queue";
import { sendPushToUsers } from "../services/push";
import { logger } from "../config/logger";

const QUEUE_NAME = "push-notifications";

interface PushJobData {
  recipients: { _id: string; pushTokens: string[] }[];
  content: { title: string; body: string; data?: Record<string, unknown> };
}

// Used by services/notify.ts in place of calling sendPushToUsers directly.
// With Redis configured, this hands off to a queue (adding real
// attempts/backoff for a transient Expo API failure, and moving the
// Expo round trip out of the request-serving process entirely). Without
// Redis, it calls sendPushToUsers immediately and unawaited, in-process
// the exact fire-and-forget behavior this app already had before any of
// this pass's Redis work existed. Either way, the caller in notify.ts never
// awaits this and a failure here never fails the notification-creation
// request that triggered it.
export function enqueuePush(recipients: { _id: Types.ObjectId; pushTokens: string[] }[], content: PushJobData["content"]): void {
  const jobData: PushJobData = {
    recipients: recipients.map((r) => ({ _id: String(r._id), pushTokens: r.pushTokens })),
    content,
  };
  const queue = getQueue<PushJobData>(QUEUE_NAME);
  if (queue) {
    queue.add("send", jobData).catch((err) => logger.error({ err }, "[jobs] failed to enqueue push"));
    return;
  }
  sendPushToUsers(
    recipients.map((r) => ({ _id: r._id, pushTokens: r.pushTokens })),
    content
  ).catch((err) => logger.error({ err }, "[notify] push send failed"));
}

export function registerPushWorker() {
  return registerWorker<PushJobData>(QUEUE_NAME, async (job) => {
    await sendPushToUsers(
      job.data.recipients.map((r) => ({ _id: new Types.ObjectId(r._id), pushTokens: r.pushTokens })),
      job.data.content
    );
  });
}
