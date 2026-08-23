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

  constructor(config: ConfigService<EnvVariable, true>) {
    const cloudName = config.get('CLOUDINARY_CLOUD_NAME', { infer: true });
    const apiKey = config.get('CLOUDINARY_API_KEY', { infer: true });
    const apiSecret = config.get('CLOUDINARY_API_SECRET', { infer: true });

    this.configured = Boolean(cloudName && apiKey && apiSecret);

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
   * Removes a file. Treats "not found" as success: the caller wants the file
   * gone, and it already is.
   */
  async deleteImage(storageKey: string): Promise<void> {
    if (!this.configured) return;

    const result: unknown = await cloudinary.uploader.destroy(storageKey, {
      resource_type: 'image'
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
