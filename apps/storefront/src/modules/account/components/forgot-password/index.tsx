"use client"

import { requestPasswordReset } from "@lib/data/customer"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { useActionState } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const ForgotPassword = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(requestPasswordReset, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center rounded-2xl border border-gm-border bg-white p-6 small:p-8"
      data-testid="forgot-password-page"
    >
      <h1 className="font-display font-bold text-xl text-gm-ink mb-2">Mot de passe oublié</h1>
      <p className="text-center text-sm text-gm-ink-muted mb-6">
        Indiquez votre email, nous vous enverrons un lien pour réinitialiser
        votre mot de passe.
      </p>

      {message?.state === "success" ? (
        <div
          className="w-full mb-6 text-center text-sm text-gm-ink bg-gm-ivoire-2 border border-gm-border rounded-lg p-4"
          data-testid="forgot-password-success-message"
        >
          Si un compte existe pour cet email, un lien de réinitialisation
          vient de vous être envoyé. Vérifiez votre boîte de réception.
        </div>
      ) : (
        <form className="w-full" action={formAction}>
          <div className="flex flex-col w-full gap-y-2">
            <Input
              label="Email"
              name="email"
              type="email"
              title="Entrez une adresse email valide."
              autoComplete="email"
              required
              data-testid="email-input"
            />
          </div>
          <ErrorMessage
            error={message?.state === "error" ? message.error : null}
            data-testid="forgot-password-error-message"
          />
          <SubmitButton
            data-testid="send-reset-link-button"
            className="w-full mt-6"
          >
            Envoyer le lien de réinitialisation
          </SubmitButton>
        </form>
      )}

      <span className="text-center text-sm text-gm-ink-muted mt-6">
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="text-gm-amethyst font-semibold hover:underline"
          data-testid="back-to-sign-in-button"
        >
          Retour à la connexion
        </button>
      </span>
    </div>
  )
}

export default ForgotPassword
