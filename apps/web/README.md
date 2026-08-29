# apps/web — BidNest storefront (Next.js)

Run everything with **pnpm**. The root `package.json` declares pnpm under
`devEngines.packageManager`, so `npm run …` fails with `EBADDEVENGINES` —
an error that reads like a broken project and is only the wrong package
manager.

## Running it

From the repo root:

```bash
pnpm dev          # web + api together
pnpm dev:web      # this app alone, on http://localhost:3000
```

It needs `apps/api` on port 4000 and the Docker services up:

```bash
docker compose -f infra/docker/compose.dev.yml up -d
```

## First time

Copy `.env.example` to `.env.local` and fill it in — `AUTH_SECRET` is
required, the app will not start without it. Then check the whole setup:

```bash
pnpm check:setup
```

That reports what is missing across both apps, whether the login code is
being delivered to Maildev or a real relay, and which services are up.

## Checks

```bash
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
```

## Where things are

Pages live under `src/app`, not `app`. Shared UI is in `src/components`,
and everything that talks to the API goes through `src/lib/api/client.ts`.

Project rules are in the root `CLAUDE.md`; setup and CI are in
`docs/KICKOFF_GUIDE.md`.
