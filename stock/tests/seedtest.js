/*! Free CMMS for poor engineers — https://github.com/twnote05/Free-CMMS-For-poor-Engineer
 *  Required Notice: Copyright 2026 IE จอมขี้เกียจ
 *  PolyForm Noncommercial 1.0.0 — ห้ามใช้เชิงพาณิชย์ · ดู LICENSE.md
 */
// ทดสอบ seedRows_() กับข้อมูลใน Data.gs โดยสตับชีตไว้ในหน่วยความจำ
// จำนวนที่คาดคิดจากตัวข้อมูลเอง — เปลี่ยน Data.gs เป็นของโรงงานไหน เทสก็ยังใช้ได้
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = require('path').join(require('path').dirname(__dirname), 'src');   // ไฟล์ที่เอาไปวางใน Apps Script อยู่ใน src/

const written = {};
function fakeSheet(name) {
  return {
    _name: name, _last: 1, _maxCols: 5,
    getLastRow() { return this._last; },
    getMaxColumns() { return this._maxCols; },
    insertColumnsAfter(a, n) { this._maxCols += n; },
    getRange(r, c, nr, nc) {
      const sh = this;
      return {
        setValues(v) { written[sh._name] = v; sh._last = 1 + v.length; return this; },
        setValue(v) { return this; },
        insertCheckboxes() { return this; }
      };
    }
  };
}

global.Logger = { log: () => {} };
global.Utilities = {
  formatDate: (d, tz, fmt) => {
    const p = n => String(n).padStart(2, '0');
    return fmt.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()));
  }
};
global.SpreadsheetApp = { getActive: () => ({ getSpreadsheetTimeZone: () => 'Asia/Bangkok' }) };
global.Session = { getEffectiveUser: () => ({ getEmail: () => 'x@y.com' }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {}, getProperties: () => ({}) }) };
global.CacheService = { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };

const src = fs.readFileSync(path.join(dir, 'Data.gs'), 'utf8') + '\n'
          + fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8') + '\n'
          + fs.readFileSync(path.join(dir, 'Auth.gs'), 'utf8');
vm.runInThisContext(src, { filename: 'bundle.js' });

let fails = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };

/** นับบรรทัดที่มีเนื้อหา — คือจำนวนแถวที่ต้องได้ ไม่ขาดไม่เกิน */
const lines = b => String(b == null ? '' : b).split('\n').filter(l => l.trim()).length;

function check(label, sheetName, block, width, numCols, dateCols) {
  const sh = fakeSheet(sheetName);
  const n = seedRows_(sh, block, width, numCols, dateCols);
  const rows = written[sheetName] || [];
  const bad = rows.filter(r => r.length !== width);
  console.log(`\n=== ${label} · ${n} แถว ===`);
  ok(n === lines(block), 'ทุกบรรทัดกลายเป็นแถว ไม่มีแถวไหนหายเงียบ');
  ok(bad.length === 0, 'ทุกแถวคอลัมน์ครบ ' + width + ' ช่อง');
  return rows;
}

const parts = check('Parts', 'Parts', SEED_PARTS, PT_LABELS.length,
                    [PT.COST, PT.MIN, PT.MAX, PT.MOQ], []);
const tools = check('Tools', 'Tools', SEED_TOOLS, TL_LABELS.length,
                    [TL.QTY, TL.PRICE], [TL.DATE]);
const blades = check('Blades', 'Blades', SEED_BLADES, BL_LABELS.length,
                     [BL.DAYS, BL.SHARPEN], [BL.INSTALL, BL.LAST]);

