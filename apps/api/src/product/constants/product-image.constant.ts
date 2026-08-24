import {
  IMAGE_MIME_PATTERN,
  MAX_IMAGE_BYTES
} from '../../storage/constants/image.constant';

/**
 * PROD-001/002 — the limits on a listing's pictures.
 *
 * Here rather than in the controller so the route, the service and the tests
 * all quote the same numbers, and a screen can be told them without guessing.
 *
 * The size and type come from the shared image limits: they are a fact about
 * what the store accepts, not about listings. How many a listing may carry is
 * the part that belongs to this module.
 */

/** Enough to show an item from every side; small enough that a page stays quick. */
export const MAX_PRODUCT_IMAGES = 8;

export const MAX_PRODUCT_IMAGE_BYTES = MAX_IMAGE_BYTES;

export const PRODUCT_IMAGE_MIME_PATTERN = IMAGE_MIME_PATTERN;
