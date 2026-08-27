import { AwsClient } from 'aws4fetch';

export interface R2S3Bindings {
  R2_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}

function configured(env: R2S3Bindings) {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_BUCKET_NAME && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);
}

function client(env: R2S3Bindings) {
  if (!configured(env)) throw new Error('R2 S3 storage is not configured.');
  return new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: 's3', region: 'auto', retries: 2 });
}

function baseUrl(env: R2S3Bindings) {
  if (!env.R2_ACCOUNT_ID) throw new Error('R2 S3 account is not configured.');
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function encodedKey(key: string) {
  return key.split('/').map((part) => encodeURIComponent(part)).join('/');
}

export function r2S3Configured(env: R2S3Bindings) {
  return configured(env);
}

export function r2S3ObjectUrl(env: R2S3Bindings, key: string) {
  if (!env.R2_BUCKET_NAME) throw new Error('R2 S3 bucket is not configured.');
  return `${baseUrl(env)}/${encodeURIComponent(env.R2_BUCKET_NAME)}/${encodedKey(key)}`;
}

export async function r2S3List(env: R2S3Bindings) {
  if (!env.R2_BUCKET_NAME) throw new Error('R2 S3 bucket is not configured.');
  return client(env).fetch(`${baseUrl(env)}/${encodeURIComponent(env.R2_BUCKET_NAME)}?list-type=2&max-keys=1`, { method: 'GET' });
}

export async function r2S3Get(env: R2S3Bindings, key: string) {
  const response = await client(env).fetch(r2S3ObjectUrl(env, key), { method: 'GET' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('R2 media read failed.');
  return response;
}

export async function r2S3Put(env: R2S3Bindings, key: string, body: BodyInit, contentType: string, cacheControl = 'public, max-age=31536000, immutable') {
  const response = await client(env).fetch(r2S3ObjectUrl(env, key), {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Cache-Control': cacheControl },
    body,
  });
  if (!response.ok) throw new Error('R2 media upload failed.');
}

function uploadIdFromXml(xml: string) {
  const value = xml.match(/<UploadId>([^<]+)<\/UploadId>/i)?.[1];
  if (!value) throw new Error('R2 multipart upload did not return an upload ID.');
  return value;
}

function etagFromHeaders(response: Response) {
  const etag = response.headers.get('etag');
  if (!etag) throw new Error('R2 multipart upload did not return an ETag.');
  return etag;
}

export async function r2S3CreateMultipartUpload(env: R2S3Bindings, key: string, contentType: string) {
  const response = await client(env).fetch(`${r2S3ObjectUrl(env, key)}?uploads`, { method: 'POST', headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  if (!response.ok) throw new Error('R2 multipart upload could not be started.');
  return uploadIdFromXml(await response.text());
}

export async function r2S3UploadPart(env: R2S3Bindings, key: string, uploadId: string, partNumber: number, body: BodyInit) {
  const query = new URLSearchParams({ partNumber: String(partNumber), uploadId });
  const response = await client(env).fetch(`${r2S3ObjectUrl(env, key)}?${query.toString()}`, { method: 'PUT', body });
  if (!response.ok) throw new Error('R2 multipart part upload failed.');
  return etagFromHeaders(response);
}

export async function r2S3CompleteMultipartUpload(env: R2S3Bindings, key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>) {
  const xml = `<CompleteMultipartUpload>${parts.map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
  const query = new URLSearchParams({ uploadId });
  const response = await client(env).fetch(`${r2S3ObjectUrl(env, key)}?${query.toString()}`, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml });
  if (!response.ok) throw new Error('R2 multipart upload could not be completed.');
}
