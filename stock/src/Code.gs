/*! Free CMMS for poor engineers — https://github.com/twnote05/Free-CMMS-For-poor-Engineer
 *  Required Notice: Copyright 2026 IE จอมขี้เกียจ
 *  PolyForm Noncommercial 1.0.0 — ห้ามใช้เชิงพาณิชย์ · ดู LICENSE.md
 */
/**
 * ============================================================================
 *  ระบบ STOCK อะไหล่ — Spare Parts Store  (Google Apps Script backend)
 *  ฐานข้อมูล = สเปรดชีตนี้เอง  ·  รัน setup() ครั้งเดียว แล้ว Deploy เป็น Web App
 *
 *  คอนเซ็ปหลักยกมาจากโปรเจค POS:
 *  ยอดคงเหลือ "ไม่เคย" เป็นคอลัมน์ในตารางอะไหล่ — คงเหลือคือ SUM(Qty_Remaining)
 *  ของ batch ทั้งหมดของอะไหล่ตัวนั้นเสมอ การตัดสินใจข้อเดียวนี้คือสิ่งที่ทำให้
 *  FIFO, ต้นทุนการเบิก, การคืนของ และการนับสต๊อก ถูกต้องได้ทั้งหมด
 *
 *    0  config + helpers            4  เบิก / คืนอะไหล่
 *    1  settings + users/roles      5  รับเข้า / สั่งซื้อ (PO)
 *    2  FIFO engine                 6  นับสต๊อก / ตัดจำหน่าย
 *    3  catalog + bootstrap         7  รายงาน → admin CRUD → setup → tests
 * ============================================================================
 */

/* ========================================================================== *
 *  0. CONFIG + HELPERS
 * ========================================================================== */

const SH = {
  PARTS:    'Parts',
  CODES:    'Code_Master',
  TOOLS:    'Tools',
  BLADES:   'Blades',
  BLADELOG: 'Blade_Log',
  BATCHES:  'Batches_FIFO',
  ISSUES:   'Issues',
  MOVES:    'Stock_Moves',
  PO:       'Purchase_Orders',
  MACHINES: 'Machines',
  ARCHIVE:  'Batches_Archive',
  AUDIT:    'Audit_Logs',
  REFLOG:   'Ref_Log',
  SETTINGS: 'Settings',
  USERS:    'Users'
};

/** Column indexes (0-based). ต้องตรงกับ header ที่ setup() เขียนไว้ */
const PT = { PART:0, NAME:1, CAT:2, UNIT:3, LOC:4, COST:5, MIN:6, MAX:7,
             SUPPLIER:8, MACHINE:9, ACTIVE:10, IMAGE:11, MOQ:12, LEVEL:13, POS:14 };
const CD = { LIST:0, KEY:1, EN:2, TH:3, CODE4:4 };
const TL = { ID:0, NAME:1, QTY:2, UNIT:3, TEAM:4, HOLDER:5, DATE:6, PRICE:7,
             STATUS:8, IMAGE:9, NOTE:10 };
const BL = { ID:0, SPEC:1, MACHINE:2, POS:3, STATUS:4, INSTALL:5, DAYS:6, SHARPEN:7,
             LAST:8, NOTE:9 };
const BG = { TS:0, ID:1, ACTION:2, MACHINE:3, POS:4, DAYS:5, USER:6, NOTE:7 };
const B  = { ID:0, PART:1, RECEIVED:2, EXPIRY:3, QTY_IN:4, QTY_LEFT:5, COST:6, SUPPLIER:7, REF:8 };
const IS = { TS:0, ID:1, TYPE:2, PART:3, NAME:4, QTY:5, COST:6, VALUE:7, BATCHES:8,
             MACHINE:9, JOB:10, REQUESTER:11, DEPT:12, NOTE:13, USER:14, REF:15 };
const MV = { TS:0, ID:1, TYPE:2, PART:3, QTY:4, BATCHES:5, VALUE:6, REASON:7, USER:8, DOC:9 };
const RF = { TS:0, REF:1, DOC:2, TYPE:3 };
const PO = { TS:0, ID:1, PART:2, NAME:3, SUPPLIER:4, QTY:5, COST:6, EST:7, STATUS:8 };
const MC = { CODE:0, NAME:1, AREA:2, ACTIVE:3 };
const US = { EMAIL:0, NAME:1, ROLE:2, ACTIVE:3, PIN:4, SALT:5, FAILED:6, LOCKED:7, PHOTO:8 };

/**
 * ทีมนี้ไม่มีแอดมินคอยมอนิเตอร์ สิทธิ์จึงไล่ตามสายงานจริงของหน้างาน:
 * TECH = ช่าง — สแกนเบิกอะไหล่เอง คืนของ ติดตั้ง/ถอด/ส่งลับคมใบมีด ดูสต๊อกและบัตรสต๊อก
 *                แก้ข้อมูลหลักไม่ได้เลย
 * LEAD = หัวหน้าช่าง — รับเข้า นับสต๊อก ตัดจำหน่าย สั่งซื้อ แก้ข้อมูลอะไหล่/เครื่องมือ รายงาน
 * ENG  = วิศวกรปฏิบัติการ — ผู้ใช้และสิทธิ์ ตั้งค่า ประวัติการแก้ไข ปลดระวาง เก็บกวาดข้อมูล
 *
 * ทางออกฉุกเฉินเมื่อ ENG ทุกคนเข้าไม่ได้: รัน emergencyResetPin() จาก Apps Script editor ตรง ๆ (ดู Auth.gs)
 * (currentUser_() คืนสิทธิ์สูงสุดเมื่อรันจาก editor) — จึงไม่มีทางล็อกตัวเองออกถาวร
 */
const RANK = { TECH: 1, LEAD: 2, ENG: 3 };

const PT_LABELS = ['Part_No', 'Name', 'Category', 'Unit', 'Location', 'Cost',
                   'Min_Qty', 'Max_Qty', 'Supplier', 'Machine', 'Active', 'Image', 'MOQ', 'Level',
                   'Position'];
const TL_LABELS = ['Tool_ID', 'Name', 'Qty', 'Unit', 'Team', 'Holder', 'Handover_Date', 'Price',
                   'Status', 'Image', 'Note'];
const BL_LABELS = ['Blade_ID', 'Spec', 'Machine', 'Position', 'Status', 'Install_Date',
                   'Days_Used_Total', 'Sharpen_Count', 'Last_Sharpen', 'Note'];
const B_LABELS  = ['Batch_ID', 'Part_No', 'Received', 'Expiry', 'Qty_In', 'Qty_Left',
                   'Unit_Cost', 'Supplier', 'Ref'];

/** ขยายจำนวนคอลัมน์ของชีต เพื่อให้เขียนฟิลด์ที่เพิ่มมาใหม่ในชีตเก่าได้ */
function widen_(sh, n) {
  const have = sh.getMaxColumns();
  if (have < n) sh.insertColumnsAfter(have, n - have);
}

function ss_()      { return SpreadsheetApp.getActive(); }
function tz_()      { return ss_().getSpreadsheetTimeZone(); }
function round2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function user_()    { return currentUser_().email; }        // ดู Auth.gs
function today_()   { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต "' + name + '" — เปิด Apps Script แล้วรัน setup() หนึ่งครั้ง');
  return sh;
}

/** id ที่เรียงตามเวลาได้: IS20260916-141203-517 */
function id_(prefix) {
  return prefix + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss') +
         '-' + Math.floor(Math.random() * 900 + 100);
}

function ymd_(d)  { return d instanceof Date ? Utilities.formatDate(d, tz_(), 'yyyy-MM-dd') : (d ? String(d) : ''); }
function ymdhm_(d){ return d instanceof Date ? Utilities.formatDate(d, tz_(), 'yyyy-MM-dd HH:mm') : ''; }

function parseDate_(s) {
  if (s instanceof Date) return s;
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d;
}

function appendRows_(sh, rows) {
  if (!rows.length) return;
  widen_(sh, rows[0].length);      // ชีตที่สร้างจากเวอร์ชันเก่าจะได้ไม่พังตอนเขียนคอลัมน์ใหม่
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

/* ---- กันคีย์ซ้ำ ---------------------------------------------------------- *
 * ปุ่มถูกล็อกตอนกดอยู่แล้ว (S.busy ฝั่งเบราว์เซอร์) รูที่เหลือคือ
 * "เน็ตหลุดตอนเซิร์ฟเวอร์ตอบกลับ แล้วผู้ใช้กดยืนยันใหม่" — รายการเข้าไปสองรอบ
 * เบราว์เซอร์จึงสร้าง ref หนึ่งค่าต่อหนึ่งตะกร้า/หนึ่งฟอร์ม เปลี่ยนเมื่อบันทึกสำเร็จเท่านั้น
 * ถ้า ref เดิมเคยสำเร็จแล้ว เซิร์ฟเวอร์คืนเลขเอกสารเดิมและไม่เขียนอะไรเพิ่ม
 *
 * เก็บสองที่: CacheService (เร็ว) + ชีต Ref_Log (เชื่อถือได้)
 * เพราะ CacheService ไม่การันตี TTL — เขี่ยทิ้งก่อน 6 ชม. ได้
 * ถ้าเชื่อ cache อย่างเดียว เน็ตหลุดตอนตอบกลับแล้วกดซ้ำ = ตัดสต๊อกสองรอบ
 */
const DEDUP_TTL = 21600;          // 6 ชั่วโมง

function dedupKey_(ref) { return 'ref_' + String(ref || '').trim(); }

/** ชีตทะเบียน ref — สร้างเองถ้ายังไม่มี คนที่ติดตั้งรุ่นเก่าจะได้ด้วยโดยไม่ต้องรัน setup() ใหม่ */
function refLogSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SH.REFLOG);
  if (!sh) {
    sh = ss.insertSheet(SH.REFLOG);
    sh.getRange(1, 1, 1, 4)
      .setValues([['Timestamp', 'Ref', 'Doc_ID', 'Type']])
      .setFontWeight('bold').setBackground('#f1f5f9');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * เคยบันทึก ref นี้สำเร็จไปแล้วหรือยัง — คืนเลขเอกสารเดิมถ้าเคย
 * cache ก่อนเพราะเร็ว พลาดค่อยไปอ่านของจริงในชีต
 */
function doneBefore_(ref) {
  ref = String(ref || '').trim();
  if (!ref) return null;
  try {
    const hit = CacheService.getScriptCache().get(dedupKey_(ref));
    if (hit) return hit;
  } catch (e) { /* cache ล่ม ก็ไปดูของจริง */ }

  const sh = ss_().getSheetByName(SH.REFLOG);
  if (!sh || sh.getLastRow() < 2) return null;
  // อ่านแค่สองคอลัมน์ ไม่ใช่ทั้งชีต · ไล่จากท้ายเพราะรายการที่เพิ่งเขียนอยู่ท้ายสุด
  const rows = sh.getRange(2, RF.REF + 1, sh.getLastRow() - 1, 2).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]).trim() === ref) return String(rows[i][1]);
  }
  return null;
}

/**
 * จำว่า ref นี้สำเร็จแล้ว — ลงชีตก่อน cache ทีหลัง
 * เขียนหลังงานหลักสำเร็จเสมอ — ถ้าเขียนก่อนแล้วงานพัง การกดซ้ำที่ถูกต้องจะโดนปฏิเสธ
 * และคืนเลขเอกสารที่ไม่มีอยู่จริงกลับไป
 * ถ้าเขียนชีตไม่สำเร็จ ยังเหลือ cache อยู่ — แย่สุดคือเท่าเดิม ไม่แย่กว่า
 */
function rememberDone_(ref, docId, type) {
  ref = String(ref || '').trim();
  if (!ref) return;
  try { CacheService.getScriptCache().put(dedupKey_(ref), String(docId), DEDUP_TTL); } catch (e) {}
  try {
    appendRows_(refLogSheet_(), [[new Date(), ref, String(docId), String(type || '')]]);
  } catch (e) {
    Logger.log('เขียน Ref_Log ไม่สำเร็จ (' + ref + '): ' + e.message);
  }
}

/**
 * รหัสอะไหล่ซ้ำในชีต Parts — เกิดจากการคีย์ลงชีตตรง ๆ สองรอบ
 * อันตรายเงียบ ๆ เพราะคงเหลือถูกนับให้ทั้งสองแถว มูลค่าสต๊อกจึงเบิ้ล
 * เทียบแบบไม่สนตัวพิมพ์ใหญ่เล็ก: BRG-6204 กับ brg-6204 คือของชิ้นเดียวกันในคลังจริง
 */
function findDupes_(pRows) {
  const seen = {}, dupes = [];
  for (let i = 1; i < pRows.length; i++) {
    const raw = String(pRows[i][PT.PART]).trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen[key]) { if (dupes.indexOf(seen[key]) < 0) dupes.push(seen[key]); }
    else seen[key] = raw;
  }
  return dupes;
}

/** จำนวนที่ควรสั่ง: เติมขึ้นไปถึง Max แล้วปัดขึ้นให้ครบขั้นต่ำที่ผู้ขายรับ (MOQ) */
function reorderQty_(stock, min, max, moq) {
  const target = max > 0 ? max : min * 2;
  let qty = Math.max(target - stock, 1);
  if (moq > 0) qty = Math.ceil(qty / moq) * moq;
  return qty;
}

/**
 * ทุกเส้นทางที่เขียนข้อมูลวิ่งผ่านตัวนี้ ที่นี่จึงเป็นที่เดียวที่ล้าง cache ของ catalog —
 * ถ้าไปล้างในแต่ละฟังก์ชันที่เขียน ก็คือมีโอกาสลืมเท่าจำนวนฟังก์ชัน และ catalog เก่า
 * หมายถึงหน้าจอเบิกเห็นของที่ไม่มีอยู่จริง
 */
function lock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('ระบบกำลังทำงานอยู่ ลองอีกครั้ง');
  try {
    clearCatalogCache();
    return fn();
  } finally {
    clearCatalogCache();
    lock.releaseLock();
  }
}

/* ---- catalog cache ------------------------------------------------------ *
 * TTL เป็นแค่ตัวกันพลาดกรณีมีคนพิมพ์ลงชีตตรง ๆ ทุก write ผ่านแอปล้าง cache ทันที
 */
const CATALOG_KEY = 'parts_catalog_v1';
const CATALOG_TTL = 300;          // วินาที
const CACHE_MAX_BYTES = 90000;    // CacheService ปฏิเสธค่าที่เกิน 100 KB

function clearCatalogCache() {
  try { CacheService.getScriptCache().remove(CATALOG_KEY); } catch (e) {}
}

/** Simple trigger: มีคนพิมพ์ลงชีต Parts / Batches / Machines ด้วยมือ */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const name = e.range.getSheet().getName();
    if (name === SH.PARTS || name === SH.BATCHES || name === SH.MACHINES) clearCatalogCache();
  } catch (err) { /* ห้ามไปขวางการแก้ชีตด้วยมือ */ }
}

/* ========================================================================== *
 *  1. SETTINGS + USERS / ROLES
 * ========================================================================== */

const DEFAULTS = {
  SITE_NAME:        'คลังอะไหล่',
  SITE_ADDRESS:     '',
  CURRENCY:         '฿',
  EXPIRY_WARN_DAYS: '30',    // อะไหล่ที่มีวันหมดอายุ (จาระบี น้ำมัน ยางซีล) เตือนล่วงหน้า
  DEAD_STOCK_DAYS:  '180',   // ไม่มีการเบิกเกินกี่วัน = ของนอน
  REQUIRE_JOB_NO:   '0',     // 1 = ต้องกรอกเลขใบแจ้งซ่อมทุกครั้งที่เบิก
  SHOW_COST_TO_TECH:'0',     // 0 = ช่างไม่เห็นต้นทุน/มูลค่า (เห็นแค่จำนวนคงเหลือ)
  ALERT_EMAILS:     '',      // คั่นด้วย comma; ว่าง = ส่งให้หัวหน้าช่างและวิศวกรทุกคน
  SLIP_WIDTH:       '80',    // ความกว้างใบเบิกที่พิมพ์ (mm): 58 หรือ 80
  SLIP_FOOTER:      'ผู้เบิก ....................   ผู้จ่ายของ ....................',
  LOGO_URL:         ''      // ว่าง = ใช้โลโก้กลางที่ฝังในโค้ด · ใส่ลิงก์รูปเพื่อเปลี่ยน
};

function getSettings() {
  const out = {};
  Object.keys(DEFAULTS).forEach(function (k) { out[k] = DEFAULTS[k]; });
  const sh = ss_().getSheetByName(SH.SETTINGS);
  if (sh) {
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const k = String(rows[i][0]).trim();
      if (k && rows[i][1] !== '') out[k] = String(rows[i][1]);
    }
  }
  return out;
}

function saveSettings(map) {
  requireRole_('ENG');
  const sh = sheet_(SH.SETTINGS);
  const rows = sh.getDataRange().getValues();
  const at = {};
  for (let i = 1; i < rows.length; i++) at[String(rows[i][0]).trim()] = i + 1;

  const changes = [];
  Object.keys(map).forEach(function (k) {
    const value = String(map[k]);
    if (at[k]) {
      const before = String(rows[at[k] - 1][1]);
      if (before !== value) changes.push([k, before, value]);
      sh.getRange(at[k], 2).setValue(value);
    } else {
      changes.push([k, '', value]);
      appendRows_(sh, [[k, value, '']]);
    }
  });
  if (changes.length) logAudit_('UPDATE_SETTINGS', 'Settings', changes);
  return getSettings();
}

function myRole() { return currentUser_().role; }

function requireRole_(min) {
  const role = currentUser_().role;
  if ((RANK[role] || 0) < RANK[min]) throw new Error('สิทธิ์ไม่พอ: ต้องเป็น ' + min + ' ขึ้นไป');
  return role;
}

function hasRole_(min) { return (RANK[currentUser_().role] || 0) >= RANK[min]; }

function getUsers() {
  requireRole_('ENG');
  const rows = sheet_(SH.USERS).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!String(rows[i][US.EMAIL]).trim()) continue;
    out.push({ email: String(rows[i][US.EMAIL]).trim(), name: String(rows[i][US.NAME] || ''),
               role: String(rows[i][US.ROLE] || 'TECH').toUpperCase(),
               active: rows[i][US.ACTIVE] !== false,
               hasPin: !!String(rows[i][US.PIN] || ''),
               photo: String(rows[i][US.PHOTO] || '') });
  }
  return out;
}

