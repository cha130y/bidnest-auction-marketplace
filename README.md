# BidNest — Auction & Marketplace

แพลตฟอร์มซื้อขายที่รวมสองโหมดไว้ในระบบเดียว — **ประมูลแบบเรียลไทม์** และ **ร้านค้าซื้อทันที** —
โดยใช้บัญชีผู้ใช้ ตะกร้า การชำระเงิน และการจัดส่งชุดเดียวกัน ผู้ใช้คนหนึ่งเป็นได้ทั้งผู้ซื้อและผู้ขายในบัญชีเดียว

โปรเจกต์กลุ่ม 5 คน ระยะเวลา 14 วัน · pnpm monorepo (Next.js + NestJS + PostgreSQL)

> **เพิ่งเข้าทีม / เครื่องใหม่?** ไปที่ [Setup เครื่องตัวเอง](docs/KICKOFF_GUIDE.md#setup-เครื่องตัวเอง--ทำครั้งแรกครั้งเดียว) ใน Kickoff Guide ให้จบก่อน
> **กลับมาทำงานต่อ?** ใช้ [Workflow ประจำวัน](docs/DAILY_WORKFLOW.md)

---

## ระบบทำอะไรได้บ้าง

| โมดูล | ความสามารถ |
| --- | --- |
| **ยืนยันตัวตน** | สมัคร/เข้าสู่ระบบด้วยอีเมล, เข้าผ่าน Google และ LINE, ยืนยันสองชั้นด้วย OTP ทางอีเมล, จำอุปกรณ์ที่เชื่อถือ, รีเซ็ตรหัสผ่าน |
| **ประมูล** | ผู้ขายสร้างร่าง → ตรวจความครบ → ดูตัวอย่าง → เผยแพร่ · ระบบเปิด-ปิดประมูลตามเวลาเอง · หน้าแรกแบ่งเป็น 4 มุมมอง (กำลังฮิต / ใกล้ปิด / ใกล้เริ่ม / เพิ่งจบ) |
| **การบิดและห้องสด** | บิดแบบเรียลไทม์ผ่าน WebSocket · กันบิดซ้ำจากการกดย้ำ · ระบบกันยิงท้าย (บิดใน 2 นาทีสุดท้ายต่อเวลาอีก 2 นาที สูงสุด 5 ครั้ง) · ล็อบบี้ + สนามประมูล + หน้าประกาศผล |
| **ร้านค้า** | ลงสินค้าพร้อมสต็อกและราคา · ค้นหาและกรอง · ตะกร้าหลายร้าน · ชำระเงินจำลองครั้งเดียวแล้วแตกออเดอร์ตามผู้ขาย · ติดตามสถานะจัดส่งเป็น timeline |
| **AI (Gemini)** | ประเมินราคาเริ่มต้นให้ร่างประมูล · ตอบข้อเสนอต่อรองราคาโดยเทียบกับพื้นราคาที่ผู้ขายตั้งไว้ · แชทช่วยเหลือที่ส่งต่อให้แอดมินเมื่อตอบไม่ได้ |
| **แจ้งเตือนและแชท** | แจ้งเตือนในแอป 8 เหตุการณ์ (โดนแซงราคา, ชนะประมูล, ออเดอร์ใหม่, สถานะจัดส่ง ฯลฯ) · แชทผู้ซื้อ–ผู้ขายผูกกับสินค้า/ประมูลที่กำลังคุยถึง |
| **หลังบ้าน** | ระงับผู้ใช้ · จัดการหมวดหมู่ · ยกเลิกประมูล · ปิด/เปิดการขายสินค้า · ดูภาพรวมคำสั่งซื้อ · รับช่วงแชทช่วยเหลือ · ทุกคำสั่งบันทึกลง audit log พร้อมเหตุผล |

ดูผังการทำงานทั้งหมดได้ที่ [ผัง Workflow](docs/architecture/workflows/)

---

## Tech stack

| ส่วน | ใช้อะไร |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 + shadcn/ui, TanStack Query, React Hook Form + Zod, NextAuth v5 |
| Backend | NestJS 11, TypeScript, Prisma 7, class-validator, Passport + JWT, Throttler, Swagger |
| ฐานข้อมูล | PostgreSQL 17 |
| เรียลไทม์ | Socket.IO — namespace `/auctions` (ห้องประมูล) และ `/user` (แจ้งเตือน + แชท) |
| AI | Google Gemini (`@google/generative-ai`) |
| บริการภายนอก | Cloudinary (รูปภาพ), SMTP ผ่าน Nodemailer (dev ใช้ Maildev) |
| เครื่องมือ | pnpm 11 workspace, Node 22, Docker Compose, ESLint + Prettier, Jest, Husky + lint-staged |

**อย่าเปลี่ยน tech stack และอย่าแก้ `schema.prisma` โดยไม่ถามทีมก่อน** — ดู [CLAUDE.md](CLAUDE.md)

---

## โครงสร้างโปรเจกต์

```
apps/
  web/                    Next.js — หน้าเว็บทั้งหมด (ผู้ซื้อ ผู้ขาย แอดมิน)
  api/                    NestJS — กติกาทั้งหมดของระบบอยู่ที่นี่
    prisma/               schema.prisma + migrations + seed
    src/                  24 modules (auth, auction, bid, live, cart, order, ai-tools, admin, ...)
packages/
  config/                 config ที่ใช้ร่วมกัน
  contracts/              type ที่ใช้ร่วมกันระหว่าง web กับ api
infra/docker/             compose.dev.yml — Postgres + Maildev สำหรับเครื่อง dev
scripts/                  dev.mjs, dev-preflight.mjs, check-setup.mjs
docs/                     SRS, ERD, ADR, ผัง workflow, คู่มือทีม
Dockerfile                image ของ apps/api สำหรับ deploy — build จากรากของ repo
```

เบราว์เซอร์ไม่คุยกับฐานข้อมูลหรือบริการภายนอกโดยตรง — ทุกอย่างผ่าน `apps/api` ชั้นเดียว

---

## เริ่มต้นใช้งาน

### ครั้งแรกในเครื่องนี้

ทำตาม [Setup เครื่องตัวเอง](docs/KICKOFF_GUIDE.md#setup-เครื่องตัวเอง--ทำครั้งแรกครั้งเดียว) — สรุปย่อคือ

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose -f infra/docker/compose.dev.yml up -d
pnpm --dir apps/api exec prisma migrate deploy
pnpm dev
```

ต้องมี **Node 22**, **pnpm 11** และ **Docker Desktop** ก่อน · ไฟล์ `.env` ไม่ขึ้น git ต้องกรอกค่าเองในเครื่อง
ตรวจว่าเครื่องพร้อมหรือยังด้วย `pnpm check:setup`

### ทุกวันที่เริ่มงาน

```bash
git switch dev && git pull
git switch feat/<module>-dev<เลข>    # branch ของตัวเอง
git merge dev
pnpm check
pnpm dev
```

รายละเอียดและกรณีที่ต้องรันเพิ่ม (มี migration ใหม่ / มี package ใหม่) อยู่ใน [DAILY_WORKFLOW.md](docs/DAILY_WORKFLOW.md)

---

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
| --- | --- |
| `pnpm dev` | รัน web (`:3000`) + api (`:4000`) พร้อมกัน |
| `pnpm dev:web` / `pnpm dev:api` | รันแยกทีละฝั่ง |
| `pnpm check` | typecheck ทั้งสองแอป + test + lint — **รันก่อนส่งงานทุกครั้ง** |
| `pnpm test` / `pnpm lint` | รันเฉพาะ test หรือเฉพาะ lint |
| `pnpm check:setup` | ตรวจว่าเครื่องมีของครบ (Node, pnpm, Docker, .env) |
| `docker compose -f infra/docker/compose.dev.yml up -d` | เปิด Postgres + Maildev |
| `pnpm --dir apps/api exec prisma migrate deploy` | อัปเดตตารางตาม migration ล่าสุด |
| `pnpm --dir apps/api exec prisma studio` | เปิดหน้าจอดูข้อมูลในฐานข้อมูล |
| `pnpm --dir apps/api seed:mock` | ใส่ข้อมูลตัวอย่างสำหรับทดสอบ |

**อ่านอีเมล/OTP ตอน dev:** เปิด Maildev ที่ <http://localhost:1080> — ระบบไม่ได้ส่งอีเมลออกจริงในเครื่อง dev

---

## Deploy

| ส่วน | ที่ไหน | branch |
| --- | --- | --- |
| `apps/api` | Railway (Docker) | `main` → production · `dev` → staging |
| `apps/web` | Vercel | `main` → production · `dev` → staging |
| PostgreSQL | Railway — service แยกใน project เดียวกับ api | — |

[`Dockerfile`](Dockerfile) ที่รากของ repo build เฉพาะ `apps/api` (`apps/web` ไม่ผ่าน Docker เลย)
build context ต้องเป็นรากของ repo เพราะ pnpm อ่าน workspace จาก lockfile ที่นั่น — ลองในเครื่องได้ด้วย

```bash
docker build -t bidnest-api .
docker run --rm -p 4000:4000 --env-file apps/api/.env bidnest-api
```

[`docker-entrypoint.sh`](docker-entrypoint.sh) รัน `prisma migrate deploy` ให้เองก่อน start ทุกครั้ง ตอน deploy จึงไม่ต้องรัน migration แยก

### ค่าตั้งของ production อยู่ใน dashboard ไม่ได้อยู่ใน repo

[`railway.json`](railway.json) **ไม่ได้ถูกอ่าน** — Config as Code ของ Railway ถูก deprecated และตั้งแต่ 2026-08-28 service ที่ไม่เคยใช้มาก่อน (รวมถึงของเรา) เปิดใช้ไม่ได้อีก ไฟล์นี้เก็บไว้เป็นบันทึกว่าควรตั้งอะไรบ้างเท่านั้น ของจริงต้องไปกดเองที่ Settings ของ service

| ช่อง | ค่า |
| --- | --- |
| Builder | `Dockerfile` — ค่า default คือ Railpack ซึ่ง build monorepo นี้ไม่ถูก |
| Root Directory | ปล่อยว่าง ไม่ใช่ `apps/api` |
| Healthcheck Path | `/health` |
| Watch Paths | `apps/api/**` `packages/**` `Dockerfile` `.dockerignore` `docker-entrypoint.sh` `package.json` `pnpm-lock.yaml` `pnpm-workspace.yaml` |
| Region | ให้ตรงกับ service Postgres ไม่งั้นทุก query วิ่งข้ามทวีป |
| Custom Start Command | **ปล่อยว่าง** — ถ้าใส่จะทับ `ENTRYPOINT` แล้ว migration จะไม่ถูกรัน |
| Wait for CI | ปิด — [ci.yml](.github/workflows/ci.yml) รันเฉพาะตอน `pull_request` ตอน push เข้า branch จะไม่มี check ให้รอ |

env ที่ระบบบังคับจริงมีแค่ `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` ที่เหลือมี default หมด (ดู [env.validation.ts](apps/api/src/config/env.validation.ts)) แต่ production ต้องตั้งเพิ่มอย่างน้อย

- `WEB_APP_URL` = โดเมนของ Vercel **ห้ามมี `/` ต่อท้าย** ไม่งั้น CORS บล็อกทั้งเว็บ
- `MAIL_*` = SMTP จริง ห้ามชี้ Maildev เด็ดขาด — หน้า dashboard ของมันโชว์ OTP ให้ใครก็ได้ที่เข้าถึงได้
- `ADMIN_SKIP_2FA` = ไม่ต้องใส่ ค่าที่ไม่มีคือปิด

### seed ข้อมูลตั้งต้น

image มี seed ที่ compile แล้วติดไปด้วย รันจากแท็บ Console ของ service ได้เลย ไม่ต้องเปิดฐานข้อมูลออกสู่ public

```bash
node apps/api/dist/prisma/seed.js
```

---

## เอกสาร

| เอกสาร | เนื้อหา |
| --- | --- |
| [SRS](docs/requirements/) | ข้อกำหนดและเกณฑ์การยอมรับของทุก requirement — **ยึดเป็นหลักเวลาตัดสินว่างานผ่านหรือไม่** |
| [ผัง Workflow](docs/architecture/workflows/) | ผังการทำงานทั้งระบบ 14 ผัง วาดจากโค้ดจริง |
| [ERD](docs/architecture/erd/bidnest-erd-v1.dbml) | โครงสร้างฐานข้อมูล ([ดูออนไลน์](https://dbdiagram.io/d/BidNest-6a803e3ee093539a9ebf8fff)) |
| [ADR](docs/architecture/adr/) | บันทึกการตัดสินใจเชิงสถาปัตยกรรมและเหตุผล |
| [Kickoff Guide](docs/KICKOFF_GUIDE.md) | ตั้งค่าเครื่อง, โครงสร้าง monorepo, CI, commit convention |
| [Daily Workflow](docs/DAILY_WORKFLOW.md) | คำสั่งที่ต้องรันทุกวัน และตอนจะส่งงาน |
| [Team Role](docs/team-role/) | ขอบเขตงานของแต่ละคน + แม่แบบ workflow ส่วนตัว |
| [CLAUDE.md](CLAUDE.md) | กติกาการทำงานร่วมของทีม (ใช้กับ Claude Code) |

**เครื่องมือทีม:** [Jira](https://pitchayauds.atlassian.net/jira/software/projects/BN/boards/2) · [Figma](https://www.figma.com/design/XjSmZZgT0IBPc8do84WaRa/Bidnest)

---

## การทำงานร่วมกัน

**Branch:** `feat/<module>-dev<เลข>` — `feat/frontend-dev1` · `feat/auth-dev2` · `feat/ecommerce-dev3` · `feat/auction-dev4` · `feat/ai-dev5`

**Commit:** `<type>(<requirement-id>): คำอธิบายภาษาอังกฤษสั้นๆ` เช่น `feat(AUTH-001): add local registration endpoint`
type ที่ใช้: `feat` `fix` `refactor` `test` `docs` `chore` `ci` — ใส่ requirement id เมื่อ commit ตรงกับ requirement ใน SRS

**Pull Request:** base branch เป็น `dev` เสมอ (ไม่ merge เข้า `main` โดยตรง) · title และ description เป็นภาษาอังกฤษ

**CI:** ทุก PR เข้า `dev` หรือ `main` จะรัน lint → test → build ฝั่ง web และ build Docker image ของ api อัตโนมัติ ([ci.yml](.github/workflows/ci.yml))

**ไฟล์ที่ต้องให้เจ้าของ approve ก่อน merge** (ดู [CODEOWNERS](.github/CODEOWNERS)): `CLAUDE.md`, `docs/requirements/`, `docs/architecture/`, `docs/team-role/`, `apps/api/prisma/`, `.github/`, `package.json`

**ห้าม commit ไฟล์ `.env` หรือ hardcode secret/API key ลงในโค้ดเด็ดขาด**

---

## ขอบเขต V1

เรื่องราวจบที่ประมูลปิดและของถูกส่ง — **ยังไม่มีการคืนเงินหรือยกเลิกหลังจ่ายเงินแล้ว**
สถานะ `SOLD` และ `UNSOLD` เป็นปลายทางจริง ไม่ย้อนกลับ ส่วนการชำระเงินเป็นการจำลอง ยังไม่ได้ต่อ payment gateway จริง
