# ADR-0001 — ใช้ Admin role เดียวและชุดหมวดหมู่เดียวร่วมกันทั้งสองโมดูล

- **สถานะ:** Accepted
- **วันที่:** 2026-08-19
- **อ้างอิง:** SRS v4 §1.1, §2, §4.4, §5.1, §5.2, ADM-001..006
- **เกี่ยวข้องกับ:** Dev 2 (ADM-003), Dev 3 (ADM-005/006), Dev 4 (ADM-001), Dev 5 (ADM-002/004)

---

## บริบท

BidNest มี 2 โมดูลธุรกิจที่ทำงานแยกอิสระจากกัน คือ **Auction** (ประมูลเรียลไทม์) และ **E-commerce** (ซื้อขายราคาคงที่) โดยอยู่ภายใต้ระบบบัญชีเดียวกัน

เมื่อมาถึงงานฝั่ง Admin (ADM-001..006) และการจัดการหมวดหมู่ (ADM-003) จึงเกิดคำถามซ้ำๆ ในทีม 2 ข้อ:

1. ต้องแยก Admin ออกเป็น "Admin ฝั่ง Auction" กับ "Admin ฝั่ง E-commerce" หรือไม่
2. ต้องแยกชุดหมวดหมู่ออกเป็นคนละชุดต่อโมดูลหรือไม่

คำถามนี้มีที่มาจากความกังวลเชิงปฏิบัติ 2 อย่าง คือ (ก) requirement ADM-001..006 ถูกกระจายให้ dev ถึง 4 คน จึงกลัวว่าจะแก้ไฟล์ชนกัน และ (ข) หมวดหมู่บางหมวดอาจเหมาะกับโมดูลใดโมดูลหนึ่งมากกว่า

เอกสารนี้บันทึกการตัดสินใจไว้เพื่อไม่ให้ต้องถกซ้ำ และเพื่อให้คนที่เข้ามาอ่านโค้ดทีหลังเข้าใจว่าทำไมจึงออกแบบแบบนี้

---

## การตัดสินใจ

### 1. ใช้ Admin role เดียว — ไม่แยกตามโมดูล

`UserRole` มีแค่ `USER` และ `ADMIN` ตามเดิม ไม่เพิ่ม `AUCTION_ADMIN` / `ECOMMERCE_ADMIN`

### 2. ใช้ชุดหมวดหมู่เดียวร่วมกัน — ไม่มี field `scope`

ตาราง `categories` ชุดเดียว ทั้ง `auctions` และ `products` อ้างอิงเข้าตารางเดียวกัน ไม่มีการแยกขอบเขตตามโมดูลในระดับข้อมูล

### 3. แยกที่ "ไฟล์" ไม่ใช่แยกที่ "role"

ความกังวลเรื่องแก้ไฟล์ชนกันแก้ด้วยการแบ่ง controller ตาม requirement ให้แต่ละคนมีไฟล์ของตัวเอง (ดูหัวข้อ "โครงสร้างที่ตกลงใช้")

---

## เหตุผล

### SRS ระบุไว้ชัดเจนอยู่แล้วทั้งสองข้อ

เรื่องหมวดหมู่ SRS ย้ำถึง 3 จุด:

| อ้างอิง | ข้อความ |
| --- | --- |
| §1.1 | "ชุดหมวดหมู่ (category) **เดียว**ที่ Admin จัดการ ใช้ร่วมกันทั้ง Auction และ E-commerce" |
| §4.4 | "แคตตาล็อกสินค้าใช้ชุดหมวดหมู่ร่วมกัน (ADM-003) **แทนที่จะแยกชุดต่างหาก** ทำให้ Admin จัดการรายการหมวดหมู่แค่ชุดเดียวสำหรับทั้งสองโมดูล แทนที่จะต้องจัดการสองชุด" |
| §5.1 | "categories ใช้ร่วมกันทั้งสองโมดูล **ไม่แยกขอบเขตตามโมดูล**; รายการในแต่ละโดเมนจะอ้างอิงได้เฉพาะหมวดหมู่ที่ active เท่านั้น" |

เรื่อง Admin role:

- **§2** ตารางสิทธิ์การเข้าถึง ระบุ Administrator ไว้ **แถวเดียว** โดยหน้าที่คร่อมทั้งสองโมดูล — ดูสถิติ, จัดการหมวดหมู่, ระงับ/เปิดใช้งานผู้ใช้, ยกเลิกประมูล, ปิด/เปิดการขายสินค้า, ดูภาพรวมคำสั่งซื้อ, ดูประวัติ audit
- **§5.1 Identity** — "role ที่บันทึกคือ USER/ADMIN"
- **§5.2** — กำหนด REST endpoint group ว่า `/admin` **กลุ่มเดียว** ไม่ได้แยกเป็น `/admin/auction` กับ `/admin/shop`

