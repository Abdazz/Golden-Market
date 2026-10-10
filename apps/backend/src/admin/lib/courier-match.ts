// Livreur correspondant à un numéro de conversation WhatsApp : comparaison
// sur les 8 derniers chiffres, car le chat stocke "22670000000" et les
// livreurs sont saisis librement ("+226 70 00 00 00", "70000000").

type CourierLike = {
  name: string
  phone: string
  active: boolean
}

const last8 = (phone: string) => phone.replace(/\D/g, "").slice(-8)

export const courierFor = <T extends CourierLike>(couriers: T[], phone: string): T | null => {
  const digits = last8(phone)
  if (!digits) return null
  return couriers.find((c) => c.active && last8(c.phone) === digits) ?? null
}

export const courierBadge = (c: CourierLike): string => `Livreur · ${c.name}`
