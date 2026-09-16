# Kickoff Guide

Based on SRS v7 and the Team Role Distribution — just follow this order; every step has real commands to copy and run directly

**Owner of Steps 1–4 and 6: Dev 2** (per the Team Role Distribution, which makes them the owner of "NestJS setup, designing the main Prisma schema and managing migrations for the whole team")
**Step 5 (Jira):** not tied to anyone's role — can be done in parallel with Steps 2–4 by whoever is free
**Step 7:** everyone starts together

Project name: **BidNest — Auction & Marketplace** · repo name: `bidnest-auction-marketplace` · use the slug `bidnest` for internal DB/service names

---

## Step 1 — Set up the Git repository

**Owner: Dev 2**

```bash
# Create the repo on GitHub first (via the website, set to Private), then clone
git clone https://github.com/<org>/bidnest-auction-marketplace.git
cd bidnest-auction-marketplace

# Initial files
cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
dist/
.next/
coverage/
EOF

echo "# BidNest — Auction & Marketplace" > README.md

git add .
git commit -m "chore: initial commit"
git push origin main

# Create the dev branch
git switch -c dev
git push origin dev
```

**Set up branch protection (on the GitHub website):**

- [ ] Settings → Branches → Add rule for `main`: Require pull request before merging, Require 1 approval
- [ ] Repeat for `dev`

**Create a feature branch for each person:**

```bash
git switch dev
git switch -c feat/auth-dev2      && git push origin feat/auth-dev2
git switch dev && git switch -c feat/frontend-dev1  && git push origin feat/frontend-dev1
git switch dev && git switch -c feat/ecommerce-dev3 && git push origin feat/ecommerce-dev3
git switch dev && git switch -c feat/auction-dev4   && git push origin feat/auction-dev4
git switch dev && git switch -c feat/ai-dev5        && git push origin feat/ai-dev5
```

**✅ Done when:** everyone can clone the repo and has their own branch ready to use

---

## Step 2 — Scaffold the monorepo structure

**Owner: Dev 2**

```bash
git switch dev
npm install -g pnpm   # if you don't have it yet

mkdir -p apps packages
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF
pnpm init   # creates the root package.json to hold combined scripts/shared tool config

# Next.js app
cd apps
pnpm create next-app@latest web --typescript --tailwind --app --src-dir --import-alias "@/*"

# NestJS app
pnpm dlx @nestjs/cli new api --package-manager pnpm
cd ..

# create-next-app and nest new usually create a nested .git automatically
# delete it first, otherwise "git add ." from outside errors out because it sees a repo inside a repo
rm -rf apps/web/.git apps/api/.git

# shared packages
mkdir -p packages/contracts packages/config
cd packages/contracts && pnpm init && cd ../..
cd packages/config && pnpm init && cd ../..

# Husky + lint-staged (enforce lint on commit) + concurrently (run both dev servers at once)
pnpm add -D husky lint-staged concurrently -w
pnpm exec husky init
```

Edit `.husky/pre-commit` (Husky creates it automatically, but by default it runs `pnpm test` — change it to run lint-staged instead):

```bash
pnpm exec lint-staged
```

Add config at the end of the root `package.json` (lint-staged config + shortcut commands for running the dev servers):

```json
{
  "scripts": {
    "dev:web": "pnpm --dir apps/web dev",
    "dev:api": "pnpm --dir apps/api start:dev",
    "dev": "concurrently \"pnpm dev:web\" \"pnpm dev:api\""
  },
  "lint-staged": {
    "apps/web/**/*.{ts,tsx}": ["pnpm --dir apps/web exec eslint --fix"],
    "apps/api/**/*.ts": ["pnpm --dir apps/api exec eslint --fix"]
  }
}
```

**Why plain `eslint --fix` doesn't work:** pnpm doesn't hoist packages to the root like npm/yarn — the `eslint` that `create-next-app`/`nest new` installs lives only in `apps/web/node_modules/.bin/` and `apps/api/node_modules/.bin/`, never at the root. It has to be called through `pnpm --dir <app> exec eslint` so it picks up that app's own eslint (and config) directly (lint-staged always passes absolute paths, so switching cwd with `--dir` doesn't break the paths)

