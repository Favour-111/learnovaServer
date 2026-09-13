import { Router } from "express";
import { listNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, registerPushToken } from "../controllers/notificationController";
import { requireAuth, attachDbUser } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, attachDbUser, listNotifications);
router.put("/read-all", requireAuth, attachDbUser, markAllNotificationsRead);
router.put("/:id/read", requireAuth, attachDbUser, markNotificationRead);
router.delete("/:id", requireAuth, attachDbUser, deleteNotification);
router.post("/register-token", requireAuth, attachDbUser, registerPushToken);

export default router;
