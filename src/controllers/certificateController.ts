import { Response } from "express";
import { Certificate } from "../models/Certificate";
import { AuthedRequest } from "../middleware/auth";

export async function listMyCertificates(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const certificates = await Certificate.find({ user: req.dbUser._id }).sort({ createdAt: -1 }).lean();
  res.json({ certificates });
}

export async function getCertificate(req: AuthedRequest, res: Response) {
  const certificate = await Certificate.findById(req.params.id).lean();
  if (!certificate) return res.status(404).json({ error: "Certificate not found" });
  res.json({ certificate });
}

// STUB: streams a generated PDF. Wire up a PDF library (e.g. pdfkit) using
// the certificate fields + qrCodeUrl once the visual template is designed.
export async function downloadCertificate(req: AuthedRequest, res: Response) {
  res.status(501).json({ error: "PDF generation not yet implemented  see services/certificates.ts" });
}

// Public  no auth required, used by the QR code / admin verify page.
export async function verifyCertificate(req: AuthedRequest, res: Response) {
  const certificate = await Certificate.findOne({ certificateId: req.params.certificateId }).lean();
  if (!certificate) {
    return res.status(404).json({ authentic: false, error: "Certificate not found" });
  }
  res.json({
    authentic: true,
    studentName: certificate.studentName,
    courseName: certificate.courseName,
    completedAt: certificate.completedAt,
    finalScore: certificate.finalScore,
    certificateId: certificate.certificateId,
  });
}
