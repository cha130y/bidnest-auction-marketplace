import {
  Controller,
  ParseFilePipeBuilder,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  IMAGE_MIME_PATTERN,
  MAX_IMAGE_BYTES
} from '../storage/constants/image.constant';
import { StorageService } from '../storage/storage.service';

/**
 * PROD-001 — somewhere to put a picture before there is anything to attach it
 * to.
 *
 * An auction is drafted first and photographed second, so its images go
 * straight onto the draft. A listing has no draft: PROD-001 requires it to be
 * created with at least one picture and to go on sale immediately, which
 * leaves the create form holding files and no id to file them under.
 *
 * The caller sends the returned url back as part of `imageUrls`, so nothing
 * about creating a listing had to change to accommodate this.
 */
@Roles('USER')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  /**
   * The throttle is tighter than the blanket one: every call here costs an
   * upload to a third party and leaves a file behind whether or not a listing
   * is ever created from it. A seller filling in one form does not come close
   * to the limit; something looping does.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('images')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES } })
  )
  async uploadImage(
    @CurrentUser('id') userId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: IMAGE_MIME_PATTERN })
        .addMaxSizeValidator({ maxSize: MAX_IMAGE_BYTES })
        .build({ fileIsRequired: true })
    )
    image: Express.Multer.File
  ) {
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        'Image upload is not configured on this server'
      );
    }

    try {
      return await this.storage.uploadPendingImage(image.buffer, userId);
    } catch {
      // Whatever the store said is between us and the store — the caller can
      // only retry, and the message would leak which service is behind this.
      throw new ServiceUnavailableException(
        'Image upload is temporarily unavailable'
      );
    }
  }
}
