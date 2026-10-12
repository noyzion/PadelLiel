const MAX_EDGE = 1920;
/** Photos under this size and dimension are uploaded untouched. */
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;

/**
 * Shrinks a large photo in the browser before upload (long edge <= 1920px, WebP or JPEG) so a phone
 * picture of several MB becomes a few hundred KB. Small images are returned unchanged, and if the
 * browser cannot decode or re-encode the file the original is returned (the server validates it anyway).
 */
export async function prepareEventImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= KEEP_AS_IS_BYTES) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const encode = (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

    let blob = await encode('image/webp', 0.86);
    if (!blob || blob.type !== 'image/webp') {
      // No WebP encoder: JPEG has no alpha channel, so put the picture on white first.
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      blob = await encode('image/jpeg', 0.88);
    }
    if (!blob) return file;
    // Never make a small file bigger.
    if (blob.size >= file.size && file.size <= KEEP_AS_IS_BYTES) return file;

    const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `cover.${extension}`, { type: blob.type });
  } catch {
    return file;
  }
}
