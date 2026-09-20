export type RegisterCustomerFromOrderInput = {
  phone: string
  password: string
}

export type RegisterCustomerFromOrderResult =
  | { success: true; authIdentityId: string }
  | { success: false; error: string }

/**
 * Enregistre une identité phone-pass et confirme immédiatement sa
 * vérification côté serveur (sans jamais générer de message WhatsApp
 * visible) - voir Task 13 pour la justification : une commande déjà reçue
 * par WhatsApp sur ce numéro est traitée comme preuve suffisante.
 */
export async function registerCustomerFromOrder(
  authModuleService: any,
  input: RegisterCustomerFromOrderInput
): Promise<RegisterCustomerFromOrderResult> {
  const registerResult = await authModuleService.register("phone-pass", {
    body: { email: input.phone, password: input.password },
  })

  if (!registerResult.success || !registerResult.authIdentity) {
    return { success: false, error: registerResult.error ?? "Échec de la création du compte." }
  }

  const verification = await authModuleService.requestAuthVerification({
    entity_id: input.phone,
    auth_identity_id: registerResult.authIdentity.id,
    entity_type: "phone",
    code_provider: "whatsapp-otp",
  })

  await authModuleService.confirmAuthVerification({
    code: verification.code,
    code_provider: "whatsapp-otp",
  })

  return { success: true, authIdentityId: registerResult.authIdentity.id }
}
