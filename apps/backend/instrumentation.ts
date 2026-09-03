// Observabilité backend (GlitchTip self-hosted, compatible protocole Sentry).
// Voir docs/superpowers/specs/2026-09-03-observabilite-backend-design.md.
//
// Le guide officiel Medusa (docs.medusajs.com/resources/integrations/guides/sentry)
// référence @sentry/opentelemetry-node, le pont OTel de l'ancien SDK Sentry v7 -
// incompatible avec @sentry/node v10 installé ici (Sentry est passé à une
// architecture OTel-native en v8+, ce package est retiré). Pattern actuel :
// "Using Your Existing OpenTelemetry Setup" de la doc Sentry v10
// (docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/),
// adapté pour brancher ses 4 briques (contextManager, sampler, spanProcessors,
// textMapPropagator) sur registerOtel (déjà scaffoldé par Medusa) plutôt que sur
// un NodeTracerProvider séparé - un seul NodeSDK doit exister, celui de Medusa.
//
// SENTRY_DSN absent (dev local, ou avant que l'instance GlitchTip existe) ->
// Sentry.init reçoit dsn: undefined, qui désactive silencieusement l'envoi
// (comportement documenté du SDK Sentry) - pas de branche conditionnelle à
// maintenir ici.
import * as Sentry from "@sentry/node"
import { registerOtel } from "@medusajs/medusa"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc"
import {
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
} from "@sentry/opentelemetry"

const sentryClient = Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Réduit par rapport à l'exemple officiel (1.0 = 100% des requêtes tracées) :
  // ce VPS a une marge disque tendue (voir spec), pas besoin de tracer chaque
  // requête pour repérer les endpoints lents.
  tracesSampleRate: process.env.SENTRY_DSN ? 0.2 : 0,
  // Le NodeSDK OpenTelemetry est celui de Medusa (registerOtel ci-dessous) - on
  // empêche Sentry.init de créer le sien en plus, qui entrerait en conflit.
  skipOpenTelemetrySetup: true,
})

export function register() {
  registerOtel({
    serviceName: "medusa",
    contextManager: new Sentry.SentryContextManager(),
    textMapPropagator: new SentryPropagator(),
    sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
    spanProcessors: [new SentrySpanProcessor()],
    traceExporter: new OTLPTraceExporter(),
    instrument: {
      http: true,
      workflows: true,
      query: true,
    },
  })

  if (process.env.SENTRY_DSN) {
    Sentry.validateOpenTelemetrySetup()
  }
}
