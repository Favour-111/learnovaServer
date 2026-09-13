import { ILesson, IVideo } from "../models/Lesson";

// The single place that decides what a lesson's video actually is —
// everything else (course structure responses, the playback-url endpoint,
// the student app) reads through this instead of touching `video` or
// `videoProvider`/`videoId` directly, so a lesson written before the Dual
// Video Source feature (which only ever had `videoProvider`/`videoId`)
// looks identical to a new one without a migration being required first.
export function normalizeLessonVideo(lesson: Pick<ILesson, "video" | "videoProvider" | "videoId">): IVideo | null {
  if (lesson.video?.type) return lesson.video;
  if (lesson.videoProvider === "youtube" && lesson.videoId) {
    return { type: "youtube", youtube: { videoId: lesson.videoId, url: `https://www.youtube.com/watch?v=${lesson.videoId}` } };
  }
  return null;
}

const YOUTUBE_URL_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
];

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  for (const pattern of YOUTUBE_URL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}
