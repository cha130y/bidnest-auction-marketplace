# คู่มือเริ่มต้นโปรเจค (Kickoff Guide)

อ้างอิงจาก SRS v1.0 และ Team Role Distribution — ทำตามลำดับนี้ได้เลย แต่ละ step มีคำสั่งจริงให้ copy ไปรันตรงๆ

**ผู้รับผิดชอบ Step 1–4 และ 6: Dev 2** (ตามที่ระบุใน Team Role Distribution ว่าเป็นเจ้าของ "NestJS setup, ออกแบบ Prisma schema หลักและดูแล migration ให้ทั้งทีม")
**Step 5 (Jira):** ไม่ผูกกับ role ใครโดยเฉพาะ ทำคู่ขนานกับ Step 2–4 ได้เลย ใครสะดวกก็ทำได้
**Step 7:** ทุกคนเริ่มพร้อมกัน

ชื่อโปรเจค: **BidNest — Auction & Marketplace** · ชื่อ repo: `bidnest-auction-marketplace` · ใช้ slug `bidnest` สำหรับชื่อ DB/service ภายใน

---

## Step 1 — ตั้งค่า Git Repository

**ผู้รับผิดชอบ: Dev 2**

```bash
# สร้าง repo บน GitHub ก่อน (ผ่านเว็บ ตั้งเป็น Private) แล้ว clone
git clone https://github.com/<org>/bidnest-auction-marketplace.git
cd bidnest-auction-marketplace

# ไฟล์เริ่มต้น
cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
dist/
.next/
coverage/
EOF

echo "# BidNest — Auction & Marketplace" > README.md

git add .
git commit -m "chore: initial commit"
git push origin main

# สร้าง dev branch
git checkout -b dev
git push origin dev
```

**ตั้งค่า branch protection (ทำผ่านหน้าเว็บ GitHub):**

- [ ] Settings → Branches → Add rule สำหรับ `main`: Require pull request before merging, Require 1 approval
- [ ] ทำซ้ำสำหรับ `dev`

**สร้าง feature branch ให้แต่ละคน:**

```bash
git checkout dev
git checkout -b feat/auth-dev2      && git push origin feat/auth-dev2
git checkout dev && git checkout -b feat/frontend-dev1  && git push origin feat/frontend-dev1
git checkout dev && git checkout -b feat/ecommerce-dev3 && git push origin feat/ecommerce-dev3
git checkout dev && git checkout -b feat/auction-dev4   && git push origin feat/auction-dev4
git checkout dev && git checkout -b feat/ai-dev5        && git push origin feat/ai-dev5
```

**✅ เสร็จเมื่อ:** ทุกคน clone repo ได้ และมี branch ของตัวเองพร้อมใช้งาน

---

## Step 2 — Scaffold โครงสร้าง Monorepo

**ผู้รับผิดชอบ: Dev 2**

```bash
git checkout dev
npm install -g pnpm   # ถ้ายังไม่มี

mkdir -p apps packages
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF
pnpm init   # สร้าง package.json ที่ root ไว้ใส่ script รวม/config เครื่องมือส่วนกลาง

# Next.js app
cd apps
pnpm create next-app@latest web --typescript --tailwind --app --src-dir --import-alias "@/*"

# NestJS app
pnpm dlx @nestjs/cli new api --package-manager pnpm
cd ..

# create-next-app และ nest new มักสร้าง .git ซ้อนไว้ในตัวเองอัตโนมัติ
# ลบทิ้งก่อน ไม่งั้น "git add ." จากข้างนอกจะ error เพราะเห็นเป็น repo ซ้อน repo
rm -rf apps/web/.git apps/api/.git

# shared packages
mkdir -p packages/contracts packages/config
cd packages/contracts && pnpm init && cd ../..
cd packages/config && pnpm init && cd ../..

# Husky + lint-staged (บังคับ lint ตอน commit) + concurrently (รัน dev server 2 ฝั่งพร้อมกันได้)
pnpm add -D husky lint-staged concurrently -w
pnpm exec husky init
```

แก้ไฟล์ `.husky/pre-commit` (Husky สร้างให้อัตโนมัติ แต่ค่าเริ่มต้นรัน `pnpm test` — แก้เป็นรัน lint-staged แทน):

```bash
pnpm exec lint-staged
```

เพิ่ม config ท้าย `package.json` ที่ root (config ของ lint-staged + shortcut คำสั่งรัน dev server ให้พิมพ์สั้นลง):

