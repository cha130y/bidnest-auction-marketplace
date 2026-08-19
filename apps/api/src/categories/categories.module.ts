import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

/**
 * ADM-003 — Category management (owner: Dev 2)
 *
 * export CategoriesService ไว้เพราะ AUC-001 และ PROD-001 ต้องใช้ตรวจว่า
 * categoryId ที่ผู้ขายส่งมาเป็นหมวดหมู่ที่ active จริง (SRS §5.1)
 */
@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
