/*! Free CMMS for poor engineers — https://github.com/twnote05/Free-CMMS-For-poor-Engineer
 *  Required Notice: Copyright 2026 IE จอมขี้เกียจ
 *  PolyForm Noncommercial 1.0.0 — ห้ามใช้เชิงพาณิชย์ · ดู LICENSE.md
 */
// "สำคัญรหัสต้องไม่ซ้ำกัน" — ข้อนี้ต้องพิสูจน์ ไม่ใช่เชื่อ
const fs = require('fs'), vm = require('vm');
const dir = require('path').join(require('path').dirname(__dirname), 'src');   // ไฟล์ที่เอาไปวางใน Apps Script อยู่ใน src/

let SHEET, PART_CODES = [];
function fakeSheet(rows) {
  return {
    _rows: rows,
    getLastRow() { return this._rows.length; },
    getLastColumn() { return 5; },
    getMaxRows() { return this._rows.length; },
    getMaxColumns() { return 5; },
    getName() { return 'Code_Master'; },
    getDataRange() { const sh = this; return { getValues() { return sh._rows; } }; },
    getRange(r, c, nr, nc) {
      const sh = this;
      return { setValues(v) { v.forEach(x => sh._rows[r - 1 + v.indexOf(x)] = x); return this; },
               getValues() { return sh._rows.slice(r - 1, r - 1 + nr); } };
    },
    insertColumnsAfter() {}
  };
}

global.Logger = { log: () => {} };
global.Utilities = { formatDate: () => '2026-09-17', base64Decode: () => [] };
global.SpreadsheetApp = {
  getActive: () => ({ getSpreadsheetTimeZone: () => 'Asia/Bangkok', getName: () => 'T', getSheets: () => [] }),
  flush: () => {}
};
global.Session = { getEffectiveUser: () => ({ getEmail: () => 'x@y.com' }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) };
global.CacheService = { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
global.MailApp = { sendEmail: () => {} };
global.DriveApp = {};

vm.runInThisContext(fs.readFileSync(dir + '/Code.gs', 'utf8'), { filename: 'code.js' });
vm.runInThisContext(fs.readFileSync(dir + '/Auth.gs', 'utf8'), { filename: 'auth.js' });
vm.runInThisContext('requireRole_ = function () { return "ENG"; };');
vm.runInThisContext('sheet_ = function () { return globalThis.__SH; };');
vm.runInThisContext('logAudit_ = function () {};');
vm.runInThisContext('partCodes_ = function () { return globalThis.__PC; };');
vm.runInThisContext('appendRows_ = function (sh, rows) { rows.forEach(r => sh._rows.push(r)); };');
vm.runInThisContext('getCodeMaster = function () { return { CATEGORY: [] }; };');

function reset() {
  const rows = [['List', 'Key', 'Label_EN', 'Label_TH', 'Code4']];
  const seed = vm.runInThisContext('CODE_SEED.CATEGORY');
  seed.split('\n').filter(l => l.trim()).forEach(l => {
    const f = l.split('|');
    rows.push(['CATEGORY', f[0].trim(), f[1].trim(), f[2].trim(), f[3].trim()]);
  });
  SHEET = fakeSheet(rows); globalThis.__SH = SHEET;
  globalThis.__PC = PART_CODES;
  return rows;
}

let fails = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };

// ---- 1) เพิ่มหมวดปกติ ----
reset();
let r = addCodeCategory('Proximity Sensor', 'พร็อกซิมิตี้', 'Q900');
ok(r.key === '073', `Key ที่ออกให้ = ${r.key} (เดิมสูงสุด 072)`);
ok(r.code4 === 'Q900', 'อักษรย่อถูกเก็บเป็นตัวพิมพ์ใหญ่');
ok(SHEET._rows.length === 75, `ชีตมี ${SHEET._rows.length} แถว (หัว 1 + 73 เดิม + 1 ใหม่)`);

// ---- 2) อักษรย่อซ้ำ ต้องปฏิเสธ ----
try { addCodeCategory('อะไรก็ได้', '', 'Q900'); ok(false, 'ยอมให้ใส่ Q900 ซ้ำ — อันตราย'); }
catch (e) { ok(/ถูกใช้/.test(e.message), 'ปฏิเสธอักษรย่อซ้ำ: ' + e.message); }

