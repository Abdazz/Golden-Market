// Client d'embeddings OpenAI - même pattern que meta-conversions-client.ts
// (fetch injecté, testable sans mocker le fetch global). Modèle
// text-embedding-3-small : le moins cher, largement suffisant pour des
// titres/descriptions produits courts (voir spec).
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"
const EMBEDDING_MODEL = "text-embedding-3-small"

export async function embedText(
  text: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<number[]> {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY non configuré")
  }

  const response = await fetchImpl(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI embeddings API a répondu ${response.status}`)
  }

  const body = (await response.json()) as {
    data: Array<{ embedding: number[] }>
  }

  return body.data[0].embedding
}
