// Client-side image downscale + re-encode before upload. Admins drop in raw
// PNG/JPEG screenshots and covers (often multi-MB); we never display them at
// anywhere near full resolution, so shrinking them here is the single biggest
// lever on Supabase Storage egress — the bytes a player downloads are the bytes
// we encode here. Mirrors the approach in audioTrim.ts for soundtracks.
//
// Each caller passes a `maxWidth` matched to the largest size that image is
// ever shown at (× a retina factor), so quality is preserved where it matters
// (the big blurred cover) and slashed where it doesn't (a 170px reveal thumb).

export type CompressOpts = {
  // Longest the image is ever displayed (CSS px) × ~2–3 for retina. The image
  // is downscaled to fit within maxWidth × maxHeight, preserving aspect ratio.
  // Never upscaled.
  maxWidth: number
  maxHeight?: number
  // 0..1 encoder quality for the lossy formats. Default 0.82.
  quality?: number
  // Output format. WebP is ~30% smaller than JPEG at equal quality and keeps
  // alpha (needed for logos). Default 'image/webp'.
  mimeType?: 'image/webp' | 'image/jpeg'
}

// Only raster formats are worth re-encoding. SVG/GIF (and anything exotic) pass
// through untouched — rasterizing an SVG would *grow* it, and we'd lose GIF
// animation.
const RASTER = /^image\/(png|jpe?g|webp|bmp)$/i

export async function compressImage(
  file: File,
  opts: CompressOpts,
): Promise<File> {
  if (!RASTER.test(file.type)) return file

  const { maxWidth, maxHeight = Infinity, quality = 0.82, mimeType = 'image/webp' } = opts

  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await loadBitmap(file)
  } catch {
    // Decode failed — better to upload the original than to drop the file.
    return file
  }

  const srcW = bitmap instanceof HTMLImageElement ? bitmap.naturalWidth : bitmap.width
  const srcH = bitmap instanceof HTMLImageElement ? bitmap.naturalHeight : bitmap.height
  const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH)
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    closeBitmap(bitmap)
    return file
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  closeBitmap(bitmap)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  )
  // toBlob can return null (encoder unsupported/OOM); also bail if we somehow
  // made it bigger while not downscaling (already-tiny WebP source).
  if (!blob || (blob.size >= file.size && scale === 1)) return file

  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg'
  const base = file.name.replace(/\.[^.]+$/, '') || 'image'
  return new File([blob], `${base}.${ext}`, { type: mimeType })
}

// Presets keyed to where each image is actually displayed (see the matching
// game page). maxWidth = largest CSS render width × a retina factor.
export const IMG_PRESETS = {
  // Reveal-only covers (Screenshot / Soundtrack / Trophy): shown at 170px wide
  // in AnswerReveal. 512 covers 3× retina with room to spare.
  cover: { maxWidth: 512, quality: 0.82 } satisfies CompressOpts,
  // Blur cover IS the puzzle, rendered large (BlurGame BASE_COVER_WIDTH_PX 520,
  // up to ~832 with zoom comp). Keep it sharp for the final unblurred reveal.
  blurCover: { maxWidth: 1000, quality: 0.85 } satisfies CompressOpts,
  // Screenshots: the main gameplay image, shown near full card width.
  screenshot: { maxWidth: 1600, quality: 0.8 } satisfies CompressOpts,
  // Higher/Lower comparison cards — small.
  higherlower: { maxWidth: 640, quality: 0.82 } satisfies CompressOpts,
  // Archive scene frames (shown large) and the chest logo (small, alpha kept).
  archiveFrame: { maxWidth: 1280, quality: 0.8 } satisfies CompressOpts,
  archiveLogo: { maxWidth: 512, quality: 0.85 } satisfies CompressOpts,
} as const

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap is faster and runs off the main decode path; from-image
  // applies EXIF orientation so phone-camera uploads aren't sideways.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Safari historically rejected the options arg — fall back to <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function closeBitmap(b: ImageBitmap | HTMLImageElement) {
  if ('close' in b) b.close()
}
