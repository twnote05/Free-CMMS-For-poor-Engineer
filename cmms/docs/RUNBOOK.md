# RUNBOOK — maintenance system

**English** · [ไทย](RUNBOOK.th.md)

> For whoever administers the system. 20 minutes to read.
> First-time install is [SETUP.md](SETUP.md).
> **This file is what you read when something is broken.**

---

## 1. What the system is made of

```
Google Form — daily checklists    ─┐
Google Form — machine parameters  ─┤  ← where technicians type
Web page — report a fault          ─┘
                                    ▼
            Google Sheets (all the data lives here)
                                    ▼
            Apps Script web app → a 10-tab screen
```

**Data lives in the sheets, not in the code.** If the code breaks completely the data is still intact — open the spreadsheet and keep working by hand. That is the whole reason for choosing Google Sheets.

---

## 2. The code files

| File | Role |
|---|---|
| `gas/Code.gs` | The entire server side — the `api*` functions are what the screen calls |
| `gas/Forms.gs` | Generates Google Forms from the machine register. Run by hand; it does nothing when a user opens the page |
| `gas/index.html` | Page structure |
| `gas/app.html` | The screen's JavaScript |
| `gas/styles.html` | CSS |
| `test.js` | Test suite. `node test.js` — must print `OK — ผ่านทั้งหมด` before every deploy |

---

## 3. Deploying a new version

```bash
node test.js
```

Must print `OK — ผ่านทั้งหมด`. If it does not, **stop**. Do not deploy.

```bash
npx clasp push -f
```

The code is now on Apps Script, **but your staff are still on the old version** — the `/exec` link points at a pinned version, not at the latest code.

Test first against the `@HEAD` deployment, which always serves the latest code.

When you are satisfied, release it:

```bash
npx clasp deploy -i <DEPLOYMENT_ID> -d "1.4.8 — short description"
```

> ⚠️ `-i` must always be the **same** deployment id. That is the link everyone has bookmarked.
> Creating a new deployment gives you a new URL, and nobody can get in.

Then open the Apps Script editor, select `clearCache` and press Run.

### Confirm it actually shipped

```bash
npx clasp deployments
```

The line for your deployment id must show the new version number.

---

## 4. Rolling back a bad deploy

Point the same link back at a version that still works:

```bash
npx clasp deploy -i <DEPLOYMENT_ID> -V 57
```

Under a minute, and **you do not have to fix the code first**. Get people working again, then investigate.

See what you can roll back to:

```bash
npx clasp versions
```

Pull a specific version down to look at it:

```bash
npx clasp pull --versionNumber 57
```

> Rolling back changes code only. If the broken version wrote bad data into the sheets, that has to be repaired separately.

---

## 5. Background jobs (triggers)

| Time | Function | What it does |
|---|---|---|
| 06:00 | `extendPmSchedule` | Extends the PM schedule ahead of time |
| 07:00 | `dailyDigest` | Emails the supervisor a backlog summary |
| 08:00 | `nudgeAssignees` | Reminds technicians whose jobs are overdue |

> Those hours follow the script's time zone — check **Project Settings › Time zone** matches your plant.

**If the triggers disappear** (it happens when the project changes owner, or authorisation expires): open the editor, select `setupTriggers`, press Run. It deletes the old ones and creates them fresh, so re-running is harmless.

To see whether they ran: editor → left menu → **Executions**.

---

## 6. Functions you run by hand

Pick the function from the dropdown at the top of the editor and press Run. Output goes to the **Execution log**.

| Function | When |
|---|---|
| `clearCache()` | **After every deploy**, and after editing the `ตั้งค่า` / `Users` / `ทะเบียนเครื่องจักร` sheets — skip it and screens keep showing stale data for 5 minutes |
| `dataIssues()` | Data-quality report: machines with no owner, unlabelled checklist fields, suspicious tolerances, work orders with impossible timestamps, weak passwords. **Read-only — changes nothing** |
| `sourceAudit()` | Checks that the linked parameter / checklist files open, and how many machine names match the register |
| `techAudit()` | Shows how many spellings appear in the "technician" column and which are unrecognised |
| `setup()` | Creates missing sheets. Safe to re-run; deletes nothing |
| `setupTriggers()` | Recreates the background jobs |

