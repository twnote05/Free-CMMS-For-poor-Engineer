// backupAndTrim ลบข้อมูลจริง — ต้องพิสูจน์ว่าตัดถูกช่วง และไฟล์สำรองครบก่อนลบ
const fs = require('fs'), vm = require('vm');
const dir = require('path').join(require('path').dirname(__dirname), 'src');   // ไฟล์ที่เอาไปวางใน Apps Script อยู่ใน src/

const NOW = new Date('2026-09-17T00:00:00');
let written = null, deleted = null, flushed = false;

function fakeSheet(rows, width) {
  return {
    _rows: rows, _w: width,
    getLastRow() { return this._rows.length; },
    getLastColumn() { return this._w; },
    getMaxRows() { return this._rows.length; },
    getMaxColumns() { return this._w; },
    getName() { return 'Stock_Moves'; },
    getRange(r, c, nr, nc) {
      const sh = this;
      return {
        getValues() { return sh._rows.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)); },
        getValue() { return sh._rows[r - 1][c - 1]; },
        setValues() { return this; }
      };
    },
    deleteRows(at, n) { deleted = { at, n }; this._rows.splice(at - 1, n); }
  };
}

let SHEET;
global.Logger = { log: () => {} };
global.Utilities = {
  formatDate: (d, tz, fmt) => {
    const p = n => String(n).padStart(2, '0');
    return fmt.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1))
              .replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes()));
  },
  newBlob: (content, type, name) => { written = { content, type, name }; return { name }; },
  base64Decode: () => []
};
global.SpreadsheetApp = {
  getActive: () => ({ getSpreadsheetTimeZone: () => 'Asia/Bangkok', getName: () => 'TEST', getSheets: () => [SHEET] }),
  flush: () => { flushed = true; }
};
global.Session = { getEffectiveUser: () => ({ getEmail: () => 'x@y.com' }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'FOLDER', setProperty() {} }) };
global.CacheService = { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
global.DriveApp = {
  getFolderById: () => ({
    getName: () => 'สำรองข้อมูล',
    createFile: b => ({ getUrl: () => 'https://drive/FILE', getName: () => b.name })
  })
};
global.MailApp = { sendEmail: () => {} };

const src = fs.readFileSync(dir + '/Code.gs', 'utf8') + '\n' + fs.readFileSync(dir + '/Auth.gs', 'utf8');
vm.runInThisContext(src, { filename: 'code.js' });

// ให้ผ่านด่านสิทธิ์และชี้ sheet_() มาที่ชีตปลอม
vm.runInThisContext('requireRole_ = function () { return "ENG"; };');
vm.runInThisContext('hasRole_ = function () { return true; };');
vm.runInThisContext('today_ = function () { return new Date("2026-09-17T00:00:00"); };');
vm.runInThisContext('sheet_ = function () { return globalThis.__SHEET; };');
vm.runInThisContext('logAudit_ = function () {};');

function build(nOld, nNew) {
  const rows = [['TS', 'ID', 'TYPE', 'PART', 'QTY', 'BATCHES', 'VALUE', 'REASON', 'USER', 'DOC']];
  for (let i = 0; i < nOld; i++)                       // เก่ากว่า 1 ปี
    rows.push([new Date(NOW - (400 + i) * 864e5), 'M' + i, 'ISSUE', 'P1', -1, '', 0, 'เก่า,มีคอมม่า', 'u', 'D']);
  for (let i = 0; i < nNew; i++)                       // ใหม่กว่า
    rows.push([new Date(NOW - (10 + i) * 864e5), 'N' + i, 'ISSUE', 'P2', -1, '', 0, 'ใหม่ "อ้าง"', 'u', 'D']);
  return rows;
}

let fails = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };

// ---- ตัดถูกช่วง ----
let rows = build(120, 30);
SHEET = fakeSheet(rows, 10); globalThis.__SHEET = SHEET;
let r = backupAndTrim('Stock_Moves', 365);
ok(r.moved === 120, `ย้ายออก ${r.moved} แถว (คาด 120)`);
ok(r.kept === 30, `เหลือ ${r.kept} แถว (คาด 30)`);
ok(deleted.at === 2 && deleted.n === 120, `ลบตั้งแต่แถว ${deleted.at} จำนวน ${deleted.n} (ไม่แตะหัวตาราง)`);
ok(SHEET._rows.length === 31, `ในชีตเหลือ ${SHEET._rows.length} แถวรวมหัว (คาด 31)`);
ok(SHEET._rows[1][1] === 'N0', `แถวแรกที่เหลือคือ ${SHEET._rows[1][1]} (ต้องเป็นแถวใหม่สุดชุดที่เก็บไว้)`);

// ---- ไฟล์สำรองต้องครบ ----
const lines = written.content.split('\n');
ok(lines.length === 121, `CSV มี ${lines.length} บรรทัด = หัว 1 + ข้อมูล 120`);
ok(written.content.charCodeAt(0) === 0xFEFF, 'ขึ้นต้นด้วย BOM — Excel อ่านภาษาไทยออก');
ok(lines[1].indexOf('"เก่า,มีคอมม่า"') >= 0, 'ค่าที่มีคอมม่าถูกครอบด้วยเครื่องหมายคำพูด');
ok(/^\uFEFFTS,ID,TYPE/.test(lines[0]), 'บรรทัดแรกเป็นหัวตาราง');
ok(flushed, 'flush() ถูกเรียกก่อนจบ');

// ---- ไม่มีอะไรเก่าพอ = ไม่ลบอะไรเลย ----
deleted = null; written = null;
rows = build(0, 40);
SHEET = fakeSheet(rows, 10); globalThis.__SHEET = SHEET;
r = backupAndTrim('Stock_Moves', 365);
ok(r.moved === 0 && deleted === null, 'ไม่มีแถวเก่า → ไม่ลบ ไม่สร้างไฟล์');
ok(SHEET._rows.length === 41, 'ข้อมูลยังครบ');

// ---- ชีตที่ไม่ใช่ log ต้องตัดไม่ได้ ----
try { backupAndTrim('Parts', 365); ok(false, 'ยอมให้ตัดชีต Parts — อันตราย'); }
catch (e) { ok(true, 'ปฏิเสธการตัดชีต Parts: ' + e.message); }

// ---- เก็บสั้นกว่า 30 วันไม่ได้ ----
deleted = null;
rows = build(5, 5);
SHEET = fakeSheet(rows, 10); globalThis.__SHEET = SHEET;
r = backupAndTrim('Stock_Moves', 1);
ok(r.moved === 5, `ขอเก็บ 1 วัน ระบบบังคับขั้นต่ำ 30 วัน → ย้ายแค่ ${r.moved} แถวเก่าจริง`);

// ---- ตัววัดพื้นที่ ----
SHEET = fakeSheet(build(100, 100), 10); globalThis.__SHEET = SHEET;
const snap = storageSnapshot_();
ok(snap.level === 'OK' && snap.pct < 1, `พื้นที่ ${snap.pct}% → ${snap.level}`);
vm.runInThisContext('CELL_LIMIT_TEST = CELL_LIMIT');
ok(typeof CELL_LIMIT_TEST === 'number' && CELL_LIMIT_TEST === 10000000, 'เพดาน 10 ล้านช่องตรงกับของ Google');

console.log(fails ? `\n*** ไม่ผ่าน ${fails} จุด ***` : '\nผ่านหมด');
process.exit(fails ? 1 : 0);
