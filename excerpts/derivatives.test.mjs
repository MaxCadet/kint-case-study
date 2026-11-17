// EXCERPT — tests for the derivative recipe (trimmed).
//
// These assert properties of the real encoded bytes, not that a particular
// option was passed — a test that only checked the options would keep passing
// if the pipeline stopped applying them.
//
// Run with: node --test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { derivativeKey, encodeDerivative, isTruncatedJpeg } from './ingest-derivatives.mjs'

/**
 * A stand-in for a detailed photograph: many small hard-edged features at
 * moderate contrast over smooth shading (think lace, hair, a pleated dress).
 * Deliberately NOT a checkerboard, which clips at both ends and can't show
 * whether sharpening restored detail. Deterministic, so a failure here is
 * always the recipe and never the fixture.
 */
async function detailed(width, height) {
  const px = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    const x = i % width, y = Math.floor(i / width)
    const block = (((x >> 3) * 2654435761) ^ ((y >> 3) * 40503)) >>> 0
    const edge = block % 97 < 40 ? 70 : 185
    const shading = 30 * Math.sin(x / 140) + 25 * Math.cos(y / 110)
    const v = Math.max(5, Math.min(250, edge + shading))
    px[i * 3] = v
    px[i * 3 + 1] = Math.max(0, Math.min(255, v * 0.85 + 20))
    px[i * 3 + 2] = Math.max(0, Math.min(255, 240 - v * 0.6))
  }
  return sharp(px, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer()
}

/** Variance of the Laplacian over luma: the sharpness measure used to tune the recipe. */
async function acutance(buf) {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  let s = 0, s2 = 0, n = 0
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    const L = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w]
    s += L; s2 += L * L; n++
  }
  return s2 / n - (s / n) ** 2
}

test('derivativeKey keeps the revision inside the security-boundary prefix', () => {
  assert.equal(derivativeKey('thumbnails/', 'abc123', 1600), 'thumbnails/abc123/v2/1600.jpg')
  assert.equal(derivativeKey('public/', 'abc123', 320), 'public/abc123/v2/320.jpg')
  for (const prefix of ['thumbnails/', 'public/']) {
    assert.ok(derivativeKey(prefix, 'f', 800).startsWith(prefix))
  }
})

test('output sharpening restores acutance the downscale removed, at every width', async () => {
  // Same encode settings on both sides, so this isolates the sharpening pass.
  const src = await detailed(3000, 2000)
  for (const width of [320, 800, 1600, 2400]) {
    const resized = () => sharp(src).resize({ width, withoutEnlargement: true })
    const plain = await acutance(await resized().jpeg({ quality: 80, chromaSubsampling: '4:4:4' }).toBuffer())
    const sharpened = await acutance(await encodeDerivative(resized(), width).toBuffer())
    assert.ok(sharpened > plain * 1.2, `width ${width}: expected a real gain, got ${plain.toFixed(0)} -> ${sharpened.toFixed(0)}`)
  }
})

test('every width keeps full chroma resolution', async () => {
  // A chroma regression is invisible to a luma metric, so assert it directly.
  const src = await detailed(3000, 2000)
  for (const width of [320, 800, 1600, 2400]) {
    const buf = await encodeDerivative(sharp(src).resize({ width, withoutEnlargement: true }), width).toBuffer()
    const meta = await sharp(buf).metadata()
    assert.equal(meta.chromaSubsampling, '4:4:4', `width ${width} must not subsample chroma`)
  }
})

test('isTruncatedJpeg flags a missing end-of-image marker and nothing else', () => {
  const complete = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9])
  const padded = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9, 0x00, 0x00])
  const cutOff = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0x03, 0x04])
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])

  assert.equal(isTruncatedJpeg(complete), false)
  assert.equal(isTruncatedJpeg(padded), false, 'zero padding after the marker is not truncation')
  assert.equal(isTruncatedJpeg(cutOff), true)
  assert.equal(isTruncatedJpeg(png), false, 'non-JPEG input is "not known truncated", never "complete"')
})
