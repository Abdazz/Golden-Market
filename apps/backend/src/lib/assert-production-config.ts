const INSECURE_DEFAULT = "supersecret"
const MIN_SECRET_LENGTH = 32

export function assertProductionConfig(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") {
    return
  }

  assertStrongSecret("JWT_SECRET", env.JWT_SECRET)
  assertStrongSecret("COOKIE_SECRET", env.COOKIE_SECRET)
  assertNoLocalhost("STORE_CORS", env.STORE_CORS)
  assertNoLocalhost("ADMIN_CORS", env.ADMIN_CORS)
  assertNoLocalhost("AUTH_CORS", env.AUTH_CORS)
}

function assertStrongSecret(name: string, value: string | undefined): void {
  if (!value || value === INSECURE_DEFAULT || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} n'est pas configuré pour la production : définissez une valeur aléatoire d'au moins ${MIN_SECRET_LENGTH} caractères, différente de la valeur de développement "${INSECURE_DEFAULT}".`
    )
  }
}

function assertNoLocalhost(name: string, value: string | undefined): void {
  if (value && value.toLowerCase().includes("localhost")) {
    throw new Error(
      `${name} contient "localhost" : retirez les origines de développement de la configuration de production.`
    )
  }
}