```bash
git add .
git commit -m "chore: scaffold monorepo structure"
git push origin dev
```

**✅ Done when:** running `pnpm install` at the root, then `pnpm dev:web` and `pnpm dev:api` both work without errors (or `pnpm dev` alone opens both at once in one terminal) — try deliberately introducing a lint error and running `git commit`; it must be blocked automatically before the commit succeeds

---

## Step 3 — Set up Docker Compose (Postgres + Maildev)

**Owner: Dev 2**

```bash
mkdir -p infra/docker
```

Create `infra/docker/compose.dev.yml`:

```yaml
services:
  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_DB: bidnest_db
      POSTGRES_USER: bidnest
      POSTGRES_PASSWORD: dev_password
    ports:
      - '127.0.0.1:5433:5432'
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U bidnest']
      interval: 5s
      timeout: 5s
      retries: 10

  maildev:
    image: maildev/maildev
    restart: unless-stopped
    ports:
      - '127.0.0.1:1080:1080'
      - '127.0.0.1:1025:1025'

volumes:
  pg_data:
```

**`restart: unless-stopped`** — both containers come back on their own every time Docker Desktop opens after a real machine restart (not just sleep), so there's no need to run `docker compose up -d` again yourself — unless you ran `docker compose stop`/`docker stop` before restarting (in that case it remembers you shut them down on purpose and doesn't auto-resume)

```bash
docker compose -f infra/docker/compose.dev.yml up -d
docker compose -f infra/docker/compose.dev.yml ps   # check both services are healthy

git add infra/docker/compose.dev.yml
git commit -m "chore: add docker compose for postgres + maildev"
git push origin dev
```

**✅ Done when:** http://localhost:1080 shows the Maildev page and you can connect to Postgres on port 5433

---

## Step 4 — Set up Prisma and the initial schema

**Owner: Dev 2**

```bash
cd apps/api
pnpm add -D prisma
pnpm add @prisma/client
pnpm dlx prisma init
```

Edit `apps/api/prisma/schema.prisma` — start with the Identity + Category parts everyone is waiting on (a short example; expand per SRS §5.1 later):

```prisma
model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String?
  displayName  String
  role         Role      @default(USER)
  createdAt    DateTime  @default(now())
}

enum Role {
  USER
  ADMIN
}

model Category {
  id       String  @id @default(uuid())
  parentId String?
  name     String
  slug     String  @unique
  isActive Boolean @default(true)
}
```

**Note on Category:** use **one set shared by both Auction and E-commerce**, with no per-module `scope` field, per SRS §5.1, which states that "categories are shared by both modules, not scoped per module" — both `auctions` and `products` reference this single table. Full reasoning in [ADR-0001](architecture/adr/0001-single-admin-role-and-shared-category-set.md)

```bash
pnpm dlx prisma migrate dev --name init_identity_and_categories
cd ../..

git add .
git commit -m "feat: initial prisma schema (identity + categories)"
git push origin dev
```

**✅ Done when:** `prisma migrate dev` runs without errors and `prisma studio` shows the real User/Category tables

---

## Step 5 — Create the Jira project and backlog

**Owner: flexible (not tied to a role) — can be done in parallel with Steps 2–4**

- [ ] Create the Jira project (Scrum or Kanban, whichever the team prefers)
- [ ] Create 5 Epics: `Authentication`, `Auction`, `E-commerce`, `AI Features`, `Admin`
- [ ] Break Stories straight from the SRS requirement IDs, e.g. `AUTH-001` to `AUTH-008` as 8 stories in the Authentication Epic
- [ ] AI Features Epic: set `AI-001` (Customer Service Chatbot) as a required priority, with `AI-002`/`AI-003` clearly separated as Optional/stretch
- [ ] Assign assignees according to the overview table in the Team Role Distribution
- [ ] Set up the first Sprint with Dev 2's stories (basic auth) as the top priority

