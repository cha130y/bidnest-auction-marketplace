# คู่มือปล่อยงานขึ้น Production (Release Guide)

ขั้นตอนเลื่อนงานจาก `dev` ขึ้น `main` — ทำเฉพาะตอนจะปล่อยของขึ้น production **ไม่ใช่งานประจำวัน**

> **งานประจำวัน** (เริ่มงาน / commit / เปิด PR เข้า `dev`) อยู่ที่ [`docs/DAILY_WORKFLOW.md`](DAILY_WORKFLOW.md)
> ไฟล์นี้เริ่มต่อจากจุดที่ PR ของทุกคน merge เข้า `dev` เรียบร้อยแล้ว

**`main` คือ production** — Railway (API) กับ Vercel (Web) deploy ทันทีที่ `main` ขยับ และ **ไม่มี automation ตัวไหน merge `dev` เข้า `main` ให้** ต้องเปิด release PR เองทุกรอบ

---

## ภาพรวม

```
feat/<module>-devN  --PR-->  dev  --release PR-->  main  --auto-->  Railway + Vercel
      (คนกด)                     (คนกด)                  (อัตโนมัติ)
```

รวมทั้งหมด **6 ขั้นที่คนกด** + **2 ช่วงที่เครื่องทำให้เอง** (Step 4 และ Step 7)

---

## Step 1 — เช็คว่ามีอะไรค้างรอปล่อยบ้าง

```bash
# อ่านอย่างเดียว ไม่ได้สร้าง PR — รันกี่รอบก็ได้
git fetch origin
git log --merges --pretty='- %s' origin/main..origin/dev
```

ได้รายการ PR ที่ `dev` มีแต่ `main` ยังไม่มี — ก๊อปเก็บไว้ใช้ต่อใน Step 2

```bash
# อยากดูละเอียดถึงระดับ commit แทนที่จะเป็นราย PR
git log --no-merges --pretty='- %s' origin/main..origin/dev
```

**✅ เสร็จเมื่อ:** มีรายการ PR ขึ้นมาบนจอ

**ไม่มีอะไรขึ้นเลย** = `main` ตามทัน `dev` แล้ว รอบนี้ไม่ต้องปล่อย จบแค่นี้

---

## Step 2 — เปิด release PR

เปิดหน้า compare ใน browser

```
https://github.com/cha130y/bidnest-auction-marketplace/compare/main...dev
```

ตรวจให้แน่ใจว่าหัวหน้าเพจเป็น **`base: main` ← `compare: dev`** และขึ้นว่า **Able to merge**

**Title** — ใช้โครงเดิมของทีม ใส่ `(<REQUIREMENT-ID>)` ได้ถ้ารอบนั้นเป็น requirement เดียวล้วน

```
chore: release dev to main - <สรุปสั้นๆ ว่ารอบนี้มีอะไร>
```

```
chore(AI-001): release dev to main - support chat fixes and a wider FAQ
```

> ระวังอย่าให้มีเว้นวรรคเกินหน้า `:` เพราะ title นี้จะกลายเป็น **merge commit message บน `main`** ถ้าเว้นวรรคเกินจะหลุดรูปแบบ commit ของทีม

**Description** — สั้น 2–3 บรรทัดพอ รายละเอียดอยู่ใน PR ลูกอยู่แล้ว เอารายการจาก Step 1 มาวาง พิมพ์ `#153` เฉยๆ GitHub จะทำลิงก์ให้เอง

```markdown
Promotes `dev` to `main`. Two PRs since the last release (#152).

- #153 — AI-001: support chat fixes and a wider FAQ
- #154 — AUC-004: fix the closing job timezone
```

**✅ เสร็จเมื่อ:** กด Create pull request แล้ว PR ขึ้นมา

---

## Step 3 — กด Update branch ทันที (อย่ารอ CI)

ถ้าท้าย PR ขึ้นแถบ **"This branch is out-of-date with the base branch"** ให้กดปุ่ม **Update branch** ทันที **ไม่ต้องรอ 3 job ที่กำลังรันอยู่**

> ⚠️ **ห้ามเลือก "Update with rebase"** — ใช้ **"Update with merge commit"** ซึ่งเป็นค่าเริ่มต้นเท่านั้น
> `dev` เป็น branch ที่ทั้ง 5 คนใช้ร่วมกัน การ rebase จะเขียนประวัติใหม่ทั้งเส้น แล้ว `dev` ในเครื่องทุกคนจะพังพร้อมกัน

