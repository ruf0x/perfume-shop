/**
 * Shrinks a photo in the browser before upload: any readable format (jpg, png, webp, gif, bmp),
 * at most 1200 px, WebP. Phone photos of 5-12 MB become a few hundred KB and the server never has to
 * decode a huge file. Throws a French message when the browser cannot read the file.
 */
export async function prepareImage(file: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`« ${file.name} » ne peut pas être lu. Essayez de l'enregistrer en jpg ou png.`)
  }

  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
  if (!blob) throw new Error(`« ${file.name} » n'a pas pu être préparée.`)
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
}
