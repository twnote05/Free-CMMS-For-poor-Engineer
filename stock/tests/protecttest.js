// ล็อกชีตหลักฐานไม่ให้พิมพ์ทับ
// เคสจริง: มีคนได้สิทธิ์แก้ไฟล์ชีต เปิดมาเห็น Batches_FIFO แล้วแก้ Qty_Remaining เอง
// ให้ตรงกับของจริง — ยอดคงเหลือทั้งระบบเพี้ยนทันที และไม่มีร่องรอยว่าใครแก้
const fs = require('fs'), vm = require('vm');
const dir = require('path').join(require('path').dirname(__dirname), 'src');   // ไฟล์ที่เอาไปวางใน Apps Script อยู่ใน src/

const SHEETS = {};

function sheetFrom(name) {
  return {
    _name: name, _prot: [],
    getName() { return this._name; },
    getProtections() { return this._prot.slice(); },
    protect() {
      const sh = this;
      const p = {
        _desc: '', _editors: ['somchai@x.com', 'ying@x.com'], _domain: true,
        setDescription(d) { this._desc = d; return this; },
        getDescription() { return this._desc; },
        addEditor(u) { this._editors.push(String(u)); return this; },
        getEditors() { return this._editors.slice(); },
        // ของจริง Google ไม่ยอมให้ถอดเจ้าของไฟล์ออก — สตับให้เหมือนกัน
        removeEditors(list) {
          const rm = list.map(String);
          this._editors = this._editors.filter(e => e === 'owner@x.com' || rm.indexOf(e) < 0);
          return this;
        },
        canDomainEdit() { return this._domain; },
        setDomainEdit(v) { this._domain = v; return this; },
        canEdit() { return true; },
        remove() { sh._prot = sh._prot.filter(x => x !== p); }
      };
      sh._prot.push(p);
      return p;
    }
  };
}

global.Logger = { log: () => {} };
global.Utilities = { formatDate: () => '2026-10-07', base64Decode: () => [] };
global.SpreadsheetApp = {
  ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
  getActive: () => ({
    getSpreadsheetTimeZone: () => 'Asia/Bangkok',
    getName: () => 'TEST',
    getSheets: () => Object.keys(SHEETS).map(k => SHEETS[k]),
    getSheetByName: n => SHEETS[n] || null,
    insertSheet: n => (SHEETS[n] = sheetFrom(n))
  }),
  flush: () => {}
};
global.Session = { getEffectiveUser: () => ({ getEmail: () => 'owner@x.com', toString: () => 'owner@x.com' }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) };
global.CacheService = { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
global.MailApp = { sendEmail: () => {} };
global.DriveApp = {};

vm.runInThisContext(fs.readFileSync(dir + '/Code.gs', 'utf8'), { filename: 'code.js' });

let fails = 0;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };

const NAMES = LOCKED_SHEETS.map(x => x[0]);

function reset(skip) {
  Object.keys(SHEETS).forEach(k => delete SHEETS[k]);
  NAMES.forEach(n => { if (n !== skip) SHEETS[n] = sheetFrom(n); });
}

// ---- 1) ล็อกครบทุกชีตในรายการ ----
reset();
let n = protectSheets_(true);
ok(n === NAMES.length, `ล็อกครบ ${n}/${NAMES.length} ชีต`);
ok(NAMES.every(s => SHEETS[s]._prot.length === 1), 'ทุกชีตมี protection ชิ้นเดียว');

// ---- 2) หัวใจของข้อนี้ ----
ok(SHEETS['Batches_FIFO']._prot.length === 1,
   'Batches_FIFO ถูกล็อก ← ยอดคงเหลือทั้งระบบมาจากชีตนี้');
ok(/Batches_FIFO|ยอดคงเหลือ/.test(SHEETS['Batches_FIFO']._prot[0].getDescription()),
   'คำอธิบายบอกเหตุผล คนเปิดชีตเห็นว่าทำไมแก้ไม่ได้');

// ---- 3) เหลือเจ้าของคนเดียว คนในโดเมนก็แก้ไม่ได้ ----
const p = SHEETS['Stock_Moves']._prot[0];
ok(p.getEditors().length === 1 && p.getEditors()[0] === 'owner@x.com',
   'ถอดคนอื่นออกหมด เหลือเจ้าของไฟล์');
ok(p.canDomainEdit() === false, 'ปิดสิทธิ์แก้ของคนทั้งโดเมน');

// ---- 4) รันซ้ำต้องไม่สะสม protection ----
protectSheets_(true);
protectSheets_(true);
ok(NAMES.every(s => SHEETS[s]._prot.length === 1), 'รัน 3 รอบแล้วยังเหลือชิ้นเดียวต่อชีต');

// ---- 5) ปลดล็อกได้ (ไว้ซ่อมข้อมูลด้วยมือ) ----
protectSheets_(false);
ok(NAMES.every(s => SHEETS[s]._prot.length === 0), 'ปลดล็อกแล้วไม่เหลือ protection');

// ---- 6) ชีตที่ยังไม่มี ต้องข้าม ไม่ใช่โยน error ----
reset('Ref_Log');
let threw = false;
let m = 0;
try { m = protectSheets_(true); } catch (e) { threw = true; }
ok(!threw && m === NAMES.length - 1, 'ชีตที่ยังไม่ถูกสร้าง ข้ามไปเฉย ๆ ไม่พัง');

// ---- 7) protection ที่เราแก้ไม่ได้ ต้องไม่ไปยุ่ง ----
reset();
const foreign = { canEdit: () => false, remove() { throw new Error('ไม่ควรถูกเรียก'); } };
SHEETS['Issues']._prot.push(foreign);
threw = false;
try { protectSheets_(true); } catch (e) { threw = true; }
ok(!threw && SHEETS['Issues']._prot.indexOf(foreign) >= 0,
   'protection ของคนอื่นที่เราไม่มีสิทธิ์ ปล่อยไว้ ไม่ล้ม');

// ---- 8) รายการต้องคลุมชีตหลักฐานทั้งหมด ไม่ใช่แค่ที่นึกออก ----
const logs = TRIMMABLE.map(x => x.sheet).filter(s => NAMES.indexOf(s) < 0);
ok(logs.length === 0, 'ชีตบันทึกย้อนหลังทุกตัวอยู่ในรายการล็อก' + (logs.length ? ' — ตกหล่น ' + logs : ''));
ok(NAMES.indexOf(SH.USERS) >= 0, 'Users อยู่ในรายการ — แก้ช่อง Role เองได้เท่ากับยกสิทธิ์ให้ตัวเอง');

// ---- 9) ชีตข้อมูลหลักต้องแก้มือได้ต่อ ----
['Parts', 'Settings', 'Code_Master', 'Machines'].forEach(s =>
  ok(NAMES.indexOf(s) < 0, s + ' ไม่ถูกล็อก — ยังแก้ในชีตได้ตามเดิม'));

console.log(fails ? `\n*** ไม่ผ่าน ${fails} จุด ***` : '\nผ่านหมด');
process.exit(fails ? 1 : 0);
