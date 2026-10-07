# Factory document generator

[English](README.md) · [ไทย](README.th.md)

> Built the lazy way, for lazy factory engineers.

**16 kinds of standard factory document, in a single HTML file you double-click to open.**
No Python, no install, no internet, no server.

Everything runs in the browser on your own machine — nothing leaves the computer. Hand one file to a colleague and they are working.

Thai-language interface, built for a Thai shop floor.

## Start here

Download `WI_Generator.html` and open it in Chrome or Edge. That's it.

```bash
git clone https://github.com/twnote05/Free-CMMS-For-poor-Engineer.git
cd Free-CMMS-For-poor-Engineer/wi-generator
```

(Or just hit the green **Code → Download ZIP** button.)

## Make it yours

The file ships with one example factory's defaults. It works as-is — but there are exactly three things to change.

**1. Company logo and PPE icons — no code**
Upload them once from the app itself. They are stored in the browser and reused on every document.

**2. Form defaults — one `CONFIG` block**
Open `WI_Generator.html` in Notepad or VS Code, search for `const CONFIG` (near the top):

```js
const CONFIG = {
  fields: {
    docno:     'WI-MT-01',              // document number
    dept:      'ฝ่ายซ่อมบำรุง',            // department
    owner:     'ช่างเทคนิค/ซ่อมบำรุง',      // owner
    purpose:   'เพื่อการใช้งานได้ถูกวิธี',   // purpose
    worker:    'ช่างเทคนิค',               // operator
    qpProcess: 'UV Coating',              // Q-Point process name
  },
  positions: ['ช่างเทคนิค', 'หัวหน้างาน', 'วิศวกร', ...],   // signature-block job titles
  defaultPos: ['วิศวกร', 'รองผจก.โรงงาน', 'ผจก.โรงงาน'],   // prepared / reviewed / approved
};
```

Change the text inside the quotes, save, reopen. These are only prefilled defaults — you can always type over them while working.

**3. The FMEA Action Priority table** — only if you run FMEA. See the note under *Formulas* below; it lives in `AP_TABLE`.

> Nothing else to configure. No separate config file, no build step, no dependency to install.

## What it generates

| Group | Documents |
|---|---|
| Standard work | Work Instruction · Q-Point · OPL · safety signs · flowchart / VSM / layout |
| Production planning | Routing sheet · BOM · time study · capacity · line balancing |
| Quality | Check sheet · X̄-R control chart · FMEA |
| Other | SMED (changeover reduction) · tool & jig register · skill matrix (OJT) |

## What it does for you

- **Lays out and resizes photos by itself.** Drop in pictures in step order and let it fit them to the cells.
- **Paginates and numbers pages automatically** — on screen, in print, and in the Excel file.
- **Does the arithmetic** to standard IE formulas (see below).
- **Prints A4 / A3** straight to the shop floor.
- **Exports every document type to Excel** as real cells you can keep editing — not a picture of a document — so document control can archive the master.
- **Pulls frames out of video.** Film the job on a phone; it offers you the key frames.
- **Built-in photo markup** — arrows, red boxes, and blur to hide what shouldn't be seen.
- **Company logo** on every document.

## Formulas

Taken from the standards, not invented here.

| Document | Core formula |
|---|---|
| Time study | `NT = mean time × rating` · `ST = NT × (1 + allowance)` · required cycles `n = (z·s / (e·x̄))²` |
| Capacity | `output = available minutes ÷ CT × machines × efficiency` · line capacity = the bottleneck |
| Line balancing | `takt = available time ÷ demand` · `E = total work ÷ (total operators × bottleneck cycle time)` (manning-aware) |
| BOM | `issue qty = usage ÷ (1 − scrap%)`, per MRP |
| Control chart | `UCL/LCL = X̄̄ ± A₂R̄` · `UCL_R = D₄R̄` · `Cp, Cpk` from `σ̂ = R̄/d₂` · Nelson rules 2–8 |
| FMEA | `RPN = S × O × D` plus **Action Priority (AP)** per AIAG-VDA, which weights S → O → D |
| SMED | Changeover time counts **internal** work only (machine stopped), per SMED |

> **About the FMEA AP table** — the authoritative table is in the copyrighted AIAG-VDA handbook, and public sources disagree on the numbers. The table here is the internally consistent one (raising S, O or D never lowers the priority). **Check it against your own licensed copy before you rely on it.** If it differs, `AP_TABLE` in the HTML file is the single place to edit.

## Check the formulas before you trust them

Any time you change a formula in the HTML, re-run the checker:

```bash
node wi_test.js
```

It compares every calculation against separately hand-computed values, including all 1,000 cells of the Action Priority table. (To also check the Excel writer, `npm i exceljs` first — without it that part is skipped.)

## Files

```
WI_Generator.html   the whole program (HTML + CSS + JS in one file)
wi_test.js          formula checker
```

One external library: **ExcelJS**, loaded from a CDN only when you press Export to Excel. Everything else — charts (hand-drawn SVG) and the pagination engine — is written from scratch.

## Known limits

- Needs a current browser (Chrome / Edge). Internet Explorer will not work.
- Exporting to Excel needs internet the first time, to fetch ExcelJS from the CDN.
- Safety signs exported to Excel come out as a *sign register* for editing the text. Print the actual signs from the browser instead — the proportions follow ISO 3864 more closely that way.

## Licence

**PolyForm Noncommercial License 1.0.0** — free for any noncommercial purpose: factories running it for themselves, schools, hospitals, government, hobby projects. You may copy it, change it and pass it on. **You may not sell it or use it in a commercial product or service.** No warranty. See [LICENSE.md](../LICENSE.md).
