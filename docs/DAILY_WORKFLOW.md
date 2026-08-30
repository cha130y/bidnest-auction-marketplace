# Workflow ประจำวัน (Daily Workflow)

คำสั่งที่ต้องรัน **ทุกครั้งที่เริ่มงาน** — แยกออกมาจาก `docs/KICKOFF_GUIDE.md` เพื่อให้เปิดดูซ้ำได้เร็ว ไม่ต้องเลื่อนผ่าน Step 1–7

> **ยังไม่เคย setup เครื่องนี้?** (เพิ่งเข้าทีม / เครื่องใหม่ / ยังไม่เคย clone) ไปทำ [Setup เครื่องตัวเอง — ทำครั้งแรกครั้งเดียว](KICKOFF_GUIDE.md#setup-เครื่องตัวเอง--ทำครั้งแรกครั้งเดียว) ใน KICKOFF_GUIDE ให้จบก่อน แล้วค่อยกลับมาหน้านี้
>
> เนื้อหาหน้านี้เหมือนหัวข้อ "Workflow ประจำวัน" ใน `docs/KICKOFF_GUIDE.md` ทุกอย่าง — **แก้ที่ไหนต้องแก้อีกไฟล์ให้ตรงกันด้วย**

---

## เริ่มงาน

เปิดเครื่องมาทำงานวันใหม่ หรือกลับมาทำต่อหลังพักไป ให้รันชุดนี้ก่อนเขียนโค้ด

```bash
git switch dev && git pull
git switch feat/auction-dev4   # <-- เปลี่ยนเป็น branch ของตัวเอง
git merge dev
pnpm check
pnpm dev
```

**ชื่อ branch ของแต่ละคน:** `feat/frontend-dev1` · `feat/auth-dev2` · `feat/ecommerce-dev3` · `feat/auction-dev4` · `feat/ai-dev5`

**✅ เสร็จเมื่อ:** `pnpm check` ผ่านหมด และ `pnpm dev` รันได้ทั้ง web และ api

---

## รันเพิ่มเฉพาะตอนเข้าเงื่อนไข

3 คำสั่งนี้ไม่ต้องรันทุกวัน รันเมื่อเจอเงื่อนไขเท่านั้น (ปกติเจอหลัง `git merge dev`) — รันคำสั่งเช็คนี้ก่อนได้เลย

```bash
# เช็คว่า merge เมื่อกี้มีอะไรเข้ามาบ้าง (มีชื่อไฟล์ขึ้น = ต้องรันคำสั่งด้านล่างที่ตรงกับไฟล์นั้น)
git diff --name-only HEAD@{1} HEAD -- pnpm-lock.yaml apps/api/prisma/migrations
```

```bash
# เห็น pnpm-lock.yaml ขึ้นมา = มีคนเพิ่ม/อัปเดต package
pnpm install

# เห็นไฟล์ใน apps/api/prisma/migrations/ ขึ้นมา = มี migration ใหม่จากคนอื่น
pnpm --dir apps/api exec prisma migrate deploy

# ต่อ database ไม่ได้ / เพิ่งรีสตาร์ทเครื่องแล้ว Docker Desktop ยังไม่ขึ้น
docker compose -f infra/docker/compose.dev.yml up -d
```

---

## ทำไมต้องทำแบบนี้

**ทำไมต้อง merge `dev` เข้ามาทุกครั้ง:** branch ของแต่ละคนแตกไว้ตั้งแต่วัน Kickoff — ถ้าคนอื่น push งานเข้า `dev` ไปแล้วหลังจากนั้น (เช่น Dev 2 ทำ auth เสร็จ) แต่ไม่ merge เข้ามา จะยังทำงานอยู่กับโค้ดเก่า เชื่อมต่อของจริงที่คนอื่นทำไว้ไม่ได้เลย

**ทำไมต้องรัน `pnpm check` หลัง merge:** `git merge` สำเร็จแค่บอกว่าไม่มี conflict ระดับบรรทัด ไม่ได้การันตีว่าโค้ดยังทำงานถูก (เช่นมีคน rename ฟังก์ชันที่อีกไฟล์หนึ่งยังเรียกชื่อเดิมอยู่ merge ผ่านสนิทแต่พังตอนรัน) และ merge แบบ local นี้ CI ไม่รันให้ (CI รันเฉพาะตอนเปิด PR) — `pnpm check` รวม typecheck ของ apps/api + apps/web, `pnpm test`, และ `pnpm lint` ไว้คำสั่งเดียว ให้รู้ทันทีว่ามีอะไรพังก่อนจะเขียนโค้ดทับต่อ

---

## ตอนจะส่งงาน

```bash
git add -A
git commit -m "feat(AUC-001): add auction listing endpoint"   # <-- <type>(<requirement-id>): คำอธิบายภาษาอังกฤษ
git push -u origin feat/auction-dev4                          # <-- branch ของตัวเอง
```

จากนั้นเปิด PR โดย **base branch ต้องเป็น `dev` เสมอ** (ห้าม push ตรงเข้า `main` หรือ `dev` และห้าม commit ไฟล์ `.env` หรือ secret) — รูปแบบ commit message เต็มๆ ดูที่ [Commit Message Convention](KICKOFF_GUIDE.md#commit-message-convention)

---

## ตอนจะปล่อยขึ้น production

งานประจำวันจบที่ `dev` — การเลื่อนงานจาก `dev` ขึ้น `main` เป็นคนละเรื่องและ **ไม่มี automation ตัวไหนทำให้** ต้องเปิด release PR เองทุกรอบ

```bash
# เช็คว่ามีอะไรค้างรอปล่อยบ้าง (อ่านอย่างเดียว ไม่ได้สร้าง PR)
git fetch origin
git log --merges --pretty='- %s' origin/main..origin/dev
```

มีรายการขึ้นมา = มีของรอปล่อย ทำตาม [`docs/RELEASE_GUIDE.md`](RELEASE_GUIDE.md) ต่อ (6 ขั้นที่คนกด + 2 ช่วงที่เครื่องทำเอง)
