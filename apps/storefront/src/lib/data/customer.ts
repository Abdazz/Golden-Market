"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { normalizePhone } from "@lib/util/normalize-phone"
import { HttpTypes } from "@medusajs/types"
import { FetchError } from "@medusajs/js-sdk"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  getOrderRegistrationProof,
  getPendingCustomer,
  removeAuthToken,
  removeCartId,
  removeOrderRegistrationProof,
  removePendingCustomer,
  setAuthToken,
  setPendingCustomer,
} from "./cookies"

const PHONE_AUTH_PROVIDER = "phone-pass"
const EMAIL_AUTH_PROVIDER = "emailpass"

export type CustomerAuthState =
  | { state: "error"; error: string }
  | { state: "verification_required"; email: string }
  | { state: "phone_verification_required"; phone: string }
  | { state: "success" }
  | null

// Requests a verification email for the given customer. The request must be
// authenticated with a token tied to the auth identity (the token returned by
// register or by a login that requires verification).
async function requestVerificationEmail(email: string, token: string) {
  await sdk.auth.verification.request(
    {
      entity_id: email,
      entity_type: "email",
    },
    {
      authorization: `Bearer ${token}`,
    }
  )
}

async function requestPhoneVerification(phone: string, token: string) {
  await sdk.auth.verification.request(
    { entity_id: phone, entity_type: "phone", code_provider: "whatsapp-otp" },
    { authorization: `Bearer ${token}` }
  )
}

// Le customer n'a pas encore de session à ce stade (compte non vérifié) -
// on récupère un jeton provisoire (non lié à un customer) en se
// reconnectant avec les identifiants déjà saisis, réutilisé par
// resendPhoneVerification ET confirmPhoneVerification.
async function getProvisionalPhoneToken(phone: string, password: string): Promise<string | null> {
  try {
    const loginResult = await sdk.auth.login("customer", PHONE_AUTH_PROVIDER, {
      email: phone,
      password,
    })

    if (typeof loginResult === "string") {
      return loginResult
    }

    // Tant que le téléphone n'est pas vérifié, sdk.auth.login ne renvoie
    // jamais une simple chaîne mais { verification_required: true, token }
    // (voir authVerificationsPerActor, Task 3) - c'est le cas normal ici,
    // pas un échec : c'est précisément ce jeton non vérifié qu'il faut
    // renvoyer pour pouvoir demander/confirmer le code.
    if (loginResult && typeof loginResult === "object" && "token" in loginResult) {
      return loginResult.token
    }

    return null
  } catch {
    return null
  }
}

// Exposé pour le bouton "Renvoyer le code" du nouvel écran de vérification
// (Task 11) - le customer n'existe pas encore à ce stade, donc pas de
// session à réutiliser : on ré-enregistre (idempotent, voir emailpass côté
// backend) pour récupérer un token non vérifié, puis on redemande le code.
export async function resendPhoneVerification(phone: string): Promise<{ success: boolean }> {
  const pending = await getPendingCustomer()

  if (!pending) {
    return { success: false }
  }

  const token = await getProvisionalPhoneToken(phone, pending.password ?? "")

  if (!token) {
    return { success: false }
  }

  try {
    await requestPhoneVerification(phone, token)
    return { success: true }
  } catch {
    return { success: false }
  }
}

export async function confirmPhoneVerification(code: string): Promise<CustomerAuthState> {
  const pending = await getPendingCustomer()

  if (!pending?.phone) {
    return { state: "error", error: "Session d'inscription expirée, recommencez." }
  }

  const token = await getProvisionalPhoneToken(pending.phone, pending.password ?? "")

  if (!token) {
    return { state: "error", error: "Session d'inscription expirée, recommencez." }
  }

  try {
    await sdk.auth.verification.confirm(
      { code, code_provider: "whatsapp-otp" },
      { authorization: `Bearer ${token}` }
    )
  } catch (error) {
    return { state: "error", error: String(error) }
  }

  const loginResult = await completeLogin(pending.phone, pending.password ?? "")

  if (loginResult?.state === "success" && pending.orderIdToClaim) {
    try {
      await sdk.client.fetch("/store/customers/me/claim-order", {
        method: "POST",
        headers: { ...(await getAuthHeaders()) },
        body: { order_id: pending.orderIdToClaim },
      })
    } catch {
      // Le compte est créé et utilisable même si le rattachement de cette
      // commande précise échoue - ne jamais faire échouer toute l'opération
      // pour ça.
    }
  }

  return loginResult
}

