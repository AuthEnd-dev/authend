import { mkdir, stat, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { StorageSettings } from '@authend/shared';
import { HttpError } from '../lib/http';
import { env } from '../config/env';
import { readSettingsSection } from './settings-store';
import { sql } from '../db/client';

type UploadInput = {
  file: File;
  visibility?: 'public' | 'private';
  prefix?: string;
  attachment?: {
    table?: string;
    recordId?: string;
    field?: string;
  };
};

type UploadResult = {
  key: string;
  visibility: 'public' | 'private';
  driver: 'local' | 's3';
  sizeBytes: number;
  mimeType: string;
  url: string | null;
};

type SignedUploadInput = {
  key: string;
  contentType?: string;
  visibility?: 'public' | 'private';
  expiresIn?: number;
};

type SignedDownloadInput = {
  key: string;
  expiresIn?: number;
};

type CreateFolderInput = {
  path: string;
  visibility?: 'public' | 'private';
};

type StorageHeadResult = {
  key: string;
  exists: boolean;
  sizeBytes: number | null;
  mimeType: string | null;
  etag?: string | null;
  lastModified?: string | null;
  visibility?: 'public' | 'private' | null;
};

type StorageFileRecord = {
  id: string;
  key: string;
  visibility: 'public' | 'private';
  driver: 'local' | 's3';
  sizeBytes: number | null;
  mimeType: string | null;
  url: string | null;
  attachmentTable: string | null;
  attachmentRecordId: string | null;
  attachmentField: string | null;
  createdAt: string;
  updatedAt: string;
};

function sanitizePathSegment(value: string) {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, '-'))
    .filter(Boolean)
    .join('/');
}

function sanitizeFileName(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '-');
  return cleaned.length > 0 ? cleaned : 'upload.bin';
}

function joinKey(prefix: string | undefined, name: string) {
  const normalizedPrefix = prefix ? sanitizePathSegment(prefix) : '';
  return normalizedPrefix.length > 0 ? `${normalizedPrefix}/${name}` : name;
}