ไม่ขึ้นแถบนี้ = `dev` ตามทัน `main` อยู่แล้ว ข้ามไป Step 4 ได้เลย

**✅ เสร็จเมื่อ:** แถบ out-of-date หายไป และ CI เริ่มรันรอบใหม่

---

## Step 4 — รอ CI (อัตโนมัติ · ราว 4 นาที)

ไม่ต้องทำอะไร รอ 3 job นี้เขียวครบ ทั้งสามตัวติดป้าย **Required** ถ้าตัวใดตัวหนึ่งแดง ปุ่ม merge จะกดไม่ได้

| Job | ตรวจอะไร |
|---|---|
| `lint-and-test` | lint, unit test และ build ของ `apps/web` — จับ Server Component ที่ build ไม่ผ่าน ซึ่งไม่โผล่ตอน dev |
| `docker-build` | image ของ API ยัง build ได้อยู่มั้ย (build อย่างเดียว ไม่ push) — Dockerfile คือ production code ที่ lint กับ test ไม่เคยเปิดอ่าน |
| `e2e` | รัน API จริงกับ Postgres 17 + MailDev จริง ผ่าน `migrate deploy` → `db seed` → `test:e2e` — จับ migration ที่ apply ไม่ผ่าน |

check ชื่อ **Vercel** ที่เขียวอยู่เป็น preview deploy ของ frontend คนละสายกับ CI สามตัวนี้ และไม่ใช่ตัวบังคับ

**✅ เสร็จเมื่อ:** ขึ้น "All checks have passed"

**ถ้าแดง:** อ่าน log ของ job ที่แดง แก้บน branch ต้นทาง เปิด PR เข้า `dev` ตามปกติ แล้วกลับมาเริ่มที่ Step 1 ใหม่ — **ห้ามแก้บน `dev` ตรงๆ**

---

## Step 5 — ขอ approve จากเพื่อนในทีม 1 คน

branch protection บังคับ `required_approving_review_count: 1` — กด merge เองคนเดียวไม่ได้

เลือกคนที่งานรอบนั้นเป็นของเขาจะดีที่สุด เพราะเขารู้ว่าต้องดูตรงไหน

> ตั้ง `dismiss_stale_reviews: false` ไว้ — ถ้าเพื่อน approve แล้วมีคนกด Update branch ทีหลัง approval **จะไม่ถูกล้าง** ไม่ต้องไปรบกวนขอใหม่

**✅ เสร็จเมื่อ:** มีเครื่องหมายถูกเขียวข้างชื่อคน approve

---

## Step 6 — กด Merge pull request

ใช้ปุ่ม **Merge pull request** (merge commit) ตามที่ทีมทำมาตลอด

**ไม่ใช้ Squash and merge** เพราะจะยุบงานของทุกคนในรอบนั้นเหลือ commit เดียว แล้วสาวกลับไม่ได้ว่า PR ไหนแก้อะไร

**✅ เสร็จเมื่อ:** PR ขึ้นสถานะ Merged สีม่วง

---

## Step 7 — Railway และ Vercel deploy (อัตโนมัติ)

ไม่ต้องทำอะไร ทั้งสองเจ้าเห็น `main` ขยับแล้วเริ่มเอง

- **Railway → `apps/api`** build image ตาม [`Dockerfile`](../Dockerfile) พอ container บูต [`docker-entrypoint.sh`](../docker-entrypoint.sh) จะรัน `prisma migrate deploy` ให้ก่อนเสมอ — **ไม่ต้องไป migrate เองด้วยมือ**
- **Vercel → `apps/web`** build Next.js เอง คนละสายกับ Railway โดยสิ้นเชิง `apps/web` ไม่เคยผ่าน Docker image เลย

> ⚠️ **`railway.json` ที่รากรีโปไม่ใช่ตัวที่ Railway อ่าน**
>
> ไฟล์นั้นเขียน `builder`, `healthcheckPath` และ `restartPolicy` ไว้ก็จริง แต่ค่าที่ใช้จริงตอน deploy อยู่ที่ **Settings ของ service บน Railway dashboard** แก้ไฟล์แล้ว commit ขึ้นไปจะไม่มีอะไรเปลี่ยน และไม่มี error บอกด้วย
>
> ถ้าต้องแก้ builder หรือ health check ให้ไปแก้ที่:
>
> ```
> Railway → project BidNest → service ของ API → Settings
> ```

