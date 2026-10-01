// Prospect suivi pour un numéro de conversation WhatsApp (bouton « Suivre
// comme prospect » du chat) : comparaison sur les 8 derniers chiffres, car
// le chat stocke "22670000000" et les prospects "+22670000000".

type ProspectLike = {
  id: string
  phone: string
  status: string
  follow_up_on: string | null
  product: string | null
}

const last8 = (phone: string) => phone.replace(/\D/g, "").slice(-8)

// Liste attendue triée du plus récent au plus ancien (GET /admin/prospects).
export const activeProspectFor = <T extends ProspectLike>(prospects: T[], phone: string): T | null =>
  prospects.find(
    (p) => (p.status === "to_follow_up" || p.status === "waiting_stock") && last8(p.phone) === last8(phone)
  ) ?? null

export const prospectBadge = (p: ProspectLike): string => {
  if (p.status === "waiting_stock") return p.product ? `Prospect · attend : ${p.product}` : "Prospect · attend un produit"
  return p.follow_up_on
    ? `Prospect · à relancer le ${p.follow_up_on.slice(8, 10)}/${p.follow_up_on.slice(5, 7)}`
    : "Prospect · à relancer"
}