```json
{
  "scripts": {
    "dev:web": "pnpm --dir apps/web dev",
    "dev:api": "pnpm --dir apps/api start:dev",
    "dev": "concurrently \"pnpm dev:web\" \"pnpm dev:api\""
  },
  "lint-staged": {
    "apps/web/**/*.{ts,tsx}": ["pnpm --dir apps/web exec eslint --fix"],
    "apps/api/**/*.ts": ["pnpm --dir apps/api exec eslint --fix"]
  }
}
```

**ทำไม `eslint --fix` เฉยๆ ใช้ไม่ได้:** pnpm ไม่ hoist package ขึ้น root แบบ npm/yarn — `eslint` ที่ `create-next-app`/`nest new` ติดตั้งให้ อยู่ใน `apps/web/node_modules/.bin/` และ `apps/api/node_modules/.bin/` เท่านั้น ไม่ได้อยู่ที่ root เลย ต้องเรียกผ่าน `pnpm --dir <app> exec eslint` เพื่อให้ไปหยิบ eslint (พร้อม config) ของแอปนั้นๆ โดยตรง (lint-staged ส่ง path แบบ absolute เสมอ สลับ cwd ด้วย `--dir` จึงไม่ทำให้ path ผิดเพี้ยน)

```bash
git add .
git commit -m "chore: scaffold monorepo structure"
git push origin dev
```

**✅ เสร็จเมื่อ:** รัน `pnpm install` ที่ root แล้ว `pnpm dev:web` และ `pnpm dev:api` ใช้งานได้ทั้งคู่โดยไม่ error (หรือรัน `pnpm dev` ตัวเดียวเปิดทั้งคู่พร้อมกันในเทอร์มินัลเดียว) — ลองแก้โค้ดให้ lint error ตั้งใจ แล้ว `git commit` ดู ต้องถูกบล็อกอัตโนมัติก่อนจะ commit สำเร็จ

---

## Step 3 — ตั้งค่า Docker Compose (Postgres + Maildev)

**ผู้รับผิดชอบ: Dev 2**

```bash
mkdir -p infra/docker
```

สร้างไฟล์ `infra/docker/compose.dev.yml`:

```yaml
services:
  postgres:
    image: postgres:17

    environment:
      POSTGRES_DB: bidnest_db
      POSTGRES_USER: bidnest
      POSTGRES_PASSWORD: dev_password

    ports:
      - '127.0.0.1:5433:5432'

    volumes:
      - pg_data:/var/lib/postgresql/data

    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U bidnest']

  maildev:
    image: maildev/maildev
    ports:
      - '127.0.0.1:1080:1080'
      - '127.0.0.1:1025:1025'

volumes:
  pg_data:
```

สร้างไฟล์ `.env.example` ที่ root:

```
DATABASE_URL="postgresql://bidnest:dev_password@localhost:5433/bidnest_db"
MAIL_HOST=localhost
MAIL_PORT=1025
AUTH_SECRET="dev-only-change-in-production"
```

```bash
cp .env.example .env
docker compose -f infra/docker/compose.dev.yml up -d
docker compose -f infra/docker/compose.dev.yml ps   # เช็คว่า healthy ทั้ง 2 service

git add infra/docker/compose.dev.yml .env.example
git commit -m "chore: add docker compose for postgres + maildev"
git push origin dev
```

**✅ เสร็จเมื่อ:** เปิด http://localhost:1080 เห็นหน้า Maildev และเชื่อมต่อ Postgres ที่ port 5433 ได้

---

## Step 4 — ตั้งค่า Prisma และ Schema เริ่มต้น

**ผู้รับผิดชอบ: Dev 2**

```bash
cd apps/api
pnpm add -D prisma
pnpm add @prisma/client
pnpm dlx prisma init
```

แก้ `apps/api/prisma/schema.prisma` — เริ่มจากส่วน Identity + Category ที่ทุกคนรอใช้ก่อน (ตัวอย่างย่อ ขยายตาม SRS §5.1 ทีหลัง):

```prisma
model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String?
  displayName  String
  role         Role      @default(USER)
  createdAt    DateTime  @default(now())
}

enum Role {
  USER
  ADMIN
}

model Category {
  id     String        @id @default(uuid())
  name   String
  scope  CategoryScope
  active Boolean       @default(true)
}

enum CategoryScope {
  AUCTION
  ECOMMERCE
  BOTH
}
```

