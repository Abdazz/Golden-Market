"use client"

import { useSearchParams } from "next/navigation"
import { useActionState } from "react"
import { resetPassword } from "@lib/data/customer"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { Button } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const ResetPassword = () => {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [message, formAction] = useActionState(resetPassword, null)

  if (!token) {
    return (
      <div
        className="max-w-sm w-full flex flex-col items-center text-center gap-y-4"
        data-testid="reset-password-invalid"
      >
        <h1 className="text-large-semi uppercase">
          Réinitialisation de mot de passe
        </h1>
        <p className="text-base-regular text-ui-fg-base">
          Ce lien de réinitialisation est invalide ou a expiré.
        </p>
        <LocalizedClientLink href="/account">
          <Button variant="secondary">Retour à la connexion</Button>
        </LocalizedClientLink>
      </div>
    )
  }

  if (message?.state === "success") {
    return (
      <div
        className="max-w-sm w-full flex flex-col items-center text-center gap-y-4"
        data-testid="reset-password-success"
      >
        <h1 className="text-large-semi uppercase">
          Mot de passe réinitialisé
        </h1>
        <p className="text-base-regular text-ui-fg-base">
          Votre mot de passe a bien été mis à jour.
        </p>
        <LocalizedClientLink href="/account">
          <Button variant="primary">Se connecter</Button>
        </LocalizedClientLink>
      </div>
    )
  }

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="reset-password-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Nouveau mot de passe</h1>
      <form className="w-full" action={formAction}>
        <input type="hidden" name="token" value={token} />
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Nouveau mot de passe"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            data-testid="password-input"
          />
          <Input
            label="Confirmer le mot de passe"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            required
            data-testid="confirm-password-input"
          />
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="reset-password-error-message"
        />
        <SubmitButton
          data-testid="reset-password-button"
          className="w-full mt-6"
        >
          Réinitialiser mon mot de passe
        </SubmitButton>
      </form>
    </div>
  )
}

export default ResetPassword
