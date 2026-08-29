/**
 * The limits every image route shares.
 *
 * A seller photographs the same kind of thing whether it ends up on a listing
 * or an auction, so one ceiling rather than one per module: two different
 * numbers would only be a trap for whoever writes the upload screen.
 */

/** 5 MB — a phone photo, not a raw scan. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Matched against the reported mime type. An allow-list rather than a block
 * list: a format added to browsers later stays refused until somebody decides
 * it is safe, instead of becoming allowed by omission.
 */
export const IMAGE_MIME_PATTERN = /^image\/(jpeg|png|webp|avif)$/;