```bash
pnpm dlx prisma migrate dev --name init_identity_and_categories
cd ../..

git add .
git commit -m "feat: initial prisma schema (identity + categories)"
git push origin dev
```

**✅ เสร็จเมื่อ:** `prisma migrate dev` รันผ่านไม่ error และเปิด `prisma studio` เห็นตาราง User/Category จริง

---

## Step 5 — สร้าง Jira Project และ Backlog

**ผู้รับผิดชอบ: ยืดหยุ่น (ไม่ผูก role) — ทำคู่ขนานกับ Step 2–4 ได้เลย**

- [ ] สร้าง Jira project (Scrum หรือ Kanban ตามทีมถนัด)
- [ ] สร้าง Epic 5 ตัว: `Authentication`, `Auction`, `E-commerce`, `AI Features`, `Admin`
- [ ] แตก Story จาก requirement ID ใน SRS ตรงๆ เช่น `AUTH-001` ถึง `AUTH-008` เป็น 8 story ใน Epic Authentication
- [ ] Epic AI Features: ตั้ง `AI-001` (Customer Service Chatbot) เป็น priority บังคับ, `AI-002`/`AI-003` เป็น Optional/stretch แยกไว้ชัดเจน
- [ ] มอบหมาย assignee ตามตารางภาพรวมใน Team Role Distribution
- [ ] ตั้ง Sprint แรก ให้ story ของ Dev 2 (auth พื้นฐาน) เป็น priority สูงสุด

**✅ เสร็จเมื่อ:** ทุกคนเห็น backlog ของตัวเองใน Jira และรู้ว่า story แรกที่ต้องทำคืออะไร

---

## Step 6 — ตั้งค่า CI พื้นฐาน (Lint + Test บน PR)

**ผู้รับผิดชอบ: Dev 2**

สร้างไฟล์ `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
    branches: [main, dev]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
```

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint + test workflow"
git push origin dev
```

ตั้งค่าเพิ่ม (GitHub Settings → Branches → `main`): Require status checks to pass → เลือก `lint-and-test`

**✅ เสร็จเมื่อ:** เปิด PR ทดสอบ 1 อัน แล้วเห็นสถานะ CI ขึ้นจริง (เขียว/แดง) ที่ท้าย PR

---

## Step 7 — Kickoff ทีมและเริ่มงานคู่ขนาน

**ผู้รับผิดชอบ: ทุกคน พร้อมกัน**

```bash
# Dev 2 — เริ่ม auth พื้นฐานก่อนใคร (critical path)
git checkout feat/auth-dev2
# เริ่มทำ: AUTH-001 (local registration) → AUTH-002 (local login) → AUTH-004 (refresh session)

# Dev 1 — เริ่มคู่ขนานได้เลย ไม่ต้องรอ auth
git checkout feat/frontend-dev1
# เริ่มทำ: Design System (Shadcn-UI setup, layout, shared components)

# Dev 3 — scaffold โครงสร้างโมดูล E-commerce (mock auth ไปก่อน)
git checkout feat/ecommerce-dev3
# เริ่มทำ: routes/DTO เปล่าสำหรับ PROD-001..007, CART-001..005

# Dev 4 — scaffold โครงสร้างโมดูล Auction (mock auth ไปก่อน)
git checkout feat/auction-dev4
# เริ่มทำ: routes/DTO เปล่าสำหรับ AUC-001..008

# Dev 5 — scaffold AI-001 Customer Service Chatbot (feature บังคับ ทำก่อน AI-002/003)
git checkout feat/ai-dev5
# เริ่มทำ: endpoint /support/chat เปล่า + โครง Admin Dashboard
```

**กติกาตลอดโปรเจค:**

- [ ] ห้าม push ตรงเข้า `main` หรือ `dev` — merge ผ่าน PR เท่านั้น (ตาม branch protection ที่ตั้งไว้ Step 1)
- [ ] PR ต้องผ่าน CI (Step 6) และมี approve อย่างน้อย 1 คนก่อน merge
- [ ] พอ Dev 2 ทำ auth พื้นฐานเสร็จ (AUTH-001/002/004) ให้แจ้งทีมทันทีเพื่อให้ Dev 3/4/5 เริ่มเชื่อมต่อ auth จริงแทน mock

**✅ เสร็จเมื่อ:** ทุกคนมี branch ของตัวเอง เริ่มโค้ดจริงได้ และรู้ชัดว่าอะไรคือ blocker ที่ต้องรอ (auth พื้นฐานจาก Dev 2)
