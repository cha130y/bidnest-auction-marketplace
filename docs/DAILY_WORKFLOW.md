# Daily Workflow

Commands to run **every time you start work** — split out of `docs/KICKOFF_GUIDE.md` so it is quick to reopen without scrolling past Steps 1–7

> **Never set up this machine?** (new to the team / new machine / never cloned) Finish [Set up your machine — first time only](KICKOFF_GUIDE.md#set-up-your-machine--first-time-only) in KICKOFF_GUIDE first, then come back to this page
>
> This page is identical to the "Daily workflow" section in `docs/KICKOFF_GUIDE.md` — **if you edit one, update the other to match**

---

## Starting work

When you sit down to work on a new day, or come back after a break, run this set before writing code

```bash
git switch dev && git pull
git switch feat/auction-dev4   # <-- change to your own branch
git merge dev
pnpm check
pnpm dev
```

**Everyone's branch names:** `feat/frontend-dev1` · `feat/auth-dev2` · `feat/ecommerce-dev3` · `feat/auction-dev4` · `feat/ai-dev5`

**✅ Done when:** `pnpm check` passes completely and `pnpm dev` runs both web and api

---

## Extra commands, only when a condition applies

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

---

## Why it works this way

**Why merge `dev` in every time:** everyone's branch was cut on Kickoff day — if others have pushed work into `dev` since then (e.g. Dev 2 finished auth) and you don't merge it in, you are still working on old code and can't connect to the real things others built

**Why run `pnpm check` after merging:** a successful `git merge` only means there were no line-level conflicts; it doesn't guarantee the code still works (e.g. someone renamed a function that another file still calls by the old name — the merge goes through cleanly but breaks at runtime), and CI doesn't run for a local merge like this (CI only runs when a PR is opened) — `pnpm check` bundles the typecheck of apps/api + apps/web, `pnpm test` and `pnpm lint` into one command, so you know right away if anything is broken before building on top of it

---

## Submitting work

```bash
git add -A
git commit -m "feat(AUC-001): add auction listing endpoint"   # <-- <type>(<requirement-id>): English description
git push -u origin feat/auction-dev4                          # <-- your own branch
```

Then open a PR with **the base branch always set to `dev`** (never push straight to `main` or `dev`, and never commit `.env` files or secrets) — the full commit message format is in [Commit Message Convention](KICKOFF_GUIDE.md#commit-message-convention)

---

## Releasing to production

Daily work ends at `dev` — promoting work from `dev` to `main` is a separate matter, and **no automation does it for you**; a release PR has to be opened by hand every time

```bash
# See what's waiting to be released (read-only, doesn't create a PR)
git fetch origin
git log --merges --pretty='- %s' origin/main..origin/dev
```

Anything listed = something is waiting to be released; continue with [`docs/RELEASE_GUIDE.md`](RELEASE_GUIDE.md) (6 steps done by a person + 2 stages the machines do on their own)