CI จะรันซ้ำอีกรอบบน `main` ด้วย เป็นด่านสุดท้ายก่อนของจริงออก

**✅ เสร็จเมื่อ:** Railway ขึ้น Deployment successful

---

## Step 8 — ตรวจว่า production ยังหายใจอยู่

หาโดเมนจริงของ API ก่อน — **ไม่ได้อยู่ในรีโป** ต้องเปิดจาก dashboard

```
Railway → project BidNest → service ของ API
→ Settings → Networking → Public Networking
```

แล้วยิง health check จากเครื่องตัวเอง (จะเปิดใน browser แทนก็ได้ ผลเหมือนกัน)

```bash
# Git Bash — เปลี่ยน <railway-domain> เป็นโดเมนจริงที่ copy มาจาก Railway
curl https://<railway-domain>/health
```

```powershell
# PowerShell — curl ใน PowerShell เป็น alias ของ Invoke-WebRequest ไม่ใช่ curl ตัวจริง
Invoke-RestMethod https://<railway-domain>/health
```

**✅ เสร็จเมื่อ:** ได้ผลลัพธ์ **เป๊ะแบบนี้** เท่านั้น

```json
{"status":"ok"}
```

> ได้อย่างอื่นที่ไม่ใช่ `{"status":"ok"}` = **ยิงผิดเซิร์ฟเวอร์** ไม่ใช่ API ของเรา ให้กลับไปเอาโดเมนจาก Railway dashboard ใหม่
> รูปแบบนี้มาจาก `apps/api/src/health/health.controller.ts` ถ้าวันไหนแก้ endpoint นั้น ให้แก้บรรทัดนี้ตามด้วย

```bash
# รอบไหนมี migration ติดไปด้วย — เปิด deploy log ของ Railway หาบรรทัดนี้ว่าผ่านจริง
==> prisma migrate deploy
```

ปิดท้ายด้วยการลองกดใช้ฟีเจอร์ที่เพิ่งปล่อยสัก 1 อย่างบนเว็บจริง

---

## กับดักที่เจอบ่อย

**1. รอ CI จบก่อนค่อยกด Update branch**
เสียเวลาฟรีหนึ่งรอบเต็ม เพราะ commit ที่กำลังเทสอยู่ไม่ใช่ commit ที่จะ merge จริง กด Update ก่อนแล้วรอรอบเดียวจบ

**2. เผลอเลือก Update with rebase**
เขียนประวัติ `dev` ใหม่ทั้งเส้น ทุกคนที่มี `dev` ในเครื่องต้องมานั่งแก้พร้อมกัน ใช้ merge commit เท่านั้น

**3. เปิด PR จาก feature branch เข้า `main` ตรงๆ**
ผิดกติกาใน `CLAUDE.md` — feature branch ต้องเข้า `dev` เสมอ มีแค่ release PR เท่านั้นที่ base เป็น `main` ได้

**4. ดองงานใน `dev` นานเกินไป**
รวบหลาย PR ไม่ได้ทำให้ merge ยากขึ้นเลย (`dev` เป็น superset ของ `main` จึงแทบไม่มีทาง conflict) แต่ถ้า production พังจะไล่ไม่ถูกว่าตัวไหนทำ และ rollback จะลากงานที่ไม่ผิดกลับไปด้วย — เกิน 6–8 PR เมื่อไหร่ควรปล่อยได้แล้ว

**5. รอบที่มี migration ปนไปกับ feature ธรรมดา**
migration ย้อนกลับยากที่สุดในบรรดาของทั้งหมด ถ้ารอบไหนแตะ `apps/api/prisma/schema.prisma` ควรปล่อยแยกก้อน จะได้รู้ทันทีว่าถ้าพังเป็นเพราะอะไร

**6. เชื่อ health check ที่ไม่ได้เช็คว่าเป็นของเรา**
โดเมน Railway เป็นชื่อสาธารณะที่ใครก็จองได้ ยิงผิดตัวแล้วได้ 200 กลับมาเหมือนกัน ต้องดูว่า response เป็น `{"status":"ok"}` เป๊ะๆ เท่านั้น และ**ห้ามเอาโดเมนที่ไม่แน่ใจไปใส่ `NEXT_PUBLIC_API_URL`** เพราะจะกลายเป็นส่งรหัสผ่านผู้ใช้ไปให้เซิร์ฟเวอร์ที่เราไม่รู้จัก

