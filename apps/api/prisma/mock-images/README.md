# Mock images

The shared, team-wide way to give the mock seeds a real photo instead of a
`placehold.co` placeholder is **`../mock-image-urls.ts`** — it's committed to
git, so every developer who runs the seed gets exactly the same rows. This
folder is just where a *local* file goes while you're preparing one before it
gets curated in there.

## Adding a curated photo — `mock-image-urls.ts`

1. Get the photo onto Cloudinary, either way:
   - Upload it by hand (Cloudinary dashboard), or
   - Drop it into `products/<slug>/` or `auctions/<slug>/` here and run the
     seed once — it uploads the file and the resulting url shows up on that
     row in the database, ready to copy.
2. Add the url to `PRODUCT_IMAGE_URLS` / `AUCTION_IMAGE_URLS` in
   `../mock-image-urls.ts`, keyed by slug (see the two lists below).
3. Commit it. Anyone who pulls and runs the seed now gets that photo too.

This works because Cloudinary's default `image/upload` delivery is public —
the url loads for anyone, no login or API key needed. Only *managing* the
asset (delete, overwrite) needs the credentials of whichever account uploaded
it, which is why the seed scripts can write it to a shared file safely even
though `CLOUDINARY_*` itself stays per-developer and out of git
(`apps/api/.env.example`).

A noun/auction with no entry in `mock-image-urls.ts` — and no local file
either — just falls back to a placeholder. Nothing ever breaks for missing
photos, curated or not.

## Products — slug is the product's own title

The catalogue is a fixed list of 10 (see `PRODUCTS` in `../seed-mock.ts`) —
every title is unique, so its slug maps to exactly that one product, not a
shared pool. `PRODUCT_IMAGE_URLS['ceramic-mug']` supplies up to 3 photos
(position 0, 1, 2) for that one row:

```
ceramic-mug               camping-lantern
cast-iron-skillet         leather-bound-notebook
bamboo-cutting-board      lavender-facial-serum
linen-throw-cushion       sandalwood-aroma-diffuser
rattan-floor-lamp
aluminum-cycling-helmet
```

Run `pnpm --dir apps/api run seed:mock` after adding urls (it wipes and
rebuilds every mock product each time, so it always picks up what's there).

## Auctions — slug is the auction's own title

`AUCTION_IMAGE_URLS[slug]` supplies up to 3 photos (position 0, 1, 2) for one
of the 10 fixed mock auctions — same shape as a product's, and the detail
page's gallery (primary photo + the rest) shows every one of them:

```
vintage-seiko-5-automatic-watch
limited-edition-sneakers-size-42
olympus-om-1-film-camera
1962-classic-movie-poster-framed
handmade-teak-wood-dining-chair
wireless-noise-cancelling-headphones
antique-brass-compass-set
signed-first-edition-novel
hand-thrown-ceramic-vase-set
racing-bicycle-frame-carbon-fibre
```

Run `pnpm --dir apps/api exec ts-node prisma/seed-mock-auction.ts` (or however
the auction owner currently runs it) after adding a url — it upserts, so it's
picked up even after the auction row already exists.

## Adding a new product/auction

The slug is the title lowercased, non-alphanumeric runs collapsed to a single
`-`, leading/trailing `-` trimmed (`slugifyName()` in `../mock-image-loader.ts`).
If `seed-mock.ts`'s `PRODUCTS` or `seed-mock-auction.ts`'s `AUCTIONS` list
changes, the matching key in `mock-image-urls.ts` changes with it.
