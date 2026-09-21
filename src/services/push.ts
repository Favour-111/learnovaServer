import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { Types } from "mongoose";
import { User } from "../models/User";

const expo = new Expo();

// Expo recommends waiting before checking receipts so Apple/Google's own
// relay has had time to respond  this is a best-effort, in-process delay
// (not a persisted job), so a backend restart within this window just means
// that batch's receipts go unchecked. That's an acceptable trade-off here:
// receipts only drive extra logging + token pruning, never anything a
// learner-facing request depends on.
const RECEIPT_CHECK_DELAY_MS = 20_000;

interface PushRecipient {
  _id: Types.ObjectId;
  pushTokens: string[];
}

interface PushContent {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface TokenOwner {
  userId: Types.ObjectId;
  token: string;
}

// Sends one push per recipient (fanning out to every device token they have
// registered), chunked to Expo's request-size limit. Every ticket Expo
// returns is logged  both because that's the only confirmation the request
// actually reached Expo, and so a misconfigured push credential (the
// project has no FCM/APNs key registered, say) shows up in logs instead of
// silently vanishing. Tickets are Expo's *immediate* accept/reject
// response  a `status: "ok"` ticket only means "accepted into Expo's
// queue," not "delivered." Real delivery failures (including most
// FCM/APNs-credential problems) only surface on the separate receipts
// endpoint, which checkReceiptsAndPrune polls after a delay. Never awaited
// by callers that fan out to many users  a failed push send should never
// fail the request that triggered it.
export async function sendPushToUsers(recipients: PushRecipient[], content: PushContent): Promise<void> {
  const messages: ExpoPushMessage[] = [];
  // Track which user+token a message belongs to by array index, so an
  // error ticket (or, later, an error receipt) can be traced back to the
  // token that needs pruning.
  const owners: TokenOwner[] = [];

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
    const chunkOwners = owners.slice(offset, offset + chunk.length);
    offset += chunk.length;
    try {
      // eslint-disable-next-line no-await-in-loop
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      handleTickets(tickets, chunkOwners);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[push] chunk send failed  request never reached Expo", err);
    }
  }
}

function handleTickets(tickets: ExpoPushTicket[], chunkOwners: TokenOwner[]) {
  const deadTokensByUser = new Map<string, string[]>();
  const receiptOwnerById = new Map<string, TokenOwner>();
  let okCount = 0;

  tickets.forEach((ticket, i) => {
    const owner = chunkOwners[i];
    if (ticket.status === "ok") {
      okCount += 1;
      // `ticket.id` is the receipt id  keep it so the delayed check below
      // can ask Expo what actually happened to this specific message.
      if (owner) receiptOwnerById.set(ticket.id, owner);
      return;
    }
    // eslint-disable-next-line no-console
    console.error("[push] ticket error", { error: ticket.details?.error, message: ticket.message, owner });
    if (owner && ticket.details?.error === "DeviceNotRegistered") {
      const key = String(owner.userId);
      deadTokensByUser.set(key, [...(deadTokensByUser.get(key) ?? []), owner.token]);
    }
  });

  // eslint-disable-next-line no-console
  console.log(`[push] sent chunk: ${okCount} accepted, ${tickets.length - okCount} rejected`);

  prunePushTokens(deadTokensByUser).catch((err) => console.error("[push] pruning dead tokens failed", err));

  if (receiptOwnerById.size > 0) {
    setTimeout(() => {
      checkReceipts(receiptOwnerById).catch((err) => console.error("[push] deferred receipt check failed", err));
    }, RECEIPT_CHECK_DELAY_MS);
  }
}

// Polls Expo for what actually happened to each accepted ticket. This is
// where a real delivery failure (credential problems, `MessageTooBig`,
// `MismatchSenderId`, or a token that's since gone dead) becomes visible
// without this, a misconfigured push credential looks identical to success
// (an "ok" ticket) all the way through, which matches exactly how this kind
// of failure otherwise goes unnoticed.
async function checkReceipts(receiptOwnerById: Map<string, TokenOwner>) {
  const deadTokensByUser = new Map<string, string[]>();
  const receiptChunks = expo.chunkPushNotificationReceiptIds(Array.from(receiptOwnerById.keys()));

  for (const chunk of receiptChunks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const [receiptId, receipt] of Object.entries(receipts)) {
        if (receipt.status === "ok") continue;
        const owner = receiptOwnerById.get(receiptId);
        // eslint-disable-next-line no-console
        console.error("[push] delivery receipt error", { error: receipt.details?.error, message: receipt.message, owner });
        if (owner && receipt.details?.error === "DeviceNotRegistered") {
          const key = String(owner.userId);
          deadTokensByUser.set(key, [...(deadTokensByUser.get(key) ?? []), owner.token]);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[push] fetching receipts failed", err);
    }
  }

  await prunePushTokens(deadTokensByUser);
}

async function prunePushTokens(deadTokensByUser: Map<string, string[]>) {
  await Promise.all(
    Array.from(deadTokensByUser.entries()).map(([userId, tokens]) =>
      User.updateOne({ _id: userId }, { $pull: { pushTokens: { $in: tokens } } })
    )
  );
}
