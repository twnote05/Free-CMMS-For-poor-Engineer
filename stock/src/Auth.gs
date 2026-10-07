/*! Free CMMS for poor engineers — https://github.com/twnote05/Free-CMMS-For-poor-Engineer
 *  Required Notice: Copyright 2026 IE จอมขี้เกียจ
 *  PolyForm Noncommercial 1.0.0 — ห้ามใช้เชิงพาณิชย์ · ดู LICENSE.md
 */
/**
 * ============================================================================
 *  AUTH — รหัส PIN, session, และประตูเดียวที่เบราว์เซอร์เรียกได้
 *
 *  Web App ที่ deploy เป็น "Execute as: Me" มองไม่เห็นว่าใครเรียกมา ตัวตนจาก
 *  Google จึงแยกช่างออกจากเจ้าหน้าที่คลังไม่ได้ ทุกคำขอจากเบราว์เซอร์จึงวิ่งผ่าน
 *  call() พร้อม session token และ requireRole_() อ่านสิทธิ์จาก session นั้น
 *  ไม่ใช่จาก Session.getActiveUser()
 *
 *  ที่นี่ไม่มีการทำให้ง่ายลง: PIN ถูก salt + hash, token หมดอายุ, ใส่ผิดหลายครั้ง
 *  บัญชีถูกล็อก และเรียกได้เฉพาะชื่อที่อยู่ใน allowlist ด้านล่าง
 *
 *  ช่างที่สแกนเบิกของเอง: เบิกได้ ดูสต๊อกได้ ดูใบเบิกของตัวเองได้
 *  ทุกฟังก์ชันที่ "แก้ข้อมูล" ต้องหัวหน้าช่างขึ้นไป — บังคับที่เซิร์ฟเวอร์ ไม่ใช่ซ่อนปุ่ม
 *
 *  ไม่มีแอดมินคอยมอนิเตอร์ จึงมีทางออกฉุกเฉิน: รัน emergencyResetPin() จาก
 *  Apps Script editor ได้เสมอ (ดูท้ายไฟล์) เพราะ currentUser_() คืนสิทธิ์สูงสุดจาก editor
 * ============================================================================
 */

const SESSION_PREFIX = 'sess_';
const SESSION_HOURS = 12;          // หนึ่งกะ เช้าวันถัดไปใส่ PIN ใหม่
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

/** ตั้งค่าโดย call() ตลอดอายุของหนึ่ง request */
let SESSION_USER = null;
let SESSION_TOKEN = '';

/* ========================================================================== *
 *  การเก็บ PIN
 * ========================================================================== */

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function randomHex_(bytes) {
  let out = '';
  for (let i = 0; i < bytes; i++) out += ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
  return out + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

function hashPin_(pin, salt) { return sha256_(salt + ':' + String(pin)); }

/** เทียบแบบเวลาคงที่ เพื่อไม่ให้เดา PIN ทีละตัวจากเวลาตอบสนองได้ */
function sameHash_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ========================================================================== *
 *  Sessions
 * ========================================================================== */

function newSession_(email, role, name, photo) {
  const token = randomHex_(24);
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  PropertiesService.getScriptProperties().setProperty(SESSION_PREFIX + token,
    JSON.stringify({ email: email, role: role, name: name, photo: photo || '', exp: exp }));
  return { token: token, exp: exp };
}

function tokenUser_(token) {
  if (!token) return null;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(SESSION_PREFIX + token);
  if (!raw) return null;
  let s;
  try { s = JSON.parse(raw); } catch (e) { return null; }
  if (!s.exp || s.exp < Date.now()) { props.deleteProperty(SESSION_PREFIX + token); return null; }
  return s;
}

/** เก็บกวาด เพื่อไม่ให้ Script Properties เต็มไปด้วย session ที่ตายแล้ว */
function sweepSessions_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESSION_PREFIX) !== 0) return;
    try { if ((JSON.parse(all[k]).exp || 0) < now) props.deleteProperty(k); }
    catch (e) { props.deleteProperty(k); }
  });
}

/* ========================================================================== *
 *  เข้า / ออกระบบ
 * ========================================================================== */

/**
 * @param {string} email อีเมลตามที่อยู่ในชีต Users
 * @param {string} pin   4–8 หลัก
 */
