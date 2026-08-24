import { z } from "zod"

/**
 * Client-side shapes for the auth forms (SRS section 3 — Zod with React Hook
 * Form).
 *
 * These mirror the DTOs in apps/api and exist to catch a typo before it costs
 * a round trip. They are not the authority: the API validates every field
 * again, and its message is what the screen shows when the two disagree — so
 * a rule that drifts here degrades to a slower error, never to a wrong one.
 */

const email = z
  .string()
  .min(1, "กรอกอีเมล")
  .email("รูปแบบอีเมลไม่ถูกต้อง")
  .max(320)

/** AUTH-001 — at least eight characters, with a letter and a digit. */
const newPassword = z
  .string()
  .min(8, "รหัสผ่านอย่างน้อย 8 ตัวอักษร")
  .max(72, "รหัสผ่านยาวเกินไป")
  .regex(/(?=.*[A-Za-z])(?=.*\d)/, "ต้องมีทั้งตัวอักษรและตัวเลข")

export const loginSchema = z.object({
  email,
  // Not `newPassword`: an existing account may predate any rule we add later,
  // and refusing to submit it here would lock the owner out of their own login.
  password: z.string().min(1, "กรอกรหัสผ่าน")
})
export type LoginValues = z.infer<typeof loginSchema>

export const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "รหัสยืนยันเป็นตัวเลข 6 หลัก")
})
export type OtpValues = z.infer<typeof otpSchema>

export const registerSchema = z.object({
  email,
  password: newPassword,
  firstName: z.string().trim().min(1, "กรอกชื่อจริง").max(100),
  lastName: z.string().trim().max(100).optional(),
  displayName: z.string().trim().min(1, "กรอกชื่อที่แสดง").max(100)
})
export type RegisterValues = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({ email })
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirm: z.string().min(1, "ยืนยันรหัสผ่านอีกครั้ง")
  })
  .refine((values) => values.password === values.confirm, {
    message: "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
    path: ["confirm"]
  })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
