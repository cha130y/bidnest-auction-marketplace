import { RegisterForm } from "@/app/register/register-form"

export const metadata = { title: "สมัครสมาชิก · BidNest" }

/** AUTH-001 — the form brings its own shell (AuthCard), so this only routes. */
export default function RegisterPage() {
  return <RegisterForm />
}
