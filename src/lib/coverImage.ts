export const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_EDGE_PX = 1600

export const COVER_IMAGE_ACCEPT = 'image/png,image/jpeg,.png,.jpg,.jpeg'

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable image'))
    }
    img.src = url
  })
}

/**
 * Downscale and re-encode as JPEG in the browser. Re-encoding bakes in the
 * camera orientation and drops EXIF/GPS before upload; the server strips
 * metadata again regardless.
 */
export async function prepareCoverImage(file: File): Promise<File> {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    throw new Error('Cover photo must be a PNG or JPG image.')
  }
  const img = await loadImage(file).catch(() => {
    throw new Error('That image could not be read. Try a different photo.')
  })
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not process this image.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  )
  if (!blob) throw new Error('Your browser could not process this image.')
  if (blob.size > MAX_COVER_IMAGE_BYTES) {
    throw new Error('Cover photo must be 5 MB or smaller.')
  }
  return new File([blob], 'cover.jpg', { type: 'image/jpeg' })
}
