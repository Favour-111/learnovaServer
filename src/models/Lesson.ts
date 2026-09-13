import { Schema, model, Types } from "mongoose";

export type UploadedVideoStatus = "uploading" | "processing" | "ready" | "failed";

export interface IYouTubeVideo {
  videoId: string;
  url: string;
}

export interface IUploadedVideo {
  status: UploadedVideoStatus;
  originalKey?: string;
  hlsPath?: string;
  duration?: number;
  qualities: string[];
  mediaConvertJobId?: string;
  failureReason?: string;
}

export interface IVideo {
  type: "youtube" | "uploaded";
  youtube?: IYouTubeVideo;
  uploaded?: IUploadedVideo;
}

export interface ILesson {
  module: Types.ObjectId;
  course: Types.ObjectId;
  title: string;
  description?: string;
  // Deprecated in favor of `video` below — kept working (not just kept in
  // the schema, but actively read) so lessons created before the Dual Video
  // Source feature don't need to be recreated. New code should read/write
  // `video`; see normalizeLessonVideo() in services/video.ts, which is what
  // every route actually calls to get a consistent `IVideo` regardless of
  // which shape a given lesson document has on disk.
  videoProvider: "youtube" | null;
  videoId?: string;
  video?: IVideo;
  readingMaterial?: string;
  content?: string;
  codeExamples?: string;
  notes?: string;
  xpReward: number;
  creditReward: number;
  estimatedMinutes: number;
  order: number;
  isPublished: boolean;
}

const youtubeVideoSchema = new Schema<IYouTubeVideo>(
  {
    videoId: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const uploadedVideoSchema = new Schema<IUploadedVideo>(
  {
    status: { type: String, enum: ["uploading", "processing", "ready", "failed"], default: "uploading" },
    originalKey: String,
    hlsPath: String,
    duration: Number,
    qualities: { type: [String], default: [] },
    mediaConvertJobId: String,
    failureReason: String,
  },
  { _id: false }
);

const videoSchema = new Schema<IVideo>(
  {
    type: { type: String, enum: ["youtube", "uploaded"], required: true },
    youtube: youtubeVideoSchema,
    uploaded: uploadedVideoSchema,
  },
  { _id: false }
);

const lessonSchema = new Schema<ILesson>(
  {
    module: { type: Schema.Types.ObjectId, ref: "Module", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    title: { type: String, required: true },
    description: String,
    videoProvider: { type: String, enum: ["youtube", null], default: null },
    videoId: String,
    video: videoSchema,
    readingMaterial: String,
    content: String,
    codeExamples: String,
    notes: String,
    xpReward: { type: Number, default: 20 },
    creditReward: { type: Number, default: 5 },
    estimatedMinutes: { type: Number, default: 10 },
    order: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Lesson = model<ILesson>("Lesson", lessonSchema);
