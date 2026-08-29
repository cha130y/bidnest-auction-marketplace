# Dev 3 — E-Commerce Workflow (แม่แบบ slash command)

> **เจ้าของแนวทาง:** Dev 3 (E-Commerce Module)
> **ไฟล์นี้คืออะไร:** สำเนาของ slash command ส่วนตัว `/dev3` ที่ใช้อยู่จริง เอาขึ้น repo ไว้เป็น **แม่แบบให้เพื่อนในทีมก็อปไปปรับเป็นของตัวเอง**
> **ไม่ใช่กติกาทีม** — กติกาที่ทั้งทีมยึดร่วมกันอยู่ใน `CLAUDE.md` เท่านั้น ไฟล์นี้เป็นแนวทางส่วนบุคคล ปรับได้ตามใจ
> **ใช้คู่กับ:** [`dev3-commit-workflow.md`](./dev3-commit-workflow.md) — ไฟล์นี้ครอบแค่ **build + test** แล้วจบที่คำถาม "พร้อม commit หรือยัง" ส่วนขั้นตอน **ship** (commit / push / PR) อยู่ในอีกไฟล์
> **อ้างอิง:** SRS v7, Team Role Distribution v2 · เขียนคู่กับ `dev4-auction-workflow.md`

---

## วิธีนำไปใช้

1. สร้างไฟล์ `.claude/commands/<ชื่อที่อยากเรียก>.md` ในเครื่องตัวเอง (เช่น `dev3.md`)
2. ก็อปเนื้อหาในบล็อกข้างล่างไปวาง แล้วแก้ให้ตรงกับ requirement / module ของตัวเอง
   - เปลี่ยน `description:` ใน frontmatter
   - เปลี่ยนรายการ requirement ในหัวข้อ "ลำดับ requirement"
   - เปลี่ยน/ตัด "กติกาการเขียนโค้ด" ข้อที่เป็นเรื่องเฉพาะฝั่ง e-commerce (ข้อ 4–10)
3. เรียกใช้ด้วย `/<ชื่อนั้น>` ตอนคุยกับ Claude Code

`.gitignore` กัน `.claude/*` ไว้แล้ว ไฟล์ command ในเครื่องตัวเองจะไม่ขึ้น git และไม่กระทบใคร

---

## เนื้อหาแม่แบบ (ก็อปทั้งบล็อก รวม frontmatter)

````markdown
---
description: ทำ requirement ฝั่ง E-Commerce ของ Dev 3 ทีละข้อ พร้อมหยุดเทสและถามก่อน commit
---

# Workflow ของ Dev 3 — E-Commerce Module

ทำ requirement ต่อไปนี้ **ทีละข้อ** ห้ามทำรวบหลาย requirement ในรอบเดียว

## เอกสารอ้างอิง (อ่านก่อนเริ่มทุกครั้ง)

- SRS: `docs/requirements/BidNest-Auction and Marketplace-v7.pdf` — ใช้ช่อง **"เกณฑ์การยอมรับ"** ของแต่ละ requirement เป็นเกณฑ์ตัดสินว่าผ่านหรือไม่
- Team role: `docs/team-role/Team-role-dustribution-v2.pdf`
- Schema: `apps/api/prisma/schema.prisma`
- ADR: `docs/architecture/adr/` — ADR-0001 (admin/category ใช้ชุดเดียว), ADR-0002 (product state machine + `SUSPENDED`)
- Reference repo: https://github.com/cha130y/cbeave-auction-platform (อ่านผ่าน `gh api` ได้ ไม่ต้อง clone)

## ลำดับ requirement (ตาม Team-role ของ Dev 3)

