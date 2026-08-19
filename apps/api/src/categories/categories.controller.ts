import { Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';

/**
 * ADM-003 — Category management (owner: Dev 2)
 *
 * ชุดหมวดหมู่เดียวใช้ร่วมกันทั้ง Auction และ E-commerce (SRS §1.1, §4.4, §5.1)
 * ห้ามเพิ่ม field `scope` แยกตามโมดูล — ดู docs/architecture/adr/0001.
 *
 * โมดูลนี้อยู่นอก `admin/` เพราะ `GET /categories` เป็น endpoint สาธารณะที่
 * guest ใช้กรองแคตตาล็อก (PROD-003) และผู้ขายใช้ตอนสร้าง draft (AUC-001)
 * จึงใส่ guard เป็นราย endpoint แทนการ guard ทั้ง controller
 *
 * TODO(Dev 2): เมื่อ AUTH-008 พร้อม ให้ใส่
 *   `@UseGuards(AccessTokenGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`
 *   ในทุก endpoint ที่ทำเครื่องหมาย ADMIN ไว้ด้านล่าง (findAllForAdmin, create,
 *   update, activate, deactivate) — `findAll` ต้องไม่มี guard
 * TODO(Dev 2): เพิ่ม DTO + `class-validator` ตาม SRS §3 และ `@nestjs/swagger` ตาม §5.2
 */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /** public — คืนเฉพาะหมวดหมู่ที่ isActive = true (2 ระดับ: root + children) */
  @Get()
  findAll() {
    return this.categoriesService.findActiveTree();
  }

  /** ADMIN — คืนทั้ง tree รวมหมวดหมู่ที่ถูกปิดใช้งานแล้ว */
  @Get('admin')
  findAllForAdmin() {
    return this.categoriesService.findAdminTree();
  }

  /**
   * ADMIN — สร้างหมวดหมู่ใหม่
   * body: { name: string; description?: string; parentId?: string }
   * - slug สร้างจาก name อัตโนมัติ และต้อง unique
   * - ถ้าส่ง parentId มา: parent ต้องมีอยู่จริง, ต้องเป็น root (parentId === null)
   *   และต้อง isActive — บังคับความลึกไม่เกิน 2 ระดับที่ service layer
   */
  @Post()
  create() {
    return this.categoriesService.createCategory();
  }

  /**
   * ADMIN — แก้ไขหมวดหมู่
   * body: { name?: string; description?: string } (ต้องมีอย่างน้อย 1 field)
   */
  @Patch(':categoryId')
  update(@Param('categoryId') categoryId: string) {
    return this.categoriesService.updateCategory(categoryId);
  }

  /** ADMIN — เปิดใช้งานหมวดหมู่ (parent ต้อง active ก่อนจึงจะเปิด child ได้) */
  @Patch(':categoryId/activate')
  activate(@Param('categoryId') categoryId: string) {
    return this.categoriesService.setCategoryActivation(categoryId, true);
  }

  /**
   * ADMIN — ปิดใช้งานหมวดหมู่
   * ADM-003 ระบุว่า "ปิดใช้งาน ไม่ใช่ลบทิ้งถาวร" จึงไม่มี DELETE endpoint
   */
  @Patch(':categoryId/deactivate')
  deactivate(@Param('categoryId') categoryId: string) {
    return this.categoriesService.setCategoryActivation(categoryId, false);
  }
}
