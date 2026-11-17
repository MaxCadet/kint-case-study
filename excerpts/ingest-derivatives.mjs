// EXCERPT — image derivative pipeline from the ingest Lambda (trimmed).
//
// For each width, the original is rotated by EXIF orientation and resized
// ONCE into an uncompressed raster; the clean and watermarked JPEGs are both
// encoded from that raster. Decision write-up: docs/decisions/04-derivative-pipeline.md
//
// Omitted from this excerpt: the watermark compositor, the S3 writes, EXIF
// extraction, and the frame-record updates.

import sharp from 'sharp'

export const THUMBNAIL_WIDTHS = [320, 800, 1600, 2400]
// Every camera original clears these three, so they are always written.
export const LARGEST_LEGACY_WIDTH = 1600

// A recipe change writes to a NEW KEY instead of overwriting: derivatives are
// cached for a day, so overwriting in place would leave viewers on a mix of
// old and new pixels with nothing to tell them apart. Each frame records the
// revision its derivatives were built at.
export const DERIVATIVE_REV = 'v2'

// Output sharpening after the downscale, gentlest on the 320 tile.
// m1: 0 sharpens edges only, so flat areas (skin, sky) don't pick up grain.
const SHARPEN = {
  320: { sigma: 0.5, m1: 0, m2: 2.0 },
  800: { sigma: 0.6, m1: 0, m2: 2.5 },
  1600: { sigma: 0.7, m1: 0, m2: 2.5 },
  2400: { sigma: 0.8, m1: 0, m2: 2.5 },
}

// Full chroma resolution: about the same file size as 4:2:0, with
// measurably lower colour error. mozjpeg is deliberately OFF — it was ~26%
// smaller but measurably softer, and 2.3x slower to encode.
const JPEG = { quality: 80, chromaSubsampling: '4:4:4' }

/** Where a derivative lives. The revision sits INSIDE the prefix: the prefix
 * is a security boundary (only the watermarked prefix is readable by the
 * CDN), and a revision must never be able to move bytes across it. */
export function derivativeKey(prefix, frameId, width, rev = DERIVATIVE_REV) {
  return `${prefix}${frameId}/${rev}/${width}.jpg`
}

/** The recipe, in one place, so ingest and the backfill script can't drift apart. */
export function encodeDerivative(pipeline, width) {
  return pipeline.sharpen(SHARPEN[width]).jpeg(JPEG)
}

/**
 * Every derivative of one original, as (width, clean, marked) entries.
 * Encoders are returned as thunks so the caller writes each one and drops it;
 * a 2400px raster's two encodes never pile up in memory with the next width's.
 */
export async function* derivatives(buffer, { watermark }) {
  // failOn: 'none' — a truncated JPEG (camera dropped Wi-Fi mid-file) still
  // decodes. The client gets a partial photo rather than a hole; the
  // truncation is recorded on the frame separately.
  const image = sharp(buffer, { failOn: 'none' })

  for (const width of THUMBNAIL_WIDTHS) {
    // Resize once to a raw raster. Encoding the clean JPEG first and then
    // compositing the mark onto THAT would make the public copy a re-encode
    // of an already-lossy file, for no saving.
    const { data: raster, info } = await image
      .clone()
      .rotate() // apply EXIF orientation before resizing
      .resize({ width, withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true })

    // Only name a size the image actually reached. A 1616px original resized
    // "to 2400" comes back 1616px wide, and advertising it as 2400w would make
    // the browser pick it for a 2400px slot and render it upscaled.
    if (width > LARGEST_LEGACY_WIDTH && info.width < width) continue

    const raw = { raw: { width: info.width, height: info.height, channels: info.channels } }
    yield {
      width,
      clean: () => encodeDerivative(sharp(raster, raw), width).toBuffer(),
      marked: () => watermark(raster, raw, info, width),
    }
  }
}

const JPEG_SOI = [0xff, 0xd8]
const JPEG_EOI = [0xff, 0xd9]

/**
 * True if a JPEG is missing its end-of-image marker (an interrupted upload).
 * Pure, so the rule is unit-testable with no AWS and no image library.
 * Non-JPEG input returns false, meaning "not known to be truncated".
 */
export function isTruncatedJpeg(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false
  if (buffer[0] !== JPEG_SOI[0] || buffer[1] !== JPEG_SOI[1]) return false
  let end = buffer.length
  while (end > 2 && buffer[end - 1] === 0x00) end -= 1 // some writers pad after the marker
  return !(buffer[end - 2] === JPEG_EOI[0] && buffer[end - 1] === JPEG_EOI[1])
}
