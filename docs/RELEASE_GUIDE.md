# Release Guide

The steps for promoting work from `dev` to `main` — only when releasing to production, **not part of daily work**

> **Daily work** (starting work / committing / opening PRs into `dev`) is in [`docs/DAILY_WORKFLOW.md`](DAILY_WORKFLOW.md)
> This file picks up from the point where everyone's PRs have been merged into `dev`

**`main` is production** — Railway (API) and Vercel (Web) deploy as soon as `main` moves, and **no automation merges `dev` into `main` for you**; a release PR has to be opened by hand every time

---

## Overview

```
feat/<module>-devN  --PR-->  dev  --release PR-->  main  --auto-->  Railway + Vercel
                   (manual)          (manual)           (automatic)
```

In total, **6 steps done by a person** + **2 stages the machines do on their own** (Step 4 and Step 7)

---

## Step 1 — Check what's waiting to be released

```bash
# Read-only, doesn't create a PR — run it as many times as you like
git fetch origin
git log --merges --pretty='- %s' origin/main..origin/dev
```

You get the list of PRs that `dev` has but `main` doesn't — copy it for Step 2

```bash
# To see detail down to the commit level instead of per PR
git log --no-merges --pretty='- %s' origin/main..origin/dev
```

**✅ Done when:** a list of PRs shows up on screen

**Nothing shows up** = `main` has caught up with `dev`; there's nothing to release this time, and you're done

---

## Step 2 — Open the release PR

Open the compare page in a browser

```
https://github.com/cha130y/bidnest-auction-marketplace/compare/main...dev
```

Make sure the top of the page says **`base: main` ← `compare: dev`** and shows **Able to merge**

**Title** — use the team's usual format; add `(<REQUIREMENT-ID>)` if the round is a single requirement only

```
chore: release dev to main - <short summary of what this round contains>
```

```
chore(AI-001): release dev to main - support chat fixes and a wider FAQ
```

> Be careful not to put an extra space before the `:`, because this title becomes the **merge commit message on `main`** — an extra space breaks the team's commit format

**Description** — 2–3 short lines is enough, the details are already in the child PRs. Paste the list from Step 1; just type `#153` and GitHub links it for you

```markdown
Promotes `dev` to `main`. Two PRs since the last release (#152).

- #153 — AI-001: support chat fixes and a wider FAQ
- #154 — AUC-004: fix the closing job timezone
```

**✅ Done when:** you click Create pull request and the PR appears

---

## Step 3 — Click Update branch right away (don't wait for CI)

If the bottom of the PR shows the **"This branch is out-of-date with the base branch"** bar, click **Update branch** immediately — **don't wait for the 3 jobs that are running**

> ⚠️ **Never choose "Update with rebase"** — only use **"Update with merge commit"**, which is the default
> `dev` is shared by all 5 people; a rebase rewrites the whole history, and everyone's local `dev` breaks at once

No bar = `dev` is already up to date with `main`; skip straight to Step 4

**✅ Done when:** the out-of-date bar is gone and CI starts a new run

---

## Step 4 — Wait for CI (automatic · about 4 minutes)

Nothing to do — wait for these 3 jobs to go green. All three are marked **Required**; if any of them is red, the merge button can't be clicked

| Job | What it checks |
|---|---|
| `lint-and-test` | lint, unit tests and the `apps/web` build — catches Server Components that fail to build, which doesn't show up in dev |
| `docker-build` | whether the API image still builds (build only, no push) — the Dockerfile is production code that lint and tests never read |
| `e2e` | runs the real API against real Postgres 17 + MailDev via `migrate deploy` → `db seed` → `test:e2e` — catches migrations that don't apply |

The green check named **Vercel** is the frontend preview deploy, a separate track from these three CI jobs, and not required

**✅ Done when:** it shows "All checks have passed"

**If it's red:** read the failing job's log, fix it on the source branch, open a PR into `dev` as usual, then come back and start again from Step 1 — **never fix it directly on `dev`**

---

## Step 5 — Get approval from 1 teammate

Branch protection enforces `required_approving_review_count: 1` — you can't merge on your own

Ideally pick the person whose work is in this round, because they know what to look at

> `dismiss_stale_reviews: false` is set — if a teammate approves and someone clicks Update branch afterwards, the approval **is not cleared**, so there's no need to bother them again

**✅ Done when:** there's a green check next to the approver's name

---

## Step 6 — Click Merge pull request

Use the **Merge pull request** button (merge commit), as the team always has

**Don't use Squash and merge**, because it collapses everyone's work in the round into a single commit, and you can no longer trace which PR changed what

**✅ Done when:** the PR shows the purple Merged status

---

## Step 7 — Railway and Vercel deploy (automatic)

Nothing to do — both providers see `main` move and start on their own

- **Railway → `apps/api`** builds the image from the [`Dockerfile`](../Dockerfile); when the container boots, [`docker-entrypoint.sh`](../docker-entrypoint.sh) always runs `prisma migrate deploy` first — **no need to migrate by hand**
- **Vercel → `apps/web`** builds Next.js itself, completely separate from Railway; `apps/web` never goes through a Docker image

