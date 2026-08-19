import { Module } from '@nestjs/common';
import { AdminUsersController } from './users.controller';
import { AdminUsersService } from './users.service';
import { AdminAuctionsController } from './auctions.controller';
import { AdminAuctionsService } from './auctions.service';
import { AdminProductsController } from './products.controller';
import { AdminProductsService } from './products.service';
import { AdminOrdersController } from './orders.controller';
import { AdminOrdersService } from './orders.service';
import { AdminActionsController } from './actions.controller';
import { AdminActionsService } from './actions.service';

/**
 * Admin module — ADM-001, ADM-002, ADM-004, ADM-005, ADM-006
 *
 * **Admin role เดียวครอบทั้งสองโมดูล** ไม่แยกเป็น admin ฝั่ง auction กับ
 * ฝั่ง e-commerce (SRS §2, §5.1, §5.2) เหตุผลเต็มดูที่
 * `docs/architecture/adr/0001-single-admin-role-and-shared-category-set.md`
 *
 * แยกที่ระดับ **ไฟล์** ตามเจ้าของ requirement เพื่อให้ 4 คนทำคู่ขนานได้ไม่ชนกัน:
 *
 * | ไฟล์                   | Requirement | เจ้าของ |
 * | ---------------------- | ----------- | ------- |
 * | users.controller.ts    | ADM-002     | Dev 5   |
 * | actions.controller.ts  | ADM-004     | Dev 5   |
 * | auctions.controller.ts | ADM-001     | Dev 4   |
 * | products.controller.ts | ADM-005     | Dev 3   |
 * | orders.controller.ts   | ADM-006     | Dev 3   |
 *
 * ADM-003 (หมวดหมู่, Dev 2) **ไม่ได้อยู่ที่นี่** — อยู่ที่ `src/categories/`
 * เพราะ `GET /categories` เป็น endpoint สาธารณะ
 *
 * ไฟล์นี้เป็นจุดเดียวที่ทุกคนต้องแก้ร่วมกัน (ตอนเพิ่ม controller ของตัวเอง)
 * ให้ merge `dev` เข้ามาก่อนแก้เสมอเพื่อลด conflict
 */
@Module({
  controllers: [
    AdminUsersController,
    AdminAuctionsController,
    AdminProductsController,
    AdminOrdersController,
    AdminActionsController,
  ],
  providers: [
    AdminUsersService,
    AdminAuctionsService,
    AdminProductsService,
    AdminOrdersService,
    AdminActionsService,
  ],
})
export class AdminModule {}
