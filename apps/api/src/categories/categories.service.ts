import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dtos/category.dto';
import { AdminActionType } from '../../generated/prisma/enums';

/** Prisma raises P2002 when a write violates a unique index. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

/**
 * Turns a display name into a URL-safe slug, preserving the original script:
 * Thai has no case and no word breaks, so transliterating would only make the
 * result harder to read.
 *
 * `\p{M}` matters more than it looks. Thai vowels and tone marks are combining
 * marks, not letters, so a letters-and-digits-only pattern quietly eats them
 * and turns "เครื่องใช้ไฟฟ้า" into "เคร-องใช-ไฟฟ-า".
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

const categorySelect = {
  id: true,
  parentId: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
} as const;

/**
 * ADM-003 — Category management (owner: Dev 2)
 *
 * One set of categories serves both Auction and E-commerce (SRS 1.1, 4.4,
 * 5.1). Never add a per-module `scope` field — see ADR-0001.
 *
 * Every write pairs the category change with an `admin_actions` row inside one
 * `$transaction`, so ADM-004 is guaranteed at the database level: an admin
 * action without an audit trail cannot exist.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public tree — active roots with their active children only. */
  findActiveTree() {
    return this.prisma.category.findMany({
      where: { parentId: null, isActive: true },
      select: {
        ...categorySelect,
        children: {
          where: { isActive: true },
          select: categorySelect,
          orderBy: { name: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });
  }

  /** Admin tree — everything, deactivated branches included. */
  findAdminTree() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      select: {
        ...categorySelect,
        children: { select: categorySelect, orderBy: { name: 'asc' } }
      },
      orderBy: { name: 'asc' }
    });
  }

  async createCategory(dto: CreateCategoryDto, adminUserId: string) {
    const slug = slugify(dto.name);
    if (!slug) {
      throw new BadRequestException('Name must contain a letter or a digit');
    }

    if (dto.parentId) {
      await this.assertUsableParent(dto.parentId);
    }

    return this.prisma
      .$transaction(async (tx) => {
        const category = await tx.category.create({
          data: {
            name: dto.name,
            slug,
            description: dto.description ?? null,
            parentId: dto.parentId ?? null,
            createdByAdminId: adminUserId
          },
          select: categorySelect
        });

        await tx.adminAction.create({
          data: {
            adminUserId,
            categoryId: category.id,
            actionType: AdminActionType.CREATE_CATEGORY,
            note: `Created category "${category.name}"`
          }
        });

        return category;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `A category with the slug "${slug}" already exists`
          );
        }
        throw error;
      });
  }

  async updateCategory(
    categoryId: string,
    dto: UpdateCategoryDto,
    adminUserId: string
  ) {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    const existing = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true }
    });
    if (!existing) throw new NotFoundException('Category not found');

    // Renaming re-derives the slug so the two never drift apart.
    const slug = dto.name === undefined ? undefined : slugify(dto.name);
    if (slug !== undefined && !slug) {
      throw new BadRequestException('Name must contain a letter or a digit');
    }

    return this.prisma
      .$transaction(async (tx) => {
        const category = await tx.category.update({
          where: { id: categoryId },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name, slug }),
            ...(dto.description === undefined
              ? {}
              : { description: dto.description })
          },
          select: categorySelect
        });

        await tx.adminAction.create({
          data: {
            adminUserId,
            categoryId: category.id,
            actionType: AdminActionType.UPDATE_CATEGORY,
            note: `Updated category "${category.name}"`
          }
        });

        return category;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `A category with the slug "${slug ?? ''}" already exists`
          );
        }
        throw error;
      });
  }

  /**
   * ADM-003 — "หมวดหมู่ที่ถูกใช้งานอยู่แล้วจะถูกปิดใช้งาน ไม่ใช่ลบทิ้งถาวร", which is
   * why there is no delete anywhere in this service.
   */
  async setCategoryActivation(
    categoryId: string,
    isActive: boolean,
    adminUserId: string
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { ...categorySelect, parent: { select: { isActive: true } } }
    });
    if (!category) throw new NotFoundException('Category not found');

    // Already in the requested state: hand back the row without writing a
    // second audit entry for something that did not happen.
    if (category.isActive === isActive) {
      const { parent, ...rest } = category;
      void parent;
      return rest;
    }

    // A child under a deactivated parent would be unreachable in the public
    // tree, so the parent has to come back first.
    if (isActive && category.parentId && !category.parent?.isActive) {
      throw new BadRequestException(
        'Activate the parent category before its children'
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id: categoryId },
        data: { isActive },
        select: categorySelect
      });

      // Deactivating a root hides its children from the public tree already;
      // flipping them too keeps the stored state honest about what is live.
      if (!isActive && updated.parentId === null) {
        await tx.category.updateMany({
          where: { parentId: categoryId, isActive: true },
          data: { isActive: false }
        });
      }

      await tx.adminAction.create({
        data: {
          adminUserId,
          categoryId: updated.id,
          actionType: isActive
            ? AdminActionType.ACTIVATE_CATEGORY
            : AdminActionType.DEACTIVATE_CATEGORY,
          note: `${isActive ? 'Activated' : 'Deactivated'} category "${updated.name}"`
        }
      });

      return updated;
    });
  }

  /** The tree is two levels deep on purpose (ADR-0001). */
  private async assertUsableParent(parentId: string): Promise<void> {
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true, isActive: true }
    });

    if (!parent) throw new NotFoundException('Parent category not found');
    if (parent.parentId !== null) {
      throw new BadRequestException(
        'Categories are only two levels deep, so a child cannot be a parent'
      );
    }
    if (!parent.isActive) {
      throw new BadRequestException('Parent category is not active');
    }
  }
}
