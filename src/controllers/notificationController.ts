import { Response } from "express";
import { Notification } from "../models/Notification";
import { AuthedRequest } from "../middleware/auth";

export async function listNotifications(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const notifications = await Notification.find({ user: req.dbUser._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ notifications });
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

// DELETE /api/notifications/:id — swipe-to-delete on the Notifications screen.
export async function deleteNotification(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, user: req.dbUser._id });
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.status(204).send();
}

// POST /api/notifications/register-token — stores an FCM device token.
export async function registerPushToken(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const { token } = req.body as { token: string };
  if (!token) return res.status(400).json({ error: "token is required" });
  await req.dbUser.updateOne({ $addToSet: { pushTokens: token } });
  res.status(204).send();
}
