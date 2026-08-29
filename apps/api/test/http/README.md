# วิธีเทส API (โมดูล e-commerce และประมูล)

AUTH-008 มาแล้ว — `MockAuthGuard` กับ header `x-mock-user-id` ถูกถอดออกไป
ตอนนี้ทุก request ที่ไม่ใช่ `@Public()` ต้องมี **bearer token จริง**:

```
Authorization: Bearer {{buyerToken}}
```

`AccessTokenGuard` verify token แล้ว **อ่านบัญชีจาก DB ใหม่ทุก request** ดังนั้น
บัญชีที่เพิ่งโดนระงับจะใช้ token เดิมต่อไม่ได้ทันที (ADM-002)

## 1. เตรียมเครื่อง (ทำครั้งเดียว)

```bash
# 1) ยก Postgres (port 5433)
docker compose -f infra/docker/compose.dev.yml up -d

# 2) ตั้งค่า env
cp apps/api/.env.example apps/api/.env

# 3) สร้างตาราง
pnpm --dir apps/api exec prisma migrate dev

# 4) ใส่ข้อมูลตั้งต้น (users / categories / products)
#    ⚠️ ใช้คำสั่งนี้ ไม่ใช่ `prisma db seed` — ดูเหตุผลข้างล่าง
pnpm --dir apps/api exec nest build && node apps/api/dist/prisma/seed.js

# 5) รัน API
pnpm dev:api          # -> http://localhost:4000
```

> **seed จะพิมพ์บรรทัด `@xToken = ...` ออกมาท้ายสุด — copy ไปวางในหัวไฟล์ `.http`**
> token หมดอายุตาม `JWT_ACCESS_TTL` (ค่าเริ่มต้น 15 นาที) พอเริ่มได้ 401 ให้ seed ใหม่
> แล้ววางทับ ไม่ต้อง login จริงเพราะขั้นตอน login ต้องรอ OTP ทางอีเมลก่อน (AUTH-007)
>
> ⚠️ **`prisma db seed` ใช้ไม่ได้กับขั้นตอนนี้** มันรัน seed จริงและใส่ข้อมูลให้ครบ
> แต่**กลืน stdout ของ process ลูกทิ้ง** เลยไม่เห็นบรรทัด token ที่ต้องเอาไปใช้ต่อ
> ถ้าแค่อยากได้ข้อมูลลง DB เฉยๆ ไม่ต้องการ token ใช้ `prisma db seed` ได้ตามปกติ

## 2. ผู้ใช้ตั้งต้น

| ใช้ตัวแปร | role | UUID | เอาไว้ทำอะไร |
|---|---|---|---|
| `{{adminToken}}` | ADMIN | `...0001` | ดูออเดอร์ทั้งระบบ, ปิด/เปิดประกาศขาย — **ซื้อขายเองไม่ได้** |
| `{{sellerAToken}}` | USER | `...0002` | เจ้าของสินค้า `...0201` (คีย์บอร์ด) และ `...0202` (USB hub) |
| `{{sellerBToken}}` | USER | `...0003` | เจ้าของสินค้า `...0203` (แจ็คเก็ต) และ `...0204` (ฟิกเกอร์) |
| `{{buyerToken}}` | USER | `...0004` | คนซื้อหลักที่ใช้ในเทสส่วนใหญ่ |

> อยากได้ข้อมูลเยอะกว่านี้สำหรับทำหน้าจอ (120 สินค้า, 47 ออเดอร์, แชท, แจ้งเตือน)
> รัน `pnpm --dir apps/api seed:mock` เพิ่ม — มันพิมพ์ token ของบัญชี mock ให้เหมือนกัน

สินค้าตั้งต้น:

| id | ชื่อ | ราคา | สต๊อก | ผู้ขาย | หมายเหตุ |
|---|---|---|---|---|---|
| `...0201` | Mechanical Keyboard 65% | 2500.00 | 10 | A | ซื้อ 3 ชิ้นขึ้นไปลด 10% (PROD-007) |
| `...0202` | USB-C Hub 8-in-1 | 1200.00 | 5 | A | |
| `...0203` | Vintage Denim Jacket | 1800.00 | 2 | B | |
| `...0204` | Limited Edition Figurine | 4500.00 | 1 | B | สต๊อกเหลือ 1 ใช้เทสของหมด |

## 3. ยิงด้วยไฟล์ `.http`

**VS Code** — ลง extension `humao.rest-client` แล้วเปิดไฟล์ กด `Send Request` เหนือ
แต่ละ block
**JetBrains (WebStorm / IntelliJ)** — เปิดไฟล์ได้เลย เลือก environment `local`
จาก `http-client.env.json`

ยิง **เรียงจากบนลงล่างในไฟล์เดียวกัน** เพราะแต่ละไฟล์ส่ง id ต่อกันเอง
(`# @name xxx` แล้วอ้าง `{{xxx.response.body.$.id}}`) จะได้ไม่ต้อง copy id ด้วยมือ

