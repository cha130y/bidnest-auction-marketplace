# Dev 3 — Commit & PR Workflow (slash command template, bash/macOS)

> **Approach owner:** Dev 3 (E-Commerce Module)
> **What this file is:** a copy of the personal slash command `/commit` actually in use, put in the repo as **a template for teammates to copy and adapt as their own**
> **Not a team rule** — the rules the whole team shares live only in `CLAUDE.md`; this file is a personal approach, adjust it as you like
> **Use together with:** [`dev3-ecommerce-workflow.md`](./dev3-ecommerce-workflow.md) — that file covers **build + test**, this file covers **ship**
> **References:** the "Commit message" and "PR step" sections of `CLAUDE.md`

---

## How this differs from `dev4-commit-workflow.md`

The approach and the A/B table come entirely from Dev 4's version (credit to them); only the environment differs:

| | Dev 4 | This file |
|---|---|---|
| Shell | PowerShell (Windows) | **bash/zsh (macOS)** |
| here-doc | `@'` … `'@` | `<<'EOF'` … `EOF` |
| encode URL | `[uri]::EscapeDataString()` | `python3 -c 'urllib.parse.quote'` |
| Reading the remote slug | `-replace` | `sed -E` |

If you're on Windows, Dev 4's version is a closer fit

---

## Prerequisites

`gh` must be installed and **logged in** (step 5 uses it to check for open PRs)

```bash
brew install gh
gh auth login          # opens the browser, one time only
gh auth status         # confirm it's connected
```

If `gh` isn't there or isn't logged in, **skip step 5** and tell the user why it was skipped
Don't guess whether a PR is open or not

---

## How to use it

1. Create the file `.claude/commands/commit.md` on your own machine
2. Copy the content of the block below into it, then adapt it to yourself
   - The base branch is locked to `dev` per `CLAUDE.md` — don't change it to `main`
   - The A/B status table in step 1 is the heart of this file — don't remove it
3. Invoke it with `/commit <requirement-id>`, e.g. `/commit PROD-006`

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

A requirement id can be passed as an argument, e.g. `/commit PROD-006`
If it isn't given, infer it from the diff and ask for confirmation in step 3

> **Never create or merge the PR yourself** (CLAUDE.md, PR step section)
> This command ends only at "send the URL for the user to click" — never call `gh pr create`,
> `gh pr merge` or `git merge` into dev/main under any circumstances

---

## Step 1 — Survey the state first

```bash
git fetch --prune origin
branch=$(git branch --show-current)
echo "$branch"
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
  If the work spans several requirements (e.g. e2e covering PROD+CART+SHIP), it is better to **leave out the id** than to pick one at random
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
- For multi-line commit messages use a here-doc via `-F -`:

  ```bash
  git commit -F - <<'MSG'
  test: add end-to-end coverage for the e-commerce module

  Explain the reasoning here

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  MSG
  ```

  Always use `<<'MSG'` (quoted), otherwise `$` and backticks in the message get expanded by the shell
- push: `git push origin "$branch"` (for a branch's first push use `git push -u origin "$branch"`)
- If the pre-commit hook (husky/lint-staged) modifies files or fails, report it truthfully; don't use `--no-verify`

If you reach this step with nothing to commit (coming from the table in step 1), **just push**
and skip steps 2 and 3, because there is no commit message to confirm

## Step 5 — Check whether a PR is already open

```bash
gh pr list --head "$(git branch --show-current)" --base dev --state open --json number,url
```

If `gh` isn't there or `gh auth login` hasn't been run, this command errors out — **skip this step and tell the user
honestly why it was skipped**; don't guess whether a PR is open

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

```bash
branch=$(git branch --show-current)
slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')

title='test(PROD-006): ...'
body=$(cat <<'EOF'
## What
...
EOF
)

enc() { python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))'; }
url="https://github.com/$slug/compare/dev...$branch?expand=1"
url+="&title=$(printf '%s' "$title" | enc)"
url+="&body=$(printf '%s' "$body" | enc)"

echo "${#url}"
echo "$url"
```

Notes:

- **Don't encode the branch name** — GitHub already accepts `/` in the compare path (`dev...feat/ecommerce-dev3`)
  so the `$branch` variable goes into the URL directly, not through `enc`
- Encode only `title` and `body` · `safe=""` matters, otherwise `/` and `#` won't be encoded
- Use `printf '%s'`, not `echo`, because `echo` appends a trailing newline
- **If the URL is longer than 8000**, GitHub answers 414 — trim the description down to What and Testing only
  tell the user honestly what was cut, and print the full description in the chat so they can copy-paste it

Finish by printing the URL on a line of its own (so it is clickable), with two reminders:

1. Check that the base is `dev` — GitHub often defaults to `main`
2. Read the pre-filled title/description before clicking **Create pull request**
````
