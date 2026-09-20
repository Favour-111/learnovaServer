import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import { MediaConvertClient, CreateJobCommand } from "@aws-sdk/client-mediaconvert";
import { getSignedUrl as getCloudFrontSignedUrl } from "@aws-sdk/cloudfront-signer";
import { env } from "../config/env";

function requireAwsConfig(...names: (keyof typeof env.aws)[]) {
  const missing = names.filter((n) => !env.aws[n]);
  if (missing.length > 0) {
    throw new Error(`This upload feature isn't configured yet  missing env var(s): ${missing.map((n) => `AWS_${String(n).replace(/([A-Z])/g, "_$1").toUpperCase()}`).join(", ")}`);
  }
}

function credentials() {
  return { accessKeyId: env.aws.accessKeyId, secretAccessKey: env.aws.secretAccessKey };
}

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) s3Client = new S3Client({ region: env.aws.region, credentials: credentials() });
  return s3Client;
}

let mediaConvertClient: MediaConvertClient | null = null;
function getMediaConvertClient(): MediaConvertClient {
  if (!mediaConvertClient) {
    mediaConvertClient = new MediaConvertClient({ region: env.aws.region, credentials: credentials(), endpoint: env.aws.mediaConvertEndpoint });
  }
  return mediaConvertClient;
}

// POST /video/upload-url  the admin PUTs the raw file straight to this URL;
// the file body never touches the Learnova backend.
export async function createPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  requireAwsConfig("region", "accessKeyId", "secretAccessKey", "s3Bucket");
  const command = new PutObjectCommand({ Bucket: env.aws.s3Bucket, Key: key, ContentType: contentType });
  return getS3SignedUrl(getS3Client(), command, { expiresIn: 3600 });
}

const RENDITIONS = [
  { name: "360p", height: 360, bitrate: 800_000 },
  { name: "480p", height: 480, bitrate: 1_400_000 },
  { name: "720p", height: 720, bitrate: 2_800_000 },
  { name: "1080p", height: 1080, bitrate: 5_000_000 },
] as const;

// Submits one HLS job producing all four renditions as a single adaptive-
// bitrate output group. `outputKeyPrefix` is where the .m3u8 + segments
// land (e.g. `videos/<lessonId>/hls/`)  the master playlist ends up at
// `${outputKeyPrefix}master.m3u8`.
export async function submitMediaConvertTranscodeJob(inputKey: string, outputKeyPrefix: string): Promise<string> {
  requireAwsConfig("region", "accessKeyId", "secretAccessKey", "s3Bucket", "mediaConvertEndpoint", "mediaConvertRoleArn");

  const outputs = RENDITIONS.map((r) => ({
    NameModifier: `_${r.name}`,
    VideoDescription: {
      Height: r.height,
      CodecSettings: {
        Codec: "H_264",
        H264Settings: { RateControlMode: "CBR", Bitrate: r.bitrate, MaxBitrate: r.bitrate },
      },
    },
    AudioDescriptions: [{ CodecSettings: { Codec: "AAC", AacSettings: { Bitrate: 96_000, CodingMode: "CODING_MODE_2_0", SampleRate: 48_000 } } }],
    ContainerSettings: { Container: "M3U8" },
  }));

  const command = new CreateJobCommand({
    Role: env.aws.mediaConvertRoleArn,
    Settings: {
      Inputs: [{ FileInput: `s3://${env.aws.s3Bucket}/${inputKey}` }],
      OutputGroups: [
        {
          Name: "HLS",
          OutputGroupSettings: {
            Type: "HLS_GROUP_SETTINGS",
            HlsGroupSettings: {
              Destination: `s3://${env.aws.s3Bucket}/${outputKeyPrefix}`,
              SegmentLength: 6,
              MinSegmentLength: 0,
            },
          },
          Outputs: outputs as never,
        },
      ],
    },
    // Surfaces on the EventBridge "MediaConvert Job State Change" event as
    // `detail.userMetadata`  how the webhook maps a completed job back to
    // the lesson that kicked it off.
    UserMetadata: { outputKeyPrefix },
  });

  const response = await getMediaConvertClient().send(command);
  const jobId = response.Job?.Id;
  if (!jobId) throw new Error("MediaConvert did not return a job id");
  return jobId;
}

// Canned-policy CloudFront signed URL, short-lived  generated fresh on
// every playback request rather than stored, so access always re-checks
// enrollment first (see videoController.getPlaybackUrl).
export function signCloudFrontUrl(path: string, expiresInSeconds = 3600): string {
  requireAwsConfig("cloudfrontDomain", "cloudfrontKeyPairId", "cloudfrontPrivateKey");
  const url = `https://${env.aws.cloudfrontDomain}/${path.replace(/^\/+/, "")}`;
  return getCloudFrontSignedUrl({
    url,
    keyPairId: env.aws.cloudfrontKeyPairId,
    privateKey: env.aws.cloudfrontPrivateKey,
    dateLessThan: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  });
}
