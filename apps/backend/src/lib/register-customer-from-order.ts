import { requestVerificationWorkflow } from "@medusajs/core-flows"

export type RegisterCustomerFromOrderInput = {
  phone: string
  password: string
}

export type RegisterCustomerFromOrderResult =
  | { success: true; authIdentityId: string }
  | { success: false; error: string }

/**
 * Enregistre une identité phone-pass et envoie un vrai code WhatsApp pour la
 * vérifier - voir l'addendum 2 du Task 13 : une commande passée avec un
 * numéro donné ne prouve pas, à elle seule, la possession de ce numéro
 * (rien ne le vérifie au moment de la commande), donc une vérification
 * réelle reste nécessaire ici, exactement comme pour une inscription
 * normale (Tasks 2-11). `requestVerificationWorkflow` (contrairement à
 * `authModuleService.requestAuthVerification` utilisé par le reste de ce
 * fichier avant cet addendum) émet `auth.verification_requested`, qui
 * déclenche le subscriber WhatsApp du Task 4.
 */
export async function registerCustomerFromOrder(
  authModuleService: any,
  container: any,
  input: RegisterCustomerFromOrderInput
): Promise<RegisterCustomerFromOrderResult> {
  const registerResult = await authModuleService.register("phone-pass", {
    body: { email: input.phone, password: input.password },
  })

  if (!registerResult.success || !registerResult.authIdentity) {
    return { success: false, error: registerResult.error ?? "Échec de la création du compte." }
  }

  await requestVerificationWorkflow(container).run({
    input: {
      auth_identity_id: registerResult.authIdentity.id,
      entity_id: input.phone,
      entity_type: "phone",
      code_provider: "whatsapp-otp",
    },
  })

  return { success: true, authIdentityId: registerResult.authIdentity.id }
}
