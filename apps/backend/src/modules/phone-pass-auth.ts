import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { EmailPassAuthService } from "@medusajs/auth-emailpass/dist/services/emailpass"

/**
 * Sous-classe de EmailPassAuthService (même hashing scrypt, même logique
 * register/authenticate/update, zéro ligne dupliquée) avec un seul
 * changement : `identifier`.
 *
 * Nécessaire car réutiliser directement @medusajs/medusa/auth-emailpass
 * enregistré une seconde fois sous un `id` différent (l'approche initiale,
 * voir git blame sur medusa-config.ts) NE FONCTIONNE PAS : `provider` sur
 * AbstractAuthModuleProvider est un getter qui retourne
 * `this.constructor.identifier`, et `EmailPassAuthService.identifier =
 * "emailpass"` est un champ STATIQUE codé en dur dans le package tiers -
 * il ne dépend jamais de l'id d'enregistrement du container. Conséquence
 * vérifiée en direct sur staging le 2026-09-22 : `register()` et
 * `authenticate()` de la seconde registration ("phone-pass") cherchaient
 * quand même un `provider_identity` taggé "emailpass" (jamais "phone-pass"),
 * ne le trouvaient jamais, et plantaient
 * (`Cannot read properties of undefined (reading 'provider_metadata')`)
 * dans `getProviderIdentity_`/`sanitizeAuthIdentity_` - le téléphone comme
 * identifiant n'a jamais réellement fonctionné avant ce correctif, masqué
 * par des tests unitaires qui mockent entièrement le service auth et
 * n'exercent donc jamais cette logique interne réelle.
 *
 * Sous-classer avec un `identifier` distinct corrige `this.provider` pour
 * cette classe précisément, sans toucher à `EmailPassAuthService` ni
 * dupliquer sa logique.
 */
export class PhonePassAuthService extends EmailPassAuthService {
  static identifier = "phone-pass"
}

export default ModuleProvider(Modules.AUTH, {
  services: [PhonePassAuthService],
})