function login(email, pin) {
  return lock_(function () {
    email = String(email || '').trim().toLowerCase();
    pin = String(pin || '').trim();
    if (!email || !pin) throw new Error('กรอกอีเมลและรหัส PIN');
    if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN ต้องเป็นตัวเลข 4–8 หลัก');

    const sh = sheet_(SH.USERS);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][US.EMAIL]).trim().toLowerCase() !== email) continue;
      if (rows[i][US.ACTIVE] === false) throw new Error('บัญชีนี้ถูกปิดใช้งาน');

      const lockedUntil = rows[i][US.LOCKED] instanceof Date ? rows[i][US.LOCKED].getTime() : 0;
      if (lockedUntil > Date.now()) {
        throw new Error('ถูกล็อกอีก ' + Math.ceil((lockedUntil - Date.now()) / 60000) + ' นาที');
      }

      const storedHash = String(rows[i][US.PIN] || '');
      const salt = String(rows[i][US.SALT] || '');
      const role = String(rows[i][US.ROLE] || 'TECH').toUpperCase();
      const name = String(rows[i][US.NAME] || email);
      const photo = String(rows[i][US.PHOTO] || '');

      // เข้าครั้งแรกคือการตั้ง PIN ของบัญชีนั้น — ตั้ง PIN ให้ทุกคนทันทีหลัง deploy
      // ก่อนหน้านั้น ใครที่รู้อีเมลในลิสต์ก็ยึดบัญชีได้
      if (!storedHash) {
        const newSalt = randomHex_(8);
        sh.getRange(i + 1, US.PIN + 1, 1, 2).setValues([[hashPin_(pin, newSalt), newSalt]]);
        sh.getRange(i + 1, US.FAILED + 1, 1, 2).setValues([[0, '']]);
        logAudit_('ENROL_PIN', email, [['PIN', '', 'set']]);
        const s = newSession_(email, role, name, photo);
        return { token: s.token, exp: s.exp, role: role, name: name, email: email, photo: photo, enrolled: true };
      }

      if (!sameHash_(hashPin_(pin, salt), storedHash)) {
        const failed = (Number(rows[i][US.FAILED]) || 0) + 1;
        const until = failed >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60000) : '';
        sh.getRange(i + 1, US.FAILED + 1, 1, 2).setValues([[failed, until]]);
        if (until) logAudit_('LOCK_ACCOUNT', email, [['Failed_Attempts', '', String(failed)]]);
        throw new Error(until ? 'ใส่ PIN ผิดหลายครั้ง — ล็อก ' + LOCK_MINUTES + ' นาที'
                              : 'PIN ไม่ถูกต้อง เหลืออีก ' + (MAX_FAILURES - failed) + ' ครั้ง');
      }

      sh.getRange(i + 1, US.FAILED + 1, 1, 2).setValues([[0, '']]);
      sweepSessions_();
      const s = newSession_(email, role, name, photo);
      return { token: s.token, exp: s.exp, role: role, name: name, email: email, photo: photo, enrolled: false };
    }
    // ข้อความเดียวกันทั้งสองกรณี: ไม่บอกว่าอีเมลไหนมีอยู่ในระบบ
    throw new Error('อีเมลหรือ PIN ไม่ถูกต้อง');
  });
}

function logout(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty(SESSION_PREFIX + token);
  return true;
}

/** ใครก็เปลี่ยน PIN ของตัวเองได้ แต่ต้องยืนยันรหัสเดิม */
function changeMyPin(oldPin, newPin) {
  const me = currentUser_();
  return lock_(function () {
    if (!/^\d{4,8}$/.test(String(newPin || ''))) throw new Error('PIN ใหม่ต้องเป็นตัวเลข 4–8 หลัก');
    const sh = sheet_(SH.USERS);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][US.EMAIL]).trim().toLowerCase() !== me.email.toLowerCase()) continue;
      const stored = String(rows[i][US.PIN] || '');
      if (stored && !sameHash_(hashPin_(String(oldPin || ''), String(rows[i][US.SALT] || '')), stored)) {
        throw new Error('PIN เดิมไม่ถูกต้อง');
      }
      const salt = randomHex_(8);
      sh.getRange(i + 1, US.PIN + 1, 1, 4).setValues([[hashPin_(newPin, salt), salt, 0, '']]);
      logAudit_('CHANGE_OWN_PIN', me.email, [['PIN', 'set', 'changed']]);
      return true;
    }
    throw new Error('บัญชีของคุณไม่อยู่ในชีต Users แล้ว');
  });
}