### schema ปัจจุบันรองรับอยู่แล้ว ไม่ต้องแก้

`apps/api/prisma/schema.prisma` ตรงกับการตัดสินใจนี้ทุกจุด:

- `enum UserRole { USER ADMIN }` — ไม่มี admin แยกโมดูล
- `model Category` — **ไม่มี field `scope`** และมีทั้ง `auctions Auction[]` และ `products Product[]` ชี้เข้ามาที่ตารางเดียวกัน
- `model AdminAction` — มี FK ครบทั้ง 4 เป้าหมายในแถวเดียวกัน (`targetUserId`, `auctionId`, `categoryId`, `productId`) จึงเป็น audit trail **ตารางเดียว** ที่รองรับทั้งสองโมดูลตาม ADM-004
- `enum AdminActionType` — ครอบคลุม ADM-001..005 ครบแล้ว (ADM-006 เป็น read-only จึงไม่ต้องมี action type)

### ต้นทุนของการแยกสูงกว่าประโยชน์ใน V1

ถ้าแยก Admin เป็น 2 role จะต้องแลกด้วย:

- แก้ `UserRole` enum + migration ซึ่งขัดกับข้อตกลงในทีมว่าห้ามแก้ schema โดยไม่ตกลงกันก่อน
- `admin_actions` ต้องถูก query แยกตาม role ทำให้ ADM-004 ที่ออกแบบมาเป็น audit trail เดียวเสียจุดประสงค์
- ต้องมีหน้าจอ/เมนู/guard 2 ชุด ทั้งที่ V1 ยังไม่มีระบบรับรายงานจากผู้ใช้หรือคิวจัดการข้อพิพาท (SRS §1.2 เลื่อนออกไปแล้วทั้งคู่) จึงยังไม่มีปริมาณงาน admin มากพอที่จะต้องแบ่งทีมดูแล

ถ้าแยกชุดหมวดหมู่จะต้องแลกด้วย: Admin ต้องดูแล 2 ชุด, หมวดที่ซ้ำกัน (เช่น "นาฬิกา") ต้องสร้าง 2 ครั้งและอาจไม่ตรงกัน ซึ่งเป็นปัญหาที่ §4.4 ระบุไว้ตรงๆ ว่าเลือกไม่เอา

---

## โครงสร้างที่ตกลงใช้

### API

`categories` **ไม่อยู่ใต้ `admin/`** เพราะ `GET /categories` เป็น endpoint สาธารณะที่ guest ต้องใช้กรองแคตตาล็อก (PROD-003) และผู้ขายต้องใช้ตอนสร้าง draft (AUC-001) — จึงใส่ guard เป็นราย endpoint แทนที่จะ guard ทั้ง controller

```
apps/api/src/
  categories/                     ADM-003   → Dev 2
    GET    /categories                        public
    GET    /categories/admin                  ADMIN (เห็น inactive ด้วย)
    POST   /categories                        ADMIN
    PATCH  /categories/:categoryId            ADMIN
    PATCH  /categories/:categoryId/activate   ADMIN
    PATCH  /categories/:categoryId/deactivate ADMIN
  admin/
    admin.module.ts                         → Dev 5 (รวม controller ทั้งหมด)
    users.controller.ts           ADM-002   → Dev 5
    actions.controller.ts         ADM-004   → Dev 5
    auctions.controller.ts        ADM-001   → Dev 4
    products.controller.ts        ADM-005   → Dev 3
    orders.controller.ts          ADM-006   → Dev 3
```

controller ใต้ `admin/` ทุกตัวใส่ guard ที่ระดับ class เพราะเป็น admin-only ทั้งหมด

### Web

Admin Dashboard เป็นหน้าเดียวรวมศูนย์ มี sidebar เดียวที่มีทั้งเมนูฝั่ง auction และ e-commerce ตามที่ Team Role Distribution ระบุว่า Dev 5 รับผิดชอบ "Admin Dashboard แบบรวมศูนย์ที่เรียกใช้ endpoint ... ซึ่งอิงจากโมดูลของ Dev 2/3/4"

```
apps/web/src/app/(marketplace)/admin/
  users/  categories/  auctions/  products/  orders/  actions/
apps/web/src/features/admin/
  users/  categories/  auctions/  products/  orders/  actions/
```

---

## ข้อบังคับที่ตามมา (ทุกคนต้องทำตาม)

1. **ทุก admin write ต้องเขียน `admin_actions` ใน transaction เดียวกัน** — ไม่ใช่เขียนแยกทีหลัง เพื่อให้ ADM-004 ถูกการันตีที่ระดับ database ว่าเป็นไปไม่ได้ที่จะมีการกระทำของ admin ที่ไม่มี audit log

   ```ts
   return this.prisma.$transaction(async (transaction) => {
     const category = await transaction.category.update({ ... });
     await transaction.adminAction.create({
       adminUserId: input.adminUserId,
       categoryId: category.id,
       actionType: AdminActionType.DEACTIVATE_CATEGORY,
       note: `Deactivated category "${category.name}"`,
     });
     return category;
   });
   ```

