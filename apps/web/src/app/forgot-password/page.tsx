import { ForgotPasswordForm } from "@/app/forgot-password/forgot-form"

export const metadata = { title: "ลืมรหัสผ่าน · BidNest" }

/** AUTH-005 */
export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <ForgotPasswordForm />
    </main>
  )
}