/** วิศวกรปฏิบัติการ: ตั้งหรือล้าง PIN ของคนอื่น — ล้างแล้วเจ้าตัวตั้งใหม่ได้ตอนเข้าครั้งถัดไป */
function setPin(email, pin) {
  requireRole_('ENG');
  return lock_(function () {
    email = String(email || '').trim().toLowerCase();
    const sh = sheet_(SH.USERS);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][US.EMAIL]).trim().toLowerCase() !== email) continue;
      if (pin === '' || pin === null || pin === undefined) {
        sh.getRange(i + 1, US.PIN + 1, 1, 4).setValues([['', '', 0, '']]);
        logAudit_('RESET_PIN', email, [['PIN', 'set', 'cleared']]);
        return { email: email, hasPin: false };
      }
      if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN ต้องเป็นตัวเลข 4–8 หลัก');
      const salt = randomHex_(8);
      sh.getRange(i + 1, US.PIN + 1, 1, 4).setValues([[hashPin_(pin, salt), salt, 0, '']]);
      logAudit_('SET_PIN', email, [['PIN', '', 'set']]);
      return { email: email, hasPin: true };
    }
    throw new Error('ไม่พบผู้ใช้: ' + email);
  });
}

/* ========================================================================== *
 *  ทางออกฉุกเฉิน — สำหรับทีมที่ไม่มีแอดมินคอยดูแล
 * ========================================================================== */

/**
 * ใช้เมื่อวิศวกรปฏิบัติการเข้าระบบไม่ได้ทุกคน (ลืม PIN / บัญชีถูกล็อก / ถูกปิดใช้งาน)
 *
 * วิธีใช้: แก้สองบรรทัดล่างนี้เป็นอีเมลและ PIN ที่ต้องการ → เลือก `emergencyResetPin`
 * ใน dropdown ของ Apps Script editor → กด Run
 *
 * ทำงานได้เพราะรันจาก editor แล้ว currentUser_() คืนสิทธิ์สูงสุด และฟังก์ชันนี้
 * **ไม่อยู่ใน allowlist ของ API** จึงเรียกจากเบราว์เซอร์ไม่ได้เลย — คนที่มีสิทธิ์แก้
 * โค้ดใน Apps Script คือเจ้าของสเปรดชีตเท่านั้น ไม่ใช่คนที่มีแค่ลิงก์เว็บแอป
 */
function emergencyResetPin() {
  const EMAIL = 'someone@example.com';     // ← แก้เป็นอีเมลของคนที่จะปลดล็อก
  const NEW_PIN = '1234';                  // ← แก้เป็น PIN ใหม่ (4–8 หลัก) แล้วเปลี่ยนทันทีหลังเข้าได้

  const sh = sheet_(SH.USERS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][US.EMAIL]).trim().toLowerCase() !== EMAIL.trim().toLowerCase()) continue;
    sh.getRange(i + 1, US.ACTIVE + 1).setValue(true);          // เปิดบัญชีคืนถ้าถูกปิดไว้
    sh.getRange(i + 1, US.ROLE + 1).setValue('ENG');           // คืนสิทธิ์สูงสุด
    const salt = randomHex_(8);
    sh.getRange(i + 1, US.PIN + 1, 1, 4).setValues([[hashPin_(NEW_PIN, salt), salt, 0, '']]);
    logAudit_('EMERGENCY_RESET', EMAIL, [['PIN', 'locked/unknown', 'reset from editor']]);
    Logger.log('ปลดล็อก ' + EMAIL + ' แล้ว · PIN = ' + NEW_PIN + ' · เข้าระบบแล้วเปลี่ยน PIN ทันที');
    return 'ปลดล็อก ' + EMAIL + ' แล้ว';
  }
  Logger.log('ไม่พบอีเมลนี้ในชีต Users: ' + EMAIL + ' — ตรวจตัวสะกดหรือเพิ่มแถวใหม่ในชีต Users ก่อน');
  throw new Error('ไม่พบอีเมล: ' + EMAIL);
}

