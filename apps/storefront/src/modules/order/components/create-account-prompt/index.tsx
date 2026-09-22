"use client"

import { useActionState, useState } from "react"
import Input from "@modules/common/components/input"
import { Heading } from "@modules/common/components/ui"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { createAccountFromOrder } from "@lib/data/customer"
import VerifyPhone from "@modules/account/components/verify-phone"

type Props = {
  orderId: string
  phone?: string
  resumePhone?: string
}

const CreateAccountPrompt = ({ orderId, phone, resumePhone }: Props) => {
  const [message, formAction] = useActionState(createAccountFromOrder, null)
  const [verified, setVerified] = useState(false)

  if (verified) {
    return (
      <div
        className="w-full rounded-2xl border border-gm-border bg-white p-6 text-center text-sm text-gm-ink"
        data-testid="create-account-success"
      >
        Votre compte a été créé. Vous pouvez suivre vos commandes depuis
        votre espace client.
      </div>
    )
  }

  if (message?.state === "phone_verification_required" || resumePhone) {
    return <VerifyPhone onVerified={() => setVerified(true)} />
  }

  return (
    <div
      className="w-full rounded-2xl border border-gm-border bg-white p-6 small:p-8"
      data-testid="create-account-prompt"
    >
      <Heading level="h2" className="text-xl mb-2">
        Créez votre compte
      </Heading>
      <p className="text-sm text-gm-ink-muted mb-6">
        {phone
          ? `Retrouvez toutes vos commandes en créant un compte avec le numéro ${phone}. Choisissez simplement un mot de passe.`
          : "Retrouvez toutes vos commandes en créant un compte. Choisissez simplement un mot de passe."}
      </p>
      <form action={formAction} className="flex flex-col gap-y-2">
        <input type="hidden" name="order_id" value={orderId} />
        <Input
          label="Mot de passe"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          data-testid="create-account-password-input"
        />
        <Input
          label="Confirmer le mot de passe"
          name="confirm_password"
          type="password"
          required
          autoComplete="new-password"
          data-testid="create-account-confirm-password-input"
        />
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="create-account-error"
        />
        <SubmitButton className="mt-4" data-testid="create-account-button">
          Créer mon compte
        </SubmitButton>
      </form>
    </div>
  )
}

export default CreateAccountPrompt
