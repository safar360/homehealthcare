import { supabase } from './supabase';

/**
 * Staff and manager photographs.
 *
 * A phone camera produces 3–8 MB per shot. At 200 people that is well over a
 * gigabyte for pictures shown at 44 pixels on a card — enough to push the
 * project off the free tier on storage alone. Every image is therefore resized
 * and re-encoded in the browser before it is uploaded; what leaves the phone is
 * typically 15–25 KB.
 *
 * The bucket is private. A photograph of a care worker is personal data, and a
 * public bucket makes every one of them readable by anyone who learns the URL.
 * Reads go through short-lived signed URLs instead.
 */

const BUCKET = 'avatars';

/** Big enough for a crisp 88px avatar on a 3x screen, small enough to be free. */
const MAX_EDGE = 320;
const QUALITY = 0.78;

/** Matches the ceiling enforced on the bucket itself. */
export const MAX_UPLOAD_BYTES = 262_144;

export type PhotoOwner = 'staff' | 'manager';

/**
 * Square, downscaled, JPEG. Crops to centre rather than squashing, because a
 * squashed face looks wrong in a way people notice without being able to say
 * why.
 */
export async function compressToAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }

  // createImageBitmap honours EXIF orientation, which matters: photographs
  // taken on a phone held sideways otherwise arrive rotated.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const edge = Math.min(MAX_EDGE, side);

  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, edge, edge);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
  );
  if (!blob) throw new Error('Could not process that image.');

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('That image is still too large after resizing. Try a different photo.');
  }
  return blob;
}

/** Stable per person, so replacing a photo overwrites rather than accumulates. */
function pathFor(owner: PhotoOwner, id: string): string {
  return `${owner}/${id}.jpg`;
}

export async function uploadAvatar(
  owner: PhotoOwner,
  id: string,
  file: File
): Promise<{ path: string | null; error: string | null }> {
  let blob: Blob;
  try {
    blob = await compressToAvatar(file);
  } catch (e) {
    return { path: null, error: e instanceof Error ? e.message : 'Could not read that image.' };
  }

  const path = pathFor(owner, id);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (error) {
    return {
      path: null,
      error: /bucket not found/i.test(error.message)
        ? 'Photo storage is not set up yet — docs/patch-phase3-photos.sql needs running.'
        : error.message,
    };
  }
  return { path, error: null };
}

export async function removeAvatar(path: string): Promise<string | null> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return error ? error.message : null;
}

/**
 * Signed URLs for a whole list in one request. Signing per card would mean one
 * round trip per person; this is a single call for the page.
 */
export async function signAvatars(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter(Boolean) as string[])];
  const out = new Map<string, string>();
  if (wanted.length === 0) return out;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(wanted, 3600);
  if (error || !data) return out;

  for (const row of data) {
    if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
  }
  return out;
}

/** Initials for the placeholder shown before a photo exists. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
