import { Router } from "express";
import { mediaConvertWebhook } from "../controllers/videoController";

const router = Router();

router.post("/mediaconvert", mediaConvertWebhook);

export default router;
