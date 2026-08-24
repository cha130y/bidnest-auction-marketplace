# Dev 2 — Backend Core & Security Checklist

> **อ้างอิง:** SRS v1.0 (`docs/requirements/BidNest-Auction and Marketplace-v4.pdf`) และ Team Role Distribution v2
> **Requirement ที่รับผิดชอบ:** `AUTH-001..008`, `USR-001`, `ADM-003`, `§6 (Security & Quality)`
> **Branch:** `feat/auth-dev2` → PR เข้า `dev` เท่านั้น
> **ขอบเขตงาน:** NestJS setup, Prisma schema หลัก + migration ให้ทั้งทีม, ระบบยืนยันตัวตนทั้งหมด, หมวดหมู่ร่วม, ความปลอดภัยโดยรวม

## สถานะ (24 ส.ค. 2569)

Requirement ทั้งหมดที่ Dev 2 รับผิดชอบ — `AUTH-001..008`, `USR-001`, `ADM-003` — **ทำเสร็จและ merge เข้า `dev` แล้ว** ยืนยันด้วย unit 703 เคส และ e2e 417 เคส

**ทุกข้อในลิสต์นี้ติ๊กครบแล้ว** ข้อสุดท้าย — privacy interceptor (§6) — ทำเสร็จเป็น `SensitiveFieldsInterceptor` เป็น global interceptor ที่ดูทุก response ก่อนออกจากเซิร์ฟเวอร์

แบ่งเป็น 2 ระดับ เพราะเป็นคนละสัญญากัน:

| ระดับ | field | opt-out |
|---|---|---|
| **NEVER** | `passwordHash`, `refreshTokenHash`, `codeHash`, `tokenHash`, `resetTokenHash` | ไม่มี — ไม่มีใครมีสิทธิ์อ่าน digest คืน แม้แต่เจ้าของบัญชีหรือ admin |
| **OWNER_ONLY** | `reservePrice` (AUC-003), `negotiationFloor` (PROD-006) | route ที่ผู้เรียกเป็นเจ้าของจริง แปะ `@ReturnsOwnerFields()` |

เจอแล้วทำอะไร: **ตอนรันเทสจะ throw** (ถ้าแค่ log ไว้ ของที่รั่วก็ยังขึ้น production อยู่ดี) ส่วน dev/production จะ **ตัด field ทิ้ง + log ชื่อ route** ให้ request จริงเสียคุณภาพแทนที่จะเสียความลับ

**ไม่ได้มาแทน mapper** — mapper ของ Dev 3/4 ยังเป็นด่านหลัก และ `auction.mapper` ถึงขั้น build ไม่ผ่านถ้า `reservePrice` โผล่ในชนิดสาธารณะ ตัวนี้เป็น **ตาข่ายรับ route ที่ยังไม่มีใครเขียน** — endpoint ใหม่ที่คืน row ตรงจาก Prisma โดยไม่ผ่าน mapper

**ข้อจำกัดที่ต้องรู้:** route ที่ตัดสินความเป็นเจ้าของ*รายแถว* (เช่น `GET /auctions/:id` ที่คืน reserve ให้เฉพาะผู้ขาย) ต้องแปะ `@ReturnsOwnerFields()` ซึ่งแปลว่าตาข่ายไม่คุ้ม route นั้น — ตรงนั้นยังพึ่ง mapper กับเทสเหมือนเดิม

### ที่ไม่ใช่งานโค้ดแต่ยังค้าง

- Gmail App Password ใน `apps/api/.env` (`MAIL_PASSWORD` ยังว่าง → ล็อกอินยังใช้ไม่ได้)
- LINE `LINE_CHANNEL_SECRET` + Callback URL ที่ developers.line.biz (ปุ่ม LINE ซ่อนอยู่จนกว่าจะครบ)
- เพิ่ม Test users ใน Google Cloud Console ถ้าจะให้คนอื่นล็อกอินด้วย Google ได้

### ที่ต้องแจ้งเจ้าของโค้ด

