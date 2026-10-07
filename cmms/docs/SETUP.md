# Setup — step by step

**English** · [ไทย](SETUP.th.md)

About 30 minutes. You need a **company** Google account, not a personal one — see step 7.

**Before you start**

```bash
git clone https://github.com/twnote05/Free-CMMS-For-poor-Engineer.git
cd Free-CMMS-For-poor-Engineer/cmms
```

You also need **Node.js 18+** (for `clasp` and for running the tests). Check with `node -v`.
If you would rather not install anything, skip to the *Without clasp* note in step 3 — you can paste the files by hand.

---

## 1. Create the file and folder

1. Create an empty **Google Sheet**. Any name will do.
   Copy the `SHEET_ID` from the URL: `docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`
2. Create a **Drive folder** for photos attached to work orders.
   Copy its id from the URL: `drive.google.com/drive/folders/`**`<DRIVE_FOLDER_ID>`**

> You can paste the whole link instead of the bare id — the code extracts it — but the id is easier to read later.

---

## 2. Create the Apps Script project

In the sheet: **Extensions › Apps Script**, give the project a name.
Copy the **Script ID** from **Project Settings › IDs**.

---

## 3. Upload the code

```bash
npm i -g @google/clasp
clasp login
```

Copy `.clasp.json.example` to `.clasp.json` and put your Script ID in it:

```json
{ "scriptId": "<your SCRIPT_ID>", "rootDir": "gas" }
```

```bash
clasp push -f
```

> If `clasp push` fails, enable the Apps Script API at https://script.google.com/home/usersettings

**Without clasp:** open the Apps Script editor and create the files by hand, pasting the contents of the `gas/` folder — `Code.gs`, `Forms.gs` as script files; `index.html`, `app.html`, `styles.html` as HTML files.

---

## 4. Add the secrets

**Project Settings › Script Properties › Add script property** — four entries:

| Name | Value |
|---|---|
| `SHEET_ID` | from step 1 |
| `DRIVE_FOLDER_ID` | from step 1 |
| `DASHBOARD_PASSWORD` | password for the dashboard/export screen — **make it hard to guess, not `1234`** |
| `AUTH_SECRET` | run `makeSecret()` (a helper in this project's `Code.gs`, available once step 3 is done) and copy the value from the execution log |

> ⚠️ **Never put these in the `ตั้งค่า` (settings) sheet** that the whole department can open.
> Changing `AUTH_SECRET` logs everyone out immediately — set it once and leave it alone.

---

## 5. Create the sheets and background jobs

In the editor, pick the function from the dropdown and press **Run**.

1. **`setup()`** — creates every sheet with its headers and seeds the settings sheet with documented defaults. Safe to re-run; it does not delete existing data.
2. **`setupTriggers()`** — installs the daily jobs: extend the PM schedule at 06:00, send the supervisor a backlog digest at 07:00, remind technicians at 08:00.

> ⏰ **Set your time zone first.** Those hours follow the script's time zone, which this template ships as `Asia/Bangkok` in `gas/appsscript.json`.
> Change it there before pushing, or in **Project Settings › Time zone**, otherwise the jobs fire at the wrong time of day and every date in the system is off.

The first Run asks for authorisation to Sheets/Drive/Gmail. If you see "Google hasn't verified this app", choose Advanced → Go to ...

---

## 6. Publish as a web app

**Deploy › New deployment › Web app**

| Field | Value |
|---|---|
| Execute as | **Me** |
| Who has access | **Anyone** — the option that does **not** require a Google account (older wording: *Anyone, even anonymous*) |

Deploy, then copy the **Web app URL** ending in `/exec`. **That is the link you hand out.**

> `Anyone` lets production staff report a fault without a Google account.
> Everything that needs a role is already gated by a server-side token check.

---

## 7. Who should own this

The project lives under the account that deploys it. **If that account is disabled, the web app dies and the triggers stop.**

Use a shared company account and give edit access to at least two administrators. Do not use the personal account of whoever wrote the code.

---

## 8. Load your starting data

Open the sheets `setup()` created.

### `ทะเบียนเครื่องจักร` — machine register

| Column | Meaning |
|---|---|
| `รหัสเครื่อง` | your internal asset code |
| `ชื่อเครื่องจักร` | **the canonical name used everywhere** |
| `ประเภท` | category, e.g. primary / secondary machine |
| `ผู้ดูแล` | the crew or station that owns it, e.g. `EXT`, `UV` — **must match `สถานีประจำ` in the `Users` sheet exactly** |
| `ชื่อเดิมที่เคยใช้` | other names this machine has been called, comma-separated |
| `ใช้งาน` | `ใช่` (yes) / `ไม่ใช่` (no) |

> **The aliases column matters more than it looks.** In the original plant's historical data, one machine appeared under 117 different names because everyone typed it freehand. Listing the old names here keeps per-machine statistics from fragmenting.

### `Users`

| Column | Meaning |
|---|---|
| `อีเมล` | used to log in · **no email means the person cannot log in at all** |
| `ชื่อ-นามสกุล` | display name on work orders |
| `บทบาท` | `TECH` · `ENG` · `LEAD` · `ADMIN` |
| `ใช้งาน` | `ใช่` / `ไม่` |
| `PIN`, `SALT`, `FAILED`, `LOCKED` | **leave empty** — filled in by the system |
| `สถานีประจำ` | matches `ผู้ดูแล` in the machine register, or `ALL` for plant-wide |

On a user's first login the system asks them to choose a PIN (6–8 digits), stored as SHA-256 with a per-user salt.

> ⚠️ **Do not reorder columns 1–9** if another system reads this sheet by column position. Add new columns at the end.

### `วันหยุด` — holidays

Your factory's non-working days, which are not always the public holidays. The PM calendar uses this sheet to avoid scheduling work on them.

---

## 9. Connect Google Forms (for daily checklists)

1. Build your checklist form and link its responses to a spreadsheet.
2. The form must capture the **machine name** and the **inspector's name**.
3. Add the response file's id as a Script Property `CHECK_SHEET_ID`.
4. Run **`sourceAudit()`** — it reports whether the file opens and how many machine names in the form match the register.

The header names the code looks for are configurable in the `ตั้งค่า` sheet (`คอลัมน์เครื่องจักร`, `คอลัมน์ผู้ตรวจ`, `คอลัมน์ผลการตรวจ`).

---

## 10. Check before going live

Run **`dataIssues()`** and read the execution log. It is read-only.

Clear these before letting people in:

- machines with no owner — nobody sees them in "my machines" mode
- users whose station matches no machine — their filtered view is empty
- a weak `DASHBOARD_PASSWORD`
- users with no email

Then open the `/exec` link, log in as one `LEAD` account, and take a single work order from creation through to closure.

---

## Next

[RUNBOOK](RUNBOOK.th.md) — deploying the next version, rolling back a bad deploy, resetting a PIN, and the failure modes you will actually hit.
