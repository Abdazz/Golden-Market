"use client"

import { useActionState } from "react"
import Input from "@modules/common/components/input"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { Heading } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { signup } from "@lib/data/customer"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Register = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(signup, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center rounded-2xl border border-gm-border bg-white p-6 small:p-8"
      data-testid="register-page"
    >
      <Heading level="h1" className="text-xl mb-2 text-center">
        Créer un compte Golden Market
      </Heading>
      <p className="text-center text-sm text-gm-ink-muted mb-6">
        Créez votre profil pour profiter d&apos;une meilleure expérience
        d&apos;achat.
      </p>
      {message?.state === "verification_required" && (
        <div
          className="w-full mb-6 text-center text-sm text-gm-ink bg-gm-ivoire-2 border border-gm-border rounded-lg p-4"
          data-testid="register-verification-message"
        >
          Nous avons envoyé un lien de vérification à{" "}
          <strong>{message.email}</strong>. Vérifiez votre boîte de
          réception, puis connectez-vous.
        </div>
      )}
      <form className="w-full flex flex-col" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Prénom"
            name="first_name"
            required
            autoComplete="given-name"
            data-testid="first-name-input"
          />
          <Input
            label="Nom"
            name="last_name"
            required
            autoComplete="family-name"
            data-testid="last-name-input"
          />
          <Input
            label="Email"
            name="email"
            required
            type="email"
            autoComplete="email"
            data-testid="email-input"
          />
          <Input
            label="Téléphone"
            name="phone"
            type="tel"
            autoComplete="tel"
            data-testid="phone-input"
          />
          <Input
            label="Mot de passe"
            name="password"
            required
            type="password"
            autoComplete="new-password"
            data-testid="password-input"
          />
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="register-error"
        />
        <span className="text-center text-sm text-gm-ink-muted mt-6">
          En créant un compte, vous acceptez la{" "}
          <LocalizedClientLink
            href="/content/privacy-policy"
            className="text-gm-amethyst hover:underline"
          >
            politique de confidentialité
          </LocalizedClientLink>{" "}
          et les{" "}
          <LocalizedClientLink
            href="/content/terms-of-use"
            className="text-gm-amethyst hover:underline"
          >
            conditions d&apos;utilisation
          </LocalizedClientLink>{" "}
          de Golden Market.
        </span>
        <SubmitButton className="w-full mt-6" data-testid="register-button">
          Créer mon compte
        </SubmitButton>
      </form>
      <span className="text-center text-sm text-gm-ink-muted mt-6">
        Déjà membre ?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="text-gm-amethyst font-semibold hover:underline"
        >
          Se connecter
        </button>
        .
      </span>
    </div>
  )
}

export default Register