| ใคร | เรื่อง |
|---|---|
| Dev 5 | `AI_NEGOTIATOR_JWT_SECRET` ยังมี `.default('dev-negotiator-secret-change-me')` — deploy แบบนี้แปลว่าใครก็ปลอม token ได้ |
| Dev 5 | `DevTokenSwitcher` อยู่ใน `/admin` layout แต่ `proxy.ts` กัน `/admin` ไว้ → ยังไม่ล็อกอินก็เข้าไม่ถึงปุ่มสลับ user ควรย้ายไป layout ราก |
| Dev 1 | ปุ่ม hamburger บนมือถือยังกดไม่ติด (`onMenuToggle` ไม่มีใครส่งเข้ามา) เมนู 6 หมวดหมู่จึงเข้าไม่ถึงบนจอเล็ก |
| Dev 4/5 | `TODO(Dev …)` ค้าง 4 จุดใน `admin/*.controller.ts` ทั้งที่ `@Roles('ADMIN')` ใส่ครบแล้ว |

---

## 0. Infrastructure & Setup

Step 1–4 และ 6 ของ Kickoff Guide เป็นความรับผิดชอบของ Dev 2 (ดู `docs/KICKOFF_GUIDE.md`)

- [x] Git repo + branch strategy (`main` / `dev` / `feat/*`)
- [x] Monorepo scaffold — `apps/web`, `apps/api`, `packages/contracts`, `packages/config` (pnpm workspace)
- [x] Docker Compose — PostgreSQL (port `5433`) + Maildev (port `1080`)
- [x] Prisma schema เริ่มต้น + migration แรก (`20260815173946_init_migration`)
- [x] CI พื้นฐาน — lint + test บน PR (`.github/workflows/`)
- [x] `PrismaModule` + `PrismaService` (injectable, global) ใน `apps/api/src/prisma/`
- [x] `ConfigModule` + env validation (ต่อยอดจาก `apps/api/src/config/env.vaildation.ts`)
- [x] Global `ValidationPipe` (class-validator, `whitelist: true`) ใน `main.ts`
- [x] Global exception filter — error response ไม่หลุด implementation detail (§6)
- [x] Swagger setup (`@nestjs/swagger`) — SRS กำหนดว่า REST API ต้องมีเอกสารผ่าน Swagger

---

## 1. AUTH-001 — สมัครสมาชิกแบบ Local

- [x] `POST /auth/register`
- [x] Required: ชื่อจริง, display name, อีเมล (ไม่ซ้ำ), รหัสผ่าน — นามสกุลเป็น optional
- [x] hash รหัสผ่านอย่างปลอดภัย (bcrypt / argon2) ก่อนบันทึกลง `users.password_hash`
- [x] สร้าง `user_profiles` พร้อมกันใน transaction เดียว
- [x] DTO + class-validator (email format, password strength, ความยาว field ตาม schema)

---

## 2. AUTH-002 — เข้าสู่ระบบแบบ Local (2 ขั้นตอน)

- [x] `POST /auth/login` — ตรวจ email/password
- [x] บัญชีที่ `status != ACTIVE` (SUSPENDED / DEACTIVATED) ถูกปฏิเสธตั้งแต่ขั้นตอนแรก
- [x] ผ่านแล้ว → สร้าง OTP + ส่งอีเมล → คืนสถานะ **"รอการยืนยัน"** โดย **ยังไม่ออก token**
- [x] คำขอครั้งที่สอง (ข้อมูล login เดิม + OTP ที่ถูกต้องและยังไม่หมดอายุ) → ออก access token + refresh session

> ⚠️ **หมายเหตุสำคัญ:** NextAuth Credentials provider เรียก `authorize()` แค่ครั้งเดียว
> ฝั่ง client (Dev 1) จะรวบรวม password + OTP เป็น 2 ขั้นบนหน้าจอ แล้วส่งมาพร้อมกันใน `signIn()` ครั้งเดียว
> → ต้องออกแบบ endpoint ให้รองรับทั้งแบบแยก 2 call และแบบส่งพร้อมกัน (**ต้องคุยกับ Dev 1 ก่อนเริ่ม**)

---

## 3. AUTH-007 — 2FA ด้วย OTP ทางอีเมล (บังคับทุกบัญชี ทุกช่องทาง)

