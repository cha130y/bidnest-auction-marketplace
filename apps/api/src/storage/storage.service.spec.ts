import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { StorageService } from './storage.service';

/**
 * The url→key recovery, which decides whether removing a picture also removes
 * the file behind it.
 *
 * Unit tests rather than e2e because the interesting inputs are urls the store
 * would have produced, and a machine without Cloudinary configured — which is
 * every machine on this team so far — cannot produce one.
 */
describe('StorageService — recognising our own urls', () => {
  const CLOUD = 'bidnest-cloud';
  const USER_ID = '22222222-2222-4222-8222-222222222222';

  const serviceWith = async (env: Record<string, string | undefined>) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] }
        }
      ]
    }).compile();

    return moduleRef.get(StorageService);
  };

  const configured = () =>
    serviceWith({
      CLOUDINARY_CLOUD_NAME: CLOUD,
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret'
    });

  const url = (path: string) => `https://res.cloudinary.com/${CLOUD}/${path}`;

  it('reads the key out of a url the store handed us', async () => {
    const storage = await configured();

    expect(
      storage.storageKeyFromUrl(
        url(`image/upload/v1724500000/bidnest/pending/${USER_ID}/abc123.jpg`)
      )
    ).toBe(`bidnest/pending/${USER_ID}/abc123`);
  });

  it('reads a nested folder as part of the key', async () => {
    const storage = await configured();

    expect(
      storage.storageKeyFromUrl(
        url('image/upload/v1/bidnest/products/a-product/abc123.png')
      )
    ).toBe('bidnest/products/a-product/abc123');
  });

  /**
   * Every url the store hands back has a version in it. Requiring one costs
   * nothing on a real url and is what makes the transformation case below
   * answer null instead of a key that points at the wrong thing.
   */
  it('refuses a url with no version segment', async () => {
    const storage = await configured();

    expect(
      storage.storageKeyFromUrl(url('image/upload/bidnest/pending/u/abc.jpg'))
    ).toBeNull();
  });

  it('strips the extension only, not every dot in the name', async () => {
    const storage = await configured();

    expect(
      storage.storageKeyFromUrl(
        url('image/upload/v1/bidnest/pending/u/my.photo.final.jpg')
      )
    ).toBe('bidnest/pending/u/my.photo.final');
  });

  it('keeps a name that has no extension at all', async () => {
    const storage = await configured();

    expect(storage.storageKeyFromUrl(url('image/upload/v1/plain'))).toBe(
      'plain'
    );
  });

  it('refuses a url from a different cloud account', async () => {
    const storage = await configured();

    expect(
      storage.storageKeyFromUrl(
        'https://res.cloudinary.com/somebody-else/image/upload/v1/theirs.jpg'
      )
    ).toBeNull();
  });

  it('refuses a url from somewhere else entirely', async () => {
    const storage = await configured();

    expect(
      storage.storageKeyFromUrl('https://placehold.co/600x400')
    ).toBeNull();
  });

  it('refuses something that is not a url', async () => {
    const storage = await configured();

    expect(storage.storageKeyFromUrl('not a url')).toBeNull();
    expect(storage.storageKeyFromUrl('')).toBeNull();
  });

  /**
   * A transformed url names a *derived* image. Deleting the key under it would
   * take the original with it, so this fails closed rather than guessing.
   */
  it('refuses a url with a transformation in the path', async () => {
    const storage = await configured();

    expect(
      storage.storageKeyFromUrl(
        url('image/upload/w_200,h_200/v1/bidnest/pending/u/abc.jpg')
      )
    ).toBeNull();
  });

  it('recognises nothing when Cloudinary is not configured', async () => {
    const storage = await serviceWith({});

    expect(
      storage.storageKeyFromUrl(
        url(`image/upload/v1/bidnest/pending/${USER_ID}/abc.jpg`)
      )
    ).toBeNull();
  });

  /**
   * The pair that matters: a key recovered from a url this service produced has
   * to sit inside the prefix this service reports. If the upload folder and the
   * prefix ever drift apart, every picture silently stops being deletable —
   * which is the bug this whole change exists to fix.
   */
  it('reports a prefix that a real pending key actually starts with', async () => {
    const storage = await configured();

    const key = storage.storageKeyFromUrl(
      url(`image/upload/v1724500000/bidnest/pending/${USER_ID}/abc123.jpg`)
    );

    expect(key).not.toBeNull();
    expect(key?.startsWith(storage.pendingPrefix(USER_ID))).toBe(true);
  });

  it('does not let one user id prefix-match another', async () => {
    const storage = await configured();

    const key = storage.storageKeyFromUrl(
      url('image/upload/v1/bidnest/pending/abcdef/photo.jpg')
    );

    expect(key?.startsWith(storage.pendingPrefix('abcdef'))).toBe(true);
    expect(key?.startsWith(storage.pendingPrefix('abc'))).toBe(false);
  });
});
