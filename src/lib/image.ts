/**
 * Préparation d'un fond d'écran de tableau : on vérifie que c'est bien une
 * image lisible, et on réduit les photos géantes avant de les stocker —
 * Storage avale sans broncher un original de 15 Mo, mais le garder ne sert
 * qu'à ralentir le chargement et à consommer le quota.
 */

const MAX_BYTES = 20 * 1024 * 1024
/** Au-delà de ce côté en pixels, l'image est rééchantillonnée. */
const MAX_EDGE = 2560

/**
 * Côté maximal d'une image collée dans une page, et sa qualité. Plus serré
 * qu'un fond d'écran : celle-ci voyage DANS le texte, encodée en base64.
 */
const MAX_INLINE_EDGE = 1400
const INLINE_QUALITY = 0.82

/**
 * Une image collée dans une page : réduite, puis rendue en `data:` base64.
 *
 * Pourquoi pas Storage ? Le bucket est privé et ses URL signées expirent au
 * bout de quelques heures : une capture collée aujourd'hui afficherait un
 * cadre vide demain. Le base64, lui, voyage avec la page et ne meurt jamais —
 * au prix d'un redimensionnement sérieux, qui ramène une capture d'écran de
 * plusieurs méga-octets à quelques centaines de kilo-octets.
 */
export async function prepareInlineImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error("Ce fichier n'est pas une image.")
  if (file.size > MAX_BYTES) {
    throw new Error(
      `Cette image pèse ${(file.size / 1024 / 1024).toFixed(0)} Mo — la limite est de ${MAX_BYTES / 1024 / 1024} Mo.`,
    )
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Image illisible — format non pris en charge.'))
      el.src = url
    })

    const edge = Math.max(image.naturalWidth, image.naturalHeight)
    const scale = edge > MAX_INLINE_EDGE ? MAX_INLINE_EDGE / edge : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    // JPEG plutôt que PNG : une capture d'écran y perd dix fois son poids.
    return canvas.toDataURL('image/jpeg', INLINE_QUALITY)
  } finally {
    URL.revokeObjectURL(url)
  }
}

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
