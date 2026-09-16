# Dev 4 — Commit & PR Workflow (slash command template)

> **Approach owner:** Dev 4 (Auction Module & Real-time)
> **What this file is:** a copy of the personal slash command `/commit` actually in use, put in the repo as **a template for teammates to copy and adapt as their own**
> **Not a team rule** — the rules the whole team shares live only in `CLAUDE.md`; this file is a personal approach, adjust it as you like
> **Use together with:** [`dev4-auction-workflow.md`](./dev4-auction-workflow.md) — that file covers **build + test**, this file covers **ship**
> **References:** the "Commit message" and "PR step" sections of `CLAUDE.md`

---

## Why it is a separate command

`/dev4` and `/commit` form a single cycle, but live in separate files:

| | `/dev4` | `/commit` |
|---|---|---|
| Scope | build + test | ship |
| What it does | Read the SRS → implement one requirement at a time → test against the acceptance criteria → report real results | Check git status → draft the commit → push → check for open PRs → assemble the PR form URL |
| Ends at | "Ready to commit?" | Sending the URL for the user to click Create PR themselves |

Why not cram it all into one file: the ship steps are reusable for any kind of work, not just auction-side requirements
and if the commit steps were written in two places, editing one and forgetting the other would make the two files drift apart
so `/dev4` points to `/commit` instead of re-explaining how to commit

## How to use it

1. Create the file `.claude/commands/commit.md` on your own machine
2. Copy the content of the block below into it, then adapt it to your own environment
   - The commands in the block are **PowerShell** (Windows); on macOS/Linux, convert them to bash
   - The base branch in this file is locked to `dev` per `CLAUDE.md` — don't change it to `main`
   - The A/B status table in step 1 is the heart of this file — don't remove it
3. Invoke it with `/commit <requirement-id>`, e.g. `/commit AUC-003`

`.gitignore` already excludes `.claude/*`, so the command file on your machine won't reach git and won't affect anyone

---

## Template content (copy the whole block, including the frontmatter)