> ⚠️ **The `railway.json` at the repo root is not what Railway reads**
>
> That file does specify `builder`, `healthcheckPath` and `restartPolicy`, but the values actually used at deploy time are in the **service Settings on the Railway dashboard**. Editing the file and committing it changes nothing, and no error tells you so
>
> To change the builder or health check, go to:
>
> ```
> Railway → project BidNest → the API service → Settings
> ```

CI also runs again on `main`, as the last gate before the real thing goes out

**✅ Done when:** Railway shows Deployment successful

---

## Step 8 — Check production is still breathing

Find the API's real domain first — **it's not in the repo**; get it from the dashboard

```
Railway → project BidNest → the API service
→ Settings → Networking → Public Networking
```

Then hit the health check from your own machine (opening it in a browser works too, same result)

```bash
# Git Bash — replace <railway-domain> with the real domain copied from Railway
curl https://<railway-domain>/health
```

```powershell
# PowerShell — curl in PowerShell is an alias of Invoke-WebRequest, not the real curl
Invoke-RestMethod https://<railway-domain>/health
```

**✅ Done when:** you get **exactly this** result, and nothing else

```json
{"status":"ok"}
```

> Anything other than `{"status":"ok"}` = **you hit the wrong server**, not our API; go back and get the domain from the Railway dashboard again
> This format comes from `apps/api/src/health/health.controller.ts`; if that endpoint ever changes, update this line too

```bash
# For rounds that include a migration — open Railway's deploy log and find this line to confirm it passed
==> prisma migrate deploy
```

Finish by trying out at least 1 of the newly released features on the live site

---

## Common pitfalls

**1. Waiting for CI to finish before clicking Update branch**
Wastes a full round, because the commit being tested isn't the commit that will actually be merged. Click Update first, then wait for a single round

**2. Accidentally choosing Update with rebase**
Rewrites the whole history of `dev`; everyone with `dev` on their machine has to fix it at once. Use merge commits only

**3. Opening a PR from a feature branch straight into `main`**
Against the rules in `CLAUDE.md` — feature branches always go into `dev`; only a release PR may have `main` as its base

**4. Letting work sit in `dev` too long**
Bundling several PRs doesn't make merging any harder (`dev` is a superset of `main`, so conflicts are nearly impossible), but if production breaks you can't tell which one did it, and a rollback drags innocent work back with it — once it's past 6–8 PRs, it's time to release

**5. A round that mixes a migration with ordinary features**
Migrations are the hardest thing of all to roll back. If a round touches `apps/api/prisma/schema.prisma`, release it on its own, so you immediately know what caused any breakage

**6. Trusting a health check without checking it's ours**
Railway domains are public names anyone can claim; hitting the wrong one can also return 200. The response must be exactly `{"status":"ok"}`, and **never put a domain you're unsure of into `NEXT_PUBLIC_API_URL`**, because that would send users' passwords to a server we don't know

---

## Rules set on `main`

Actual values from the repo's branch protection

| Rule | Value | Meaning |
|---|---|---|
| Required checks | `lint-and-test`, `docker-build`, `e2e` | All three must be green before merge is possible |
| Strict (up-to-date) | On | Must click Update branch every time it falls behind `main` |
| Approvals | 1 person | You can't merge on your own |
| Dismiss stale reviews | Off | Existing approvals stay after a new push |
| Force push / delete | Both off | `main` can't be deleted or overwritten |
| Enforce on admins | Off | Admins can still push straight to `main` — **don't use this shortcut** |

```bash
# Check the current values yourself any time (requires the gh CLI, logged in)
gh api repos/cha130y/bidnest-auction-marketplace/branches/main/protection
```

---

## Why it works this way

**Why `dev` → `main` isn't automated:** because `main` deploys to production the moment it moves. Auto-merging from `dev` every time would mean every PR into `dev` ships straight to production, defeating the purpose of having `dev` as a middle gate. Having a person click is the point where we get to decide "is this round ready to go out?"

**Why click Update branch before waiting for CI:** branch protection sets `strict: true`, so it can't be merged while behind `main` anyway, and clicking Update branch pushes a new commit, which restarts CI from scratch regardless — waiting for it to finish before clicking just throws away one CI run

**Why CI needs 3 jobs:** `lint` and `test` run on the runner's Node and never open the `Dockerfile` — a dependency that needs an extra system package, or a moved path, would go unnoticed until a deploy breaks. `e2e` is the only job that runs the API against a real database, so a migration that doesn't apply shows up here instead of when the container boots in production

**Why not squash merge:** one round can mix the work of 3–4 people; squashing leaves a single commit on `main`, so `git log` no longer says who changed what, and reverting just one person's work becomes impossible

---

## Related documents

- [`docs/DAILY_WORKFLOW.md`](DAILY_WORKFLOW.md) — daily work: starting work / submitting work into `dev`
- [`docs/KICKOFF_GUIDE.md`](KICKOFF_GUIDE.md) — first-time machine setup, branch protection setup, CI/CD
- `CLAUDE.md` — rules for branch names, commit messages, PRs

**Repo files this document refers to** — if these files change, update this document too

- `.github/workflows/ci.yml` — definitions of the 3 jobs in Step 4
- `railway.json` — `builder: DOCKERFILE`, `healthcheckPath: /health`
- `Dockerfile` and `docker-entrypoint.sh` — what happens in Step 7
- `apps/api/src/health/health.controller.ts` — the expected response in Step 8
