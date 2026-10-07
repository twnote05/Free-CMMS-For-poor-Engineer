# Integration Brief — Spare Parts Stock System

**Paste this whole file to your AI assistant, or read it yourself, before integrating.**

You are integrating with an existing, working spare-parts inventory system built on
Google Apps Script + Google Sheets. It is in production use at a manufacturing plant
managing roughly 1,000 parts, 94 tools, and 145 blades.

Your job is to call its backend from your own web app, or to lift its engine into your
stack. This document tells you exactly what exists, what the contracts are, and which
invariants you must not break.

---

## 1. What this system is

A warehouse system for an **operations-only team** — technician → lead technician →
operations engineer. There is no admin role and no one monitoring it full time, so the
system is built to protect itself rather than rely on a careful operator.

| Layer | Technology |
|---|---|
| Backend | Google Apps Script (V8 runtime, server-side JS) |
| Database | Google Sheets (14 sheets, one spreadsheet) |
| Frontend | Vanilla JS + Tailwind via CDN, no build step |
| Auth | Salted SHA-256 PIN, server-issued session tokens |
| UI language | Thai (all labels, errors, and sheet headers) |

**There is no REST API and no HTTP endpoint you can curl.** Everything goes through
Apps Script's `google.script.run` bridge. Section 7 covers your options if you need HTTP.

---

## 2. The one rule that makes everything else work

> **Stock on hand is never stored as a column. It is always `SUM(Qty_Left)` across that
> part's rows in `Batches_FIFO`.**

Every correct behavior in this system falls out of that single decision:

- FIFO draw order is real, because batches are real rows with real receipt dates
- Unit cost is per batch, so cost-of-issue is accurate, not a moving average
- Returns put quantity back on **the specific batch it came from**
- Stock counts reconcile by adjusting batches, not by overwriting a number
- There is no "stock" field that can silently drift from reality

**If you integrate: never write a quantity column.** Create a batch, or draw from one.
Anything that writes a stock number directly will desynchronize the system and you will
not notice until the numbers are already wrong.

---

## 3. Data model

One Google Spreadsheet, 14 sheets. Column indexes are 0-based and defined at the top of
`Code.gs` — read them there rather than counting columns by hand.

### Core

| Sheet | Purpose | Key columns |
|---|---|---|
| `Parts` | Catalog. One row per part. | `Part_No` (PK), `Name`, `Unit`, `Location`, `Cost`, `Min_Qty`, `Max_Qty`, `MOQ`, `Level`, `Machine`, `Active`, `Image` |
| `Batches_FIFO` | **The actual inventory.** | `Batch_ID`, `Part_No`, `Received`, `Expiry`, `Qty_In`, `Qty_Left`, `Unit_Cost`, `Supplier`, `Ref` |
| `Issues` | Issue lines (one row per line, grouped by `Issue_ID`) | `TS`, `ID`, `Type`, `Part_No`, `Qty`, `Batches`, `Machine`, `Job_No`, `Requester`, `User`, `Ref` |
| `Stock_Moves` | Append-only ledger of every movement | `TS`, `ID`, `Type`, `Part_No`, `Qty` (signed), `Batches`, `Value`, `Reason`, `User`, `Doc` |

`Stock_Moves.Qty` is **signed**: positive = in, negative = out. Stock card balances are
computed by summing this column in timestamp order.

### Supporting

| Sheet | Purpose |
|---|---|
| `Code_Master` | Part-numbering standard: 4 lists (`GROUP`, `USAGE`, `TYPE`, `CATEGORY`) |
| `Purchase_Orders` | Reorder suggestions and their status |
| `Tools` | Tool register — which tool is with which technician, by team |
| `Blades` | Blade lifecycle — install position, status, cumulative days, sharpen count |
| `Blade_Log` | Blade event history |
| `Machines` | Machine codes used as issue destinations |
| `Users` | Email, role, PIN hash + salt, failure count, lockout |
| `Settings` | Key/value config |
| `Audit_Logs` | Who changed what, field-level before/after |
| `Batches_Archive` | Depleted batches moved out to keep the live sheet small |

---

## 4. Part number format (Code SP V1)

17 characters, fixed width:

```
6 00 10 039 MIX1 - 0001
│ │  │  │   │      └── Running, 4 digits
│ │  │  │   └───────── Category short code, exactly 4 chars [A-Z0-9]
│ │  │  └───────────── Category key, 3 digits
│ │  └──────────────── Type, 2 digits
│ └─────────────────── Usage, 2 digits
└───────────────────── Item group, 1 digit
```

Regex: `/^(\d)(\d{2})(\d{2})(\d{3})([A-Za-z0-9]{4})-(\d{4})$/`

