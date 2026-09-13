import { Response } from "express";
import { Lesson } from "../models/Lesson";
import { Course } from "../models/Course";
import { Enrollment } from "../models/Enrollment";
import { AuthedRequest } from "../middleware/auth";
import { createPresignedUploadUrl, submitMediaConvertTranscodeJob, signCloudFrontUrl } from "../services/aws";
import { normalizeLessonVideo, extractYouTubeVideoId } from "../services/video";
import { env } from "../config/env";

// POST /api/admin/lessons/:id/video/youtube — { url }
export async function setYouTubeVideo(req: AuthedRequest, res: Response) {
  const { url } = req.body as { url?: string };
  if (!url || !url.trim()) return res.status(400).json({ error: "A YouTube URL is required" });

  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return res.status(400).json({ error: "Couldn't find a video id in that URL — check it's a valid YouTube link" });

  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });

  lesson.video = { type: "youtube", youtube: { videoId, url } };
  // Kept in sync for any old code path still reading these directly —
  // normalizeLessonVideo() means nothing strictly needs this anymore, but
  // it costs nothing to keep both shapes consistent.
  lesson.videoProvider = "youtube";
  lesson.videoId = videoId;
  await lesson.save();

  res.json({ lesson, video: normalizeLessonVideo(lesson) });
}

// POST /api/admin/lessons/:id/video/upload-url — { fileName, contentType }
// Returns a presigned S3 PUT URL; the admin uploads the file bytes straight
// to S3 from the browser, never through this server.
export async function createUploadUrl(req: AuthedRequest, res: Response) {
  const { fileName, contentType } = req.body as { fileName?: string; contentType?: string };
  if (!fileName || !contentType) return res.status(400).json({ error: "fileName and contentType are required" });

  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const originalKey = `videos/${lesson._id}/original/${Date.now()}-${safeName}`;

  let uploadUrl: string;
  try {
    uploadUrl = await createPresignedUploadUrl(originalKey, contentType);
  } catch (err) {
    return res.status(503).json({ error: err instanceof Error ? err.message : "Couldn't create the upload URL" });
  }

  lesson.video = { type: "uploaded", uploaded: { status: "uploading", originalKey, qualities: [] } };
  await lesson.save();

  res.json({ uploadUrl, originalKey });
}

// POST /api/admin/lessons/:id/video/upload-complete — { originalKey }
// Called once the browser's direct PUT to S3 finishes; kicks off the
// MediaConvert HLS job and flips status to "processing".
export async function completeUpload(req: AuthedRequest, res: Response) {
  const { originalKey } = req.body as { originalKey?: string };
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });
  if (lesson.video?.type !== "uploaded" || !lesson.video.uploaded) {
    return res.status(409).json({ error: "This lesson doesn't have a pending upload" });
  }
  if (originalKey && originalKey !== lesson.video.uploaded.originalKey) {
    return res.status(409).json({ error: "originalKey doesn't match the pending upload" });
  }

  const hlsPath = `videos/${lesson._id}/hls/`;
  let jobId: string;
  try {
    jobId = await submitMediaConvertTranscodeJob(lesson.video.uploaded.originalKey!, hlsPath);
  } catch (err) {
    lesson.video.uploaded.status = "failed";
    lesson.video.uploaded.failureReason = err instanceof Error ? err.message : "Couldn't start video processing";
    await lesson.save();
    return res.status(503).json({ error: lesson.video.uploaded.failureReason });
  }

  lesson.video.uploaded.status = "processing";
  lesson.video.uploaded.hlsPath = hlsPath;
  lesson.video.uploaded.mediaConvertJobId = jobId;
  await lesson.save();

  res.json({ lesson, video: normalizeLessonVideo(lesson) });
}

