# Dev 2 — Backend Core & Security Checklist

> **อ้างอิง:** SRS v1.0 (`docs/requirements/BidNest-Auction and Marketplace-v4.pdf`) และ Team Role Distribution v2
> **Requirement ที่รับผิดชอบ:** `AUTH-001..008`, `USR-001`, `ADM-003`, `§6 (Security & Quality)`
> **Branch:** `feat/auth-dev2` → PR เข้า `dev` เท่านั้น
> **ขอบเขตงาน:** NestJS setup, Prisma schema หลัก + migration ให้ทั้งทีม, ระบบยืนยันตัวตนทั้งหมด, หมวดหมู่ร่วม, ความปลอดภัยโดยรวม

---

## 0. Infrastructure & Setup

Step 1–4 และ 6 ของ Kickoff Guide เป็นความรับผิดชอบของ Dev 2 (ดู `docs/KICKOFF_GUIDE.md`)

- [x] Git repo + branch strategy (`main` / `dev` / `feat/*`)
- [x] Monorepo scaffold — `apps/web`, `apps/api`, `packages/contracts`, `packages/config` (pnpm workspace)
- [x] Docker Compose — PostgreSQL (port `5433`) + Maildev (port `1080`)
- [x] Prisma schema เริ่มต้น + migration แรก (`20260815173946_init_migration`)
- [x] CI พื้นฐาน — lint + test บน PR (`.github/workflows/`)
- [ ] `PrismaModule` + `PrismaService` (injectable, global) ใน `apps/api/src/prisma/`
- [ ] `ConfigModule` + env validation (ต่อยอดจาก `apps/api/src/config/env.vaildation.ts`)
- [ ] Global `ValidationPipe` (class-validator, `whitelist: true`) ใน `main.ts`
- [ ] Global exception filter — error response ไม่หลุด implementation detail (§6)
- [ ] Swagger setup (`@nestjs/swagger`) — SRS กำหนดว่า REST API ต้องมีเอกสารผ่าน Swagger

---

## 1. AUTH-001 — สมัครสมาชิกแบบ Local

- [ ] `POST /auth/register`
- [ ] Required: ชื่อจริง, display name, อีเมล (ไม่ซ้ำ), รหัสผ่าน — นามสกุลเป็น optional
- [ ] hash รหัสผ่านอย่างปลอดภัย (bcrypt / argon2) ก่อนบันทึกลง `users.password_hash`
- [ ] สร้าง `user_profiles` พร้อมกันใน transaction เดียว
- [ ] DTO + class-validator (email format, password strength, ความยาว field ตาม schema)

---

## 2. AUTH-002 — เข้าสู่ระบบแบบ Local (2 ขั้นตอน)

- [ ] `POST /auth/login` — ตรวจ email/password
- [ ] บัญชีที่ `status != ACTIVE` (SUSPENDED / DEACTIVATED) ถูกปฏิเสธตั้งแต่ขั้นตอนแรก
- [ ] ผ่านแล้ว → สร้าง OTP + ส่งอีเมล → คืนสถานะ **"รอการยืนยัน"** โดย **ยังไม่ออก token**
- [ ] คำขอครั้งที่สอง (ข้อมูล login เดิม + OTP ที่ถูกต้องและยังไม่หมดอายุ) → ออก access token + refresh session

> ⚠️ **หมายเหตุสำคัญ:** NextAuth Credentials provider เรียก `authorize()` แค่ครั้งเดียว
> ฝั่ง client (Dev 1) จะรวบรวม password + OTP เป็น 2 ขั้นบนหน้าจอ แล้วส่งมาพร้อมกันใน `signIn()` ครั้งเดียว
> → ต้องออกแบบ endpoint ให้รองรับทั้งแบบแยก 2 call และแบบส่งพร้อมกัน (**ต้องคุยกับ Dev 1 ก่อนเริ่ม**)

---

## 3. AUTH-007 — 2FA ด้วย OTP ทางอีเมล (บังคับทุกบัญชี ทุกช่องทาง)

- [ ] `POST /auth/2fa/verify` — ตรวจ OTP → ออก access token + refresh session
- [ ] `POST /auth/2fa/resend` — ขอรหัสใหม่
- [ ] รหัส 6 หลัก ใช้ครั้งเดียว, **hash ก่อนบันทึก** ลง `two_factor_codes.code_hash`
- [ ] หมดอายุตามเวลาที่กำหนด (เช่น 10 นาที) — ยกเลิกทันทีเมื่อใช้สำเร็จหรือหมดเวลา
- [ ] rate-limit การขอส่งรหัสใหม่ (เช่น 1 ครั้งต่อ 60 วินาที)
- [ ] บังคับใช้กับ **ทุกวิธี login** — local (AUTH-002), Google (AUTH-003), Line (AUTH-006)
- [ ] backup/recovery code **ไม่อยู่ในขอบเขต V1**

---

## 4. AUTH-003 / AUTH-006 — Google & Line OAuth

