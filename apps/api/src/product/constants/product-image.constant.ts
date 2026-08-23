/**
 * PROD-001/002 — the limits on a listing's pictures.
 *
 * Here rather than in the controller so the route, the service and the tests
 * all quote the same numbers, and a screen can be told them without guessing.
 *
 * Deliberately the same figures an auction uses (see AUC-001): a seller
 * photographs the same kind of thing either way, and two different ceilings
 * would only be a trap for whoever writes the upload screen.
 */

/** Enough to show an item from every side; small enough that a page stays quick. */
export const MAX_PRODUCT_IMAGES = 8;

/** 5 MB — a phone photo, not a raw scan. */
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Matched against the reported mime type. An allow-list rather than a block
 * list: a format added to browsers later stays refused until somebody decides
 * it is safe, instead of becoming allowed by omission.
 */
export const PRODUCT_IMAGE_MIME_PATTERN = /^image\/(jpeg|png|webp|avif)$/;