**The Running counter is scoped per 4-char category code, globally — not per prefix.**
This was verified against 598 real legacy rows before the code was written. Scoping it
per full prefix instead produces colliding part numbers. Do not "fix" this.

`nextRunning_()` returns `MAX(existing) + 1` by scanning every part number in the
catalog. It deliberately **does not fill gaps**, because issued numbers are already
printed on stickers and physical documents; reusing one is a silent collision.

The number is reserved inside the same `LockService` lock that writes the row, so two
concurrent saves cannot receive the same value.

---

## 5. Calling the backend

### The gateway

Every call goes through one function. There is no other entry point.

```js
call(token, fnName, args)   // args is an array
```

- `fnName` must be a key in the `API` allowlist in `Auth.gs`. Anything else throws.
- Only `login` and `logout` are in `PUBLIC_API`; everything else requires a valid token.
- Expired or unknown token throws the literal string `SESSION_EXPIRED` — the client
  catches this and redirects to the login screen.
- Private helpers end with `_` and are unreachable from the browser by construction.

### Client wrapper (copy this pattern)

```js
const api = (fn, ...args) => new Promise((ok, fail) => {
  let done = false;
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    fail(new Error('Server did not respond in 45s (' + fn + ')'));
  }, 45000);
  const settle = f => v => { if (done) return; done = true; clearTimeout(timer); f(v); };
  google.script.run
    .withSuccessHandler(settle(ok))
    .withFailureHandler(settle(e => {
      if (/SESSION_EXPIRED/.test(e.message)) { clearToken(); showLogin(); }
      fail(new Error(e.message));
    }))
    .call(TOKEN, fn, args);
});
```

**Keep the timeout.** `google.script.run` can hang forever with no error — most often
because the deployment was never bumped to a new version. Without a timeout the UI sits
on a spinner and the user has no idea why.

### Auth model

| Setting | Value |
|---|---|
| PIN storage | SHA-256 over `salt + pin`, constant-time comparison |
| Session length | 12 hours (one shift) |
| Failed attempts | 5, then 15-minute lockout |
| Break-glass | `emergencyResetPin()` — editor-only, deliberately **not** in the allowlist |

### Roles

```js
const RANK = { TECH: 1, LEAD: 2, ENG: 3 };
```

Enforced server-side via `requireRole_(min)` on every mutating call. Hiding a button in
the UI is not access control and is never treated as such here.

**Cost masking is server-side.** `maskCost_()` zeroes `cost` and `value` before the
payload leaves the server when the caller is below LEAD and `SHOW_COST_TO_TECH` is off.
Numbers that are never sent cannot be read out of DevTools.

---

## 6. API surface — 41 functions

Signatures and minimum roles, extracted from source. `-` means no role gate (public, or
gated by session only).

### Auth and bootstrap
| Function | Role |
|---|---|
| `login(email, pin)` | public |
| `logout(token)` | public |
| `getBoot()` | session |
| `getCatalog()` | session |
| `changeMyPin(oldPin, newPin)` | session |

`getBoot()` returns role, user, settings, and the full catalog in **one round trip** —
Apps Script latency is high enough that round trips are the dominant cost.

### Stock movement
| Function | Role |
|---|---|
| `issue(doc)` | TECH |
| `returnParts(issueId, lines, reason)` | TECH |
| `receive(doc)` | LEAD |
| `auditStock(counts)` | LEAD |
| `scrap(lines, ref)` | LEAD |
| `getIssues(limit)` | session |
| `findIssue(issueId)` | session |
| `getStockCard(partNo, fromStr, toStr)` | TECH |

### Catalog and numbering
| Function | Role |
|---|---|
| `savePart(p)` | LEAD |
| `archivePart(part)` | LEAD |
| `updateBatch(batchId, patch)` | LEAD |
| `previewPartCode(sel)` | LEAD |
| `addCodeCategory(en, th, code4)` | LEAD |
| `saveMachine(m)` | LEAD |

### Tools and blades
| Function | Role |
|---|---|
| `getTools()` / `getBlades()` | TECH |
| `saveTool(t)` / `saveBlade(b)` | LEAD |
| `bladeAction(bladeId, action, data)` | TECH |
| `getBladeLog(bladeId, limit)` | TECH |

### Purchasing and reporting
| Function | Role |
|---|---|
| `generatePO()` / `getOpenPOs()` / `cancelPO(poId)` | LEAD |
| `getReport(fromStr, toStr)` | LEAD |

### Images
| Function | Role |
|---|---|
| `savePartImage(partNo, dataUrl)` | LEAD |
| `linkPartImages(folderUrlOrId, overwrite)` | LEAD |

