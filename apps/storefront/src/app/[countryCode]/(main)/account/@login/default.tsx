import LoginTemplate from "@modules/account/templates/login-template"

// Next.js a besoin d'un fallback pour ce slot parallèle à tout segment plus
// profond que "/account" (ex. "/account/orders") : @login n'a de page.tsx
// qu'à la racine, donc sans ce default.tsx, Next.js ne peut pas résoudre ce
// slot sur ces URLs et affiche "Page not found" - même quand @dashboard,
// lui, a bien une page pour ce segment (confirmé en production le
// 2026-09-19 sur /account/orders). Le layout choisit de toute façon
// @dashboard ou @login selon la session ; rejouer le login ici est donc
// correct pour un visiteur déconnecté qui atterrit directement sur une
// sous-page du compte.
export default function LoginDefault() {
  return <LoginTemplate />
}
