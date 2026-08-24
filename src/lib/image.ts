/**
 * Préparation d'un fond d'écran de tableau : on vérifie que c'est bien une
 * image lisible, et on réduit les photos géantes avant de les stocker —
 * Storage avale sans broncher un original de 15 Mo, mais le garder ne sert
 * qu'à ralentir le chargement et à consommer le quota.
 */

const MAX_BYTES = 20 * 1024 * 1024
/** Au-delà de ce côté en pixels, l'image est rééchantillonnée. */
const MAX_EDGE = 2560

export async function prepareWallpaper(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`« ${file.name} » n'est pas une image.`)
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `« ${file.name} » pèse ${(file.size / 1024 / 1024).toFixed(0)} Mo — la limite est de ${MAX_BYTES / 1024 / 1024} Mo.`,
    )
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () =>
        reject(new Error(`Impossible de lire « ${file.name} » — format non pris en charge.`))
      el.src = url
    })

    const edge = Math.max(image.naturalWidth, image.naturalHeight)
    if (edge <= MAX_EDGE) return file

    const scale = MAX_EDGE / edge
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    const resized = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    // Si le rééchantillonnage échoue (mémoire…), l'original reste préférable à rien.
    return resized ?? file
  } finally {
    URL.revokeObjectURL(url)
  }
}
