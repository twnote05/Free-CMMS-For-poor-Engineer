# Notes for AI assistants

Read this before touching anything. It is short on purpose.

If you are a human: this file is for Claude Code, Codex, Cursor, Gemini CLI and similar tools, which read it automatically. You do not need it.

---

## What this repository is

Three independent tools for a small factory, all built to run with no server and no IT department:

| Folder | What | Stack |
|---|---|---|
| `cmms/` | Maintenance requests, PM, daily checklists, KPIs | Google Apps Script + Sheets |
| `stock/` | Spare parts, tools, blades — FIFO batches | Google Apps Script + Sheets |
| `wi-generator/` | 16 kinds of factory document | One standalone HTML file |

**They do not depend on each other.** Work on one at a time. Ask the user which one before you start — guessing wastes a whole session.

The UI is Thai. Strings are inline in the code, not in a resource file. Comments are Thai and explain *why*, not *what*. Match that style.

---

## What you cannot do

These steps need a human in a browser, signed into their own Google account. **Do not pretend to perform them, and do not ask for the user's password.**

- Creating the Google Sheet and the Drive folder
- Creating the Apps Script project
- `clasp login` and granting OAuth consent
- Setting Script Properties
- Pressing **Run** the first time (it triggers the authorisation dialog)
- **Deploy › New deployment** and choosing who has access
- Scanning or testing anything on a phone

Your job is everything around those: explaining the step, preparing the code and values, checking the result, and diagnosing what went wrong.

When the user reaches one of those steps, say plainly that they have to do it, tell them exactly what to click, and wait.

---

## Read in this order

Do **not** start by reading `cmms/gas/Code.gs` (about 5,000 lines) or `cmms/gas/app.html` (about 6,700). You will burn the context window and then guess.

1. The folder's `README.md`
2. `docs/SETUP.md` — for a fresh install
3. `docs/RUNBOOK.md` — when something is broken
4. `docs/SHEETS.th.md` (cmms) or `docs/HOWTO.md` (stock) — for the data model
5. Only then, the specific function the task is about

`SHARED-USERS.md` is required reading before anyone runs both `cmms/` and `stock/` against the same spreadsheet.

---

## Rules that are not negotiable

**Pushing is not deploying.** `clasp push` updates the code; the `/exec` link keeps serving the pinned version until someone deploys. When a user says "I changed it but nothing happened", this is the answer roughly every time.

**`Users` columns 1–9 are frozen.** `cmms/` and `stock/` both read them, and `stock/` reads them *by position*. Reordering or inserting breaks the other system instantly and silently. Add new columns at the end, and look them up by header name.

**In `stock/`, on-hand is never a column.** It is `SUM(Qty_Left)` across that part's rows in `Batches_FIFO`. Never write a quantity field. Create a batch or draw from one.

**Hiding a button is not access control.** Every mutating call checks the role server-side. Keep it that way — the web app is published to anyone with the link, so server code is the only boundary.

**Data lives in the sheets.** Settings, SLA targets, KPI weights, the machine register, holidays. If you are about to hardcode one of those, put it in a sheet instead.

**Run the tests before you hand anything back.**

```bash
cd cmms && node test.js          # must print: OK — ผ่านทั้งหมด
node stock/tests/run.js          # must print: ผ่านครบทุกชุด
node wi-generator/wi_test.js     # must print: ผ่านทั้งหมด
```

Non-trivial logic leaves one runnable check behind. No frameworks.

---

## Limits that actually bite

| Limit | Value | What happens |
|---|---|---|
| Script execution | 6 minutes | Long loops must batch or be resumable |
| Cells per spreadsheet | 10,000,000 | **All writes fail** — not just slow, the system stops |
| `CacheService` TTL | not guaranteed | Entries can evict early. Never the only source of truth |
| `CacheService` entry | 100 KB | Bigger payloads are silently not cached |

The web app runs in a sandboxed iframe. `getUserMedia` is blocked in some in-app browsers (LINE especially), so camera features keep an `<input type="file" capture>` fallback. Do not remove it.

---

## Do not propose

- Migrating to SQL, Firebase, or an off-the-shelf CMMS — there is no budget and nobody to maintain it
- Google OAuth instead of PIN login — technicians share phones and many have no company account
- Rewriting any of the three — they work; improve them
- Deleting finished features as "debt" (dark mode, bilingual UI, the form generator)
- Adding an npm dependency to the Apps Script projects — there are none, and that is deliberate

If you think one of these is wrong for the user's situation, argue it with reasons. Do not quietly design around it.

---

## Useful diagnostics

Run these from the Apps Script editor. They are read-only and safe.

| Project | Function | Tells you |
|---|---|---|
| cmms | `dataIssues()` | Machines with no owner, unlabelled checklist fields, suspicious tolerances, impossible timestamps, weak passwords |
| cmms | `sourceAudit()` | Whether linked Form files open, and which machine names fail to match the register |
| stock | — | `node stock/tests/run.js` renders every screen against a full dataset |

When a screen is blank with no error, run the diagnostic before reading code. The usual causes are a wrong file id, a name that does not match the register, or a stale cache.

---

## Editing files

Content is Thai with backticks and `${}` in it. Heredocs mangle it. Use the editor tool, or write a patch script to a file and run that.

Anchor patches on text that is unique, including the enclosing function name. A generic anchor matches the first of several similar blocks and the change lands in the wrong screen.
