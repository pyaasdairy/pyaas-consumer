import { api, isBackendConfigured } from './apiClient';
import { logDiag } from './diag';

/**
 * PHOTO UPLOADS (contract C4).
 *
 * A device file:// path must never travel in a complaint or an address: the
 * operator and the rider app cannot open it. The bytes go to object storage
 * through a presigned PUT and only the resulting file_url is sent.
 *
 *   POST /uploads/presign { kind, content_type }
 *     -> { upload_url, method: "PUT", headers: {...}, file_url }
 *   PUT <upload_url> <bytes>, with the returned headers
 *
 * Degrades to null on an older backend (presign 404), offline, or a failed
 * PUT. The caller then sends NO photo rather than a path nobody can read.
 */

export type UploadKind = 'complaint_photo' | 'door_photo';

type PresignResponse = {
  upload_url?: string;
  method?: string;
  headers?: Record<string, string>;
  file_url?: string;
};

/** A presigned PUT of a phone photo over a slow uplink; the API client's
 *  15 s budget is too tight for it. */
const UPLOAD_TIMEOUT_MS = 45000;

/** True for a URL that already lives on a server (nothing to upload). */
export function isRemoteUrl(uri: string | null | undefined): boolean {
  return !!uri && /^https?:\/\//i.test(uri);
}

/** MIME type from the local uri's extension; the pickers hand back JPEG by
 *  default, so that is the fallback. */
export function contentTypeFor(uri: string): string {
  const ext = (uri.split('?')[0].split('#')[0].split('.').pop() ?? '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/**
 * Upload a local photo and return its file_url, or null when it could not be
 * uploaded (older backend without presign, offline, PUT rejected). An
 * already-remote URL passes through untouched. Never throws.
 */
export async function uploadPhoto(kind: UploadKind, localUri: string | null | undefined): Promise<string | null> {
  if (!localUri) return null;
  if (isRemoteUrl(localUri)) return localUri;
  if (!isBackendConfigured()) return null;
  const content_type = contentTypeFor(localUri);
  let presign: PresignResponse | null = null;
  try {
    presign = await api.post<PresignResponse>('/uploads/presign', { kind, content_type });
  } catch {
    // A 404 is an older backend; anything else was already logged by the
    // API client. Either way there is nothing the operator could open.
    return null;
  }
  if (!presign?.upload_url || !presign.file_url) return null;
  const method = (presign.method || 'PUT').toUpperCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    // fetch on a file:// uri yields the bytes as a Blob on both platforms.
    const bytes = await (await fetch(localUri)).blob();
    const res = await fetch(presign.upload_url, {
      method,
      headers: { 'Content-Type': content_type, ...(presign.headers ?? {}) },
      body: bytes,
      signal: controller.signal,
    });
    if (!res.ok) {
      // The presigned URL carries a signature, so the diag line names the
      // kind, never the URL.
      logDiag({ kind: 'api-error', method, path: `/uploads/${kind}`, status: res.status, message: `Photo upload rejected (${res.status})` });
      return null;
    }
    return presign.file_url;
  } catch (e) {
    logDiag({ kind: 'network', method, path: `/uploads/${kind}`, message: e instanceof Error ? e.message : 'Photo upload failed' });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