1. **PROD-001..007** — แคตตาล็อกสินค้า: สร้าง/แก้/ลบ, ค้นหา+กรอง, รายละเอียด, สต็อก, negotiation floor, ส่วนลดตามจำนวน
2. **CART-001..005** — ตะกร้า + checkout จำลอง: เพิ่ม/แก้, แยกออเดอร์ตามผู้ขาย, ชำระเงินจำลอง, ยืนยันคำสั่งซื้อ
3. **SHIP-001..003** — จัดส่ง + ประวัติ: ผู้ขายอัปเดตสถานะ, ผู้ซื้อดู timeline, ประวัติทั้งสองฝั่ง
4. **NOT-005/006/007** — แจ้งเตือนฝั่งคำสั่งซื้อ: Order Placed / Shipment Update / Delivered
5. **ADM-005/006** — Admin เฉพาะโมดูลตัวเอง: ปิด/เปิดการขายสินค้า, ภาพรวมคำสั่งซื้อ (อยู่ที่ `apps/api/src/admin/products.*` และ `orders.*`)
6. **CHAT-001..003 + NOT-008** *(Optional)* — แชทผู้ซื้อ-ผู้ขาย ทำหลังฟีเจอร์บังคับเสร็จหมดแล้วเท่านั้น

ถ้า requirement ไหนถูกทำไปแล้ว ให้ข้ามแล้วบอกว่าข้ามเพราะอะไร

## กติกาการเขียนโค้ด

1. **ยึดโครงสร้างของ bidnest เป็นหลัก** — โครงสร้างโฟลเดอร์ การตั้งชื่อ และ convention ของ repo นี้มาก่อนเสมอ
2. **cbeave ใช้เป็นแบบอ้างอิง ไม่ใช่ก็อปวาง** — ดู pattern (โครงสร้าง module, การใช้ `$transaction`, การแยก dto/mappers/queries/types) แล้วปรับให้เข้ากับ bidnest

   ⚠️ cbeave **ไม่มีโมดูล e-commerce เลย** — เป็น auction ล้วน ไม่มี products/cart/orders/shipments ดังนั้นฝั่ง Dev 3 จะก็อปโครงมาตรงๆ ไม่ได้ ใช้ได้แค่ pattern ระดับโครงสร้างเท่านั้น ตรวจกับ `schema.prisma` ของ bidnest ทุกครั้ง
3. **ห้ามแก้ `schema.prisma` โดยไม่ถามก่อน** (ตาม CLAUDE.md) — ถ้าจำเป็นต้องแก้ ให้เสนอพร้อมเหตุผลแล้วรอคำตอบ
4. **ห้ามส่ง `negotiationFloor` ออก API ฝั่งผู้ซื้อเด็ดขาด** (PROD-006, SRS §6 — กฎเดียวกับ `reservePrice` ฝั่งประมูล)

   วิธีที่ใช้อยู่: `productOwnerSelect` **ต่อยอดจาก** `productPublicSelect` ไม่ใช่ทางกลับกัน (ดู `product.mapper.ts`) ทำให้ path ฝั่งผู้ซื้อ**รั่วโดยลืมไม่ได้** เพราะฟิลด์ลับต้องถูกเพิ่มเข้ามาอย่างตั้งใจเท่านั้น
5. **เงินทุกจุดใช้ `Prisma.Decimal` ห้ามใช้ float** — ตั้งแต่ราคาสินค้า ส่วนลด ยอดตะกร้า ยันยอดออเดอร์ แยก logic คิดเงินเป็น pure function เพื่อให้เขียน unit test ได้ (ดู `cart/utils/calculate-line-total.util.ts`)
6. **ตัดสต็อกด้วย conditional `updateMany` แล้วเช็ค `count`** ห้ามอ่านมาบวกลบแล้วเขียนกลับ (PROD-005)

   ```ts
   const { count } = await tx.product.updateMany({
     where: { id, status: 'ACTIVE', stockQty: { gte: qty } },
     data: { stockQty: { decrement: qty } }
   });
   if (count !== 1) throw new ConflictException(...); // แพ้ race → rollback ทั้งก้อน
   ```
   รูปแบบเดียวกันนี้ใช้กับการเลื่อนสถานะจัดส่งด้วย
