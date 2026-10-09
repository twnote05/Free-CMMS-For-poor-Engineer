/*! Free CMMS for poor engineers — https://github.com/twnote05/Free-CMMS-For-poor-Engineer
 *  Required Notice: Copyright 2026 IE จอมขี้เกียจ
 *  PolyForm Noncommercial 1.0.0 — ห้ามใช้เชิงพาณิชย์ · ดู LICENSE.md
 */
// เรนเดอร์ทุกหน้าด้วยข้อมูลจริงทั้งชุด — จับ template ที่พัง/ตัวแปรหลุดก่อนถึงมือคนใช้
const fs = require('fs'), vm = require('vm');
const dir = require('path').join(require('path').dirname(__dirname), 'src');   // ไฟล์ที่เอาไปวางใน Apps Script อยู่ใน src/
vm.runInThisContext(fs.readFileSync(dir + '/Data.gs', 'utf8'));

const el = {};
function node(id) {
  return el[id] = el[id] || { innerHTML: '', value: '', checked: false };
}
global.$ = node;
global.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
global.can = () => true;
global.money = n => '฿' + Number(n || 0).toFixed(2);
global.newRef = () => 'R1';
global.todayStr = () => '2026-09-16';
global.daysAgoStr = () => '2026-06-19';
global.openModal = (body, foot) => { el.__modal = { innerHTML: body + (foot || '') }; };
// partThumb สร้าง element จริง — สตับ document ให้พอใช้
global.document = { createElement: () => ({
  className: '', textContent: '',
  get outerHTML() { return '<div class="' + this.className + '">' + this.textContent + '</div>'; }
}) };
global.S = { bladeFilter: 'ทั้งหมด', bladeMachine: '', costHidden: false, toolQ: '', invLoc: '', dupes: [] };

const strip = f => fs.readFileSync(dir + '/' + f, 'utf8').replace(/<\/?script[^>]*>/g, '');
vm.runInThisContext(strip('Admin.js.html'), { filename: 'admin.js' });
// เอาเฉพาะส่วนการ์ดอะไหล่จาก App.js.html — ที่เหลือพึ่ง google.script.run
const app = strip('App.js.html');
vm.runInThisContext(app.slice(app.indexOf('const THUMB_TINT'), app.indexOf('function readScan')),
                    { filename: 'app.js' });

const rows = b => b.split('\n').filter(l => l.trim()).map(l => l.split('|'));

S.parts = rows(SEED_PARTS).map(r => ({
  part: r[0], name: r[1], category: r[2], unit: r[3], location: r[4],
  cost: +r[5] || 0, min: +r[6] || 0, max: +r[7] || 0, supplier: r[8], machine: r[9],
  image: r[11] || '', moq: +r[12] || 0, level: r[13] || '', position: r[14] || '',
  stock: 0, value: 0, low: (+r[6] || 0) > 0
}));
S.batches = [];
S.blades = rows(SEED_BLADES).map(r => ({
  id: r[0], spec: r[1], machine: r[2], position: r[3], status: r[4],
  install: r[5], days: +r[6] || 0, sharpen: +r[7] || 0, last: r[8], note: r[9], runningDays: 10
}));
S.bladeCounts = {};
S.blades.forEach(b => S.bladeCounts[b.status] = (S.bladeCounts[b.status] || 0) + 1);
S.tools = rows(SEED_TOOLS).map(r => ({
  id: r[0], name: r[1], qty: +r[2] || 0, unit: r[3], team: r[4], holder: r[5] || '',
  date: r[6], price: +r[7] || 0, status: r[8], image: r[9], note: r[10] || ''
}));

let fails = 0;
function check(label, html, expect) {
  const bad = [];
  if (/undefined|\[object Object\]|NaN/.test(html)) bad.push('มีค่าหลุด (undefined/NaN/object)');
  const o = (html.match(/<div/g) || []).length, c = (html.match(/<\/div>/g) || []).length;
  if (o !== c) bad.push(`<div> ${o} ไม่เท่ากับ </div> ${c}`);
  const so = (html.match(/<summary/g) || []).length, sc = (html.match(/<\/summary>/g) || []).length;
  if (so !== sc) bad.push(`<summary> ${so} ไม่เท่ากับ </summary> ${sc}`);
  expect.forEach(([what, n]) => {
    const got = (html.match(what) || []).length;
    if (got !== n) bad.push(`${what} เจอ ${got} คาด ${n}`);
  });
  console.log((bad.length ? '✗ ' : '✓ ') + label + (bad.length ? ' — ' + bad.join(' · ') : ''));
  if (bad.length) fails++;
}

