# Free CMMS for poor engineers

**English** · [ไทย](README.th.md)

Two maintenance systems for small factories, running entirely on **Google Sheets + Apps Script**. No server, no monthly bill, no IT department.

Both are in daily production use at a ~50-person UPVC/SPC flooring plant. All company data has been removed; what is published is the skeleton you configure for your own site.

| | What it does | Status |
|---|---|---|
| **[cmms/](cmms/)** | Work orders, preventive maintenance, daily checklists, machine parameters, KPIs | Ready |
| **stock/** | Spare parts, tools and blades — FIFO batches, real cost per issue | Coming |

Pick one or run both. They are **separate Apps Script projects**: each has its own `.clasp.json` and its own deployment. The only thing they share is the `Users` sheet — see **[SHARED-USERS.md](SHARED-USERS.md)** before you run both.

---

## Start here

- **Just want the maintenance system?** → [cmms/README.md](cmms/README.md)
- **Running both?** → read [SHARED-USERS.md](SHARED-USERS.md) first, then set up CMMS, then Stock

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

## Licence

MIT — use it, change it. No warranty.