---

## กติกาที่ตั้งไว้บน `main`

ค่าจริงจาก branch protection ของ repo

| กติกา | ค่า | แปลว่า |
|---|---|---|
| Required checks | `lint-and-test`, `docker-build`, `e2e` | ต้องเขียวครบสามตัวถึงกด merge ได้ |
| Strict (up-to-date) | เปิด | ต้องกด Update branch ทุกครั้งที่ตามหลัง `main` |
| Approvals | 1 คน | กด merge เองคนเดียวไม่ได้ |
| Dismiss stale reviews | ปิด | push ใหม่แล้ว approval เดิมยังอยู่ |
| Force push / delete | ปิดทั้งคู่ | ลบหรือทับ `main` ไม่ได้ |
| Enforce on admins | ปิด | admin ยัง push ตรงเข้า `main` ได้ — **อย่าใช้ทางลัดนี้** |

```bash
# อยากเช็คค่าปัจจุบันเองเมื่อไหร่ก็ได้ (ต้องติดตั้ง gh CLI และ login แล้ว)
gh api repos/cha130y/bidnest-auction-marketplace/branches/main/protection
```

---

## ทำไมต้องทำแบบนี้

**ทำไม `dev` → `main` ถึงไม่ทำให้เป็นอัตโนมัติ:** เพราะ `main` deploy ขึ้น production ทันทีที่ขยับ ถ้า auto-merge จาก `dev` ทุกครั้ง ก็เท่ากับทุก PR ที่เข้า `dev` จะยิงขึ้น production เลย ซึ่งขัดกับจุดประสงค์ของการมี `dev` เป็นด่านกลาง การให้คนกดเองคือจุดที่เราเลือกได้ว่า "รอบนี้พร้อมออกหรือยัง"

**ทำไมต้องกด Update branch ก่อนรอ CI:** branch protection ตั้ง `strict: true` ไว้ ยังไงก็ merge ไม่ได้ถ้ายังตามหลัง `main` และการกด Update branch จะ push commit ใหม่ ทำให้ CI รีสตาร์ตใหม่หมดอยู่ดี — รอให้จบก่อนค่อยกด คือทิ้ง CI ไปเปล่าๆ หนึ่งรอบ

**ทำไม CI ต้องมีถึง 3 job:** `lint` กับ `test` รันบน Node ของ runner และไม่เคยเปิด `Dockerfile` เลย — dependency ที่ต้องการ system package เพิ่ม หรือ path ที่ย้าย จะไม่มีใครจับได้จนกว่าจะ deploy พัง ส่วน `e2e` เป็น job เดียวที่รัน API กับ database จริง ทำให้ migration ที่ apply ไม่ผ่านโผล่ที่นี่แทนที่จะโผล่ตอน container บูตใน production

**ทำไมไม่ใช้ squash merge:** รอบหนึ่งอาจมีงานของ 3–4 คนปนกัน squash แล้วจะเหลือ commit เดียวบน `main` ทำให้ `git log` ไม่บอกว่าใครแก้อะไร และเวลาต้อง revert เฉพาะงานของคนใดคนหนึ่งจะทำไม่ได้

---

## เอกสารที่เกี่ยวข้อง

- [`docs/DAILY_WORKFLOW.md`](DAILY_WORKFLOW.md) — งานประจำวัน เริ่มงาน / ส่งงานเข้า `dev`
- [`docs/KICKOFF_GUIDE.md`](KICKOFF_GUIDE.md) — setup เครื่องครั้งแรก, ตั้งค่า branch protection, CI/CD
- `CLAUDE.md` — กติกาชื่อ branch, commit message, PR

**ไฟล์ในรีโปที่เอกสารนี้อ้างถึง** — ถ้าไฟล์พวกนี้เปลี่ยน ให้อัปเดตเอกสารนี้ตามด้วย

- `.github/workflows/ci.yml` — นิยามของ 3 job ใน Step 4
- `railway.json` — `builder: DOCKERFILE`, `healthcheckPath: /health`
- `Dockerfile` และ `docker-entrypoint.sh` — สิ่งที่เกิดขึ้นใน Step 7
- `apps/api/src/health/health.controller.ts` — response ที่คาดหวังใน Step 8
