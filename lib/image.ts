// Upload-time photo optimization (server-only — used by lib/listings.ts).
//
// Cooks upload whatever their phone produces — multi-MB PNGs were shipping
// as-is to every buyer (a 9-dish kitchen page weighed 17MB). Every PUBLIC
// photo is shrunk at the upload choke point: longest edge capped (never
// upscaled), re-encoded as WebP q80. A ~3MB phone PNG becomes ~200KB with no
// visible difference on any buyer screen. Re-encoding also strips EXIF
// metadata — including GPS coordinates, which for a HOME kitchen is a real
// privacy win. Permit photos are deliberately NOT processed: they're
// admin-only evidence where legibility beats weight, and they can be HEIC/PDF
// which pass through untouched.

import sharp from "sharp";

// Bound sharp's appetite for the small (512MB) web instance: one libvips
// worker thread, no pixel cache. Upload optimization isn't latency-sensitive
// at our scale, and the unbounded defaults (threads = CPU cores + a ~50MB
// operation cache) are what let a few concurrent decodes OOM the whole box
// (Render memory-limit restart, Oct 6 2026). Process-wide, set once here.
sharp.cache(false);
sharp.concurrency(1);

export const PHOTO_MAX_EDGE = 1600; // dish/extra photos + covers
export const AVATAR_MAX_EDGE = 800; // renders small everywhere

// Decompression-bomb guard: the 8MB BYTE cap doesn't bound decoded PIXELS — a
// sub-1MB PNG can declare 267 megapixels and balloon to ~300MB of RAM when
// decoded, enough for a few concurrent uploads to OOM the whole web instance.
// 40MP comfortably covers any real phone photo; over-cap files are rejected at
// header parse (throw → caller uploads the original untouched, as before).
const MAX_INPUT_PIXELS = 40_000_000;

// Pure core (Buffer in/out) so it's unit-testable next to the fee math.
// Throws for anything it shouldn't touch — callers treat a throw as "upload
// the original": decode bombs (above), and ANIMATED images (sharp would
// silently keep only frame 1, freezing a cook's animated webp; passing the
// original through preserves the animation exactly as before this existed).
export async function optimizeImageBuffer(
  input: Buffer,
  maxEdge: number = PHOTO_MAX_EDGE
): Promise<Buffer> {
  const img = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
  const meta = await img.metadata();
  if ((meta.pages ?? 1) > 1) {
    throw new Error("animated image — upload the original untouched");
  }
  return img
    .rotate() // bake in EXIF orientation before the metadata is stripped
    .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

// File wrapper used by the upload helpers. Returns the optimized bytes (+ the
// .webp naming/content-type), or null on ANY failure — callers then upload the
// ORIGINAL exactly as before, so a corrupt/odd file can never break an upload
// that used to succeed.
export async function optimizePhoto(
  file: File,
  maxEdge: number = PHOTO_MAX_EDGE
): Promise<{ body: Buffer; contentType: string; ext: string } | null> {
  try {
    const body = await optimizeImageBuffer(
      Buffer.from(await file.arrayBuffer()),
      maxEdge
    );
    // A pathological input could re-encode LARGER (tiny already-optimized
    // files); keep whichever is smaller by skipping optimization then.
    if (body.length >= file.size) return null;
    return { body, contentType: "image/webp", ext: "webp" };
  } catch {
    return null;
  }
}
