// Message WhatsApp d'accès à l'espace livreur, copié depuis l'onglet « Livreurs ».
// Le PIN n'est stocké que haché : il n'apparaît que s'il vient d'être défini dans cette session.
export const courierAccessMessage = (courier: { name: string; phone: string }, origin: string, pin?: string) =>
  [
    `Bonjour ${courier.name} 👋`,
    "",
    "Voici ton accès à l'espace livreur Golden Market 🚚",
    "",
    `🔗 Lien : ${origin}/livreur`,
    `📱 Numéro : ${courier.phone}`,
    pin ? `🔐 Code PIN : ${pin}` : "🔐 Code PIN : celui que nous t'avons communiqué",
    "",
    "Après chaque course, ouvre le lien et réponds : la commande est-elle livrée ? ✅ ou ❌",
    "Si c'est livré, indique le montant encaissé 💰",
    "",
    "Ne partage jamais ton code PIN 🙏",
    "Merci et bonne route ! 🙌",
  ].join("\n")