- [x] `POST /auth/2fa/verify` — ตรวจ OTP → ออก access token + refresh session
- [x] `POST /auth/2fa/resend` — ขอรหัสใหม่
- [x] รหัส 6 หลัก ใช้ครั้งเดียว, **hash ก่อนบันทึก** ลง `two_factor_codes.code_hash`
- [x] หมดอายุตามเวลาที่กำหนด (เช่น 10 นาที) — ยกเลิกทันทีเมื่อใช้สำเร็จหรือหมดเวลา
- [x] rate-limit การขอส่งรหัสใหม่ (เช่น 1 ครั้งต่อ 60 วินาที)
- [x] บังคับใช้กับ **ทุกวิธี login** — local (AUTH-002), Google (AUTH-003), Line (AUTH-006)
- [x] backup/recovery code **ไม่อยู่ในขอบเขต V1**

---

## 4. AUTH-003 / AUTH-006 — Google & Line OAuth

- [x] `POST /auth/google/callback` — ผูก 1 Google account ต่อ 1 บัญชีแพลตฟอร์มเท่านั้น
- [x] `POST /auth/line/callback` — Line ต้องการแค่ Line user ID, **อีเมลเป็น optional** (Line อาจไม่ส่งมา)
- [x] ระบุตัวตนด้วยคู่ `provider + provider_account_id` เป็นหลัก (`auth_accounts` มี `@@unique` แล้ว)
- [x] ❌ **ห้ามผูกบัญชีจากการจับคู่อีเมลที่ยังไม่ได้ยืนยันเพียงอย่างเดียวเด็ดขาด**
- [x] OAuth ต้องผ่าน OTP step เดียวกับ AUTH-007 ก่อนออก session เสมอ (ไม่ให้ provider ไหนข้ามได้)

---

## 5. AUTH-004 — Refresh Session

- [x] `POST /auth/refresh` — hash refresh token ที่รับมา แล้วเทียบกับ `user_sessions.refresh_token_hash`
- [x] ตรวจ `expires_at > now()` และ `revoked_at IS NULL`
- [x] `POST /auth/logout` — set `revoked_at` (เพิกถอน session)
- [x] เก็บเฉพาะ ID, user, hash, วันหมดอายุ, สถานะเพิกถอน, เวลาสร้าง — **ไม่เก็บ field อื่น**
- [x] `user_sessions` เป็น source of truth เพียงแหล่งเดียว — ฝั่ง NextAuth ถือแค่สำเนาใน cookie
- [x] ตกลงกับ Dev 1 ว่าจะ rotate refresh token หรือไม่ (มีผลกับ NextAuth session callback)

---

## 6. AUTH-005 — กู้คืนรหัสผ่าน

- [x] `POST /auth/forgot-password` — ส่งลิงก์รีเซ็ตแบบ single-use ไปยังอีเมลที่ลงทะเบียนไว้
- [x] ✅ response **ต้องเหมือนกันเสมอ** ไม่ว่าอีเมลจะมีในระบบหรือไม่ (กัน user enumeration)
- [x] `POST /auth/reset-password` — ตรวจ token hash, ยังไม่ใช้, ยังไม่หมดอายุ (เช่น 30 นาที)
- [x] หลังตั้งรหัสใหม่สำเร็จ → **เพิกถอน refresh session เดิมของบัญชีนี้ทั้งหมดทันที** (บังคับ login ใหม่ทุกอุปกรณ์)
- [x] ❌ reset token **ห้ามปรากฏใน API response หรือ production log เด็ดขาด**
- [x] ใช้ `password_reset_tokens` (รูปแบบเดียวกับ `two_factor_codes`)

---

## 7. AUTH-008 — Protected Routes (ฝั่ง NestJS Guard)

- [x] `JwtAuthGuard` — ตรวจ access token **ทุก request ที่เข้ามา** (ไม่พึ่ง middleware ฝั่ง Next.js)
- [x] `RolesGuard` + `@Roles('ADMIN')` decorator สำหรับ USER/ADMIN
- [x] `@Public()` decorator สำหรับ endpoint สาธารณะ (catalog, auction list ฯลฯ)
- [x] ส่ง contract ของ guard/decorator ให้ Dev 3, 4, 5 ใช้ต่อ (**เป็น blocker ของทีม — ทำให้เสร็จเร็ว**)

