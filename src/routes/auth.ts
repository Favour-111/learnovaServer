import { Router } from "express";
import { handleClerkWebhook, getMe, setInterests, setNotificationPreferences, updateProfile } from "../controllers/authController";
import { requireAuth, attachDbUser } from "../middleware/auth";
import { webhookLimiter } from "../middleware/rateLimiters";
import { validateBody } from "../middleware/validate";
import { profileUpdateSchema } from "../validation/schemas";

const router = Router();

// Signature verification uses req.rawBody, captured globally in app.ts.
router.post("/webhook", webhookLimiter, handleClerkWebhook);

router.get("/me", requireAuth, attachDbUser, getMe);
router.put("/me/profile", requireAuth, attachDbUser, validateBody(profileUpdateSchema), updateProfile);
router.put("/me/interests", requireAuth, attachDbUser, setInterests);
router.put("/me/notification-preferences", requireAuth, attachDbUser, setNotificationPreferences);

export default router;
