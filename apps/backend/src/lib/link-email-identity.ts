import { setAuthAppMetadataWorkflow } from "@medusajs/core-flows"
import type { MedusaContainer } from "@medusajs/framework/types"

export type LinkEmailIdentityInput = {
  email: string
  password: string
  customerId: string
}

export type LinkEmailIdentityResult = { success: true } | { success: false; error: string }

/**
 * Enregistre une seconde identité emailpass (en plus de celle du téléphone,
 * déjà liée au client via le flux d'inscription normal) et la lie au même
 * customer_id, pour permettre la connexion par email ou par téléphone - voir
 * docs/superpowers/specs/2026-09-19-telephone-identifiant-principal-design.md,
 * section "Décision : deux identités liées au même client".
 */
export async function linkEmailIdentity(
  authModuleService: any,
  container: MedusaContainer,
  input: LinkEmailIdentityInput
): Promise<LinkEmailIdentityResult> {
  const existingIdentities = await authModuleService.listAuthIdentities({
    entity_id: input.email,
    provider: "emailpass",
  })

  const existingCustomerId = existingIdentities[0]?.app_metadata?.customer_id

  if (existingCustomerId && existingCustomerId !== input.customerId) {
    return { success: false, error: "Cet email est déjà associé à un autre compte." }
  }

  if (existingCustomerId === input.customerId) {
    return { success: true }
  }

  const registerResult = await authModuleService.register("emailpass", {
    body: { email: input.email, password: input.password },
  })

  if (!registerResult.success || !registerResult.authIdentity) {
    return { success: false, error: registerResult.error ?? "Échec de la création de l'identité email." }
  }

  await setAuthAppMetadataWorkflow(container).run({
    input: {
      authIdentityId: registerResult.authIdentity.id,
      actorType: "customer",
      value: input.customerId,
    },
  })

  return { success: true }
}
