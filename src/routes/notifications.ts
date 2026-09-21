import { Router } from "express";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  registerPushToken,
} from "../controllers/notificationController";
import { requireAuth, attachDbUser } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, attachDbUser, listNotifications);
router.put("/read-all", requireAuth, attachDbUser, markAllNotificationsRead);
router.put("/:id/read", requireAuth, attachDbUser, markNotificationRead);
// Must be registered before /:id, or a request to /all would match the
// id-based route instead (with "all" as the id) and 404.
router.delete("/all", requireAuth, attachDbUser, deleteAllNotifications);
router.delete("/:id", requireAuth, attachDbUser, deleteNotification);
router.post("/register-token", requireAuth, attachDbUser, registerPushToken);

export default router;
