import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
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
import { AdminOverviewController } from './overview.controller';
import { AdminOverviewService } from './overview.service';
import { AdminSupportController } from './support.controller';
import { AdminSupportService } from './support.service';

/**
 * Admin module — ADM-001, ADM-002, ADM-004, ADM-005, ADM-006
 *
 * **One Admin role covers both modules** — there is no separate auction admin
 * and e-commerce admin (SRS §2, §5.1, §5.2). Full reasoning in
 * `docs/architecture/adr/0001-single-admin-role-and-shared-category-set.md`
 *
 * Split at the **file** level by requirement owner, so four people can work in
 * parallel without colliding:
 *
 * | File                   | Requirement | Owner   |
 * | ---------------------- | ----------- | ------- |
 * | users.controller.ts    | ADM-002     | Dev 5   |
 * | actions.controller.ts  | ADM-004     | Dev 5   |
 * | auctions.controller.ts | ADM-001     | Dev 4   |
 * | products.controller.ts | ADM-005     | Dev 3   |
 * | orders.controller.ts   | ADM-006     | Dev 3   |
 * | support.controller.ts  | AI-001 escalation | Dev 5 |
 *
 * ADM-003 (categories, Dev 2) **is not here** — it lives in `src/categories/`
 * because `GET /categories` is a public endpoint.
 *
 * This file is the one place everyone has to edit together (when adding their
 * own controller). Always merge `dev` in before editing to reduce conflicts.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    AdminUsersController,
    AdminAuctionsController,
    AdminProductsController,
    AdminOrdersController,
    AdminActionsController,
    AdminOverviewController,
    AdminSupportController
  ],
  providers: [
    AdminUsersService,
    AdminAuctionsService,
    AdminProductsService,
    AdminOrdersService,
    AdminActionsService,
    AdminOverviewService,
    AdminSupportService
  ]
})
export class AdminModule {}
