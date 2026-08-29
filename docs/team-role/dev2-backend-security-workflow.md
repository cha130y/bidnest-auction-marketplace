# Dev 2 — Backend Core & Security Workflow (แม่แบบ slash command)

> **เจ้าของแนวทาง:** Dev 2 (Backend Core & Security)
> **ไฟล์นี้คืออะไร:** สำเนาของ slash command ส่วนตัว `/dev2` ที่ใช้อยู่จริง เอาขึ้น repo ไว้เป็น **แม่แบบให้เพื่อนในทีมก็อปไปปรับเป็นของตัวเอง**
> **ไม่ใช่กติกาทีม** — กติกาที่ทั้งทีมยึดร่วมกันอยู่ใน `CLAUDE.md` เท่านั้น ไฟล์นี้เป็นแนวทางส่วนบุคคล ปรับได้ตามใจ
> **คู่กับ:** `docs/team-role/dev2-checklist.md` (checklist ละเอียดรายข้อ) และ `docs/team-role/dev4-auction-workflow.md` (แม่แบบของ Dev 4)
> **อ้างอิง:** SRS v7, Team Role Distribution v2

---

## วิธีนำไปใช้

1. สร้างไฟล์ `.claude/commands/<ชื่อที่อยากเรียก>.md` ในเครื่องตัวเอง (เช่น `dev2.md`)
2. ก็อปเนื้อหาในบล็อกข้างล่างไปวาง แล้วแก้ให้ตรงกับ requirement / module ของตัวเอง
   - เปลี่ยน `description:` ใน frontmatter
   - เปลี่ยนรายการ requirement ในหัวข้อ "ลำดับ requirement"
   - เปลี่ยน/ตัด "กติกาการเขียนโค้ด" ข้อที่เป็นเรื่องเฉพาะฝั่ง auth/security (ข้อ 4–8)
3. เรียกใช้ด้วย `/<ชื่อนั้น>` ตอนคุยกับ Claude Code

`.gitignore` กัน `.claude/*` ไว้แล้ว ไฟล์ command ในเครื่องตัวเองจะไม่ขึ้น git และไม่กระทบใคร

---

## เนื้อหาแม่แบบ (ก็อปทั้งบล็อก รวม frontmatter)