function saveUser(u) {
  requireRole_('ENG');
  return lock_(function () {
    const email = String(u.email || '').trim().toLowerCase();
    if (!email) throw new Error('ต้องมีอีเมล');
    const role = String(u.role || '').toUpperCase();
    if (!RANK[role]) throw new Error('บทบาทต้องเป็น TECH (ช่าง) / LEAD (หัวหน้าช่าง) / ENG (วิศวกรปฏิบัติการ)');
    const sh = sheet_(SH.USERS);
    widen_(sh, 9);
    const rows = sh.getDataRange().getValues();
    const after = [String(u.name || ''), role, u.active !== false, String(u.photo || '')];
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][US.EMAIL]).trim().toLowerCase() !== email) continue;
      const before = [String(rows[i][US.NAME] || ''), String(rows[i][US.ROLE] || ''),
                      rows[i][US.ACTIVE] !== false, String(rows[i][US.PHOTO] || '')];
      sh.getRange(i + 1, US.NAME + 1, 1, 3).setValues([[after[0], after[1], after[2]]]);
      sh.getRange(i + 1, US.PHOTO + 1).setValue(after[3]);
      logAudit_('UPDATE_USER', email, rowDiff_(before, after, ['Name', 'Role', 'Active', 'Photo']));
      return getUsers();
    }
    appendRows_(sh, [[email, after[0], after[1], after[2], '', '', 0, '', after[3]]]);
    logAudit_('CREATE_USER', email, [['Role', '', role]]);
    return getUsers();
  });
}

/* ========================================================================== *
 *  1b. รหัสอะไหล่ตามมาตรฐาน Code SP V1
 *
 *  โครงรหัส 17 ตัว — ถอดมาจากสูตรในไฟล์ "โครงสร้างสำหรับกำหนดรหัส.xlsx"
 *  และตรวจกับข้อมูลจริง 598 แถวแล้วตรงทุกแถว:
 *
 *      6      00      01      001      M001      -      0001
 *      │      │       │       │        │                │
 *      │      │       │       │        │                └ Running 4 หลัก
 *      │      │       │       │        └ Code name 4 ตัว (ย่อจากหมวดชนิด)
 *      │      │       │       └ Sub group 1 — เลขหมวดชนิด 3 หลัก
 *      │      │       └ Type 2 หลัก (01 ไฟฟ้า / 02 จักรกล / 03 เครื่องมือวัด / 04 สิ้นเปลือง)
 *      │      └ การใช้งาน 2 หลัก
 *      └ Item Group Main 1 หลัก (6 = อะไหล่, 5 = สิ้นเปลือง)
 *
 *  **Running นับต่อ Code name ทั้งระบบ** ไม่ใช่ต่อ prefix — ยืนยันจากข้อมูลเดิม:
 *  M001 วิ่ง 0001–0019 ต่อเนื่องแม้อยู่คนละ Type/การใช้งาน ถ้านับแยกต่อ prefix
 *  จะออกรหัสชนกันทันที (ตรงกับที่สูตรเดิมทำ: MAX ตาม Code name แล้ว +1)
 *
 *  แถวเดิมที่เอาอักษรย่อเครื่องจักรไปใส่ช่อง Code name (CM01, MIX1, MIX2 …)
 *  ถูกข้ามอัตโนมัติ เพราะ code4 ไม่ตรงกับหมวดที่ขอ — เหมือนที่สูตรเดิมกัน CM01 ไว้
 * ========================================================================== */

const CODE_RE = /^(\d)(\d{2})(\d{2})(\d{3})([A-Za-z0-9]{4})-(\d{4})$/;

/** ค่าตั้งต้นของชีต Code_Master — แก้ในชีตได้ ไม่ต้องแตะโค้ด */
const CODE_SEED = {
  GROUP: '1|วัตถุดิบ||\n2|SM||\n3|FG||\n5|สิ้นเปลือง||\n6|อะไหล่||',
  TYPE:  '01|electronic|อุปกรณ์ไฟฟ้า|\n02|Machanic|อุปกรณ์จักรกล|\n03|Calibration|เครื่องมือวัด|\n04|Consumable|สิ้นเปลือง|',
  USAGE: '00|ทั่วไป||\n01|เฉพาะงาน||',
  CATEGORY: `000|E-Clip|คลิ๊ปล็อก|E001
001|Motor|มอเตอร์|M001
002|Inverter|อินเวอร์เตอร์|I001
003|Capacitor|คาปาซิเตอร์|C001
004|Breaker|เบรกเกอร์|B001
005|Controller|ชุดควบคุม|C002
006|Module|โมดูล|M002
007|Magnetic|แม็กเนติก|M003
008|Sensor|เซ็นเซอร์|S001
009|Connector|คอนเน็คเตอร์|C003
009|Contactor|คอนแท็กเตอร์|C004
010|Heater|ฮีทเตอร์|H001
011|Fuse Unit|ฟิวส์|F001
012|Driver|ไดร์ฟเวอร์|D001
013|Lamp|หลอดไฟ|L001
014|Machine|เครื่องจักร (ทั้งเครื่อง)|M004
015|Disk|แผ่น|D002
016|Meter|มิเตอร์|M005
017|PLC Board|ชุด PLC|P001
018|Plug|ปลั๊ก|P002
019|Power supply|สำรองไฟ|P003
020|Press Slider|ชุดปรับเลื่อนข้าง|P004
021|Pump|ปั๊ม|P005
022|Regulator|เร็กกูเรเตอร์ (ตัวปรับต่าง ๆ)|R001
023|Relay module|รีเลย์|R002
024|Screen|จอ|S002
025|Seal|ซีลปิด|S003
027|Thermocouple|หัววัดอุณหภูมิ|T001
028|Timer|ตัวนับเวลา หน่วงเวลา|T002
029|Transformer|หม้อแปลง|T003
030|Turbine|ใบพัด|T004
031|Valve|วาล์ว|V001
032|Wire|สายไฟ|W001
033|Board|บอร์ด|B002
034|Gear|เกียร์|G001
035|Boot|บูธ|B003
036|Press slide|ตัวปรับเลื่อนข้าง|P006
037|Profile Cutter|ตัวตัดโปรไฟล์|P007
038|Coupling|ยอยต่อเพลา|C005
039|Pneumatic Cylinder|กระบอกลม|P008
040|Tools|เครื่องมือ|T005
041|Fitting|ข้อต่อท่อ|F002
042|Roller|ลูกกลิ้ง|R003
043|Hydro sleeve|หน้าแปลนท่อโลหะ|H002
044|Bearing|ลูกปืน|B004
045|Pad|แผ่นยาง|P009
046|Conveyor|สายพานลำเลียง|C006
047|Lower Slider|ชุดสไลด์ด้านล่าง|L002
048|Mold|โมลด์ฉีดงาน|M006
049|O-ring|ยางโอริง|O001
050|Pin|พินล็อก|P010
051|Clutch|แผ่นคลัช ชุดคลัช|C007
052|Joint|ข้อต่อต่าง ๆ|J001
053|Spring head|สปริง|S005
054|Vaccuum Unit|ชุดดูด|V002
055|Cooller Tube|ท่อน้ำหล่อเย็น|C008
056|Filter Unit|แผ่นกรอง|F003
057|Screw|สกรูเกลียว|S006
058|Repair kit|ชุดซ่อมฉุกเฉิน|R004
059|Nut & Bolt|น็อตตัวผู้ตัวเมีย|NB01
060|Blade|ใบมีดตัด|B005
061|Shock Absorbor|โช้คอัพ|S007
062|Chain|โซ่|C009
063|Gasket|ปะเก็น|G002
064|Timing Belt|สายพานไทม์มิ่ง|T006
065|Nozzle|หัวเป่าต่าง ๆ|N001
066|Machine|เครื่องจักร|M007
067|Meter|มิเตอร์วัดค่า|M008
068|Pipe|ท่อ|P011
069|Spark Plug|ปลั๊กหัวเทียน|SP01
070|Suction Filter|กรองดูดฝุ่น|S008
071|Barrel|กระบอกเครื่องฉีด|B006
072|Contactor|อุปกรณ์เดียวกับแม็กเนติก|C010`
};

/** ประกอบรหัส — pure ดู testPartCode_() */
function buildPartCode_(group, usage, type, key3, code4, running) {
  const pad = function (v, n) { return String(v == null ? '' : v).trim().replace(/\D/g, '').padStart(n, '0').slice(-n); };
  return pad(group, 1) + pad(usage, 2) + pad(type, 2) + pad(key3, 3) +
         String(code4).trim().toUpperCase() + '-' + pad(running, 4);
}

/** แยกรหัสกลับเป็นส่วน ๆ — คืน null ถ้าไม่เข้าโครง (รหัสเดิมที่ไม่ตรงมาตรฐานก็ยังเก็บได้) */
function parsePartCode_(code) {
  const m = CODE_RE.exec(String(code || '').trim());
  return m ? { group: m[1], usage: m[2], type: m[3], key3: m[4],
               code4: m[5].toUpperCase(), running: Number(m[6]) } : null;
}

/**
 * Running ถัดไปของ code4 นั้น = MAX ที่เคยใช้ + 1 (ไม่ถมรูที่ว่าง เพราะรหัสที่เคย
 * ออกไปอยู่บนเอกสาร/สติกเกอร์แล้ว การเอากลับมาใช้ใหม่คือการชนกันเงียบ ๆ)
 * @param {string[]} codes รหัสที่มีอยู่ทั้งหมด
 */
function nextRunning_(codes, code4) {
  code4 = String(code4 || '').trim().toUpperCase();
  let max = 0;
  (codes || []).forEach(function (c) {
    const p = parsePartCode_(c);
    if (p && p.code4 === code4 && p.running > max) max = p.running;
  });
  return max + 1;
}

/** ลิสต์ทั้งสี่ชุดจากชีต Code_Master (ไม่มีชีต = ใช้ค่าตั้งต้นในโค้ด) */
function getCodeMaster() {
  const out = { GROUP: [], TYPE: [], USAGE: [], CATEGORY: [] };
  const sh = ss_().getSheetByName(SH.CODES);
  if (sh && sh.getLastRow() > 1) {
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const list = String(rows[i][CD.LIST] || '').trim().toUpperCase();
      const key = String(rows[i][CD.KEY] || '').trim();
      if (!out[list] || !key) continue;
      out[list].push({ key: key, en: String(rows[i][CD.EN] || ''), th: String(rows[i][CD.TH] || ''),
                       code4: String(rows[i][CD.CODE4] || '').trim().toUpperCase() });
    }
  }
  Object.keys(out).forEach(function (list) {
    if (out[list].length) return;                       // ชีตมีข้อมูลแล้ว ไม่ต้องใส่ค่าตั้งต้น
    CODE_SEED[list].split('\n').forEach(function (line) {
      const f = line.split('|');
      if (f[0]) out[list].push({ key: f[0].trim(), en: (f[1] || '').trim(), th: (f[2] || '').trim(),
                                 code4: (f[3] || '').trim().toUpperCase() });
    });
  });
  return out;
}

/**
 * เพิ่มหมวดชนิดใหม่ลง Code_Master
 *
 * ความไม่ซ้ำเป็นเรื่องคอขาดบาดตาย จึงบังคับสามชั้น:
 *   1. code4 ต้องไม่ซ้ำกับหมวดที่มีอยู่ (เทียบแบบไม่สนตัวพิมพ์)
 *   2. Key 3 หลักระบบออกให้เอง = ตัวมากสุดที่มีอยู่ + 1 ไม่ถมรูที่ว่าง
 *   3. ทั้งก้อนอยู่ใน lock_ เดียว — อ่านของเดิมและเขียนของใหม่ห้ามมีใครแทรกกลาง
 *      ถ้าอ่านนอก lock สองคนกดพร้อมกันจะเห็นเลขเดิมแล้วได้ Key เดียวกันทั้งคู่
 *
 * ถึง code4 จะซ้ำได้ด้วยวิธีใดก็ตาม รหัสอะไหล่ก็ยังไม่ชนกัน เพราะ nextRunning_
 * กวาดรหัสที่มีอยู่จริงทั้งคลังแล้วเอา MAX+1 ไม่ได้นับจากจำนวนแถวในหมวด
 */
function addCodeCategory(en, th, code4) {
  requireRole_('LEAD');
  en = String(en || '').trim();
  th = String(th || '').trim();
  code4 = String(code4 || '').trim().toUpperCase();

  if (!en && !th) throw new Error('ต้องมีชื่อหมวด (อังกฤษหรือไทยอย่างน้อยหนึ่งช่อง)');
  if (!/^[A-Z0-9]{4}$/.test(code4)) {
    throw new Error('อักษรย่อต้องเป็น A-Z หรือ 0-9 รวม 4 ตัวพอดี เช่น M003 หรือ SL12 (ได้ "' + code4 + '")');
  }

  return lock_(function () {
    const sh = sheet_(SH.CODES);
    const rows = sh.getDataRange().getValues();
    let maxKey = 0;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][CD.LIST] || '').trim().toUpperCase() !== 'CATEGORY') continue;
      const c = String(rows[i][CD.CODE4] || '').trim().toUpperCase();
      if (c === code4) {
        throw new Error('อักษรย่อ ' + code4 + ' ถูกใช้กับหมวด "' +
          (String(rows[i][CD.EN] || '') || String(rows[i][CD.TH] || '')) + '" อยู่แล้ว — ใช้ตัวอื่น');
      }
      const k = Number(String(rows[i][CD.KEY] || '').replace(/\D/g, ''));
      if (k > maxKey) maxKey = k;
    }
    const key = String(maxKey + 1).padStart(3, '0');
    if (key.length > 3) throw new Error('หมวดชนิดเต็ม 1000 รายการแล้ว');

    appendRows_(sh, [['CATEGORY', key, en, th, code4]]);
    SpreadsheetApp.flush();
    logAudit_('ADD_CODE_CATEGORY', code4, [['หมวดชนิดใหม่', '', key + ' ' + (en || th) + ' ' + code4]]);

    // รหัสอะไหล่เดิมที่ใช้อักษรย่อนี้อยู่แล้ว (รหัสเก่านอกมาตรฐานก็นับ) — บอกให้รู้ว่า
    // Running จะเริ่มต่อจากของเดิม ไม่ได้เริ่มที่ 1
    const used = partCodes_().filter(function (c) {
      const p = parsePartCode_(c);
      return p && p.code4 === code4;
    }).length;

    return { key: key, en: en, th: th, code4: code4,
             existing: used, nextRunning: nextRunning_(partCodes_(), code4),
             codes: getCodeMaster() };
  });
}

/**
 * ดูรหัสถัดไปก่อนบันทึก — เลขที่ได้เป็นเพียงตัวอย่าง เลขจริงถูกจองอีกครั้งใน
 * savePart() ซึ่งอยู่ใน lock_ เสมอ สองคนกดพร้อมกันจึงไม่ได้ Running เดียวกัน
 * @param {{group,usage,type,category}} sel  category = code4 ของหมวดชนิด
 */
function previewPartCode(sel) {
  requireRole_('LEAD');
  const g = pickCode_(sel);
  const codes = partCodes_();
  const running = nextRunning_(codes, g.code4);
  return { code: buildPartCode_(g.group, g.usage, g.type, g.key3, g.code4, running),
           running: running, category: g.en, categoryTh: g.th, preview: true };
}

/** ตรวจตัวเลือกกับ Code_Master แล้วคืนส่วนประกอบที่ใช้ประกอบรหัสได้ */
function pickCode_(sel) {
  sel = sel || {};
  const m = getCodeMaster();
  const has = function (list, key) {
    return m[list].filter(function (x) { return x.key === String(key).trim(); })[0];
  };
  const group = has('GROUP', sel.group);
  const type = has('TYPE', sel.type);
  const usage = has('USAGE', sel.usage);
  const cat = m.CATEGORY.filter(function (x) { return x.code4 === String(sel.category || '').trim().toUpperCase(); })[0];
  if (!group) throw new Error('เลือก Item Group Main ก่อน');
  if (!usage) throw new Error('เลือกการใช้งานก่อน');
  if (!type) throw new Error('เลือก Type ก่อน');
  if (!cat) throw new Error('เลือกหมวดชนิดก่อน');
  return { group: group.key, usage: usage.key, type: type.key,
           key3: cat.key, code4: cat.code4, en: cat.en, th: cat.th };
}

/** รหัสอะไหล่ทั้งหมดที่มีในระบบ รวมตัวที่เลิกใช้แล้ว — Running ต้องไม่ย้อนไปชนของเก่า */
function partCodes_() {
  const rows = sheet_(SH.PARTS).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const c = String(rows[i][PT.PART] || '').trim();
    if (c) out.push(c);
  }
  return out;
}

/* ========================================================================== *
 *  2. FIFO ENGINE — ที่เดียวที่สต๊อกถูกตัดออก
 * ========================================================================== */

/**
 * จอง qty ของ partNo จาก batch ที่เก่าที่สุด / หมดอายุก่อน
 * แก้ Qty_Remaining ใน `rows` (ค่าดิบจากชีต Batches_FIFO) — ผู้เรียกเขียนคอลัมน์
 * กลับทีเดียว และ throw ก่อนแตะอะไรเลยถ้าของไม่พอ
 *
 * @param {Array[]} rows          ค่าดิบจากชีต, row 0 = header
 * @param {boolean} allowExpired  true สำหรับนับสต๊อก/ตัดจำหน่าย, false สำหรับเบิก
 * @return {{picks:{batchId:string,qty:number,unitCost:number}[], cost:number}}
 */
function drawFifo_(rows, partNo, qty, allowExpired) {
  const today = today_();
  const pool = [];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][B.PART]).trim() !== partNo) continue;
    const left = Number(rows[i][B.QTY_LEFT]) || 0;
    if (left <= 0) continue;                                  // หมดแล้ว
    const exp = rows[i][B.EXPIRY] instanceof Date ? rows[i][B.EXPIRY] : null;
    if (!allowExpired && exp && exp < today) continue;        // หมดอายุ: ต้องตัดจำหน่าย ไม่ใช่เบิกไปใช้
    pool.push({ i: i, left: left, exp: exp,
                rec: rows[i][B.RECEIVED] instanceof Date ? rows[i][B.RECEIVED] : new Date(0) });
  }

  // มีวันหมดอายุ → ใกล้หมดก่อน (FEFO); ที่เหลือ → เข้าก่อนออกก่อน (FIFO)
  pool.sort(function (a, b) {
    const ax = a.exp ? a.exp.getTime() : 8e15;   // ไม่มีวันหมดอายุ => หยิบท้ายสุด
    const bx = b.exp ? b.exp.getTime() : 8e15;
    return ax - bx || a.rec - b.rec;
  });

  const available = pool.reduce(function (s, c) { return s + c.left; }, 0);
  if (available < qty) {
    throw new Error('อะไหล่ ' + partNo + ' ไม่พอ: ต้องการ ' + qty + ' มี ' + available +
                    (allowExpired ? '' : ' (ไม่นับ batch ที่หมดอายุ — ตัดจำหน่ายก่อน)'));
  }

  let need = qty, cost = 0;
  const picks = [];
  for (let k = 0; k < pool.length && need > 0; k++) {
    const c = pool[k];
    const take = Math.min(need, c.left);
    const unitCost = Number(rows[c.i][B.COST]) || 0;
    rows[c.i][B.QTY_LEFT] = c.left - take;
    picks.push({ batchId: String(rows[c.i][B.ID]), qty: take, unitCost: unitCost });
    cost += take * unitCost;
    need -= take;
  }
  return { picks: picks, cost: round2_(cost) };
}

