import { RegisterForm } from "@/app/register/register-form"

export const metadata = { title: "สมัครสมาชิก · BidNest" }

/** AUTH-001 */
export default function RegisterPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <RegisterForm />
    </main>
  )
}