- [ ] `POST /auth/google/callback` — ผูก 1 Google account ต่อ 1 บัญชีแพลตฟอร์มเท่านั้น
- [ ] `POST /auth/line/callback` — Line ต้องการแค่ Line user ID, **อีเมลเป็น optional** (Line อาจไม่ส่งมา)
- [ ] ระบุตัวตนด้วยคู่ `provider + provider_account_id` เป็นหลัก (`auth_accounts` มี `@@unique` แล้ว)
- [ ] ❌ **ห้ามผูกบัญชีจากการจับคู่อีเมลที่ยังไม่ได้ยืนยันเพียงอย่างเดียวเด็ดขาด**
- [ ] OAuth ต้องผ่าน OTP step เดียวกับ AUTH-007 ก่อนออก session เสมอ (ไม่ให้ provider ไหนข้ามได้)

---

## 5. AUTH-004 — Refresh Session

- [ ] `POST /auth/refresh` — hash refresh token ที่รับมา แล้วเทียบกับ `user_sessions.refresh_token_hash`
- [ ] ตรวจ `expires_at > now()` และ `revoked_at IS NULL`
- [ ] `POST /auth/logout` — set `revoked_at` (เพิกถอน session)
- [ ] เก็บเฉพาะ ID, user, hash, วันหมดอายุ, สถานะเพิกถอน, เวลาสร้าง — **ไม่เก็บ field อื่น**
- [ ] `user_sessions` เป็น source of truth เพียงแหล่งเดียว — ฝั่ง NextAuth ถือแค่สำเนาใน cookie
- [ ] ตกลงกับ Dev 1 ว่าจะ rotate refresh token หรือไม่ (มีผลกับ NextAuth session callback)

---

## 6. AUTH-005 — กู้คืนรหัสผ่าน

- [ ] `POST /auth/forgot-password` — ส่งลิงก์รีเซ็ตแบบ single-use ไปยังอีเมลที่ลงทะเบียนไว้
- [ ] ✅ response **ต้องเหมือนกันเสมอ** ไม่ว่าอีเมลจะมีในระบบหรือไม่ (กัน user enumeration)
- [ ] `POST /auth/reset-password` — ตรวจ token hash, ยังไม่ใช้, ยังไม่หมดอายุ (เช่น 30 นาที)
- [ ] หลังตั้งรหัสใหม่สำเร็จ → **เพิกถอน refresh session เดิมของบัญชีนี้ทั้งหมดทันที** (บังคับ login ใหม่ทุกอุปกรณ์)
- [ ] ❌ reset token **ห้ามปรากฏใน API response หรือ production log เด็ดขาด**
- [ ] ใช้ `password_reset_tokens` (รูปแบบเดียวกับ `two_factor_codes`)

---

## 7. AUTH-008 — Protected Routes (ฝั่ง NestJS Guard)

- [ ] `JwtAuthGuard` — ตรวจ access token **ทุก request ที่เข้ามา** (ไม่พึ่ง middleware ฝั่ง Next.js)
- [ ] `RolesGuard` + `@Roles('ADMIN')` decorator สำหรับ USER/ADMIN
- [ ] `@Public()` decorator สำหรับ endpoint สาธารณะ (catalog, auction list ฯลฯ)
- [ ] ส่ง contract ของ guard/decorator ให้ Dev 3, 4, 5 ใช้ต่อ (**เป็น blocker ของทีม — ทำให้เสร็จเร็ว**)

---

## 8. USR-001 — โปรไฟล์ผู้ใช้

- [ ] `GET /users/me` — ข้อมูลโปรไฟล์ของตัวเอง
- [ ] `PATCH /users/me` — ชื่อ/นามสกุล, display name, avatar, bio, เบอร์โทร, ที่อยู่, ที่อยู่จัดส่งเริ่มต้น
- [ ] ที่อยู่จัดส่งเริ่มต้นใช้ prefill ตอน checkout ฝั่ง e-commerce (Dev 3 เรียกใช้)
- [ ] หน้าสาธารณะแสดงเป็น **display name หรือชื่อแบบปิดบัง** เท่านั้น — ห้ามหลุดชื่อจริง/อีเมล

---

## 9. ADM-003 — จัดการหมวดหมู่ร่วม (Admin)

หมวดหมู่ชุดเดียวใช้ร่วมกันทั้ง Auction และ E-commerce

- [ ] `GET /categories` — สาธารณะ (Guest ดูได้), filter เฉพาะ `is_active = true` สำหรับฝั่งผู้ใช้
- [ ] `POST /categories` — สร้าง (ADMIN only)
- [ ] `PATCH /categories/:id` — แก้ไข (ADMIN only)
- [ ] `PATCH /categories/:id/activate` / `deactivate` — เปิด/ปิดใช้งาน
- [ ] ❌ หมวดหมู่ที่ถูกใช้งานอยู่แล้ว **ปิดใช้งานเท่านั้น ห้ามลบทิ้งถาวร**
- [ ] บันทึก `admin_actions` ทุกครั้ง (`CREATE_CATEGORY` / `UPDATE_CATEGORY` / `ACTIVATE_CATEGORY` / `DEACTIVATE_CATEGORY`)
- [ ] seed หมวดหมู่ตั้งต้นให้ทีมใช้ dev (`prisma/seed.ts`)

