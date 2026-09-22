"use client"

import { useActionState, useState, useEffect } from "react"
import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { Heading } from "@modules/common/components/ui"
import { confirmPhoneVerification, resendPhoneVerification } from "@lib/data/customer"

type Props = {
  onVerified: () => void
}

const VerifyPhone = ({ onVerified }: Props) => {
  const [message, formAction] = useActionState(
    async (_currentState: unknown, formData: FormData) => confirmPhoneVerification(formData.get("code") as string),
    null
  )
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle")

  const handleResend = async () => {
    setResendState("sending")
    await resendPhoneVerification()
    setResendState("sent")
    setTimeout(() => setResendState("idle"), 5000)
  }

  useEffect(() => {
    if (message?.state === "success") {
      onVerified()
    }
  }, [message, onVerified])

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center rounded-2xl border border-gm-border bg-white p-6 small:p-8"
      data-testid="verify-phone-page"
    >
      <Heading level="h1" className="text-xl mb-2 text-center">
        Vérifiez votre numéro
      </Heading>
      <p className="text-center text-sm text-gm-ink-muted mb-6">
        Nous vous avons envoyé un code à 6 chiffres par WhatsApp. Entrez-le
        ci-dessous pour activer votre compte.
      </p>
      <form className="w-full flex flex-col" action={formAction}>
        <Input
          label="Code de vérification"
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          data-testid="verification-code-input"
        />
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="verify-phone-error"
        />
        <SubmitButton className="w-full mt-6" data-testid="verify-phone-button">
          Vérifier
        </SubmitButton>
      </form>
      <button
        type="button"
        onClick={handleResend}
        disabled={resendState !== "idle"}
        className="text-center text-sm text-gm-amethyst font-semibold hover:underline mt-6 disabled:opacity-50"
        data-testid="resend-code-button"
      >
        {resendState === "sent" ? "Code renvoyé" : "Renvoyer le code"}
      </button>
    </div>
  )
}

export default VerifyPhone
