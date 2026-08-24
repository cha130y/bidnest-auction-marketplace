import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MAX_PRODUCT_IMAGES } from './constants/product-image.constant';
import { ProductService } from './product.service';

/**
 * PROD-002 — the picture side of a listing.
 *
 * Scoped to the image methods on purpose. The rest of ProductService is
 * covered end to end in `test/ecommerce.e2e-spec.ts`; these are here because
 * an upload that half-succeeds cannot be reached from the outside — there is
 * no request that makes Cloudinary fail on demand.
 */
describe('ProductService — images', () => {
  const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
  const SELLER_ID = '22222222-2222-4222-8222-222222222222';
  const IMAGE_ID = '33333333-3333-4333-8333-333333333333';

  let service: ProductService;
  let prisma: {
    product: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    productImage: {
      count: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    category: { findUnique: jest.Mock };
    orderItem: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let storage: {
    isConfigured: jest.Mock;
    uploadProductImage: jest.Mock;
    deleteImage: jest.Mock;
    pendingPrefix: jest.Mock;
    storageKeyFromUrl: jest.Mock;
  };

  const file = { buffer: Buffer.from('a photo') };

  /** A row shaped the way `productOwnerSelect` returns one. */
  const productRow = () => ({
    id: PRODUCT_ID,
    sellerId: SELLER_ID,
    categoryId: 'category',
    title: 'A listing',
    description: 'Described',
    price: { toString: () => '1000' },
    stockQty: 3,
    condition: 'NEW',
    status: 'ACTIVE',
    quantityDiscountMinQty: null,
    quantityDiscountPercent: null,
    negotiationFloor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    images: [],
    category: { id: 'category', name: 'Watches', slug: 'watches' },
    seller: { id: SELLER_ID, profile: { displayName: 'Seller' } }
  });

  /** What `findOwnedProduct` reads before anything else runs. */
  const ownedProduct = (status = 'ACTIVE') => ({
    id: PRODUCT_ID,
    sellerId: SELLER_ID,
    status,
    price: { toString: () => '1000' },
    stockQty: 3,
    negotiationFloor: null,
    quantityDiscountMinQty: null,
    quantityDiscountPercent: null
  });

  beforeEach(async () => {
    prisma = {
      product: {
        create: jest.fn().mockResolvedValue(productRow()),
        findUnique: jest.fn().mockResolvedValue(ownedProduct()),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(productRow())
      },
      productImage: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn()
      },
      category: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
      orderItem: { count: jest.fn() },
      // Hands the callback the same mock, so assertions can read every call the
      // transaction made without a second layer of fakes.
      $transaction: jest.fn((run: (tx: unknown) => unknown) => run(prisma))
    };
    storage = {
      isConfigured: jest.fn().mockReturnValue(true),
      uploadProductImage: jest.fn().mockResolvedValue({
        storageKey: 'bidnest/products/x/abc',
        url: 'https://cdn.example/abc.jpg'
      }),
      deleteImage: jest.fn().mockResolvedValue(undefined),
      pendingPrefix: jest.fn((userId: string) => `bidnest/pending/${userId}/`),
      // Nothing is one of ours until a test says so, which is what a url like
      // `placehold.co` — every fixture in the e2e suite — actually is.
      storageKeyFromUrl: jest.fn().mockReturnValue(null)
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage }
      ]
    }).compile();

    service = moduleRef.get(ProductService);
  });

  /**
   * PROD-001 — which pictures on a new listing get the key that can delete
   * their file, and which get one that cannot.
   *
   * Not reachable end to end: it takes a url the store actually issued, and no
   * machine on this team has Cloudinary configured to issue one.
   */
  describe('create — storage keys', () => {
    const PENDING = `bidnest/pending/${SELLER_ID}/abc123`;
    const pendingUrl = (key: string) =>
      `https://res.cloudinary.com/bidnest/image/upload/v1/${key}.jpg`;

    const dto = (imageUrls: string[]) => ({
      title: 'A listing',
      description: 'Described',
      categoryId: 'category',
      price: 1000,
      stockQty: 3,
      condition: 'NEW' as const,
      imageUrls
    });

    /** The image rows `create` asked Prisma to write. */
    const writtenImages = () => {
      const args = (
        prisma.product.create.mock.calls as {
          data: {
            images: {
              create: { url: string; storageKey: string; isPrimary: boolean }[];
            };
          };
        }[][]
      )[0][0];

      return args.data.images.create;
    };

    /** Recognises `url` as ours and filed under `key`. */
    const uploadedAs = (pairs: Record<string, string>) => {
      storage.storageKeyFromUrl.mockImplementation(
        (url: string) => pairs[url] ?? null
      );
    };

    it('keeps the key the store issued for the seller’s own upload', async () => {
      const url = pendingUrl(PENDING);
      uploadedAs({ [url]: PENDING });

      await service.create(SELLER_ID, dto([url]));

      expect(writtenImages()).toEqual([
        expect.objectContaining({ url, storageKey: PENDING, isPrimary: true })
      ]);
    });

    it('invents a key for a picture we did not store', async () => {
      const url = 'https://placehold.co/600x400';

      await service.create(SELLER_ID, dto([url]));

      const [image] = writtenImages();
      expect(image.url).toBe(url);
      expect(image.storageKey).not.toBe(url);
      expect(image.storageKey.startsWith(SELLER_ID)).toBe(true);
      // Nothing of ours is behind it, so nothing was looked up either.
      expect(prisma.productImage.findMany).not.toHaveBeenCalled();
    });

    /**
     * The one that matters for safety. Attaching somebody else's upload and
     * then deleting the picture would destroy their file.
     */
    it('will not claim a key from another seller’s folder', async () => {
      const theirs = 'bidnest/pending/99999999-9999-4999-8999-999999999999/x';
      const url = pendingUrl(theirs);
      uploadedAs({ [url]: theirs });

      await service.create(SELLER_ID, dto([url]));

      expect(writtenImages()[0].storageKey).not.toBe(theirs);
    });

    it('claims a key once when the same picture is sent twice', async () => {
      const url = pendingUrl(PENDING);
      uploadedAs({ [url]: PENDING });

      await service.create(SELLER_ID, dto([url, url]));

      const [first, second] = writtenImages();
      expect(first.storageKey).toBe(PENDING);
      expect(second.storageKey).not.toBe(PENDING);
    });

    it('leaves a key alone when another listing already holds it', async () => {
      const url = pendingUrl(PENDING);
      uploadedAs({ [url]: PENDING });
      prisma.productImage.findMany.mockResolvedValue([{ storageKey: PENDING }]);

      await service.create(SELLER_ID, dto([url]));

      expect(writtenImages()[0].storageKey).not.toBe(PENDING);
    });
  });

  describe('addImage', () => {
    it('files the picture and writes the row that points at it', async () => {
      prisma.product.findFirst.mockResolvedValue({
        _count: { images: 0 },
        images: []
      });

      await service.addImage(PRODUCT_ID, SELLER_ID, file, 'Front view');

      expect(storage.uploadProductImage).toHaveBeenCalledWith(
        file.buffer,
        PRODUCT_ID
      );
      expect(prisma.productImage.create).toHaveBeenCalledWith({
        data: {
          productId: PRODUCT_ID,
          storageKey: 'bidnest/products/x/abc',
          url: 'https://cdn.example/abc.jpg',
          altText: 'Front view',
          position: 0,
          isPrimary: true
        }
      });
    });

    it('takes the next free slot rather than the count', async () => {
      // Two pictures, but the second was removed and re-added: positions 0 and
      // 3. Reusing the count would collide with @@unique([productId, position]).
      prisma.product.findFirst.mockResolvedValue({
        _count: { images: 2 },
        images: [{ position: 3 }]
      });

      await service.addImage(PRODUCT_ID, SELLER_ID, file);

      const [call] = prisma.productImage.create.mock.calls as {
        data: { position: number; isPrimary: boolean };
      }[][];
      expect(call[0].data.position).toBe(4);
      expect(call[0].data.isPrimary).toBe(false);
    });

    it('refuses a listing that is already full, without uploading', async () => {
      prisma.productImage.count.mockResolvedValue(MAX_PRODUCT_IMAGES);

      await expect(
        service.addImage(PRODUCT_ID, SELLER_ID, file)
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storage.uploadProductImage).not.toHaveBeenCalled();
    });

    it('reports a store that is down as unavailable, not as a bad request', async () => {
      storage.uploadProductImage.mockRejectedValue(new Error('cloudinary 500'));

      await expect(
        service.addImage(PRODUCT_ID, SELLER_ID, file)
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('removes the uploaded file when the row cannot be written', async () => {
      prisma.product.findFirst.mockResolvedValue({
        _count: { images: 0 },
        images: []
      });
      prisma.productImage.create.mockRejectedValue(new Error('write failed'));

      await expect(
        service.addImage(PRODUCT_ID, SELLER_ID, file)
      ).rejects.toThrow('write failed');

      // Otherwise the picture sits in Cloudinary forever with nothing
      // pointing at it and nobody aware it is there.
      expect(storage.deleteImage).toHaveBeenCalledWith(
        'bidnest/products/x/abc'
      );
    });

    it('leaves an admin suspension for the admin to lift', async () => {
      prisma.product.findUnique.mockResolvedValue(ownedProduct('SUSPENDED'));

      await expect(
        service.addImage(PRODUCT_ID, SELLER_ID, file)
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(storage.uploadProductImage).not.toHaveBeenCalled();
    });

    it('will not edit a removed listing back to life', async () => {
      prisma.product.findUnique.mockResolvedValue(ownedProduct('REMOVED'));

      await expect(
        service.addImage(PRODUCT_ID, SELLER_ID, file)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a listing somebody else owns', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...ownedProduct(),
        sellerId: 'somebody-else'
      });

      await expect(
        service.addImage(PRODUCT_ID, SELLER_ID, file)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('removeImage', () => {
    it('keeps the last picture — PROD-001 wants at least one', async () => {
      prisma.productImage.findFirst.mockResolvedValue({
        id: IMAGE_ID,
        storageKey: 'bidnest/products/x/abc',
        isPrimary: true
      });
      prisma.productImage.count.mockResolvedValue(1);

      await expect(
        service.removeImage(PRODUCT_ID, SELLER_ID, IMAGE_ID)
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.productImage.delete).not.toHaveBeenCalled();
      expect(storage.deleteImage).not.toHaveBeenCalled();
    });

    it('hands primary to the next picture when the primary goes', async () => {
      prisma.productImage.findFirst
        .mockResolvedValueOnce({
          id: IMAGE_ID,
          storageKey: 'bidnest/products/x/abc',
          isPrimary: true
        })
        .mockResolvedValueOnce({ id: 'next-image' });
      prisma.productImage.count.mockResolvedValue(3);

      await service.removeImage(PRODUCT_ID, SELLER_ID, IMAGE_ID);

      expect(prisma.productImage.update).toHaveBeenCalledWith({
        where: { id: 'next-image' },
        data: { isPrimary: true }
      });
      expect(storage.deleteImage).toHaveBeenCalledWith(
        'bidnest/products/x/abc'
      );
    });

    it('leaves primary alone when a secondary picture goes', async () => {
      prisma.productImage.findFirst.mockResolvedValue({
        id: IMAGE_ID,
        storageKey: 'bidnest/products/x/abc',
        isPrimary: false
      });
      prisma.productImage.count.mockResolvedValue(3);

      await service.removeImage(PRODUCT_ID, SELLER_ID, IMAGE_ID);

      expect(prisma.productImage.update).not.toHaveBeenCalled();
    });

    it('does not report a picture that is not on this listing', async () => {
      prisma.productImage.findFirst.mockResolvedValue(null);

      await expect(
        service.removeImage(PRODUCT_ID, SELLER_ID, IMAGE_ID)
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('still returns the listing when the store cannot delete the file', async () => {
      prisma.productImage.findFirst.mockResolvedValue({
        id: IMAGE_ID,
        storageKey: 'bidnest/products/x/abc',
        isPrimary: false
      });
      prisma.productImage.count.mockResolvedValue(2);
      storage.deleteImage.mockRejectedValue(new Error('cloudinary 500'));

      // The row is already gone and the caller asked for the picture to go.
      // A file left behind is the store's problem to sweep, not theirs.
      await expect(
        service.removeImage(PRODUCT_ID, SELLER_ID, IMAGE_ID)
      ).resolves.toMatchObject({ id: PRODUCT_ID });
    });
  });
});
