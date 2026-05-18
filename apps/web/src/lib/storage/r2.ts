import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2Env = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

let r2Client: S3Client | null = null;

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to apps/web/.env.local.`);
  }
  return value;
}

function getR2Env(): R2Env {
  return {
    accountId: readRequiredEnv("R2_ACCOUNT_ID"),
    accessKeyId: readRequiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: readRequiredEnv("R2_SECRET_ACCESS_KEY"),
    bucket: readRequiredEnv("R2_BUCKET"),
    publicUrl: readRequiredEnv("R2_PUBLIC_URL"),
  };
}

function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  const { accountId, accessKeyId, secretAccessKey } = getR2Env();
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // AWS SDK v3 computes CRC32 checksums by default. R2 does not support
    // these headers and they also complicate CORS preflight. Disable them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return r2Client;
}

export async function createUploadUrl(input: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { bucket } = getR2Env();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.contentType,
  });

  return getSignedUrl(getR2Client(), command, {
    expiresIn: input.expiresInSeconds ?? 300,
  });
}

export function buildPublicUrl(key: string): string {
  const { publicUrl } = getR2Env();
  return `${publicUrl.replace(/\/+$/, "")}/${key}`;
}
