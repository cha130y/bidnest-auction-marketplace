# Dev 4 — Auction Workflow (แม่แบบ slash command)

> **เจ้าของแนวทาง:** Dev 4 (Auction Module & Real-time)
> **ไฟล์นี้คืออะไร:** สำเนาของ slash command ส่วนตัว `/dev4` ที่ใช้อยู่จริง เอาขึ้น repo ไว้เป็น **แม่แบบให้เพื่อนในทีมก็อปไปปรับเป็นของตัวเอง**
> **ไม่ใช่กติกาทีม** — กติกาที่ทั้งทีมยึดร่วมกันอยู่ใน `CLAUDE.md` เท่านั้น ไฟล์นี้เป็นแนวทางส่วนบุคคล ปรับได้ตามใจ
> **ใช้คู่กับ:** [`dev4-commit-workflow.md`](./dev4-commit-workflow.md) — ไฟล์นี้ครอบแค่ **build + test** แล้วจบที่คำถาม "พร้อม commit หรือยัง" ส่วนขั้นตอน **ship** (commit / push / PR) อยู่ในอีกไฟล์
> **อ้างอิง:** SRS v6, Team Role Distribution v2

---

## วิธีนำไปใช้

1. สร้างไฟล์ `.claude/commands/<ชื่อที่อยากเรียก>.md` ในเครื่องตัวเอง (เช่น `dev3.md`)
2. ก็อปเนื้อหาในบล็อกข้างล่างไปวาง แล้วแก้ให้ตรงกับ requirement / module ของตัวเอง
   - เปลี่ยน `description:` ใน frontmatter
   - เปลี่ยนรายการ requirement ในหัวข้อ "ลำดับ requirement"
   - เปลี่ยน/ตัด "กติกาการเขียนโค้ด" ข้อที่เป็นเรื่องเฉพาะฝั่ง auction (ข้อ 4–6)
3. เรียกใช้ด้วย `/<ชื่อนั้น>` ตอนคุยกับ Claude Code

`.gitignore` กัน `.claude/*` ไว้แล้ว ไฟล์ command ในเครื่องตัวเองจะไม่ขึ้น git และไม่กระทบใคร

---

## เนื้อหาแม่แบบ (ก็อปทั้งบล็อก รวม frontmatter)

