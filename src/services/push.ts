import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { Types } from "mongoose";
import { User } from "../models/User";

const expo = new Expo();

interface PushRecipient {
  _id: Types.ObjectId;
  pushTokens: string[];
}

interface PushContent {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Sends one push per recipient (fanning out to every device token they have
// registered), chunked to Expo's request-size limit. Tickets are Expo's
// *immediate* accept/reject response  a subset of delivery failures (a
// token Expo already knows is dead) show up here; the rest only surface on
// the separate receipts endpoint ~15 minutes later, which this doesn't poll
// yet. Never awaited by callers that fan out to many users  a failed push
// send should never fail the request that triggered it.
export async function sendPushToUsers(recipients: PushRecipient[], content: PushContent): Promise<void> {
  const messages: ExpoPushMessage[] = [];
  // Track which user+token a message belongs to by array index, so an
  // error ticket can be traced back to the token that needs pruning.
  const owners: { userId: Types.ObjectId; token: string }[] = [];

  for (const recipient of recipients) {
    for (const token of recipient.pushTokens) {
      if (!Expo.isExpoPushToken(token)) continue;
      messages.push({
        to: token,
        title: content.title,
        body: content.body,
        data: content.data ?? {},
        sound: "default",
      });
      owners.push({ userId: recipient._id, token });
    }
  }

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  let offset = 0;
  for (const chunk of chunks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      await pruneDeadTokens(tickets, owners.slice(offset, offset + chunk.length));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[push] chunk send failed", err);
    }
    offset += chunk.length;
  }
}

async function pruneDeadTokens(tickets: ExpoPushTicket[], chunkOwners: { userId: Types.ObjectId; token: string }[]) {
  const deadByUser = new Map<string, string[]>();

  tickets.forEach((ticket, i) => {
    if (ticket.status !== "error") return;
    if (ticket.details?.error !== "DeviceNotRegistered") return;
    const owner = chunkOwners[i];
    if (!owner) return;
    const key = String(owner.userId);
    deadByUser.set(key, [...(deadByUser.get(key) ?? []), owner.token]);
  });

  await Promise.all(
    Array.from(deadByUser.entries()).map(([userId, tokens]) =>
      User.updateOne({ _id: userId }, { $pull: { pushTokens: { $in: tokens } } })
    )
  );
}