| ไฟล์ | เนื้อหา |
|---|---|
| `_env.http` | ตัวแปรกลาง — ไฟล์อื่น copy block นี้ไว้บนสุดของตัวเอง แก้ที่นี่ก่อนเสมอ |
| `00-health.http` | เช็คว่า API ขึ้นแล้ว |
| `01-product.http` | ลงขาย / ค้นหา / รายละเอียด / แก้ไข / สต๊อก / ลบ |
| `02-cart.http` | ตะกร้า + ส่วนลดตามจำนวน + ตะกร้าข้ามผู้ขาย |
| `03-order.http` | checkout → ออเดอร์แยกตามผู้ขาย → รายการซื้อ/ขาย |
| `04-shipment.http` | ไทม์ไลน์จัดส่งครบ 4 สเต็ป + เคสยกเลิกแล้วคืนสต๊อก |
| `05-chat.http` | เปิดห้องแชท / ส่งข้อความ / กล่องข้อความ |
| `06-admin.http` | ดูออเดอร์ทั้งระบบ / ปิด-เปิดประกาศขาย |
| `07-negative.http` | เคสที่ต้องพัง — 401 / 403 / 404 / 400 (**ห้ามมี 500**) |
| `08-auction.http` | ประมูล: สร้าง draft ส่วนตัว + ตรวจสอบก่อนเผยแพร่ + preview/publish + หน้าสาธารณะ + แก้ไข/ยกเลิก + จบประมูล + Hot Auctions + เคสที่ต้องพังของฝั่งประมูล (AUC-001..008) |
| `09-bid.http` | ประมูล: ลงบิด + retry ที่ปลอดภัย + วิธีเทส realtime + anti-sniping + ประวัติบิด + เคสที่ต้องพังของการบิด (BID-001..005) |
| `10-notification.http` | กระดิ่งแจ้งเตือน: รายการ / เลข unread / อ่านทีละใบ / อ่านทั้งหมด (NOT-005..008) |

## 4. ยิงด้วย Postman

`apps/api/test/postman/` มี 2 ไฟล์ให้ import:

- `bidnest-ecommerce.postman_collection.json` — collection
- `bidnest-local.postman_environment.json` — environment (เลือกเป็น `BidNest local` ก่อนยิง)

กด **Run collection** ได้รวดเดียว มี `pm.test` เช็ค status code ให้ทุก request
(collection ยิงเรียงตามลำดับเดียวกับไฟล์ `.http` และเซฟ id ลงตัวแปรให้อัตโนมัติ)

## 5. จุดที่ต้องดูนอกจาก response

เปิด terminal ที่รัน `pnpm dev:api` ค้างไว้ แล้วดู log พวกนี้:

- `[simulated] charge 3000.00 via CARD -> SUCCEEDED` — การจ่ายเงินจำลอง (ไม่มีเงินจริง)
- `[stub] order:status_changed -> user:...` — event ที่จะกลายเป็น WebSocket จริงของ Dev 4
- `[stub] notification:created -> user:...` — แจ้งเตือน NOT-005 / NOT-006 / NOT-007

## 6. เคสพิเศษที่ระบบเตรียมไว้ให้แกล้ง

| อยากเทสอะไร | ทำยังไง |
|---|---|
| จ่ายเงินไม่ผ่าน | ทำยอดรวมตะกร้าให้เท่ากับ **666.00 พอดี** (`MockPaymentProvider.DECLINE_AMOUNT`) — มีสคริปต์พร้อมใน `07-negative.http` |
| ของหมดกลางคัน | ใช้ figurine `...0204` ที่เหลือชิ้นเดียว |
| สินค้าถูกซ่อน | ให้แอดมิน `deactivate` แล้วลอง search — ต้องหาไม่เจอ แต่เจ้าของยังเปิดดูได้ |
| ส่วนลดตามจำนวน | ใส่คีย์บอร์ด `...0201` ลงตะกร้า 3 ชิ้นขึ้นไป |
| ยกเลิกแล้วคืนสต๊อก | เลื่อนสถานะเป็น `CANCELLED` ตอนยังเป็น `PROCESSING` |

## 7. ดู data จริงในฐานข้อมูล

```bash
pnpm --dir apps/api exec prisma studio
```

## 8. เทสอัตโนมัติ

```bash
pnpm --dir apps/api test        # unit (auth, auction)
pnpm --dir apps/api test:e2e    # e2e (auth, auction — ต้องมี DB ขึ้นอยู่)
```

e2e สร้าง user/category ของตัวเองแล้วลบทิ้งเมื่อจบ ไม่พึ่ง seed จึงรันซ้ำได้เรื่อยๆ

ไฟล์ `.http` ชุดนี้ทำหน้าที่เป็นสเปกไว้ก่อน ใครจะเขียน `*.e2e-spec.ts` เพิ่ม
แปลงจากไฟล์เหล่านี้ได้ตรงๆ (status ที่คาดหวังเขียนกำกับไว้ทุกอันแล้ว)