7. **ห้าม emit realtime / สร้าง side effect ก่อน transaction commit** (SRS §6) — ยิง event หลัง `$transaction` คืนค่าแล้วเท่านั้น ไม่งั้นจะแจ้งเตือนออเดอร์ที่ rollback ไปแล้ว
8. **การชำระเงินต้องถูกบันทึกทุกครั้งไม่ว่าผลเป็นอะไร** — 1 แถวต่อ 1 `checkout_session_id` (ไม่ใช่ต่อ order) และ commit แยกก่อนสร้างออเดอร์ เพื่อไม่ให้การตัดเงินหายไปตอน rollback (CART-004)
9. **คนนอกต้องได้ 404 ไม่ใช่ 403** — ออเดอร์ แชท และสินค้าที่ไม่ได้เปิดสาธารณะ ต้องไม่ทำให้คนนอกรู้ว่ามีอยู่จริง (SRS §6) ส่วน 403 ใช้กับคนที่**เห็นได้แต่ทำไม่ได้** เช่นผู้ซื้อกดเปลี่ยนสถานะจัดส่ง
10. **แยกให้ชัดว่าใครเป็นเจ้าของสถานะสินค้า** (ADR-0002)
    - `INACTIVE` = ผู้ขายปิดเอง ผู้ขายเปิดกลับเองได้
    - `SUSPENDED` = admin สั่งปิด (ADM-005) **ผู้ขายปลดเองไม่ได้ทุกทาง** ทั้งแก้ราคา เปลี่ยนสถานะ และเติมสต็อกต้องได้ 403
    - `OUT_OF_STOCK` = ระบบคำนวณจากสต็อก ห้ามให้คนตั้งเอง
    - `REMOVED` = ปลายทาง มาจาก DELETE เท่านั้น และถ้ามีออเดอร์อ้างอยู่ให้ degrade เป็น `INACTIVE` แทน (PROD-002)
11. **ราคาต่อรอง (AI-003) ห้ามทบกับส่วนลดตามจำนวน** (PROD-007) — ถ้าใช้ราคาต่อรอง ให้ **ข้าม** quantity discount ของรายการนั้นทั้งหมด ไม่ใช่ลดซ้อนกัน
12. **`shipment_events` เป็น append-only** ห้าม update แถวเก่า (SHIP-001 — รูปแบบเดียวกับ `auction_events`)
13. **ตะกร้าห้ามตรึงราคา** (CART-002) — เก็บแค่ product + quantity ทุกยอดคำนวณสดจากราคาปัจจุบันของผู้ขายทุกครั้งที่อ่าน
14. **ห้ามเขียนโค้ดแทน dev คนอื่น** — ถ้า requirement ต้องพึ่งโค้ดของคนอื่น ให้ตรวจในโค้ดก่อนว่ามีของจริงหรือยัง ถ้ายังไม่มีให้ mock หรือเว้นว่างไว้ก่อนแล้วรอเขา ห้ามสร้างให้ แล้วรายงานว่าข้อไหนเทสไม่ได้เพราะรออะไรอยู่

## ของที่ mock ไว้ระหว่างรอ dev คนอื่น

ออกแบบให้ **สลับเป็นของจริงแล้ว controller ไม่ต้องแก้เลย**

| Mock | รอใคร | วิธีสลับ | สถานะ |
|---|---|---|---|
| ~~`MockAuthGuard`~~ | Dev 2 — AUTH-008 | เปลี่ยน `useClass` ใน `app.module.ts` จุดเดียว | ✅ **สลับแล้ว** เป็น `AccessTokenGuard` · controller ไม่ต้องแก้สักไฟล์ |
| `RealtimeService` (`realtime/`) | Dev 4 — WebSocket gateway | เปลี่ยนแค่ body ของ 3 method ให้เรียก `server.to(room).emit(...)` | ⏳ ยัง stub — ตอนนี้แค่ log ลง console |
| `MockPaymentProvider` (`payment/`) | **ไม่ต้องรอใคร** | — | ♾️ mock ถาวรตาม SRS §1.2 — V1 ไม่ต่อ payment gateway จริง |