```markdown
---
description: ทำ requirement ฝั่ง Auth และ Security ของ Dev 2 ทีละข้อ พร้อมหยุดเทสและถามก่อน commit
---

# Workflow ของ Dev 2 — Backend Core & Security

ทำ requirement ต่อไปนี้ **ทีละข้อ** ห้ามทำรวบหลาย requirement ในรอบเดียว

## เอกสารอ้างอิง (อ่านก่อนเริ่มทุกครั้ง)

- SRS: `docs/requirements/BidNest-Auction and Marketplace-v7.pdf` — ใช้ช่อง **"เกณฑ์การยอมรับ"** ของแต่ละ requirement เป็นเกณฑ์ตัดสินว่าผ่านหรือไม่ และ **§6** เป็นเกณฑ์ด้านความปลอดภัย
- Team role: `docs/team-role/Team-role-dustribution-v2.pdf`
- Checklist ของตัวเอง: `docs/team-role/dev2-checklist.md` — ติ๊กความคืบหน้าที่นี่
- Schema: `apps/api/prisma/schema.prisma` — **Dev 2 เป็นเจ้าของไฟล์นี้และ migration ทั้งหมด**
- ADR: `docs/architecture/adr/` — ADR-0001 (admin/category ใช้ชุดเดียว), ADR-0002 (product state machine)
- Reference repo: https://github.com/cha130y/cbeave-auction-platform (อ่านผ่าน `gh api` ได้ ไม่ต้อง clone)

## ลำดับ requirement (ตาม Team-role ของ Dev 2)

ทำเรียงตามนี้ เพราะจัดให้ของที่ "คนอื่นรออยู่" มาก่อน

1. **AUTH-002 + AUTH-007** — login แบบ local + OTP ทางอีเมล **ต้องทำคู่กัน** เพราะ 2FA เป็นข้อบังคับทุกบัญชี ไม่มีทาง login ผ่านโดยไม่ยืนยัน OTP
2. **AUTH-008** — `JwtAuthGuard` + `RolesGuard` จริง ← **ปลดล็อกทั้งทีม ทำให้เร็วที่สุด** (ดูกติกาข้อ 6)
3. **AUTH-004** — refresh session + logout (เพิกถอน token)
4. **AUTH-005** — กู้คืนรหัสผ่านผ่านลิงก์ single-use
5. **AUTH-003 + AUTH-006** — Google OAuth และ Line OAuth (ทั้งคู่ต้องผ่าน OTP ก่อนออก session)
6. **USR-001** — โปรไฟล์ผู้ใช้ + ที่อยู่จัดส่งเริ่มต้น (Dev 3 ใช้ prefill ตอน checkout)
7. **ADM-003** — จัดการหมวดหมู่ร่วม (scaffold อยู่ที่ `apps/api/src/categories/` แล้ว)
8. **§6** — hardening รอบสุดท้าย: rate-limit, privacy interceptor, test coverage

**AUTH-001** (สมัครสมาชิก) ทำเสร็จแล้ว อยู่ที่ `apps/api/src/auth/`

ถ้า requirement ไหนถูกทำไปแล้ว ให้ข้ามแล้วบอกว่าข้ามเพราะอะไร

## กติกาการเขียนโค้ด

1. **ยึดโครงสร้างของ bidnest เป็นหลัก** — โครงสร้างโฟลเดอร์ การตั้งชื่อ และ convention ของ repo นี้มาก่อนเสมอ
2. **cbeave ใช้เป็นแบบอ้างอิง ไม่ใช่ก็อปวาง** — ดู pattern (โครงสร้าง module, strategy/guard, การออก token) แล้วปรับให้เข้ากับ bidnest

   ⚠️ cbeave กับ bidnest **ไม่เหมือนกัน** — cbeave ใช้ `FACEBOOK` provider ส่วน bidnest ใช้ `LINE` (และ Line อาจไม่ส่งอีเมลมาให้เลย ระบุตัวตนด้วย `provider + provider_account_id` เท่านั้น), bidnest บังคับ 2FA ทุกช่องทาง login ซึ่ง cbeave ไม่มี ก็อปมาตรงๆ จะพัง ตรวจกับ `schema.prisma` ของ bidnest ทุกครั้ง
3. **`schema.prisma` — Dev 2 เป็นเจ้าของ แต่ยังต้องแจ้งทีมก่อนแก้** (ตาม CLAUDE.md) เพราะทุกคนใช้ร่วมกัน แก้แล้วต้อง commit ไฟล์ migration ไปพร้อมกันเสมอ ห้าม commit `schema.prisma` เปล่าๆ โดยไม่มี migration
4. **hash ทุก secret ก่อนลง DB** — รหัสผ่าน, รหัส OTP, refresh token, reset token (SRS §6) ใช้ `HashingService` ที่มีอยู่แล้ว อย่าสร้างตัวที่สอง
5. **ห้าม log ค่าดิบของ OTP / reset token / รหัสผ่าน / refresh token เด็ดขาด** ไม่ว่าจะ log level ไหน และห้ามส่ง reset token กลับใน API response (AUTH-005, §6)
6. **AUTH-008 ให้แทนที่ `MockAuthGuard` เท่านั้น ห้ามแก้ contract** — Dev 4 ทำ `apps/api/src/common/guards/mock-auth.guard.ts` ไว้เป็นตัวยืนชั่วคราว ทุก controller ของ Dev 3/4/5 ผูกกับ `@CurrentUser()`, `@Public()`, `@Roles()` และ type `AuthenticatedUser` ไว้หมดแล้ว งานของเราคือเปลี่ยนวิธี "ระบุตัวตน" จาก header `x-mock-user-id` เป็น Bearer token เท่านั้น **ถ้าไปแก้ชื่อ decorator หรือรูปร่าง `AuthenticatedUser` โค้ดของอีก 3 คนพังหมด** — ถ้าคิดว่าจำเป็นต้องแก้จริง ให้เสนอแล้วรอคำตอบ
7. **AUTH-005 ห้ามบอกว่าอีเมลมีอยู่ในระบบหรือไม่** — response ต้องเหมือนกันเป๊ะทุกกรณี ทั้งข้อความ, status code และเวลาที่ตอบกลับ (กัน user enumeration)
8. **ห้ามเขียนโค้ดแทน dev คนอื่น** — ถ้า requirement ต้องพึ่งโค้ดของคนอื่น ให้ตรวจในโค้ดก่อนว่ามีของจริงหรือยัง ถ้ายังไม่มีให้ mock หรือเว้นว่างไว้ก่อนแล้วรอเขา ห้ามสร้างให้ แล้วรายงานว่าข้อไหนเทสไม่ได้เพราะรออะไรอยู่

## เมื่อจบแต่ละ requirement — หยุดก่อน

**อย่าทำ requirement ถัดไปทันที** ให้ทำตามนี้:

1. เขียน/รัน test ตรวจว่าผ่าน **เกณฑ์การยอมรับใน SRS** ของ requirement นั้นครบทุกข้อ
   - ใช้ mock data หรือ seed data ตามเหมาะสม
   - งาน auth ต้องมีทั้ง unit test (service, guard, hashing) และ e2e ที่ยิงผ่าน HTTP จริง
   - อีเมลที่ระบบส่ง (OTP, reset link) ตรวจได้ที่ Maildev `http://localhost:1080`
   - ถ้ามี UI ฝั่ง frontend แล้ว ให้เทส **ทั้ง frontend และ backend พร้อมกัน**
   - รัน `pnpm check` ให้ผ่านด้วย (typecheck + test + lint)
   - ⚠️ `apps/api/generated/prisma` ถูก gitignore ไว้ ถ้า lint ฟ้อง `no-unsafe-*` รัวๆ ให้รัน `pnpm --filter api exec prisma generate` ก่อน
2. รายงานผลเทสตามจริง — ข้อไหนผ่าน ข้อไหนไม่ผ่าน ข้อไหนยังไม่ได้เทสและเพราะอะไร
3. **ถามก่อนว่าพร้อม commit + push หรือยัง** แล้วรอคำตอบ
4. ถ้าตอบตกลง → commit + push + ร่าง PR title/description ตามรูปแบบใน CLAUDE.md
   - commit message: `<type>(<requirement-id>): <คำอธิบายภาษาอังกฤษสั้นๆ>`
   - PR base = `dev` เสมอ
   - **ห้ามกดสร้าง/merge PR ให้เอง** — ส่ง URL กับข้อความให้ผู้ใช้กดเอง
```
