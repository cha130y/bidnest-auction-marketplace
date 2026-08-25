/**
 * PROD-003 — makes a shopper's words safe to hand to `contains`.
 *
 * Prisma compiles `contains` to SQL `LIKE '%' || value || '%'` and passes the
 * value through untouched. `%` and `_` are LIKE's own wildcards, so a search
 * for `%` matched every listing in the catalogue rather than the ones that
 * carry the character — "50% off" and "iPhone_case" were unfindable by the
 * part of their name that made them distinctive.
 *
 * Backslash goes first: escaping it after the others would double-escape the
 * backslashes this function had just written. Postgres reads `\` as LIKE's
 * escape character by default, which is what makes `\%` a literal per cent.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
