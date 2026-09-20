import QRCode from "qrcode";
import { env } from "../config/env";
import { Certificate } from "../models/Certificate";

function courseInitials(courseName: string): string {
  const initials = courseName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .join("")
    .slice(0, 3);
  return initials || "LX";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Generates a unique, human-scannable certificate ID like "WD-2026-8F72A1"
// and a verification QR code pointing at the admin's public verify page.
// Idempotent per user+course (backed by a unique index on the model)  a
// learner can only ever hold one certificate for a given course, so a
// retrigger just returns the one already on file instead of erroring or
// minting a duplicate.
export async function issueCertificate(params: {
  userId: string;
  courseId: string;
  studentName: string;
  courseName: string;
  finalScore: number;
}) {
  const existing = await Certificate.findOne({ user: params.userId, course: params.courseId });
  if (existing) return existing;

  const year = new Date().getFullYear();
  let certificateId = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${courseInitials(params.courseName)}-${year}-${randomSuffix()}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await Certificate.exists({ certificateId: candidate });
    if (!exists) {
      certificateId = candidate;
      break;
    }
  }
  if (!certificateId) throw new Error("Failed to generate unique certificate ID");

  const verifyUrl = `${env.certificateVerifyBaseUrl}/${certificateId}`;
  const qrCodeUrl = await QRCode.toDataURL(verifyUrl);

  const certificate = await Certificate.create({
    certificateId,
    user: params.userId,
    course: params.courseId,
    studentName: params.studentName,
    courseName: params.courseName,
    finalScore: params.finalScore,
    completedAt: new Date(),
    qrCodeUrl,
  });

  return certificate;
}