**✅ Done when:** everyone can see their own backlog in Jira and knows what their first story is

---

## Step 6 — Set up basic CI (Lint + Test on PRs)

**Owner: Dev 2**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
    branches: [main, dev]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
```

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint + test workflow"
git push origin dev
```

Additional setting (GitHub Settings → Branches → `main`): Require status checks to pass → select `lint-and-test`

> **Note — CI has grown since then.** The yaml above is the original version from kickoff day. Today [ci.yml](../.github/workflows/ci.yml) has 3 jobs: `lint-and-test` · `docker-build` · `e2e` (starts Postgres + Maildev, then migrate → seed → run e2e), and branch protection requires all three to be green
>
> The root `pnpm test` is `pnpm -r --if-present test`, so it runs both **Jest in `apps/api`** and **Vitest in `apps/web`** — tests added to either app get into CI automatically without touching ci.yml
>
> The principles behind the choice of test tools (Vitest / Jest / RTL / Supertest) are in chapter 06 of the [BidNest Handbook](https://claude.ai/code/artifact/a3409b5b-ceac-4725-8161-8c0c66042d4a)

**✅ Done when:** you open 1 test PR and see the CI status actually show up (green/red) at the bottom of the PR

---

## Step 7 — Team kickoff and start parallel work

**Owner: everyone, together**

```bash
# Dev 2 — start basic auth before anyone else (critical path)
git switch feat/auth-dev2
# Start with: AUTH-001 (local registration) → AUTH-002 (local login) → AUTH-004 (refresh session)

# Dev 1 — can start in parallel right away, no need to wait for auth
git switch feat/frontend-dev1
# Start with: Design System (Shadcn-UI setup, layout, shared components)

# Dev 3 — scaffold the E-commerce module structure (mock auth for now)
git switch feat/ecommerce-dev3
# Start with: empty routes/DTOs for PROD-001..007, CART-001..005

# Dev 4 — scaffold the Auction module structure (mock auth for now)
git switch feat/auction-dev4
# Start with: empty routes/DTOs for AUC-001..008

# Dev 5 — scaffold AI-001 Customer Service Chatbot (a required feature, before AI-002/003)
git switch feat/ai-dev5
# Start with: an empty /support/chat endpoint + the Admin Dashboard skeleton
```

**Rules for the whole project:**

- [ ] Never push straight to `main` or `dev` — merge only through PRs (per the branch protection set up in Step 1)
- [ ] A PR must pass CI (Step 6) and have at least 1 approval before merge
- [ ] As soon as Dev 2 finishes basic auth (AUTH-001/002/004), tell the team so Dev 3/4/5 can switch from mock auth to the real thing

**✅ Done when:** everyone has their own branch, can start writing real code, and knows clearly what the blocker to wait for is (basic auth from Dev 2)

---

## Set up your machine — first time only

**Owner: everyone** (people who join the team later, or move to another machine, use this set too)

Run this whole set **once per machine** — after that you never need it again, just the "Daily workflow" in the next section

```bash
# 1. Clone repo
git clone https://github.com/<org>/bidnest-auction-marketplace.git
cd bidnest-auction-marketplace

# 2. Install dependencies for the whole monorepo
pnpm install

# 3. Set up environment variables (.env files aren't in git — create them on your machine)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Start Docker (Postgres + Maildev), then create the tables from the latest schema
docker compose -f infra/docker/compose.dev.yml up -d
pnpm --dir apps/api exec prisma migrate deploy

# 5. Switch to your own branch (pick just your own line)
git switch feat/frontend-dev1
git switch feat/auth-dev2
git switch feat/ecommerce-dev3
git switch feat/auction-dev4
git switch feat/ai-dev5

# 6. Try running it to see both web and api come up
pnpm dev
```

**Why `.env` has to be copied per app:** `apps/api` only loads `.env` from its own cwd (`apps/api/`), and `apps/web` (Next.js) only loads `.env.local` from its own cwd (`apps/web/`). A single file at the root has no effect on either

**Why `prisma migrate deploy` is needed (step 4):** `docker compose up -d` just starts Postgres; it doesn't create any tables. You have to apply the migrations to match `schema.prisma` first — once is enough, because compose sets `restart: unless-stopped` and the data lives in a volume that doesn't go away

**✅ Done when:** `pnpm dev` runs both web and api without errors, connected to a database with every table from the latest schema

---

## Daily workflow — do this every time you start work

> A separate copy of this section lives at **[docs/DAILY_WORKFLOW.md](DAILY_WORKFLOW.md)** for quick reference during daily work (same content — **if you edit one, update the other to match**)

When you sit down to work on a new day, or come back after a break, run this set before writing code

```bash
git switch dev && git pull
git switch feat/auction-dev4   # <-- change to your own branch
git merge dev
pnpm check
pnpm dev
```

**✅ Done when:** `pnpm check` passes completely and `pnpm dev` runs both web and api

### Extra commands, only when a condition applies

These 3 commands aren't needed every day — run them only when the condition applies (usually after `git merge dev`). Run this check command first

```bash
# See what the merge just brought in (a filename showing up = run the matching command below)
git diff --name-only HEAD@{1} HEAD -- pnpm-lock.yaml apps/api/prisma/migrations
```

```bash
# pnpm-lock.yaml shows up = someone added/updated a package
pnpm install

# files under apps/api/prisma/migrations/ show up = a new migration from someone else
pnpm --dir apps/api exec prisma migrate deploy

# can't connect to the database / just restarted and Docker Desktop isn't up yet
docker compose -f infra/docker/compose.dev.yml up -d
```

**Why merge `dev` in every time:** everyone's branch was cut on Kickoff day — if others have pushed work into `dev` since then (e.g. Dev 2 finished auth) and you don't merge it in, you are still working on old code and can't connect to the real things others built

**Why run `pnpm check` after merging:** a successful `git merge` only means there were no line-level conflicts; it doesn't guarantee the code still works (e.g. someone renamed a function that another file still calls by the old name — the merge goes through cleanly but breaks at runtime), and CI doesn't run for a local merge like this (CI only runs when a PR is opened) — `pnpm check` bundles the typecheck of apps/api + apps/web, `pnpm test` and `pnpm lint` into one command, so you know right away if anything is broken before building on top of it

---

## Commit Message Convention

Format:

```
<type>(<requirement-id>): <short English description>
```

**`<type>`:**

| type       | When to use                                                   |
| ---------- | ------------------------------------------------------------ |
| `feat`     | Implementing a new requirement (tied to AUTH-xxx, PROD-xxx, AUC-xxx, etc.) |
| `fix`      | Fixing a bug                                                  |
| `refactor` | Restructuring code without adding features or fixing bugs     |
| `test`     | Adding/changing tests                                         |
| `docs`     | Changing documentation (SRS, README, etc.) without touching code |
| `chore`    | Setup/tooling/dependency work that is not a feature itself    |
| `ci`       | Changing CI/CD workflows                                      |

**`<requirement-id>` (scope):** include it when the commit maps directly to an SRS requirement; skip it for general infra work that isn't tied to any requirement

**Real examples from BidNest's requirements:**

```bash
feat(AUTH-001): add local registration endpoint
feat(BID-004): implement anti-sniping extension logic
fix(PROD-005): prevent stock going negative on concurrent checkout
docs(PROD-006): clarify negotiation floor visibility rule
chore: scaffold monorepo structure
ci: add lint and test workflow
```

**Why the requirement ID is genuinely useful, not just a pretty format:** `git log --grep="AUTH-001"` instantly shows every commit related to that requirement — when reviewing or debugging "when did AUTH-001 start, and how many times was it changed", you don't have to read through commits one by one. It links the git log directly to the SRS

**On language:** commit messages are always in English, like PR titles/descriptions — unlike conversations with Claude Code, which are in Thai per CLAUDE.md, because commit messages stay in the git history permanently and people outside the team who open the repo should be able to read them
