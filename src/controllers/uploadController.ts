import { Response } from "express";
import { AuthedRequest } from "../middleware/auth";
import { createPresignedUploadUrl, signCloudFrontUrl } from "../services/aws";

const ALLOWED_FOLDERS = ["categories", "courses", "quizzes"] as const;
type ImageFolder = (typeof ALLOWED_FOLDERS)[number];

// POST /api/admin/uploads/image  { fileName, contentType, folder }
// Same presigned-S3-PUT pattern as the lesson video pipeline (the admin
// panel uploads the file bytes straight to S3, never through this server),
// but with no transcode step  the object key is deterministic, so the
// final `imageUrl` is already known and returned in this one call instead
// of needing a separate upload-complete step.
//
// Signed with a 20-year expiry rather than served from a public bucket URL:
// this project's S3 buckets aren't configured for public reads, and reusing
// the CloudFront signing key that's already wired up for video playback
// avoids needing any new AWS console changes just to host a course thumbnail.
export async function getImageUploadUrl(req: AuthedRequest, res: Response) {
  const { fileName, contentType, folder } = req.body as { fileName?: string; contentType?: string; folder?: string };
  if (!fileName || !contentType) return res.status(400).json({ error: "fileName and contentType are required" });
  if (!ALLOWED_FOLDERS.includes(folder as ImageFolder)) {
    return res.status(400).json({ error: `folder must be one of: ${ALLOWED_FOLDERS.join(", ")}` });
  }
  if (!contentType.startsWith("image/")) {
    return res.status(400).json({ error: "contentType must be an image/* type" });
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `images/${folder}/${Date.now()}-${safeName}`;

  try {
    const uploadUrl = await createPresignedUploadUrl(key, contentType);
    const imageUrl = signCloudFrontUrl(key, 20 * 365 * 24 * 3600);
    res.json({ uploadUrl, imageUrl });
  } catch (err) {
    res.status(503).json({ error: err instanceof Error ? err.message : "Couldn't create the upload URL" });
  }
}
