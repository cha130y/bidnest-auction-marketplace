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

/**
 * AUTH-006 — the address a first-time Line user supplies when Line released
 * none. Nothing else: the identity is already settled by the provider token.
 */
export const oauthEmailSchema = z.object({ email })
export type OAuthEmailValues = z.infer<typeof oauthEmailSchema>

export const registerSchema = z
  .object({
    email,
    password: newPassword,
    // AUTH-001 — typed twice, because a typo in a box you cannot read locks
    // you out of the account you just made and the only way back is the reset
    // link. The API neither wants nor sees this field.
    confirm: z.string().min(1, "ยืนยันรหัสผ่านอีกครั้ง"),
    firstName: z.string().trim().min(1, "กรอกชื่อจริง").max(100),
    lastName: z.string().trim().max(100).optional(),
    displayName: z.string().trim().min(1, "กรอกชื่อที่แสดง").max(100)
  })
  .refine((values) => values.password === values.confirm, {
    message: "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
    path: ["confirm"]
  })
export type RegisterValues = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({ email })
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

/**
 * USR-001 — the profile form.
 *
 * Optional fields accept an empty string here rather than being marked
 * optional, because a text input never sends `undefined`: clearing one gives
 * `""`, and the form turns that into the `null` the API reads as "clear this".
 * Lengths mirror UpdateProfileDto so a too-long bio is caught before it costs
 * a round trip.
 */
export const profileSchema = z.object({
  firstName: z.string().trim().min(1, "กรอกชื่อจริง").max(100),
  lastName: z.string().trim().max(100, "นามสกุลยาวเกินไป"),
  displayName: z.string().trim().min(1, "กรอกชื่อที่แสดง").max(100),
  // No `.default("")`: a default makes the parsed type differ from the input
  // one, and RHF's resolver is typed against both at once.
  avatarUrl: z.union([
    z.literal(""),
    z.string().trim().url("ลิงก์รูปไม่ถูกต้อง").max(2048)
  ]),
  bio: z.string().trim().max(500, "แนะนำตัวได้ไม่เกิน 500 ตัวอักษร"),
  // The default shipping address. Every length below is checkout's own, not a
  // number picked for this form — the whole point of these fields is that what
  // is saved here can be sent to `POST /orders/checkout` unchanged.
  phone: z.string().trim().max(30, "เบอร์โทรยาวเกินไป"),
  recipientName: z.string().trim().max(150, "ชื่อผู้รับยาวเกินไป"),
  line1: z.string().trim().max(200, "ที่อยู่ยาวเกินไป"),
  line2: z.string().trim().max(200, "ที่อยู่เพิ่มเติมยาวเกินไป"),
  city: z.string().trim().max(100, "ชื่อจังหวัด / เขตยาวเกินไป"),
  postalCode: z.string().trim().max(20, "รหัสไปรษณีย์ยาวเกินไป")
})
export type ProfileValues = z.infer<typeof profileSchema>

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
