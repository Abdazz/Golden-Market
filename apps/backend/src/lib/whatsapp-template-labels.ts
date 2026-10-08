// Messages automatiques (modèles Meta envoyés par le webhook n8n générique)
// enregistrés dans la conversation : libellé affiché dans l'admin à la place
// de « IA » (colonne messages.template_name).
const LABELS: Record<string, string> = {
  order_confirmation_from_website: "Confirmation de commande",
  order_confirmation_from_whatsapp: "Confirmation de commande",
  retour_en_stock: "Retour en stock",
  livraison_livreur: "Livraison",
  livraison_livreur_ouaga: "Livraison",
  livraison_livreur_expedition: "Livraison",
}

export const automaticMessageLabel = (templateName: string | null): string | null =>
  templateName ? `Message automatique · ${LABELS[templateName] ?? templateName}` : null
