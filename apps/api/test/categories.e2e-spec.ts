import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { PrismaService } from './../src/prisma/prisma.service';
import { authRegistry } from './helpers/auth';

/**
 * ADM-003 end to end. The public tree is the part other modules depend on:
 * guests filter the catalogue with it (PROD-003) and sellers pick from it when
 * drafting an auction (AUC-001).
 */
describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let server: App;
  let authOf: (userId: string) => string;

  const run = Date.now();
  let adminId: string;
  let userId: string;
  const createdCategoryIds: string[] = [];

  const createUser = async (kind: string, role: 'USER' | 'ADMIN') => {
    const user = await prisma.user.create({
      data: {
        email: `cat-${kind}-${run}@example.com`,
        role,
        profile: {
          create: { firstName: kind, displayName: `${kind}-${run}` }
        }
      },
      select: { id: true }
    });
    return user.id;
  };

  /** Remembers the id so afterAll can clean up whatever a test created. */
  const track = <T extends { id: string }>(body: T): T => {
    createdCategoryIds.push(body.id);
    return body;
  };

  const createCategory = async (
    name: string,
    extra: Record<string, unknown> = {}
  ) => {
    const response = await request(server)
      .post('/categories')
      .set('Authorization', authOf(adminId))
      .send({ name, ...extra })
      .expect(201);
    return track(response.body as { id: string; slug: string });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    prisma = app.get(PrismaService);
    await app.init();
    server = app.getHttpServer();

    adminId = await createUser('admin', 'ADMIN');
    userId = await createUser('user', 'USER');
    authOf = await authRegistry(app, [adminId, userId]);
  });

  afterAll(async () => {
    const ids = [adminId, userId];
    await prisma.adminAction.deleteMany({ where: { adminUserId: adminId } });
    // Children first: the parent link would block the delete otherwise.
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds }, parentId: { not: null } }
    });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } }
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('GET /categories', () => {
    it('is readable without a token', async () => {
      const response = await request(server).get('/categories').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('shows an active category and hides a deactivated one', async () => {
      const shown = await createCategory(`Shown ${run}`);
      const hidden = await createCategory(`Hidden ${run}`);

      await request(server)
        .patch(`/categories/${hidden.id}/deactivate`)
        .set('Authorization', authOf(adminId))
        .expect(200);

      const response = await request(server).get('/categories').expect(200);
      const ids = (response.body as { id: string }[]).map((c) => c.id);

      expect(ids).toContain(shown.id);
      expect(ids).not.toContain(hidden.id);
    });

    it('nests children under their parent', async () => {
      const parent = await createCategory(`Parent ${run}`);
      const child = await createCategory(`Child ${run}`, {
        parentId: parent.id
      });

      const response = await request(server).get('/categories').expect(200);
      const found = (
        response.body as { id: string; children: { id: string }[] }[]
      ).find((c) => c.id === parent.id);

      expect(found?.children.map((c) => c.id)).toContain(child.id);
    });
  });

  describe('admin endpoints', () => {
    it('turns away a signed-out caller', () => {
      return request(server).get('/categories/admin').expect(401);
    });

    it('turns away a plain USER', () => {
      return request(server)
        .get('/categories/admin')
        .set('Authorization', authOf(userId))
        .expect(403);
    });

    it('lets an ADMIN see deactivated categories too', async () => {
      const hidden = await createCategory(`AdminOnly ${run}`);
      await request(server)
        .patch(`/categories/${hidden.id}/deactivate`)
        .set('Authorization', authOf(adminId))
        .expect(200);

      const response = await request(server)
        .get('/categories/admin')
        .set('Authorization', authOf(adminId))
        .expect(200);

      expect((response.body as { id: string }[]).map((c) => c.id)).toContain(
        hidden.id
      );
    });
  });

  describe('POST /categories', () => {
    it('derives a slug from the name', async () => {
      const created = await createCategory(`Slug Me ${run}`);

      expect(created.slug).toBe(`slug-me-${run}`);
    });

    it('keeps Thai names readable in the slug', async () => {
      const created = await createCategory(`เครื่องใช้ไฟฟ้า ${run}`);

      expect(created.slug).toBe(`เครื่องใช้ไฟฟ้า-${run}`);
    });

    it('refuses a duplicate slug', async () => {
      const first = await createCategory(`Dup ${run}`);

      await request(server)
        .post('/categories')
        .set('Authorization', authOf(adminId))
        .send({ name: first.slug.replace(/-/g, ' ') })
        .expect(409);
    });

    it('refuses a name with nothing sluggable in it', () => {
      return request(server)
        .post('/categories')
        .set('Authorization', authOf(adminId))
        .send({ name: '---' })
        .expect(400);
    });

    it('refuses to nest three levels deep', async () => {
      const parent = await createCategory(`Deep ${run}`);
      const child = await createCategory(`DeepChild ${run}`, {
        parentId: parent.id
      });

      await request(server)
        .post('/categories')
        .set('Authorization', authOf(adminId))
        .send({ name: `DeepGrandchild ${run}`, parentId: child.id })
        .expect(400);
    });

    it('refuses a deactivated parent', async () => {
      const parent = await createCategory(`ColdParent ${run}`);
      await request(server)
        .patch(`/categories/${parent.id}/deactivate`)
        .set('Authorization', authOf(adminId))
        .expect(200);

      await request(server)
        .post('/categories')
        .set('Authorization', authOf(adminId))
        .send({ name: `ColdChild ${run}`, parentId: parent.id })
        .expect(400);
    });
  });

  describe('activation (ADM-003)', () => {
    it('takes children down with the parent', async () => {
      const parent = await createCategory(`Cascade ${run}`);
      const child = await createCategory(`CascadeChild ${run}`, {
        parentId: parent.id
      });

      await request(server)
        .patch(`/categories/${parent.id}/deactivate`)
        .set('Authorization', authOf(adminId))
        .expect(200);

      const stored = await prisma.category.findUnique({
        where: { id: child.id }
      });
      expect(stored?.isActive).toBe(false);
    });

    it('will not bring a child back before its parent', async () => {
      const parent = await createCategory(`Order ${run}`);
      const child = await createCategory(`OrderChild ${run}`, {
        parentId: parent.id
      });
      await request(server)
        .patch(`/categories/${parent.id}/deactivate`)
        .set('Authorization', authOf(adminId))
        .expect(200);

      await request(server)
        .patch(`/categories/${child.id}/activate`)
        .set('Authorization', authOf(adminId))
        .expect(400);
    });

    it('offers no way to delete a category', async () => {
      const category = await createCategory(`NoDelete ${run}`);

      await request(server)
        .delete(`/categories/${category.id}`)
        .set('Authorization', authOf(adminId))
        .expect(404);
    });
  });

  describe('audit trail (ADM-004)', () => {
    it('records every write against the acting admin', async () => {
      const category = await createCategory(`Audited ${run}`);
      await request(server)
        .patch(`/categories/${category.id}`)
        .set('Authorization', authOf(adminId))
        .send({ description: 'edited' })
        .expect(200);
      await request(server)
        .patch(`/categories/${category.id}/deactivate`)
        .set('Authorization', authOf(adminId))
        .expect(200);

      const actions = await prisma.adminAction.findMany({
        where: { categoryId: category.id },
        select: { actionType: true, adminUserId: true }
      });

      expect(actions.map((a) => a.actionType).sort()).toEqual([
        'CREATE_CATEGORY',
        'DEACTIVATE_CATEGORY',
        'UPDATE_CATEGORY'
      ]);
      expect(actions.every((a) => a.adminUserId === adminId)).toBe(true);
    });

    it('writes nothing when the state does not actually change', async () => {
      const category = await createCategory(`NoOp ${run}`);

      // Already active, so activating again is not an event.
      await request(server)
        .patch(`/categories/${category.id}/activate`)
        .set('Authorization', authOf(adminId))
        .expect(200);

      const actions = await prisma.adminAction.findMany({
        where: { categoryId: category.id }
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].actionType).toBe('CREATE_CATEGORY');
    });
  });
});
