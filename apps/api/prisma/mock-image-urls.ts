/**
 * Curated, git-committed photos for every seed script — seed-mock.ts,
 * seed-mock-auction.ts, and seed.ts's own fixture products/auctions alike.
 * One shared dictionary because a slug is a slug regardless of which script
 * asks for it, and the four titles in seed.ts don't collide with any of the
 * other two files' (checked by hand when this was added).
 *
 * Unlike a locally-dropped file, this is what makes every developer's seed
 * produce identical rows: Cloudinary's default `image/upload` delivery is
 * public — the url works for anyone regardless of whose account uploaded
 * it, only *managing* the asset (delete, overwrite) needs that account's
 * own CLOUDINARY_API_SECRET. Confirmed against the entry below: a bare
 * unauthenticated GET returns 200.
 *
 * Add to these via PR as photos get curated — upload once (dashboard, or
 * drop a file in mock-images/<group>/<slug>/ and run the seed once to have
 * it uploaded for you), then paste the resulting url here for everyone.
 *
 * Keys are slugs — a product's own title, or an auction's own title —
 * computed by slugifyName() in mock-image-loader.ts. Something with no
 * entry here falls back to a placehold.co placeholder rather than breaking
 * the seed. seed.ts's one *deliberately* photo-less auction (AUC-002's
 * "can't publish without an image" fixture) is skipped entirely rather than
 * assigned a placeholder — see the `images.length === 0` check in seed.ts.
 */

export const PRODUCT_IMAGE_URLS: Partial<Record<string, string[]>> = {
  'ceramic-mug': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787818622/1ae0e975-c03c-407c-abd2-eefa6a2350c5.aec9c099496d9673634e67c1da825639.jpg'
  ],
  'cast-iron-skillet': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787821121/CastIronSkillet.jpg'
  ],
  'bamboo-cutting-board': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787821356/01-09.jpg'
  ],
  'linen-throw-cushion': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787821500/ambrose-pillow-cover-styled-on-coastal-sofa-fulfily-1_1200x.jpg'
  ],
  'rattan-floor-lamp': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787821666/2-Lights-handcrafted-Natural-Modern-Rattan-Floor-Lamp.jpg'
  ],
  'aluminum-cycling-helmet': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787821912/poc-cularis-bike-helmet.jpg'
  ],
  'camping-lantern': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787821989/lightmate-camping-lantern-camping-lantern-348213.jpg'
  ],
  'leather-bound-notebook': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787822108/11_56826338-0472-49bf-ace1-ca25b5589992.jpg'
  ],
  'lavender-facial-serum': [
    'https://www.thepearco.ca/cdn/shop/files/Image249_1024x1024.jpg?v=1708094134'
  ],
  'sandalwood-aroma-diffuser': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787822243/indian-sandalwood-diffuser-02.jpg'
  ]
  // seed.ts fixture products
  // 'mechanical-keyboard-65': [''],
  // 'usb-c-hub-8-in-1': [''],
  // 'vintage-denim-jacket': [''],
  // 'limited-edition-figurine': ['']
};

export const AUCTION_IMAGE_URLS: Partial<Record<string, string[]>> = {
  'vintage-seiko-5-automatic-watch': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787822355/WhatsAppImage2022-11-24at10.17.05PM.jpg'
  ],
  'limited-edition-sneakers-size-42': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787823473/58.jpg'
  ],
  'olympus-om-1-film-camera': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787825166/OlympusOM-1_CuteCameraCo_Front_600x.jpg'
  ],
  '1962-classic-movie-poster-framed': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787823675/Western_1_Black_f68c9017-1dee-4bc9-b68f-93186402d648_1024x1024.jpg'
  ],
  'handmade-teak-wood-dining-chair': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787823971/Gemini_Generated_Image_vgx16lvgx16lvgx1.png'
  ],
  'wireless-noise-cancelling-headphones': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787824095/960x0.jpg'
  ],
  'antique-brass-compass-set': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787824167/ChatGPT_Image_Jul_29_2026_11_48_27_AM_1.jpg'
  ],
  'signed-first-edition-novel': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787824241/Photo-Feb-23-2-47-16-PM-e1519415682331.jpg'
  ],
  'hand-thrown-ceramic-vase-set': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787824303/teardrop-handmade-turkish-ceramic-vase-blue-neck.jpg'
  ],
  'racing-bicycle-frame-carbon-fibre': [
    'https://res.cloudinary.com/q4su1djb/image/upload/v1787824383/Oem-Road-Racing-Bike-Frame-1-600x600.jpg'
  ]
  // seed.ts fixture auctions — "retro-game-console" is deliberately not
  // listed: that fixture has zero images by design (AUC-002), see seed.ts.
  // 'gundam-rx-78-2-perfect-grade': ['', ''],
  // 'levi-s-501-big-e-1970s': ['', ''],
  // 'vintage-seiko-5-automatic': ['', '', ''],
  // 'carhartt-detroit-jacket': [''],
  // 'pok-mon-base-set-charizard-psa-6': ['', ''],
  // 'omega-seamaster-300-1964-re-issue': ['', ''],
  // 'ipad-air-4-64gb': [''],
  // 'sony-wh-1000xm4': [''],
  // 'leica-m6-classic-1988': ['', '', ''],
  // 'barbour-bedale-waxed-size-40': [''],
  // 'technics-sl-1200mk2-pair': ['', '']
};
