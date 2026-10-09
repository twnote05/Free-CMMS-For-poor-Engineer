/*! Free CMMS for poor engineers — https://github.com/twnote05/Free-CMMS-For-poor-Engineer
 *  Required Notice: Copyright 2026 IE จอมขี้เกียจ
 *  PolyForm Noncommercial 1.0.0 — ห้ามใช้เชิงพาณิชย์ · ดู LICENSE.md
 */
// กันคีย์ซ้ำต้องทนการเขี่ย cache — ข้อนี้คือเหตุผลทั้งหมดที่มี Ref_Log
// เคสจริง: ผู้ใช้กดยืนยัน → เน็ตหลุดตอนเซิร์ฟเวอร์ตอบ → ผู้ใช้กดใหม่
// ถ้าระหว่างนั้น CacheService เขี่ยค่าทิ้ง (เกิดได้ ไม่การันตี TTL) ของเดิมต้องยังจำได้
const fs = require('fs'), vm = require('vm');
const dir = require('path').join(require('path').dirname(__dirname), 'src');   // ไฟล์ที่เอาไปวางใน Apps Script อยู่ใน src/

let CACHE = {}, REFLOG = [['Timestamp', 'Ref', 'Doc_ID', 'Type']], INSERTED = 0;

function sheetFrom(rows) {
  return {
    _rows: rows,
    getLastRow() { return this._rows.length; },
    getLastColumn() { return 4; },
    getMaxRows() { return this._rows.length; },
    getMaxColumns() { return 4; },
    getName() { return 'Ref_Log'; },
    setFrozenRows() { return this; },
    getDataRange() { const sh = this; return { getValues() { return sh._rows; } }; },
    getRange(r, c, nr, nc) {
      const sh = this;
      return {
        getValues() { return sh._rows.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)); },
        setValues(v) { v.forEach((row, i) => sh._rows[r - 1 + i] = row); return this; },
        setFontWeight() { return this; },
        setBackground() { return this; }
      };
    },
    insertColumnsAfter() {}
  };
}

global.Logger = { log: () => {} };
global.Utilities = { formatDate: () => '2026-10-06', base64Decode: () => [] };
global.SpreadsheetApp = {
  getActive: () => ({
    getSpreadsheetTimeZone: () => 'Asia/Bangkok',
    getName: () => 'TEST',
    getSheets: () => [],
    getSheetByName: n => (n === 'Ref_Log' ? globalThis.__RL : null),
    insertSheet: n => { INSERTED++; globalThis.__RL = sheetFrom(REFLOG); return globalThis.__RL; }
  }),
  flush: () => {}
};
global.Session = { getEffectiveUser: () => ({ getEmail: () => 'x@y.com' }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) };
global.CacheService = {
  getScriptCache: () => ({
    get: k => (k in CACHE ? CACHE[k] : null),
    put: (k, v) => { CACHE[k] = v; },
    remove: k => { delete CACHE[k]; }
  })
};
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
global.MailApp = { sendEmail: () => {} };
global.DriveApp = {};

vm.runInThisContext(fs.readFileSync(dir + '/Code.gs', 'utf8'), { filename: 'code.js' });

let fails = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };

function reset() {
  CACHE = {};
  REFLOG = [['Timestamp', 'Ref', 'Doc_ID', 'Type']];
  globalThis.__RL = sheetFrom(REFLOG);
  INSERTED = 0;
}

// ---- 1) เส้นทางปกติ: จำได้ผ่าน cache ----
reset();
ok(doneBefore_('R1') === null, 'ref ที่ยังไม่เคยใช้ → null');
rememberDone_('R1', 'IS001', 'ISSUE');
ok(doneBefore_('R1') === 'IS001', 'จำได้ทันทีหลังบันทึก');
ok(REFLOG.length === 2, `ลง Ref_Log แล้ว ${REFLOG.length - 1} แถว`);

// ---- 2) หัวใจของข้อนี้: cache ถูกเขี่ยทิ้ง ----
CACHE = {};
ok(doneBefore_('R1') === 'IS001', 'cache ถูกเขี่ยทิ้งแล้วยังจำได้จากชีต ← เหตุผลที่แก้ข้อนี้');

// ---- 3) ref คนละตัวต้องไม่ชนกัน ----
rememberDone_('R2', 'IS002', 'ISSUE');
CACHE = {};
ok(doneBefore_('R2') === 'IS002' && doneBefore_('R1') === 'IS001', 'ref หลายตัวแยกกันถูก');
ok(doneBefore_('R3') === null, 'ref ที่ไม่เคยมี ยังคืน null');

// ---- 4) ref ว่าง = ไม่กันซ้ำ (ของเก่าที่ไม่ส่ง ref มาต้องทำงานได้ปกติ) ----
reset();
rememberDone_('', 'IS003', 'ISSUE');
ok(REFLOG.length === 1, 'ref ว่าง → ไม่เขียนอะไรลง Ref_Log');
ok(doneBefore_('') === null && doneBefore_(null) === null, 'ref ว่าง/null → null ไม่พัง');

// ---- 5) ชีตยังไม่มี ต้องสร้างเอง ไม่ต้องรัน setup() ใหม่ ----
reset();
globalThis.__RL = null;
ok(doneBefore_('R9') === null, 'ยังไม่มีชีต → null ไม่โยน error');
rememberDone_('R9', 'IS009', 'ISSUE');
ok(INSERTED === 1, 'สร้างชีต Ref_Log ให้เองเมื่อยังไม่มี');
CACHE = {};
ok(doneBefore_('R9') === 'IS009', 'บันทึกลงชีตที่เพิ่งสร้างแล้วอ่านกลับได้');

// ---- 6) เจอรายการล่าสุดก่อนเมื่อ ref ซ้ำกันในชีต ----
reset();
REFLOG.push([new Date(), 'RX', 'OLD', 'ISSUE']);
REFLOG.push([new Date(), 'RX', 'NEW', 'ISSUE']);
ok(doneBefore_('RX') === 'NEW', 'ref ซ้ำในชีต → คืนรายการล่าสุด');

// ---- 7) เขียนชีตพังต้องไม่ล้มงานที่สำเร็จไปแล้ว ----
reset();
const broken = sheetFrom(REFLOG);
broken.getRange = () => { throw new Error('quota'); };
globalThis.__RL = broken;
let threw = false;
try { rememberDone_('R8', 'IS008', 'ISSUE'); } catch (e) { threw = true; }
ok(!threw, 'เขียน Ref_Log ไม่สำเร็จ → ไม่โยน error ทับงานที่บันทึกไปแล้ว');
ok(doneBefore_('R8') === 'IS008', 'ยังกันซ้ำได้จาก cache (ถอยไปเท่าพฤติกรรมเดิม ไม่แย่กว่า)');

// ---- 8) Ref_Log ตัดได้เหมือน log ตัวอื่น ----
const trimmable = vm.runInThisContext('TRIMMABLE').map(x => x.sheet);
ok(trimmable.indexOf('Ref_Log') >= 0, 'Ref_Log อยู่ในรายการชีตที่ตัดได้');

console.log(fails ? `\n*** ไม่ผ่าน ${fails} จุด ***` : '\nผ่านหมด');
process.exit(fails ? 1 : 0);