### Administration
| Function | Role |
|---|---|
| `getUsers()` / `saveUser(u)` / `setPin(email, pin)` | ENG |
| `saveSettings(map)` / `getAuditLog(limit)` | ENG |
| `getStorageHealth()` | LEAD |
| `backupAndTrim(sheetName, keepDays)` | ENG |
| `archiveEmptyBatches(days)` / `installTriggers()` | ENG |
| `seedOpeningStock()` | LEAD |

---

## 7. Key payload shapes

### `issue(doc)`

```js
{
  machine:   'MIX1',          // required — where the part is going
  jobNo:     'JOB-123',       // required only if REQUIRE_JOB_NO = '1'
  dept:      'Maintenance',
  requester: 'Somchai',       // LEAD+ may issue on another person's behalf;
                              // for TECH the server overwrites this with their own name
  note:      '',
  ref:       'uuid-v4',       // idempotency key — see below
  lines: [{ part: '60002048M006-0005', qty: 2 }]
}
```

Returns `{ issueId, ts, machine, jobNo, dept, requester, user, lines, total, costHidden }`,
or `{ duplicate: true, issueId }` if this `ref` already succeeded.

### `receive(doc)`

```js
{
  supplier: 'ABC Co.',
  invoice:  'INV-0001',       // duplicate invoice triggers a confirm, not a hard block
  poId:     '',
  force:    false,            // set true to accept a repeated invoice deliberately
  ref:      'uuid-v4',
  lines: [{ part: '...', qty: 10, unitCost: 25.5, expiry: '2027-01-31' }]
}
```

### Idempotency — read this before building any form

Every write that creates a document takes a client-generated `ref`. The server records
every successful ref in a `Ref_Log` sheet and mirrors it into `CacheService` as a fast
path. A repeat of the same `ref` returns the original document ID and **writes nothing**.

The sheet is the source of truth here on purpose: `CacheService` does not guarantee its
TTL and can evict early, which would let a duplicate through. `refLogSheet_()` creates
the sheet on demand, so this works on an existing install without re-running `setup()`.

The hole this closes is specific: the user taps confirm, the network drops while the
server is replying, the user taps again. The button is already disabled during the call,
so a double-tap is not the risk — a lost reply is. Generate one `ref` per cart or per
form and rotate it only after a successful save.

**Duplicated receiving is the most expensive error in a parts warehouse**, because stock
doubles silently and nothing looks wrong until a count months later. That is why a
repeated invoice number prompts for confirmation instead of being accepted quietly.

---

## 8. Concurrency and caching

Every mutating function body is wrapped in `lock_()`:

```js
function lock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('System busy, try again');
  try {
    clearCatalogCache();
    return fn();
  } finally {
    clearCatalogCache();   // invalidate on the way out too, even if fn() threw
  }
}
```

Catalog cache lives in `CacheService` with a 300-second TTL. **The TTL is a safety net,
not the mechanism** — it only covers someone typing into the sheet directly. Every write
through the app invalidates the cache immediately, in one place. If you add a write path,
route it through `lock_()` or you will serve stale stock to the issue screen, which means
technicians see parts that are not there.

---

## 9. Hard constraints you will hit

| Constraint | Value | What happens at the limit |
|---|---|---|
| Cells per spreadsheet | 10,000,000 | **All writes fail.** Issuing and receiving stop, not just logging. |
| Apps Script execution | 6 min / run | Long loops over the full catalog must be batched |
| `CacheService` entry | 100 KB | Catalog over ~90 KB is not cached, so every load re-reads the sheets |
| URL fetch / triggers | Daily quotas | Relevant if you add email or external calls |

The system ships with capacity monitoring: `getStorageHealth()` reports percent used and
which sheets are largest, the daily alert email warns above 70% and escalates the subject
line above 85%, and `backupAndTrim(sheet, keepDays)` exports old log rows to CSV in Drive
and then deletes them — **writing the file first, and only deleting if that write
succeeded.** Only the four log sheets are trimmable; attempting to trim `Parts` or
`Batches_FIFO` is refused.

**Apps Script runs the web app inside a sandboxed iframe whose permissions policy you do
not control.** Live `getUserMedia` camera access is blocked in some browsers and in
in-app webviews (the LINE browser, notably). The barcode scanner therefore tries live
camera first and automatically falls back to `<input type="file" capture="environment">`,
which is an OS file picker and always works. If you reuse the scanner, keep both paths.

---

## 10. Reusable pieces, ranked by portability

**Portable anywhere, no Apps Script dependency:**