type RegisterFromOrderResponse = {
  phone: string
  email: string | null
  first_name?: string
  last_name?: string
}

// register-from-order (Task 13, Addendum 2) crée l'identité et envoie un
// vrai code WhatsApp - elle ne connecte plus le client elle-même. On dépose
// tout ce dont confirmPhoneVerification aura besoin (y compris le mot de
// passe et la commande à rattacher) dans le cookie pending, exactement
// comme signup() le fait déjà, puis on retourne le même état
// "phone_verification_required" que l'inscription normale : la page de
// confirmation de commande peut donc réutiliser VerifyPhone tel quel.
export async function createAccountFromOrder(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const orderId = formData.get("order_id") as string
  const password = formData.get("password") as string
  const confirmPassword = formData.get("confirm_password") as string

  if (password !== confirmPassword) {
    return { state: "error", error: "Les mots de passe ne correspondent pas." }
  }

  if (password.length < 8) {
    return { state: "error", error: "Le mot de passe doit contenir au moins 8 caractères." }
  }

  const proof = await getOrderRegistrationProof()
  const registrationToken = proof?.orderId === orderId ? proof.token : ""

  let registration: RegisterFromOrderResponse

  try {
    registration = await sdk.client.fetch<RegisterFromOrderResponse>(
      "/store/register-from-order",
      {
        method: "POST",
        body: { order_id: orderId, password, registration_token: registrationToken },
      }
    )
  } catch (error) {
    return { state: "error", error: String(error) }
  }

  // Le jeton est à usage unique côté backend (marqué consommé après cet
  // appel réussi) - on nettoie le cookie ici pour éviter toute tentative de
  // réutilisation, même si elle échouerait déjà côté serveur.
  await removeOrderRegistrationProof()

  await setPendingCustomer({
    first_name: registration.first_name,
    last_name: registration.last_name,
    phone: registration.phone,
    password,
    orderIdToClaim: orderId,
  })

  return { state: "phone_verification_required", phone: registration.phone }
}

export const retrieveCustomer =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    const authHeaders = await getAuthHeaders()

    if (!authHeaders) return null

    const headers = {
      ...authHeaders,
    }

    const next = {
      ...(await getCacheOptions("customers")),
    }

    return await sdk.client
      .fetch<{ customer: HttpTypes.StoreCustomer }>(`/store/customers/me`, {
        method: "GET",
        query: {
          fields: "*orders",
        },
        headers,
        next,
        cache: "force-cache",
      })
      .then(({ customer }) => customer)
      .catch(() => null)
  }

export const updateCustomer = async (body: HttpTypes.StoreUpdateCustomer) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const updateRes = await sdk.store.customer
    .update(body, {}, headers)
    .then(({ customer }) => customer)
    .catch(medusaError)

  const cacheTag = await getCacheTag("customers")
  revalidateTag(cacheTag)

  return updateRes
}

export async function signup(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const password = formData.get("password") as string
  const rawPhone = formData.get("phone") as string

  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch {
    return { state: "error", error: "Numéro de téléphone invalide." }
  }

  const customerForm = {
    email: (formData.get("email") as string)?.trim() || undefined,
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    phone,
    // Le mot de passe est nécessaire à resendPhoneVerification (ré-inscription
    // idempotente) et confirmPhoneVerification (relance login()) - jamais
    // affiché, jamais envoyé ailleurs qu'aux appels sdk.auth.* déjà existants.
    password,
  }

  try {
    // "phone-pass" (pas "emailpass") : voir Task 3 pour pourquoi le
    // téléphone utilise un id de provider séparé (même package, requis pour
    // que la vérification WhatsApp cible uniquement le téléphone).
    await sdk.auth.register("customer", PHONE_AUTH_PROVIDER, {
      email: phone,
      password,
    })
  } catch (error) {
    const fetchError = error as FetchError
    // Une identité "phone-pass" existante et non finalisée pour ce numéro est
    // attendue et gérée : par exemple un client qui recommence l'inscription
    // après avoir quitté avant de terminer la vérification WhatsApp.
    if (
      fetchError.statusText !== "Unauthorized" ||
      fetchError.message !== "Identity with email already exists"
    ) {
      return { state: "error", error: String(error) }
    }
  }

  await setPendingCustomer(customerForm)

  return completeLogin(phone, password)
}

