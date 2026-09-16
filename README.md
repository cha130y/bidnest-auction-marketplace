# BidNest — Auction & Marketplace

A marketplace that combines two modes in one system — **real-time auctions** and **a buy-now shop** —
sharing the same user accounts, cart, payment and shipping. One user can be both a buyer and a seller on a single account.

A 5-person group project, 14 days · pnpm monorepo (Next.js + NestJS + PostgreSQL)

> **New to the team / new machine?** Finish [Set up your machine](docs/KICKOFF_GUIDE.md#set-up-your-machine--first-time-only) in the Kickoff Guide first
> **Coming back to work?** Use the [Daily Workflow](docs/DAILY_WORKFLOW.md)

---

## What the system does

| Module | Capabilities |
| --- | --- |
| **Authentication** | Email sign-up/login, Google and LINE sign-in, two-factor verification with an emailed OTP, trusted devices, password reset |
| **Auctions** | Seller creates a draft → completeness check → preview → publish · the system opens and closes auctions on schedule · the home page has 4 views (hot / ending soon / starting soon / recently ended) |
| **Bidding and live rooms** | Real-time bidding over WebSocket · protection against duplicate bids from repeated clicks · anti-sniping (a bid in the last 2 minutes extends the auction by 2 minutes, up to 5 times) · lobby + arena + results page |
| **Shop** | List products with stock and prices · search and filter · multi-shop cart · one simulated payment split into orders per seller · shipment status tracked as a timeline |
| **AI (Gemini)** | Suggests a starting price for auction drafts · responds to price-negotiation offers against the seller's floor price · support chat that hands over to an admin when it can't answer |
| **Notifications and chat** | In-app notifications for 8 events (outbid, auction won, new order, shipment status, etc.) · buyer–seller chat tied to the product/auction being discussed |
| **Back office** | Suspend users · manage categories · cancel auctions · suspend/reactivate product listings · order overview · take over support chats · every action is written to the audit log with a reason |

See all the workflow diagrams in [Workflow diagrams](docs/architecture/workflows/)

---

## Tech stack

| Part | Uses |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 + shadcn/ui, TanStack Query, React Hook Form + Zod, NextAuth v5 |
| Backend | NestJS 11, TypeScript, Prisma 7, class-validator, Passport + JWT, Throttler, Swagger |
| Database | PostgreSQL 17 |
| Realtime | Socket.IO — namespaces `/auctions` (auction rooms) and `/user` (notifications + chat) |
| AI | Google Gemini (`@google/generative-ai`) |
| External services | Cloudinary (images), SMTP via Nodemailer (Maildev in dev) |
| Tooling | pnpm 11 workspace, Node 24, Docker Compose, ESLint + Prettier, Husky + lint-staged |
| Testing | **web:** Vitest + Testing Library (jsdom) · **api unit:** Jest + ts-jest (mocked Prisma) · **api e2e:** Jest + Supertest (real Postgres + Maildev) |

**Don't change the tech stack or edit `schema.prisma` without asking the team first** — see [CLAUDE.md](CLAUDE.md)

---

## Project structure

```
apps/
  web/                    Next.js — every web page (buyer, seller, admin)
  api/                    NestJS — all of the system's rules live here
    prisma/               schema.prisma + migrations + seed
    src/                  24 modules (auth, auction, bid, live, cart, order, ai-tools, admin, ...)
packages/
  config/                 shared config
  contracts/              types shared between web and api
infra/docker/             compose.dev.yml — Postgres + Maildev for dev machines
scripts/                  dev.mjs, dev-preflight.mjs, check-setup.mjs
docs/                     SRS, ERD, ADRs, workflow diagrams, team guides
Dockerfile                image of apps/api for deployment — built from the repo root
```

The browser never talks to the database or external services directly — everything goes through the single `apps/api` layer

---

## Getting started

### First time on this machine

Follow [Set up your machine](docs/KICKOFF_GUIDE.md#set-up-your-machine--first-time-only) — in short

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
docker compose -f infra/docker/compose.dev.yml up -d
pnpm --dir apps/api exec prisma migrate deploy
pnpm dev
```

You need **Node 24**, **pnpm 11** and **Docker Desktop** first · the `.env` file isn't in git, so fill in the values on your machine
Check whether your machine is ready with `pnpm check:setup`

### Every day you start work

```bash
git switch dev && git pull
git switch feat/<module>-dev<n>    # your own branch
git merge dev
pnpm check
pnpm dev
```

Details and the cases that need extra commands (a new migration / a new package) are in [DAILY_WORKFLOW.md](docs/DAILY_WORKFLOW.md)

---

## Common commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs web (`:3000`) + api (`:4000`) together |
| `pnpm dev:web` / `pnpm dev:api` | Runs one side at a time |
| `pnpm check` | Typecheck both apps + test + lint — **run it every time before submitting work** |
| `pnpm test` / `pnpm lint` | Runs only the tests or only lint |
| `pnpm check:setup` | Checks the machine has everything (Node, pnpm, Docker, .env) |
| `docker compose -f infra/docker/compose.dev.yml up -d` | Starts Postgres + Maildev |
| `pnpm --dir apps/api exec prisma migrate deploy` | Updates the tables to the latest migration |
| `pnpm --dir apps/api exec prisma studio` | Opens a UI for browsing the database |
| `pnpm --dir apps/api seed:mock` | Loads sample data for testing |

**Reading email/OTP in dev:** open Maildev at <http://localhost:1080> — the system doesn't actually send email from a dev machine

---

## Deploy

| Part | Where | branch |
| --- | --- | --- |
| `apps/api` | Railway (Docker) | `main` → production |
| `apps/web` | Vercel | `main` → production · `dev` → preview |
| PostgreSQL | Railway — a separate service in the same project as the api | — |

> **There is no staging yet** — only production and Vercel previews
>
> Vercel previews deploy from `dev` automatically, but **get a new random URL on every deploy** and point at the same API as production, so they work for testing the UI but not for testing Google/LINE login (the reasoning and how to set up OAuth are in [Handbook chapter 08](docs/BIDNEST_HANDBOOK-en.html#ch8))
>
> Real staging needs a second service on Railway **with its own separate database**, all 29 env vars set again, and `dev` bound to a fixed domain on Vercel so it can be registered with Google/LINE — not done yet

The [`Dockerfile`](Dockerfile) at the repo root builds only `apps/api` (`apps/web` doesn't go through Docker at all)
The build context must be the repo root, because pnpm reads the workspace from the lockfile there — you can try it locally with

```bash
docker build -t bidnest-api .
docker run --rm -p 4000:4000 --env-file apps/api/.env bidnest-api
```

[`docker-entrypoint.sh`](docker-entrypoint.sh) runs `prisma migrate deploy` itself before every start, so deployments don't need a separate migration step

---

## Documentation

| Document | Contents |
| --- | --- |
| **[Handbook](docs/BIDNEST_HANDBOOK-en.html)** ([Thai edition](docs/BIDNEST_HANDBOOK.html)) | **The whole-project guide in 9 chapters — start here if you're new to the team** machine setup · daily work · how the features connect · testing · why this stack was chosen · going to production (just open the file in a browser, nothing to run) |
| [SRS](docs/requirements/) | Requirements and acceptance criteria for every requirement — **the reference when deciding whether work passes** |
| [Workflow diagrams](docs/architecture/workflows/) | 14 diagrams of how the whole system works, drawn from the actual code |
| [ERD](docs/architecture/erd/bidnest-erd-v1.dbml) | Database structure ([view online](https://dbdiagram.io/d/BidNest-6a803e3ee093539a9ebf8fff)) |
| [ADR](docs/architecture/adr/) | Architecture decision records and their reasoning |
| [Kickoff Guide](docs/KICKOFF_GUIDE.md) | Machine setup, monorepo structure, CI, commit convention |
| [Daily Workflow](docs/DAILY_WORKFLOW.md) | Commands to run every day and when submitting work |
| [Team Role](docs/team-role/) | Each person's scope of work + personal workflow templates |
| [CLAUDE.md](CLAUDE.md) | The team's shared working rules (used with Claude Code) |

**Team tools:** [Jira](https://pitchayauds.atlassian.net/jira/software/projects/BN/boards/2) · [Figma](https://www.figma.com/design/XjSmZZgT0IBPc8do84WaRa/Bidnest)

---

## Working together

**Branch:** `feat/<module>-dev<n>` — `feat/frontend-dev1` · `feat/auth-dev2` · `feat/ecommerce-dev3` · `feat/auction-dev4` · `feat/ai-dev5`

**Commit:** `<type>(<requirement-id>): short English description`, e.g. `feat(AUTH-001): add local registration endpoint`
Types: `feat` `fix` `refactor` `test` `docs` `chore` `ci` — include the requirement id when the commit maps directly to an SRS requirement

**Pull Request:** the base branch is always `dev` (never merge straight into `main`) · title and description in English

**CI:** every PR into `dev` or `main` runs 3 jobs automatically ([ci.yml](.github/workflows/ci.yml)) — `lint-and-test` (lint → unit tests for both apps → `next build` for web) · `docker-build` (builds the api image) · `e2e` (starts Postgres + Maildev, then migrate → seed → e2e)

**Files that need the owner's approval before merge** (see [CODEOWNERS](.github/CODEOWNERS)): `CLAUDE.md`, `docs/requirements/`, `docs/architecture/`, `docs/team-role/`, `apps/api/prisma/`, `.github/`, `package.json`

**Never commit `.env` files or hardcode secrets/API keys in the code**

---

## V1 scope

The story ends when the auction closes and the item is shipped — **there are no refunds or cancellations after payment yet**
`SOLD` and `UNSOLD` are true end states and never go back; payment is simulated and not yet connected to a real payment gateway