function saveBatchQty_(sh, rows) {
  if (rows.length < 2) return;
  const col = rows.slice(1).map(function (r) { return [r[B.QTY_LEFT]]; });
  sh.getRange(2, B.QTY_LEFT + 1, col.length, 1).setValues(col);
}

function picksLabel_(picks) {
  return picks.map(function (p) { return p.batchId + ' x' + p.qty; }).join(' | ');
}

/** "B1 x2 | B2 x1" -> [{batchId:'B1',qty:2},{batchId:'B2',qty:1}] */
function parsePicks_(label) {
  return String(label || '').split('|').map(function (part) {
    const m = part.trim().match(/^(.+)\sx(\d+(?:\.\d+)?)$/);
    return m ? { batchId: m[1].trim(), qty: Number(m[2]) } : null;
  }).filter(Boolean);
}

/**
 * คืนของเข้า batch เดิมที่มันออกไป (คืนอะไหล่ที่เบิกเกิน)
 * ไล่จาก pick ล่าสุดก่อน เพื่อให้การคืนบางส่วนย้อน batch ที่หยิบท้ายสุด
 * @return {number} ต้นทุนที่คืนกลับเข้าคลัง
 */
function returnToBatches_(rows, label, qty) {
  const picks = parsePicks_(label).reverse();
  const index = {};
  for (let i = 1; i < rows.length; i++) index[String(rows[i][B.ID])] = i;

  let left = qty, cost = 0;
  for (let k = 0; k < picks.length && left > 0; k++) {
    const i = index[picks[k].batchId];
    if (i === undefined) continue;                     // แถว batch ถูกลบไปแล้ว — ข้าม
    const back = Math.min(left, picks[k].qty);
    rows[i][B.QTY_LEFT] = (Number(rows[i][B.QTY_LEFT]) || 0) + back;
    cost += back * (Number(rows[i][B.COST]) || 0);
    left -= back;
  }
  if (left > 0) throw new Error('คืนไม่ได้อีก ' + left + ' หน่วย: แถว batch ต้นทางหายไปแล้ว');
  return round2_(cost);
}

/** ต้นทุนล่าสุดที่รู้ของอะไหล่ตัวนี้ (ใช้ตอนนับสต๊อกเจอของเกิน และตอนตั้ง PO) */
function lastCost_(bRows, partNo, fallback) {
  let cost = fallback || 0, newest = -1;
  for (let i = 1; i < bRows.length; i++) {
    if (String(bRows[i][B.PART]).trim() !== partNo) continue;
    const t = bRows[i][B.RECEIVED] instanceof Date ? bRows[i][B.RECEIVED].getTime() : 0;
    if (t >= newest) { newest = t; cost = Number(bRows[i][B.COST]) || cost; }
  }
  return cost;
}

/* ========================================================================== *
 *  LEDGERS — Stock_Moves (ทุกการเคลื่อนไหว) + Audit_Logs (ค่าที่ถูกแก้เงียบ ๆ)
 * ========================================================================== */

function logMove_(type, partNo, qtyChange, batchIds, value, reason, ref) {
  appendRows_(sheet_(SH.MOVES),
    [[new Date(), id_('M'), type, partNo, qtyChange, batchIds, round2_(value), reason, user_(),
      String(ref || '')]]);
}

function cellText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return ymd_(v);
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  return String(v).trim();
}

/** เทียบสองแถว คืนเฉพาะช่องที่เปลี่ยนจริง ("45" กับ 45 ไม่ใช่การเปลี่ยน) */
function rowDiff_(oldRow, newRow, labels) {
  const out = [];
  for (let i = 0; i < newRow.length; i++) {
    const a = cellText_(oldRow[i]), b = cellText_(newRow[i]);
    if (a !== b) out.push([labels[i] || ('col' + (i + 1)), a, b]);
  }
  return out;
}

function auditSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SH.AUDIT);
  if (!sh) {
    sh = ss.insertSheet(SH.AUDIT);
    sh.getRange(1, 1, 1, 7)
      .setValues([['Timestamp', 'User', 'Action', 'Target', 'Field', 'Old_Value', 'New_Value']])
      .setFontWeight('bold').setBackground('#f1f5f9');
    sh.setFrozenRows(1);
  }
  return sh;
}

function logAudit_(action, target, changes) {
  try {
    if (!changes || !changes.length) return;
    const ts = new Date(), who = user_();
    appendRows_(auditSheet_(), changes.map(function (c) {
      return [ts, who, action, target, c[0], c[1], c[2]];
    }));
  } catch (e) { /* audit ที่พังต้องไม่ย้อนการแก้ที่ผู้ใช้ทำสำเร็จแล้ว */ }
}

function getAuditLog(limit) {
  requireRole_('ENG');
  const sh = ss_().getSheetByName(SH.AUDIT);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = Math.min(limit || 60, sh.getLastRow() - 1);
  const rows = sh.getRange(sh.getLastRow() - n + 1, 1, n, 7).getValues();
  return rows.reverse().map(function (r) {
    return { ts: ymdhm_(r[0]), user: String(r[1]), action: String(r[2]), target: String(r[3]),
             field: String(r[4]), from: cellText_(r[5]), to: cellText_(r[6]) };
  });
}

/* ========================================================================== *
 *  3. CATALOG + BOOTSTRAP
 * ========================================================================== */

function getCatalog() {
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  if (cache) {
    const hit = cache.get(CATALOG_KEY);
    if (hit) { try { return maskCost_(JSON.parse(hit)); } catch (e) { /* เสีย ก็สร้างใหม่ */ } }
  }
  const data = buildCatalog_();
  if (cache) {
    const json = JSON.stringify(data);
    if (json.length < CACHE_MAX_BYTES) { try { cache.put(CATALOG_KEY, json, CATALOG_TTL); } catch (e) {} }
  }
  return maskCost_(data);
}

/**
 * ช่างเห็นจำนวนคงเหลือ ไม่เห็นต้นทุน — เว้นแต่ตั้ง SHOW_COST_TO_TECH = 1
 * ตัดที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนใน UI: ตัวเลขที่ไม่ได้ส่งออกไป อ่านจาก DevTools ไม่ได้
 */
function maskCost_(cat) {
  if (hasRole_('LEAD') || getSettings().SHOW_COST_TO_TECH === '1') return cat;
  cat.parts.forEach(function (p) { p.cost = 0; p.value = 0; });
  cat.batches.forEach(function (b) { b.cost = 0; });
  cat.costHidden = true;
  return cat;
}

function buildCatalog_() {
  const cfg = getSettings();
  const pRows = sheet_(SH.PARTS).getDataRange().getValues();
  const bRows = sheet_(SH.BATCHES).getDataRange().getValues();
  const today = today_();
  const warnDays = Number(cfg.EXPIRY_WARN_DAYS) || 30;
  const warn = new Date(today.getTime() + warnDays * 864e5);

  const stock = {}, usable = {}, nearest = {}, value = {};
  const batches = [];
  for (let i = 1; i < bRows.length; i++) {
    const r = bRows[i];
    const part = String(r[B.PART]).trim();
    if (!part) continue;
    const left = Number(r[B.QTY_LEFT]) || 0;
    const exp = r[B.EXPIRY] instanceof Date ? r[B.EXPIRY] : null;
    const expired = !!(exp && exp < today);

    stock[part] = (stock[part] || 0) + left;
    value[part] = (value[part] || 0) + left * (Number(r[B.COST]) || 0);
    if (!expired) usable[part] = (usable[part] || 0) + left;
    if (left > 0 && exp && (!nearest[part] || exp < nearest[part])) nearest[part] = exp;

    if (left > 0) batches.push({
      id: String(r[B.ID]), part: part,
      received: ymd_(r[B.RECEIVED]), expiry: ymd_(exp),
      qtyIn: Number(r[B.QTY_IN]) || 0, left: left, cost: Number(r[B.COST]) || 0,
      supplier: String(r[B.SUPPLIER] || ''), ref: String(r[B.REF] || ''),
      status: expired ? 'EXPIRED' : (exp && exp <= warn ? 'SOON' : 'OK')
    });
  }
  batches.sort(function (a, b) { return (a.expiry || '9999').localeCompare(b.expiry || '9999'); });

  const parts = [];
  for (let i = 1; i < pRows.length; i++) {
    const r = pRows[i];
    const part = String(r[PT.PART]).trim();
    if (!part || r[PT.ACTIVE] === false) continue;
    const qty = stock[part] || 0;
    const min = Number(r[PT.MIN]) || 0;
    parts.push({
      part: part, name: String(r[PT.NAME]), category: String(r[PT.CAT] || 'อื่น ๆ'),
      unit: String(r[PT.UNIT] || 'ชิ้น'), location: String(r[PT.LOC] || ''),
      cost: Number(r[PT.COST]) || 0, min: min, max: Number(r[PT.MAX]) || 0,
      moq: Number(r[PT.MOQ]) || 0, level: String(r[PT.LEVEL] || '').trim().toUpperCase(),
      position: String(r[PT.POS] || ''),
      supplier: String(r[PT.SUPPLIER] || ''), machine: String(r[PT.MACHINE] || ''),
      image: String(r[PT.IMAGE] || '').trim(),
      stock: qty, usable: usable[part] || 0, value: round2_(value[part] || 0),
      low: qty <= min, nearestExpiry: ymd_(nearest[part] || '')
    });
  }
  parts.sort(function (a, b) { return a.name.localeCompare(b.name, 'th'); });

  const machines = [];
  const mSh = ss_().getSheetByName(SH.MACHINES);
  if (mSh) {
    const mRows = mSh.getDataRange().getValues();
    for (let i = 1; i < mRows.length; i++) {
      const code = String(mRows[i][MC.CODE]).trim();
      if (!code || mRows[i][MC.ACTIVE] === false) continue;
      machines.push({ code: code, name: String(mRows[i][MC.NAME] || ''), area: String(mRows[i][MC.AREA] || '') });
    }
    machines.sort(function (a, b) { return a.code.localeCompare(b.code); });
  }
  return { parts: parts, batches: batches, machines: machines, dupes: findDupes_(pRows),
           codes: getCodeMaster() };
}

/** หนึ่ง round trip ตอนโหลดหน้า */
function getBoot() {
  const me = refreshSession_();
  return { role: me.role, user: me.email, name: me.name || me.email, photo: me.photo || '',
           settings: getSettings(), catalog: getCatalog() };
}

/* ========================================================================== *
 *  4. เบิกอะไหล่ (ISSUE) — หัวใจของระบบ แทน checkout() ของ POS
 * ========================================================================== */

/**
 * @param {{machine:string, jobNo:string, requester:string, dept:string, note:string,
 *          lines:{part:string, qty:number, note:string}[]}} doc
 *
 * ต้นทุนคิดจาก FIFO ฝั่งเซิร์ฟเวอร์เสมอ เบราว์เซอร์ส่งมาแค่รหัสอะไหล่ จำนวน และปลายทาง
 * ตรวจทุกบรรทัดให้ครบก่อนเขียน — ถ้ามีบรรทัดใดของไม่พอ จะไม่เขียนอะไรเลย
 *
 * ผู้เบิก: ช่าง (TECH) เบิกได้ในชื่อตัวเองเท่านั้น — ชื่อมาจาก session ไม่ใช่จากฟอร์ม
 * เจ้าหน้าที่คลังขึ้นไปจ่ายของแทนคนอื่นได้ และชื่อคนที่มารับถูกบันทึกแยกจากคนคีย์
 */
function issue(doc) {
  requireRole_('TECH');
  return lock_(function () {
    if (!doc || !doc.lines || !doc.lines.length) throw new Error('ไม่มีรายการเบิก');

    const cfg = getSettings();
    const machine  = String(doc.machine || '').trim();
    const jobNo    = String(doc.jobNo || '').trim();
    const dept     = String(doc.dept || '').trim();
    const note     = String(doc.note || '').trim();
    const me       = currentUser_();
    const myName   = me.name || me.email;
    // ช่างเบิกในชื่อตัวเองเท่านั้น ส่งชื่อคนอื่นมาก็ถูกเขียนทับที่นี่
    const requester = hasRole_('LEAD') ? (String(doc.requester || '').trim() || myName) : myName;

    // กดยืนยันซ้ำเพราะเน็ตหลุด: ตะกร้าเดิมมี ref เดิม คืนใบเบิกที่บันทึกไปแล้ว ไม่ตัดสต๊อกอีกรอบ
    const clientRef = String(doc.ref || '').trim();
    const already = doneBefore_(clientRef);
    if (already) return { duplicate: true, issueId: already };

    if (!machine) throw new Error('ต้องระบุเครื่องจักร / หน่วยงานที่เบิกไปใช้');
    if (cfg.REQUIRE_JOB_NO === '1' && !jobNo) throw new Error('ต้องระบุเลขที่ใบแจ้งซ่อม (Job No.)');

    const pRows = sheet_(SH.PARTS).getDataRange().getValues();
    const info = {};
    for (let i = 1; i < pRows.length; i++) {
      const p = String(pRows[i][PT.PART]).trim();
      if (p && pRows[i][PT.ACTIVE] !== false) {
        info[p] = { name: String(pRows[i][PT.NAME]), unit: String(pRows[i][PT.UNIT] || 'ชิ้น') };
      }
    }

    const bSheet = sheet_(SH.BATCHES), bRows = bSheet.getDataRange().getValues();
    const issueId = id_('IS');
    const ts = new Date();
    const rows = [], moves = [], out = [];
    let total = 0;
    const seen = {};

    doc.lines.forEach(function (l) {
      const part = String(l.part || '').trim();
      const qty = Number(l.qty);
      if (!info[part]) throw new Error('ไม่พบอะไหล่: ' + part);
      if (!(qty > 0)) throw new Error('จำนวนต้องมากกว่า 0: ' + part);
      if (seen[part]) throw new Error('อะไหล่ซ้ำในใบเบิกเดียวกัน: ' + part);
      seen[part] = true;

      const draw = drawFifo_(bRows, part, qty, false);
      const label = picksLabel_(draw.picks);
      const unitCost = round2_(draw.cost / qty);

      rows.push([ts, issueId, 'ISSUE', part, info[part].name, qty, unitCost, round2_(draw.cost),
                 label, machine, jobNo, requester, dept, String(l.note || ''), me.email, clientRef]);
      moves.push({ part: part, qty: qty, label: label, cost: draw.cost });
      out.push({ part: part, name: info[part].name, unit: info[part].unit, qty: qty,
                 unitCost: unitCost, value: round2_(draw.cost), batches: label });
      total += draw.cost;
    });

    // ผ่านทุกบรรทัดแล้วจึงเขียน
    appendRows_(sheet_(SH.ISSUES), rows);
    saveBatchQty_(bSheet, bRows);
    moves.forEach(function (m) {
      logMove_('ISSUE', m.part, -m.qty, m.label, -m.cost, machine + (jobNo ? ' / ' + jobNo : ''), issueId);
    });
    rememberDone_(clientRef, issueId, 'ISSUE');
    SpreadsheetApp.flush();

    const showCost = hasRole_('LEAD') || cfg.SHOW_COST_TO_TECH === '1';
    if (!showCost) out.forEach(function (o) { o.unitCost = 0; o.value = 0; });
    return { issueId: issueId, ts: ymdhm_(ts), machine: machine, jobNo: jobNo, dept: dept,
             requester: requester, note: note, user: me.email, costHidden: !showCost,
             lines: out, total: showCost ? round2_(total) : 0 };
  });
}

/** ประวัติการเบิกล่าสุด (ใช้ในหน้ารายงาน และเป็นจุดเริ่มของการคืนของ) */
function getIssues(limit) {
  const sh = sheet_(SH.ISSUES);
  if (sh.getLastRow() < 2) return [];
  const want = Math.min(limit || 40, 400);
  const rows = sh.getDataRange().getValues();
  const mine = !hasRole_('LEAD') ? String(currentUser_().email).toLowerCase() : '';
  const byId = {}, order = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    const id = String(rows[i][IS.ID]);
    if (!id) continue;
    // ช่างเห็นใบเบิกของตัวเอง เจ้าหน้าที่คลังเห็นทั้งหมด
    if (mine && String(rows[i][IS.USER]).toLowerCase() !== mine) continue;
    if (!byId[id]) {
      if (order.length >= want) continue;
      byId[id] = { issueId: id, ts: ymdhm_(rows[i][IS.TS]), machine: String(rows[i][IS.MACHINE] || ''),
                   jobNo: String(rows[i][IS.JOB] || ''), requester: String(rows[i][IS.REQUESTER] || ''),
                   dept: String(rows[i][IS.DEPT] || ''), lines: 0, qty: 0, value: 0, returned: 0 };
      order.push(id);
    }
    const qty = Number(rows[i][IS.QTY]) || 0;
    if (String(rows[i][IS.TYPE]) === 'RETURN') byId[id].returned += -qty;
    else { byId[id].lines++; byId[id].qty += qty; }
    byId[id].value += Number(rows[i][IS.VALUE]) || 0;
  }
  const showCost = hasRole_('LEAD') || getSettings().SHOW_COST_TO_TECH === '1';
  return order.map(function (id) {
    byId[id].value = showCost ? round2_(byId[id].value) : 0;
    return byId[id];
  });
}

/**
 * ใบเบิกหนึ่งใบ พร้อมจำนวนที่ยังคืนได้ = เบิกไป − ที่คืนแล้ว
 * batch label ถูกเก็บไว้ตั้งแต่ตอนเบิก การคืนจึงกลับเข้า batch เดิมเป๊ะ ๆ
 */
function findIssue(issueId) {
  issueId = String(issueId || '').trim();
  if (!issueId) throw new Error('ระบุเลขที่ใบเบิก');
  const rows = sheet_(SH.ISSUES).getDataRange().getValues();
  const head = {};
  const byPart = {}, order = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][IS.ID]) !== issueId) continue;
    if (!head.issueId) {
      head.issueId = issueId; head.ts = ymdhm_(rows[i][IS.TS]);
      head.machine = String(rows[i][IS.MACHINE] || ''); head.jobNo = String(rows[i][IS.JOB] || '');
      head.requester = String(rows[i][IS.REQUESTER] || ''); head.dept = String(rows[i][IS.DEPT] || '');
      head.user = String(rows[i][IS.USER] || '');
    }
    const part = String(rows[i][IS.PART]).trim();
    if (!byPart[part]) {
      byPart[part] = { part: part, name: String(rows[i][IS.NAME]), qty: 0, returnedQty: 0,
                       value: 0, batches: '' };
      order.push(part);
    }
    const qty = Number(rows[i][IS.QTY]) || 0;
    if (String(rows[i][IS.TYPE]) === 'RETURN') byPart[part].returnedQty += -qty;
    else {
      byPart[part].qty += qty;
      byPart[part].value += Number(rows[i][IS.VALUE]) || 0;
      byPart[part].batches = String(rows[i][IS.BATCHES] || '');
    }
  }
  if (!head.issueId) throw new Error('ไม่พบใบเบิก: ' + issueId);
  if (!hasRole_('LEAD') && String(head.user).toLowerCase() !== String(currentUser_().email).toLowerCase()) {
    throw new Error('ดูได้เฉพาะใบเบิกของตัวเอง');
  }
  const showCost = hasRole_('LEAD') || getSettings().SHOW_COST_TO_TECH === '1';
  head.lines = order.map(function (p) {
    const l = byPart[p];
    l.value = showCost ? round2_(l.value) : 0;
    l.returnable = l.qty - l.returnedQty;
    l.returnQty = 0;
    return l;
  });
  return head;
}