2. **หมวดหมู่ปิดใช้งาน ไม่ลบ** — ADM-003 ระบุว่า "หมวดหมู่ที่ถูกใช้งานอยู่แล้วจะถูกปิดใช้งาน ไม่ใช่ลบทิ้งถาวร" จึงไม่มี `DELETE /categories/:id`

3. **บังคับความลึกไม่เกิน 2 ระดับใน service layer** — `model Category` เป็น self-relation ที่ schema กันความลึกไม่ได้ ต้องเช็คใน service ว่า parent ที่ระบุมาต้องมี `parentId === null` และต้อง `isActive === true`

4. **หมวดหมู่ที่อ้างอิงได้ต้อง active เท่านั้น** — ทั้ง `AUC-001` และ `PROD-001` ต้องตรวจว่า `categoryId` ที่ส่งเข้ามาเป็นหมวดที่ `isActive = true` ตาม SRS §5.1

---

## ผลที่ตามมา

**ข้อดี**

- ไม่ต้องแก้ schema และไม่ต้อง migration เพิ่ม
- audit trail เป็นแหล่งข้อมูลเดียว query ง่าย ตรงตาม ADM-004
- Admin จัดการหมวดหมู่ชุดเดียว ข้อมูลไม่แตกเป็นสองชุดที่ไม่ตรงกัน
- ทีมยังทำงานคู่ขนานได้ไม่ชนกัน เพราะแบ่งที่ไฟล์แทนที่จะแบ่งที่ role

**ข้อเสียที่ยอมรับ**

- หมวดหมู่ที่เหมาะกับโมดูลเดียวจะโผล่ใน dropdown ของอีกโมดูลด้วย — ยอมรับใน V1 ถ้าจำเป็นให้แก้ที่ระดับ query (เช่นซ่อนหมวดที่ยังไม่มีรายการ active อยู่เลย) ไม่ใช่เพิ่ม field ลง schema
- ยังไม่รองรับการแบ่งหน้าที่ admin ตามความรับผิดชอบ (least privilege) — ถ้าจำเป็นในอนาคตควรทำเป็น permission-based ไม่ใช่เพิ่ม role ต่อโมดูล

---

## ทางเลือกที่พิจารณาแล้วไม่เลือก

| ทางเลือก | เหตุผลที่ไม่เลือก |
| --- | --- |
| แยก `AUCTION_ADMIN` / `ECOMMERCE_ADMIN` | ขัด SRS §2 และ §5.1, ต้องแก้ schema, ทำลาย audit trail เดียวของ ADM-004 |
| `Category.scope` (`AUCTION` / `ECOMMERCE` / `BOTH`) | ขัด SRS §5.1 ที่ระบุว่า "ไม่แยกขอบเขตตามโมดูล" โดยตรง — เคยมีตัวอย่างค้างอยู่ใน `docs/KICKOFF_GUIDE.md` ซึ่งเป็นร่างก่อน SRS v4 และถูกแก้ออกแล้วพร้อมกับ ADR ฉบับนี้ |
| แยกตาราง `auction_categories` / `product_categories` | ปัญหาเดียวกับ `scope` แต่หนักกว่า เพราะ Admin ต้องดูแล 2 ชุดจริงๆ ตรงกับสิ่งที่ §4.4 ระบุว่าเลือกไม่เอา |
| ย้าย `categories` ไปอยู่ใต้ `admin/` | `GET /categories` เป็น endpoint สาธารณะ (PROD-003, AUC-001) ถ้าอยู่ใต้ `admin/` จะสื่อความหมายผิดและ guard ทั้ง controller ไม่ได้ |

---

## ประเด็นที่แตกออกไปแล้ว

**ADM-005 ทับซ้อนกับ PROD-002** — ADM-005 ให้ admin ปิดการขายสินค้าที่ไม่เหมาะสมได้ แต่ PROD-002 ก็ให้ผู้ขายแก้สถานะสินค้าของตัวเองระหว่าง `ACTIVE`/`INACTIVE` ได้เช่นกัน ทำให้ผู้ขายกด `ACTIVE` กลับได้ทันทีหลัง admin สั่งปิด

✅ **ตัดสินใจแล้ว** — ทีมสรุปว่าถ้า admin เป็นคนสั่งปิด ผู้ขายต้องเปิดกลับเองไม่ได้ รายละเอียดและกฎที่ต้อง implement อยู่ที่ [ADR-0002](0002-admin-suspended-product-status.md)
