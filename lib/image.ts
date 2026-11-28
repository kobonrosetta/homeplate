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

// Only real JPEG, PNG and WebP files are ever handed to the image library.
// sharp decodes two dozen other formats too (SVG, AVIF, TIFF, GIF, JPEG
// 2000…), picking the decoder from the file's BYTES whatever type the upload
// claimed, and the decoders for those rarer formats are where the memory
// bugs get found (libheif and librsvg, Sep and Oct 2026, both rated remote
// code execution). Public photos are only accepted as JPEG, PNG or WebP
// (lib/listings.ts), so a file that isn't one of those by its first bytes is
// refused here, before anything decodes it. Anyone can open a cook account
// and upload a "photo", so this is the door that matters.
export function sniffPhotoFormat(b: Buffer): "jpeg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "jpeg";
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "png";
  }
  if (
    b.length >= 12 &&
    b.toString("latin1", 0, 4) === "RIFF" &&
    b.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

// Pure core (Buffer in/out) so it's unit-testable next to the fee math.
// Throws for anything it shouldn't touch — callers treat a throw as "upload
// the original": files that aren't JPEG/PNG/WebP (above), decode bombs, and
// ANIMATED images (sharp would silently keep only frame 1, freezing a cook's
// animated webp; passing the original through preserves the animation
// exactly as before this existed).
export async function optimizeImageBuffer(
  input: Buffer,
  maxEdge: number = PHOTO_MAX_EDGE
): Promise<Buffer> {
  if (!sniffPhotoFormat(input)) {
    throw new Error("not a JPEG, PNG or WebP file — upload the original untouched");
  }
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