> The block below is wrapped in **4 backticks**, because it contains nested ``` code blocks
> When copying, take only what is inside the ```` lines

````markdown
---
description: commit + push the current work, then send a URL that opens a PR with the title/description already filled in
---

# /commit — commit, push, then send a URL that opens a pre-filled PR form

A requirement id can be passed as an argument, e.g. `/commit AUC-002`
If it isn't given, infer it from the diff and ask for confirmation in step 3

> **Never create or merge the PR yourself** (CLAUDE.md, PR step section)
> This command ends only at "send the URL for the user to click" — never call `gh pr create`,
> `gh pr merge` or `git merge` into dev/main under any circumstances

---

## Step 1 — Survey the state first

```powershell
git fetch --prune origin
$branch = git branch --show-current
$branch
git status --short
git log --oneline "origin/$branch..HEAD"   # A — is anything really waiting to be pushed?
git log --oneline origin/dev..HEAD         # B — is there anything to open a PR for?
```

**`--prune` is required** — GitHub deletes the branch automatically after a PR is merged, but a plain `git fetch`
doesn't remove dead remote-tracking refs, so `origin/$branch` keeps pointing at an old commit,
and A reports "commits waiting to be pushed" against a branch that no longer exists on the remote

A and B answer different questions; don't use one to measure both — if it's pushed but the PR isn't merged yet,
A is empty (no need to push again) but B isn't (there is still work waiting to get into dev)

If `origin/$branch` doesn't exist on the remote (a new branch, or deleted after merge), command A errors out —
treat it as "never pushed" and look only at B to see whether there is anything to open a PR for

Then read the actual diff with `git diff` and `git diff --staged`

**Stop immediately in these cases** (state the reason and end — don't continue):

- On the `main` or `dev` branch — work must be on `feat/<module>-dev<n>`
- The diff contains `.env`, a key, a token or a secret — warn, and have the user remove it first

**If the working tree isn't clean** → go to step 2 as usual

**If the working tree is clean**, look at A and B together — **B decides whether there is a PR to make**:

| A (waiting to push) | B (waiting for dev) | Means | Next |
|---|---|---|---|
| empty | empty | Nothing at all | Say there is nothing to do, and end |
| not empty | empty | The branch was fast-forwarded to dev after the PR merged | **No PR to make**; offer `git push origin <branch>` to sync the remote (optional), and end |
| empty | not empty | Pushed, waiting to open/update the PR | Skip to step 5 |
| not empty | not empty | Work waiting to be pushed | Skip to step 4, then step 5 |

The second row is the trap: a non-empty A suggests there is pending work, when those commits actually already got into dev
through a PR that was merged. Looking only at A, you would send a URL for an empty PR with no diff

Before ending in any case, if `git rev-list --count HEAD..origin/dev` > 0, say how many commits the branch is behind dev
and offer `git merge --ff-only origin/dev` before starting new work

## Step 2 — Draft the commit plan

Message format per CLAUDE.md: `<type>(<requirement-id>): <short English description>`

- type: `feat` / `fix` / `refactor` / `test` / `docs` / `chore` / `ci`
- Include the requirement-id when it maps directly to an SRS requirement; general infra work can skip it
- The message is always in English

**If the diff spans several kinds of work, propose separate commits**, e.g. feature code and test/doc files
in different commits — say clearly which files go in which commit; don't lump them together out of laziness

Write a commit body when there is something the diff doesn't say (the reasoning behind a decision, the options not chosen and why)
If the diff already explains itself, a single line is enough

## Step 3 — First confirmation

Use AskUserQuestion to ask whether to commit according to this plan, with at least these options:

- OK, commit + push as planned
- Edit the message first
- Split the commits differently

**Always wait for a real answer — never assume the user said yes**

## Step 4 — Commit, then push

- `git add` with **explicit paths** — never `git add -A` or `git add .`
- For multi-line commit messages use a here-string (`@'` … `'@` closed at column 0)
- If the pre-commit hook (husky/lint-staged) modifies files or fails, report it truthfully; don't use `--no-verify`

**Check dev once more before pushing** — step 1 did check it, but while drafting
the commit message, waiting for the user to confirm and running tests, several minutes pass, and someone else may have merged a PR
into dev in the meantime:

```powershell
git fetch --prune origin
git rev-list --count HEAD..origin/dev
```

**If it isn't 0, stop and tell the user first** — don't push yet; dev has to be merged in
and the tests re-run, otherwise the PR will carry old things someone else just deleted/changed back into dev

This really happened (Aug 21, 2026): the BID-004 work was pushed while the number was still 0, but in the meantime
Dev 3 merged PR #54, which deleted `apps/web/pnpm-lock.yaml`, so the branch still carried the file that had
been deleted — merging that PR would have brought the duplicate lockfile back into dev without anyone intending to

> **This item is not yet in `dev2-commit-workflow.md` or `dev3-commit-workflow.md`**
> All three files inherit the same original, so they share the same gap — Dev 2 and Dev 3
> can run into this case too; anyone interested can copy this block into their own

- push: `git push origin <branch>` (for a branch's first push use `git push -u origin <branch>`)

If you reach this step with nothing to commit (coming from the table in step 1), **just push**
and skip steps 2 and 3, because there is no commit message to confirm — but you **still have to check
dev again before pushing**

## Step 5 — Check whether a PR is already open

```powershell
gh pr list --head (git branch --show-current) --base dev --state open --json number,url
```

**If a PR is already open** → no new URL is needed, because the push just now already updated the existing PR
Send the user the existing PR's URL with a summary of what this round's commits added, and end

**If not** → go to step 6

## Step 6 — Draft the PR title + description, then the second confirmation

Both in English (per CLAUDE.md), and they must match what was actually changed

A description skeleton that works well:

```markdown
## What
<what it does — if there are new endpoints, include a method/path table>

## Why
<requirement id + which acceptance criteria it satisfies>

## Decisions worth a second pair of eyes
<points a reviewer should be able to argue with — the option chosen and why>

## Testing
<a table of real test results — how many passed, which suites>

## Not covered here
<what hasn't been done and why>
```

Then use AskUserQuestion to confirm: OK / edit title / edit description — **wait for the answer**

## Step 7 — Assemble the URL and send it to the user

The base must always be `dev`, not `main`

```powershell
$branch = git branch --show-current
$slug = ((git remote get-url origin) -replace '^.*github\.com[:/]', '') -replace '\.git$', ''

$title = 'feat(AUC-002): ...'
$body = @'
## What
...
'@

$url = "https://github.com/$slug/compare/dev...$branch" +
       "?expand=1&title=" + [uri]::EscapeDataString($title) +
       "&body=" + [uri]::EscapeDataString($body)

$url.Length
$url
```

Notes:

- **Don't encode the branch name** — GitHub already accepts `/` in the compare path (`dev...feat/auction-dev4`)
- Encode only `title` and `body`, with `[uri]::EscapeDataString()`; newlines become `%0A` on their own
- **If `$url.Length` exceeds 8000**, GitHub answers 414 — trim the description down to What and Testing only,
  tell the user honestly what was cut, and print the full description in the chat so they can copy-paste it

Finish by printing the URL on a line of its own (so it is clickable), with two reminders:

1. Check that the base is `dev` — GitHub often defaults to `main`
2. Read the pre-filled title/description before clicking **Create pull request**
````
