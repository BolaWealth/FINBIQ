// FINBIQ R2 helper stub v0.1.0 — Deps: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner.
// Env: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.R2_ENDPOINT ?? "";
const Bucket = process.env.R2_BUCKET ?? "finbiq-dev";

export const r2 = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export const keyFor = {
  kyc: (userId: string, filename: string) => `kyc/${userId}/${Date.now()}-${filename}`,
  receipt: (transferId: string) => `receipts/${transferId}.pdf`,
};

export const presignedPut = (Key: string, ContentType = "application/octet-stream") =>
  getSignedUrl(r2, new PutObjectCommand({ Bucket, Key, ContentType }), { expiresIn: 600 });

export const presignedGet = (Key: string) =>
  getSignedUrl(r2, new GetObjectCommand({ Bucket, Key }), { expiresIn: 900 });