```markdown
---
description: ทำ requirement ฝั่ง Auction ของ Dev 4 ทีละข้อ พร้อมหยุดเทสและถามก่อน commit
---

# Workflow ของ Dev 4 — Auction Module & Real-time

ทำ requirement ต่อไปนี้ **ทีละข้อ** ห้ามทำรวบหลาย requirement ในรอบเดียว

## เอกสารอ้างอิง (อ่านก่อนเริ่มทุกครั้ง)

- SRS: `docs/requirements/BidNest-Auction and Marketplace-v6.pdf` — ใช้ช่อง **"เกณฑ์การยอมรับ"** ของแต่ละ requirement เป็นเกณฑ์ตัดสินว่าผ่านหรือไม่
- Team role: `docs/team-role/Team-role-dustribution-v2.pdf`
- Schema: `apps/api/prisma/schema.prisma`
- ADR: `docs/architecture/adr/` — ADR-0001 (admin/category ใช้ชุดเดียว), ADR-0002 (product state machine)
- Reference repo: https://github.com/cha130y/cbeave-auction-platform (อ่านผ่าน `gh api` ได้ ไม่ต้อง clone)

## ลำดับ requirement (ตาม Team-role ของ Dev 4)

1. **AUC-001..008** — วงจรชีวิตประมูล: draft → validate → preview/publish → scheduled → edit/cancel → จบประมูล → Hot Auctions
2. **BID-001..005** — การประมูล: validation, atomicity/idempotency, realtime broadcast, anti-sniping, ประวัติบิด
3. **LIV-001..005** — Live Arena: lobby, arena, sudden death, ผลลัพธ์
4. **WAT-001/002** — Watchlist
5. **NOT-001..004** — แจ้งเตือนฝั่งประมูล: Outbid / Won / Ended / Cancelled
6. **ADM-001** — Admin ยกเลิกประมูล (scaffold อยู่ที่ `apps/api/src/admin/auctions.controller.ts` แล้ว)

ถ้า requirement ไหนถูกทำไปแล้ว ให้ข้ามแล้วบอกว่าข้ามเพราะอะไร

## กติกาการเขียนโค้ด

1. **ยึดโครงสร้างของ bidnest เป็นหลัก** — โครงสร้างโฟลเดอร์ การตั้งชื่อ และ convention ของ repo นี้มาก่อนเสมอ
2. **cbeave ใช้เป็นแบบอ้างอิง ไม่ใช่ก็อปวาง** — ดู pattern (โครงสร้าง module, การใช้ `$transaction`, การแยก dto/mappers/queries/types) แล้วปรับให้เข้ากับ bidnest

   ⚠️ cbeave กับ bidnest **schema ไม่เหมือนกัน** — cbeave เป็น auction อย่างเดียว ไม่มี e-commerce, ใช้ `FACEBOOK` provider ส่วน bidnest ใช้ `LINE`, ชื่อ field/relation บางตัวต่างกัน ก็อปมาตรงๆ จะพัง ตรวจกับ `schema.prisma` ของ bidnest ทุกครั้ง
3. **ห้ามแก้ `schema.prisma` โดยไม่ถามก่อน** (ตาม CLAUDE.md) — ถ้าจำเป็นต้องแก้ ให้เสนอพร้อมเหตุผลแล้วรอคำตอบ
4. ทุก write ของ admin ต้องเขียน `admin_actions` ใน `$transaction` เดียวกัน (ADM-004)
5. ห้าม broadcast event ก่อน transaction commit (SRS §6)
6. ห้ามส่ง `reservePrice` ออก API ฝั่งผู้ซื้อเด็ดขาด ส่งได้แค่ `reserveMet` ที่คำนวณแล้ว (AUC-003)
7. **ห้ามเขียนโค้ดแทน dev คนอื่น** — ถ้า requirement ต้องพึ่งโค้ดของคนอื่น ให้ตรวจในโค้ดก่อนว่ามีของจริงหรือยัง ถ้ายังไม่มีให้ mock หรือเว้นว่างไว้ก่อนแล้วรอเขา ห้ามสร้างให้ แล้วรายงานว่าข้อไหนเทสไม่ได้เพราะรออะไรอยู่

## เมื่อจบแต่ละ requirement — หยุดก่อน

**อย่าทำ requirement ถัดไปทันที** ให้ทำตามนี้:

1. เขียน/รัน test ตรวจว่าผ่าน **เกณฑ์การยอมรับใน SRS** ของ requirement นั้นครบทุกข้อ
   - ใช้ mock data หรือ seed data ตามเหมาะสม
   - ถ้ามี UI ฝั่ง frontend แล้ว ให้เทส **ทั้ง frontend และ backend พร้อมกัน**
   - รัน `pnpm check` ให้ผ่านด้วย (typecheck + test + lint)
2. รายงานผลเทสตามจริง — ข้อไหนผ่าน ข้อไหนไม่ผ่าน ข้อไหนยังไม่ได้เทสและเพราะอะไร
3. **ถามก่อนว่าพร้อม commit + push หรือยัง** แล้วรอคำตอบ
4. ถ้าตอบตกลง → เรียก `/commit <requirement-id>` (เช่น `/commit AUC-003`) แล้วทำตามนั้น

ขั้นตอน ship ทั้งหมด (ตรวจสถานะ git, ร่าง commit message, push, เช็ค PR ที่เปิดค้าง,
ประกอบ URL ฟอร์ม PR) อยู่ใน `.claude/commands/commit.md` **ที่เดียว** — ห้ามเขียนซ้ำในไฟล์นี้
เพราะถ้าแก้ที่นั่นแล้วลืมแก้ที่นี่ สองไฟล์จะเพี้ยนกัน
```