// ---- คลังอะไหล่ ----
node('view'); viewInventory();
const inv = el['inv-list'].innerHTML;
const locs = new Set(S.parts.map(p => p.location || 'ยังไม่กำหนดที่เก็บ'));
check('คลังอะไหล่ จัดกลุ่มตามที่เก็บ', inv, [[/📍|❓/g, locs.size * 1 + 0]]);
console.log('   กลุ่มที่เก็บ', (inv.match(/<details/g) || []).length - S.parts.length, '· รายการ', S.parts.length);
console.log('   ปุ่มหารูป', (inv.match(/🔎 หารูป/g) || []).length);
// กรองตามที่เก็บ
node('inv-loc').value = 'A4'; renderInv();
const a4 = el['inv-list'].innerHTML;
const nA4 = S.parts.filter(p => p.location === 'A4').length;
check('กรองที่เก็บ A4', a4, [[/📄 บัตรสต๊อก/g, nA4]]);
node('inv-loc').value = '';

// ---- ใบมีด ----
node('asset-body'); renderBlades();
const bl = el['asset-body'].innerHTML;
check('ใบมีด ทุกเครื่อง', bl, [[/rounded-xl border border-slate-200 p-3/g, S.blades.length]]);
console.log('   ปุ่มเลือกเครื่อง:', [...bl.matchAll(/renderBlades\(\)"[\s\S]{0,180}?>([^<]*)</g)].slice(0, 6).map(m => m[1].trim()).join(' | '));
S.bladeMachine = 'Slot 2'; renderBlades();
const s2 = el['asset-body'].innerHTML;
const nS2 = S.blades.filter(b => b.machine === 'Slot 2').length;
check('ใบมีด เลือกเฉพาะ Slot 2', s2, [[/rounded-xl border border-slate-200 p-3/g, nS2]]);
S.bladeMachine = '';

// ---- เครื่องมือช่าง ----
renderTools();
const tl = el['asset-body'].innerHTML;
check('เครื่องมือช่าง แยกทีม', tl, [[/<tr class="border-t hover:bg-slate-50">/g, S.tools.length]]);
console.log('   ทีม:', [...tl.matchAll(/🧰 ([^<]*)</g)].map(m => m[1].trim()).join(' | '));

// ---- บัตรสต๊อก ----
// CARD เป็น let ในสโคปของ admin.js — ต้องเซ็ตในคอนเท็กซ์เดียวกัน
vm.runInThisContext('CARD = ' + JSON.stringify({
  part: S.parts[0].part, name: S.parts[0].name, unit: 'ชิ้น', location: 'A1', min: 2, max: 0, moq: 0,
  image: S.parts[0].image, from: '2026-06-19', to: '2026-09-16', costHidden: false,
  opening: 0, closing: 0, onHand: 0, ok: true, inTotal: 0, outTotal: 0, lines: []
}));
renderCard();
check('บัตรสต๊อก (ลิงก์ค้นรูป)', el.__modal.innerHTML, [[/🔎 หารูปจากชื่อ/g, 1], [/<img/g, 0]]);
vm.runInThisContext("CARD.image = 'https://drive.google.com/uc?id=XYZ'");
renderCard();
check('บัตรสต๊อก (รูปจริง)', el.__modal.innerHTML, [[/<img/g, 1], [/🖼️ เปิดรูปเต็ม/g, 1]]);

// ---- การ์ดอะไหล่หน้าเบิก ----
S.filter = ''; S.cat = 'ทั้งหมด'; S.cart = {};
S.parts.forEach(p => p.usable = 3);
node('part-grid'); renderParts();
const pg = el['part-grid'].innerHTML;
check('การ์ดอะไหล่ (ยังไม่มีรูปจริง)', pg, [[/<img/g, 0], [/h-24 rounded-lg grid place-items-center/g, S.parts.length]]);
S.parts[0].image = 'https://drive.google.com/thumbnail?id=ABC&sz=w800';
S.parts[1].image = 'https://drive.google.com/thumbnail?id=DEF&sz=w800';
renderParts();
const pg2 = el['part-grid'].innerHTML;
check('การ์ดอะไหล่ (มีรูปจริง 2 ตัว)', pg2, [[/<img/g, 2], [/h-24 rounded-lg grid place-items-center/g, S.parts.length - 2]]);

console.log(fails ? `\n*** ไม่ผ่าน ${fails} จุด ***` : '\nผ่านครบทุกหน้า');
process.exit(fails ? 1 : 0);