---

## 10. §6 — Security & Quality (ความรับผิดชอบภาพรวม)

### Hashing & Secret
- [ ] hash: รหัสผ่าน, refresh token, รหัส OTP, reset token — **ก่อนบันทึกลง DB ทุกตัว**
- [ ] ❌ ห้าม log รหัส OTP หรือ reset token แบบข้อความล้วนเด็ดขาด
- [ ] ❌ ห้าม commit `.env` หรือ hardcode secret/API key

### Validation & Authorization
- [ ] ตรวจสอบ input จากภายนอกทุกจุด (class-validator + DTO)
- [ ] บังคับตรวจสิทธิ์ที่ฝั่ง server เสมอ ไม่ใช่แค่ที่ UI
- [ ] ทุก request ที่เรียก API ต้องผ่านการตรวจ token ซ้ำโดย NestJS (AUTH-008)

### Rate Limiting (`@nestjs/throttler`)
- [ ] login
- [ ] ตรวจสอบ / ขอส่ง OTP ใหม่
- [ ] ส่ง guideline + shared config ให้ Dev 4 (การส่งบิด) และ Dev 5 (AI request)

### Data Privacy — ห้ามหลุดเด็ดขาด
- [ ] `auctions.reserve_price` (AUC-003)
- [ ] `products.negotiation_floor` (PROD-006)
- [ ] ข้อมูลส่วนตัวผู้ประมูล / ตะกร้า / คำสั่งซื้อของผู้ใช้คนอื่น
- [ ] เขียนเป็น interceptor หรือ serialization rule กลางให้ทั้งทีมใช้

### Email Delivery
- [ ] `MailService` เป็น interface เดียว — dev ใช้ Maildev, production ใช้ SMTP relay จริง
- [ ] ❌ Maildev **ห้ามเข้าถึงได้จาก production network เด็ดขาด** (dashboard เปิดเผย OTP ทุกตัวโดยไม่ต้องยืนยันตัวตน)

### Testing & Docs
- [ ] Unit test: auth service, guard, hashing
- [ ] E2E test: flow register → login → OTP → refresh → logout
- [ ] Swagger ครบทุก endpoint ของ `/auth`, `/users`, `/categories`

---

## Endpoint สรุป (ตาม SRS §5.2)

| Method | Endpoint | Requirement |
|---|---|---|
| POST | `/auth/register` | AUTH-001 |
| POST | `/auth/login` | AUTH-002 |
| POST | `/auth/2fa/verify` | AUTH-007 |
| POST | `/auth/2fa/resend` | AUTH-007 |
| POST | `/auth/google/callback` | AUTH-003 |
| POST | `/auth/line/callback` | AUTH-006 |
| POST | `/auth/refresh` | AUTH-004 |
| POST | `/auth/logout` | AUTH-004 |
| POST | `/auth/forgot-password` | AUTH-005 |
| POST | `/auth/reset-password` | AUTH-005 |
| GET / PATCH | `/users/me` | USR-001 |
| GET / POST / PATCH | `/categories` | ADM-003 |

---

## จุดที่ต้องประสานกับทีม

| กับใคร | เรื่อง |
|---|---|
| **Dev 1** | รูปแบบ payload ที่ NextAuth credentials provider ส่งมา (password + OTP ใน call เดียว), JWT payload shape, การ rotate refresh token |
| **Dev 3 / Dev 4** | `JwtAuthGuard` / `RolesGuard` / `@Public()` contract, shared DTO ใน `packages/contracts`, rate-limit config |
| **Dev 5** | `@Roles('ADMIN')` สำหรับ ADM-002 / ADM-004, pattern การบันทึก `admin_actions` |
| **ทุกคน** | การแก้ `schema.prisma` ต้องแจ้ง Dev 2 ก่อนเสมอ — Dev 2 เป็นเจ้าของ migration |

---

## ลำดับความสำคัญ (14 วัน)

**สัปดาห์ที่ 1 — ปลดล็อกทีม (ทำก่อน)**
1. `PrismaService` + `ConfigModule` + `ValidationPipe` + Swagger
2. AUTH-001, AUTH-002 (local login พื้นฐาน + JWT)
3. AUTH-008 guards → **ส่งให้ทีมทันทีที่เสร็จ** (Dev 3/4/5 รอ mock auth อยู่)

**สัปดาห์ที่ 1 ปลาย**
4. AUTH-007 (OTP + MailService), AUTH-004 (refresh / logout)
5. ADM-003 categories + seed → Dev 3/4 ต้องใช้อ้างอิงหมวดหมู่

**สัปดาห์ที่ 2**
6. AUTH-003, AUTH-006 (OAuth), AUTH-005 (reset password)
7. USR-001 profile
8. §6 hardening — rate-limit, privacy interceptor, test coverage
