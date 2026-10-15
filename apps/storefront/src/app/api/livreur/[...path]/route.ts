import { NextRequest, NextResponse } from "next/server"

// Relais de la page /livreur vers les routes backend /courier/* (spec
// 2026-10-15 espace-livreur). Le jeton livreur reste dans un cookie httpOnly du
// site : le JavaScript de la page ne le voit jamais.
const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
const COOKIE = "_gm_courier"
const MAX_AGE = 12 * 3600

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } })

async function relay(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const route = path.join("/")

  if (route === "logout") {
    const res = json({ ok: true })
    res.cookies.delete(COOKIE)
    return res
  }

  const allowed =
    route === "login" ||
    route === "deliveries" ||
    /^deliveries\/[A-Za-z0-9_]+\/report$/.test(route)
  if (!BACKEND_URL || !allowed) {
    return json({ message: "Introuvable." }, 404)
  }

  if (
    req.method === "POST" &&
    !(req.headers.get("content-type") ?? "").startsWith("application/json")
  ) {
    return json({ message: "Requête invalide." }, 415)
  }

  const token = req.cookies.get(COOKIE)?.value
  // Connexion : adresse du client transmise au backend (limite d'essais par IP).
  const forwardedFor =
    req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip")
  let backend: Response
  try {
    backend = await fetch(`${BACKEND_URL}/courier/${route}`, {
      method: req.method,
      headers: {
        "content-type": "application/json",
        ...(token && route !== "login"
          ? { authorization: `Bearer ${token}` }
          : {}),
        ...(route === "login" && forwardedFor
          ? { "x-forwarded-for": forwardedFor }
          : {}),
      },
      body: req.method === "POST" ? await req.text() : undefined,
      cache: "no-store",
    })
  } catch {
    return json({ message: "Serveur injoignable, réessayez dans un instant." }, 502)
  }
  const data = await backend
    .json()
    .catch(() => ({ message: "Erreur du serveur." }))

  if (route === "login" && backend.ok) {
    const { token: issued, courier } = data as {
      token: string
      courier: { id: string; name: string }
    }
    const res = json({ courier })
    res.cookies.set(COOKIE, issued, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: MAX_AGE,
      path: "/",
    })
    return res
  }

  const res = json(data, backend.status)
  if (backend.status === 401) res.cookies.delete(COOKIE)
  return res
}

export const GET = relay
export const POST = relay
