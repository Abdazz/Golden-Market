import { Button, Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const SignInPrompt = () => {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-gm-border bg-white p-5">
      <div>
        <Heading level="h2" className="text-lg">
          Déjà client ?
        </Heading>
        <Text className="text-sm text-gm-ink-muted mt-1">
          Connectez-vous pour une expérience plus rapide.
        </Text>
      </div>
      <LocalizedClientLink href="/account">
        <Button variant="secondary" data-testid="sign-in-button">
          Se connecter
        </Button>
      </LocalizedClientLink>
    </div>
  )
}

export default SignInPrompt
