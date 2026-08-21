import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dtos/category.dto';

/**
 * ADM-003 — Category management (owner: Dev 2)
 *
 * One set of categories serves both Auction and E-commerce (SRS 1.1, 4.4,
 * 5.1). Never add a per-module `scope` field — see ADR-0001.
 *
 * This module sits outside `admin/` because `GET /categories` is public:
 * guests filter the catalogue with it (PROD-003) and sellers pick from it when
 * drafting an auction (AUC-001). Guards are therefore per endpoint rather than
 * on the whole controller.
 */
@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Active category tree',
    description:
      'Public: a signed-out visitor browsing the catalogue needs this, so it ' +
      'carries @Public() and returns active roots with their active children.'
  })
  findAll() {
    return this.categoriesService.findActiveTree();
  }

  @Roles('ADMIN')
  @Get('admin')
  @ApiOperation({
    summary: 'ADM-003 — full tree, deactivated branches included'
  })
  findAllForAdmin() {
    return this.categoriesService.findAdminTree();
  }

  @Roles('ADMIN')
  @Post()
  @ApiOperation({
    summary: 'ADM-003 — create a category',
    description:
      'The slug is derived from the name and must be unique. A parent, if ' +
      'given, must itself be a root and active.'
  })
  @ApiConflictResponse({ description: 'Slug already taken' })
  @ApiBadRequestResponse({ description: 'Unusable name or parent' })
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser('id') adminUserId: string
  ) {
    return this.categoriesService.createCategory(dto, adminUserId);
  }

  @Roles('ADMIN')
  @Patch(':categoryId')
  @ApiOperation({ summary: 'ADM-003 — rename or re-describe a category' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  update(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser('id') adminUserId: string
  ) {
    return this.categoriesService.updateCategory(categoryId, dto, adminUserId);
  }

  @Roles('ADMIN')
  @Patch(':categoryId/activate')
  @ApiOperation({
    summary: 'ADM-003 — activate a category',
    description: 'A child cannot come back while its parent is deactivated.'
  })
  @ApiBadRequestResponse({ description: 'Parent is still deactivated' })
  activate(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @CurrentUser('id') adminUserId: string
  ) {
    return this.categoriesService.setCategoryActivation(
      categoryId,
      true,
      adminUserId
    );
  }

  @Roles('ADMIN')
  @Patch(':categoryId/deactivate')
  @ApiOperation({
    summary: 'ADM-003 — deactivate a category',
    description:
      'ADM-003 says a category in use is deactivated, never deleted, which is ' +
      'why this module has no DELETE at all. Deactivating a root takes its ' +
      'children down with it.'
  })
  deactivate(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @CurrentUser('id') adminUserId: string
  ) {
    return this.categoriesService.setCategoryActivation(
      categoryId,
      false,
      adminUserId
    );
  }
}