/**
 * คืนอะไหล่ที่เบิกไปแล้วแต่ไม่ได้ใช้ — เข้า batch เดิม
 * @param {{part:string, qty:number}[]} lines
 */
function returnParts(issueId, lines, reason) {
  requireRole_('TECH');
  return lock_(function () {
    const src = findIssue(issueId);          // ตรวจสิทธิ์ให้แล้วในตัว
    const want = (lines || []).filter(function (l) { return Number(l.qty) > 0; });
    if (!want.length) throw new Error('ไม่มีรายการที่จะคืน');

    const bSheet = sheet_(SH.BATCHES), bRows = bSheet.getDataRange().getValues();
    const ts = new Date();
    const me = currentUser_();
    const retId = id_('RT');
    const rows = [], moves = [];
    let total = 0;

    want.forEach(function (w) {
      const part = String(w.part).trim();
      const qty = Number(w.qty);
      const line = src.lines.filter(function (l) { return l.part === part; })[0];
      if (!line) throw new Error('อะไหล่ ' + part + ' ไม่ได้อยู่ในใบเบิกนี้');
      if (qty > line.returnable) {
        throw new Error('คืน ' + part + ' ได้ไม่เกิน ' + line.returnable + ' หน่วย');
      }
      const cost = returnToBatches_(bRows, line.batches, qty);
      rows.push([ts, issueId, 'RETURN', part, line.name, -qty, round2_(cost / qty), round2_(-cost),
                 line.batches, src.machine, src.jobNo, src.requester, src.dept,
                 String(reason || 'คืนของ'), me.email, retId]);
      moves.push({ part: part, qty: qty, label: line.batches, cost: cost });
      total += cost;
    });

    appendRows_(sheet_(SH.ISSUES), rows);
    saveBatchQty_(bSheet, bRows);
    moves.forEach(function (m) {
      logMove_('RETURN', m.part, m.qty, m.label, m.cost, 'คืนจากใบเบิก ' + issueId, retId);
    });
    SpreadsheetApp.flush();
    return { returnId: retId, issueId: issueId, lines: want.length,
             value: hasRole_('LEAD') ? round2_(total) : 0 };
  });
}

/* ========================================================================== *
 *  5. รับเข้า + สั่งซื้อ (PO)
 * ========================================================================== */

/**
 * @param {{supplier:string, poId:string, invoice:string,
 *          lines:{part,qty,unitCost,expiry}[]}} doc
 */
function receive(doc) {
  requireRole_('LEAD');
  return lock_(function () {
    if (!doc || !doc.lines || !doc.lines.length) throw new Error('ไม่มีรายการรับเข้า');

    // กดซ้ำเพราะเน็ตหลุด — ฟอร์มเดิมมี ref เดิม
    const clientRef = String(doc.ref || '').trim();
    const already = doneBefore_(clientRef);
    if (already) return { duplicate: true, grn: already };

    /* รับบิลใบเดิมซ้ำ — ความผิดพลาดที่แพงที่สุดในคลังอะไหล่ เพราะสต๊อกเบิ้ลแบบเงียบ ๆ
       ไม่ห้ามตาย: ของอีกล็อตที่ใช้เลขบิลเดิมมีจริง จึงให้ยืนยันทับได้ด้วย force */
    const invoice = String(doc.invoice || '').trim();
    if (invoice && !doc.force) {
      const bRowsAll = sheet_(SH.BATCHES).getDataRange().getValues();
      for (let i = 1; i < bRowsAll.length; i++) {
        if (String(bRowsAll[i][B.REF]).trim().toLowerCase() === invoice.toLowerCase()) {
          throw new Error('DUP_INVOICE: บิลเลขที่ ' + invoice + ' เคยรับเข้าไปแล้ว (batch ' +
                          String(bRowsAll[i][B.ID]) + ' วันที่ ' + ymd_(bRowsAll[i][B.RECEIVED]) + ')');
        }
      }
    }

    const pRows = sheet_(SH.PARTS).getDataRange().getValues();
    const known = {};
    for (let i = 1; i < pRows.length; i++) known[String(pRows[i][PT.PART]).trim()] = String(pRows[i][PT.NAME]);

    const grn = id_('GRN');
    const ts = new Date();
    const batchRows = [], moves = [];
    let totalCost = 0;

    doc.lines.forEach(function (l, n) {
      const part = String(l.part).trim();
      const qty = Number(l.qty);
      const unitCost = Number(l.unitCost) || 0;
      if (!known[part]) throw new Error('ไม่พบอะไหล่: ' + part);
      if (!(qty > 0)) throw new Error('จำนวนต้องมากกว่า 0: ' + part);
      if (unitCost < 0) throw new Error('ต้นทุนติดลบไม่ได้: ' + part);

      const batchId = 'B' + Utilities.formatDate(ts, tz_(), 'yyMMddHHmmss') + '-' + (n + 1);
      batchRows.push([batchId, part, ts, parseDate_(l.expiry), qty, qty, unitCost,
                      doc.supplier || '', invoice || doc.poId || grn]);
      totalCost += qty * unitCost;
      moves.push({ part: part, qty: qty, batchId: batchId, value: qty * unitCost });
    });

    appendRows_(sheet_(SH.BATCHES), batchRows);
    moves.forEach(function (m) {
      logMove_('RECEIVE', m.part, m.qty, m.batchId, m.value,
               (doc.supplier || 'ผู้ขาย') + (invoice ? ' / ' + invoice : ''), grn);
    });
    if (doc.poId) closePo_(doc.poId);
    rememberDone_(clientRef, grn, 'RECEIVE');
    SpreadsheetApp.flush();
    return { grn: grn, batches: batchRows.length, totalCost: round2_(totalCost) };
  });
}

/** เสนอสั่งซื้อจากของที่ถึงจุดสั่งซื้อ: เติมขึ้นไปถึง Max (ไม่ตั้ง Max ก็ใช้ 2 × Min) */
function generatePO() {
  requireRole_('LEAD');
  return lock_(function () {
    const low = buildCatalog_().parts.filter(function (p) { return p.low; });
    if (!low.length) return { poId: null, lines: [] };

    const poId = id_('PO');
    const ts = new Date();
    const lines = low.map(function (p) {
      const qty = reorderQty_(p.stock, p.min, p.max, p.moq);
      return { part: p.part, name: p.name, supplier: p.supplier, qty: qty,
               unitCost: p.cost, est: round2_(qty * p.cost), stock: p.stock,
               min: p.min, max: p.max, moq: p.moq };
    });
    appendRows_(sheet_(SH.PO), lines.map(function (l) {
      return [ts, poId, l.part, l.name, l.supplier, l.qty, l.unitCost, l.est, 'OPEN'];
    }));
    SpreadsheetApp.flush();
    return { poId: poId, lines: lines };
  });
}

function getOpenPOs() {
  requireRole_('LEAD');
  const rows = sheet_(SH.PO).getDataRange().getValues();
  const out = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][PO.STATUS]) !== 'OPEN') continue;
    out.push({ poId: String(rows[i][PO.ID]), part: String(rows[i][PO.PART]), name: String(rows[i][PO.NAME]),
               supplier: String(rows[i][PO.SUPPLIER]), qty: Number(rows[i][PO.QTY]) || 0,
               unitCost: Number(rows[i][PO.COST]) || 0, est: Number(rows[i][PO.EST]) || 0 });
  }
  return out;
}

function cancelPO(poId) {
  requireRole_('LEAD');
  setPoStatus_(poId, 'CANCELLED');
  return true;
}

function closePo_(poId) { setPoStatus_(poId, 'RECEIVED'); }

function setPoStatus_(poId, status) {
  const sh = sheet_(SH.PO);
  const rows = sh.getDataRange().getValues();
  const col = [];
  for (let i = 1; i < rows.length; i++) {
    col.push([String(rows[i][PO.ID]) === poId ? status : rows[i][PO.STATUS]]);
  }
  if (col.length) sh.getRange(2, PO.STATUS + 1, col.length, 1).setValues(col);
}

/* ========================================================================== *
 *  6. นับสต๊อก / ตัดจำหน่าย
 * ========================================================================== */

/** @param {{part:string, physical:number, note:string}[]} counts */
function auditStock(counts) {
  requireRole_('LEAD');
  return lock_(function () {
    if (!counts || !counts.length) throw new Error('ยังไม่ได้นับอะไรเลย');

    const pRows = sheet_(SH.PARTS).getDataRange().getValues();
    const defCost = {};
    for (let i = 1; i < pRows.length; i++) defCost[String(pRows[i][PT.PART]).trim()] = Number(pRows[i][PT.COST]) || 0;

    const bSheet = sheet_(SH.BATCHES), bRows = bSheet.getDataRange().getValues();
    const auditId = id_('AUD');
    const ts = new Date();
    const newBatches = [], result = [];

    counts.forEach(function (c) {
      const part = String(c.part).trim();
      const physical = Number(c.physical);
      if (defCost[part] === undefined) throw new Error('ไม่พบอะไหล่: ' + part);
      if (!(physical >= 0)) throw new Error('จำนวนที่นับได้ต้อง >= 0: ' + part);

      let system = 0;
      for (let i = 1; i < bRows.length; i++) {
        if (String(bRows[i][B.PART]).trim() === part) system += Number(bRows[i][B.QTY_LEFT]) || 0;
      }
      const variance = physical - system;
      const cost = lastCost_(bRows, part, defCost[part]);
      let batchIds = '';

      if (variance < 0) {
        batchIds = picksLabel_(drawFifo_(bRows, part, -variance, true).picks);   // ของขาด ตัดจาก batch เก่าสุด
      } else if (variance > 0) {
        const batchId = 'B' + Utilities.formatDate(ts, tz_(), 'yyMMddHHmmss') + '-A' + (newBatches.length + 1);
        newBatches.push([batchId, part, ts, '', variance, variance, cost, 'นับสต๊อก', auditId]);
        batchIds = batchId;
      }
      if (variance !== 0) logMove_('ADJUST', part, variance, batchIds, variance * cost, c.note || 'นับสต๊อก', auditId);
      result.push({ part: part, system: system, physical: physical, variance: variance,
                    value: round2_(variance * cost) });
    });

    saveBatchQty_(bSheet, bRows);
    appendRows_(bSheet, newBatches);
    SpreadsheetApp.flush();
    return { auditId: auditId, lines: result,
             netValue: round2_(result.reduce(function (s, l) { return s + l.value; }, 0)) };
  });
}

/** ตัดจำหน่าย: ชำรุด / หมดอายุ / สูญหาย  @param {{part,qty,reason}[]} lines */
function scrap(lines, ref) {
  requireRole_('LEAD');
  return lock_(function () {
    if (!lines || !lines.length) throw new Error('ไม่มีรายการตัดจำหน่าย');

    const already = doneBefore_(ref);
    if (already) return { duplicate: true, scrapId: already };

    const bSheet = sheet_(SH.BATCHES), bRows = bSheet.getDataRange().getValues();
    const scrapId = id_('SC');
    let loss = 0;
    const detail = [];

    lines.forEach(function (l) {
      const part = String(l.part).trim();
      const qty = Number(l.qty);
      const reason = String(l.reason || '').trim();
      if (!(qty > 0)) throw new Error('จำนวนต้องมากกว่า 0: ' + part);
      if (!reason) throw new Error('ต้องระบุสาเหตุที่ตัดจำหน่าย: ' + part);
      const draw = drawFifo_(bRows, part, qty, true);     // ของหมดอายุคือสิ่งที่เราตั้งใจจะเอาออก
      loss += draw.cost;
      detail.push({ part: part, qty: qty, cost: draw.cost, reason: reason, batches: picksLabel_(draw.picks) });
    });

    saveBatchQty_(bSheet, bRows);
    detail.forEach(function (d) { logMove_('SCRAP', d.part, -d.qty, d.batches, -d.cost, d.reason, scrapId); });
    rememberDone_(ref, scrapId, 'SCRAP');
    SpreadsheetApp.flush();
    return { scrapId: scrapId, loss: round2_(loss), lines: detail };
  });
}

/* ========================================================================== *
 *  7. บัตรสต๊อก (Stock Card) + รายงาน
 * ========================================================================== */

/**
 * บัตรสต๊อกของอะไหล่หนึ่งตัว: ยกมา → รับ/จ่ายทีละรายการ → คงเหลือวิ่ง
 * อ่านจาก Stock_Moves ซึ่งบันทึกทุกการเคลื่อนไหวไว้หมดแล้ว ไม่ต้องมีตารางใหม่
 *
 * `closing` (คงเหลือตามบัตร) ต้องเท่ากับ `onHand` (ผลรวม batch จริง) ถ้าไม่เท่า
 * แปลว่ามีคนแก้จำนวนในชีตด้วยมือ — ตัวเลข mismatch จึงถูกส่งกลับไปให้เห็น
 * ไม่ใช่ซ่อนไว้ นี่คือประโยชน์หลักของบัตรสต๊อกในงานตรวจสอบ
 */
function getStockCard(partNo, fromStr, toStr) {
  requireRole_('TECH');
  partNo = String(partNo || '').trim();
  if (!partNo) throw new Error('ระบุรหัสอะไหล่');

  const p = buildCatalog_().parts.filter(function (x) { return x.part === partNo; })[0];
  const from = parseDate_(fromStr) || new Date(today_().getTime() - 89 * 864e5);
  const to = parseDate_(toStr) || today_();
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const rows = sheet_(SH.MOVES).getDataRange().getValues();
  const before = [], inRange = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][MV.PART]).trim() !== partNo) continue;
    const ts = rows[i][MV.TS];
    if (!(ts instanceof Date)) continue;
    if (ts < from) before.push(rows[i]); else if (ts <= to) inRange.push(rows[i]);
  }
  inRange.sort(function (a, b) { return a[MV.TS] - b[MV.TS]; });

  const opening = before.reduce(function (s, r) { return s + (Number(r[MV.QTY]) || 0); }, 0);
  let balance = opening;
  const showCost = hasRole_('LEAD') || getSettings().SHOW_COST_TO_TECH === '1';

  const lines = inRange.map(function (r) {
    const qty = Number(r[MV.QTY]) || 0;
    balance += qty;
    return {
      ts: ymdhm_(r[MV.TS]), type: String(r[MV.TYPE]),
      doc: String(r[MV.DOC] || ''), reason: String(r[MV.REASON] || ''),
      inQty: qty > 0 ? qty : 0, outQty: qty < 0 ? -qty : 0, balance: round2_(balance),
      batches: String(r[MV.BATCHES] || ''), user: String(r[MV.USER] || ''),
      value: showCost ? round2_(Number(r[MV.VALUE]) || 0) : 0
    };
  });

  const onHand = p ? p.stock : 0;
  return {
    part: partNo, name: p ? p.name : '(ไม่พบในตารางอะไหล่)', unit: p ? p.unit : '',
    location: p ? p.location : '', min: p ? p.min : 0, max: p ? p.max : 0, moq: p ? p.moq : 0,
    image: p ? p.image : '', machine: p ? p.machine : '', level: p ? p.level : '',
    from: ymd_(from), to: ymd_(to), costHidden: !showCost,
    opening: round2_(opening), closing: round2_(balance), onHand: onHand,
    ok: Math.abs(round2_(balance) - onHand) < 0.001,
    inTotal: round2_(lines.reduce(function (s, l) { return s + l.inQty; }, 0)),
    outTotal: round2_(lines.reduce(function (s, l) { return s + l.outQty; }, 0)),
    lines: lines
  };
}

/**
 * ทุกอย่างที่หน้ารายงานต้องใช้ ในหนึ่ง round trip:
 * การเบิกในช่วงเวลา แยกตามอะไหล่ / เครื่องจักร / ผู้เบิก, ของเข้า, ของตัดจำหน่าย,
 * และ "ของนอน" (มีของแต่ไม่มีการเบิกเกิน DEAD_STOCK_DAYS วัน)
 */
function getReport(fromStr, toStr) {
  requireRole_('LEAD');
  const cfg = getSettings();
  const from = parseDate_(fromStr) || new Date(today_().getTime() - 29 * 864e5);
  const to = parseDate_(toStr) || today_();
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const iRows = sheet_(SH.ISSUES).getDataRange().getValues();
  const byPart = {}, byMachine = {}, byUser = {}, series = {};
  const lastIssue = {};
  let issueValue = 0, issueLines = 0, returnValue = 0, returnLines = 0;

  for (let i = 1; i < iRows.length; i++) {
    const ts = iRows[i][IS.TS];
    if (!(ts instanceof Date)) continue;
    const part = String(iRows[i][IS.PART]).trim();
    const isReturn = String(iRows[i][IS.TYPE]) === 'RETURN';
    if (!isReturn && (!lastIssue[part] || ts > lastIssue[part])) lastIssue[part] = ts;   // ตลอดกาล ไม่ใช่แค่ในช่วง
    if (ts < from || ts > to) continue;

    const qty = Number(iRows[i][IS.QTY]) || 0;
    const value = Number(iRows[i][IS.VALUE]) || 0;
    const day = ymd_(ts);
    const machine = String(iRows[i][IS.MACHINE] || '—');
    const who = String(iRows[i][IS.REQUESTER] || iRows[i][IS.USER] || '—');

    if (isReturn) { returnValue += -value; returnLines++; } else { issueValue += value; issueLines++; }

    if (!byPart[part]) byPart[part] = { part: part, name: String(iRows[i][IS.NAME]), qty: 0, value: 0 };
    byPart[part].qty += qty; byPart[part].value += value;

    if (!byMachine[machine]) byMachine[machine] = { machine: machine, qty: 0, value: 0, jobs: {} };
    byMachine[machine].qty += qty; byMachine[machine].value += value;
    const job = String(iRows[i][IS.JOB] || '').trim();
    if (job) byMachine[machine].jobs[job] = true;

    if (!byUser[who]) byUser[who] = { user: who, qty: 0, value: 0 };
    byUser[who].qty += qty; byUser[who].value += value;

    series[day] = round2_((series[day] || 0) + value);
  }

  const mRows = sheet_(SH.MOVES).getDataRange().getValues();
  let recvValue = 0, recvLines = 0, scrapValue = 0, scrapLines = 0, adjustValue = 0;
  for (let i = 1; i < mRows.length; i++) {
    const ts = mRows[i][MV.TS];
    if (!(ts instanceof Date) || ts < from || ts > to) continue;
    const type = String(mRows[i][MV.TYPE]);
    const value = Number(mRows[i][MV.VALUE]) || 0;
    if (type === 'RECEIVE') { recvValue += value; recvLines++; }
    else if (type === 'SCRAP') { scrapValue += -value; scrapLines++; }
    else if (type === 'ADJUST') adjustValue += value;
  }

  const deadDays = Number(cfg.DEAD_STOCK_DAYS) || 180;
  const cutoff = new Date(today_().getTime() - deadDays * 864e5);
  const cat = buildCatalog_();
  const dead = cat.parts
    .filter(function (p) { return p.stock > 0 && (!lastIssue[p.part] || lastIssue[p.part] < cutoff); })
    .map(function (p) {
      return { part: p.part, name: p.name, stock: p.stock, unit: p.unit, value: p.value,
               lastIssue: lastIssue[p.part] ? ymd_(lastIssue[p.part]) : '' };
    })
    .sort(function (a, b) { return b.value - a.value; });

  const sortValue = function (o) {
    return Object.keys(o).map(function (k) { return o[k]; })
      .map(function (x) { x.value = round2_(x.value); if (x.jobs) x.jobs = Object.keys(x.jobs).length; return x; })
      .sort(function (a, b) { return b.value - a.value; });
  };

  return {
    from: ymd_(from), to: ymd_(to), deadDays: deadDays,
    stockValue: round2_(cat.parts.reduce(function (s, p) { return s + p.value; }, 0)),
    issue: { lines: issueLines, value: round2_(issueValue) },
    ret:   { lines: returnLines, value: round2_(returnValue) },
    recv:  { lines: recvLines, value: round2_(recvValue) },
    scrap: { lines: scrapLines, value: round2_(scrapValue) },
    adjustValue: round2_(adjustValue),
    series: Object.keys(series).sort().map(function (d) { return { date: d, value: series[d] }; }),
    byPart: sortValue(byPart), byMachine: sortValue(byMachine), byUser: sortValue(byUser),
    dead: dead
  };
}