// POST /api/admin/lessons/:id/video/retry — resubmits the MediaConvert job
// for a lesson whose processing previously failed.
export async function retryProcessing(req: AuthedRequest, res: Response) {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });
  if (lesson.video?.type !== "uploaded" || !lesson.video.uploaded?.originalKey) {
    return res.status(409).json({ error: "This lesson has no uploaded video to retry" });
  }

  const hlsPath = lesson.video.uploaded.hlsPath || `videos/${lesson._id}/hls/`;
  try {
    const jobId = await submitMediaConvertTranscodeJob(lesson.video.uploaded.originalKey, hlsPath);
    lesson.video.uploaded.status = "processing";
    lesson.video.uploaded.hlsPath = hlsPath;
    lesson.video.uploaded.mediaConvertJobId = jobId;
    lesson.video.uploaded.failureReason = undefined;
    await lesson.save();
    res.json({ lesson, video: normalizeLessonVideo(lesson) });
  } catch (err) {
    res.status(503).json({ error: err instanceof Error ? err.message : "Couldn't restart video processing" });
  }
}

// GET /api/lessons/:id/video/playback-url — student-facing. Re-checks
// course enrollment on every call rather than trusting a cached
// entitlement, since this is the one place a signed, time-limited URL to
// the private video actually gets handed out.
export async function getPlaybackUrl(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });

  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });

  const [enrollment, course] = await Promise.all([
    Enrollment.findOne({ user: req.dbUser._id, course: lesson.course }),
    Course.findById(lesson.course).select("isPremium"),
  ]);
  if (!enrollment) return res.status(403).json({ error: "You're not enrolled in this course" });
  if (course?.isPremium && !enrollment.isPaid) {
    return res.status(402).json({ error: "Purchase this course with credits to watch its videos" });
  }

  const video = normalizeLessonVideo(lesson);
  if (!video) return res.status(404).json({ error: "This lesson has no video" });

  if (video.type === "youtube") {
    return res.json({ type: "youtube", videoId: video.youtube!.videoId });
  }

  const uploaded = video.uploaded!;
  if (uploaded.status !== "ready" || !uploaded.hlsPath) {
    return res.status(425).json({ error: "Video is still processing", status: uploaded.status });
  }

  try {
    const url = signCloudFrontUrl(`${uploaded.hlsPath}master.m3u8`);
    res.json({ type: "uploaded", url, qualities: uploaded.qualities, duration: uploaded.duration });
  } catch (err) {
    res.status(503).json({ error: err instanceof Error ? err.message : "Couldn't generate a playback URL" });
  }
}

// POST /api/webhooks/mediaconvert — EventBridge "MediaConvert Job State
// Change" -> API destination. Configure the destination's connection with
// a custom header `x-webhook-secret: <AWS_MEDIACONVERT_WEBHOOK_SECRET>` so
// this endpoint can verify the request actually came from that rule.
export async function mediaConvertWebhook(req: AuthedRequest, res: Response) {
  if (!env.aws.mediaConvertWebhookSecret || req.header("x-webhook-secret") !== env.aws.mediaConvertWebhookSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const detail = req.body?.detail as { jobId?: string; status?: string; errorMessage?: string } | undefined;
  if (!detail?.jobId) return res.status(400).json({ error: "Missing detail.jobId" });

  const lesson = await Lesson.findOne({ "video.uploaded.mediaConvertJobId": detail.jobId });
  if (!lesson || lesson.video?.type !== "uploaded" || !lesson.video.uploaded) {
    // Not necessarily a problem — could be an event for a job from a
    // different environment sharing the same AWS account/queue.
    return res.status(200).json({ ignored: true });
  }

  if (detail.status === "COMPLETE") {
    lesson.video.uploaded.status = "ready";
    lesson.video.uploaded.qualities = ["360p", "480p", "720p", "1080p"];
    lesson.video.uploaded.failureReason = undefined;
  } else if (detail.status === "ERROR") {
    lesson.video.uploaded.status = "failed";
    lesson.video.uploaded.failureReason = detail.errorMessage ?? "MediaConvert job failed";
  } else {
    // PROGRESSING / other transient states — nothing to update yet.
    return res.status(200).json({ ok: true });
  }

  await lesson.save();
  res.status(200).json({ ok: true });
}
