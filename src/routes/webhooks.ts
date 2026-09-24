import { Router } from "express";
import { mediaConvertWebhook } from "../controllers/videoController";
import { webhookLimiter } from "../middleware/rateLimiters";

const router = Router();

router.post("/mediaconvert", webhookLimiter, mediaConvertWebhook);

export default router;