// ---- ตรวจชนิดข้อมูลของ Parts ----
console.log('\n=== ตรวจชนิดข้อมูล Parts ===');
const codeNotString = parts.filter(r => typeof r[PT.PART] !== 'string');
ok(codeNotString.length === 0, 'รหัสอะไหล่เป็น string ทุกแถว');
const minNotNum = parts.filter(r => r[PT.MIN] !== '' && typeof r[PT.MIN] !== 'number');
ok(minNotNum.length === 0, 'Min_Qty ที่กรอกไว้ เป็นตัวเลขทุกแถว');
const activeNotBool = parts.filter(r => r[PT.ACTIVE] !== true);
ok(activeNotBool.length === 0, 'Active เป็น boolean true ไม่ใช่คำว่า TRUE');
console.log('  ตัวอย่างแถวแรก:', JSON.stringify(parts[0]));
console.log('  มี Location:', parts.filter(r => r[PT.LOC]).length);
console.log('  มี Min:', parts.filter(r => r[PT.MIN] !== '').length);
console.log('  มี Level:', parts.filter(r => r[PT.LEVEL]).length);
console.log('  มี Machine:', parts.filter(r => r[PT.MACHINE]).length);
console.log('  มี Position:', parts.filter(r => r[PT.POS]).length);

// ---- รหัสซ้ำ (เกณฑ์เดียวกับ findDupes_) ----
const asRows = [PT_LABELS].concat(parts);
console.log('\n=== findDupes_ กับข้อมูลที่จะลงจริง ===');
ok(findDupes_(asRows).length === 0, 'ไม่มีรหัสอะไหล่ซ้ำ ' + findDupes_(asRows).slice(0, 5));

// ---- วันที่ ----
console.log('\n=== วันที่ ===');
const td = tools.filter(r => r[TL.DATE] instanceof Date);
console.log('  Tools Handover_Date เป็น Date จริง:', td.length, '/', tools.length);
console.log('  ตัวอย่าง:', td.slice(0, 3).map(r => r[TL.DATE].toISOString().slice(0, 10)));
const bd = blades.filter(r => r[BL.INSTALL] instanceof Date);
console.log('  Blades Install_Date เป็น Date จริง:', bd.length, '(เฉพาะใบที่ติดตั้งอยู่)');
console.log('  ตัวอย่าง:', bd.slice(0, 3).map(r => r[BL.INSTALL].toISOString().slice(0, 10)));

// ---- สถานะใบมีดต้องตรงกับที่ระบบรู้จัก ----
const statuses = [...new Set(blades.map(r => r[BL.STATUS]))];
console.log('\n=== สถานะใบมีด ===');
console.log('  พบ:', statuses);
console.log('  ที่ระบบรู้จัก:', BLADE_STATUS);
ok(statuses.filter(s => BLADE_STATUS.indexOf(s) < 0).length === 0,
   'สถานะใบมีดทุกค่าอยู่ใน BLADE_STATUS ' + statuses.filter(s => BLADE_STATUS.indexOf(s) < 0));

// ---- สถานะเครื่องมือ ----
const tstat = [...new Set(tools.map(r => r[TL.STATUS]))];
console.log('\n=== สถานะเครื่องมือ ===');
ok(tstat.filter(s => TOOL_STATUS.indexOf(s) < 0).length === 0,
   'สถานะเครื่องมือทุกค่าอยู่ใน TOOL_STATUS ' + tstat.filter(s => TOOL_STATUS.indexOf(s) < 0));

// ---- ไม่เขียนทับชีตที่มีข้อมูลแล้ว ----
const busy = fakeSheet('Busy'); busy._last = 50;
console.log('\n=== กันเขียนทับ ===');
ok(seedRows_(busy, SEED_PARTS, 15, [], []) === 0,
   'ชีตที่มีข้อมูลแล้ว ไม่เขียนทับ ← รัน setup() ซ้ำกี่ครั้งก็ปลอดภัย');

// Data.gs ว่าง = ติดตั้งระบบเปล่า ไม่ใช่ข้อผิดพลาด — คนที่เอา template ไปใช้ส่วนใหญ่เริ่มแบบนี้
ok(seedRows_(fakeSheet('E1'), '', 15, [], []) === 0 &&
   seedRows_(fakeSheet('E2'), '\n  \n', 15, [], []) === 0 &&
   seedRows_(fakeSheet('E3'), undefined, 15, [], []) === 0,
   'Data.gs ว่าง หรือไม่ได้วาง → ติดตั้งต่อได้ ไม่โยน error');

console.log(fails ? '\n*** ไม่ผ่าน ' + fails + ' จุด ***' : '\nผ่านหมด');
process.exit(fails ? 1 : 0);