⚠️ guard ตัวจริงลงทะเบียนเป็น **global `APP_GUARD`** เหมือนเดิม แปลว่า route ใหม่ทุกตัวต้องมี `@Public()` กำกับถ้าต้องการให้เข้าถึงโดยไม่ล็อกอิน ไม่งั้นจะได้ 401

**บทเรียนจากรอบที่สลับจริง:** โค้ด controller/service ไม่ต้องแก้เลยเพราะอ่าน identity ผ่าน `@CurrentUser()` อย่างเดียว — แต่**ของนอกโค้ดต้องตามแก้ทั้งหมด** ทั้งไฟล์ `.http` 7 ไฟล์ (82 จุด), Postman collection (67 จุด), README และคอมเมนต์ที่อ้างชื่อ guard เก่า ตอนวางแผน mock ครั้งหน้าให้นับพวกนี้เข้าไปในต้นทุนการสลับด้วย

## เมื่อจบแต่ละ requirement — หยุดก่อน

**อย่าทำ requirement ถัดไปทันที** ให้ทำตามนี้:

1. เขียน/รัน test ตรวจว่าผ่าน **เกณฑ์การยอมรับใน SRS** ของ requirement นั้นครบทุกข้อ
   - เพิ่มเคสลง `apps/api/test/ecommerce.e2e-spec.ts` สำหรับ invariant ที่พังแล้วเจ็บ (ความลับของ floor, ขายเกินสต็อก, จ่ายไม่ผ่านต้องไม่สร้างอะไร, ลำดับจัดส่ง, สิทธิ์การเข้าถึง)
   - e2e ต้อง **สร้างข้อมูลของตัวเองในไฟล์ ห้ามพึ่ง seed** และเก็บกวาดให้หมดใน `afterAll` — พิสูจน์ด้วยการรันซ้ำ 2–3 รอบแล้วเช็คว่าจำนวนแถวใน DB กลับเท่าเดิม
   - ถ้ามี UI ฝั่ง frontend แล้ว ให้เทส **ทั้ง frontend และ backend พร้อมกัน**
   - รัน `pnpm check` ให้ผ่านด้วย (typecheck + test + lint)
2. รายงานผลเทสตามจริง — ข้อไหนผ่าน ข้อไหนไม่ผ่าน ข้อไหนยังไม่ได้เทสและเพราะอะไร
3. **ถามก่อนว่าพร้อม commit + push หรือยัง** แล้วรอคำตอบ
4. ถ้าตอบตกลง → เรียก `/commit <requirement-id>` (เช่น `/commit PROD-006`) แล้วทำตามนั้น

ขั้นตอน ship ทั้งหมด (ตรวจสถานะ git, ร่าง commit message, push, เช็ค PR ที่เปิดค้าง,
ประกอบ URL ฟอร์ม PR) อยู่ใน `.claude/commands/commit.md` **ที่เดียว** — ห้ามเขียนซ้ำในไฟล์นี้
เพราะถ้าแก้ที่นั่นแล้วลืมแก้ที่นี่ สองไฟล์จะเพี้ยนกัน
````

---

## หมายเหตุเพิ่มเติมสำหรับคนที่เอาไปปรับใช้

- **`pnpm test` ยังไม่รัน e2e** — jest ตั้ง `rootDir: "src"` ส่วนไฟล์ e2e อยู่ที่ `test/` ต้องเรียก `pnpm --filter api test:e2e` แยกเอง ถ้าอยากให้ CI รันด้วยต้องเพิ่ม service `postgres` เข้า workflow ซึ่งเป็นไฟล์ที่ใช้ร่วมกันทั้งทีม ควรตกลงกันก่อน
- **หลัง `git merge dev` ทุกครั้ง ให้เทียบ `apps/api/.env` กับ `.env.example`** — ถ้ามีตัวแปรใหม่ (เช่น `JWT_ACCESS_SECRET`) แล้วยังไม่ได้เติม API จะ start ไม่ขึ้นเลยตั้งแต่ boot
