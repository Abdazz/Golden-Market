import { Metadata } from "next"

import LoginTemplate from "@modules/account/templates/login-template"

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à votre compte Golden Market.",
}

export default function Login() {
  return <LoginTemplate />
}