/* ========================================================================== *
 *  8. เครื่องมือช่าง — ทะเบียนทรัพย์สิน ไม่ใช่สต๊อก
 *
 *  ต่างจากอะไหล่: เครื่องมือไม่ถูกเบิกแล้วหมดไป มันถูก "มอบหมาย" ให้ทีม/คน
 *  แถวหนึ่ง = เครื่องมือหนึ่งรายการที่อยู่ในมือใครคนหนึ่ง จึงไม่ต้องมี batch
 *  ไม่ต้องมี FIFO และไม่ต้องมีใบเบิก — ของพวกนี้ต้องรู้แค่ "ตอนนี้อยู่กับใคร"
 *  ใครแก้อะไรไปถูกบันทึกใน Audit_Logs อยู่แล้ว
 * ========================================================================== */

const TOOL_STATUS = ['ใช้งาน', 'ชำรุด', 'ส่งซ่อม', 'สูญหาย', 'ปลดระวาง'];

function getTools() {
  requireRole_('TECH');
  const sh = ss_().getSheetByName(SH.TOOLS);
  if (!sh || sh.getLastRow() < 2) return [];
  const rows = sh.getDataRange().getValues();
  const showCost = hasRole_('LEAD');
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][TL.ID] || '').trim();
    if (!id) continue;
    out.push({ id: id, name: String(rows[i][TL.NAME] || ''), qty: Number(rows[i][TL.QTY]) || 0,
               unit: String(rows[i][TL.UNIT] || 'ชิ้น'), team: String(rows[i][TL.TEAM] || ''),
               holder: String(rows[i][TL.HOLDER] || ''), date: ymd_(rows[i][TL.DATE]),
               price: showCost ? (Number(rows[i][TL.PRICE]) || 0) : 0,
               status: String(rows[i][TL.STATUS] || 'ใช้งาน'),
               image: String(rows[i][TL.IMAGE] || ''), note: String(rows[i][TL.NOTE] || '') });
  }
  out.sort(function (a, b) { return a.team.localeCompare(b.team, 'th') || a.name.localeCompare(b.name, 'th'); });
  return out;
}

/** สร้างหรือแก้เครื่องมือ (จับคู่ด้วย Tool_ID — ว่างไว้ระบบออกเลขให้) */
function saveTool(t) {
  requireRole_('LEAD');
  return lock_(function () {
    if (!String(t.name || '').trim()) throw new Error('ต้องมีชื่อเครื่องมือ');
    const status = String(t.status || 'ใช้งาน').trim();
    if (TOOL_STATUS.indexOf(status) < 0) throw new Error('สถานะต้องเป็น: ' + TOOL_STATUS.join(' / '));
    if (Number(t.qty) < 0 || Number(t.price) < 0) throw new Error('จำนวนและราคาติดลบไม่ได้');

    const sh = sheet_(SH.TOOLS);
    const rows = sh.getDataRange().getValues();
    let id = String(t.id || '').trim();
    if (!id) {                          // ออกเลขต่อท้ายใน lock เดียวกับที่เขียน จึงไม่ซ้ำ
      let max = 0;
      for (let i = 1; i < rows.length; i++) {
        const m = /^TL(\d+)$/.exec(String(rows[i][TL.ID] || '').trim());
        if (m && Number(m[1]) > max) max = Number(m[1]);
      }
      id = 'TL' + String(max + 1).padStart(4, '0');
    }
    const row = [id, String(t.name).trim(), Number(t.qty) || 1, String(t.unit || 'ชิ้น'),
                 String(t.team || ''), String(t.holder || ''), parseDate_(t.date),
                 Number(t.price) || 0, status, String(t.image || '').trim(), String(t.note || '')];
    widen_(sh, row.length);
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][TL.ID]).trim() === id) {
        sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        logAudit_('UPDATE_TOOL', id, rowDiff_(rows[i], row, TL_LABELS));
        return getTools();
      }
    }
    appendRows_(sh, [row]);
    logAudit_('CREATE_TOOL', id, [['Name', '', row[TL.NAME]], ['Holder', '', row[TL.HOLDER]]]);
    return getTools();
  });
}

/* ========================================================================== *
 *  9. ใบมีด — ของที่วนกลับมา: ติดตั้ง → ใช้งาน → ถอด → ลับคม → สำรอง
 *
 *  ข้อมูลเดิมเก็บ "History" เป็นข้อความยาว ("22/1/2025 - 30/9/2025 (250 days) …")
 *  ซึ่งคนต้องพิมพ์เองทุกครั้งและบวกวันเอง ที่นี่กลับด้าน: บันทึกแค่ "เกิดอะไรขึ้นวันไหน"
 *  ลง Blade_Log แล้วจำนวนวันคำนวณเอง — อายุใบมีดจึงไม่มีทางคลาดเพราะลืมบวกเลข
 *
 *  ตำแหน่งติดตั้งหนึ่งตำแหน่งมีใบมีดได้ใบเดียว ระบบกันการติดตั้งทับไว้
 * ========================================================================== */

const BLADE_SPARE = 'สำรอง', BLADE_USE = 'ติดตั้งอยู่', BLADE_SHARPEN = 'ส่งลับคม',
      BLADE_NG = 'ใช้ไม่ได้', BLADE_SCRAP = 'ปลดระวาง';
const BLADE_STATUS = [BLADE_SPARE, BLADE_USE, BLADE_SHARPEN, BLADE_NG, BLADE_SCRAP];

function daysBetween_(from, to) {
  if (!(from instanceof Date)) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 864e5));
}

function getBlades() {
  requireRole_('TECH');
  const sh = ss_().getSheetByName(SH.BLADES);
  if (!sh || sh.getLastRow() < 2) return { blades: [], counts: {} };
  const rows = sh.getDataRange().getValues();
  const today = new Date();
  const out = [], counts = {};
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][BL.ID] || '').trim();
    if (!id) continue;
    const install = rows[i][BL.INSTALL] instanceof Date ? rows[i][BL.INSTALL] : null;
    const status = String(rows[i][BL.STATUS] || BLADE_SPARE).trim();
    const running = status === BLADE_USE && install ? daysBetween_(install, today) : 0;
    counts[status] = (counts[status] || 0) + 1;
    out.push({ id: id, spec: String(rows[i][BL.SPEC] || ''), machine: String(rows[i][BL.MACHINE] || ''),
               position: String(rows[i][BL.POS] || ''), status: status,
               install: ymd_(install), runningDays: running,
               days: (Number(rows[i][BL.DAYS]) || 0) + running,
               sharpen: Number(rows[i][BL.SHARPEN]) || 0, last: ymd_(rows[i][BL.LAST]),
               note: String(rows[i][BL.NOTE] || '') });
  }
  out.sort(function (a, b) {
    return BLADE_STATUS.indexOf(a.status) - BLADE_STATUS.indexOf(b.status) ||
           a.machine.localeCompare(b.machine) || a.position.localeCompare(b.position) ||
           a.id.localeCompare(b.id);
  });
  return { blades: out, counts: counts };
}

/** สร้างหรือแก้ข้อมูลหลักของใบมีด — การเปลี่ยนสถานะทำผ่าน bladeAction() เท่านั้น */
function saveBlade(b) {
  requireRole_('LEAD');
  return lock_(function () {
    const id = String(b.id || '').trim();
    if (!id) throw new Error('ต้องมีรหัสใบมีด');
    const sh = sheet_(SH.BLADES);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][BL.ID]).trim() !== id) continue;
      const after = rows[i].slice();
      after[BL.SPEC] = String(b.spec || '');
      after[BL.NOTE] = String(b.note || '');
      sh.getRange(i + 1, BL.SPEC + 1).setValue(after[BL.SPEC]);
      sh.getRange(i + 1, BL.NOTE + 1).setValue(after[BL.NOTE]);
      logAudit_('UPDATE_BLADE', id, rowDiff_(rows[i], after, BL_LABELS));
      return getBlades();
    }
    // ใบใหม่เข้าคลังเป็นของสำรองเสมอ ติดตั้งเป็นอีกเหตุการณ์หนึ่ง
    appendRows_(sh, [[id, String(b.spec || ''), '', '', BLADE_SPARE, '', 0, 0, '', String(b.note || '')]]);
    logBlade_(id, 'รับเข้าคลัง', '', '', 0, String(b.note || ''));
    logAudit_('CREATE_BLADE', id, [['Spec', '', String(b.spec || '')]]);
    return getBlades();
  });
}

function logBlade_(id, action, machine, position, days, note) {
  appendRows_(sheet_(SH.BLADELOG),
    [[new Date(), id, action, machine, position, days, user_(), note]]);
}

/**
 * เหตุการณ์เดียวที่เปลี่ยนสถานะใบมีด — state machine อยู่ที่นี่ที่เดียว
 * @param {string} action INSTALL | REMOVE | SEND | RETURN | NG | SCRAP
 * @param {{machine,position,note,ref}} data
 */
function bladeAction(bladeId, action, data) {
  requireRole_('TECH');
  if (action === 'SCRAP') requireRole_('LEAD');
  data = data || {};
  return lock_(function () {
    const already = doneBefore_(data.ref);
    if (already) return { duplicate: true, bladeId: already };

    const id = String(bladeId || '').trim();
    const sh = sheet_(SH.BLADES);
    const rows = sh.getDataRange().getValues();
    let at = -1;
    for (let i = 1; i < rows.length; i++) if (String(rows[i][BL.ID]).trim() === id) { at = i; break; }
    if (at < 0) throw new Error('ไม่พบใบมีด: ' + id);

    const row = rows[at];
    const status = String(row[BL.STATUS] || BLADE_SPARE).trim();
    const install = row[BL.INSTALL] instanceof Date ? row[BL.INSTALL] : null;
    const today = new Date();
    const machine = String(data.machine || '').trim();
    const position = String(data.position || '').trim();
    const note = String(data.note || '');
    let days = 0, label = '';

    if (action === 'INSTALL') {
      if (status !== BLADE_SPARE) throw new Error('ติดตั้งได้เฉพาะใบที่สถานะ "' + BLADE_SPARE + '" (ตอนนี้ ' + status + ')');
      if (!machine || !position) throw new Error('ต้องระบุเครื่องและตำแหน่งติดตั้ง');
      // หนึ่งตำแหน่งมีใบมีดได้ใบเดียว — ถอดใบเดิมออกก่อน ไม่ใช่ทับลงไปเงียบ ๆ
      for (let i = 1; i < rows.length; i++) {
        if (i === at) continue;
        if (String(rows[i][BL.STATUS]).trim() === BLADE_USE &&
            String(rows[i][BL.MACHINE]).trim() === machine &&
            String(rows[i][BL.POS]).trim() === position) {
          throw new Error('ตำแหน่ง ' + machine + ' / ' + position + ' มีใบ ' +
                          String(rows[i][BL.ID]) + ' ติดตั้งอยู่ — ถอดใบนั้นออกก่อน');
        }
      }
      row[BL.STATUS] = BLADE_USE; row[BL.MACHINE] = machine; row[BL.POS] = position;
      row[BL.INSTALL] = today;
      label = 'ติดตั้ง';

    } else if (action === 'REMOVE' || action === 'SEND' || action === 'NG') {
      if (status === BLADE_USE) {                    // นับวันที่ใช้จริงก่อนถอด
        days = daysBetween_(install, today);
        row[BL.DAYS] = (Number(row[BL.DAYS]) || 0) + days;
      }
      row[BL.MACHINE] = ''; row[BL.POS] = ''; row[BL.INSTALL] = '';
      if (action === 'REMOVE') { row[BL.STATUS] = BLADE_SPARE; label = 'ถอดออก'; }
      if (action === 'SEND') {
        if (status === BLADE_SHARPEN) throw new Error('ใบนี้อยู่ที่ร้านลับคมอยู่แล้ว');
        row[BL.STATUS] = BLADE_SHARPEN;
        row[BL.SHARPEN] = (Number(row[BL.SHARPEN]) || 0) + 1;
        row[BL.LAST] = today;
        label = 'ส่งลับคม (ครั้งที่ ' + row[BL.SHARPEN] + ')';
      }
      if (action === 'NG') { row[BL.STATUS] = BLADE_NG; label = 'ตีกลับ ใช้ไม่ได้'; }

    } else if (action === 'RETURN') {
      if (status !== BLADE_SHARPEN) throw new Error('รับคืนได้เฉพาะใบที่ส่งลับคมอยู่ (ตอนนี้ ' + status + ')');
      row[BL.STATUS] = BLADE_SPARE;
      label = 'รับคืนจากลับคม';

    } else if (action === 'SCRAP') {
      if (status === BLADE_USE) {
        days = daysBetween_(install, today);
        row[BL.DAYS] = (Number(row[BL.DAYS]) || 0) + days;
      }
      row[BL.STATUS] = BLADE_SCRAP; row[BL.MACHINE] = ''; row[BL.POS] = ''; row[BL.INSTALL] = '';
      label = 'ปลดระวาง';

    } else {
      throw new Error('ไม่รู้จักคำสั่ง: ' + action);
    }

    widen_(sh, BL_LABELS.length);
    sh.getRange(at + 1, 1, 1, BL_LABELS.length).setValues([row.slice(0, BL_LABELS.length)]);
    logBlade_(id, label, machine || String(row[BL.MACHINE] || ''), position, days, note);
    rememberDone_(data.ref, id, 'BLADE');
    SpreadsheetApp.flush();
    return { bladeId: id, status: row[BL.STATUS], days: days, action: label };
  });
}

/** ประวัติของใบมีดหนึ่งใบ — แทน History ที่เดิมต้องพิมพ์เอง */
function getBladeLog(bladeId, limit) {
  requireRole_('TECH');
  const sh = ss_().getSheetByName(SH.BLADELOG);
  if (!sh || sh.getLastRow() < 2) return [];
  const want = String(bladeId || '').trim();
  const rows = sh.getDataRange().getValues();
  const out = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    if (want && String(rows[i][BG.ID]).trim() !== want) continue;
    out.push({ ts: ymdhm_(rows[i][BG.TS]), id: String(rows[i][BG.ID]),
               action: String(rows[i][BG.ACTION]), machine: String(rows[i][BG.MACHINE] || ''),
               position: String(rows[i][BG.POS] || ''), days: Number(rows[i][BG.DAYS]) || 0,
               user: String(rows[i][BG.USER] || ''), note: String(rows[i][BG.NOTE] || '') });
    if (out.length >= (limit || 60)) break;
  }
  return out;
}

/* ========================================================================== *
 *  10. ข้อมูลหลัก + งานอัตโนมัติ
 * ========================================================================== */

/** สร้างหรือแก้อะไหล่ (จับคู่ด้วย Part_No) */
function savePart(p) {
  requireRole_('LEAD');
  return lock_(function () {
    /* ออกรหัสใหม่ตามมาตรฐานตรงนี้ ไม่ใช่ที่เบราว์เซอร์ — Running ถูกจองภายใน lock_
       เดียวกับที่เขียนแถว สองคนกดบันทึกพร้อมกันจึงไม่ได้เลขเดียวกัน */
    let part = String(p.part || '').trim();
    let issued = null;
    if (p.gen && (!part || p.autoCode)) {
      const g = pickCode_(p.gen);
      const running = nextRunning_(partCodes_(), g.code4);
      part = buildPartCode_(g.group, g.usage, g.type, g.key3, g.code4, running);
      issued = { code: part, running: running };
    }
    if (!part) throw new Error('ต้องมีรหัสอะไหล่ (Part No.) หรือเลือกหมวดให้ระบบออกรหัสให้');
    if (!String(p.name || '').trim()) throw new Error('ต้องมีชื่ออะไหล่');
    if (Number(p.cost) < 0) throw new Error('ต้นทุนติดลบไม่ได้');
    if (Number(p.min) < 0 || Number(p.max) < 0 || Number(p.moq) < 0) throw new Error('Min / Max / MOQ ติดลบไม่ได้');

    const sh = sheet_(SH.PARTS);
    const row = [part, String(p.name).trim(), String(p.category || 'อื่น ๆ'), String(p.unit || 'ชิ้น'),
                 String(p.location || ''), Number(p.cost) || 0, Number(p.min) || 0, Number(p.max) || 0,
                 String(p.supplier || ''), String(p.machine || ''), p.active !== false,
                 String(p.image || '').trim(), Number(p.moq) || 0,
                 String(p.level || '').trim().toUpperCase().slice(0, 1),
                 String(p.position || '')];
    widen_(sh, row.length);

    const rows = sh.getDataRange().getValues();

    /* รหัสที่ต่างกันแค่ตัวพิมพ์ใหญ่เล็กหรือช่องว่าง = ของชิ้นเดียวกันในคลังจริง
       ปล่อยผ่านคือได้อะไหล่สองแถว คงเหลือแยกกัน และมูลค่าสต๊อกเบิ้ล */
    for (let i = 1; i < rows.length; i++) {
      const other = String(rows[i][PT.PART]).trim();
      if (other !== part && other.toLowerCase() === part.toLowerCase()) {
        throw new Error('มีรหัส "' + other + '" อยู่แล้ว ซึ่งซ้ำกับ "' + part + '" (ต่างแค่ตัวพิมพ์) — ใช้รหัสเดิมหรือเปลี่ยนให้ต่างจริง');
      }
    }

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][PT.PART]).trim() === part) {
        sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        logAudit_('UPDATE_PART', part, rowDiff_(rows[i], row, PT_LABELS));
        return getCatalog();
      }
    }
    appendRows_(sh, [row]);
    sh.getRange(sh.getLastRow(), PT.ACTIVE + 1).insertCheckboxes().setValue(p.active !== false);
    logAudit_('CREATE_PART', part, [['Name', '', row[PT.NAME]], ['Cost', '', row[PT.COST]],
                                    ['Min_Qty', '', row[PT.MIN]]]);
    const cat = getCatalog();
    cat.issued = issued;                 // รหัสที่ระบบออกให้ เอาไปแสดงให้คนกรอกเห็น
    return cat;
  });
}

