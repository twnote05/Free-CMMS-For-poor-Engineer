# Free CMMS for poor engineers

**English** · [ไทย](README.th.md)

Tools a small factory can actually run: **no server, no monthly bill, no IT department.**

All of it is in daily production use at a ~50-person UPVC/SPC flooring plant. Company data has been removed; what is published is the skeleton you configure for your own site.

| | What it does | Status |
|---|---|---|
| **[cmms/](cmms/)** | Work orders, preventive maintenance, daily checklists, machine parameters, KPIs | Ready |
| **[stock/](stock/)** | Spare parts, tools and blades — FIFO batches, real cost per issue | Ready |
| **[wi-generator/](wi-generator/)** | 16 kinds of factory document — work instructions, time study, FMEA, control charts — print A4/A3 and export to Excel | Ready |

`cmms/` and `stock/` are the Google Sheets systems: **separate Apps Script projects**, each with its own `.clasp.json` and deployment. The only thing they share is the `Users` sheet — see **[SHARED-USERS.md](SHARED-USERS.md)** before you run both.

`wi-generator/` is unrelated to those two: one HTML file you double-click. Nothing to deploy, nothing to connect.

---

## Start here

- **Just want the maintenance system?** → [cmms/README.md](cmms/README.md)
- **Just want the stock system?** → [stock/README.md](stock/README.md) (Thai only)
- **Running both sheet systems?** → read [SHARED-USERS.md](SHARED-USERS.md) first, then set up CMMS, then Stock
- **Just need to write documents?** → [wi-generator/README.md](wi-generator/README.md) — download one file, no setup

```bash
git clone https://github.com/twnote05/Free-CMMS-For-poor-Engineer.git
cd Free-CMMS-For-poor-Engineer/cmms
```

---

## Why these exist

A small factory has no cloud budget, nobody to maintain a server if the author leaves, and its users are technicians standing at a machine with oily hands and a cheap Android phone. **The training budget is five minutes per person.**

What survives those constraints:

- **Data lives in the sheets, not in the code.** If the code breaks completely, open the spreadsheet and keep working by hand.
- **Google Forms is where you type; the app is where you read.** Forms already work on phones, handle photo upload, and everyone knows them.
- **Non-programmers must be able to change things.** SLA targets, KPI weights, the machine register and factory holidays all live in sheets.
- **Hiding a button is not access control.** Roles are checked server-side on every call.

## Handing this to an AI

Claude Code, Codex, Cursor and Gemini CLI read [AGENTS.md](AGENTS.md) automatically — open the folder and say what you want.

For a chat AI you paste into, use [PROMPT-FOR-AI.md](PROMPT-FOR-AI.md). Attach only the files it asks for; some source files are five thousand lines.

## Buy me a beer

If this made your working life easier and you feel like it, scan to tip with PromptPay (Thailand).

<img src="assets/promptpay.svg" alt="PromptPay QR" width="180">

Outside Thailand PromptPay will not work — [Buy Me a Coffee](https://buymeacoffee.com/n07e_tw) instead.

Entirely optional. Using it is thanks enough.

## Licence

**PolyForm Noncommercial License 1.0.0** — free for any noncommercial purpose: factories running it for themselves, schools, hospitals, government, hobby projects. You may copy it, change it and pass it on. **You may not sell it or use it in a commercial product or service.** No warranty. See [LICENSE.md](LICENSE.md).
