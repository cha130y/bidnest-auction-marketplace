/**
 * Shared by seed-mock.ts and seed-mock-auction.ts — uploads locally-prepared
 * photos to Cloudinary and hands back the same {storageKey, url} shape the
 * app's own StorageService produces, so ProductImage/AuctionImage rows look
 * exactly like a real upload.
 *
 * Deliberately not StorageService: that forces unique_filename + overwrite:false
 * because every *user* upload must become its own file. Mock data wants the
 * opposite — the same source photo should resolve to the same Cloudinary asset
 * every time the seed re-runs, so re-seeding never piles up duplicates on a
 * free-tier account. A deterministic public_id + overwrite:true does that.
 *
 * Source photos live in prisma/mock-images/<group>/<slug>/ (see the README
 * there) and are never committed — only the Cloudinary copies are, indirectly,
 * as the url/storageKey written into the database. That makes a locally
 * dropped file a per-developer decoration, not something every teammate's
 * seed run reproduces; mock-image-urls.ts is what does — see fromExistingUrl.
 */
import { existsSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { v2 as cloudinary } from 'cloudinary';

export type StoredMockImage = { storageKey: string; url: string };

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// cwd, not __dirname: this file runs from dist/prisma after `nest build`, but
// the source photos live next to the .ts file in prisma/, which build never
// copies. The existing seed scripts already assume cwd is apps/api — that is
// where their `dotenv/config` import finds .env — so this makes the same
// assumption rather than a new one.
const MOCK_IMAGES_ROOT = join(process.cwd(), 'prisma', 'mock-images');

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  configured = Boolean(cloudName && apiKey && apiSecret);
  if (configured) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
  }
  return configured;
}

export const slugifyName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Image files inside prisma/mock-images/<group>/<slug>/, sorted for a
 * deterministic pick order. Empty when the folder doesn't exist yet — a
 * product/auction with no photo prepared falls back to the placeholder, it
 * never breaks the seed.
 */
export function findMockImages(
  group: 'products' | 'auctions',
  slug: string
): string[] {
  const dir = join(MOCK_IMAGES_ROOT, group, slug);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((name) => IMAGE_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort()
    .map((name) => join(dir, name));
}

// Same shape res.cloudinary.com always answers with:
//   .../image/upload/v<version>/<public_id>.<ext>
// A public_id is allowed to contain dots of its own, so only the last one —
// the extension's — is stripped. Mirrors StorageService.storageKeyFromUrl,
// duplicated rather than imported: that one is a NestJS-injectable method
// tied to ConfigService, not a plain function this script can call.
const CLOUDINARY_URL_RE =
  /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/v\d+\/(.+)$/;

/** Turns an already-uploaded Cloudinary url into the row shape the DB wants. */
export function fromExistingUrl(url: string): StoredMockImage {
  const match = CLOUDINARY_URL_RE.exec(url);
  if (!match) return { storageKey: url, url };

  const body = match[1];
  const dot = body.lastIndexOf('.');
  const storageKey = dot > 0 ? body.slice(0, dot) : body;
  return { storageKey, url };
}

// Keyed by the destination public_id, not the source path — several products
// can share one noun's photo (e.g. every "Ceramic Mug"), and this makes sure
// it is only ever uploaded once per run.
const uploadCache = new Map<string, Promise<StoredMockImage>>();

/**
 * Uploads one local file under a deterministic public_id, reusing an
 * in-flight/finished upload for the same id within this run. Returns null
 * when Cloudinary isn't configured, so the caller can fall back the same way
 * it does for a product with no photo prepared yet.
 */
export function uploadMockImage(
  filePath: string,
  publicId: string
): Promise<StoredMockImage> | null {
  if (!ensureConfigured()) return null;

  const cached = uploadCache.get(publicId);
  if (cached) return cached;

  const promise = cloudinary.uploader
    .upload(filePath, {
      public_id: publicId,
      overwrite: true,
      resource_type: 'image'
    })
    .then((result) => ({
      storageKey: result.public_id,
      url: result.secure_url
    }));

  uploadCache.set(publicId, promise);
  return promise;
}
