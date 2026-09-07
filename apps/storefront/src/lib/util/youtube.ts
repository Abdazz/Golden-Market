// Extrait l'id de vidéo YouTube d'une URL saisie librement par le
// propriétaire (metadata.video_url du produit) - formats acceptés :
// watch?v=, youtu.be/, shorts/, embed/. Renvoie null si l'URL ne correspond
// à aucun de ces formats, pour un échec silencieux côté galerie plutôt
// qu'un crash.
export const getYoutubeVideoId = (url: string): string | null => {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const host = parsed.hostname.replace(/^www\./, "")

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1)
    return id || null
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (parsed.pathname === "/watch") {
      return parsed.searchParams.get("v")
    }

    const match = parsed.pathname.match(/^\/(shorts|embed)\/([^/]+)/)
    if (match) {
      return match[2]
    }
  }

  return null
}