/* ========================================================================== *
 *  ตรวจสิทธิ์ — อ่านจาก session ไม่ใช่จากบัญชี Google
 * ========================================================================== */

function currentUser_() {
  if (SESSION_USER) return SESSION_USER;
  // รันจาก editor ตรง ๆ (setup, tests, trigger): สิทธิ์เต็ม
  return { email: Session.getEffectiveUser().getEmail() || 'script', role: 'ENG', name: 'script' };
}

/**
 * session คือภาพถ่ายตอนเข้าระบบ ถ้าแก้ชื่อ รูป หรือสิทธิ์ทีหลังจะไม่เห็นจนกว่าจะ
 * เข้าใหม่ getBoot() เรียกตัวนี้เพื่อดึงสามฟิลด์นั้นมาสด ๆ แล้วเขียนกลับลง session
 * ผลพลอยได้คือการลดสิทธิ์มีผลตอนโหลดหน้าถัดไป ไม่ต้องรอ 12 ชั่วโมง
 */
function refreshSession_() {
  const me = currentUser_();
  if (!SESSION_USER) return me;                       // รันจาก editor
  const sh = ss_().getSheetByName(SH.USERS);
  if (!sh || sh.getLastRow() < 2) return me;

  const email = String(me.email).trim().toLowerCase();
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][US.EMAIL]).trim().toLowerCase() !== email) continue;
    if (rows[i][US.ACTIVE] === false) throw new Error('บัญชีนี้ถูกปิดใช้งาน');
    SESSION_USER.name = String(rows[i][US.NAME] || me.email);
    SESSION_USER.photo = String(rows[i][US.PHOTO] || '');
    SESSION_USER.role = String(rows[i][US.ROLE] || 'TECH').toUpperCase();
    if (SESSION_TOKEN) {
      try {
        PropertiesService.getScriptProperties()
          .setProperty(SESSION_PREFIX + SESSION_TOKEN, JSON.stringify(SESSION_USER));
      } catch (e) { /* การรีเฟรชเป็นของแถม ห้ามทำให้โหลดหน้าพัง */ }
    }
    return SESSION_USER;
  }
  return me;
}

/* ========================================================================== *
 *  ประตู — ฟังก์ชันเดียวที่เบราว์เซอร์เรียกได้
 * ========================================================================== */

/** ทุกอย่างที่ฝั่งเบราว์เซอร์เรียกได้ ระบุด้วยชื่อ */
const API = {
  // เปิดให้ใครก็ได้ที่โหลดหน้าเว็บนี้
  login: login,
  logout: logout,

  // ต้องมี session (สิทธิ์ละเอียดถูกเช็กในตัวฟังก์ชันเอง)
  getBoot: getBoot, getCatalog: getCatalog, changeMyPin: changeMyPin,

  // TECH ขึ้นไป — เบิก คืน ดูใบเบิกของตัวเอง ดูบัตรสต๊อก
  issue: issue, returnParts: returnParts, getIssues: getIssues, findIssue: findIssue,
  getStockCard: getStockCard, previewPartCode: previewPartCode,

  // เครื่องมือช่าง + ใบมีด — ช่างดูได้และเปลี่ยนสถานะใบมีดได้ แก้ข้อมูลหลักต้องหัวหน้าช่าง
  getTools: getTools, saveTool: saveTool,
  getBlades: getBlades, saveBlade: saveBlade, bladeAction: bladeAction, getBladeLog: getBladeLog,

  // หัวหน้าช่างขึ้นไป — รับเข้า สั่งซื้อ นับสต๊อก ตัดจำหน่าย แก้ข้อมูลอะไหล่ รายงาน
  receive: receive, generatePO: generatePO, getOpenPOs: getOpenPOs, cancelPO: cancelPO,
  auditStock: auditStock, scrap: scrap, getReport: getReport,
  savePart: savePart, addCodeCategory: addCodeCategory, archivePart: archivePart, updateBatch: updateBatch, saveMachine: saveMachine,

  // วิศวกรปฏิบัติการ — ผู้ใช้ ตั้งค่า ประวัติ เก็บกวาด
  getUsers: getUsers, saveUser: saveUser, setPin: setPin, linkPartImages: linkPartImages, savePartImage: savePartImage, getStorageHealth: getStorageHealth, backupAndTrim: backupAndTrim, protectSheets: protectSheets, seedOpeningStock: seedOpeningStock,
  saveSettings: saveSettings, getAuditLog: getAuditLog,
  archiveEmptyBatches: archiveEmptyBatches, installTriggers: installTriggers
};