export async function login(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const rawIdentifier = formData.get("identifier") as string
  const password = formData.get("password") as string

  // Une chaîne qui, une fois débarrassée des séparateurs habituels, ne
  // contient que des chiffres est traitée comme un téléphone (et normalisée
  // en conséquence) ; sinon elle est envoyée telle quelle (email).
  const looksLikePhone = /^[\d\s()+-]+$/.test(rawIdentifier.trim())
  let identifier = rawIdentifier

  if (looksLikePhone) {
    try {
      identifier = normalizePhone(rawIdentifier)
    } catch {
      return { state: "error", error: "Identifiant invalide." }
    }
  }

  return completeLogin(identifier, password)
}

// Logs the customer in and reconciles the customer record. The behavior is
// driven entirely by the backend's login response, so it works whether or not
// email verification is enabled.
async function completeLogin(
  email: string,
  password: string
): Promise<CustomerAuthState> {
  // "email" ici est en réalité soit un vrai email, soit un numéro de
  // téléphone normalisé (toujours préfixé "+") - voir Task 3 pour pourquoi
  // ça détermine un provider d'authentification différent ("phone-pass" vs
  // "emailpass"), pas juste une différence cosmétique de nom de champ.
  const provider = email.startsWith("+") ? PHONE_AUTH_PROVIDER : EMAIL_AUTH_PROVIDER

  let result: Awaited<ReturnType<typeof sdk.auth.login>>

  try {
    result = await sdk.auth.login("customer", provider, { email, password })
  } catch (error) {
    return { state: "error", error: String(error) }
  }

  // A `location` is returned by third-party auth providers, which this flow
  // doesn't support.
  if (typeof result === "object" && "location" in result) {
    return {
      state: "error",
      error: "This login method isn't supported by the storefront.",
    }
  }

  // The backend requires email verification and the customer hasn't verified
  // yet. Send the verification email and ask them to check their inbox.
  if (
    typeof result === "object" &&
    "verification_required" in result &&
    result.verification_required
  ) {
    const isPhone = provider === PHONE_AUTH_PROVIDER

    try {
      if (isPhone) {
        await requestPhoneVerification(email, result.token)
      } else {
        await requestVerificationEmail(email, result.token)
      }
    } catch {
      // Ignore: the customer can resend from the verification page.
    }

    return isPhone
      ? { state: "phone_verification_required", phone: email }
      : { state: "verification_required", email }
  }

  if (typeof result !== "string") {
    return {
      state: "error",
      error: "Authentication requires additional steps that aren't supported.",
    }
  }

  let token = result

  // The token may not be tied to a customer record yet — right after
  // registration, or after verifying a brand-new account. Ask the backend:
  // `/store/customers/me` rejects tokens without a registered actor, so a
  // failed retrieve means we still need to create the customer, then log in
  // again to obtain a customer-bound token.
  const customerExists = await sdk.store.customer
    .retrieve({}, { authorization: `Bearer ${token}` })
    .then(() => true)
    .catch(() => false)

  if (!customerExists) {
    const pending = await getPendingCustomer()
    const isPhoneLogin = provider === PHONE_AUTH_PROVIDER

    try {
      const createdCustomer = await sdk.store.customer.create(
        {
          // Un login par téléphone ne doit jamais écrire le numéro dans le
          // champ email du client - seul un email fourni par le client
          // (pending.email) va dans customer.email.
          email: isPhoneLogin ? (pending?.email || undefined) : email,
          first_name: pending?.first_name,
          last_name: pending?.last_name,
          phone: isPhoneLogin ? email : pending?.phone,
        },
        {},
        { authorization: `Bearer ${token}` }
      )

      token = (await sdk.auth.login("customer", provider, {
        email,
        password,
      })) as string
    } catch (error) {
      return { state: "error", error: String(error) }
    }

    // Client inscrit par téléphone ET ayant renseigné un email : lie une
    // seconde identité emailpass au même client pour permettre la
    // connexion par les deux (voir spec, "Décision : deux identités liées").
    // Échec isolé et avalé : le compte téléphone reste créé et utilisable
    // même si cette liaison échoue (ex: email déjà associé à un autre
    // compte) - voir spec, section "Erreurs et cas limites".
    if (isPhoneLogin && pending?.email) {
      try {
        await sdk.client.fetch("/store/customers/me/link-email-identity", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: { email: pending.email, password },
        })
      } catch {
        // Voir commentaire ci-dessus.
      }
    }

    await removePendingCustomer()
  }

  await setAuthToken(token)

  const customerCacheTag = await getCacheTag("customers")
  revalidateTag(customerCacheTag)

  try {
    await transferCart()
  } catch (error) {
    return { state: "error", error: String(error) }
  }

  return { state: "success" }
}

