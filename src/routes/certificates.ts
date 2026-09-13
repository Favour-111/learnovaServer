import { Router } from "express";
import {
  listMyCertificates,
  getCertificate,
  downloadCertificate,
  verifyCertificate,
} from "../controllers/certificateController";
import { requireAuth, attachDbUser, withAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, attachDbUser, listMyCertificates);
router.get("/verify/:certificateId", verifyCertificate); // public, used by QR code / admin verify page
router.get("/:id", withAuth, getCertificate);
router.get("/:id/download", requireAuth, attachDbUser, downloadCertificate);

export default router;