const PUBLIC_API = { login: true, logout: true };

/**
 * ทางเข้าเดียวของ google.script.run: ตรวจ session แล้วส่งต่อตามชื่อ
 * เพิ่ม endpoint ใหม่ = เพิ่มหนึ่งบรรทัดใน API และ helper ส่วนตัว (ชื่อลงท้าย _)
 * ไม่มีทางเรียกจากเบราว์เซอร์ได้เลย
 */
function call(token, fnName, args) {
  const fn = API[fnName];
  if (typeof fn !== 'function') throw new Error('ไม่รู้จักคำสั่ง: ' + fnName);

  if (PUBLIC_API[fnName]) {
    SESSION_USER = null;
    return fn.apply(null, args || []);
  }

  const session = tokenUser_(token);
  if (!session) throw new Error('SESSION_EXPIRED');   // ฝั่งเบราว์เซอร์จะเด้งไปหน้าล็อก
  SESSION_USER = session;
  SESSION_TOKEN = token;
  try {
    return fn.apply(null, args || []);
  } finally {
    SESSION_USER = null;
    SESSION_TOKEN = '';
  }
}

/* ========================================================================== *
 *  TESTS — pure, ไม่แตะชีต
 * ========================================================================== */

function testAuth_() {
  // hash ต้อง salt: PIN เดียวกันต่าง salt ต้องไม่ชนกัน
  const h1 = hashPin_('1234', 'aaaa');
  const h2 = hashPin_('1234', 'bbbb');
  if (h1 === h2) throw new Error('ไม่ได้ใช้ salt');
  if (h1.length !== 64) throw new Error('ไม่ใช่ sha-256 hex');
  assertEq_(hashPin_('1234', 'aaaa'), h1, 'hash เดิมได้ค่าเดิม');

  assertEq_(sameHash_(h1, h1), true, 'hash ตรงกัน');
  assertEq_(sameHash_(h1, h2), false, 'hash ต่างกัน');
  assertEq_(sameHash_('abc', 'abcd'), false, 'ความยาวต่างกันไม่ตรง');

  // token ต้องไม่ซ้ำ
  const seen = {};
  for (let i = 0; i < 50; i++) {
    const tok = randomHex_(24);
    if (seen[tok]) throw new Error('token ซ้ำ');
    if (tok.length < 48) throw new Error('token สั้นเกินไป');
    seen[tok] = true;
  }

  // ประตูต้องปฏิเสธชื่อที่ไม่อยู่ใน allowlist
  let threw = false;
  try { call('', 'drawFifo_', []); } catch (e) { threw = /ไม่รู้จักคำสั่ง/.test(e.message); }
  if (!threw) throw new Error('helper ส่วนตัวถูกเรียกผ่าน call() ได้');

  threw = false;
  try { call('not-a-token', 'getCatalog', []); } catch (e) { threw = /SESSION_EXPIRED/.test(e.message); }
  if (!threw) throw new Error('token ปลอมผ่านได้');

  // สิทธิ์: ช่างต้องแก้ข้อมูลไม่ได้ และเบิกได้
  SESSION_USER = { email: 'tech@x.com', role: 'TECH', name: 'ช่าง' };
  try {
    threw = false;
    try { requireRole_('LEAD'); } catch (e) { threw = /สิทธิ์ไม่พอ/.test(e.message); }
    if (!threw) throw new Error('ช่างผ่านด่านหัวหน้าช่างได้');
    requireRole_('TECH');                       // ต้องไม่ throw
    assertEq_(hasRole_('LEAD'), false, 'ช่างไม่ใช่หัวหน้าช่าง');
  } finally { SESSION_USER = null; }

  Logger.log('testAuth_ OK');
}
