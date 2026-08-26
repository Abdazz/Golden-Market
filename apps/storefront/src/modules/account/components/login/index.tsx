import { login } from "@lib/data/customer"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { Heading } from "@modules/common/components/ui"
import { useActionState } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Login = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(login, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center rounded-2xl border border-gm-border bg-white p-6 small:p-8"
      data-testid="login-page"
    >
      <Heading level="h1" className="text-xl mb-2">
        Content de vous revoir
      </Heading>
      <p className="text-center text-sm text-gm-ink-muted mb-6">
        Connectez-vous pour profiter d&apos;une meilleure expérience d&apos;achat.
      </p>
      {message?.state === "verification_required" && (
        <div
          className="w-full mb-6 text-center text-sm text-gm-ink bg-gm-ivoire-2 border border-gm-border rounded-lg p-4"
          data-testid="login-verification-message"
        >
          Nous avons envoyé un lien de vérification à{" "}
          <strong>{message.email}</strong>. Vérifiez votre email, puis
          connectez-vous.
        </div>
      )}
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
          <Input
            label="Mot de passe"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
        </div>
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={() => setCurrentView(LOGIN_VIEW.FORGOT_PASSWORD)}
            className="text-sm text-gm-amethyst hover:underline"
            data-testid="forgot-password-button"
          >
            Mot de passe oublié ?
          </button>
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="login-error-message"
        />
        <SubmitButton data-testid="sign-in-button" className="w-full mt-6">
          Se connecter
        </SubmitButton>
      </form>
      <span className="text-center text-sm text-gm-ink-muted mt-6">
        Pas encore membre ?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="text-gm-amethyst font-semibold hover:underline"
          data-testid="register-button"
        >
          Rejoignez-nous
        </button>
        .
      </span>
    </div>
  )
}

export default Login