/** ซ่อนอะไหล่โดยไม่ทิ้งประวัติ */
function archivePart(part) {
  requireRole_('LEAD');
  return lock_(function () {
    const sh = sheet_(SH.PARTS);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][PT.PART]).trim() === String(part).trim()) {
        sh.getRange(i + 1, PT.ACTIVE + 1).setValue(false);
        logAudit_('ARCHIVE_PART', String(part).trim(), [['Active', 'TRUE', 'FALSE']]);
        return getCatalog();
      }
    }
    throw new Error('ไม่พบอะไหล่: ' + part);
  });
}

/** แก้วันหมดอายุหรือต้นทุนที่คีย์ผิด — จำนวนเปลี่ยนได้ทางการนับสต๊อกเท่านั้น */
function updateBatch(batchId, patch) {
  requireRole_('LEAD');
  return lock_(function () {
    const sh = sheet_(SH.BATCHES);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][B.ID]) !== String(batchId)) continue;
      const after = rows[i].slice();
      if (patch.expiry !== undefined) {
        after[B.EXPIRY] = parseDate_(patch.expiry);
        sh.getRange(i + 1, B.EXPIRY + 1).setValue(after[B.EXPIRY]);
      }
      if (patch.cost !== undefined) {
        if (Number(patch.cost) < 0) throw new Error('ต้นทุนติดลบไม่ได้');
        after[B.COST] = Number(patch.cost);
        sh.getRange(i + 1, B.COST + 1).setValue(after[B.COST]);
      }
      logAudit_('UPDATE_BATCH', String(batchId), rowDiff_(rows[i], after, B_LABELS));
      return getCatalog();
    }
    throw new Error('ไม่พบ batch: ' + batchId);
  });
}

/** เครื่องจักร / หน่วยงานที่เบิกไปใช้ — ปลายทางของทุกใบเบิก */
function saveMachine(m) {
  requireRole_('LEAD');
  return lock_(function () {
    const code = String(m.code || '').trim();
    if (!code) throw new Error('ต้องมีรหัสเครื่องจักร');
    const sh = sheet_(SH.MACHINES);
    const row = [code, String(m.name || ''), String(m.area || ''), m.active !== false];
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][MC.CODE]).trim() === code) {
        sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        logAudit_('UPDATE_MACHINE', code, rowDiff_(rows[i], row, ['Code', 'Name', 'Area', 'Active']));
        return getCatalog();
      }
    }
    appendRows_(sh, [row]);
    sh.getRange(sh.getLastRow(), MC.ACTIVE + 1).insertCheckboxes().setValue(m.active !== false);
    logAudit_('CREATE_MACHINE', code, [['Name', '', row[MC.NAME]]]);
    return getCatalog();
  });
}

/* ---- housekeeping -------------------------------------------------------- */

/** batch ที่หมดแล้วและเก่ากว่า `days` ย้ายออกไปไว้ Batches_Archive */
function pickArchivable_(rows, cutoff) {
  const keep = [], move = [];
  for (let i = 1; i < rows.length; i++) {
    const left = Number(rows[i][B.QTY_LEFT]) || 0;
    const rec = rows[i][B.RECEIVED] instanceof Date ? rows[i][B.RECEIVED] : null;
    if (left <= 0 && rec && rec < cutoff) move.push(rows[i]); else keep.push(rows[i]);
  }
  return { keep: keep, move: move };
}

function archiveEmptyBatches(days) {
  requireRole_('ENG');
  return lock_(function () {
    const window = Number(days) || 180;
    const cutoff = new Date(today_().getTime() - window * 864e5);
    const sh = sheet_(SH.BATCHES);
    const rows = sh.getDataRange().getValues();
    const split = pickArchivable_(rows, cutoff);
    if (!split.move.length) return { moved: 0, left: split.keep.length, days: window };

    const ss = ss_();
    let arc = ss.getSheetByName(SH.ARCHIVE);
    if (!arc) {
      arc = ss.insertSheet(SH.ARCHIVE);
      arc.getRange(1, 1, 1, rows[0].length).setValues([rows[0]]).setFontWeight('bold').setBackground('#f1f5f9');
      arc.setFrozenRows(1);
    }
    appendRows_(arc, split.move);
    sh.getRange(2, 1, Math.max(rows.length - 1, 1), rows[0].length).clearContent();
    if (split.keep.length) sh.getRange(2, 1, split.keep.length, rows[0].length).setValues(split.keep);
    logAudit_('ARCHIVE_BATCHES', SH.BATCHES, [['Rows', String(rows.length - 1), String(split.keep.length)]]);
    return { moved: split.move.length, left: split.keep.length, days: window };
  });
}

/** ติดตั้งอีเมลเตือนประจำวัน 08:00 — รันซ้ำได้ */
function installTriggers() {
  requireRole_('ENG');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyAlert') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyAlert').timeBased().atHour(8).everyDays(1).create();
  return 'ตั้งอีเมลเตือน 08:00 ทุกวันแล้ว';
}

/** เมลรายวัน: ของถึงจุดสั่งซื้อ + batch ใกล้/เลยวันหมดอายุ */
function dailyAlert() {
  const cfg = getSettings();
  const cat = buildCatalog_();
  const low = cat.parts.filter(function (p) { return p.low; });
  const bad = cat.batches.filter(function (b) { return b.status !== 'OK'; });
  const dupes = cat.dupes || [];
  const disk = storageSnapshot_();
  if (!low.length && !bad.length && !dupes.length && disk.level === 'OK') return;

  let to = String(cfg.ALERT_EMAILS || '').trim();
  if (!to) {
    const sh = ss_().getSheetByName(SH.USERS);
    const rows = sh ? sh.getDataRange().getValues() : [];
    const list = [];
    for (let i = 1; i < rows.length; i++) {
      const role = String(rows[i][US.ROLE] || '').toUpperCase();
      if (rows[i][US.ACTIVE] !== false && (role === "ENG" || role === "LEAD")) list.push(rows[i][US.EMAIL]);
    }
    to = list.join(',') || Session.getEffectiveUser().getEmail();
  }
  if (!to) return;

  const stockValue = round2_(cat.parts.reduce(function (s, p) { return s + p.value; }, 0));
  const line = function (s) { return s + '\n'; };
  let body = line(cfg.SITE_NAME + ' — สรุปคลังอะไหล่ ' + ymd_(new Date()));
  body += line('มูลค่าสต๊อกรวม ' + cfg.CURRENCY + stockValue);
  body += line('');
  body += line('ถึงจุดสั่งซื้อ (' + low.length + ' รายการ):');
  low.slice(0, 40).forEach(function (p) {
    body += line('  ' + p.part + ' ' + p.name + ': คงเหลือ ' + p.stock + ' ' + p.unit +
                 ' (Min ' + p.min + ') → ควรสั่ง ' + reorderQty_(p.stock, p.min, p.max, p.moq) +
                 (p.moq ? ' (MOQ ' + p.moq + ')' : ''));
  });
  if (dupes.length) {
    body += line('');
    body += line('⚠ รหัสอะไหล่ซ้ำในชีต Parts — คงเหลือถูกนับซ้ำ แก้ก่อนใช้ตัวเลขต่อ:');
    dupes.forEach(function (d) { body += line('  ' + d); });
  }
  body += line('');
  body += line('ใกล้/เลยวันหมดอายุ (' + bad.length + ' batch):');
  bad.slice(0, 40).forEach(function (b) {
    body += line('  ' + b.part + ' ' + b.id + ' x' + b.left + ' หมดอายุ ' + b.expiry + ' [' + b.status + ']');
  });

  if (disk.level !== 'OK') {
    body += line('');
    body += line('===================================');
    body += line((disk.level === 'URGENT' ? 'ต้องจัดการด่วน' : 'คำเตือน') +
                 ': พื้นที่เก็บข้อมูลใช้ไปแล้ว ' + disk.pct + '%');
    body += line('ถ้าเต็ม จะเบิกและรับเข้าไม่ได้ทั้งระบบ ไม่ใช่แค่ log หาย');
    body += line('ชีตที่กินพื้นที่มากสุด:');
    disk.top.forEach(function (s) {
      body += line('  ' + s.name + ': ' + s.rows + ' แถว' + (s.trimmable ? ' (ตัดได้)' : ''));
    });
    body += line('วิธีแก้: เปิดแอป → หลังบ้าน → รายงาน → พื้นที่เก็บข้อมูล → สำรองแล้วตัด');
  }

  MailApp.sendEmail(to, '[' + cfg.SITE_NAME + '] ' +
    (disk.level === 'URGENT' ? '⚠ พื้นที่ใกล้เต็ม + ' : '') +
    'เตือนอะไหล่ใกล้หมด / หมดอายุ', body);
}

/** เหมือน getStorageHealth แต่ไม่เช็คสิทธิ์ — trigger รันโดยไม่มี session */
function storageSnapshot_() {
  let used = 0;
  const top = [];
  ss_().getSheets().forEach(function (sh) {
    used += sh.getMaxRows() * sh.getMaxColumns();
    top.push({ name: sh.getName(), rows: Math.max(0, sh.getLastRow() - 1),
               cells: sh.getMaxRows() * sh.getMaxColumns(),
               trimmable: TRIMMABLE.some(function (x) { return x.sheet === sh.getName(); }) });
  });
  top.sort(function (a, b) { return b.cells - a.cells; });
  const pct = used / CELL_LIMIT;
  return { used: used, pct: round2_(pct * 100), top: top.slice(0, 5),
           level: pct >= CELL_URGENT ? 'URGENT' : pct >= CELL_WARN ? 'WARN' : 'OK' };
}

/* ========================================================================== *
 *  WEB APP ENTRY
 * ========================================================================== */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('ระบบ Stock อะไหล่')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Index.html ใช้ดึงไฟล์ JS เข้ามา — editor เก็บไฟล์ HTML ชื่อ "App.js" เป็น
 * App.js.html แต่ถ้าใครพิมพ์ ".html" ต่อท้ายเองมันจะเป็น App.js.html.html
 * ลองทั้งสองแบบก่อนยอมแพ้
 */
function include(file) {
  try { return HtmlService.createHtmlOutputFromFile(file).getContent(); }
  catch (e) {
    try { return HtmlService.createHtmlOutputFromFile(file + '.html').getContent(); }
    catch (e2) {
      throw new Error('ไม่พบไฟล์ HTML "' + file + '" — ใน Apps Script กด + → HTML ' +
                      'ตั้งชื่อว่า "' + file + '" (ไม่ต้องมี .html) วางเนื้อไฟล์ ' + file +
                      '.html ลงไป แล้ว Deploy เวอร์ชันใหม่');
    }
  }
}


/* ========================================================================== *
 *  ข้อมูลตั้งต้น — เขียนลงชีตที่ยังว่าง (ข้อมูลอยู่ใน Data.gs)
 * ========================================================================== */

/**
 * แปลงข้อความหนึ่งก้อนเป็นแถวพร้อมเขียนลงชีต
 *
 * กฎเดียวที่สำคัญ: **เขียนเฉพาะตอนชีตยังว่าง** รัน setup() ซ้ำกี่ครั้งก็ไม่ทับ
 * ของจริงที่ใช้งานไปแล้ว — ซึ่งจำเป็น เพราะ setup() ต้องรันซ้ำทุกครั้งที่อัปเดตโค้ด
 * เพื่อเติมคอลัมน์ใหม่
 *
 * @param {number[]} numCols  คอลัมน์ที่ต้องเป็นตัวเลข (รหัสอะไหล่ห้ามแปลง —
 *                            ถ้าเผลอแปลง เลขศูนย์นำหน้าจะหายและรหัสจะเพี้ยน)
 * @param {number[]} dateCols คอลัมน์วันที่ รูปแบบ yyyy-MM-dd เท่านั้น
 *                            (d/m/y กำกวม: 7/8/2026 อ่านได้ทั้ง 7 ส.ค. และ 8 ก.ค.)
 * @return {number} จำนวนแถวที่เขียน
 */
function seedRows_(sh, block, width, numCols, dateCols) {
  if (!sh || sh.getLastRow() > 1) return 0;            // มีข้อมูลแล้ว ไม่แตะ
  // ไม่ได้วางไฟล์ Data.gs ก็ยังต้องติดตั้งระบบได้ แค่ไม่มีข้อมูลตั้งต้นให้
  if (typeof block !== 'string' || !block.trim()) return 0;
  const isNum = {}, isDate = {};
  (numCols || []).forEach(function (i) { isNum[i] = true; });
  (dateCols || []).forEach(function (i) { isDate[i] = true; });

  const rows = [];
  String(block).split('\n').forEach(function (line) {
    line = line.replace(/\r$/, '');
    if (!line.trim()) return;
    const f = line.split('|');
    const row = [];
    for (let i = 0; i < width; i++) {
      const v = f[i] === undefined ? '' : f[i].trim();
      if (v === '') { row.push(''); }
      else if (v === 'TRUE') { row.push(true); }
      else if (v === 'FALSE') { row.push(false); }
      else if (isDate[i]) { row.push(parseDate_(v) || ''); }
      else if (isNum[i]) { const n = Number(v); row.push(isNaN(n) ? v : n); }
      else { row.push(v); }
    }
    rows.push(row);
  });
  if (!rows.length) return 0;
  widen_(sh, width);
  sh.getRange(2, 1, rows.length, width).setValues(rows);
  return rows.length;
}

/**
 * ยอดคงเหลือ ณ วันที่ export ชีตเดิม — **แยกออกมาให้กดเอง ไม่รวมใน setup()**
 *
 * เพราะยอดนั้นเป็นของวันที่ export ไม่ใช่ของวันนี้ ระบบที่เริ่มด้วยตัวเลขที่ผิด
 * คือระบบที่ไม่มีใครเชื่อภายในสัปดาห์แรก ถ้านับของจริงใหม่ได้ ให้รับเข้าตามที่นับ
 * ถ้ายอมรับตัวเลขเดิมไปก่อน ค่อยรันตัวนี้ แล้วนับสต๊อกจริงให้เร็วที่สุด
 */
function seedOpeningStock() {
  requireRole_('LEAD');
  const r = seedOpeningStock_();
  if (r.already) throw new Error('มี batch อยู่ในระบบแล้ว — ยอดยกมาใส่ได้ครั้งเดียวตอนคลังยังว่าง ' +
                              'ถ้าต้องการแก้จำนวน ใช้การนับสต๊อกแทน');
  return r;
}

/* setup() เรียกตัวนี้ — ตอนรันจาก editor ยังไม่มี session จึงเช็คสิทธิ์ไม่ได้
   คืนค่า already แทนการ throw — setup() ที่รันซ้ำต้องไม่พัง */
function seedOpeningStock_() {
  return lock_(function () {
    const bSheet = sheet_(SH.BATCHES);
    if (bSheet.getLastRow() > 1) return { already: true, received: 0, skipped: 0, skippedParts: [] };
    const known = {};
    const pRows = sheet_(SH.PARTS).getDataRange().getValues();
    for (let i = 1; i < pRows.length; i++) {
      const p = String(pRows[i][PT.PART]).trim();
      if (p) known[p] = Number(pRows[i][PT.COST]) || 0;
    }

    // ไม่ได้วาง Data.gs ก็ติดตั้งต่อได้ แค่ไม่มียอดตั้งต้นให้
    if (typeof SEED_STOCK !== 'string' || !SEED_STOCK.trim()) {
      return { already: false, received: 0, skipped: 0, skippedParts: [], noData: true };
    }
    const ts = new Date();
    const grn = 'GRN-OPENING';
    const batchRows = [], moves = [], skipped = [];
    String(SEED_STOCK).split('\n').forEach(function (line, n) {
      line = line.replace(/\r$/, '').trim();
      if (!line) return;
      const f = line.split('|');
      const part = String(f[0] || '').trim();
      const qty = Number(f[1]);
      if (!part || !(qty > 0)) return;
      if (known[part] === undefined) { skipped.push(part); return; }
      const batchId = 'B-OPEN-' + String(n + 1);
      batchRows.push([batchId, part, ts, '', qty, qty, known[part], 'ยอดยกมา', grn]);
      moves.push({ part: part, qty: qty, batchId: batchId, value: qty * known[part] });
    });

    appendRows_(bSheet, batchRows);
    moves.forEach(function (m) {
      logMove_('RECEIVE', m.part, m.qty, m.batchId, m.value, 'ยอดยกมาจากชีตเดิม', grn);
    });
    SpreadsheetApp.flush();
    return { already: false, received: batchRows.length, skipped: skipped.length,
             skippedParts: skipped.slice(0, 20) };
  });
}

/**
 * ดึงรูปจากโฟลเดอร์ Drive มาใส่ช่อง Image ให้เอง
 * ตั้งชื่อไฟล์ขึ้นต้นด้วยรหัสอะไหล่ เช่น "60002048M006-0005.jpg"
 * หรือ "60002048M006-0005 ปะเก็น.jpg" ก็ได้ — ช่างถ่ายรูปแล้วเปลี่ยนชื่อไฟล์ให้ตรงรหัส
 *
 * ใช้ thumbnail?id= ไม่ใช่ uc?id= — ตัวหลังโดน Drive บล็อกใน <img> บ่อย
 * โฟลเดอร์ต้องแชร์แบบ "ทุกคนที่มีลิงก์" ไม่งั้นรูปจะขึ้นเฉพาะเครื่องเจ้าของ
 */
