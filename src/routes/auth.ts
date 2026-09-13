import { Router } from "express";
import { handleClerkWebhook, getMe, setInterests, setNotificationPreferences, updateProfile } from "../controllers/authController";
import { requireAuth, attachDbUser } from "../middleware/auth";

const router = Router();

// Signature verification uses req.rawBody, captured globally in app.ts.
router.post("/webhook", handleClerkWebhook);

router.get("/me", requireAuth, attachDbUser, getMe);
router.put("/me/profile", requireAuth, attachDbUser, updateProfile);
router.put("/me/interests", requireAuth, attachDbUser, setInterests);
router.put("/me/notification-preferences", requireAuth, attachDbUser, setNotificationPreferences);

export default router;
