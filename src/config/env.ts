import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  apiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:4000",
  corsOrigins: (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),

  // Temporarily off: the app's player reloads whenever the periodic progress
  // save changes lastPositionSeconds (see updateLessonProgress). Set
  // WATCH_PROGRESS_ENABLED=true to turn automatic watch-time saving back on.
  watchProgressEnabled: process.env.WATCH_PROGRESS_ENABLED === "true",

  mongodbUri: required("MONGODB_URI", "mongodb://localhost:27017/learnova"),

  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? "",
  clerkWebhookSecret: process.env.CLERK_WEBHOOK_SECRET ?? "",

  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  openaiBaseUrl: process.env.OPENAI_BASE_URL || undefined,

  // Optional  unauthenticated GitHub API access works fine for public
  // repos (60 req/hr), a personal access token just raises that to
  // 5000/hr and is the same client a later private-repo/OAuth flow would use.
  githubToken: process.env.GITHUB_TOKEN ?? "",

  fcm: {
    projectId: process.env.FCM_PROJECT_ID ?? "",
    clientEmail: process.env.FCM_CLIENT_EMAIL ?? "",
    privateKey: (process.env.FCM_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  },

  certificateVerifyBaseUrl: process.env.CERTIFICATE_VERIFY_BASE_URL ?? "http://localhost:3000/verify",

  // Uploaded-video pipeline (S3 -> MediaConvert -> CloudFront). All optional
  // at boot  services/aws.ts throws a clear error only when a call actually
  // needs a value that's missing, so the rest of the app (YouTube lessons
  // included) works fine before this is configured.
  aws: {
    region: process.env.AWS_REGION ?? "",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    s3Bucket: process.env.AWS_S3_BUCKET ?? "",
    mediaConvertEndpoint: process.env.AWS_MEDIACONVERT_ENDPOINT ?? "",
    mediaConvertRoleArn: process.env.AWS_MEDIACONVERT_ROLE_ARN ?? "",
    // Shared secret this server checks on the MediaConvert status webhook 
    // set the same value as a custom header in the EventBridge API
    // destination's connection (Configure -> Authorization -> API key).
    mediaConvertWebhookSecret: process.env.AWS_MEDIACONVERT_WEBHOOK_SECRET ?? "",
    cloudfrontDomain: process.env.AWS_CLOUDFRONT_DOMAIN ?? "",
    cloudfrontKeyPairId: process.env.AWS_CLOUDFRONT_KEY_PAIR_ID ?? "",
    cloudfrontPrivateKey: (process.env.AWS_CLOUDFRONT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  },

  // Optional  entirely absent in dev/most deployments today. Every
  // consumer (services/cache.ts, services/queue.ts, the logger) must treat
  // an empty string exactly like "not configured" and fall back to
  // working without it, never throw at boot.
  redisUrl: process.env.REDIS_URL ?? "",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  logLevel: process.env.LOG_LEVEL ?? "info",

  isProduction: process.env.NODE_ENV === "production",
};
