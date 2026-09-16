import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

/**
 * ADM-003 — Category management (owner: Dev 2)
 *
 * CategoriesService is exported because AUC-001 and PROD-001 use it to check
 * that the categoryId a seller sends is a genuinely active category (SRS §5.1)
 */
@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService]
})
export class CategoriesModule {}
