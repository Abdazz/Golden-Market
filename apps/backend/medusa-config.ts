import { loadEnv, defineConfig } from '@medusajs/framework/utils'
import { assertProductionConfig } from './src/lib/assert-production-config'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

assertProductionConfig(process.env)

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      // `port` a été retiré : cette propriété n'existe plus dans le type
      // ProjectConfigOptions.http de @medusajs/framework 2.18.0 (échec de
      // `medusa build`, TS2769) - `medusa start` lit déjà process.env.PORT
      // directement, sans passer par ce fichier de config.
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
      // Sans ceci, Medusa ne bloque jamais le login même si un provider de
      // vérification (whatsapp-otp) existe : la vérification n'est
      // appliquée que pour les combinaisons actor_type/auth_provider
      // listées ici (voir @medusajs/medusa/dist/api/auth/utils/validate-verification.js).
      // Ne cible QUE "phone-pass" : l'email ("emailpass") garde son
      // comportement actuel (jamais bloqué), pour ne pas casser la
      // connexion du compte existant en production.
      authVerificationsPerActor: {
        customer: [{ entity_type: 'phone', auth_provider: 'phone-pass' }],
      },
    }
  },
  modules: {
    // Le module auth n'a jamais été configuré explicitement avant ce jour
    // (Medusa enregistre "emailpass" par défaut tout seul). Le réenregistrer
    // ici EST OBLIGATOIRE dès qu'on ajoute quoi que ce soit sous modules.auth :
    // Medusa fusionne les modules par simple remplacement (dernier gagne, pas
    // de fusion profonde - voir @medusajs/utils/common/define-config.js), donc
    // omettre "emailpass" ici désactiverait silencieusement toute connexion
    // email/mot de passe existante (clients ET admin).
    //
    // "phone-pass" est le MÊME package (@medusajs/medusa/auth-emailpass),
    // enregistré une seconde fois sous un id de routage différent - pas un
    // provider distinct. Nécessaire car authVerificationsPerActor
    // (voir projectConfig.http ci-dessus) ne peut cibler que par nom de
    // provider, jamais par entity_type : sans ce second id, il serait
    // impossible d'exiger la vérification pour le téléphone sans l'exiger
    // aussi pour l'email existant. Voir
    // docs/superpowers/plans/2026-09-19-telephone-identifiant-principal.md
    // Task 3 pour le détail de cette investigation.
    auth: {
      resolve: '@medusajs/medusa/auth',
      options: {
        providers: [
          { resolve: '@medusajs/medusa/auth-emailpass', id: 'emailpass' },
          { resolve: '@medusajs/medusa/auth-emailpass', id: 'phone-pass' },
        ],
        verification: {
          providers: [
            { resolve: './src/modules/whatsapp-otp-verification', id: 'whatsapp-otp' },
          ],
        },
      },
    },
    // Cache et event bus sur Redis (requis en prod ; le défaut in-memory
    // ne survit pas aux redémarrages et casse les subscribers/workflows)
    cache: {
      resolve: '@medusajs/medusa/cache-redis',
      options: {
        redisUrl: process.env.REDIS_URL,
      },
    },
    eventBus: {
      resolve: '@medusajs/medusa/event-bus-redis',
      options: {
        redisUrl: process.env.REDIS_URL,
      },
    },
    // file-local par défaut construit ses URLs sur "http://localhost:9000/static"
    // en dur (voir @medusajs/file-local) - inatteignable dès que le backend est
    // servi derrière Apache sur un domaine public. MEDUSA_BACKEND_PUBLIC_URL
    // (même valeur que NEXT_PUBLIC_MEDUSA_BACKEND_URL en prod, voir
    // docker-compose.prod.yml) corrige l'origine des URLs générées ; le volume
    // qui persiste `static/` entre redéploiements est déclaré dans
    // docker-compose.prod.yml, servi publiquement via Apache (voir deploy/apache/*.conf).
    file: {
      resolve: '@medusajs/medusa/file',
      options: {
        providers: [
          {
            resolve: '@medusajs/medusa/file-local',
            id: 'local',
            options: {
              backend_url: `${process.env.MEDUSA_BACKEND_PUBLIC_URL || 'http://localhost:9000'}/static`,
            },
          },
        ],
      },
    },
    payment: {
      resolve: '@medusajs/medusa/payment',
      options: {
        providers: [
          {
            resolve: './src/modules/orange-money-manual',
            id: 'orange-money-manual',
            options: {
              phone_number: process.env.ORANGE_MONEY_NUMBER,
              account_name: process.env.ORANGE_MONEY_NAME,
            },
          },
          {
            resolve: './src/modules/moov-money-manual',
            id: 'moov-money-manual',
            options: {
              phone_number: process.env.MOOV_MONEY_NUMBER,
              account_name: process.env.MOOV_MONEY_NAME,
            },
          },
          {
            resolve: './src/modules/cash-on-delivery',
            id: 'cash-on-delivery',
            options: {},
          },
        ],
      },
    },
    notification: {
      resolve: '@medusajs/medusa/notification',
      options: {
        providers: [
          {
            resolve: './src/modules/resend',
            id: 'resend',
            options: {
              channels: ['email'],
              api_key: process.env.RESEND_API_KEY,
              from: process.env.RESEND_FROM_EMAIL,
            },
          },
        ],
      },
    },
  }
})
