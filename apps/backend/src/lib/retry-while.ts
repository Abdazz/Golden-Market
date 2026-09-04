/**
 * Réessaie fn() tant que shouldRetry(résultat) est vrai, avec un court délai
 * entre chaque tentative. Utilisé pour les champs calculés Medusa (ex:
 * order.total) qui peuvent ne pas être encore matérialisés au moment exact
 * où l'événement order.placed se déclenche - confirmé en conditions réelles
 * (2026-09-04) : un total à 0 juste après la commande, correct quelques
 * secondes plus tard sans aucun changement de code.
 */
export async function retryWhile<T>(
  fn: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
  { attempts = 3, delayMs = 800 }: { attempts?: number; delayMs?: number } = {}
): Promise<T> {
  let result = await fn()
  for (let i = 1; i < attempts && shouldRetry(result); i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    result = await fn()
  }
  return result
}
