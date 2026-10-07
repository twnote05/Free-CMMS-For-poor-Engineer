// สแกนจากหน้าไหน ผลต้องกลับไปช่องนั้น — ไม่ใช่เด้งกลับหน้าเบิกทุกครั้ง
const fs = require('fs'), vm = require('vm');
const dir = require('path').join(require('path').dirname(__dirname), 'src');   // ไฟล์ที่เอาไปวางใน Apps Script อยู่ใน src/

const el = {};
const events = [];
function node(id) {
  return el[id] = el[id] || {
    _v: '', get value() { return this._v; }, set value(x) { this._v = x; },
    innerHTML: '', checked: false,
    dispatchEvent(e) { events.push({ id, type: e.type }); }
  };
}
global.$ = node;
global.Event = function (type) { return { type }; };
global.esc = s => String(s == null ? '' : s);
global.can = () => true;
global.money = n => '฿' + n;
global.newRef = () => 'R1';
global.todayStr = () => '2026-09-17';
global.daysAgoStr = () => '2026-06-19';
global.navigator = {};
global.window = {};
global.document = { createElement: () => ({ className: '', textContent: '', outerHTML: '', click() {} }), head: { appendChild() {} } };

const toasts = [];
const modals = [];
global.toast = m => toasts.push(m);
global.openModal = (b, f) => modals.push(b);
global.closeModal = () => {};
global.render = () => {};
global.go = tab => { S.tab = tab; };

const strip = f => fs.readFileSync(dir + '/' + f, 'utf8').replace(/<\/?script[^>]*>/g, '');
const app = strip('App.js.html');
// เอาเฉพาะส่วนที่ไม่พึ่ง google.script.run
vm.runInThisContext('var S = { tab: "count", parts: [], recv: [], cart: {}, filter: "" };');
vm.runInThisContext(app.slice(app.indexOf('const byPart'), app.indexOf('const api =')), { filename: 'app-a.js' });
vm.runInThisContext(app.slice(app.indexOf('/* ---- ถ่ายรูป')), { filename: 'app-b.js' });
vm.runInThisContext(strip('Admin.js.html').match(/function scanInto[\s\S]*?\n}/)[0], { filename: 'admin.js' });

let fails = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };

S.parts = [{ part: '60002048M006-0005', name: 'ปะเก็น', usable: 5, cost: 0 }];
vm.runInThisContext('closeScanner = function () {};');   // ไม่มี DOM จริงให้ปิด

// ---- 1) สแกนจากหน้านับสต๊อก ----
let got = null;
scanInto('ct-part', c => { got = c; });
onScanned('60002048M006-0005');
ok(node('ct-part').value === '60002048M006-0005', `ช่อง ct-part ได้รหัส "${node('ct-part').value}"`);
ok(got === '60002048M006-0005', 'callback ของหน้านับถูกเรียกพร้อมรหัส');
ok(S.tab === 'count', `ยังอยู่หน้าเดิม (${S.tab}) ไม่เด้งไปหน้าเบิก`);
ok(events.some(e => e.id === 'ct-part' && e.type === 'input'), 'ยิง input event ให้ช่องรู้ตัวว่าค่าเปลี่ยน');

// ---- 2) สแกนจากหน้าตัดจำหน่าย (ไม่มี callback) ----
got = null;
scanInto('sc-part');
onScanned('60002048M006-0005');
ok(node('sc-part').value === '60002048M006-0005', 'ช่อง sc-part ได้รหัส');
ok(S.tab === 'count', 'ยังไม่เด้งหน้า');

// ---- 3) รหัสที่ไม่มีในคลัง ต้องเตือน ไม่ใช่ปล่อยผ่าน ----
toasts.length = 0; got = null;
scanInto('ct-part', c => { got = c; });
onScanned('ไม่มีรหัสนี้');
ok(/ไม่พบรหัส/.test(toasts.join(' ')), 'รหัสแปลกปลอม → เตือน: ' + toasts.join(' '));
ok(got === null, 'รหัสแปลกปลอม → ไม่เรียก callback (ไม่ใส่เข้ารายการนับ)');

// ---- 4) สแกนหน้าเบิก (ไม่มีใครจอง) ----
let scanned = null;
vm.runInThisContext('readScan = function (c) { globalThis.__got = c; return true; };');
S.tab = 'issue';
onScanned('60002048M006-0005');
ok(globalThis.__got === '60002048M006-0005', 'หน้าเบิกยังใช้ readScan เหมือนเดิม');
ok(node('scan').value === '60002048M006-0005', 'ช่องสแกนหน้าเบิกได้รหัส');

// ---- 5) การจองต้องไม่ค้างข้ามครั้ง ----
scanInto('ct-part', () => {});
onScanned('60002048M006-0005');
globalThis.__got = null;
S.tab = 'issue';
onScanned('60002048M006-0005');
ok(globalThis.__got === '60002048M006-0005', 'สแกนครั้งถัดไปไม่ติดการจองเดิม');

console.log(fails ? `\n*** ไม่ผ่าน ${fails} จุด ***` : '\nผ่านหมด');
process.exit(fails ? 1 : 0);
