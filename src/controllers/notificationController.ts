import { Response } from "express";
import { Notification } from "../models/Notification";
import { AuthedRequest } from "../middleware/auth";

const NOTIFICATIONS_PAGE_SIZE = 30;

// GET /api/notifications?cursor=  omitting `cursor` keeps today's exact
// behavior: a flat { notifications: [...] } array, newest 100 first. Passing
// `cursor` (an opaque value from a previous response's pagination.nextCursor)
// opts into the { data, pagination: { hasMore, nextCursor } } shape from the
// pagination spec, for an infinite-scroll Notification Center later without
// having to change what today's client already gets.
export async function listNotifications(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const { cursor } = req.query as { cursor?: string };

  if (cursor === undefined) {
    const notifications = await Notification.find({ user: req.dbUser._id }).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ notifications });
  }

  const cursorDate = cursor ? new Date(cursor) : null;
  const filter: Record<string, unknown> = { user: req.dbUser._id };
  if (cursorDate && !Number.isNaN(cursorDate.getTime())) filter.createdAt = { $lt: cursorDate };

  // Fetch one extra row purely to know whether there's a next page, without
  // a separate countDocuments  the row itself is discarded, never returned.
  const page = await Notification.find(filter).sort({ createdAt: -1 }).limit(NOTIFICATIONS_PAGE_SIZE + 1).lean();
  const hasMore = page.length > NOTIFICATIONS_PAGE_SIZE;
  const data = hasMore ? page.slice(0, NOTIFICATIONS_PAGE_SIZE) : page;
  const nextCursor = hasMore ? data[data.length - 1].createdAt.toISOString() : null;

  res.json({ data, pagination: { hasMore, nextCursor } });
}

export async function markNotificationRead(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.dbUser._id },
    { isRead: true },
    { new: true }
  );
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json({ notification });
}

export async function markAllNotificationsRead(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  await Notification.updateMany({ user: req.dbUser._id, isRead: false }, { isRead: true });
  res.status(204).send();
}

// DELETE /api/notifications/:id  swipe-to-delete on the Notifications screen.
export async function deleteNotification(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, user: req.dbUser._id });
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.status(204).send();
}

// DELETE /api/notifications/all  the Notifications screen's trash icon.
// Scoped to req.dbUser._id exactly like every other handler here, never a
// client-supplied id, so this can only ever clear the caller's own
// notifications.
export async function deleteAllNotifications(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  await Notification.deleteMany({ user: req.dbUser._id });
  res.status(204).send();
}

// POST /api/notifications/register-token  stores an Expo push token.
export async function registerPushToken(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const { token } = req.body as { token: string };
  if (!token) return res.status(400).json({ error: "token is required" });
  await req.dbUser.updateOne({ $addToSet: { pushTokens: token } });
  res.status(204).send();
}