// Confirms a customer's email using the token from the verification link.
//
// The confirm route doesn't require authentication, so this works even when the
// customer opens the link on a different device than the one they signed up on.
export async function confirmEmailVerification(
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await sdk.auth.verification.confirm({ code: token })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function signout(countryCode: string) {
  await sdk.auth.logout()

  await removeAuthToken()

  const customerCacheTag = await getCacheTag("customers")
  revalidateTag(customerCacheTag)

  await removeCartId()

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)

  redirect(`/${countryCode}/account`)
}

export async function transferCart() {
  const cartId = await getCartId()

  if (!cartId) {
    return
  }

  const headers = await getAuthHeaders()

  await sdk.store.cart.transferCart(cartId, {}, headers)

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)
}

export const addCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> => {
  const isDefaultBilling = (currentState.isDefaultBilling as boolean) || false
  const isDefaultShipping = (currentState.isDefaultShipping as boolean) || false

  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: formData.get("country_code") as string,
    phone: formData.get("phone") as string,
    is_default_billing: isDefaultBilling,
    is_default_shipping: isDefaultShipping,
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.customer
    .createAddress(address, {}, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag)
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const deleteCustomerAddress = async (
  addressId: string
): Promise<void> => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.customer
    .deleteAddress(addressId, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag)
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const updateCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> => {
  const addressId =
    (currentState.addressId as string) || (formData.get("addressId") as string)

  if (!addressId) {
    return { success: false, error: "Address ID is required" }
  }

  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: formData.get("country_code") as string,
  } as HttpTypes.StoreUpdateCustomerAddress

  const phone = formData.get("phone") as string

  if (phone) {
    address.phone = phone
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.customer
    .updateAddress(addressId, address, {}, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag)
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export type RequestPasswordResetState =
  | { state: "success" }
  | { state: "error"; error: string }
  | null

export async function requestPasswordReset(
  _currentState: unknown,
  formData: FormData
): Promise<RequestPasswordResetState> {
  const email = formData.get("email") as string

  try {
    await sdk.auth.resetPassword("customer", "emailpass", {
      identifier: email,
    })
  } catch (error) {
    return { state: "error", error: String(error) }
  }

  return { state: "success" }
}

export type ResetPasswordState =
  | { state: "success" }
  | { state: "error"; error: string }
  | null

export async function resetPassword(
  _currentState: unknown,
  formData: FormData
): Promise<ResetPasswordState> {
  const token = formData.get("token") as string
  const password = formData.get("password") as string
  const confirmPassword = formData.get("confirm_password") as string

  if (password !== confirmPassword) {
    return { state: "error", error: "Les mots de passe ne correspondent pas." }
  }

  try {
    await sdk.auth.updateProvider("customer", "emailpass", { password }, token)
  } catch (error) {
    return { state: "error", error: String(error) }
  }

  return { state: "success" }
}
