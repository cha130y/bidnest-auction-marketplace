import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiOptions } from 'cloudinary';
import { EnvVariable } from '../config/env.validation';

/** What the store hands back once a file is in it. */
export type StoredImage = {
  /** The provider's own identifier, kept so the file can be removed later. */
  storageKey: string;
  url: string;
};

type CloudinaryDeleteResult = { result: string };

/** The only host our own uploads are ever served from. */
const CLOUDINARY_HOST = 'res.cloudinary.com';

/** Where an upload waits when it has nothing to belong to yet. */
const PENDING_FOLDER_ROOT = 'bidnest/pending';

function isDeleteResult(value: unknown): value is CloudinaryDeleteResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'result' in value &&
    typeof value.result === 'string'
  );
}

/**
 * Where uploaded images live.
 *
 * Deliberately not inside the auction module. `AuctionImage` and
 * `ProductImage` have the same `storageKey`/`url` pair in the schema and the
 * same need; putting this under `auction/` would mean the e-commerce module
 * either reaches into it or grows a second copy. It knows nothing about
 * auctions beyond the folder it files them under.
 *
 * Cloudinary rather than a disk: a file written to the server's disk is gone
 * on the next deploy and invisible to a second instance, and the alternative
 * — committing an uploads folder — is worse.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly configured: boolean;
  /** Kept so a url can be recognised as one of ours — see storageKeyFromUrl. */
  private readonly cloudName?: string;

  constructor(config: ConfigService<EnvVariable, true>) {
    const cloudName = config.get('CLOUDINARY_CLOUD_NAME', { infer: true });
    const apiKey = config.get('CLOUDINARY_API_KEY', { infer: true });
    const apiSecret = config.get('CLOUDINARY_API_SECRET', { infer: true });

    this.configured = Boolean(cloudName && apiKey && apiSecret);
    this.cloudName = cloudName;

    if (!this.configured) {
      // Said once at startup rather than on every refused upload, so a
      // developer who did not expect it finds out before they try.
      this.logger.log(
        'Cloudinary is not configured; image upload will answer 503'
      );
      return;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
  }

  /**
   * Whether uploading is possible at all.
   *
   * Asked *before* a request is accepted rather than discovered when the
   * provider rejects it: the answer is known at startup, and a 503 that
   * arrives immediately is a better one than a failure after the file has
   * been read into memory and sent across the internet.
   */
  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * AUC-001 — files an auction image under its own auction.
   *
   * `unique_filename` with `overwrite: false`, so two uploads of the same
   * photo are two images rather than one silently replacing the other — the
   * seller decides what to remove, not the file name.
   */
  uploadAuctionImage(
    fileBuffer: Buffer,
    auctionId: string
  ): Promise<StoredImage> {
    return this.upload(fileBuffer, {
      folder: `bidnest/auctions/${auctionId}`,
      resource_type: 'image',
      unique_filename: true,
      overwrite: false
    });
  }

  /**
   * PROD-002 — files a listing image under its own product.
   *
   * Same options as an auction's, and a separate folder for the same reason
   * the ids are separate: a product and an auction can be cleaned up without
   * either knowing the other exists.
   */
  uploadProductImage(
    fileBuffer: Buffer,
    productId: string
  ): Promise<StoredImage> {
    return this.upload(fileBuffer, {
      folder: `bidnest/products/${productId}`,
      resource_type: 'image',
      unique_filename: true,
      overwrite: false
    });
  }

  /**
   * PROD-001 — files an image that has nothing to belong to yet.
   *
   * A listing must be created with at least one picture and has no draft
   * state to hold them in the meantime, so the file has to exist before the
   * row that points at it does. Filed under the uploader rather than a
   * listing id, which is the only thing known at this point — and is what
   * makes an abandoned upload attributable later.
   */
  uploadPendingImage(fileBuffer: Buffer, userId: string): Promise<StoredImage> {
    return this.upload(fileBuffer, {
      folder: `${PENDING_FOLDER_ROOT}/${userId}`,
      resource_type: 'image',
      unique_filename: true,
      overwrite: false
    });
  }

  /**
   * The folder `uploadPendingImage` files this user's uploads in, as a prefix a
   * key can be tested against.
   *
   * The trailing slash is what makes `startsWith` mean "inside this user's
   * folder" rather than "starts with these characters" — without it the key
   * belonging to user `abc` matches a caller whose id is `ab`.
   */
  pendingPrefix(userId: string): string {
    return `${PENDING_FOLDER_ROOT}/${userId}/`;
  }

  /**
   * The key a url was filed under, or null when the url is not one of ours.
   *
   * Needed because a picture can reach a listing as a *url* — uploaded first
   * and attached when the listing is created — and the key is what removing
   * the file later needs. Recovering it here rather than having the caller
   * send it back means nobody can claim a key they were never given.
   *
   * Matched against the exact shape an upload of ours answers with:
   *
   *     https://res.cloudinary.com/<cloud>/image/upload/v<version>/<public_id>.<ext>
   *
   * The version segment is required even though the store would serve the url
   * without it. Every `secure_url` we are handed carries one, and insisting on
   * it is what rules out a url with a transformation in the path — that names
   * a *derived* image, and the key underneath it belongs to the original.
   *
   * Anything else — another cloud, another host, a url that is not a url —
   * answers null, and the caller treats the picture as one we did not store.
   * Failing that way round is the safe one: the cost is a file that outlives
   * its row, against deleting a file some other row still points at.
   */
  storageKeyFromUrl(url: string): string | null {
    if (!this.cloudName) return null;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    if (parsed.hostname !== CLOUDINARY_HOST) return null;

    const segments = parsed.pathname.split('/').filter(Boolean);

    if (segments[0] !== this.cloudName) return null;
    if (segments[1] !== 'image' || segments[2] !== 'upload') return null;

    if (!/^v\d+$/.test(segments[3] ?? '')) return null;

    const body = segments.slice(4);

    if (body.length === 0) return null;

    // Only the last segment carries the extension, and only its final dot —
    // a public id is allowed to contain dots of its own.
    const name = body[body.length - 1];
    const dot = name.lastIndexOf('.');

    return [...body.slice(0, -1), dot > 0 ? name.slice(0, dot) : name].join(
      '/'
    );
  }

  /**
   * Removes a file. Treats "not found" as success: the caller wants the file
   * gone, and it already is.
   */
  async deleteImage(storageKey: string): Promise<void> {
    if (!this.configured) return;

    const result: unknown = await cloudinary.uploader.destroy(storageKey, {
      resource_type: 'image',
      /**
       * The asset is destroyed either way — this asks the CDN to stop serving
       * the copy it may already be holding. Anyone who loaded the picture
       * before it was removed put it in an edge cache, and without this that
       * cached copy keeps answering 200 for a while after the delete.
       *
       * Not instant: Cloudinary documents invalidation as taking up to an
       * hour. It narrows the window rather than closing it, which is the
       * honest description of what a CDN purge can do.
       */
      invalidate: true
    });

    if (!isDeleteResult(result)) {
      throw new Error('Image deletion returned an unrecognised result');
    }

    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Image deletion failed: ${result.result}`);
    }
  }

  private upload(
    fileBuffer: Buffer,
    options: UploadApiOptions
  ): Promise<StoredImage> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) {
            reject(new Error(error.message));
            return;
          }

          if (!result) {
            reject(new Error('Image upload returned no result'));
            return;
          }

          resolve({ storageKey: result.public_id, url: result.secure_url });
        }
      );

      stream.end(fileBuffer);
    });
  }
}
