# Plant board — fit it to your factory

[ไทย](PLANT.th.md) · **English**

A one-page status board for every machine in the plant — green running, red broken down, amber planned PM stop, grey nobody has logged yet.
Leave it open on a shop-floor screen. No login.

**Optional.** The repair-request system works without it. The *ผังโรงงาน* menu entry always appears under *ระบบอื่น*, but the page is empty until you lay out your plant.

## Open it

```
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?page=plant
```

Status comes from the `บันทึกสถานะเครื่อง` sheet — the same data as the "machine work" menu. The board never guesses: a machine nobody has logged shows *unknown*, not green.

> **Who sees what:** no login, so anyone with the link sees **machine name, group, former names, running/stopped and since when**. The stop reason, who logged it, machine code and owner are stripped server-side in `apiPlantBoard`.
> If your policy keeps machine names private, delete the `page === 'plant'` branch in `doGet` (`Code.gs`) and the `<a id="navPlant">` link in `index.html`.

Changing a status from this page needs a login, only for machines in your own station, and uses the existing `apiSetMachineStatus`. There is no new public write path.

## Lay out your plant

Edit one file: **`gas/plant_layout.html`**. The drawing engine (`gas/plant.html`) is identical for every factory, so upgrading it never overwrites your layout — just don't overwrite `plant_layout.html`.

Everything is in metres. `x` right, `y` down, `(0,0)` = top-left corner of the building. Press **มุมบน** (top view) on the page for a 10 m grid to count on.

| Constant | Meaning |
|---|---|
| `BLD_W`, `BLD_H` | building width × depth |
| `WALLS` | interior walls `[x1,y1,x2,y2]`; a door is a gap between two segments |
| `LAYOUT` | **machines** (below) |
| `ROOMS` `STORES` `ZONEBOX` | rooms · storage areas · zone frames — labelled rectangles |
| `YARDS` | outdoor areas |
| `STAGES` | process flow, in order; `[]` for none |

```js
{ id:"m1", n:"Extruder 1", k:"generic", x:6, y:4, w:7, d:3, h:2.5, grp:"Production" },
```

`n` **must match the `ทะเบียนเครื่องจักร` sheet** (name, code or alias; case, spaces and `- _ #` ignored). `k:"generic"` is a single box sized by `w d h`; an unknown kind falls back to it instead of breaking the page. Specific models (built for a plastics plant): `ext uv cut xpe mix mill silo cool inv water comp mdb pack`.

If the register spells a machine differently from your layout, add `alias:["Extrusion 1 - 80","Ext1"]` to that layout entry instead of editing the sheet. Names are tried in order; one register row matches only one layout machine.

The yellow box on the page lists mismatches in both directions: register machines with no position, and layout machines missing from the register.

Before deploying: `node test.js` checks ids are unique, `STAGES` only reference real machines, and every frame has `x0<x1`, `y0<y1`.

## Coordinates from a CAD plan

Save the plan as ASCII **DXF**, then:

```bash
python tools/dxf_labels.py plan.dxf --origin 100000 50000 --scale 0.001 --grep "mix|pack"
```

`--origin` = DXF coordinates of the building's top-left corner (becomes `0,0`); `--scale` = DXF unit → metres (mm `0.001`). Output `x y text` goes straight into `LAYOUT`. Sanity-check first: the building-width dimension label should land mid-wall. Labels inside blocks are not read — explode the block in CAD first. You get the label's position, not the machine's corner; nudge in top view.

## Common symptoms

| Symptom | Cause |
|---|---|
| Everything grey | `n` doesn't match the register, or nobody has logged a status — check the yellow box |
| Outdoor machines cut off | update `plant.html`; old versions sized the frame from the building only |
| Blank page after editing the layout | JS typo — open the browser console or run `node test.js` |
| Google permission page on open | deploy as *Execute as: Me*, *Anyone* — see [SETUP](SETUP.md) step 6 |
