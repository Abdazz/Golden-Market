export type EmailTemplate = (data: Record<string, unknown>) => {
  subject: string
  html: string
}

function formatAmount(amount: unknown, currencyCode: string) {
  const numericAmount =
    typeof amount === "string" ? parseFloat(amount) : Number(amount)

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(numericAmount)
}

const orderPlaced: EmailTemplate = (data) => {
  const displayId = data.display_id as number | string
  const total = formatAmount(data.total, data.currency_code as string)

  return {
    subject: `Golden Market — Confirmation de votre commande #${displayId}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1 style="font-size: 20px;">Merci pour votre commande !</h1>
        <p>Votre commande <strong>#${displayId}</strong> d'un montant de <strong>${total}</strong> a bien été enregistrée.</p>
        <p>Elle est en attente de confirmation du paiement Orange Money. Golden Market vous contactera dès réception du paiement.</p>
      </div>
    `,
  }
}

const passwordReset: EmailTemplate = (data) => {
  const resetUrl = data.reset_url as string

  return {
    subject: "Golden Market — Réinitialisation de votre mot de passe",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1 style="font-size: 20px;">Réinitialisation de mot de passe</h1>
        <p>Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe. Ce lien expire rapidement pour votre sécurité.</p>
        <p><a href="${resetUrl}">Réinitialiser mon mot de passe</a></p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      </div>
    `,
  }
}

export const emailTemplates: Record<string, EmailTemplate> = {
  "order-placed": orderPlaced,
  "password-reset": passwordReset,
}