function buildPublicUrl(baseUrl: string | null | undefined, key: string) {
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl.replace(/\/+$/, '')}/${key}`;
}

/** Reject spoofed image uploads when declared MIME is image/* (PNG, JPEG, GIF, WebP). */
export function validateImageMagicBytes(buffer: Buffer, mimeType: string) {
  if (!mimeType.startsWith('image/')) {
    return;
  }
  const mime = mimeType.toLowerCase();
  if (mime === 'image/png') {
    if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
      throw new HttpError(400, 'File content does not match declared PNG image');
    }
    return;
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      throw new HttpError(400, 'File content does not match declared JPEG image');
    }
    return;
  }
  if (mime === 'image/gif') {
    const head = buffer.subarray(0, 6).toString('ascii');
    if (head !== 'GIF89a' && head !== 'GIF87a') {
      throw new HttpError(400, 'File content does not match declared GIF image');
    }
    return;
  }
  if (mime === 'image/webp') {
    if (
      buffer.length < 12 ||
      buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WEBP'
    ) {
      throw new HttpError(400, 'File content does not match declared WebP image');
    }
    return;
  }
}

function createLocalDownloadSignature(secret: string, key: string, expiresAtUnix: number) {
  return createHmac('sha256', secret).update(`${key}:${expiresAtUnix}`).digest('hex');
}

export function verifyLocalSignedDownload(input: {
  key: string;
  expiresAtUnix: number;
  signature: string;
}) {
  const nowUnix = Math.floor(Date.now() / 1000);
  if (input.expiresAtUnix < nowUnix) {
    return false;
  }

  const expected = createLocalDownloadSignature(env.BETTER_AUTH_SECRET, input.key, input.expiresAtUnix);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(input.signature, 'hex');
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function upsertStorageFileRecord(input: {
  key: string;
  visibility: 'public' | 'private';
  driver: 'local' | 's3';
  sizeBytes: number;
  mimeType: string;
  url: string | null;
  attachment?: {
    table?: string;
    recordId?: string;
    field?: string;
  };
}) {
  const id = `file_${randomUUID()}`;
  const attachmentTable = input.attachment?.table?.trim() || null;
  const attachmentRecordId = input.attachment?.recordId?.trim() || null;
  const attachmentField = input.attachment?.field?.trim() || null;
  await sql`
    insert into _storage_files (
      id,
      object_key,
      visibility,
      driver,
      size_bytes,
      mime_type,
      public_url,
      attachment_table,
      attachment_record_id,
      attachment_field,
      created_at,
      updated_at
    )
    values (
      ${id},
      ${input.key},
      ${input.visibility},
      ${input.driver},
      ${String(input.sizeBytes)},
      ${input.mimeType},
      ${input.url},
      ${attachmentTable},
      ${attachmentRecordId},
      ${attachmentField},
      now(),
      now()
    )
    on conflict (object_key) do update set
      visibility = excluded.visibility,
      driver = excluded.driver,
      size_bytes = excluded.size_bytes,
      mime_type = excluded.mime_type,
      public_url = excluded.public_url,
      attachment_table = excluded.attachment_table,
      attachment_record_id = excluded.attachment_record_id,
      attachment_field = excluded.attachment_field,
      updated_at = excluded.updated_at
  `;
}

async function getStorageConfig(): Promise<StorageSettings> {
  return (await readSettingsSection('storage')).config;
}

function resolveStorageConfigErrors(config: StorageSettings) {
  if (!config.bucket || !config.region) {
    throw new HttpError(400, 'S3 driver requires bucket and region');
  }
}

function createBunS3Client(config: StorageSettings) {
  resolveStorageConfigErrors(config);
  return new Bun.S3Client({
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint || undefined,
    accessKeyId: config.accessKeyId || undefined,
    secretAccessKey: config.secretAccessKey || undefined,
    virtualHostedStyle: !config.forcePathStyle,
  });
}

export async function writeManagedStorageObject(input: {
  key: string;
  body: Buffer;
  mimeType: string;
  visibility?: 'public' | 'private';
}) {
  const config = await getStorageConfig();
  const visibility = input.visibility ?? config.defaultVisibility;

  if (config.driver === 'local') {
    const root = resolve(process.cwd(), config.rootPath);
    const absolutePath = resolve(root, input.key);
    const parent = absolutePath.slice(0, absolutePath.lastIndexOf('/'));
    await mkdir(parent, { recursive: true });
    await Bun.write(absolutePath, input.body);
    const result = {
      key: input.key,
      visibility,
      driver: 'local' as const,
      sizeBytes: input.body.length,
      mimeType: input.mimeType,
      url: buildPublicUrl(config.publicBaseUrl, input.key),
    };
    await upsertStorageFileRecord(result);
    return result;
  }

  const client = createBunS3Client(config);
  const s3Object = client.file(input.key);
  await s3Object.write(input.body, {
    type: input.mimeType,
  });

  const result = {
    key: input.key,
    visibility,
    driver: 's3' as const,
    sizeBytes: input.body.length,
    mimeType: input.mimeType,
    url: buildPublicUrl(config.publicBaseUrl, input.key),
  };
  await upsertStorageFileRecord(result);
  return result;
}

export async function readStoredObjectBuffer(key: string) {
  const config = await getStorageConfig();

  if (config.driver === 'local') {
    const file = await readLocalStoredFile(key);
    return Buffer.from(await file.arrayBuffer());
  }

  const client = createBunS3Client(config);
  const s3Object = client.file(key) as { arrayBuffer: () => Promise<ArrayBuffer> };
  try {
    return Buffer.from(await s3Object.arrayBuffer());
  } catch {
    throw new HttpError(404, 'Storage file not found');
  }
}

export async function uploadFile(input: UploadInput): Promise<UploadResult> {
  const config = await getStorageConfig();
  const visibility = input.visibility ?? config.defaultVisibility;
  const mimeType = input.file.type || 'application/octet-stream';

  if (input.file.size > config.maxUploadBytes) {
    throw new HttpError(413, `Upload exceeds maxUploadBytes (${config.maxUploadBytes})`);
  }

  if (config.allowedMimeTypes.length > 0 && !config.allowedMimeTypes.includes(mimeType)) {
    throw new HttpError(415, `MIME type not allowed: ${mimeType}`);
  }

  const objectName = sanitizeFileName(input.file.name);
  const key = joinKey(input.prefix, objectName);
  const body = Buffer.from(await input.file.arrayBuffer());

  if (config.validateImageMagicBytes) {
    validateImageMagicBytes(body, mimeType);
  }

  if (config.driver === 'local') {
    const root = resolve(process.cwd(), config.rootPath);
    const absolutePath = resolve(root, key);
    const parent = absolutePath.slice(0, absolutePath.lastIndexOf('/'));
    await mkdir(parent, { recursive: true });
    await Bun.write(absolutePath, body);
    const result = {
      key,
      visibility,
      driver: 'local' as const,
      sizeBytes: input.file.size,
      mimeType,
      url: buildPublicUrl(config.publicBaseUrl, key),
    };
    await upsertStorageFileRecord({
      ...result,
      attachment: input.attachment,
    });
    return result;
  }

  const client = createBunS3Client(config);

  const s3Object = client.file(key);
  await s3Object.write(body, {
    type: mimeType,
  });

  const result = {
    key,
    visibility,
    driver: 's3' as const,
    sizeBytes: input.file.size,
    mimeType,
    url: buildPublicUrl(config.publicBaseUrl, key),
  };
  await upsertStorageFileRecord({
    ...result,
    attachment: input.attachment,
  });
  return result;
}

export async function createFolder(input: CreateFolderInput): Promise<UploadResult> {
  const config = await getStorageConfig();
  const visibility = input.visibility ?? config.defaultVisibility;
  const folderPath = sanitizePathSegment(input.path);
  if (!folderPath) {
    throw new HttpError(400, 'path is required');
  }

  const key = `${folderPath}/.__dir__.txt`;
  const markerContent = Buffer.from('directory marker');
  const mimeType = 'text/plain';

  if (config.driver === 'local') {
    const root = resolve(process.cwd(), config.rootPath);
    const absolutePath = resolve(root, key);
    const parent = absolutePath.slice(0, absolutePath.lastIndexOf('/'));
    await mkdir(parent, { recursive: true });
    await Bun.write(absolutePath, markerContent);
    const result = {
      key,
      visibility,
      driver: 'local' as const,
      sizeBytes: markerContent.length,
      mimeType,
      url: buildPublicUrl(config.publicBaseUrl, key),
    };
    await upsertStorageFileRecord(result);
    return result;
  }

  const client = createBunS3Client(config);
  const s3Object = client.file(key);
  await s3Object.write(markerContent, { type: mimeType });
  const result = {
    key,
    visibility,
    driver: 's3' as const,
    sizeBytes: markerContent.length,
    mimeType,
    url: buildPublicUrl(config.publicBaseUrl, key),
  };
  await upsertStorageFileRecord(result);
  return result;
}

export async function createSignedUploadUrl(input: SignedUploadInput) {
  const config = await getStorageConfig();
  const expiresIn = Math.max(30, Math.min(input.expiresIn ?? config.signedUrlTtlSeconds, 604800));
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const declaredType = input.contentType?.trim() || 'application/octet-stream';
  if (config.allowedMimeTypes.length > 0 && !config.allowedMimeTypes.includes(declaredType)) {
    throw new HttpError(415, `MIME type not allowed for signed upload: ${declaredType}`);
  }

  if (config.driver === 'local') {
    throw new HttpError(400, 'Signed upload URLs are only supported for s3 driver');
  }

  const client = createBunS3Client(config);
  const s3Object = client.file(input.key) as any;
  const url = await s3Object.presign({
    method: 'PUT',
    expiresIn,
    type: declaredType,
  });

  return {
    url,
    method: 'PUT' as const,
    key: input.key,
    expiresAt,
    headers: {},
  };
}

export async function createSignedDownloadUrl(input: SignedDownloadInput) {
  const config = await getStorageConfig();
  const expiresIn = Math.max(30, Math.min(input.expiresIn ?? config.signedUrlTtlSeconds, 604800));
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const expiresAtUnix = Math.floor(new Date(expiresAt).getTime() / 1000);

  if (config.driver === 'local') {
    const baseUrl = config.publicBaseUrl || env.APP_URL;
    const signature = createLocalDownloadSignature(env.BETTER_AUTH_SECRET, input.key, expiresAtUnix);
    const url = new URL('/api/storage/download', baseUrl);
    url.searchParams.set('key', input.key);
    url.searchParams.set('expires', String(expiresAtUnix));
    url.searchParams.set('sig', signature);
    return {
      url: url.toString(),
      method: 'GET' as const,
      key: input.key,
      expiresAt,
    };
  }

  const client = createBunS3Client(config);
  const s3Object = client.file(input.key) as any;
  const url = await s3Object.presign({
    method: 'GET',
    expiresIn,
  });

  return {
    url,
    method: 'GET' as const,
    key: input.key,
    expiresAt,
  };
}

export async function readLocalStoredFile(key: string) {
  const config = await getStorageConfig();
  if (config.driver !== 'local') {
    throw new HttpError(400, 'Local file download is only supported for local storage driver');
  }
  const absolutePath = resolve(process.cwd(), config.rootPath, key);
  const file = Bun.file(absolutePath);
  const exists = await file.exists();
  if (!exists) {
    throw new HttpError(404, 'Storage file not found');
  }
  return file;
}

/**
 * Stream a stored object without authentication when settings allow it and metadata marks the object public.
 * Missing rows or private visibility return 404 to avoid leaking object existence.
 */
export async function readPublicObject(key: string): Promise<{ body: Buffer | ReturnType<typeof Bun.file>; mimeType: string }> {
  const config = await getStorageConfig();
  if (!config.allowAnonymousPublicRead) {
    throw new HttpError(403, 'Anonymous access to public objects is disabled');
  }

  const rows = await sql<{ visibility: string; mime_type: string | null }[]>`
    select visibility, mime_type
    from _storage_files
    where object_key = ${key}
    limit 1
  `;
  const row = rows[0];
  if (!row || row.visibility !== 'public') {
    throw new HttpError(404, 'Not found');
  }

  const mimeType = row.mime_type?.trim() || 'application/octet-stream';

  if (config.driver === 'local') {
    const file = await readLocalStoredFile(key);
    return { body: file, mimeType };
  }

  const client = createBunS3Client(config);
  const s3Object = client.file(key) as { arrayBuffer: () => Promise<ArrayBuffer> };
  try {
    const ab = await s3Object.arrayBuffer();
    return { body: Buffer.from(ab), mimeType };
  } catch {
    throw new HttpError(404, 'Not found');
  }
}

export async function headStoredFile(key: string): Promise<StorageHeadResult> {
  const config = await getStorageConfig();

  if (config.driver === 'local') {
    const absolutePath = resolve(process.cwd(), config.rootPath, key);
    try {
      const fileStat = await stat(absolutePath);
      return {
        key,
        exists: true,
        sizeBytes: fileStat.size,
        mimeType: null,
        etag: null,
        lastModified: fileStat.mtime.toISOString(),
        visibility: null,
      };
    } catch {
      return {
        key,
        exists: false,
        sizeBytes: null,
        mimeType: null,
        etag: null,
        lastModified: null,
        visibility: null,
      };
    }
  }

  const client = createBunS3Client(config);
  const s3Object = client.file(key) as any;
  try {
    const metadata = await s3Object.stat();
    return {
      key,
      exists: true,
      sizeBytes: typeof metadata?.size === 'number' ? metadata.size : null,
      mimeType: metadata?.type ?? null,
      etag: metadata?.etag ?? null,
      lastModified: metadata?.lastModified ? new Date(metadata.lastModified).toISOString() : null,
      visibility: null,
    };
  } catch {
    return {
      key,
      exists: false,
      sizeBytes: null,
      mimeType: null,
      etag: null,
      lastModified: null,
      visibility: null,
    };
  }
}

export async function removeStoredFile(key: string) {
  const config = await getStorageConfig();

  if (config.driver === 'local') {
    const absolutePath = resolve(process.cwd(), config.rootPath, key);
    try {
      await unlink(absolutePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('ENOENT')) {
        throw error;
      }
    }
    await sql`delete from _storage_files where object_key = ${key}`;
    return;
  }

  const client = createBunS3Client(config);
  const s3Object = client.file(key) as any;
  await s3Object.delete();
  await sql`delete from _storage_files where object_key = ${key}`;
}

export async function listStorageFileRecords(input?: {
  table?: string;
  recordId?: string;
  field?: string;
  limit?: number;
  /** Case-insensitive substring match on object_key. */
  search?: string;
  visibility?: 'public' | 'private';
  /** Only keys in this path prefix (folder), e.g. `uploads/2024`. */
  prefix?: string;
}) {
  const limit = Math.max(1, Math.min(input?.limit ?? 50, 500));
  const searchTrim = input?.search?.trim() ?? '';
  const searchParam = searchTrim.length > 0 ? searchTrim : null;
  const visibilityParam = input?.visibility ?? null;
  const prefixTrim = input?.prefix?.trim() ?? '';
  const prefixParam = prefixTrim.length > 0 ? prefixTrim : null;

  const rows = await sql<StorageFileRecord[]>`
    select
      id,
      object_key as "key",
      visibility,
      driver,
      size_bytes::bigint::text as "sizeBytes",
      mime_type as "mimeType",
      public_url as "url",
      attachment_table as "attachmentTable",
      attachment_record_id as "attachmentRecordId",
      attachment_field as "attachmentField",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from _storage_files
    where (${input?.table ?? null}::text is null or attachment_table = ${input?.table ?? null})
      and (${input?.recordId ?? null}::text is null or attachment_record_id = ${input?.recordId ?? null})
      and (${input?.field ?? null}::text is null or attachment_field = ${input?.field ?? null})
      and (${searchParam}::text is null or position(lower(${searchParam}) in lower(object_key)) > 0)
      and (${visibilityParam}::text is null or visibility = ${visibilityParam})
      and (
        case
          when ${prefixParam}::text is null then true
          else (object_key = ${prefixParam} or object_key like (${prefixParam}::text || '/%'))
        end
      )
    order by created_at desc
    limit ${String(limit)}
  `;

  return rows.map((row) => ({
    ...row,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
  }));
}

export async function getStorageFileRecordById(id: string) {
  const rows = await sql<StorageFileRecord[]>`
    select
      id,
      object_key as "key",
      visibility,
      driver,
      size_bytes::bigint::text as "sizeBytes",
      mime_type as "mimeType",
      public_url as "url",
      attachment_table as "attachmentTable",
      attachment_record_id as "attachmentRecordId",
      attachment_field as "attachmentField",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from _storage_files
    where id = ${id}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new HttpError(404, 'Storage file metadata not found');
  }
  return {
    ...row,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
  };
}
