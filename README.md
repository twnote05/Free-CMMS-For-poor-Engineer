# CMMS for small factories

**English** · [ไทย](README.th.md)

Maintenance requests, preventive maintenance, daily checklists and KPIs — running entirely on **Google Sheets + Apps Script**. No server, no monthly bill, no IT department.

> Built for a ~50-person UPVC/SPC flooring plant and in daily production use.
> All company data has been stripped out; what is left is the skeleton you configure for your own site.

---

## Why it is built this way

A small factory has no cloud budget, nobody to maintain a server if the author leaves, and its users are technicians standing at a machine with oily hands and a cheap Android phone. **The training budget is five minutes per person.**

Those constraints rule out almost everything. What survives:

- **Data lives in the sheets, not in the code.** If the code breaks completely, open the spreadsheet and keep working by hand.
- **Google Forms is where you type; the CMMS is where you read.** Forms already work well on phones, handle photo upload, and everyone knows them. Don't build a data-entry screen to compete with that.
- **Non-programmers must be able to change things.** SLA targets, KPI weights, the machine register and factory holidays all live in sheets.

---

## What you get

| | |
|---|---|
| **Work orders** | Production staff can report a fault without logging in · assign to several technicians · bulk actions · trash (cancel without deleting) · automatic escalation when overdue · external repair / warranty claim tracking · PDF export |
| **Preventive maintenance** | Annual plan expanded into a schedule · calendar that skips factory holidays · PM work orders · monthly summary report |
| **Daily checklists** | Reads Google Form responses directly · per-machine score · drill into failed items · open a work order straight from a failed check |
| **Machine parameters** | Compares recorded readings against tolerances · engineer approval step · generates one Google Form per machine from the register |
| **KPIs** | MTTR · %breakdown · repeat failures · weighted per-technician scoring (weights are editable in a sheet) |
| **Also** | Dark mode · Thai/English · QR codes for machines · event timeline · in-app notifications · audit log |

**Roles:** `TECH` → `ENG`/`LEAD` → `ADMIN`, enforced server-side on every call, not by hiding buttons.
Login is **email + PIN**, not Google OAuth — technicians share phones and many have no company account.

---

## Install

About 30 minutes → [full setup guide](docs/SETUP.md)

```bash
npm i -g @google/clasp && clasp login
cp .clasp.json.example .clasp.json     # put your own scriptId in it
clasp push -f
```

Then in the Apps Script editor:

1. **Project Settings › Script Properties** — add `SHEET_ID`, `DRIVE_FOLDER_ID`, `DASHBOARD_PASSWORD`, `AUTH_SECRET`
2. Run `setup()` — creates every sheet and header, seeded with documented defaults
3. Run `setupTriggers()` — installs the daily background jobs
4. **Deploy › New deployment › Web app** · Execute as: **Me** · Who has access: **Anyone**

---

## Make it yours

Most of this is sheet edits, not code.

| To change | Edit |
|---|---|
| Company name on PDF headers | `ตั้งค่า` sheet → `ชื่อบริษัท` |
| SLA hours, reminder timing, Saturday working | `ตั้งค่า` sheet |
| KPI weights | `ตั้งค่า` sheet (policy, not logic) |
| Machines and who owns them | `ทะเบียนเครื่องจักร` sheet |
| Users and roles | `Users` sheet |
| Factory holidays | `วันหยุด` sheet |
| **Logo** | `gas/index.html` — swap the data URI in the `<img>` tag |
| **Brand colour** | `gas/styles.html`, first lines |
| **Time zone** | `gas/appsscript.json` — ships as `Asia/Bangkok`, change it before your first push |
| **Station / crew names** | No code change — derived from the `ผู้ดูแล` column of the machine register |

**Language:** the UI ships in Thai with strings inline in the code. The English toggle uses a translation table in `gas/app.html`. Translating to another language means editing those strings.

---

## Tests

```bash
node test.js
```

~2,800 lines, no framework, no network, no live Apps Script.
**It must print `OK — ผ่านทั้งหมด` before you deploy.**

---

## Know this before you adopt it

- **Pushing is not deploying.** `clasp push` updates the code; the URL your staff use still serves the pinned version until you `clasp deploy`. See the [runbook](docs/RUNBOOK.th.md).
- **Run `clearCache()` after editing sheets**, or screens keep showing stale data for 5 minutes.
- **`dataIssues()`** is a read-only data-quality report you can run any time: machines with no owner, unlabelled checklist fields, suspicious tolerances, weak passwords.
- **Apps Script limits:** 6 minutes per execution · 10M cells per spreadsheet · `CacheService` TTL is not guaranteed.
- **The web app is public (`ANYONE_ANONYMOUS`)** so production staff can report faults without an account. That makes **server-side code the only security boundary** — keep it that way.

## Not included

You would have to build these yourself: spare-parts/stock integration · labour costing · digital signatures · a native mobile app · a separate staging environment · idempotency keys for flaky connections.

---

## Docs

| | |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Step-by-step install |
| [docs/RUNBOOK.th.md](docs/RUNBOOK.th.md) | Deploy, roll back, reset a PIN, common failures (Thai) |
| [docs/SHEETS.th.md](docs/SHEETS.th.md) | Every sheet and column (Thai) |

## Licence

MIT — use it, change it. No warranty.