function linkPartImages(folderUrlOrId, overwrite) {
  requireRole_('LEAD');
  const id = String(folderUrlOrId || '').trim().replace(/^.*[\/?=]([-\w]{20,})(?:[?&#].*)?$/, '$1');
  if (!id) throw new Error('วางลิงก์โฟลเดอร์ Drive ที่เก็บรูปอะไหล่');

  let folder;
  try { folder = DriveApp.getFolderById(id); }
  catch (e) { throw new Error('เปิดโฟลเดอร์ไม่ได้ — ตรวจลิงก์ และต้องแชร์ให้บัญชีนี้เข้าถึงได้'); }

  // อ่านไฟล์ทั้งโฟลเดอร์ครั้งเดียว แล้วค่อยเทียบกับรหัส — ไม่วนหาทีละรหัส
  const byCode = {};
  const files = folder.getFiles();
  let scanned = 0;
  while (files.hasNext()) {
    const f = files.next();
    scanned++;
    const base = f.getName().replace(/\.[^.]+$/, '').trim();
    const code = base.split(/[\s_]+/)[0].trim().toUpperCase();
    if (code && !byCode[code]) byCode[code] = 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w800';
  }

  return lock_(function () {
    const sh = sheet_(SH.PARTS);
    const rows = sh.getDataRange().getValues();
    const col = [];
    let linked = 0, kept = 0;
    for (let i = 1; i < rows.length; i++) {
      const part = String(rows[i][PT.PART]).trim();
      const now = String(rows[i][PT.IMAGE] || '').trim();
      const hit = byCode[part.toUpperCase()];
      // ลิงก์ค้นหาถือเหมือนว่าง — ทับได้ แต่รูปจริงที่มีอยู่ไม่ทับ นอกจากสั่งมา
      const isSearch = !now || now.indexOf('google.com/search') >= 0;
      if (hit && (isSearch || overwrite)) { col.push([hit]); linked++; }
      else { col.push([now]); if (now && !isSearch) kept++; }
    }
    if (col.length) sh.getRange(2, PT.IMAGE + 1, col.length, 1).setValues(col);
    SpreadsheetApp.flush();
    logAudit_('LINK_IMAGES', folder.getName(), 'ไฟล์ ' + scanned + ' · ผูกได้ ' + linked);
    return { scanned: scanned, linked: linked, kept: kept, folder: folder.getName() };
  });
}

/* ---- รูปถ่ายจากมือถือ ----------------------------------------------- *
 * เบราว์เซอร์ย่อรูปให้เหลือด้านกว้าง 1000px ก่อนส่ง — รูปจากมือถือดิบ 3-8 MB
 * ส่งเต็ม ๆ จะช้ามากบนเน็ตโรงงาน และกินโควต้า Drive ฟรีเร็วกว่าที่ควร
 */
const IMG_FOLDER_KEY = 'part_image_folder_id';

function partImageFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(IMG_FOLDER_KEY);
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      f.getName();                      // โยนทิ้งไปแล้วจะ throw ตรงนี้ ไม่ใช่ตอนสร้างไฟล์
      return f;
    } catch (e) { /* หายไป สร้างใหม่ */ }
  }
  const name = 'รูปอะไหล่ - ' + ss_().getName();
  const hit = DriveApp.getFoldersByName(name);
  const folder = hit.hasNext() ? hit.next() : DriveApp.createFolder(name);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty(IMG_FOLDER_KEY, folder.getId());
  return folder;
}

/**
 * บันทึกรูปอะไหล่หนึ่งรูป (dataUrl จากกล้องมือถือ)
 * สิทธิ์: LEAD ขึ้นไป — อยากให้ช่างถ่ายเองได้ เปลี่ยนบรรทัดข้างล่างเป็น 'TECH'
 * ทุกครั้งมี audit log ว่าใครเป็นคนอัป
 */
function savePartImage(partNo, dataUrl) {
  requireRole_('LEAD');
  partNo = String(partNo || '').trim();
  if (!partNo) throw new Error('ระบุรหัสอะไหล่');

  const m = String(dataUrl || '').match(/^data:(image\/[a-z+]+);base64,([\s\S]+)$/i);
  if (!m) throw new Error('ไฟล์ไม่ใช่รูปภาพ');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('รูปใหญ่เกินไป ถ่ายใหม่อีกครั้ง');

  const ext = m[1].indexOf('png') >= 0 ? '.png' : '.jpg';
  const folder = partImageFolder_();
  const file = folder.createFile(Utilities.newBlob(bytes, m[1], partNo + ext));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800';

  return lock_(function () {
    const sh = sheet_(SH.PARTS);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][PT.PART]).trim() !== partNo) continue;
      const old = String(rows[i][PT.IMAGE] || '').trim();
      widen_(sh, PT.IMAGE + 1);
      sh.getRange(i + 1, PT.IMAGE + 1).setValue(url);
      SpreadsheetApp.flush();
      logAudit_('PART_PHOTO', partNo, old && old.indexOf('google.com/search') < 0
        ? 'เปลี่ยนรูปเดิม' : 'เพิ่มรูป');
      return { part: partNo, url: url };
    }
    // หาแถวไม่เจอ อย่าทิ้งไฟล์กำพร้าไว้ใน Drive
    file.setTrashed(true);
    throw new Error('ไม่พบรหัส ' + partNo + ' ในตารางอะไหล่');
  });
}

/* ========================================================================== *
 *  พื้นที่เก็บข้อมูล — เตือนก่อนเต็ม ไม่ใช่ตอนเขียนไม่ลง
 *
 *  Google Sheet หนึ่งไฟล์เก็บได้ 10 ล้านช่อง พอเต็มแล้วการเขียนทุกอย่างจะพัง
 *  พร้อมกันหมด — เบิกไม่ได้ รับเข้าไม่ได้ ไม่ใช่แค่ log หาย จึงต้องรู้ล่วงหน้า
 *  นับเป็น "ช่อง" ไม่ใช่ "แถว" เพราะโควต้าคิดแบบนั้น ชีตกว้าง 16 คอลัมน์
 *  กินเร็วกว่าชีต 8 คอลัมน์เท่าตัวที่จำนวนแถวเท่ากัน
 * ========================================================================== */

const CELL_LIMIT = 10000000;
const CELL_WARN = 0.70;      // เริ่มบอก
const CELL_URGENT = 0.85;    // ต้องลงมือแล้ว

/** ชีตที่โตไม่หยุดตามการใช้งาน — ตัดได้ เพราะเป็นบันทึกย้อนหลัง ไม่ใช่ยอดปัจจุบัน */
const TRIMMABLE = [
  { sheet: SH.MOVES,    ts: MV.TS, label: 'ความเคลื่อนไหวสต๊อก' },
  { sheet: SH.ISSUES,   ts: IS.TS, label: 'ประวัติการเบิก' },
  { sheet: SH.AUDIT,    ts: 0,     label: 'บันทึกการแก้ไข' },
  { sheet: SH.BLADELOG, ts: BG.TS, label: 'ประวัติใบมีด' },
  // ตัดได้ — ref เก่าเกินไม่กี่ชั่วโมงไม่มีทางถูกส่งซ้ำมาอีก แต่เก็บนานหน่อยไว้ใช้สอบย้อนได้
  { sheet: SH.REFLOG,   ts: RF.TS, label: 'กันคีย์ซ้ำ' }
];

function getStorageHealth() {
  requireRole_('LEAD');
  const ss = ss_();
  const sheets = [];
  let used = 0;
  ss.getSheets().forEach(function (sh) {
    const cells = sh.getMaxRows() * sh.getMaxColumns();
    used += cells;
    const t = TRIMMABLE.filter(function (x) { return x.sheet === sh.getName(); })[0];
    sheets.push({
      name: sh.getName(), rows: Math.max(0, sh.getLastRow() - 1),
      cols: sh.getLastColumn(), cells: cells,
      trimmable: !!t, label: t ? t.label : ''
    });
  });
  sheets.sort(function (a, b) { return b.cells - a.cells; });

  const pct = used / CELL_LIMIT;
  return {
    used: used, limit: CELL_LIMIT, pct: round2_(pct * 100),
    level: pct >= CELL_URGENT ? 'URGENT' : pct >= CELL_WARN ? 'WARN' : 'OK',
    sheets: sheets, oldest: oldestLogDate_()
  };
}

function oldestLogDate_() {
  const sh = ss_().getSheetByName(SH.MOVES);
  if (!sh || sh.getLastRow() < 2) return '';
  const v = sh.getRange(2, MV.TS + 1).getValue();
  return v instanceof Date ? ymd_(v) : '';
}

/**
 * แบ็คอัพแถวเก่าเป็น CSV ใน Drive แล้วลบออกจากชีต
 * ต้องเขียนไฟล์ให้สำเร็จก่อนถึงจะลบ — ถ้าเขียนพัง ข้อมูลยังอยู่ครบ
 * ลบทีเดียวเป็นช่วงติดกันจากบนลงล่าง เพราะแถวเรียงตามเวลาอยู่แล้ว
 */
function backupAndTrim(sheetName, keepDays) {
  requireRole_('ENG');
  const spec = TRIMMABLE.filter(function (x) { return x.sheet === sheetName; })[0];
  if (!spec) throw new Error('ชีตนี้ตัดไม่ได้ — ตัดได้เฉพาะชีตบันทึกย้อนหลัง');
  const days = Math.max(30, Number(keepDays) || 365);

  return lock_(function () {
    const sh = sheet_(sheetName);
    const last = sh.getLastRow();
    if (last < 2) return { moved: 0, kept: 0, file: '' };

    const width = sh.getLastColumn();
    const rows = sh.getRange(1, 1, last, width).getValues();
    const cut = new Date(today_().getTime() - days * 864e5);

    let n = 1;                                  // แถวแรกที่ "เก็บไว้" (1-based หลัง header)
    while (n < rows.length) {
      const ts = rows[n][spec.ts];
      if (!(ts instanceof Date) || ts >= cut) break;
      n++;
    }
    const oldRows = rows.slice(1, n);
    if (!oldRows.length) return { moved: 0, kept: last - 1, file: '' };

    const name = sheetName + '_ถึง_' + ymd_(cut) + '_' + ymdhm_(new Date()).replace(/[^0-9]/g, '') + '.csv';
    const csv = [rows[0]].concat(oldRows).map(function (r) {
      return r.map(function (c) {
        const s = c instanceof Date ? ymdhm_(c) : String(c == null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');

    // ﻿ = BOM ไม่งั้น Excel เปิดภาษาไทยเป็นขยะ
    const folder = backupFolder_();
    const file = folder.createFile(Utilities.newBlob('﻿' + csv, 'text/csv', name));

    sh.deleteRows(2, oldRows.length);           // ลบหลังไฟล์เขียนเสร็จแล้วเท่านั้น
    SpreadsheetApp.flush();
    logAudit_('TRIM_LOG', sheetName,
      [['แถวที่ย้ายออก', '', String(oldRows.length)], ['ไฟล์สำรอง', '', name]]);
    return { moved: oldRows.length, kept: last - 1 - oldRows.length,
             file: name, url: file.getUrl() };
  });
}

const BACKUP_FOLDER_KEY = 'backup_folder_id';

function backupFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(BACKUP_FOLDER_KEY);
  if (id) {
    try { const f = DriveApp.getFolderById(id); f.getName(); return f; }
    catch (e) { /* หายไป สร้างใหม่ */ }
  }
  const name = 'สำรองข้อมูล - ' + ss_().getName();
  const hit = DriveApp.getFoldersByName(name);
  const folder = hit.hasNext() ? hit.next() : DriveApp.createFolder(name);
  props.setProperty(BACKUP_FOLDER_KEY, folder.getId());
  return folder;
}

/* ========================================================================== *
 *  9. SETUP
 * ========================================================================== */

/* ---- ล็อกชีตหลักฐาน ----------------------------------------------------- *
 * ยอดคงเหลือทั้งระบบคือผลรวม Qty_Remaining ใน Batches_FIFO — พิมพ์ทับช่องเดียว
 * บัญชีกับของจริงก็แยกกันทันที และไม่มีร่องรอยว่าใครแก้ ชีตบันทึกอื่นก็เหมือนกัน
 * คือหลักฐานย้อนหลัง ไม่ใช่ที่ให้แก้
 *
 * เว็บแอป deploy แบบ Execute as: Me (ดู SETUP.md) สคริปต์จึงเขียนทะลุ protection
 * ได้ตามปกติ — กันเฉพาะคนที่เปิดชีตใน Google Sheets แล้วพิมพ์เอง
 * เจ้าของไฟล์ยังแก้ได้เสมอ (Google ไม่ยอมให้ถอดสิทธิ์เจ้าของ) เวลาต้องซ่อมข้อมูลด้วยมือ  */
const LOCKED_SHEETS = [
  [SH.BATCHES,  'ยอดคงเหลือมาจากชีตนี้ — แก้มือแล้วสต๊อกเพี้ยนทั้งระบบ ใช้หน้ารับเข้า/เบิก/นับสต๊อกแทน'],
  [SH.MOVES,    'บันทึกความเคลื่อนไหว — หลักฐานย้อนหลัง'],
  [SH.ISSUES,   'ประวัติการเบิก — หลักฐานย้อนหลัง'],
  [SH.BLADELOG, 'ประวัติใบมีด — หลักฐานย้อนหลัง'],
  [SH.AUDIT,    'บันทึกการแก้ไข — แก้แล้วสอบย้อนไม่ได้'],
  [SH.REFLOG,   'คีย์กันบันทึกซ้ำ — ลบแล้วรายการเดิมอาจถูกบันทึกซ้ำ'],
  [SH.USERS,    'ผู้ใช้ สิทธิ์ และ PIN — แก้ช่อง Role เองเท่ากับยกสิทธิ์ให้ตัวเอง ใช้หน้าตั้งค่าแทน']
];

/** on=false ไว้ปลดชั่วคราวเวลาต้องซ่อมข้อมูลด้วยมือ */
function protectSheets(on) {
  requireRole_('ENG');
  const want = on !== false;
  const n = protectSheets_(want);
  logAudit_('PROTECT', 'ชีตหลักฐาน', [['สถานะ', want ? 'ปลด' : 'ล็อก', want ? 'ล็อก ' + n + ' ชีต' : 'ปลด ' + n + ' ชีต']]);
  return { locked: want, count: n, sheets: LOCKED_SHEETS.map(function (x) { return x[0]; }) };
}

/** เรียกซ้ำได้ — ลบของเดิมก่อนเสมอ ไม่งั้น protection ซ้อนกันเป็นสิบอันจนชีตรก */
function protectSheets_(on) {
  const ss = ss_();
  const me = Session.getEffectiveUser();
  let n = 0;
  LOCKED_SHEETS.forEach(function (x) {
    const sh = ss.getSheetByName(x[0]);
    if (!sh) return;                                  // ชีตยังไม่ถูกสร้าง ข้ามไป
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
      if (p.canEdit()) p.remove();
    });
    if (on) {
      const p = sh.protect().setDescription(x[1]);
      p.addEditor(me);
      p.removeEditors(p.getEditors());                // เหลือเจ้าของคนเดียว
      if (p.canDomainEdit()) p.setDomainEdit(false);  // คนในโดเมนก็แก้ไม่ได้
    }
    n++;
  });
  return n;
}

function setup() {
  const ss = ss_();
  const make = function (name, headers) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#f1f5f9');
      sh.setFrozenRows(1);
    } else if (sh.getLastColumn() < headers.length) {
      // ชีตจากเวอร์ชันก่อน: เติมเฉพาะคอลัมน์ที่ยังไม่มี ของเดิมไม่แตะ
      const from = sh.getLastColumn();
      widen_(sh, headers.length);
      sh.getRange(1, from + 1, 1, headers.length - from).setValues([headers.slice(from)])
        .setFontWeight('bold').setBackground('#f1f5f9');
    }
    return sh;
  };

  const parts = make(SH.PARTS, PT_LABELS);

  /* มาตรฐานการออกรหัส — แก้ในชีตนี้ได้เลย ไม่ต้องแตะโค้ด
     เพิ่มหมวดชนิดใหม่: เพิ่มแถว CATEGORY พร้อมเลข 3 หลักและอักษรย่อ 4 ตัวที่ยังไม่มีใครใช้ */
  const codes = make(SH.CODES, ['List', 'Key', 'Label_EN', 'Label_TH', 'Code4']);
  if (codes.getLastRow() === 1) {
    const rows = [];
    ['GROUP', 'TYPE', 'USAGE', 'CATEGORY'].forEach(function (list) {
      CODE_SEED[list].split('\n').forEach(function (line) {
        const f = line.split('|');
        if (f[0]) rows.push([list, f[0].trim(), (f[1] || '').trim(), (f[2] || '').trim(), (f[3] || '').trim()]);
      });
    });
    appendRows_(codes, rows);
    codes.setFrozenRows(1);
  }
  make(SH.BATCHES,
    ['Batch_ID', 'Part_No', 'Received_Date', 'Expiry_Date', 'Qty_Received', 'Qty_Remaining',
     'Unit_Cost', 'Supplier', 'Ref']);
  make(SH.ISSUES,
    ['Timestamp', 'Issue_ID', 'Type', 'Part_No', 'Name', 'Qty', 'Unit_Cost', 'Value', 'Batch_IDs',
     'Machine', 'Job_No', 'Requester', 'Dept', 'Note', 'User', 'Ref']);
  make(SH.MOVES,
    ['Timestamp', 'Move_ID', 'Type', 'Part_No', 'Qty_Change', 'Batch_IDs', 'Value', 'Reason', 'User',
     'Doc_Ref']);
  make(SH.PO,
    ['Timestamp', 'PO_ID', 'Part_No', 'Name', 'Supplier', 'Suggested_Qty', 'Unit_Cost', 'Est_Cost', 'Status']);

  make(SH.TOOLS, TL_LABELS);
  make(SH.BLADES, BL_LABELS);
  make(SH.BLADELOG, ['Timestamp', 'Blade_ID', 'Action', 'Machine', 'Position', 'Days', 'User', 'Note']);
  make(SH.REFLOG, ['Timestamp', 'Ref', 'Doc_ID', 'Type']);

  const machines = make(SH.MACHINES, ['Machine_Code', 'Name', 'Area', 'Active']);
  if (machines.getLastRow() === 1) {
    // อักษรย่อเครื่องจักรของจริง ยกมาจาก legend ในไฟล์ "โครงสร้างสำหรับกำหนดรหัส"
    const list = [
      ['EXT1', 'Extrusion 1', 'Extrusion'], ['EXT2', 'Extrusion 2', 'Extrusion'],
      ['EXT3', 'Extrusion 3', 'Extrusion'], ['MIX1', 'Mixer 1', 'Mixer'],
      ['MIX2', 'Mixer 2', 'Mixer'], ['MIX3', 'Mixer 3', 'Mixer'],
      ['UV01', 'UV 1', 'UV'], ['UV02', 'UV 2', 'UV'],
      ['CS01', 'Cut slot 1', 'Cut slot'], ['CS02', 'Cut slot 2', 'Cut slot'],
      ['XPE1', 'XPE 1', 'XPE'], ['XPE2', 'XPE 2', 'XPE'],
      ['PDM1', 'Powder mill 1', 'Powder mill'], ['PDM2', 'Powder mill 2', 'Powder mill'],
      ['CRH1', 'Crusher 1', 'Crusher'], ['CHR2', 'Crusher 2', 'Crusher'],
      ['SLM1', 'Slot mill 1', 'Slot mill'], ['SLM2', 'Slot mill 2', 'Slot mill'],
      ['AP01', 'Air pump 1', 'Air pump'], ['AP02', 'Air pump 2', 'Air pump'],
      ['AP03', 'Air pump 3', 'Air pump'], ['CM01', 'Common — ใช้ร่วมทุกเครื่อง', 'ส่วนกลาง']
    ].map(function (m) { return [m[0], m[1], m[2], true]; });
    machines.getRange(2, 1, list.length, 4).setValues(list);
    machines.getRange(2, MC.ACTIVE + 1, 200, 1).insertCheckboxes().setValue(true);
  }

  const users = make(SH.USERS,
    ['Email', 'Name', 'Role', 'Active', 'PIN_Hash', 'PIN_Salt', 'Failed_Attempts', 'Locked_Until', 'Photo_URL']);
  if (users.getLastRow() === 1) {
    users.getRange(2, 1, 1, 9).setValues([[Session.getEffectiveUser().getEmail(), 'วิศวกรปฏิบัติการ', 'ENG', true, '', '', 0, '', '']]);
    users.getRange(2, US.ACTIVE + 1, 200, 1).insertCheckboxes().setValue(true);
    users.hideColumns(US.PIN + 1, 2);        // hash ไม่ได้มีไว้ให้อ่าน
  }

  const st = make(SH.SETTINGS, ['Key', 'Value', 'Note']);
  if (st.getLastRow() === 1) {
    const notes = {
      SITE_NAME:        'ชื่อคลัง — ขึ้นหัวใบเบิกที่พิมพ์',
      SITE_ADDRESS:     'ที่อยู่ / แผนก บนใบเบิก',
      CURRENCY:         'สัญลักษณ์สกุลเงิน',
      EXPIRY_WARN_DAYS: 'batch ที่หมดอายุภายในกี่วันให้ขึ้นเตือน (จาระบี น้ำมัน ยางซีล)',
      DEAD_STOCK_DAYS:  'ไม่มีการเบิกเกินกี่วัน = ของนอน (ใช้ในรายงาน)',
      REQUIRE_JOB_NO:   '1 = ต้องกรอกเลขใบแจ้งซ่อมทุกครั้งที่เบิก, 0 = ไม่บังคับ',
      SHOW_COST_TO_TECH:'0 = ช่างไม่เห็นต้นทุนและมูลค่า, 1 = เห็น',
      ALERT_EMAILS:     'คั่นด้วย comma; ว่าง = ส่งให้หัวหน้าช่างและวิศวกรทุกคน',
      SLIP_WIDTH:       'ความกว้างใบเบิกที่พิมพ์ (mm): 58 หรือ 80',
      SLIP_FOOTER:      'บรรทัดท้ายใบเบิก — ช่องเซ็นชื่อ',
      LOGO_URL:         'ว่าง = โลโก้กลางที่ฝังมากับโค้ด · ใส่ลิงก์รูป (Drive ก็ได้) เพื่อเปลี่ยน'
    };
    appendRows_(st, Object.keys(DEFAULTS).map(function (k) { return [k, DEFAULTS[k], notes[k] || '']; }));
  }

  /* ---- ข้อมูลตั้งต้นจากชีตเดิม (Data.gs) — ลงเฉพาะชีตที่ยังว่าง ---- */
  const seeded = {
    parts:  seedRows_(parts, SEED_PARTS, PT_LABELS.length, [PT.COST, PT.MIN, PT.MAX, PT.MOQ], []),
    tools:  seedRows_(ss.getSheetByName(SH.TOOLS), SEED_TOOLS, TL_LABELS.length,
                      [TL.QTY, TL.PRICE], [TL.DATE]),
    blades: seedRows_(ss.getSheetByName(SH.BLADES), SEED_BLADES, BL_LABELS.length,
                      [BL.DAYS, BL.SHARPEN], [BL.INSTALL, BL.LAST])
  };
  if (seeded.parts) {
    parts.getRange(2, PT.ACTIVE + 1, seeded.parts, 1).insertCheckboxes();
    parts.getRange(2, PT.ACTIVE + 1, seeded.parts, 1).setValue(true);
  }

  /* ยอดยกมาต้องลงหลังตารางอะไหล่ เพราะมันอ่านต้นทุนจากแถวอะไหล่
     กันซ้ำด้วย "มี batch อยู่แล้วไม่แตะ" — รัน setup() ซ้ำกี่ครั้งสต๊อกก็ไม่เพิ่ม */
  let open = { received: 0, already: false };
  try { open = seedOpeningStock_(); }
  catch (e) { Logger.log('ยอดยกมาลงไม่สำเร็จ: ' + e.message); }

  /* ล็อกชีตหลักฐานทุกครั้งที่รัน — ชีตที่เพิ่งสร้างรอบนี้จะได้ด้วย
     ล็อกไม่สำเร็จต้องไม่ล้ม setup — ข้อมูลที่ลงไปแล้วสำคัญกว่า */
  let locked = 0;
  try { locked = protectSheets_(true); }
  catch (e) { Logger.log('ล็อกชีตไม่สำเร็จ: ' + e.message); }

  const msg = (seeded.parts || seeded.tools || seeded.blades || open.received
    ? 'setup เสร็จ · ลงข้อมูลให้แล้ว: อะไหล่ ' + seeded.parts + ' · เครื่องมือ ' + seeded.tools +
      ' · ใบมีด ' + seeded.blades + ' · ยอดยกมา ' + open.received +
      ' — ต่อไปตั้งผู้ใช้ + PIN'
    : 'setup เสร็จ · ชีตมีข้อมูลอยู่แล้ว ไม่ได้เขียนทับ') +
    ' · ล็อกชีตหลักฐาน ' + locked + ' ชีต';
  ss.toast(msg, 'ระบบ Stock อะไหล่', 15);
  Logger.log(msg);
}

