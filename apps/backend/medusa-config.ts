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
    }
  },
  modules: {
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