---

## 8. USR-001 — โปรไฟล์ผู้ใช้

- [x] `GET /users/me` — ข้อมูลโปรไฟล์ของตัวเอง
- [x] `PATCH /users/me` — ชื่อ/นามสกุล, display name, avatar, bio, เบอร์โทร, ที่อยู่, ที่อยู่จัดส่งเริ่มต้น
- [x] ที่อยู่จัดส่งเริ่มต้นใช้ prefill ตอน checkout ฝั่ง e-commerce (Dev 3 เรียกใช้)
- [x] หน้าสาธารณะแสดงเป็น **display name หรือชื่อแบบปิดบัง** เท่านั้น — ห้ามหลุดชื่อจริง/อีเมล

---

## 9. ADM-003 — จัดการหมวดหมู่ร่วม (Admin)

หมวดหมู่ชุดเดียวใช้ร่วมกันทั้ง Auction และ E-commerce

- [x] `GET /categories` — สาธารณะ (Guest ดูได้), filter เฉพาะ `is_active = true` สำหรับฝั่งผู้ใช้
- [x] `POST /categories` — สร้าง (ADMIN only)
- [x] `PATCH /categories/:id` — แก้ไข (ADMIN only)
- [x] `PATCH /categories/:id/activate` / `deactivate` — เปิด/ปิดใช้งาน
- [x] ❌ หมวดหมู่ที่ถูกใช้งานอยู่แล้ว **ปิดใช้งานเท่านั้น ห้ามลบทิ้งถาวร**
- [x] บันทึก `admin_actions` ทุกครั้ง (`CREATE_CATEGORY` / `UPDATE_CATEGORY` / `ACTIVATE_CATEGORY` / `DEACTIVATE_CATEGORY`)
- [x] seed หมวดหมู่ตั้งต้นให้ทีมใช้ dev (`prisma/seed.ts`)

---

## 10. §6 — Security & Quality (ความรับผิดชอบภาพรวม)

### Hashing & Secret
- [x] hash: รหัสผ่าน, refresh token, รหัส OTP, reset token — **ก่อนบันทึกลง DB ทุกตัว**
- [x] ❌ ห้าม log รหัส OTP หรือ reset token แบบข้อความล้วนเด็ดขาด
- [x] ❌ ห้าม commit `.env` หรือ hardcode secret/API key

### Validation & Authorization
- [x] ตรวจสอบ input จากภายนอกทุกจุด (class-validator + DTO)
- [x] บังคับตรวจสิทธิ์ที่ฝั่ง server เสมอ ไม่ใช่แค่ที่ UI
- [x] ทุก request ที่เรียก API ต้องผ่านการตรวจ token ซ้ำโดย NestJS (AUTH-008)

### Rate Limiting (`@nestjs/throttler`)
- [x] login
- [x] ตรวจสอบ / ขอส่ง OTP ใหม่
- [x] ส่ง guideline + shared config ให้ Dev 4 (การส่งบิด) และ Dev 5 (AI request)

### Data Privacy — ห้ามหลุดเด็ดขาด
- [x] `auctions.reserve_price` (AUC-003)
- [x] `products.negotiation_floor` (PROD-006)
- [x] ข้อมูลส่วนตัวผู้ประมูล / ตะกร้า / คำสั่งซื้อของผู้ใช้คนอื่น
- [x] เขียนเป็น interceptor หรือ serialization rule กลางให้ทั้งทีมใช้ (`SensitiveFieldsInterceptor`)

### Email Delivery
- [x] `MailService` เป็น interface เดียว — dev ใช้ Maildev, production ใช้ SMTP relay จริง
- [x] ❌ Maildev **ห้ามเข้าถึงได้จาก production network เด็ดขาด** (dashboard เปิดเผย OTP ทุกตัวโดยไม่ต้องยืนยันตัวตน)

### Testing & Docs
- [x] Unit test: auth service, guard, hashing
- [x] E2E test: flow register → login → OTP → refresh → logout
- [x] Swagger ครบทุก endpoint ของ `/auth`, `/users`, `/categories`

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