/* ========================================================================== *
 *  10. TESTS — pure, ไม่แตะชีต  (รัน runAllTests ใน editor)
 * ========================================================================== */

function assertEq_(got, want, what) {
  if (got !== want) throw new Error(what + ': got ' + got + ', want ' + want);
}

/** header + แถว batch แบบย่อ สำหรับเทสต์ */
function fakeBatches_(list) {
  const rows = [['Batch_ID', 'Part_No', 'Received', 'Expiry', 'Qty_In', 'Qty_Left', 'Cost', 'Supplier', 'Ref']];
  list.forEach(function (b) {
    rows.push([b.id, b.part, b.rec || new Date(2026, 0, 1), b.exp || '', b.left, b.left, b.cost, '', '']);
  });
  return rows;
}

function testFifo_() {
  const d = function (y, m, day) { return new Date(y, m - 1, day); };

  // เข้าก่อนออกก่อน และกระจายข้าม batch
  let rows = fakeBatches_([
    { id: 'B1', part: 'P1', rec: d(2026, 1, 1), left: 3, cost: 10 },
    { id: 'B2', part: 'P1', rec: d(2026, 2, 1), left: 5, cost: 12 }
  ]);
  let r = drawFifo_(rows, 'P1', 4, false);
  assertEq_(r.picks.length, 2, 'ข้าม batch');
  assertEq_(r.picks[0].batchId, 'B1', 'ของเก่าออกก่อน');
  assertEq_(r.cost, 3 * 10 + 1 * 12, 'ต้นทุนตาม batch ที่หยิบจริง');
  assertEq_(rows[1][B.QTY_LEFT], 0, 'B1 หมด');
  assertEq_(rows[2][B.QTY_LEFT], 4, 'B2 เหลือ 4');

  // มีวันหมดอายุ → ใกล้หมดก่อน แม้จะรับเข้าทีหลัง
  rows = fakeBatches_([
    { id: 'B1', part: 'P1', rec: d(2026, 1, 1), left: 5, cost: 10 },
    { id: 'B2', part: 'P1', rec: d(2026, 3, 1), exp: d(2030, 1, 1), left: 5, cost: 20 }
  ]);
  assertEq_(drawFifo_(rows, 'P1', 1, false).picks[0].batchId, 'B2', 'FEFO มาก่อน FIFO');

  // ของหมดอายุเบิกไปใช้ไม่ได้ แต่ตัดจำหน่าย/นับสต๊อกได้
  rows = fakeBatches_([{ id: 'B1', part: 'P1', exp: d(2020, 1, 1), left: 5, cost: 10 }]);
  let threw = false;
  try { drawFifo_(rows, 'P1', 1, false); } catch (e) { threw = true; }
  if (!threw) throw new Error('ของหมดอายุถูกเบิกออกไปได้');
  assertEq_(rows[1][B.QTY_LEFT], 5, 'ของไม่ถูกแตะเมื่อ throw');
  assertEq_(drawFifo_(rows, 'P1', 5, true).picks.length, 1, 'ตัดจำหน่ายของหมดอายุได้');

  // ของไม่พอ: throw ก่อน และไม่แก้อะไรเลย
  rows = fakeBatches_([{ id: 'B1', part: 'P1', left: 2, cost: 10 }]);
  threw = false;
  try { drawFifo_(rows, 'P1', 3, true); } catch (e) { threw = /ไม่พอ/.test(e.message); }
  if (!threw) throw new Error('เบิกเกินของที่มีได้');
  assertEq_(rows[1][B.QTY_LEFT], 2, 'ไม่แก้ค่าเมื่อของไม่พอ');

  Logger.log('testFifo_ OK');
}

function testReturn_() {
  const rows = fakeBatches_([
    { id: 'B1', part: 'P1', left: 0, cost: 10 },
    { id: 'B2', part: 'P1', left: 1, cost: 12 }
  ]);
  // เบิกไป 4: B1 x3 | B2 x1 — คืน 2 ต้องย้อน pick ล่าสุดก่อน
  const cost = returnToBatches_(rows, 'B1 x3 | B2 x1', 2);
  assertEq_(rows[2][B.QTY_LEFT], 2, 'B2 รับคืน 1');
  assertEq_(rows[1][B.QTY_LEFT], 1, 'B1 รับคืน 1');
  assertEq_(cost, 12 + 10, 'ต้นทุนที่คืนกลับ');

  assertEq_(parsePicks_('B1 x3 | B2 x1').length, 2, 'อ่าน label กลับได้');
  assertEq_(picksLabel_([{ batchId: 'B1', qty: 3 }]), 'B1 x3', 'เขียน label');

  let threw = false;
  try { returnToBatches_(rows, 'GONE x2', 1); } catch (e) { threw = /หายไป/.test(e.message); }
  if (!threw) throw new Error('คืนเข้า batch ที่ไม่มีอยู่ได้');
  Logger.log('testReturn_ OK');
}

function testAudit_() {
  assertEq_(rowDiff_(['45'], [45], ['Cost']).length, 0, '"45" กับ 45 ไม่ใช่การเปลี่ยน');
  assertEq_(rowDiff_([new Date(2026, 0, 1)], [new Date(2026, 0, 1, 13)], ['Exp']).length, 0, 'วันเดียวกันไม่ต่าง');
  assertEq_(rowDiff_([10], [12], ['Cost'])[0][2], '12', 'ค่าที่เปลี่ยนถูกบันทึก');
  assertEq_(rowDiff_([true], [false], ['Active'])[0][1], 'TRUE', 'checkbox อ่านเป็นข้อความ');
  Logger.log('testAudit_ OK');
}

function testArchive_() {
  const cutoff = new Date(2026, 5, 1);
  const rows = fakeBatches_([
    { id: 'B1', part: 'P1', rec: new Date(2026, 0, 1), left: 0, cost: 10 },   // หมด + เก่า => ย้ายได้
    { id: 'B2', part: 'P1', rec: new Date(2026, 0, 1), left: 2, cost: 10 },   // ยังมีของ => เก็บไว้
    { id: 'B3', part: 'P1', rec: new Date(2026, 7, 1), left: 0, cost: 10 }    // หมดแต่ยังใหม่ => เก็บไว้ (ยังคืนของได้)
  ]);
  const split = pickArchivable_(rows, cutoff);
  assertEq_(split.move.length, 1, 'ย้ายแค่ batch ที่หมดและเก่า');
  assertEq_(split.move[0][B.ID], 'B1', 'ย้ายใบที่ถูกต้อง');
  assertEq_(split.keep.length, 2, 'ที่เหลือเก็บไว้');
  Logger.log('testArchive_ OK');
}

function testDupes_() {
  const rows = [['Part_No'], ['BRG-6204'], ['BLT-A45'], ['brg-6204'], [' BLT-A45 '], ['SEL-1'], ['']];
  const d = findDupes_(rows);
  assertEq_(d.length, 2, 'เจอรหัสซ้ำสองตัว');
  assertEq_(d.indexOf('BRG-6204') >= 0, true, 'จับซ้ำแบบต่างตัวพิมพ์');
  assertEq_(d.indexOf('BLT-A45') >= 0, true, 'จับซ้ำที่ต่างแค่ช่องว่าง');
  assertEq_(findDupes_([['Part_No'], ['A'], ['B']]).length, 0, 'ไม่ซ้ำก็ต้องไม่แจ้ง');
  Logger.log('testDupes_ OK');
}

function testReorder_() {
  // เติมถึง Max
  assertEq_(reorderQty_(2, 10, 30, 0), 28, 'เติมขึ้นไปถึง Max');
  // ไม่ตั้ง Max ใช้ 2 × Min
  assertEq_(reorderQty_(3, 10, 0, 0), 17, 'ไม่มี Max ใช้ 2 × Min');
  // MOQ ปัดขึ้นเป็นจำนวนเท่า
  assertEq_(reorderQty_(2, 10, 30, 10), 30, 'ปัดขึ้นให้ครบ MOQ');
  assertEq_(reorderQty_(28, 10, 30, 25), 25, 'ต้องการ 2 แต่ผู้ขายขายขั้นต่ำ 25');
  // ของยังไม่ขาดแต่แตะจุดสั่งซื้อ: ต้องสั่งอย่างน้อย 1 ไม่ใช่ 0 หรือติดลบ
  assertEq_(reorderQty_(50, 10, 30, 0), 1, 'ของเกิน Max ก็ยังสั่งขั้นต่ำ 1');
  Logger.log('testReorder_ OK');
}

function testPartCode_() {
  // ตัวอย่างจริงจากไฟล์มาตรฐาน — ประกอบแล้วต้องได้รหัสเดิมเป๊ะ
  assertEq_(buildPartCode_(6, 0, 1, '001', 'M001', 20), '60001001M001-0020', 'ตัวอย่างในไฟล์ แถว 9');
  assertEq_(buildPartCode_(6, '00', '02', '000', 'E001', 1), '60002000E001-0001', 'E-Clip แถวแรกของข้อมูลเดิม');
  assertEq_(buildPartCode_('6', '00', '01', '001', 'm001', 1), '60001001M001-0001', 'อักษรย่อถูกทำเป็นตัวใหญ่');
  assertEq_(buildPartCode_(6, 0, 1, 1, 'M001', 1).length, 17, 'รหัสยาว 17 ตัวเสมอ');

  // แยกกลับ
  const p = parsePartCode_('60002064T006-0035');
  assertEq_(p.group, '6', 'group'); assertEq_(p.usage, '00', 'usage');
  assertEq_(p.type, '02', 'type');  assertEq_(p.key3, '064', 'key3');
  assertEq_(p.code4, 'T006', 'code4'); assertEq_(p.running, 35, 'running');
  assertEq_(parsePartCode_('60401CM01-'), null, 'แถวเดิมที่ไม่ครบโครง = ไม่เข้าแบบ');
  assertEq_(parsePartCode_('BRG-6204'), null, 'รหัสนอกมาตรฐาน = ไม่เข้าแบบ');

  // Running นับต่อ code4 ทั้งระบบ ข้าม Type/การใช้งาน (ยืนยันจากข้อมูลเดิม M001 0001–0019)
  const codes = ['60001001M001-0001', '60101001M001-0019', '60002064T006-0040',
                 '60401CM01-', '60002022MIX2-0001', 'BRG-6204'];
  assertEq_(nextRunning_(codes, 'M001'), 20, 'ต่อจากเลขสูงสุดของ code4 นั้น ข้ามคนละ usage');
  assertEq_(nextRunning_(codes, 'T006'), 41, 'ไม่ถมรูที่ว่าง เอาต่อจาก MAX');
  assertEq_(nextRunning_(codes, 'B004'), 1, 'code4 ที่ยังไม่เคยใช้เริ่มที่ 1');
  assertEq_(nextRunning_(codes, 'MIX2'), 2, 'แถวที่เอาอักษรย่อเครื่องมาใส่ก็ยังนับของตัวเองได้');
  assertEq_(nextRunning_(codes, 'CM01'), 1, 'แถว CM01 ที่ไม่ครบโครงไม่ถูกนับ');
  assertEq_(nextRunning_([], 'M001'), 1, 'ระบบเปล่าเริ่มที่ 1');

  // เลข 4 หลักต้องไม่ล้นรูปแบบ
  assertEq_(buildPartCode_(6, 0, 1, '001', 'M001', 9999), '60001001M001-9999', 'running เต็ม 4 หลัก');
  Logger.log('testPartCode_ OK');
}

function testBlade_() {
  const d = function (y, m, day) { return new Date(y, m - 1, day); };
  assertEq_(daysBetween_(d(2026, 1, 1), d(2026, 1, 16)), 15, 'นับวันที่ใช้จริง');
  assertEq_(daysBetween_(d(2026, 1, 1), d(2026, 1, 1)), 0, 'ติดตั้งแล้วถอดวันเดียวกัน = 0 วัน');
  assertEq_(daysBetween_(d(2026, 2, 1), d(2026, 1, 1)), 0, 'วันย้อนหลังไม่ทำให้ติดลบ');
  assertEq_(daysBetween_('', d(2026, 1, 1)), 0, 'ไม่มีวันติดตั้ง = 0');
  // ข้ามปีและเดือนที่ยาวไม่เท่ากัน (ข้อมูลเดิมมีช่วง 250 วัน)
  assertEq_(daysBetween_(d(2025, 1, 22), d(2025, 9, 29)), 250, 'ช่วง 250 วันจากข้อมูลเดิม');
  // สถานะต้องครบและเรียงตามลำดับที่หน้าจอใช้จัดกลุ่ม
  assertEq_(BLADE_STATUS.length, 5, 'มี 5 สถานะ');
  assertEq_(BLADE_STATUS[0], BLADE_SPARE, 'สำรองมาก่อน');
  assertEq_(BLADE_STATUS.indexOf(BLADE_USE) > 0, true, 'ติดตั้งอยู่อยู่ในลิสต์');
  Logger.log('testBlade_ OK');
}

function runAllTests() {
  testFifo_();
  testPartCode_();
  testBlade_();
  testReturn_();
  testAudit_();
  testArchive_();
  testDupes_();
  testReorder_();
  testAuth_();          // Auth.gs
  Logger.log('ALL TESTS OK');
}
