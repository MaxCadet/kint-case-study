# Decision 4 — Resize once, encode twice: the image derivative pipeline

## Context

Each camera original (typically 20–45 MP) needs web-sized versions for a grid, a gallery view and a full-screen viewer. Each size needs two versions: a **clean** one and a **watermarked** one for clients who haven't paid yet. Ingest latency is part of the product promise, and the previews are what clients judge the photographer's work by.

## Decisions

### Resize once into a raw raster, then encode twice

For each width (320, 800, 1600, 2400), the original is rotated by its EXIF orientation and resized **once** into an uncompressed raster. The clean JPEG and the watermarked JPEG are both encoded from that same raster.

- Encoding the clean JPEG first and adding the watermark to *that* file would compress the public copy twice. The extra quality loss would land on the image an unpaid client actually looks at, and save nothing.
- The resize is the expensive step, so doing it once is also faster.

### Only name sizes that really exist

If a smaller original can't reach 2400 px, that size is **skipped**, not stored. Otherwise the browser would pick a "2400" image that's really 1616 px wide and show it upscaled.

### Choose the encoder settings by measurement

- **Output sharpening after the resize**, tuned per size and gentlest on the smallest tile. A strong downscale softens fine detail like lace, hair and embroidery.
- **Full chroma resolution (4:4:4) at quality 80**, instead of the default 4:2:0. The file size is about the same, and measured color error fell noticeably. It's most visible on things like colored fabric against white.
- **mozjpeg left off on purpose.** It produced files about 26% smaller, but it spent the savings on exactly the fine detail the sharpening had restored, and it was 2.3× slower to encode. Ingest speed matters here.

### Versioned keys for each recipe

Derivatives are cached for a day. A recipe change therefore writes to a **new key segment** (`.../v2/1600.jpg`) instead of overwriting the old file. Each frame records which version it was built with. Rolling back means pointing at the old version, not waiting for caches to expire.

## Consequences

- Each original is read and decoded once per size, with no repeated compression.
- The recipe lives in **one function** that both ingest and the backfill script use, so files produced later match files produced by ingest.
- The recipe is covered by tests that check the encoded bytes directly (see [`excerpts/derivatives.test.mjs`](../../excerpts/derivatives.test.mjs)).