| Piece | Where | Why it is worth taking |
|---|---|---|
| FEFO-then-FIFO draw engine | `drawFifo_()` in `Code.gs` | Pure function over rows. Expiring stock goes first, then oldest receipt. Validates the full draw before writing anything. |
| Part-number generator | `buildPartCode_()`, `nextRunning_()`, `parsePartCode_()` | Pure. Generate, parse, and find the next sequence safely. |
| Barcode / QR label printing | `Admin.js.html` + `Index.html` | JsBarcode Code128 + qrcodejs, mm-based sheet geometry, verified round-trip. |
| Camera barcode scanning | `App.js.html` | ZXing lazy-loaded on first use (330 KB), live + still-capture fallback. |
| CSV backup-and-trim | `backupAndTrim()` | Write-then-delete ordering, BOM so Excel reads UTF-8 correctly, proper quote escaping. |

**Needs rework outside Apps Script:**

- Session and PIN auth — assumes `CacheService` and `PropertiesService`
- `lock_()` — assumes `LockService`; a single global mutex will not scale past low volume
- All sheet I/O — assumes the Sheets API object model

### If you want HTTP instead of `google.script.run`

Three options, in increasing order of effort:

1. **Add `doPost(e)` to `Code.gs`**, parse `JSON.parse(e.postData.contents)`, and
   delegate to the same `call()` gateway. The allowlist and role checks then apply
   unchanged. Fastest path; Apps Script rate limits still apply.
2. **Keep Sheets, replace the runtime.** Port `Code.gs` to Node and talk to the Sheets
   API with a service account. You keep the data model and the engine, lose `LockService`
   (substitute Redis or a row-level lock), and gain real concurrency.
3. **Keep the engine, replace the storage.** Move `Parts`, `Batches_FIFO`, `Issues`, and
   `Stock_Moves` to Postgres. The batch model maps to relational tables cleanly and the
   FIFO logic transfers almost verbatim. This is the right answer above roughly 50k
   movements a year.

---

## 11. Before you change anything, run the tests

```bash
node tests/run.js
```

Five suites, all in-memory with stubbed Sheets/Drive/Lock. No network, no deployment, no
touching real data.

| Suite | Guards |
|---|---|
| `seedtest` | Seed data lands correctly — row counts, types, dates, no overwrite of existing rows |
| `rendertest` | Every screen renders against the full 997-part catalog — balanced tags, no leaked `undefined` |
| `scanroute` | A scan from any screen returns to the field that asked for it |
| `trimtest` | Backup-and-trim cuts the right range and writes the file before deleting |
| `cattest` | **Part numbers and category codes cannot collide** |

`tests/scantest.html` runs in a browser (it needs a real canvas): it generates Code128 and
QR barcodes with the same library the label printer uses, then decodes them back,
including after the JPEG downscale the photo-scan path applies.

If you port the engine, port `cattest` and `trimtest` first. They cover the two places
where a bug is silent and permanent: duplicate identifiers, and deleted history.

---

## 12. Known limitations — not bugs, just facts

- **Unit cost is empty for all 997 parts.** The legacy sheet never had the column.
  Inventory value reads ฿0.00 until costs are entered through receiving.
- **Opening balances are as of the export date**, not live. They are seeded once and
  corrected by a physical count.
- **Blade life is tracked in days, not machine running hours**, because that is how the
  source data was recorded.
- **Live camera may be blocked** by the Apps Script iframe (see section 9).
- **22 real parts share a part number with a different part** in the legacy data and are
  parked in `ต้องตัดสินใจ/Parts_lost_duplicate_code.csv` pending a human decision.
- **All UI text, sheet headers, and error messages are Thai.** Budget for this if you are
  localizing; the strings are inline, not in a resource file.

---

## 13. Feedback — please reply under these headings

If you hit anything unclear or broken, reply using these topic headings so responses can
be routed and tracked. One heading per issue; include the function name and what you
expected versus what happened.

**`[API]`** — A function's parameters, return shape, or error behavior does not match
this document.

**`[DATA-MODEL]`** — A sheet, column, or relationship is unclear, or you need a field
that does not exist.

**`[AUTH]`** — Roles, sessions, token handling, or permission boundaries.

**`[CONCURRENCY]`** — Locking, caching, idempotency, or anything you observed going wrong
under simultaneous use.

**`[LIMITS]`** — You hit an Apps Script or Sheets quota, or need volumes beyond what
section 9 describes.

**`[PORTING]`** — You are moving a component to another stack and something does not
translate.

**`[TESTS]`** — A suite fails, or you need coverage for a path that is not tested.

**`[DOCS]`** — Something in this file is wrong, missing, or misleading.

For anything time-sensitive, lead with the heading and the single sentence that matters,
then the detail. Please include your runtime, whether you are on Apps Script or a port,
and the approximate transaction volume you are targeting — the right answer differs a lot
between 100 and 100,000 movements a year.