// ---- 3) ซ้ำแบบต่างตัวพิมพ์ ต้องปฏิเสธด้วย ----
try { addCodeCategory('x', '', 'q900'); ok(false, 'ยอมให้ใส่ q900 (พิมพ์เล็ก) ซ้ำกับ Q900'); }
catch (e) { ok(/ถูกใช้/.test(e.message), 'ปฏิเสธ q900 ที่ซ้ำแบบต่างตัวพิมพ์'); }

// ---- 4) ซ้ำกับหมวดที่มีมาแต่เดิม ----
reset();
try { addCodeCategory('x', '', 'M001'); ok(false, 'ยอมให้ใส่ M001 ที่เป็นของ Motor'); }
catch (e) { ok(/Motor/.test(e.message), 'ปฏิเสธและบอกว่าชนกับหมวดไหน: ' + e.message); }

// ---- 5) รูปแบบผิด ----
reset();
[['สั้นไป', 'M1'], ['ยาวไป', 'M0011'], ['มีอักขระพิเศษ', 'M-01'], ['ว่าง', '']].forEach(([why, bad]) => {
  try { addCodeCategory('x', '', bad); ok(false, `ยอมรับอักษรย่อ ${why} "${bad}"`); }
  catch (e) { ok(/4 ตัวพอดี/.test(e.message), `ปฏิเสธอักษรย่อ ${why} "${bad}"`); }
});

// ---- 6) ไม่มีชื่อเลย ----
try { addCodeCategory('', '', 'Z999'); ok(false, 'ยอมให้ไม่มีชื่อหมวด'); }
catch (e) { ok(/ชื่อหมวด/.test(e.message), 'ปฏิเสธหมวดที่ไม่มีชื่อ'); }

// ---- 7) เพิ่ม 50 หมวดรวด Key ต้องไม่ซ้ำเลย ----
reset();
const keys = [], c4s = [];
for (let i = 0; i < 50; i++) {
  const c = 'Q' + String(i).padStart(3, '0');
  const x = addCodeCategory('cat' + i, '', c);
  keys.push(x.key); c4s.push(x.code4);
}
ok(new Set(keys).size === 50, `Key 50 ตัวไม่ซ้ำ (${new Set(keys).size}/50)`);
ok(keys[0] === '073' && keys[49] === '122', `ไล่ต่อเนื่อง ${keys[0]} → ${keys[49]}`);

// ---- 8) รหัสอะไหล่ที่ออกจริงต้องไม่ซ้ำ ----
reset();
PART_CODES.length = 0; globalThis.__PC = PART_CODES;
const made = [];
for (let i = 0; i < 300; i++) {
  const run = nextRunning_(PART_CODES, 'M001');
  const code = buildPartCode_(6, 0, 1, '001', 'M001', run);
  PART_CODES.push(code); made.push(code);
}
ok(new Set(made).size === 300, `ออกรหัส 300 ตัวติดกัน ไม่ซ้ำเลย (${new Set(made).size}/300)`);
ok(made[0].endsWith('-0001') && made[299].endsWith('-0300'), `${made[0]} → ${made[299]}`);

// ---- 9) หมวดใหม่ที่อักษรย่อเคยมีรหัสเก่าใช้อยู่ ต้องนับต่อ ไม่เริ่มใหม่ ----
reset();
PART_CODES.length = 0;
PART_CODES.push('60001001X777-0042', '60002001X777-0007');   // รหัสเดิมนอกหมวด
globalThis.__PC = PART_CODES;
r = addCodeCategory('New Thing', '', 'X777');
ok(r.existing === 2, `บอกว่ามีรหัสเดิมใช้อักษรย่อนี้ ${r.existing} รายการ`);
ok(r.nextRunning === 43, `เลขถัดไป = ${r.nextRunning} (ต่อจาก 42 ไม่ใช่เริ่ม 1) — ไม่งั้นได้รหัสซ้ำของเก่า`);
const nx = buildPartCode_(6, 0, 1, r.key, 'X777', r.nextRunning);
ok(PART_CODES.indexOf(nx) < 0, `รหัสถัดไป ${nx} ไม่ชนกับที่มีอยู่`);

console.log(fails ? `\n*** ไม่ผ่าน ${fails} จุด ***` : '\nผ่านหมด');
process.exit(fails ? 1 : 0);