---

## 7. Routine tasks

### Add a machine
`ทะเบียนเครื่องจักร` sheet → new row → fill `ชื่อเครื่องจักร`, `รหัสเครื่อง`, `ประเภท`, **`ผู้ดูแล`** → run `clearCache()`

> `ผู้ดูแล` must match `สถานีประจำ` in the `Users` sheet **exactly** — `EXT`, `UV`, `CUT`, whatever you actually use.
> A mismatch means no technician sees that machine in "my machines" mode, and **there is no error message**. `dataIssues()` catches it.

### A form uses a different machine name than the register
Do not rename the machine. Put the form's spelling in the `ชื่อเดิมที่เคยใช้` column (comma-separated), then run `clearCache()`.

### Add a user
`Users` sheet → new row → `อีเมล`, `ชื่อ-นามสกุล`, `บทบาท` (`TECH`/`ENG`/`LEAD`/`ADMIN`), `ใช้งาน` = TRUE, `สถานีประจำ`

> **Do not reorder columns 1–9** — the Stock system reads them by position, not by header name, and will break instantly. Columns 10 and beyond are free. See [SHARED-USERS.md](../../SHARED-USERS.md).

### Reset someone's PIN
`Users` sheet → clear their `PIN` and `SALT`, and clear `FAILED` and `LOCKED` too → they choose a new PIN at next login.

### Unlock an account after too many wrong PINs
`Users` sheet → clear `LOCKED` and `FAILED`.

---

## 8. Failures you will actually hit

| Symptom | Cause seen in practice | Fix |
|---|---|---|
| Edited a sheet, screen unchanged | 5-minute cache | Run `clearCache()` |
| Machine cards are empty, no error | `PARAM_SHEET_ID` points at the wrong file, or names do not match the register | Run `sourceAudit()` |
| A technician logs in and sees none of their machines | `ผู้ดูแล` is blank or misspelled | Run `dataIssues()` |
| `No item with the given ID could be found` | The script can read the sheet but has no **edit** rights on the form | Grant the deploying account edit access to that form |
| `Exceeded maximum execution time` | A job ran past 6 minutes | Re-run it — the form generator registers before it builds, so it skips what is already done |
| Photos will not save | `DRIVE_FOLDER_ID` is wrong, or the account has no access to the folder | Check Script Properties |
| Users get an authorisation screen | The deployment is not set to `ANYONE_ANONYMOUS` | Deploy › Manage deployments |

---

## 9. Where the secrets live

**Project Settings › Script Properties** only. **Never the `ตั้งค่า` sheet**, which the whole department can open.

| Name | What it is |
|---|---|
| `SHEET_ID` | The main CMMS file |
| `DRIVE_FOLDER_ID` | Folder for photos attached to work orders |
| `AUTH_SECRET` | Token signing key — **changing it logs everyone out immediately** |
| `DASHBOARD_PASSWORD` | Password for the dashboard/export screen |
| `PARAM_SHEET_ID` | The parameter file — **read-only** |
| `CHECK_SHEET_ID` | The daily-checklist response file |

> You may paste a full link instead of a bare id; `driveId_()` extracts it. The id is easier to read later.

---

## 10. Backups

There is no automatic backup. **Do it by hand at least monthly.**

1. Open the main spreadsheet → File › Make a copy → name it `CMMS backup YYYY-MM`
2. Keep it in a company folder, not somebody's personal Drive
3. Do the same for the checklist and parameter files

The code is already versioned inside Apps Script (`clasp versions`) and in this repository.

---

## 11. Risks still open

| | Why it matters |
|---|---|
| **The project sits under one account** | Disable that account and the web app dies, the triggers stop, and nobody can deploy → move it to a company account with a second administrator |
| No staging environment | Real testing happens on the live system. Use the `@HEAD` deployment as a stand-in |
| No idempotency key | A double tap on a bad connection can create a duplicate work order |
