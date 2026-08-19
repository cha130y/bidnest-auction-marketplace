import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * ADM-006 — Order overview (owner: Dev 3)
 *
 * Read-only ตาม ADM-006 — ห้ามเพิ่มเมธอดที่เขียนข้อมูลลง orders ที่นี่
 *
 * ข้อควรระวังด้านความเป็นส่วนตัว (SRS §6): คืนเฉพาะข้อมูลระดับสรุปที่ ADM-006
 * ระบุไว้ (buyer, seller, สถานะ, ยอดรวม) — ห้ามคืนที่อยู่จัดส่งเต็ม หรือเนื้อหา
 * การสนทนา buyer/seller ซึ่ง §6 ห้าม admin เข้าถึงใน V1
 */
@Injectable()
export class AdminOrdersService {
  listOrders(): never {
    throw new NotImplementedException('ADM-006 listOrders');
  }
}
