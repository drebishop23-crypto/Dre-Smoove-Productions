// Server-only Cloudflare R2 helpers. Song files live in R2: no per-file size
// cap, 10 GB free, and free streaming. R2 speaks the S3 API.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let client = null;

function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Cloudflare R2 is not configured. Add the R2 keys to your environment variables.');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

// Bucket name is not a secret; defaults to the one created for this app.
const bucket = () => process.env.R2_BUCKET || 'dre-smoove-productions';

// One-time URL the browser uses to PUT a file straight into R2.
export function uploadUrl(key, contentType) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType || 'application/octet-stream' }),
    { expiresIn: 60 * 60 }
  );
}

// Short-lived playback / download URL.
export function playUrl(key, seconds = 60 * 60 * 12) {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: seconds });
}

export async function putObject(key, body, contentType) {
  await r2().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key) {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
