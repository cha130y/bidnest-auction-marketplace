# Workflow Diagrams

Diagrams of how the whole system works, in one file — 1 architecture overview, 1 end-to-end overview and 13 per-feature diagrams
Drawn from the actual code in `apps/api` and `apps/web`, not from documents alone, so they can be used to check how the system really behaves

> **These diagrams say "how the system works"**, while **the SRS says "what it must do to pass"** and **the ERD says "how data is stored"** —
> when they disagree, treat the SRS as the requirement and report where the diagram or code has drifted

---

## How to open them

There are two editions with the same content and diagrams, differing only in language — the English edition is for sending to instructors or people outside the team who can't read Thai

| Edition | Local file (click to open) | Online link |
| --- | --- | --- |
| **Thai** — the primary source | [bidnest-workflows-v1.html](bidnest-workflows-v1.html) | <https://claude.ai/code/artifact/8ca77c79-a7e5-4d44-96d7-9a9d4dce3157> |
| **English** | [bidnest-workflows-v1-en.html](bidnest-workflows-v1-en.html) | Same link as the Thai edition — switch with the language link under the title |

Each is a single self-contained HTML file — no server to run, no `pnpm dev` — double-clicking it in File Explorer opens it
or open it from the terminal, standing at the project root:

```powershell
start docs\architecture\workflows\bidnest-workflows-v1.html
```

```powershell
start docs\architecture\workflows\bidnest-workflows-v1-en.html
```

Both pages have a language-switch link under the title to jump between them (open them in a real browser; in VS Code's preview the link may not work)

**Good to know:** offline, the page still opens fine, but the IBM Plex fonts don't load (they come from Google Fonts), so the page falls back to system fonts
Everything is still readable, it just looks different

---

## What's in the file

| # | Diagram | Answers |
| --- | --- | --- |
| — | System components | How web / api / db / external services connect |
| 00 | Whole-system overview | Where the two paths to a price (auction / buy now) meet |
| 01 | Sign up / log in | Why login has two stages, and where trusted devices cut in |
| 02 | Auction lifecycle | Which statuses a person triggers and which the system triggers on schedule |
| 03 | Placing a bid | Checks → transaction → broadcast |
| 04 | Live auction room | Lobby → arena → deciding phase → result |
| 05 | Watchlist + notifications | 8 event types → 1 data row → 2 destinations |
| 06 | Product status | How a seller pausing differs from an admin suspending (ADR-0002) |
| 07 | Cart → payment | One payment, split into orders per seller |
| 08 | Shipping | The allowed status sequence and where cancellation is possible |
| 09 | AI price estimate | The success path and the path when the AI isn't available |
| 10 | AI price negotiation | What decides between the 3 outcomes |
| 11 | Support chat | What triggers the handover from the AI to an admin |
| 12 | Buyer–seller chat | What creates a chat room |
| 13 | Admin actions | How an action and its recorded reason happen together |
| — | Status reference table | Every status name, used consistently across schema / API / screens |
| — | Who owns what | The modules of Dev 1–5 |

**Diagram legend:** solid-bordered box = a step or status · **orange box = done by the system, no one clicks** · dashed box = an alternative or rejected case · grey-filled box = a condition or note

---

## Editing and updating

The file `bidnest-workflows-v1.html` (Thai) is **the primary source** — always edit it first
then update `bidnest-workflows-v1-en.html` to match. Both files share the same SVG coordinates, differing only in text and fonts
(Thai uses IBM Plex Sans Thai / English uses IBM Plex Sans)
All diagrams are hand-written inline SVG (not images), so they zoom without blurring and follow the viewer's light/dark theme

The online link is a copy published for the team's convenience; it doesn't update automatically from the file —
after editing the file, publish over it again to keep the two in sync

**When to update:** when a flow actually changes in the code, e.g. a new status, a change in the order data is written,
or an endpoint the diagrams refer to is added/moved — no update is needed for UI-only changes or refactors that keep the flow the same

---

## Related documents

| Document | When to use |
| --- | --- |
| [SRS](../../requirements/) | You need a requirement's acceptance criteria |
| [ERD](../erd/bidnest-erd-v1.dbml) | You need to know which table data is stored in |
| [ADR](../adr/) | You need to know why it was designed this way |
| [`apps/api/prisma/schema.prisma`](../../../apps/api/prisma/schema.prisma) | You need the real field and status names in the database |
