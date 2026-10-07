/**
 * ระบบแจ้งซ่อมบำรุง — YOUR COMPANY
 * Google Apps Script: Sheet เป็นฐานข้อมูล, Drive เก็บรูป, GAS เสิร์ฟหน้าเว็บเอง
 * ฉบับปรับปรุงความปลอดภัยและประสิทธิภาพ (Rev.2)
 *
 * ── ติดตั้งครั้งเดียว ──────────────────────────────────────────────
 * 1) Project Settings > Script Properties เพิ่ม 4 ตัว
 *      SHEET_ID           = id ของ Google Sheet (จาก URL .../d/<SHEET_ID>/edit)
 *      DRIVE_FOLDER_ID    = id ของโฟลเดอร์ใน Drive ที่จะเก็บรูป
 *      DASHBOARD_PASSWORD = รหัสผ่านเปิด Dashboard/Export
 *      AUTH_SECRET        = ข้อความสุ่มยาว ๆ (รัน makeSecret() แล้วคัดลอกมา)
 * 2) รัน setup()        → สร้างชีตและหัวคอลัมน์
 * 3) รัน setupTriggers() → ตั้งแจ้งเตือนรายวันและออกใบ PM อัตโนมัติ
 * 4) Deploy > New deployment > Web app
 *      Execute as: Me    |    Who has access: Anyone
 *
 * ⚠️ Rev.2 เปลี่ยน signature ของ apiUpdateTicket เป็น (token, ticketId, changes)
 *    ต้องแก้ app.html ให้ส่ง token ด้วย — ดูหมายเหตุท้ายไฟล์
 * ─────────────────────────────────────────────────────────────────
 */

var SHEET_MAIN     = 'Sheet1';
var SHEET_PM       = 'PM รายเดือน';
var SHEET_MACHINES = 'ทะเบียนเครื่องจักร';
var SHEET_PMPLAN   = 'แผน PM';
var PMPLAN_HEAD = ['เครื่องจักร', 'งาน PM', 'รอบ (วัน)', 'ทำครั้งล่าสุด', 'ผู้รับผิดชอบ', 'ใช้งาน',
                   'ประเภทงาน', 'ชั่วโมงที่วางแผน', 'หัวข้อตรวจ'];
var SHEET_CONFIG   = 'ตั้งค่า';
var SHEET_USERS    = 'Users';           // ชื่อ/คอลัมน์ตรงกับ Auth.gs ของโปรเจค Stock อะไหล่
var SHEET_CHECK    = 'Daily Check';     // ชีตคำตอบของ Google Form เช็คชีตประจำวัน
var SHEET_AUDIT    = 'Audit';           // บันทึกการแก้ไขย้อนหลัง
var SHEET_HOLIDAY  = 'วันหยุด';         // วันหยุดของโรงงาน — ไม่ใช่วันหยุดราชการเสมอไป

/* หัวคอลัมน์ Sheet1 — เรียงให้ตรงกับไฟล์ แจ้งซ่อม.xlsx เดิม */
var HEADERS = [
  'ลำดับ', 'เวลาแจ้ง', 'วันที่แจ้ง', 'ฝ่าย', 'ผู้แจ้ง', 'ลักษณะงาน', 'เครื่องจักร',
  'ระบุรายละเอียด', 'สาเหตุ', 'ระบุความต้องการ', 'หมายเลขแจ้งซ่อม', 'ค่าใช้จ่าย', 'เลขที่ PR',
  'สถานะ', 'สถานะ (ละเอียด)', 'ลำดับความสำคัญ', 'กำหนดเสร็จ', 'ผู้รับผิดชอบ',
  'เริ่มซ่อม', 'เวลาซ่อมจบ', 'ผู้เข้าซ่อม', 'การซ่อม', 'ใช้เวลา',
  'ผู้ตรวจรับงาน', 'วันที่ตรวจรับ', 'ผลการตรวจรับ', 'สาเหตุที่ส่งกลับแก้ไข',
  'จำนวนครั้งที่ส่งกลับ', 'ประเภท', 'รูป',
  'ผู้รับซ่อมภายนอก', 'กำหนดรับคืน', 'เหตุผลที่ยกเลิก'
];

var AUDIT_HEADERS = ['เวลา', 'ผู้ใช้', 'การกระทำ', 'หมายเลขแจ้งซ่อม', 'ฟิลด์', 'ค่าเดิม', 'ค่าใหม่'];

/* เก้าคอลัมน์แรกเรียงตรงกับ Auth.gs ของโปรเจคระบบ Stock อะไหล่ (US ด้านล่าง) ห้ามสลับ
   "ชื่อเดิมที่เคยใช้" ต่อท้ายเป็นคอลัมน์ที่ 10 จึงไม่กระทบ index เดิม

   ช่อง "ผู้เข้าซ่อม" เคยเป็นข้อความพิมพ์เองอิสระ ชื่อคนเดียวกันจึงกระจายเป็นหลายแบบ
   ("ชล" / "ช่างชล" / "ชล+ตั้ม") ซึ่งเป็นปัญหาเดียวกับชื่อเครื่องจักรที่แตก 117 แบบ
   แก้ด้วยวิธีเดียวกัน: ชิปให้กดเลือกที่หน้าจอ + ตารางชื่อเดิมไว้กู้ข้อมูลเก่า */
var USERS_HEAD = ['อีเมล', 'ชื่อ-นามสกุล', 'บทบาท', 'ใช้งาน', 'PIN', 'SALT',
                  'FAILED', 'LOCKED', 'รูป', 'ชื่อเดิมที่เคยใช้', 'สถานีประจำ'];

/* ═══ ช่างเทคนิคประจำสถานี ═══
   ของจริงไม่ได้แบ่งเป็น "ช่างคนนี้ดูเครื่องนี้" แต่แบ่งเป็นกลุ่มเครื่องตามสายงาน
     ช่าง Ext      -> Extrusion 80 · 92 · 110 · Hot and Coolmix 2 · 3
     ช่าง UV       -> UV 2
     ช่าง Cut Slot -> Sloted 1 · 2 · Tranfer 1 · 3
     ช่าง XPE      -> XPE 1 · 2

   ผูกสองทาง: คนมีคอลัมน์ "สถานีประจำ" ในชีต Users ·
   เครื่องใช้คอลัมน์ "ผู้ดูแล" ในทะเบียนเครื่องจักรที่มีอยู่แล้ว ใส่ชื่อสถานีลงไปตรง ๆ
   ไม่เพิ่มคอลัมน์ให้ทะเบียน เพราะ "ผู้ดูแล" คือความหมายนี้อยู่แล้ว และส่งถึงหน้าเว็บอยู่แล้ว */
/** สถานีทั้งหมด — อ่านจากช่อง "ผู้ดูแล" ในทะเบียนเครื่องจักร

    เคยพิมพ์รายชื่อตายไว้ในโค้ด ('ช่าง Ext' ฯลฯ) แต่ของจริงในชีตใช้ 'EXT'
    สองฝั่งจึงไม่เคยตรงกันเลย และยังมี 'MT' ที่ไม่มีในโค้ดสักคำ

    รายชื่อที่ต้องตามข้อมูลให้ทัน คือรายชื่อที่ไม่ควรอยู่ในโค้ด */
function stations_() {
  var seen = {}, out = [];
  machines_().forEach(function (m) {
    var v = String(m.owner || '').trim();
    if (v && !seen[v]) { seen[v] = 1; out.push(v); }
  });
  return out.sort();
}

var FIELD_MAP = {
  ticket_id: 'หมายเลขแจ้งซ่อม',
  created_at: 'เวลาแจ้ง',
  department: 'ฝ่าย',
  reporter: 'ผู้แจ้ง',
  work_type: 'ลักษณะงาน',
  machine_name: 'เครื่องจักร',
  description: 'ระบุรายละเอียด',
  cause: 'สาเหตุ',
  action_needed: 'ระบุความต้องการ',
  cost: 'ค่าใช้จ่าย',
  pr_no: 'เลขที่ PR',
  status_legacy: 'สถานะ',
  status: 'สถานะ (ละเอียด)',
  priority: 'ลำดับความสำคัญ',
  due_at: 'กำหนดเสร็จ',
  assignee: 'ผู้รับผิดชอบ',
  started_at: 'เริ่มซ่อม',
  completed_at: 'เวลาซ่อมจบ',
  technician: 'ผู้เข้าซ่อม',
  repair_action: 'การซ่อม',
  repair_minutes: 'ใช้เวลา',
  verified_by: 'ผู้ตรวจรับงาน',
  verified_at: 'วันที่ตรวจรับ',
  verification_status: 'ผลการตรวจรับ',
  rejection_note: 'สาเหตุที่ส่งกลับแก้ไข',
  reject_count: 'จำนวนครั้งที่ส่งกลับ',
  source: 'ประเภท',
  image_url: 'รูป',
  vendor: 'ผู้รับซ่อมภายนอก',
  expect_back: 'กำหนดรับคืน',
  cancel_reason: 'เหตุผลที่ยกเลิก'
};

var DATE_FIELDS   = ['created_at', 'started_at', 'completed_at', 'verified_at', 'due_at', 'expect_back'];
var NUMBER_FIELDS = ['cost', 'repair_minutes', 'reject_count'];

/* ฟิลด์ที่คนไม่ได้ล็อกอินก็เห็นได้ — กรองที่ server เพราะถ้าซ่อนด้วย JS ใครเปิด DevTools ก็เห็น */
var PUBLIC_FIELDS = [
  'ticket_id', 'machine_name', 'work_type', 'description', 'cause', 'action_needed',
  'status', 'status_legacy', 'priority', 'due_at', 'assignee',
  'created_at', 'started_at', 'completed_at', 'reporter',
  'department', 'verified_by', 'verified_at', 'verification_status', 'rejection_note',
  'source', 'image_url', 'vendor', 'expect_back', 'cancel_reason'
];

/* ฟิลด์ที่ Guest (ฝ่ายผลิต) เขียนได้ตอนตรวจรับงาน ISO เท่านั้น
   แยกออกจาก apiUpdateTicket เพราะตัวนั้นบังคับล็อกอินแล้ว */
var VERIFY_FIELDS = ['verification_status', 'verified_by', 'rejection_note'];

var STATUS_DONE   = 'ซ่อมเสร็จสมบูรณ์';
var STATUS_WAIT   = 'รอฝ่ายผลิตตรวจสอบ';
var STATUS_OPEN   = 'รอซ่อม';
var STATUS_DOING  = 'กำลังซ่อม';
/* ของบางอย่างซ่อมเองไม่ได้ ต้องส่งออกไปข้างนอกหรือส่งเคลม ซึ่งกินเวลาเป็นสัปดาห์
   เดิมใบพวกนี้ค้างอยู่ที่ "กำลังซ่อม" ทำให้ MTTR เพี้ยนและไม่มีใครรู้ว่าของอยู่ที่ไหน
   แยกสถานะออกมาพร้อมช่อง "ผู้รับซ่อมภายนอก" กับ "กำหนดรับคืน" จะได้ตามของถูกที่ */
var STATUS_OUT    = 'ส่งซ่อมภายนอก';
/* ใบที่แจ้งผิด แจ้งซ้ำ หรือยกเลิกกลางทาง เดิมไม่มีทางปิดนอกจากลากผ่านขั้นตอนตรวจรับทั้งชุด
   ซึ่งไม่มีใครทำ ใบพวกนี้จึงค้างเป็น "งานค้าง" ตลอดไปและทำให้ตัวเลขทุกตัวเพี้ยน

   เลือก "เปลี่ยนสถานะ" ไม่ใช่ "ลบแถว" เพราะ ISO ต้องตามรอยได้ว่าใบนี้เคยมีอยู่และใครสั่งยกเลิก
   กู้คืนได้ตลอดด้วยการเปลี่ยนสถานะกลับ ข้อมูลไม่เคยหายไปจากชีต */
var STATUS_CANCEL = 'ยกเลิก';

var MAX_IMAGE_BYTES = 6 * 1024 * 1024;   // 6MB — กันคนอัปรูปจากกล้องมือถือเต็มความละเอียด

/* ระดับความสำคัญ + เวลาที่ต้องปิดงาน (ชม.)
   เดิมใช้ SLA ค่าเดียวกับทุกใบ ซึ่งไม่จริง — ไฟดับทั้งไลน์กับหลอดไฟเสียไม่ควรมีกำหนดเท่ากัน
   ปรับชั่วโมงได้ที่ชีต "ตั้งค่า" */
var PRIORITIES = [
  { key: 'วิกฤต',      hours: 4,   note: 'เครื่องหยุดผลิต / ไม่ปลอดภัย' },
  { key: 'ด่วน',       hours: 24,  note: 'ผลิตได้แต่เสี่ยงเสียหายเพิ่ม' },
  { key: 'ปกติ',       hours: 72,  note: 'ยังผลิตได้ตามปกติ' },
  { key: 'ไม่เร่งด่วน', hours: 168, note: 'งานปรับปรุง ทำเมื่อว่าง' }
];
var PRIORITY_DEFAULT = 'ปกติ';

/* ความต้องการของผู้แจ้ง — เดิมเป็นช่องพิมพ์อิสระ กรอกจริงแค่ 26 จาก 334 ใบ
   ทำเป็นตัวเลือกเพื่อให้นับสถิติได้ว่ามีงานกี่ใบที่หน้างานจัดการกันเองได้
   แก้รายการที่นี่ที่เดียว ฝั่งหน้าเว็บดึงไปสร้างดรอปดาวน์เอง */
var ACTION_NEEDED = ['ซ่อมเอง', 'ต้องการเรียกช่างซ่อมบำรุง'];

/** งานอาคาร ห้องน้ำ ประตู ไฟถนน ไม่มีเครื่องจักรให้เลือก — บังคับเฉพาะงานที่เป็นเครื่องจักรจริง
 *  (ของเดิมบังคับทุกใบ ทำให้งานกลุ่มนี้ซึ่งเป็น 23% ของทั้งหมด แจ้งเข้าระบบไม่ได้เลย) */
function needsMachine_(workType) {
  return String(workType || '').indexOf('เครื่องจักร') > -1;
}

function slaHoursFor_(priority) {
  for (var i = 0; i < PRIORITIES.length; i++) {
    if (PRIORITIES[i].key === priority) {
      return Number(cfg_('SLA ' + PRIORITIES[i].key, PRIORITIES[i].hours)) || PRIORITIES[i].hours;
    }
  }
  return Number(cfg_('SLA ' + PRIORITY_DEFAULT, 72)) || 72;
}

function dueFrom_(createdAt, priority) {
  var base = createdAt instanceof Date ? createdAt : new Date(createdAt || Date.now());
  return new Date(base.getTime() + slaHoursFor_(priority) * 3600 * 1000);
}

/* ─────────── หน้าเว็บ ─────────── */

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('index');

  // รับชื่อเครื่องจาก QR แต่ต้องมีอยู่จริงในทะเบียนเท่านั้น
  // ถ้าส่งค่าดิบเข้า template แล้ว index.html ใช้ <?!= ?> จะกลายเป็นช่อง XSS ทันที
  var raw = (e && e.parameter && e.parameter.machine) || '';
  t.prefillMachine = whitelistMachine_(raw);

  return t.evaluate()
    .setTitle('ระบบแจ้งซ่อมบำรุง — YOUR COMPANY')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** คืนชื่อมาตรฐานถ้าหาเจอในทะเบียน (เทียบได้ทั้งรหัสเครื่อง/ชื่อ/ชื่อเดิม) ไม่เจอคืนค่าว่าง */
function whitelistMachine_(raw) {
  var key = String(raw || '').trim();
  if (!key) return '';
  var list = machines_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].code && list[i].code.toLowerCase() === key.toLowerCase()) return list[i].name;
  }
  var c = canonical_(key);
  for (var j = 0; j < list.length; j++) if (list[j].name === c) return c;
  return '';
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ─────────── ตัวช่วย ─────────── */

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/* ═══════════ รหัสไฟล์/โฟลเดอร์ของ Google ═══════════
   คนตั้งค่าไม่ได้ก๊อปรหัสเปล่ามาวาง เขากด "คัดลอกลิงก์" แล้ววางทั้งลิงก์
   ซึ่งได้ค่าหน้าตาแบบนี้ลงไปใน Script Properties

     1AbCdEfGhIjKlMnOpQrStUvWxYz01234?usp=drive_link
     https://drive.google.com/drive/folders/1AbC...?usp=sharing

   DriveApp.getFolderById() ปฏิเสธทั้งสองแบบ แล้วโยน "รหัสไฟล์หรือโฟลเดอร์ไม่ถูกต้อง"
   ซึ่งเป็นข้อความที่อ่านแล้วไม่มีทางเดาได้ว่าต้องไปแก้ตรงไหน

   แก้ที่ตัวอ่านค่าครั้งเดียว ไม่ใช่ไปไล่บอกทุกคนให้ตัด ?usp ออกเอง
   เพราะคนตั้งค่าใหม่ในอีกสองปีก็จะวางลิงก์แบบเดิมอีก */
function driveId_(raw) {
  var v = String(raw == null ? '' : raw).trim();
  if (!v) return '';
  /* รหัสของ Google ยาว 25 ตัวขึ้นไปและมีแค่ A-Z a-z 0-9 _ -
     ชื่อโดเมนกับ path มีจุดและทับคั่นอยู่แล้ว จึงไม่โดนจับไปด้วย */
  var m = /[-\w]{25,}/.exec(v);
  return m ? m[0] : v.split(/[?#]/)[0];
}

function ss_() {
  var id = driveId_(prop_('SHEET_ID'));
  if (!id) throw new Error('ยังไม่ได้ตั้งค่า SHEET_ID ใน Script Properties');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต "' + name + '" — ลองรัน setup() ก่อน');
  return sh;
}

/** อ่านทั้งชีตเป็น array ของ object โดยใช้แถวแรกเป็นชื่อคีย์ */
function readSheet_(name) {
  var sh = sheet_(name);
  if (sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var head = values.shift();
  return values.map(function (r) {
    var o = {};
    head.forEach(function (h, i) { if (h) o[h] = r[i]; });
    return o;
  });
}

/** "ใช้งานอยู่ไหม" — รับได้ทั้ง boolean จาก checkbox และข้อความ 'ใช่'/'ไม่'
    เดิมชีต Users เช็ค !== false ส่วนทะเบียนเครื่องเช็ค !== 'ไม่' ทำให้ปิดคนละแบบ */
function isActive_(v) {
  if (v === true) return true;
  if (v === false) return false;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return true;                       // เว้นว่าง = ถือว่ายังใช้งาน (ตามพฤติกรรมเดิม)
  return ['ไม่', 'no', 'n', 'false', '0', 'ปิด', 'ยกเลิก', 'inactive'].indexOf(s) === -1;
}

function makeSecret() {
  var s = Utilities.getUuid() + Utilities.getUuid();
  Logger.log(s);
  return s;
}

function hmac_(msg) {
  var secret = prop_('AUTH_SECRET');
  if (!secret) throw new Error('ยังไม่ได้ตั้งค่า AUTH_SECRET ใน Script Properties');
  return Utilities.computeHmacSha256Signature(String(msg), secret)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/* token เดี๋ยวนี้เป็น base64(JSON).hmac ไม่ใช่ timestamp.hmac แบบเดิมแล้ว
   ถ้ายังเทียบ Number(parts[0]) จะได้ NaN ทุกครั้ง = หัวหน้าล็อกอินแล้วก็ยังเห็นข้อมูลแบบ public */
function verify_(token) {
  return !!userFromToken_(token);
}

var CACHE_KEY_USERS = 'usersnow_v1';
var CACHE_SEC_USERS = 60;   /* สั้นกว่าแคชอื่นมาก — ปิดบัญชีแล้วต้องมีผลเกือบทันที */

/** สิทธิ์ล่าสุดของทุกคนจากชีต Users — คืน null ถ้าอ่านชีตไม่ได้

    token อายุ 8 ชม. ระหว่างนั้นหัวหน้าอาจปิดบัญชีหรือลดบทบาทไปแล้ว
    ถ้าเชื่อสิ่งที่ติดมากับ token อย่างเดียว คนที่ถูกปิดบัญชียังทำงานต่อได้อีกค่อนวัน */
function usersNow_() {
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  if (cache) {
    var hit = cache.get(CACHE_KEY_USERS);
    if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  }
  var map;
  try {
    map = {};
    readSheet_(SHEET_USERS).forEach(function (u) {
      var mail = String(u['อีเมล'] || '').trim().toLowerCase();
      if (!mail) return;
      map[mail] = {
        name: String(u['ชื่อ-นามสกุล'] || '').trim(),
        role: String(u['บทบาท'] || 'TECH').toUpperCase(),
        station: String(u['สถานีประจำ'] || '').trim(),
        active: isActive_(u['ใช้งาน'])
      };
    });
  } catch (e) { return null; }   // ชีตมีปัญหา — อย่าล็อกทั้งโรงงานออกจากระบบ
  if (cache) { try { cache.put(CACHE_KEY_USERS, JSON.stringify(map), CACHE_SEC_USERS); } catch (e) {} }
  return map;
}

/** ใช้แทนการเช็ค token ซ้ำ ๆ ทุกฟังก์ชัน */
/**
 * @param {string} token
 * @param {string} [minRole] ต่ำสุดที่ยอมให้ผ่าน เช่น 'LEAD'
 * @return {{email:string,name:string,role:string,station:string}}
 */
function requireAuth_(token, minRole) {
  var u = userFromToken_(token);
  if (!u) throw new Error('ต้องเข้าสู่ระบบก่อน');

  /* บทบาทที่ติดมากับ token คือของตอนที่ล็อกอิน ไม่ใช่ของตอนนี้ */
  var all = usersNow_();
  if (all) {
    var now = all[String(u.email || '').trim().toLowerCase()];
    if (!now) throw new Error('ไม่พบบัญชีนี้ในระบบแล้ว — เข้าสู่ระบบใหม่');
    if (!now.active) throw new Error('บัญชีนี้ถูกปิดใช้งาน — ติดต่อผู้ดูแลระบบ');
    u.role = now.role;
    u.station = now.station;
    if (now.name) u.name = now.name;
  }

  if (minRole && (RANK[u.role] || 0) < (RANK[minRole] || 0)) {
    throw new Error('บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ (ต้องเป็นหัวหน้างานขึ้นไป)');
  }
  return u;
}

/** เทียบผ่าน HMAC เพื่อให้ทั้งสองฝั่งยาวเท่ากันเสมอ — ไม่ leak ความยาวรหัสผ่านจริง */
function safeEqual_(a, b) {
  var ha = hmac_(String(a == null ? '' : a));
  var hb = hmac_(String(b == null ? '' : b));
  var diff = 0;
  for (var i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

function iso_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  return String(v);
}

function toDate_(v) {
  if (!v) return null;
  var d = Object.prototype.toString.call(v) === '[object Date]' ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function thDate_(v) {
  var d = toDate_(v);
  if (!d) return '-';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/') + (d.getFullYear() + 543) +
         Utilities.formatDate(d, Session.getScriptTimeZone(), ' HH:mm');
}

/* ตั้งค่าทั้งชีตถูกอ่านครั้งเดียวต่อการรัน 1 ครั้ง
   เดิม apiGetConfig() เรียก cfg_() 5 รอบ = อ่านชีตเดิมซ้ำ 5 รอบโดยไม่จำเป็น */
var cfgCache_ = null;
function cfg_(key, fallback) {
  if (cfgCache_ === null) {
    cfgCache_ = {};
    try {
      readSheet_(SHEET_CONFIG).forEach(function (r) {
        var k = String(r['ชื่อค่า'] == null ? '' : r['ชื่อค่า']).trim();
        if (k) cfgCache_[k] = r['ค่า'];
      });
    } catch (e) {
      return fallback;                        // ยังไม่ได้รัน setup()
    }
  }
  var v = cfgCache_[key];
  return (v === '' || v === undefined || v === null) ? fallback : v;
}

/* ─────────── Audit Log ─────────── */

/** บันทึกการแก้ไข — ห้าม throw เด็ดขาด ไม่งั้น log พังแล้วงานหลักพังตาม */
function writeAudit_(action, ticketId, diffs, who) {
  try {
    if (String(cfg_('เปิด Audit Log', 'ใช่')).trim() === 'ไม่') return;
    var ss = ss_();
    var sh = ss.getSheetByName(SHEET_AUDIT);
    if (!sh) {
      sh = ss.insertSheet(SHEET_AUDIT);
      sh.getRange(1, 1, 1, AUDIT_HEADERS.length).setValues([AUDIT_HEADERS])
        .setFontWeight('bold').setBackground('#fdf0e3');
      sh.setFrozenRows(1);
    }
    var now = new Date();
    var user = who || 'ระบบ';
    var rows = (diffs && diffs.length)
      ? diffs.map(function (d) {
          return [now, user, action, ticketId, d.field,
                  truncate_(d.oldValue), truncate_(d.newValue)];
        })
      : [[now, user, action, ticketId, '', '', '']];

    // เขียนครั้งเดียวจบ อย่า loop appendRow ทีละแถว เพราะกินโควตาและช้ามาก
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, AUDIT_HEADERS.length).setValues(rows);
  } catch (err) {
    Logger.log('เขียน Audit ไม่สำเร็จ: ' + err.message);
  }
}

function truncate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return iso_(v);
  var s = String(v == null ? '' : v);
  return s.length > 300 ? s.slice(0, 300) + '…' : s;
}

/* ─────────── ติดตั้ง ─────────── */

function setup() {
  var ss = ss_();

  function ensure_(name, headers, rows) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#e8fbf1');
      sh.setFrozenRows(1);
      if (rows && rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
    return sh;
  }

  ensure_(SHEET_MAIN, HEADERS);
  ensure_(SHEET_PM, ['ปี', 'เดือน', 'ชั่วโมงทำงาน', 'แผน PM', 'PM เสร็จ']);
  ensure_(SHEET_FEEDBACK, FEEDBACK_HEAD);
  ensure_(SHEET_PMCAL, PMCAL_HEAD);
  clearCache();                       // เพิ่งแตะโครงชีต อย่าให้แคชค้างของเก่า
  ensure_(SHEET_AUDIT, AUDIT_HEADERS);
  ensure_(SHEET_HOLIDAY, HOLIDAY_HEAD);

  // ทะเบียนจริงจากเอกสาร FM-MT-01/Rev.03 — รหัสเครื่องมีอาคารอยู่ในตัว (SM-B4-EX-03)
  ensure_(SHEET_MACHINES,
    ['รหัสเครื่อง', 'ชื่อเครื่องจักร', 'ประเภท', 'อาคาร', 'ยี่ห้อ/รุ่น', 'ผู้ให้บริการ',
     'ผู้ดูแล', 'ชื่อเดิมที่เคยใช้', 'ใช้งาน'],
    [
      ['SM-B4-HC-02', 'Hot and cold mixer 2', 'เครื่องจักรหลัก', 'อาคาร B4', 'SWHL 500/100', 'Sky win', '', 'Hotmix 2, Hot & Cold Mix 2', 'ใช่'],
      ['SM-B4-HC-03', 'Hot and cold mixer 3', 'เครื่องจักรหลัก', 'อาคาร B4', '', 'Sky win', '', 'Hotmix 3', 'ใช่'],
      ['SM-B4-EX-01', 'Extrusion 1 - 80', 'เครื่องจักรหลัก', 'อาคาร B4', 'SWDB-1', 'Sky win', '', 'Ext1-80', 'ใช่'],
      ['SM-B4-EX-02', 'Extrusion 2 - 92', 'เครื่องจักรหลัก', 'อาคาร B4', '', 'Sky win', '', 'Ext2-92, Ext2-92 งานPM', 'ใช่'],
      ['SM-B4-EX-03', 'Extrusion 3 - 110', 'เครื่องจักรหลัก', 'อาคาร B4', '', 'Sky win', '', 'Ext3-110, Pm  Ext3-110, Ext3-110 งานPM', 'ใช่'],
      ['SM-B3-UV-01', 'UV 1', 'เครื่องจักรหลัก', 'อาคาร B3', 'Guosen/Sky win', 'Guosen/Sky win', '', 'UV1', 'ใช่'],
      ['SM-B3-UV-02', 'UV 2', 'เครื่องจักรหลัก', 'อาคาร B3', 'Guosen/Sky win', 'Guosen/Sky win', '', 'UV2', 'ใช่'],
      ['SM-B3-MB-01', 'Multi blade saw 1', 'เครื่องจักรหลัก', 'อาคาร B3', 'Hotjin', 'Hotjin', '', '', 'ใช่'],
      ['SM-B3-MB-02', 'Multi blade saw 2', 'เครื่องจักรหลัก', 'อาคาร B3', 'Hotjin', 'Hotjin', '', 'Multi Blade2', 'ใช่'],
      ['SM-B3-SL-01', 'Cut-Slot 1', 'เครื่องจักรหลัก', 'อาคาร B3', 'Hotjin', 'Hotjin', '', 'Cut Slot1, Cut 2', 'ใช่'],
      ['SM-B3-SL-02', 'Cut-Slot 2', 'เครื่องจักรหลัก', 'อาคาร B3', 'Hotjin', 'Hotjin', '', 'Cut Slot2, Slot  2, Slot 2, บดผงไซโล Slot2', 'ใช่'],
      ['SM-B2-XP-01', 'XPE 1', 'เครื่องจักรหลัก', 'อาคาร B2', 'Haofu HF 4000 377', 'Haofu', '', 'XPE1', 'ใช่'],
      ['SM-B2-XP-02', 'XPE 2', 'เครื่องจักรหลัก', 'อาคาร B2', 'Haofu', 'Haofu', '', 'XPE2', 'ใช่'],
      ['SM-B4-SW-01', 'Slot - waste 1', 'เครื่องจักรหลัก', 'อาคาร B4', 'Hotjin', 'Haofu', '', '', 'ใช่'],
      ['SM-B4-SW-02', 'Slot - waste 2', 'เครื่องจักรหลัก', 'อาคาร B4', 'Hotjin', 'Haofu', '', 'Slot waste 2', 'ใช่'],
      ['SM-B4-CL-01', 'Cooling tower', 'เครื่องจักรรอง', 'อาคาร B4', 'Profess cooling PFS50RT', 'บ. โปรเฟส คูลลิ่ง จำกัด', '', 'ล้างบ่อ cooling Tower', 'ใช่'],
      ['SM-B4-CL-02', 'Cooling tower 2', 'เครื่องจักรรอง', 'อาคาร B4', 'Spaco cooling SPL-50 .RT', 'บ. สเปคโก้ คูลลิ่ง เทาว์เวอร์', '', '', 'ใช่'],
      ['SM-B4-AC-01', 'Air compresser 60hp', 'เครื่องจักรรอง', 'อาคาร B4', 'Puma industrial PP-315', '', '', 'ปั้มลม 60 แรง, ปั้มลม 60แรง, ปั้มลมเหลือง 60 แรง, Air pump 60Hp, เเอร์ไดเออร์ ปั็มลม 60 เเร็ง, ปั้มลม 40 แรง', 'ใช่'],
      ['SM-B4-AC-02', 'Air compresser 100hp', 'เครื่องจักรรอง', 'อาคาร B4', 'Jagual', '', '', 'ปั้มลม100แรง, ปั้มลม 100แรง, ปั้ม ลม100แรง, ปั้มลม 100HP จากั่ว', 'ใช่'],
      ['SM-B4-CR-01', 'Crane', 'เครื่องจักรรอง', 'อาคาร B4', 'AJ moving on up TGL-500DB', 'บ. เอเจ ฮ้อยซ์ เครน เซอร์วิส', '', 'เครนเหนือศีรษะ', 'ใช่'],
      ['SM-B4-GN-01', 'Generator', 'เครื่องจักรรอง', 'อาคาร B4', 'CUMMINS IF-450', 'K. โสภณ', '', 'เครื่องปั่นไฟ Generator', 'ใช่'],
      ['SM-B4-PM-01', 'Powder mill', 'เครื่องจักรรอง', 'อาคาร B4', 'Sky win SWMF200', '', '', 'Powder mill 1, Powder mill 2, powder mill, เครื่อง บดไซโล 2', 'ใช่'],
      ['SM-B4-WC-01', 'Wpc crusher', 'เครื่องจักรรอง', 'อาคาร B4', 'Sky win SWPS400', '', '', 'Crusher, เครื่องบดหยาบ, บดหยาบ 2, บดหยาบ2, Overhaul เครื่อง บดหยาบ 2', 'ใช่'],
      ['SM-B2-AS-01', 'Arm saw', 'เครื่องจักรรอง', 'อาคาร B2', '', '', '', '', 'ใช่'],
      ['SM-B2-DP-01', 'Drill press', 'เครื่องจักรรอง', 'อาคาร B2', '', '', '', '', 'ใช่'],
      ['SM-B4-HC-01', 'Hot and cold mixer 1', 'เครื่องจักรหลัก', 'อาคาร B4', 'SWHL 500/100', 'Sky win', '', '', 'ใช่'],
      ['SM-B4-EF-01', 'Exhaust fan-EX1', 'เครื่องจักรรอง', 'อาคาร B4', '', '', '', '', 'ใช่'],
      ['SM-B4-EF-02', 'Exhaust fan-EX2', 'เครื่องจักรรอง', 'อาคาร B4', '', '', '', '', 'ใช่'],
      ['SM-B3-EF-03', 'Exhaust fan-UV1', 'เครื่องจักรรอง', 'อาคาร B3', '', '', '', '', 'ใช่'],
      ['SM-B3-EF-04', 'Exhaust fan-UV2', 'เครื่องจักรรอง', 'อาคาร B3', '', '', '', '', 'ใช่'],
      ['SM-B3-BL-01', 'Blower 1', 'เครื่องจักรรอง', 'อาคาร B3', '', '', '', 'Blower vaccum 1', 'ใช่'],
      ['SM-B3-BL-02', 'Blower 2', 'เครื่องจักรรอง', 'อาคาร B3', '', '', '', 'Blower vaccum 2, เครื่อง Blower vaccum 2', 'ใช่'],
      ['FN-Ext-01', 'พัดลมสำหรับคน Ext 1', 'เครื่องใช้ไฟฟ้า', 'อาคาร B4', 'Hatari', '', 'EXT', 'พัดลม', 'ใช่'],
      ['FN-Ext-02', 'พัดลมสำหรับคน Ext 2', 'เครื่องใช้ไฟฟ้า', 'อาคาร B4', 'Hatari', '', 'EXT', '', 'ใช่'],
      ['FN-GRD-01', 'พัดลมสำหรับคน Grinding', 'เครื่องใช้ไฟฟ้า', 'อาคาร B4', 'Hatari', '', 'EXT', '', 'ใช่'],
      ['BL-Ext-01', 'พัดลมอัดอากาศ Ext', 'เครื่องใช้ไฟฟ้า', 'อาคาร B4', 'POLO', '', '', 'พัดลมฟาร์มระบายอากาศ 50นิ้ว, พัดลมฟาร์ม 55"', 'ใช่']
    ]);

  ensure_(SHEET_PMPLAN, PMPLAN_HEAD,
    [['Extrusion 3 - 110', 'ตรวจเช็คระบบหล่อลื่นและเปลี่ยนน้ำมันเกียร์', 90, '', '', 'ใช่',
      'PM ตามรอบ', 4,
      'ตรวจระดับน้ำมันเกียร์ | อยู่ระหว่างขีด MIN–MAX\n' +
      'เปลี่ยนน้ำมันเกียร์ | ISO VG 220 จำนวน 12 ลิตร\n' +
      'ตรวจการรั่วซึมที่ซีลเพลา | ไม่มีคราบน้ำมัน\n' +
      'อัดจาระบีแบริ่งทุกจุด | 3 จุด\n' +
      'วัดอุณหภูมิเสื้อเกียร์ขณะเดินเครื่อง | ไม่เกิน 70 °C']]);

  /* ถ้ายังไม่ได้ผูก Google Form ชีตนี้จะว่าง — พอผูกแล้ว Form จะเขียนหัวคอลัมน์ทับให้เอง */
  ensure_(SHEET_CHECK, ['ประทับเวลา', 'เครื่องจักร', 'ผู้ตรวจ', 'ผลการตรวจ', 'หมายเหตุ']);

  /* คอลัมน์เรียงตรงกับ Auth.gs ของโปรเจคระบบ Stock อะไหล่ (US = EMAIL,NAME,ROLE,ACTIVE,PIN,SALT,FAILED,LOCKED,PHOTO)
     ตอนนี้ใช้แค่ 4 คอลัมน์แรกทำ dropdown ผู้รับผิดชอบ — พอยก Auth.gs มาจะล็อกอินได้ทันทีโดยไม่ต้องย้ายข้อมูล
     บทบาท: TECH = ช่าง, LEAD = หัวหน้าช่าง, ENG = วิศวกร */
  ensure_(SHEET_USERS, USERS_HEAD,
    [['', 'ช่างชล', 'TECH', 'ใช่', '', '', '', '', '', 'ชล, นายชล', 'ช่าง Ext'],
     ['', 'ช่างตั้ม', 'TECH', 'ใช่', '', '', '', '', '', 'ตั้ม', 'ช่าง UV'],
     ['', 'ช่างโฟร์', 'TECH', 'ใช่', '', '', '', '', '', 'โฟร์', 'ช่าง Cut Slot'],
     ['', 'หัวหน้าช่าง', 'LEAD', 'ใช่', '', '', '', '', '', '', '']]);

  ensure_(SHEET_CONFIG, ['ชื่อค่า', 'ค่า', 'คำอธิบาย'], [
    ['น้ำหนัก First-Time Fix', 25, 'คะแนนผลงานช่าง — ซ่อมผ่านตรวจรับตั้งแต่ครั้งแรก'],
    ['น้ำหนัก ปิดทันกำหนด',  20, 'คะแนนผลงานช่าง — ไม่รวมใบที่รอของจากข้างนอก'],
    ['น้ำหนัก วินัยการบันทึก', 20, 'คะแนนผลงานช่าง — ลงเวลาซ่อมและสิ่งที่ทำครบ'],
    ['น้ำหนัก ไม่ซ่อมซ้ำ',    20, 'คะแนนผลงานช่าง — ซ่อมแล้วเครื่องไม่กลับมาเสียอีก'],
    ['น้ำหนัก PM ตามแผน',    15, 'คะแนนผลงานช่าง — ทำ PM ที่ได้รับมอบหมายครบ · รวมทุกตัวไม่จำเป็นต้องเป็น 100'],
    ['อีเมลช่าง',        '', 'ผู้รับแจ้งเตือนเมื่อมีใบแจ้งซ่อมใหม่ (คั่นหลายคนด้วย ,)'],
    ['อีเมลหัวหน้า',      '', 'ผู้รับสรุปงานค้างประจำวัน'],
    ['ชั่วโมงก่อนเตือนช่าง', 24, 'งานค้างเกินกี่ชั่วโมงถึงส่งอีเมลเตือนช่างที่รับผิดชอบ'],
    ['เท่าของ SLA ก่อนแจ้งหัวหน้า', 2, 'เลยกำหนดมาอีกกี่เท่าของเวลาที่ให้ไว้ ถึงส่งเมลยกระดับถึงหัวหน้า'],
    ['ทำงานวันเสาร์',    'ไม่', 'ใส่ "ใช่" ถ้าโรงงานทำงานวันเสาร์ — ปฏิทินจะไม่ถือว่าเป็นวันหยุด'],
    ['รอบต่ำสุดที่กางลงปฏิทิน', 7, 'งานที่รอบสั้นกว่านี้ไม่กางลงปฏิทิน PM — ใช้เช็คชีตประจำวันแทน'],
    ['SLA วิกฤต',        4,   'ต้องปิดงานภายในกี่ชั่วโมง (เครื่องหยุดผลิต)'],
    ['SLA ด่วน',         24,  'ต้องปิดงานภายในกี่ชั่วโมง'],
    ['SLA ปกติ',         72,  'ต้องปิดงานภายในกี่ชั่วโมง'],
    ['SLA ไม่เร่งด่วน',   168, 'ต้องปิดงานภายในกี่ชั่วโมง'],
    ['เปิดแจ้งเตือน',     'ใช่', 'ใส่ "ไม่" เพื่อปิดอีเมลทั้งหมด'],
    ['เปิด Audit Log',   'ใช่', 'ใส่ "ไม่" เพื่อหยุดบันทึกประวัติการแก้ไข'],
    ['ชื่อบริษัท',        'YOUR COMPANY', 'ใช้บนหัวเอกสาร PDF'],
    ['สิทธิ์รูปภาพ',      'ทุกคนที่มีลิงก์', 'ใส่ "เฉพาะในองค์กร" ถ้าไม่ต้องการให้รูปเปิดสาธารณะ'],
    ['คอลัมน์เครื่องจักร', 'เครื่องจักร', 'ชื่อคอลัมน์ในชีต Daily Check ที่เก็บชื่อเครื่อง'],
    ['คอลัมน์ผู้ตรวจ',    'ผู้ตรวจ',     'ชื่อคอลัมน์ผู้ตรวจในชีต Daily Check'],
    ['คอลัมน์ผลการตรวจ',  'ผลการตรวจ',   'ชื่อคอลัมน์ผลการตรวจในชีต Daily Check'],
    ['คำว่าผิดปกติ',      'ผิดปกติ',     'ถ้าผลการตรวจมีคำนี้ ถือว่าเครื่องมีปัญหา'],
    ['ลิงก์ฟอร์มเช็คชีต',  '',            'ลิงก์ Google Form สำหรับให้ช่างกรอกเช็คชีตประจำวัน'],
    ['ลิงก์ฟอร์มพารามิเตอร์', '',        'URL เว็บแอปของระบบบันทึกพารามิเตอร์ - ปุ่ม "บันทึกค่ารอบนี้" พาไปที่นั่น'],
    ['QR เลี้ยงเบียร์ช่าง', '',           'พร้อมเพย์กองกลางช่าง — ใส่เบอร์โทร 10 หลัก / เลขบัตรประชาชน 13 หลัก แล้วระบบสร้าง QR ให้เอง (หรือใส่รูป QR เป็น id ไฟล์ใน Drive / ลิงก์แชร์ / URL ก็ได้)'],
    ['ที่อยู่ Bitcoin เลี้ยงเบียร์', '',  'ที่อยู่ BTC ของกองกลางช่าง — ระบบสร้าง QR ให้เอง เว้นว่าง = ไม่โชว์']
  ]);

  cfgCache_ = null;

  /* ค่าที่วางมาเป็นลิงก์จะใช้งานไม่ได้ แต่ไม่ได้ "ว่าง" จึงไม่ถูกจับด้วยการเช็คค่าว่าง
     ตรวจตั้งแต่ตอน setup จะได้รู้ก่อนมีคนแจ้งซ่อมจริงแล้วเจอ error */
  ['SHEET_ID', 'DRIVE_FOLDER_ID'].forEach(function (k) {
    var v = prop_(k);
    if (v && driveId_(v) !== String(v).trim()) {
      Logger.log('⚠ ' + k + ' เป็นลิงก์ ไม่ใช่รหัสเปล่า — ระบบจะตัดให้เองเป็น: ' + driveId_(v));
    }
  });

  var missing = ['SHEET_ID', 'DRIVE_FOLDER_ID', 'DASHBOARD_PASSWORD', 'AUTH_SECRET']
    .filter(function (k) { return !prop_(k); });
  var msg = missing.length
    ? 'สร้างชีตเรียบร้อย แต่ยังขาด Script Properties: ' + missing.join(', ')
    : 'ติดตั้งเรียบร้อย — รัน setupTriggers() ต่อ แล้ว Deploy เป็น Web app';
  Logger.log(msg);
  return msg;
}

/** ตั้งงานอัตโนมัติรายวัน (รันครั้งเดียว) */
/** เติมคอลัมน์ใหม่ให้ชีตที่สร้างไปแล้ว — setup() จะข้ามชีตที่มีข้อมูลอยู่
 *  รันซ้ำได้ คอลัมน์ที่มีแล้วจะไม่ถูกแตะ ข้อมูลเดิมไม่ขยับ
 *  (ทุกฟังก์ชันอ้างคอลัมน์ด้วยชื่อหัวตาราง ตำแหน่งจึงไม่สำคัญ) */
/** เติมคอลัมน์ที่ขาดให้ชีตเดียว — ต่อท้ายเสมอ ไม่แทรกกลาง เพื่อไม่ให้สูตรเดิมเลื่อน */
/** ชีตเปล่าพร้อมหัวคอลัมน์ — มีอยู่แล้วไม่แตะ แค่เติมหัวที่ขาด */
function newSheet_(name, headers) {
  var ss = ss_();
  if (ss.getSheetByName(name)) return addMissingCols_(name, headers);
  ss.insertSheet(name).getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#e8fbf1');
  return name + ': สร้างใหม่';
}

function addMissingCols_(name, headers) {
  var sh = ss_().getSheetByName(name);
  if (!sh) return name + ': ยังไม่มีชีตนี้ (รัน setup() ก่อน)';

  var head = sh.getLastColumn()
    ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
        .map(function (h) { return String(h == null ? '' : h).trim(); })
    : [];
  var missing = headers.filter(function (h) { return head.indexOf(h) === -1; });
  if (!missing.length) return name + ': ครบแล้ว';

  sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing])
    .setFontWeight('bold').setBackground('#e8fbf1');
  return name + ': เพิ่ม ' + missing.join(', ');
}

/* เดิมดูแลแค่ Sheet1 — พอ "ตาราง PM" กับ "แผน PM" มีคอลัมน์ใหม่ด้วย
   คนที่รัน upgradeSheet() แล้วเห็นว่า "คอลัมน์ครบแล้ว" จะเข้าใจผิดว่าอัปเกรดครบทั้งไฟล์ */
function upgradeSheet() {
  var out = [
    addMissingCols_(SHEET_MAIN, HEADERS),
    addMissingCols_(SHEET_PMCAL, PMCAL_HEAD),
    addMissingCols_(SHEET_PMPLAN, PMPLAN_HEAD),
    addMissingCols_(SHEET_USERS, USERS_HEAD),
    /* สร้างชีตเช็คลิสต์ให้เลย พร้อมหัวคอลัมน์ — ชื่อหัวพิมผิดแม้ตัวเดียว คอลัมน์นั้นหายเงียบ */
    newSheet_(PARAM_SHEET_CHECK, CHECK_HEAD),
    newSheet_(SHEET_PARAM_OK, PARAM_OK_HEAD)
  ];
  SpreadsheetApp.flush();
  clearCache();
  var msg = out.join(' · ');
  Logger.log(msg);
  return msg;
}

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    // generatePMTickets ถูกถอดออกแล้ว แต่ต้องอยู่ในรายการนี้เพื่อลบ trigger เก่าที่ยังชี้ไปหามัน
    if (['dailyDigest', 'generatePMTickets', 'nudgeAssignees', 'extendPmSchedule']
        .indexOf(t.getHandlerFunction()) > -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('extendPmSchedule').timeBased().atHour(6).everyDays(1).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().atHour(7).everyDays(1).create();
  // ตั้งไว้ 08:00 ให้ช่างได้อ่านตอนเข้ากะเช้าพอดี ไม่ใช่ตอนยังไม่ตื่น
  ScriptApp.newTrigger('nudgeAssignees').timeBased().atHour(8).everyDays(1).create();
  Logger.log('ตั้งงานอัตโนมัติแล้ว: ต่อตาราง PM 06:00 · สรุปงานค้างให้หัวหน้า 07:00 · เตือนช่าง 08:00');
  return 'ตั้งงานอัตโนมัติเรียบร้อย';
}

/* ═══════════ วันหยุด ═══════════
   ทำเป็น "ชีต" ไม่ใช่ตารางฝังในโค้ด ด้วยเหตุผลสองข้อ

   1. วันหยุดนักขัตฤกษ์ไทยหลายวันกำหนดตามจันทรคติ (มาฆบูชา · วิสาขบูชา · อาสาฬหบูชา)
      เลื่อนทุกปี ฝังไว้ในโค้ดแปลว่าต้องแก้โปรแกรมทุกปี
   2. วันหยุดของโรงงาน ≠ วันหยุดราชการ — โรงงานหยุดชดเชยคนละวัน ทำงานเสาร์บางสัปดาห์
      หรือหยุดยาวสงกรานต์เกินที่ราชการประกาศ ชีตให้เจ้าของโรงงานตัดสินเอง

   เสาร์–อาทิตย์ระบบรู้เองจากปฏิทิน ไม่ต้องกรอก (ปิดวันเสาร์ได้ที่ชีตตั้งค่า) */

var HOLIDAY_HEAD = ['วันที่', 'ชื่อวันหยุด', 'ประเภท'];
var CACHE_KEY_HOLIDAY = 'hol_v1';
var holidayCache_ = null;

function holidaySheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_HOLIDAY);
  if (!sh) {
    sh = ss.insertSheet(SHEET_HOLIDAY);
    sh.getRange(1, 1, 1, HOLIDAY_HEAD.length).setValues([HOLIDAY_HEAD])
      .setFontWeight('bold').setBackground('#e8fbf1');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** { 'yyyy-MM-dd': { name, type } } — อ่านทั้งชีตครั้งเดียวแล้วแคชไว้ */
function holidays_() {
  if (holidayCache_) return holidayCache_;
  var hit = cacheGet_(CACHE_KEY_HOLIDAY);
  if (hit) { holidayCache_ = hit; return hit; }

  var map = {};
  try {
    var sh = holidaySheet_();
    if (sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
        var d = toDate_(r[0]);
        if (!d) return;                       // แถวที่ยังไม่ได้ใส่วันที่ (วันหยุดตามจันทรคติ) ข้ามไป
        map[dayKey_(d)] = {
          name: String(r[1] || 'วันหยุด').trim(),
          type: String(r[2] || 'นักขัตฤกษ์').trim()
        };
      });
    }
  } catch (e) {
    Logger.log('อ่านชีตวันหยุดไม่ได้: ' + e.message);   // ไม่มีวันหยุดต้องไม่ทำให้ปฏิทินพังทั้งหน้า
  }
  holidayCache_ = map;
  cachePut_(CACHE_KEY_HOLIDAY, map);
  return map;
}

/** วันหยุดของ "เดือนเดียว" ตามรูปแบบ yyyy-MM — ส่งให้หน้าเว็บเท่าที่ใช้จริง */
function holidaysOfMonth_(key) {
  var all = holidays_(), out = {};
  Object.keys(all).forEach(function (k) { if (k.slice(0, 7) === key) out[k] = all[k]; });
  return out;
}

/* วันหยุดที่ "วันที่ตายตัวทุกปี" เท่านั้น
   วันหยุดตามจันทรคติถูกใส่ไว้เป็นแถวเปล่ารอให้กรอกวันที่เอง เพราะเลื่อนทุกปี
   เขียนวันที่มั่ว ๆ ลงไปให้ แย่กว่าปล่อยว่างไว้ให้เห็นชัดว่ายังไม่ได้ใส่ */
var FIXED_HOLIDAYS = [
  ['01-01', 'วันขึ้นปีใหม่'],
  ['04-06', 'วันจักรี'],
  ['04-13', 'วันสงกรานต์'],
  ['04-14', 'วันสงกรานต์'],
  ['04-15', 'วันสงกรานต์'],
  ['05-01', 'วันแรงงานแห่งชาติ'],
  ['05-04', 'วันฉัตรมงคล'],
  ['06-03', 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าฯ พระบรมราชินี'],
  ['07-28', 'วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระเจ้าอยู่หัว'],
  ['08-12', 'วันแม่แห่งชาติ'],
  ['10-13', 'วันนวมินทรมหาราช'],
  ['10-23', 'วันปิยมหาราช'],
  ['12-05', 'วันพ่อแห่งชาติ · วันชาติ'],
  ['12-10', 'วันรัฐธรรมนูญ'],
  ['12-31', 'วันสิ้นปี']
];
var LUNAR_HOLIDAYS = ['วันมาฆบูชา', 'วันวิสาขบูชา', 'วันอาสาฬหบูชา', 'วันเข้าพรรษา'];

/**
 * เติมวันหยุดตั้งต้นของปีที่ระบุ — รันจาก Apps Script editor
 * ไม่ทับของเดิม แถวที่มีวันที่ซ้ำอยู่แล้วจะถูกข้าม
 * @param {number} year ปี ค.ศ. เช่น 2026 (ไม่ใส่ = ปีปัจจุบัน)
 */
function seedHolidays(year) {
  var y = Number(year) || new Date().getFullYear();
  var sh = holidaySheet_();
  var have = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var d = toDate_(r[0]);
      if (d) have[dayKey_(d)] = 1;
    });
  }

  var rows = [];
  FIXED_HOLIDAYS.forEach(function (h) {
    var key = y + '-' + h[0];
    if (have[key]) return;
    rows.push([new Date(key + 'T00:00:00'), h[1], 'นักขัตฤกษ์']);
  });
  LUNAR_HOLIDAYS.forEach(function (name) {
    rows.push(['', name + ' ' + (y + 543) + ' — ใส่วันที่เอง (เลื่อนทุกปีตามจันทรคติ)', 'นักขัตฤกษ์']);
  });

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).setNumberFormat('dd/MM/yyyy');
  }
  clearCache();
  var msg = 'เติมวันหยุดปี ' + y + ' แล้ว ' + rows.length + ' แถว — ' +
            'อย่าลืมใส่วันที่ให้วันหยุดตามจันทรคติ ' + LUNAR_HOLIDAYS.length + ' วัน';
  Logger.log(msg);
  return msg;
}

/**
 * ดึงวันหยุดจากปฏิทิน "วันหยุดในประเทศไทย" ของ Google — ได้วันตามจันทรคติที่ถูกต้องมาด้วย
 * ต้องไปกด subscribe ปฏิทินนั้นใน Google Calendar ของบัญชีนี้ก่อน ไม่งั้นจะคืน null
 * @param {number} year ปี ค.ศ.
 */
function importHolidaysFromGoogle(year) {
  var y = Number(year) || new Date().getFullYear();
  var cal;
  try { cal = CalendarApp.getCalendarById('th.th#holiday@group.v.calendar.google.com'); }
  catch (e) { cal = null; }
  if (!cal) {
    var m = 'ยังไม่ได้ subscribe ปฏิทิน "Holidays in Thailand" ในบัญชีนี้ — ' +
            'เปิด Google Calendar → Other calendars → Browse calendars of interest → Thailand → ติ๊ก Holidays ' +
            'แล้วรันใหม่ หรือใช้ seedHolidays() กรอกเองแทน';
    Logger.log(m);
    return m;
  }

  var evs = cal.getEvents(new Date(y, 0, 1), new Date(y + 1, 0, 1));
  var sh = holidaySheet_();
  var have = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var d = toDate_(r[0]);
      if (d) have[dayKey_(d)] = 1;
    });
  }

  var rows = [];
  evs.forEach(function (e) {
    var d = e.getStartTime();
    var key = dayKey_(d);
    if (have[key]) return;
    have[key] = 1;                                  // ปฏิทินมีหลายรายการซ้อนวันเดียวกันได้
    rows.push([d, e.getTitle(), 'นักขัตฤกษ์']);
  });
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).setNumberFormat('dd/MM/yyyy');
  }
  clearCache();
  var msg = 'ดึงวันหยุดปี ' + y + ' จาก Google มา ' + rows.length + ' วัน';
  Logger.log(msg);
  return msg;
}

/* ─────────── อ่าน / เขียน ใบแจ้งซ่อม ─────────── */

function rowsToObjects_() {
  var sh = sheet_(SHEET_MAIN);
  if (sh.getLastRow() < 2) return [];

  // ใช้ getLastColumn() ไม่ใช่ HEADERS.length เผื่อชีตถูกสร้างไว้ก่อนมีคอลัมน์ใหม่
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head = values.shift();
  var idx = {};
  Object.keys(FIELD_MAP).forEach(function (key) { idx[key] = head.indexOf(FIELD_MAP[key]); });

  return values
    .filter(function (r) { return r[idx.ticket_id]; })
    .map(function (r) {
      var o = {};
      Object.keys(idx).forEach(function (key) {
        var v = idx[key] === -1 ? '' : r[idx[key]];
        if (DATE_FIELDS.indexOf(key) > -1) v = iso_(v);
        else if (NUMBER_FIELDS.indexOf(key) > -1) v = Number(v) || 0;
        else v = v === '' || v == null ? '' : String(v);
        o[key] = v;
      });
      o.machine_raw = o.machine_name;                 // เก็บชื่อที่พนักงานพิมพ์ไว้ดูย้อนหลัง
      o.machine_name = canonical_(o.machine_name);    // สถิติใช้ชื่อมาตรฐานจากทะเบียน
      o.has_image = !!o.image_url;
      return o;
    })
    .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
}

/**
 * @param {string} token   token จาก apiLogin (ไม่ส่ง = โหมด public)
 * @param {Object} options { limit, offset, status, machine, openOnly }
 */
function apiGetTickets(token, options) {
  var full = verify_(token);
  var opt = options || {};
  var rows = rowsToObjects_();

  // กรองที่ server ก่อนส่ง ไม่ใช่ส่งทั้งหมดแล้วให้หน้าเว็บกรองเอง
  if (opt.openOnly) rows = rows.filter(function (t) {
    return t.status !== STATUS_DONE && t.status !== STATUS_CANCEL;
  });
  if (opt.status)   rows = rows.filter(function (t) { return t.status === opt.status; });
  if (opt.machine) {
    var mc = canonical_(opt.machine);
    rows = rows.filter(function (t) { return t.machine_name === mc; });
  }

  var total  = rows.length;
  var offset = Math.max(0, Number(opt.offset) || 0);
  var limit  = Number(opt.limit) || 0;                // 0 = เอาทั้งหมด (ค่าเดิม)
  var page   = limit > 0 ? rows.slice(offset, offset + limit) : rows.slice(offset);

  return {
    scope: full ? 'full' : 'public',
    total: total,
    offset: offset,
    returned: page.length,
    hasMore: offset + page.length < total,
    tickets: full ? page : page.map(function (t) {
      var o = {};
      PUBLIC_FIELDS.forEach(function (k) { if (k in t) o[k] = t[k]; });
      o.has_image = t.has_image;
      return o;
    })
  };
}

/* ═══════════ แคชข้ามคำขอ ═══════════
   ตัวแปรระดับไฟล์ (machinesCache_ · teamCache_ · cfgCache_) หายทุกครั้งที่ GAS จบการทำงานหนึ่งรอบ
   จึงช่วยได้แค่ภายในคำขอเดียว ไม่ช่วยตอนเปิดหน้าครั้งแรก ซึ่งเป็นจังหวะที่ช้าที่สุดพอดี

   CacheService อยู่ข้ามคำขอ — apiGetConfig() ที่เดิมอ่านชีต 3 ใบ
   (ทะเบียนเครื่องจักร · Users · ตั้งค่า) กลายเป็นอ่านแคชก้อนเดียว

   ── ทำไม TTL ถึงสั้น ──
   ทะเบียนเครื่องจักรกับ Users ถูกแก้ "ในชีตโดยตรง" ไม่ได้ผ่านหน้าเว็บ
   ระบบจึงไม่มีทางรู้ว่ามีคนแก้ ต้องรอหมดอายุอย่างเดียว
   5 นาทีคือจุดที่รับได้ — แก้ชีตแล้วรอไม่นาน แต่ตัดการอ่านซ้ำได้เกือบหมด
   ถ้าไม่อยากรอ ให้รัน clearCache() จาก Apps Script editor */

var CACHE_SEC = 300;
/* ⚠️ เพิ่ม/ลบช่องใน apiGetConfig() แล้วต้องขยับเลขท้ายคีย์นี้ทุกครั้ง
   ไม่งั้นเครื่องที่เคยเปิดจะได้ก้อนแคชโครงเก่าที่ไม่มีช่องใหม่ไปอีก 5 นาที
   แล้วคนตั้งค่าจะนั่งงงว่าใส่ค่าในชีตแล้วทำไมหน้าเว็บไม่ขึ้น (เจอมาแล้วกับปุ่มเลี้ยงเบียร์) */
var CACHE_KEY_CONFIG = 'cfg_v4';
var CACHE_SEC_FORM = 21600;   // ลิงก์ฟอร์มแทบไม่เปลี่ยน เก็บยาวกว่าแคชตั้งค่า
/* เพดานของ CacheService คือ 100KB ต่อคีย์ และนับเป็น "ไบต์" ไม่ใช่จำนวนตัวอักษร
   ภาษาไทยกินตัวละ 3 ไบต์ใน UTF-8 ถ้าเช็คด้วย .length จะประเมินต่ำไป 3 เท่า
   คิดแบบแย่ที่สุดคือไทยล้วน จึงจำกัดที่ 30,000 ตัวอักษร = 90,000 ไบต์
   (config จริงตอนนี้ราว 10,600 ไบต์ เหลือที่ให้โตได้อีกมาก) */
var CACHE_MAX_CHARS = 30000;

function cacheGet_(key) {
  try {
    var s = CacheService.getScriptCache().get(key);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;                      // แคชมีปัญหาต้องไม่ทำให้ระบบล่มตาม แค่กลับไปอ่านชีตเหมือนเดิม
  }
}

function cachePut_(key, value) {
  try {
    var s = JSON.stringify(value);
    if (s.length > CACHE_MAX_CHARS) {
      Logger.log('ข้ามการแคช ' + key + ' — ยาว ' + s.length + ' ตัวอักษร เกินเพดาน');
      return;
    }
    CacheService.getScriptCache().put(key, s, CACHE_SEC);
  } catch (e) {
    Logger.log('เขียนแคชไม่สำเร็จ: ' + e.message);
  }
}

/** ล้างแคชทันที — รันจาก Apps Script editor หลังแก้ทะเบียนเครื่องจักรหรือชีต Users */
function clearCache() {
  try {
    CacheService.getScriptCache().removeAll(
    [CACHE_KEY_CONFIG, CACHE_KEY_HOLIDAY, CACHE_KEY_CHKFORM, CACHE_KEY_USERS]);
    holidayCache_ = machinesCache_ = aliasMapCache_ = teamCache_ = techAliasCache_ = null;
    Logger.log('ล้างแคชแล้ว — เปิดหน้าเว็บใหม่จะเห็นข้อมูลล่าสุดทันที');
    return 'ล้างแคชแล้ว';
  } catch (e) {
    return 'ล้างแคชไม่สำเร็จ: ' + e.message;
  }
}

/** ทะเบียนเครื่องจักรจากชีต */
var machinesCache_ = null;
function machines_() {
  if (machinesCache_) return machinesCache_;
  try {
    machinesCache_ = readSheet_(SHEET_MACHINES)
      .filter(function (m) { return m['ชื่อเครื่องจักร'] && isActive_(m['ใช้งาน']); })
      .map(function (m) {
        return {
          code: String(m['รหัสเครื่อง'] || ''), name: String(m['ชื่อเครื่องจักร']).trim(),
          group: String(m['ประเภท'] || 'อื่นๆ'), location: String(m['อาคาร'] || ''),
          detail: String(m['ยี่ห้อ/รุ่น'] || ''), provider: String(m['ผู้ให้บริการ'] || ''),
          owner: String(m['ผู้ดูแล'] || ''),
          aliases: String(m['ชื่อเดิมที่เคยใช้'] || '').split(',')
                     .map(function (x) { return x.trim(); }).filter(String)
        };
      });
  } catch (e) { machinesCache_ = []; }   // ยังไม่ได้รัน setup()
  return machinesCache_;
}

/** ชื่อเก่า -> ชื่อมาตรฐาน เพื่อให้สถิติรายเครื่องไม่แตกเป็นหลายชื่อ */
var aliasMapCache_ = null;
function aliasMap_() {
  if (aliasMapCache_) return aliasMapCache_;
  var map = {};
  machines_().forEach(function (m) {
    map[m.name.toLowerCase()] = m.name;
    if (m.code) map[m.code.toLowerCase()] = m.name;
    m.aliases.forEach(function (a) { map[a.toLowerCase()] = m.name; });
  });
  aliasMapCache_ = map;
  return map;
}

function canonical_(name) {
  var key = String(name || '').trim().toLowerCase();
  return aliasMap_()[key] || String(name || '').trim();
}

/** ตรวจว่าชื่อเครื่องอยู่ในทะเบียนจริง — หัวใจของการกันชื่อแตก 117 แบบ */
function assertKnownMachine_(name) {
  var c = canonical_(name);
  var list = machines_();
  if (!list.length) return c;                 // ยังไม่มีทะเบียน ก็ปล่อยผ่านไม่งั้นระบบใช้ไม่ได้เลย
  for (var i = 0; i < list.length; i++) if (list[i].name === c) return c;
  throw new Error('ไม่พบเครื่องจักร "' + name + '" ในทะเบียน — เลือกจากรายการที่ระบบมีให้เท่านั้น');
}

/** ทีมช่างที่ยังใช้งานอยู่ — ใช้ทำ dropdown ผู้รับผิดชอบ */
var teamCache_ = null;
function team_() {
  if (teamCache_) return teamCache_;
  try {
    teamCache_ = readSheet_(SHEET_USERS)
      .filter(function (u) { return u['ชื่อ-นามสกุล'] && isActive_(u['ใช้งาน']); })
      .map(function (u) {
        return {
          name: String(u['ชื่อ-นามสกุล']).trim(),
          role: String(u['บทบาท'] || 'TECH').toUpperCase(),
          email: String(u['อีเมล'] || '').trim(),
          station: String(u['สถานีประจำ'] || '').trim(),
          aliases: String(u['ชื่อเดิมที่เคยใช้'] || '').split(',')
                     .map(function (x) { return x.trim(); }).filter(String)
        };
      });
  } catch (e) { teamCache_ = []; }
  return teamCache_;
}

/* หน้าแจ้งซ่อมเปิดให้ฝ่ายผลิตใช้โดยไม่ต้องล็อกอิน ตัวนี้จึงเรียกได้โดยไม่มี token
   แต่ "รายชื่อพนักงานทั้งแผนก + บทบาท + สถานี" ไม่ใช่ของที่คนนอกควรได้ไปพร้อมกัน
   แยกส่งเฉพาะคนที่ล็อกอินแล้ว — ส่วนที่เหลือเหมือนเดิม และยังแคชรวมก้อนเดียวได้ */
function apiGetConfig(token) {
  var out = cacheGet_(CACHE_KEY_CONFIG);
  if (out) return configForViewer_(out, token);

  out = {
    machines: machines_(),
    team: team_().map(function (u) {                                 // ไม่ส่งอีเมลออกหน้าเว็บ
      return { name: u.name, role: u.role, station: u.station };
    }),
    stations: stations_(),
    priorities: PRIORITIES.map(function (p) {
      return { key: p.key, hours: slaHoursFor_(p.key), note: p.note };
    }),
    priorityDefault: PRIORITY_DEFAULT,
    actionNeeded: ACTION_NEEDED,
    statuses: [STATUS_OPEN, STATUS_DOING, STATUS_OUT, STATUS_WAIT, STATUS_DONE, STATUS_CANCEL],
    webAppUrl: ScriptApp.getService().getUrl(),
    slaHours: slaHoursFor_(PRIORITY_DEFAULT),   // ใช้เป็นค่าอ้างอิงบนหน้า KPI เท่านั้น
    companyName: String(cfg_('ชื่อบริษัท', 'YOUR COMPANY')),
    formUrl: String(cfg_('ลิงก์ฟอร์มเช็คชีต', '')),
    beerQr: beerQrUrl_(),
    beerPromptPay: promptPayPayload_(cfg_('QR เลี้ยงเบียร์ช่าง', '')),
    beerBtc: String(cfg_('ที่อยู่ Bitcoin เลี้ยงเบียร์', '')).trim(),
    /* URL ของ Apps Script เปลี่ยนทุกครั้งที่กด New deployment
       เก็บไว้ในชีต "ตั้งค่า" จะได้แก้เองได้โดยไม่ต้องรอคนแก้โค้ด */
    /* เว้นว่าง = ไม่มีปุ่มไประบบสต็อก — ใส่ได้ทีหลังในชีต "ตั้งค่า" โดยไม่ต้องแก้โค้ด */
    stockUrl: String(cfg_('ลิงก์ระบบ Stock อะไหล่', '')),
    maxImageBytes: MAX_IMAGE_BYTES,
    /* น้ำหนักคะแนนผลงานช่าง — อยู่ในชีตเพราะเป็น "นโยบาย" ไม่ใช่ "ตรรกะ"
       ปีไหนอยากเน้นวินัยการบันทึกก็ขยับเลขในชีต ไม่ต้องรอคนแก้โค้ดแล้ว deploy ใหม่ */
    techWeights: {
      ftf:    Number(cfg_('น้ำหนัก First-Time Fix', 25)) || 0,
      onTime: Number(cfg_('น้ำหนัก ปิดทันกำหนด', 20)) || 0,
      log:    Number(cfg_('น้ำหนัก วินัยการบันทึก', 20)) || 0,
      repeat: Number(cfg_('น้ำหนัก ไม่ซ่อมซ้ำ', 20)) || 0,
      pm:     Number(cfg_('น้ำหนัก PM ตามแผน', 15)) || 0
    }
  };

  cachePut_(CACHE_KEY_CONFIG, out);
  return configForViewer_(out, token);
}

/** ตัดรายชื่อพนักงานออกถ้าคนเรียกยังไม่ได้ล็อกอิน

    แคชเก็บชุดเต็มไว้ชุดเดียว แล้วค่อยตัดตอนส่งออก — ถ้าแยกแคชสองชุด
    จะมีวันที่สองชุดไม่ตรงกัน แล้วไล่หาสาเหตุยากกว่าเดิมมาก */
function configForViewer_(cfg, token) {
  if (verify_(token)) return cfg;
  var out = {};
  Object.keys(cfg).forEach(function (k) { out[k] = cfg[k]; });
  out.team = [];
  return out;
}

/** รูป QR พร้อมเพย์สำหรับปุ่มเลี้ยงเบียร์ — เว้นว่าง = ปุ่มมีแค่ส่งคำขอบคุณ ไม่มีช่องทางโอน
    รับได้ทั้ง id ไฟล์ใน Drive · ลิงก์แชร์ของ Drive · URL รูปจากที่อื่น
    ใช้ driveId_() ตัวเดียวกับโฟลเดอร์รูป เพราะคนวางลิงก์แชร์มาทั้งเส้นเป็นเรื่องปกติ
    (บั๊กนี้เคยกินใบแจ้งซ่อมทั้งใบมาแล้วตอนตั้งค่า DRIVE_FOLDER_ID) */
function beerQrUrl_() {
  var v = String(cfg_('QR เลี้ยงเบียร์ช่าง', '')).trim();
  if (!v || promptPayPayload_(v)) return '';    // เป็นเบอร์/เลขบัตร = สร้าง QR เองไม่ต้องใช้รูป
  if (/^https?:/.test(v) && v.indexOf('drive.google.com') === -1) return v;
  var id = driveId_(v);
  return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w480' : '';
}

/* ═══════════ QR พร้อมเพย์ ═══════════
   คนที่ไปตั้งค่าพิมพ์ "เบอร์พร้อมเพย์" ลงไป ไม่ได้ไปแคปรูป QR จากแอปธนาคารมาวาง
   ซึ่งถูกแล้ว เบอร์คือสิ่งที่เขามีอยู่ในหัว ระบบจึงต้องเป็นฝ่ายสร้าง QR ให้เอง

   payload เป็นมาตรฐาน EMVCo ที่ธนาคารไทยทุกเจ้าอ่านได้ ประกอบเองได้ด้วยโค้ดไม่กี่บรรทัด
   ไม่ต้องพึ่ง API ข้างนอก — ซึ่งสำคัญ เพราะการยิงเบอร์พร้อมเพย์ไปเว็บคนอื่นเพื่อขอรูป QR
   คือการส่งข้อมูลการเงินของช่างออกนอกองค์กรโดยไม่มีใครขอ

   ไม่ใส่ยอดเงิน (tag 54) โดยตั้งใจ — ให้คนโอนพิมพ์เอง จะเลี้ยงเท่าไหร่เป็นเรื่องของเขา */

/** CRC-16/CCITT-FALSE — ท้าย payload ของ EMVCo บังคับว่าต้องมี ธนาคารเช็คค่านี้ */
function crc16_(str) {
  var crc = 0xFFFF;
  for (var i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (var j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
    }
  }
  return ('000' + crc.toString(16).toUpperCase()).slice(-4);
}

/**
 * สร้าง payload พร้อมเพย์จากเบอร์โทร / เลขบัตรประชาชน / เลข e-Wallet
 * คืนค่าว่างถ้าไม่ใช่รูปแบบที่รู้จัก — ผู้เรียกใช้ค่าว่างเป็นสัญญาณว่า "อันนี้ไม่ใช่พร้อมเพย์"
 */
function promptPayPayload_(raw) {
  var d = String(raw == null ? '' : raw).replace(/\D/g, '');
  var tag, val;
  if (d.length === 10 && d.charAt(0) === '0') { tag = '01'; val = '0066' + d.slice(1); }
  else if (d.length === 13) { tag = '02'; val = d; }     // เลขบัตรประชาชน
  else if (d.length === 15) { tag = '03'; val = d; }     // เลข e-Wallet
  else return '';

  // ความยาวเป็นเลขสองหลักเสมอตามมาตรฐาน ค่าที่ใช้ที่นี่ยาวไม่เกิน 99 ทั้งหมด
  function f(id, v) { return id + ('0' + v.length).slice(-2) + v; }

  var body = f('00', '01') +                              // เวอร์ชันของรูปแบบ
             f('01', '11') +                              // 11 = QR ใช้ซ้ำได้ ไม่ผูกยอด
             f('29', f('00', 'A000000677010111') + f(tag, val)) +
             f('53', '764') +                             // สกุลเงิน THB
             f('58', 'TH');
  return body + '6304' + crc16_(body + '6304');
}

/** เลขลำดับสูงสุดของปีปัจจุบัน — อ่านชีตครั้งเดียว แล้วให้ผู้เรียก ++ เอง */
function maxTicketSeq_() {
  var year = new Date().getFullYear() + 543;
  var sh = sheet_(SHEET_MAIN);
  if (sh.getLastRow() < 2) return 0;

  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var c = head.indexOf(FIELD_MAP.ticket_id) + 1;
  if (c === 0) return 0;

  // ดึงเฉพาะคอลัมน์เลขที่ใบ ไม่ต้องลากทั้งชีตมาเหมือนเดิม
  var ids = sh.getRange(2, c, sh.getLastRow() - 1, 1).getValues();
  var max = 0;
  for (var i = 0; i < ids.length; i++) {
    var m = /^MT-(\d{4})\/(\d{4})$/.exec(String(ids[i][0] || ''));
    if (m && Number(m[2]) === year) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function formatTicketId_(seq) {
  return 'MT-' + ('000' + seq).slice(-4) + '/' + (new Date().getFullYear() + 543);
}

function nextTicketId_() {
  return formatTicketId_(maxTicketSeq_() + 1);
}

/** เก็บรูปลง Drive แล้วคืนลิงก์ — เซลล์ Sheet รับได้ 50,000 ตัวอักษร ≈ รูป 37KB เท่านั้น */
function saveImage_(dataUrl, ticketId) {
  if (!dataUrl) return '';
  var folderId = driveId_(prop_('DRIVE_FOLDER_ID'));
  if (!folderId) return '';

  var m = /^data:(image\/[a-z.+-]+);base64,(.*)$/i.exec(String(dataUrl));
  if (!m) return '';

  // base64 ยาว n ตัว ≈ n*3/4 ไบต์ — เช็คก่อน decode จะได้ไม่เปลือง memory
  if (m[2].length * 0.75 > MAX_IMAGE_BYTES) {
    throw new Error('รูปใหญ่เกิน ' + Math.round(MAX_IMAGE_BYTES / 1048576) + 'MB — กรุณาถ่ายใหม่หรือย่อขนาดก่อน');
  }

  var ext = m[1].indexOf('png') > -1 ? 'png' : 'jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1],
                               ticketId.replace(/\//g, '-') + '.' + ext);
  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (e) {
    /* บอกให้ตรงจุดว่าต้องไปแก้ที่ไหน ไม่ใช่โยนข้อความดิบของ Google ที่อ่านไม่รู้เรื่อง
       ผู้แจ้งเห็นข้อความนี้บนมือถือกลางโรงงาน เขาต้องรู้ว่าต้องไปตามใคร */
    throw new Error('เก็บรูปไม่ได้ — ค่า DRIVE_FOLDER_ID ใน Script Properties ไม่ถูกต้อง ' +
                    '(ต้องเป็นรหัสโฟลเดอร์เปล่า ๆ ไม่ใช่ลิงก์) แจ้งผู้ดูแลระบบ');
  }
  var file = folder.createFile(blob);

  // ค่าเริ่มต้นยังเป็น public link เพื่อให้เปิดจากมือถือได้เหมือนเดิม
  // แต่ถ้ารูปในไลน์ผลิตถือเป็นความลับ ให้เปลี่ยนค่าในชีตตั้งค่าเป็น "เฉพาะในองค์กร"
  try {
    if (String(cfg_('สิทธิ์รูปภาพ', 'ทุกคนที่มีลิงก์')).trim() === 'เฉพาะในองค์กร') {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } else {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
  } catch (e) {
    Logger.log('ตั้งสิทธิ์ไฟล์ไม่สำเร็จ: ' + e.message);
  }
  return file.getUrl();
}

function appendTicket_(t, sh, head) {
  sh = sh || sheet_(SHEET_MAIN);
  head = head || sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  var keyOf = {};
  Object.keys(FIELD_MAP).forEach(function (k) { keyOf[FIELD_MAP[k]] = k; });

  var seqNo = sh.getLastRow();                 // header อยู่แถว 1 จึงเท่ากับจำนวนใบเดิม + 1
  sh.appendRow(head.map(function (h) {
    if (h === 'ลำดับ') return seqNo;
    if (h === 'วันที่แจ้ง') return t.created_at;
    var k = keyOf[h];
    return k && t[k] !== undefined ? t[k] : '';
  }));
}

function apiCreateTicket(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);                       // กันสองคนกดพร้อมกันแล้วได้เลขซ้ำ
  try {
    if (!payload) throw new Error('ไม่มีข้อมูลใบแจ้งซ่อม');
    if (!payload.description || !String(payload.description).trim()) {
      throw new Error('ต้องระบุรายละเอียดอาการเสีย');
    }
    if (needsMachine_(payload.work_type) && !payload.machine_name) {
      throw new Error('ลักษณะงานเป็นเครื่องจักร ต้องเลือกเครื่องจักรด้วย');
    }
    var want = String(payload.action_needed || '').trim();
    if (!want) throw new Error('ต้องเลือกความต้องการ (ซ่อมเอง หรือ เรียกช่างซ่อมบำรุง)');
    if (ACTION_NEEDED.indexOf(want) === -1) {
      throw new Error('ความต้องการต้องเป็น: ' + ACTION_NEEDED.join(' หรือ '));
    }

    var machine = payload.machine_name ? assertKnownMachine_(payload.machine_name) : '';

    var priority = PRIORITIES.filter(function (p) { return p.key === payload.priority; }).length
      ? payload.priority : PRIORITY_DEFAULT;

    var id = nextTicketId_();
    var now = new Date();
    var t = {
      ticket_id: id, created_at: now,
      department: String(payload.department || ''), reporter: String(payload.reporter || ''),
      work_type: String(payload.work_type || ''), machine_name: machine,
      description: String(payload.description).trim(), cause: String(payload.cause || ''),
      action_needed: want,
      cost: 0, pr_no: '', status_legacy: 'รอซ่อม', status: STATUS_OPEN,
      priority: priority, due_at: dueFrom_(now, priority),
      assignee: String(payload.assignee || ''),
      started_at: '', completed_at: '', technician: '', repair_action: '', repair_minutes: '',
      verified_by: '', verified_at: '', verification_status: '', rejection_note: '',
      reject_count: 0, source: String(payload.source || 'แจ้งซ่อม'),
      image_url: ''
    };

    /* รูปแนบพังต้องไม่ทำให้ใบแจ้งซ่อมหายไปทั้งใบ
       ผู้แจ้งกรอกฟอร์มมาจนครบแล้ว การโยนทิ้งทั้งหมดเพราะอัปรูปไม่ผ่าน
       คือวิธีที่ทำให้เขาเลิกใช้ระบบแล้วกลับไปโทรบอกช่างเหมือนเดิม
       ใบเข้าระบบก่อน แล้วค่อยบอกว่ารูปไม่ผ่านเพราะอะไร */
    var imgWarn = '';
    try {
      t.image_url = saveImage_(payload.image_base64, id);
    } catch (e) {
      imgWarn = e.message;
      Logger.log('แนบรูปไม่สำเร็จสำหรับ ' + id + ': ' + e.message);
    }

    appendTicket_(t);
    SpreadsheetApp.flush();                   // ต้อง commit ก่อนปล่อย lock ไม่งั้นคนถัดไปอ่านไม่เจอ = เลขซ้ำ

    writeAudit_('สร้างใบแจ้งซ่อม', id, [
      { field: 'เครื่องจักร', oldValue: '', newValue: machine },
      { field: 'ผู้แจ้ง', oldValue: '', newValue: t.reporter }
    ], t.reporter || 'ผู้แจ้ง');

    notifyNewTicket_(t);
    return { ok: true, ticket_id: id, image_url: t.image_url, due_at: iso_(t.due_at),
             imageWarning: imgWarn };
  } finally {
    lock.releaseLock();
  }
}

/* ─────────── แก้ไขใบแจ้งซ่อม ───────────
   แยก logic ออกเป็น internal เพื่อให้ทั้งฝั่งล็อกอินและฝั่งตรวจรับ ISO ใช้ร่วมกันได้
   โดยที่ apiUpdateTicket บังคับ token ส่วน apiVerifyTicket จำกัดฟิลด์แทน            */

function updateTicketInternal_(ticketId, changes, ctx) {
  ctx = ctx || {};
  /* แปลงชื่อคนตรงนี้ที่เดียว เพราะทุกเส้นทางที่เขียนชีต (แก้ใบ · จ่ายงานหลายใบ · ตรวจรับ)
     วิ่งผ่านฟังก์ชันนี้หมด ถ้าไปดักที่ apiUpdateTicket จะหลุดทางอื่น */
  ['technician', 'assignee'].forEach(function (f) {
    if (changes && changes[f] !== undefined) changes[f] = canonTech_(changes[f]);
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(SHEET_MAIN);
    var lastCol = sh.getLastColumn();
    var head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var col = head.indexOf(FIELD_MAP.ticket_id) + 1;
    if (col === 0) throw new Error('ไม่พบคอลัมน์หมายเลขแจ้งซ่อม');
    if (sh.getLastRow() < 2) throw new Error('ไม่พบใบแจ้งซ่อม ' + ticketId);

    var ids = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(ticketId)) { rowIndex = i + 2; break; }
    }
    if (rowIndex === -1) throw new Error('ไม่พบใบแจ้งซ่อม ' + ticketId);

    // อ่านทั้งแถวครั้งเดียว แก้ใน memory แล้วค่อยเขียนกลับ — เดิม setValue ทีละ cell = หลาย API call
    var rowVals = sh.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
    var colOf = function (key) {
      var h = FIELD_MAP[key];
      return h ? head.indexOf(h) : -1;
    };
    var getVal = function (key) {
      var c = colOf(key);
      return c === -1 ? '' : rowVals[c];
    };

    var work = {};
    Object.keys(changes || {}).forEach(function (k) {
      if (FIELD_MAP[k]) work[k] = changes[k];
    });

    // เปลี่ยนระดับความสำคัญแล้วไม่ได้กำหนดวันเองมาด้วย → เลื่อนกำหนดเสร็จตามระดับใหม่
    if (work.priority && !work.due_at) {
      work.due_at = dueFrom_(toDate_(getVal('created_at')) || new Date(), work.priority);
    }

    // กดเริ่มซ่อม / ปิดงาน แล้วยังไม่ได้ส่งเวลามา ให้ระบบประทับเองฝั่ง server
    if ((work.status === STATUS_DOING || work.status === STATUS_OUT) &&
        !work.started_at && !getVal('started_at')) {
      work.started_at = new Date();
    }
    if ((work.status === STATUS_WAIT || work.status === STATUS_DONE) &&
        !work.completed_at && !getVal('completed_at')) {
      work.completed_at = new Date();
    }

    // นาทีที่ใช้ซ่อมต้องคิดที่ server เท่านั้น ไม่งั้น MTTR ปลอมได้จากหน้าเว็บ
    var startEff = toDate_(work.started_at !== undefined ? work.started_at : getVal('started_at'));
    var endEff   = toDate_(work.completed_at !== undefined ? work.completed_at : getVal('completed_at'));
    if (startEff && endEff && endEff >= startEff) {
      work.repair_minutes = Math.round((endEff - startEff) / 60000);
    }

    // ส่งกลับแก้ไข = นับจำนวนครั้งเพิ่มเองที่ server
    if (work.verification_status && String(work.verification_status).indexOf('ส่งกลับ') > -1) {
      work.reject_count = (Number(getVal('reject_count')) || 0) + 1;
      work.status = STATUS_DOING;
      work.completed_at = '';
      work.repair_minutes = '';
    }
    if (work.verification_status && !work.verified_at) work.verified_at = new Date();

    // สถานะ 4 ขั้นของระบบใหม่ ต้อง map กลับเป็น 2 ค่าเดิมเสมอ ให้สูตร/Pivot เดิมยังนับได้
    if (work.status !== undefined) {
      work.status_legacy = work.status === STATUS_DONE   ? 'ซ่อมแล้ว'
                         : work.status === STATUS_CANCEL ? 'ยกเลิก'
                         : 'รอซ่อม';
    }
    if (work.machine_name) work.machine_name = assertKnownMachine_(work.machine_name);
    if (work.cost !== undefined) work.cost = Number(work.cost) || 0;

    var prevAssignee = String(getVal('assignee') || '').trim();
    var diffs = [];
    var touched = [];

    Object.keys(work).forEach(function (key) {
      var c = colOf(key);
      if (c === -1) return;
      var v = work[key];
      if (DATE_FIELDS.indexOf(key) > -1 && v) v = new Date(v);
      var before = rowVals[c];
      if (String(iso_(before)) === String(iso_(v))) return;    // ไม่เปลี่ยนจริง ไม่ต้องเขียน
      rowVals[c] = v;
      touched.push(c);
      diffs.push({ field: FIELD_MAP[key], oldValue: before, newValue: v });
    });

    if (touched.length) {
      // เขียนเฉพาะช่วงคอลัมน์ที่แตะจริง ไม่ทับทั้งแถวเผื่อมีสูตรอยู่นอกช่วง
      var minC = Math.min.apply(null, touched);
      var maxC = Math.max.apply(null, touched);
      sh.getRange(rowIndex, minC + 1, 1, maxC - minC + 1)
        .setValues([rowVals.slice(minC, maxC + 1)]);
      SpreadsheetApp.flush();
      writeAudit_(ctx.action || 'แก้ไขใบแจ้งซ่อม', ticketId, diffs, ctx.who);
    }

    // แจ้งเตือนหลังเขียนเสร็จ และยิงเฉพาะตอนเปลี่ยนจริง ไม่ใช่ทุกครั้งที่มีฟิลด์นี้ส่งมา
    /* ส่งเมลเฉพาะคนที่ "เพิ่งถูกเพิ่ม" ไม่ใช่ทุกคนในรายการ
       ไม่งั้นเพิ่มช่างคนที่สาม คนที่หนึ่งกับสองจะโดนเมลซ้ำโดยไม่มีอะไรเปลี่ยนสำหรับเขา */
    if (!ctx.quiet) {
      if (work.assignee && String(work.assignee).trim() !== prevAssignee) {
        var had = nameList_(prevAssignee);
        var added = nameList_(work.assignee).filter(function (n) { return had.indexOf(n) === -1; });
        if (added.length) notifyAssigned_(ticketId, added.join(','));
      }
      if (work.status === STATUS_WAIT) notifyWaitVerify_(ticketId);
    }

    return { ok: true, changed: diffs.length, repair_minutes: work.repair_minutes };
  } finally {
    lock.releaseLock();
  }
}

/**
 * แก้ไขใบแจ้งซ่อม — ต้องล็อกอิน
 * ⚠️ signature เปลี่ยนจาก Rev.1: เพิ่ม token เป็นพารามิเตอร์ตัวแรก
 */
/* ฟิลด์ที่เป็นการ "วางแผนและจ่ายงาน" — ตาม Role ที่กำหนด เป็นงานของ Management & Lead
   pr_no = เลขใบขอซื้อจาก ERP หัวหน้าซ่อมบำรุง/หัวหน้าช่างเทคนิคเป็นคนกรอก ใช้ส่งต่อให้ฝ่ายบัญชี */
var LEAD_ONLY_FIELDS = ['priority', 'due_at', 'assignee', 'pr_no', 'cancel_reason'];

function apiUpdateTicket(token, ticketId, changes) {
  var user = requireAuth_(token);
  if (!ticketId) throw new Error('ต้องระบุหมายเลขใบแจ้งซ่อม');

  var planning = Object.keys(changes || {}).filter(function (k) {
    return LEAD_ONLY_FIELDS.indexOf(k) > -1;
  });
  if (planning.length) requireAuth_(token, 'LEAD');

  /* ยกเลิกใบเป็นสิทธิ์ของหัวหน้างานเท่านั้น และต้องมีเหตุผลเสมอ
     ใบที่หายไปจากสถิติโดยไม่มีคำอธิบาย คือช่องโหว่ที่ทำให้ตัวเลขถูกแต่งได้ */
  if (changes && changes.status === STATUS_CANCEL) {
    requireAuth_(token, 'LEAD');
    if (!String(changes.cancel_reason || '').trim()) throw new Error('ต้องระบุเหตุผลที่ยกเลิก');
  }
  return updateTicketInternal_(ticketId, changes, {
    action: 'แก้ไขใบแจ้งซ่อม',
    who: user.name + ' (' + user.role + ')'     // Audit ต้องรู้ว่าใครเป็นคนแก้
  });
}

/* ═══════════ จัดการงานทีละหลายใบ ═══════════
   หัวหน้าเปิดรายการเจองานใหม่ 15 ใบที่ต้องจ่ายให้ช่างคนเดียวกัน การเปิดทีละใบ
   กดทีละครั้ง ปิดทีละครั้ง คือเหตุผลที่คนกลับไปใช้ Excel

   ไม่ครอบ LockService ตรงนี้ เพราะ updateTicketInternal_ ล็อกเองอยู่แล้ว
   ครอบซ้ำจะกลายเป็นถือล็อกยาวตลอดลูป คนอื่นบันทึกอะไรไม่ได้เลยระหว่างนั้น */

/* จงใจไม่ให้ปิดงาน (ซ่อมเสร็จสมบูรณ์) แบบหลายใบ — ISO ต้องมีผู้ตรวจรับเซ็นรายใบ
   ถ้าเปิดช่องไว้ วันหนึ่งจะมีคนกดปิด 30 ใบรวดเดียวแล้วบันทึกการตรวจรับกลายเป็นของปลอมทั้งชุด */
var BULK_FIELDS = ['status', 'assignee', 'priority', 'due_at'];
var BULK_MAX = 50;                  // GAS ตัดการทำงานที่ 6 นาที เผื่อไว้ไม่ให้ค้างกลางทาง

function apiBulkUpdate(token, ids, changes) {
  var user = requireAuth_(token, 'LEAD');

  var seen = {}, list = [];
  (ids || []).forEach(function (v) {
    var id = String(v == null ? '' : v).trim();
    if (!id || seen[id]) return;    // กดเลือกซ้ำจากหน้าเว็บไม่ควรกลายเป็นเขียนซ้ำ
    seen[id] = 1;
    list.push(id);
  });
  if (!list.length) throw new Error('ยังไม่ได้เลือกใบแจ้งซ่อม');
  if (list.length > BULK_MAX) throw new Error('เลือกได้ครั้งละไม่เกิน ' + BULK_MAX + ' ใบ');

  var safe = {};
  Object.keys(changes || {}).forEach(function (k) {
    if (BULK_FIELDS.indexOf(k) > -1 && changes[k] !== '' && changes[k] != null) safe[k] = changes[k];
  });
  if (safe.status === STATUS_DONE) throw new Error('ปิดงานหลายใบพร้อมกันไม่ได้ — ต้องผ่านการตรวจรับรายใบ');
  // ยกเลิกต้องมีเหตุผลรายใบ ซึ่งการเลือกทีละหลายใบให้ไม่ได้ ต้องเปิดทีละใบ
  if (safe.status === STATUS_CANCEL) throw new Error('ยกเลิกหลายใบพร้อมกันไม่ได้ — ต้องระบุเหตุผลรายใบ');
  if (!Object.keys(safe).length) throw new Error('ยังไม่ได้เลือกสิ่งที่จะแก้');

  var done = [], failed = [];
  list.forEach(function (id) {
    try {
      updateTicketInternal_(id, safe, {
        action: 'แก้ไขหลายใบพร้อมกัน',
        who: user.name + ' (' + user.role + ')',
        quiet: true               // เมลรวมส่งทีเดียวท้ายสุด ไม่ใช่ใบละฉบับ
      });
      done.push(id);
    } catch (e) {
      failed.push(id + ' — ' + e.message);
    }
  });

  /* จ่ายงาน 15 ใบให้ช่างคนเดียวแล้วส่งเมล 15 ฉบับ คือวิธีที่ทำให้เขาตั้งกฎกรองเมลเราทิ้ง
     ส่งฉบับเดียวที่มีรายการครบแทน */
  if (safe.assignee && done.length) {
    var url = ticketLink_();
    nameList_(safe.assignee).forEach(function (n) {
      var to = emailOf_(n);
      if (!to) return;
      sendMail_(to, 'ได้รับมอบหมายงาน ' + done.length + ' ใบ',
        '<p>สวัสดีครับ ' + esc_(n) + ' — คุณได้รับมอบหมายงาน ' + done.length + ' ใบ</p><ul>' +
        done.map(function (x) { return '<li>' + esc_(x) + '</li>'; }).join('') + '</ul>' +
        (url ? '<p><a href="' + url + '">เปิดระบบแจ้งซ่อม</a></p>' : ''));
    });
  }

  return { ok: true, done: done.length, failed: failed };
}

/**
 * ตรวจรับงานตามมาตรฐาน ISO — ฝ่ายผลิตทำได้โดยไม่ต้องล็อกอิน
 * แต่เขียนได้แค่ 3 ฟิลด์ที่ whitelist ไว้เท่านั้น แก้ค่าใช้จ่าย/สถานะเองไม่ได้
 */
function apiVerifyTicket(ticketId, payload) {
  if (!ticketId) throw new Error('ต้องระบุหมายเลขใบแจ้งซ่อม');
  payload = payload || {};

  var safe = {};
  VERIFY_FIELDS.forEach(function (k) {
    if (payload[k] !== undefined) safe[k] = String(payload[k]);
  });
  if (!safe.verification_status) throw new Error('ต้องระบุผลการตรวจรับ');
  if (!safe.verified_by) throw new Error('ต้องระบุชื่อผู้ตรวจรับงาน');

  var pass = safe.verification_status.indexOf('ส่งกลับ') === -1;
  if (!pass && !safe.rejection_note) throw new Error('ส่งกลับแก้ไขต้องระบุสาเหตุ');
  if (pass) safe.status = STATUS_DONE;        // ตั้งให้เองฝั่ง server ไม่รับจาก client

  var res = updateTicketInternal_(ticketId, safe, {
    action: pass ? 'ตรวจรับงานผ่าน' : 'ส่งกลับแก้ไข',
    who: safe.verified_by
  });

  /* ให้คะแนนได้เฉพาะตอนอนุมัติ — งานที่ส่งกลับยังไม่จบ ให้คะแนนตอนนี้ก็ยังไม่รู้ผล
     และเหตุผลที่ส่งกลับถูกเก็บไว้ที่ใบแจ้งซ่อมอยู่แล้ว ไม่ต้องเก็บซ้ำ */
  var rating = Number(payload.rating) || 0;
  var comment = String(payload.comment || '').trim();
  if (pass && (rating || comment)) {
    try {
      writeFeedback_({
        type: rating >= 4 ? FEEDBACK_TYPES[0] : rating && rating <= 2 ? FEEDBACK_TYPES[2] : FEEDBACK_TYPES[1],
        rating: rating, subject: 'ตรวจรับงาน ' + ticketId,
        detail: comment, by: safe.verified_by, dept: '', ticketId: ticketId
      });
    } catch (e) {
      Logger.log('บันทึกคะแนนตรวจรับไม่สำเร็จ: ' + e.message);   // ให้การตรวจรับผ่านไปก่อน คะแนนเป็นของแถม
    }
  }
  return res;
}

/* ─────────── เข้าสู่ระบบ ─────────── */

/* ═══════════ เข้าสู่ระบบรายคน ═══════════
   Requester (ผู้แจ้ง) ไม่ต้องล็อกอิน — แจ้งซ่อมและตรวจรับงานได้เลย
   ล็อกอินเฉพาะ Technician กับ Management & Lead

   บัญชีอยู่ในชีต Users คอลัมน์เรียงตรงกับ Auth.gs ของโปรเจคระบบ Stock อะไหล่
   เข้าครั้งแรก = ตั้ง PIN ของตัวเอง จึงควรให้ทุกคนตั้ง PIN ทันทีหลัง deploy
   ก่อนหน้านั้นใครรู้อีเมลในลิสต์ก็ยึดบัญชีได้                              */

var MAX_FAILURES = 5;
var LOCK_MINUTES = 15;

/* TECH = ช่างซ่อมบำรุง/ช่างเทคนิค — รับงาน บันทึกผลซ่อม ทำ PM
   LEAD = ผจก./รอง ผจก./วิศวกร/หัวหน้าซ่อมบำรุง/หัวหน้าช่าง — ครบทุกอย่าง
   ENG  = ชื่อเดิมจากโปรเจค Stock อะไหล่ ถือเท่ากับ LEAD เพื่อให้ใช้ชีต Users ร่วมกันได้ */
/* ADMIN เคยหลุดจากตารางนี้ทั้งที่ paramCanApprove_ อ้างถึง
   ผลคือใครที่ใส่บทบาท ADMIN ในชีตจะได้ RANK 0 คือต่ำกว่าช่าง แล้วทำอะไรไม่ได้เลย
   โดยไม่มี error บอกว่าเป็นเพราะบทบาทไม่มีในตาราง */
var RANK = { TECH: 1, LEAD: 2, ENG: 2, ADMIN: 3 };

/* ตำแหน่งคอลัมน์ในชีต Users (ตรงกับ US ของ Auth.gs) */
var US = { EMAIL: 0, NAME: 1, ROLE: 2, ACTIVE: 3, PIN: 4, SALT: 5, FAILED: 6, LOCKED: 7,
           PHOTO: 8, ALIAS: 9, STATION: 10 };

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function randomHex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes; i++) out += ('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
  return out + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

function hashPin_(pin, salt) { return sha256_(salt + ':' + String(pin)); }

/** คอลัมน์ "รูป" ในชีต Users
 *  ลิงก์แชร์ของ Drive (.../file/d/<id>/view) เอามาใส่ <img> ตรง ๆ ไม่ขึ้น
 *  ต้องแปลงเป็นลิงก์ thumbnail ก่อน — ลิงก์รูปปกติหรือ data: ปล่อยผ่านไปเลย */
function photoUrl_(v) {
  var raw = String(v || '').trim();
  if (!raw) return '';
  var m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(raw) || /[?&]id=([A-Za-z0-9_-]{20,})/.exec(raw);
  return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w200' : raw;
}

/** token พกตัวตนไปด้วย เพื่อให้ Audit รู้ว่าใครเป็นคนแก้ */
/* ⚠️ ต้องระบุ Charset.UTF_8 เสมอ
   Utilities.base64EncodeWebSafe(string) แบบไม่ใส่ charset ใช้ชุดอักขระเริ่มต้น
   ซึ่งแปลงตัวอักษรไทยทุกตัวเป็น "?" ชื่อ "ช่างตั้ม" จึงกลายเป็น "??????" ตั้งแต่ตอนออก token

   เจอเพราะเอกสาร FM-MT-06 ขึ้นว่า "โดย ??????" ทั้งที่ชื่อไทยที่อื่นในใบเดียวกันปกติหมด
   (ที่อื่นอ่านจากชีตตรง ๆ ไม่ได้ผ่าน token)

   ผลกระทบจริงหนักกว่าเอกสาร — ชื่อผู้แก้ในชีต Audit มาจาก token ตัวนี้
   แปลว่าประวัติการแก้ไขทั้งหมดที่ผ่านมาบันทึกชื่อคนไทยไว้เป็น ?????? ซึ่งเป็นสิ่งที่ ISO ต้องการที่สุด

   ขาถอดรหัสไม่ต้องแก้ — newBlob().getDataAsString() ใช้ UTF-8 อยู่แล้ว
   token เก่าที่ค้างในเครื่องยังใช้ได้ต่อ แค่ชื่อยังเป็น ?????? จนกว่าจะล็อกอินใหม่ */
function signUser_(user, ttlSeconds) {
  var body = Utilities.base64EncodeWebSafe(JSON.stringify({
    e: user.email, n: user.name, r: user.role,
    x: Date.now() + (ttlSeconds || 8 * 3600) * 1000
  }), Utilities.Charset.UTF_8);
  return body + '.' + hmac_(body);
}

function userFromToken_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  if (!safeEqual_(parts[1], hmac_(parts[0]))) return null;
  var d;
  try {
    d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (e) { return null; }
  if (!d || Number(d.x) < Date.now()) return null;
  return { email: d.e || '', name: d.n || '', role: String(d.r || 'TECH').toUpperCase() };
}

function apiLogin(email, pin) {
  email = String(email || '').trim().toLowerCase();
  pin = String(pin || '').trim();
  if (!email || !pin) throw new Error('กรอกอีเมลและรหัส PIN');
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN ต้องเป็นตัวเลข 4–8 หลัก');

  var sh = sheet_(SHEET_USERS);
  var rows = sh.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][US.EMAIL]).trim().toLowerCase() !== email) continue;
    /* เดิมเทียบ === false อย่างเดียว คนที่พิมพ์ "ไม่" ลงช่องใช้งานจึงยังล็อกอินได้
       ทั้งที่หัวหน้าคิดว่าปิดไปแล้ว — ใช้ตัวเดียวกับที่หน้าอื่นใช้ */
    if (!isActive_(rows[i][US.ACTIVE])) throw new Error('บัญชีนี้ถูกปิดใช้งาน');

    var lockedUntil = rows[i][US.LOCKED] instanceof Date ? rows[i][US.LOCKED].getTime() : 0;
    if (lockedUntil > Date.now()) {
      throw new Error('ถูกล็อกอีก ' + Math.ceil((lockedUntil - Date.now()) / 60000) + ' นาที');
    }

    var stored = String(rows[i][US.PIN] || '');
    var salt = String(rows[i][US.SALT] || '');
    var user = {
      email: email,
      name: String(rows[i][US.NAME] || email),
      role: String(rows[i][US.ROLE] || 'TECH').toUpperCase(),
      station: String(rows[i][US.STATION] || '').trim(),
      photo: photoUrl_(rows[i][US.PHOTO])
    };

    // ยังไม่เคยตั้ง PIN → ครั้งนี้คือการตั้ง
    if (!stored) {
      /* บังคับเฉพาะตอนตั้งใหม่ — คนที่ใช้ PIN 4 หลักอยู่เดิมยังเข้าได้เหมือนเดิม
         ไล่ให้ทุกคนเปลี่ยพร้อมกัน = ช่างเข้าระบบไม่ได้ทั้งกะ ซึ่งแย่กว่า PIN สั้น */
      var weak = pinTooWeak_(pin);
      if (weak) throw new Error(weak);
      var newSalt = randomHex_(8);
      sh.getRange(i + 1, US.PIN + 1, 1, 2).setValues([[hashPin_(pin, newSalt), newSalt]]);
      sh.getRange(i + 1, US.FAILED + 1, 1, 2).setValues([[0, '']]);
      writeAudit_('ตั้ง PIN ครั้งแรก', '', [], user.name);
      return { token: signUser_(user), user: user, firstTime: true, expiresInHours: 8 };
    }

    if (!safeEqual_(hashPin_(pin, salt), stored)) {
      var failed = (Number(rows[i][US.FAILED]) || 0) + 1;
      var until = failed >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60000) : '';
      sh.getRange(i + 1, US.FAILED + 1, 1, 2).setValues([[failed, until]]);
      Utilities.sleep(700);                   // หน่วงกันเดารัว ๆ
      throw new Error(until
        ? 'ใส่ PIN ผิดหลายครั้ง — ล็อก ' + LOCK_MINUTES + ' นาที'
        : 'PIN ไม่ถูกต้อง เหลืออีก ' + (MAX_FAILURES - failed) + ' ครั้ง');
    }

    sh.getRange(i + 1, US.FAILED + 1, 1, 2).setValues([[0, '']]);
    return { token: signUser_(user), user: user, expiresInHours: 8 };
  }

  Utilities.sleep(700);
  throw new Error('ไม่พบอีเมลนี้ในระบบ — แจ้งหัวหน้าให้เพิ่มบัญชีในชีต Users');
}

/** คำอธิบายว่าทำไม PIN นี้ใช้ไม่ได้ — คืน '' แปลว่าใช้ได้

    เลข 4 หลักมีแค่ 10,000 แบบ ถ้าชีต Users หลุดออกไป เดาหมดในไม่กี่วินาที
    การล็อกหลังใส่ผิดหลายครั้งช่วยอะไรไม่ได้ เพราะคนเดาไม่ได้เดาผ่านหน้าเว็บ */
function pinTooWeak_(pin) {
  if (!/^\d{6,8}$/.test(pin)) return 'PIN ต้องเป็นตัวเลข 6–8 หลัก';
  if (/^(\d)\1*$/.test(pin)) return 'PIN ห้ามเป็นเลขซ้ำกันทั้งหมด';
  /* เรียงขึ้นหรือเรียงลง เช่น 123456 / 987654 — สองแบบนี้อยู่ต้นๆ ของทุกรายการเดา */
  var up = 1, down = 1;
  for (var i = 1; i < pin.length; i++) {
    var d = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (d !== 1) up = 0;
    if (d !== -1) down = 0;
  }
  if (up || down) return 'PIN ห้ามเป็นเลขเรียงติดกัน';
  return '';
}

/** ทางออกฉุกเฉิน: รันจาก Apps Script editor เพื่อล้าง PIN ให้ตั้งใหม่ */
function resetPin(email) {
  var sh = sheet_(SHEET_USERS);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][US.EMAIL]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      sh.getRange(i + 1, US.PIN + 1, 1, 4).setValues([['', '', 0, '']]);
      Logger.log('ล้าง PIN ของ ' + email + ' แล้ว — เข้าครั้งหน้าจะเป็นการตั้ง PIN ใหม่');
      return 'ล้าง PIN แล้ว';
    }
  }
  Logger.log('ไม่พบอีเมล ' + email + ' ในชีต Users');
  return 'ไม่พบอีเมล';
}

/** ให้หน้าเว็บเช็คได้ว่า token ยังไม่หมดอายุ */
function apiCheckToken(token) {
  var u = userFromToken_(token);
  return u ? { valid: true, user: u } : { valid: false };
}

/* ─────────── PM รายเดือน (ตัวเลขสำหรับ KPI) ─────────── */

function apiGetPM() {
  var out = {};
  readSheet_(SHEET_PM).forEach(function (r) {
    if (!r['ปี'] || !r['เดือน']) return;
    out[r['ปี'] + '-' + ('0' + r['เดือน']).slice(-2)] = {
      workHours: Number(r['ชั่วโมงทำงาน']) || 0,
      pmPlan: Number(r['แผน PM']) || 0,
      pmDone: Number(r['PM เสร็จ']) || 0
    };
  });
  return out;
}

function apiSetPM(token, year, month, data) {
  var actor = requireAuth_(token, 'LEAD');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(SHEET_PM);
    var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : [];
    var mm = ('0' + month).slice(-2);
    var target = -1;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(year) && ('0' + rows[i][1]).slice(-2) === mm) { target = i + 2; break; }
    }
    var values = [Number(year), Number(month), Number(data.workHours) || 0,
                  Number(data.pmPlan) || 0, Number(data.pmDone) || 0];
    if (target === -1) sh.appendRow(values); else sh.getRange(target, 1, 1, 5).setValues([values]);
    SpreadsheetApp.flush();
    writeAudit_('บันทึก PM รายเดือน', year + '-' + mm, [], actor.name);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ─────────── แผน PM อัตโนมัติ ─────────── */

/* ═══════════ งาน PM ไม่ใช่ใบแจ้งซ่อม ═══════════
   เดิม generatePMTickets() ออก "ใบแจ้งซ่อม" ลง Sheet1 ให้ทุกงาน PM ที่ถึงรอบ
   ซึ่งผิดตั้งแต่แนวคิด แล้วสร้างปัญหาต่อเนื่องสี่ข้อ

   1. สถิติเพี้ยน — งาน PM ที่วางแผนไว้ถูกนับรวมกับ "ของพัง"
      MTTR · Pareto · อัตราซ่อมซ้ำ · Heatmap ล้วนคิดจากใบแจ้งซ่อม
      ยิ่งทำ PM ขยันเท่าไหร่ ตัวเลขยิ่งดูเหมือนเครื่องเสียบ่อยขึ้นเท่านั้น

   2. เอกสารผิดประเภท — งาน PM ได้ FM-MT-04 ซึ่งเป็นช่องเขียนบรรยายว่าซ่อมอะไร
      ทั้งที่ต้องการ FM-MT-05 ที่เป็นรายการติ๊กตามหัวข้อตรวจ

   3. ขั้นตอนไม่สมเหตุผล — ใบแจ้งซ่อมต้องผ่าน "ฝ่ายผลิตตรวจรับ"
      แต่งาน PM ฝ่ายผลิตไม่ได้เป็นคนร้องขอ จะให้เขาตรวจรับอะไร

   4. แผนโกหก — ของเดิมเลื่อน "ทำครั้งล่าสุด" ตอน *ออกใบ* ไม่ใช่ตอน *ทำเสร็จ*
      ออกใบแล้วไม่มีใครทำ รอบถัดไปก็ยังถูกเลื่อนไปอีก 90 วันอยู่ดี
      ตอนนี้มีแต่ touchPlanLastDone_() ที่เขียนช่องนี้ และมันถูกเรียกตอนกดเสร็จเท่านั้น

   ตาราง PM ทำหน้าที่นี้อยู่แล้วและทำได้ดีกว่าทุกข้อ — มีสถานะรายครั้ง เลื่อนแผนพร้อมรายการชดเชย
   และคิด Compliance ได้จริง งานรายวันจึงเหลือแค่ "ต่อตารางไม่ให้หมด" ไม่ใช่ออกใบ

   ── ทิศทางเดียวที่ยังเชื่อมกันอยู่ ──
   ทำ PM แล้ว *เจอของเสีย* → เปิดใบแจ้งซ่อม  ซึ่งถูกต้องและต้องมี
   แต่ต้องเป็นคนกดเอง ไม่ใช่ระบบออกให้ทุกใบ ดู apiPmMakeTicket() */

/**
 * ลบรายการ PM ที่ "ยังไม่ได้ทำ" ของงานหนึ่งออกจากตาราง — รันจาก Apps Script editor
 * ใช้เก็บกวาดงานรอบสั้นที่เคยกางลงปฏิทินไปแล้วหลายร้อยแถว
 * แถวที่ทำไปแล้ว เลื่อนไปแล้ว หรือผูกใบแจ้งซ่อมไว้ จะไม่ถูกแตะ เพราะเป็นประวัติที่ต้องเก็บ
 *
 * @param {string} machine ชื่อเครื่องจักรตามทะเบียน
 * @param {string} task    ชื่องาน PM ให้ตรงกับในชีตแผน
 */
function removePlannedPm(machine, task) {
  var pack = pmRows_(), i = pmIdx_(pack.head);
  var mc = canonical_(machine), tk = String(task || '').trim();
  if (!mc || !tk) return 'ต้องระบุชื่อเครื่องจักรและชื่องาน PM';

  var rows = [];
  pack.rows.forEach(function (r, n) {
    var o = pmObj_(r, i);
    if (o.machine !== mc || o.task !== tk) return;
    if (o.status !== PM_PLANNED || o.actual || o.ticketId) return;   // มีประวัติแล้ว อย่าลบ
    rows.push(n + 2);
  });
  if (!rows.length) return 'ไม่พบรายการที่ลบได้ของ ' + mc + ' · ' + tk;

  // ลบจากล่างขึ้นบน ไม่งั้นเลขแถวเลื่อนระหว่างลบ
  rows.reverse().forEach(function (n) { pack.sheet.deleteRow(n); });
  SpreadsheetApp.flush();
  clearCache();
  writeAudit_('ลบรายการ PM ที่ยังไม่ได้ทำ', mc + ' · ' + tk + ' จำนวน ' + rows.length, [], 'ผู้ดูแลระบบ');
  var msg = 'ลบ ' + rows.length + ' รายการของ ' + mc + ' · ' + tk + ' (เฉพาะที่ยังไม่ได้ทำ)';
  Logger.log(msg);
  return msg;
}

/** ต่อตาราง PM ให้ยาวล่วงหน้าเสมอ — งานรายวันแทนตัวออกใบเดิม */
function extendPmSchedule() {
  var r = pmBuildSchedule_(12);
  var msg = 'ต่อตาราง PM ล่วงหน้า 12 เดือน — เพิ่ม ' + r.created + ' ครั้ง';
  if (r.skipped.length) msg += '\nข้าม ' + r.skipped.length + ' แผน:\n  ' + r.skipped.join('\n  ');
  Logger.log(msg);
  return msg;
}

/**
 * เปิดใบแจ้งซ่อมจากงาน PM — ใช้เมื่อตรวจแล้วเจอของที่ต้องซ่อมจริง
 * ผูกเลขใบกลับเข้าแถว PM เพื่อให้ตามรอยได้ว่าใบนี้มาจากการตรวจรอบไหน
 */
function apiPmMakeTicket(token, id, payload) {
  var user = requireAuth_(token);
  payload = payload || {};
  var detail = String(payload.description || '').trim();
  if (!detail) throw new Error('ต้องระบุสิ่งที่พบจากการตรวจ');

  var pack = pmRows_(), i = pmIdx_(pack.head);
  var row = pmFindRow_(pack, i, id);
  var o = pmObj_(pack.rows[row - 2], i);
  if (o.ticketId) throw new Error('งาน PM นี้เปิดใบแจ้งซ่อม ' + o.ticketId + ' ไว้แล้ว');

  var res = apiCreateTicket({
    department: 'ฝ่ายซ่อมบำรุง',
    reporter: user.name,
    /* ไม่ใช้ลักษณะงาน "PM เครื่องจักร" โดยตั้งใจ — ใบนี้คือของที่พังจริงและต้องถูกนับ
       ในสถิติเหมือนงานเสียอื่น ๆ ที่มาจาก PM คือ "ที่มา" ไม่ใช่ "ประเภทงาน" */
    work_type: o.machine ? 'เครื่องจักร' : 'งานโครงสร้างอาคารและสถานที่',
    machine_name: o.machine,
    description: detail,
    cause: 'พบจากการตรวจ PM: ' + o.task,
    action_needed: 'ต้องการเรียกช่างซ่อมบำรุง',
    priority: PRIORITIES.filter(function (x) { return x.key === payload.priority; }).length
      ? payload.priority : PRIORITY_DEFAULT,
    assignee: o.owner || '',
    source: 'พบจากการตรวจ PM'
  });

  pack.sheet.getRange(row, i['เลขที่ใบแจ้งซ่อม'] + 1).setValue(res.ticket_id);
  SpreadsheetApp.flush();
  writeAudit_('เปิดใบแจ้งซ่อมจากงาน PM', id + ' → ' + res.ticket_id, [], user.name);
  return { ok: true, ticket_id: res.ticket_id };
}

function apiGetPMPlan(token) {
  requireAuth_(token);
  var today = new Date();
  return readSheet_(SHEET_PMPLAN)
    .filter(function (r) { return r['เครื่องจักร'] && isActive_(r['ใช้งาน']); })
    .map(function (r) {
      var cycle = Number(r['รอบ (วัน)']) || 0;
      var last = toDate_(r['ทำครั้งล่าสุด']);
      var due = last && cycle ? new Date(last.getTime() + cycle * 864e5) : null;
      return {
        machine: canonical_(r['เครื่องจักร']), task: String(r['งาน PM']), cycle: cycle,
        last: last ? last.toISOString() : '', due: due ? due.toISOString() : '',
        daysLeft: due ? Math.ceil((due - today) / 864e5) : 0,
        owner: String(r['ผู้รับผิดชอบ'] || ''),
        kind: String(r['ประเภทงาน'] || PM_KIND_DEFAULT),
        hours: Number(r['ชั่วโมงที่วางแผน']) || 0,
        checklist: String(r['หัวข้อตรวจ'] || '')
      };
    })
    .sort(function (a, b) { return a.daysLeft - b.daysLeft; });
}

/* ═══════════ ตาราง PM (ปฏิทิน) ═══════════
   ชีต "แผน PM" เดิมเก็บแค่ "รอบกี่วัน" กับ "ทำครั้งล่าสุด" ซึ่งพอสำหรับออกใบอัตโนมัติ
   แต่ทำปฏิทินไม่ได้ เพราะไม่มีวันที่ของแต่ละครั้งเก็บไว้จริง ๆ

   ชีตนี้จึงเก็บ "แต่ละครั้งที่ต้องทำ" เป็นแถวของตัวเอง — 1 แถว = PM 1 ครั้ง
   ได้ปฏิทิน ได้สถานะรายครั้ง และที่สำคัญคือคิด PM Compliance ได้จริง

   ── การเลื่อนแผน ──
   ไม่แก้วันที่ในแถวเดิม แต่ปิดแถวเดิมเป็น "เลื่อน" แล้วสร้างแถวชดเชยใหม่
   ถ้าแก้วันที่ทับไปเลย ประวัติการเลื่อนจะหายหมด แล้ว Compliance จะสวยเกินจริง 100% ตลอด
   ซึ่งเป็นตัวเลขที่ไม่มีใครเชื่อและใช้ตัดสินใจอะไรไม่ได้ */

var SHEET_PMCAL = 'ตาราง PM';
var PMCAL_HEAD = ['รหัส', 'เครื่องจักร', 'งาน PM', 'วันที่วางแผน', 'วันที่ทำจริง', 'สถานะ',
                  'ผู้รับผิดชอบ', 'เลขที่ใบแจ้งซ่อม', 'ชดเชยจากวันที่', 'เหตุผลที่เลื่อน', 'หมายเหตุ',
                  'ประเภทงาน', 'ชั่วโมงที่วางแผน'];

/* ═══════════ งานที่วางแผนไว้ — ไม่ใช่แค่ PM ตามรอบ ═══════════
   ชีต "แผนงานซ่อมบำรุง" ใน Excel เดิมมีงานอีกชนิดที่ระบบมองไม่เห็นเลย — งานที่หัวหน้า
   วางเองว่าเดือนนี้จะทำอะไร (ล้าง Cooling Tower · Modify ชุดลำเลียง · ย้ายกล้องวงจรปิด)
   36 งานใน 2 เดือน กินเวลาทีมไป 370 ชั่วโมง

   ไม่สร้างชีตใหม่ให้มันโดยตั้งใจ — ตาราง PM รองรับได้เกือบครบอยู่แล้ว
   (1 แถว = งาน 1 ครั้ง มีวันวางแผน วันทำจริง สถานะ ผู้รับผิดชอบ เหตุผลที่เลื่อน)
   ขาดแค่ "นี่งานชนิดไหน" กับ "วางแผนไว้กี่ชั่วโมง" จึงเติมสองคอลัมน์แล้วจบ

   ชั่วโมงที่วางแผนคือตัวตั้งของ PMP (Planned Maintenance Percentage)
   ซึ่งตอบคำถามที่หัวหน้าซ่อมบำรุงโดนถามบ่อยที่สุด — ทีมวิ่งดับไฟกี่ % ทำงานที่วางไว้กี่ % */
var PM_KINDS = ['PM ตามรอบ', 'ปรับปรุง', 'ติดตั้งใหม่', 'งานอาคาร', 'อื่นๆ'];
var PM_KIND_DEFAULT = 'PM ตามรอบ';

var PM_PLANNED = 'วางแผนไว้';
var PM_DOING   = 'กำลังทำ';
var PM_DONE    = 'เสร็จแล้ว';
var PM_MOVED   = 'เลื่อน';
var PM_SKIP    = 'ยกเลิก';
var PM_STATUS  = [PM_PLANNED, PM_DOING, PM_DONE, PM_MOVED, PM_SKIP];

function pmCalSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_PMCAL);
  if (!sh) {
    sh = ss.insertSheet(SHEET_PMCAL);
    sh.getRange(1, 1, 1, PMCAL_HEAD.length).setValues([PMCAL_HEAD])
      .setFontWeight('bold').setBackground('#e8fbf1');
    sh.setFrozenRows(1);
  }
  return sh;
}

function pmRows_() {
  var sh = pmCalSheet_();
  if (sh.getLastRow() < 2) return { rows: [], head: PMCAL_HEAD, sheet: sh };
  var vals = sh.getDataRange().getValues();
  var head = vals.shift();
  return { rows: vals, head: head, sheet: sh };
}

function pmIdx_(head) {
  var o = {};
  PMCAL_HEAD.forEach(function (h) { o[h] = head.indexOf(h); });
  return o;
}

function pmObj_(r, i) {
  var planned = toDate_(r[i['วันที่วางแผน']]);
  var actual  = toDate_(r[i['วันที่ทำจริง']]);
  return {
    id: String(r[i['รหัส']] || ''),
    machine: canonical_(r[i['เครื่องจักร']]),
    task: String(r[i['งาน PM']] || ''),
    planned: planned ? dayKey_(planned) : '',
    actual: actual ? dayKey_(actual) : '',
    status: String(r[i['สถานะ']] || PM_PLANNED),
    owner: String(r[i['ผู้รับผิดชอบ']] || ''),
    ticketId: String(r[i['เลขที่ใบแจ้งซ่อม']] || ''),
    movedFrom: (function () { var d = toDate_(r[i['ชดเชยจากวันที่']]); return d ? dayKey_(d) : ''; })(),
    reason: String(r[i['เหตุผลที่เลื่อน']] || ''),
    note: String(r[i['หมายเหตุ']] || ''),
    // สองช่องนี้เพิ่งมี แถวเก่าจึงว่าง — ให้ถือว่าเป็น PM ตามรอบไว้ก่อน ซึ่งเป็นของจริงของแถวเก่าทั้งหมด
    kind: String(r[i['ประเภทงาน']] || PM_KIND_DEFAULT),
    hours: Number(r[i['ชั่วโมงที่วางแผน']]) || 0
  };
}

/** ออกตารางล่วงหน้าจากชีต "แผน PM" — ครั้งที่มีอยู่แล้วในวันเดียวกันจะถูกข้าม รันซ้ำได้ */
function apiPmBuildSchedule(token, months) {
  var user = requireAuth_(token, 'LEAD');
  var r = pmBuildSchedule_(months, user.name);
  return { ok: true, created: r.created, skipped: r.skipped,
           message: 'ออกตาราง PM เพิ่ม ' + r.created + ' ครั้ง (ล่วงหน้า ' +
                    Math.min(Math.max(Number(months) || 6, 1), 24) + ' เดือน)' +
                    (r.skipped.length ? ' · ข้าม ' + r.skipped.length + ' แผน' : '') };
}

/** แกนของการกางตาราง — แยกออกมาให้ทั้งปุ่มบนหน้าเว็บและงานรายวันใช้ร่วมกัน */
function pmBuildSchedule_(months, who) {
  months = Math.min(Math.max(Number(months) || 6, 1), 24);
  /* งานรอบ 1 วันกางลงปฏิทิน 12 เดือน = 365 แถวต่องานเดียว
     เจอจริงแล้ว — "Air compresser 100hp ทำความสะอาดฟิวเตอร์" รอบ 1 วัน
     ทำให้รายงานทั้งหน้ากลายเป็นบรรทัดเดียวกันซ้ำ ๆ และปฏิทินอ่านไม่ได้

     งานรายวันไม่ควรอยู่ในปฏิทิน PM ตั้งแต่แรก — มันคือ "เช็คชีตประจำวัน"
     ซึ่งระบบมีอยู่แล้วผ่าน Google Form และไม่ต้องมีแถวต่อครั้ง
     ปรับเกณฑ์ได้ที่ชีตตั้งค่าถ้าโรงงานอยากได้จริง ๆ */
  var minCycle = Number(cfg_('รอบต่ำสุดที่กางลงปฏิทิน', 7)) || 7;
  var skipped = [];

  var plan = readSheet_(SHEET_PMPLAN)
    .filter(function (r) { return r['เครื่องจักร'] && r['งาน PM'] && isActive_(r['ใช้งาน']); });
  if (!plan.length) return { created: 0, skipped: [] };

  var pack = pmRows_(), i = pmIdx_(pack.head);
  var seen = {}, maxSeq = 0;
  pack.rows.forEach(function (r) {
    var o = pmObj_(r, i);
    seen[o.machine + '|' + o.task + '|' + o.planned] = true;
    var m = /^PM-(\d+)$/.exec(o.id);
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  });

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var limit = new Date(today.getTime());
  limit.setMonth(limit.getMonth() + months);

  var out = [];
  plan.forEach(function (r) {
    var label = String(r['เครื่องจักร']) + ' · ' + String(r['งาน PM']);

    var cycle = Number(r['รอบ (วัน)']) || 0;
    if (cycle <= 0) { skipped.push(label + ' — ยังไม่ได้ใส่รอบ (วัน)'); return; }
    if (cycle < minCycle) {
      skipped.push(label + ' — รอบ ' + cycle + ' วัน สั้นกว่า ' + minCycle +
                   ' วัน ควรใช้เช็คชีตประจำวันแทน');
      return;
    }

    var machine;
    try { machine = assertKnownMachine_(r['เครื่องจักร']); }
    catch (e) {
      /* เดิมข้ามไปเงียบ ๆ — วางแผนมา 50 แถวแล้วออกมา 32 ครั้ง ไม่มีทางรู้ว่าอีก 18 หายไปไหน */
      skipped.push(label + ' — ชื่อเครื่องไม่ตรงทะเบียน');
      return;
    }

    var task = String(r['งาน PM']);
    var owner = String(r['ผู้รับผิดชอบ'] || '');
    var kind = String(r['ประเภทงาน'] || PM_KIND_DEFAULT);
    var hours = Number(r['ชั่วโมงที่วางแผน']) || 0;
    var last = toDate_(r['ทำครั้งล่าสุด']);
    var next = last ? new Date(last.getTime() + cycle * 864e5) : new Date(today.getTime());
    if (next < today) next = new Date(today.getTime());   // ค้างมานาน ให้เริ่มนับจากวันนี้ ไม่ใช่ถมย้อนหลังเป็นร้อยแถว

    while (next <= limit) {
      var key = machine + '|' + task + '|' + dayKey_(next);
      if (!seen[key]) {
        seen[key] = true;
        out.push([ 'PM-' + (++maxSeq), machine, task, new Date(next.getTime()), '',
                   PM_PLANNED, owner, '', '', '', '', kind, hours ]);
      }
      next = new Date(next.getTime() + cycle * 864e5);
    }
  });

  if (out.length) {
    pack.sheet.getRange(pack.sheet.getLastRow() + 1, 1, out.length, PMCAL_HEAD.length).setValues(out);
    SpreadsheetApp.flush();
    writeAudit_('ออกตาราง PM ล่วงหน้า', out.length + ' ครั้ง / ' + months + ' เดือน', [], who || 'ระบบ');
  }
  return { created: out.length, skipped: skipped };
}

/** รายการของเดือนที่เลือก + สรุป Compliance ของเดือนนั้น */
function apiPmCalendar(token, year, month) {
  requireAuth_(token);
  var pack = pmRows_(), i = pmIdx_(pack.head);
  var key = Utilities.formatString('%04d-%02d', Number(year), Number(month));

  var items = [], machines = {};
  pack.rows.forEach(function (r) {
    var o = pmObj_(r, i);
    if (!o.planned) return;
    machines[o.machine] = true;
    if (o.planned.slice(0, 7) === key) items.push(o);
  });

  items.sort(function (a, b) {
    return a.planned.localeCompare(b.planned) || a.machine.localeCompare(b.machine);
  });

  var done = items.filter(function (x) { return x.status === PM_DONE; });
  var onTime = done.filter(function (x) { return x.actual && x.actual <= x.planned; });
  var active = items.filter(function (x) { return x.status !== PM_SKIP; });

  return {
    month: key,
    items: items,
    machines: Object.keys(machines).sort(),
    statuses: PM_STATUS,
    kinds: PM_KINDS,
    // ส่งเฉพาะวันหยุดของเดือนที่กำลังดู ไม่ต้องลากทั้งปีข้ามสายมาให้หน้าเว็บกรองเอง
    holidays: holidaysOfMonth_(key),
    workSaturday: String(cfg_('ทำงานวันเสาร์', 'ไม่')).trim() === 'ใช่',
    summary: {
      total: active.length,
      done: done.length,
      moved: items.filter(function (x) { return x.status === PM_MOVED; }).length,
      overdue: items.filter(function (x) {
        return x.status !== PM_DONE && x.status !== PM_SKIP && x.status !== PM_MOVED &&
               x.planned < dayKey_(new Date());
      }).length,
      // ชั่วโมงที่วางแผนไว้ทั้งเดือน — ตัวตั้งของ PMP นับเฉพาะรายการที่ยังไม่ถูกยกเลิก
      hours: active.reduce(function (a, x) { return a + (x.hours || 0); }, 0),
      // ทำตามแผนกี่ % — นับเฉพาะที่เสร็จ "ไม่เกินวันที่วางไว้" ไม่งั้นเลื่อนแล้วทำก็ยังได้ 100%
      compliance: active.length ? Math.round((onTime.length / active.length) * 100) : null
    }
  };
}

function pmFindRow_(pack, i, id) {
  for (var r = 0; r < pack.rows.length; r++) {
    if (String(pack.rows[r][i['รหัส']]) === String(id)) return r + 2;   // +2 = ข้ามหัวตาราง และนับจาก 1
  }
  throw new Error('ไม่พบรายการ PM รหัส ' + id);
}

/** อัปเดตสถานะรายครั้ง — ช่างกดจากหน้าเว็บได้ ไม่ต้องเปิดชีต */
function apiPmUpdate(token, id, changes) {
  var user = requireAuth_(token);
  changes = changes || {};

  var pack = pmRows_(), i = pmIdx_(pack.head);
  var row = pmFindRow_(pack, i, id);
  var sh = pack.sheet;

  var status = String(changes.status || '');
  if (status && PM_STATUS.indexOf(status) === -1) throw new Error('สถานะไม่ถูกต้อง');
  if (status === PM_MOVED) throw new Error('การเลื่อนแผนต้องใช้ปุ่มเลื่อนแผน เพื่อให้มีรายการชดเชยด้วย');

  if (status) {
    sh.getRange(row, i['สถานะ'] + 1).setValue(status);
    // กดเสร็จแล้วแต่ไม่ได้ระบุวันที่ทำจริง = ทำวันนี้ ไม่ใช่ทำตามวันที่วางแผน
    if (status === PM_DONE && !changes.actual && !pack.rows[row - 2][i['วันที่ทำจริง']]) {
      sh.getRange(row, i['วันที่ทำจริง'] + 1).setValue(new Date());
    }
  }
  if (changes.actual) sh.getRange(row, i['วันที่ทำจริง'] + 1).setValue(new Date(changes.actual));
  if (changes.owner !== undefined) sh.getRange(row, i['ผู้รับผิดชอบ'] + 1).setValue(String(changes.owner));
  if (changes.note !== undefined) sh.getRange(row, i['หมายเหตุ'] + 1).setValue(String(changes.note));
  /* เช็ค > -1 ทุกครั้ง เพราะชีตที่ยังไม่ได้รัน upgradeSheet() จะไม่มีสองคอลัมน์นี้
     ถ้าไม่เช็ค getRange(row, 0) จะโยน error แล้วบันทึกสถานะไม่ได้ทั้งรายการ */
  if (changes.kind !== undefined && i['ประเภทงาน'] > -1) {
    if (PM_KINDS.indexOf(String(changes.kind)) === -1) throw new Error('ประเภทงานไม่ถูกต้อง');
    sh.getRange(row, i['ประเภทงาน'] + 1).setValue(String(changes.kind));
  }
  if (changes.hours !== undefined && i['ชั่วโมงที่วางแผน'] > -1) {
    sh.getRange(row, i['ชั่วโมงที่วางแผน'] + 1).setValue(Number(changes.hours) || 0);
  }
  SpreadsheetApp.flush();

  /* ปิดงาน PM แล้วต้องเลื่อน "ทำครั้งล่าสุด" ในชีตแผนด้วย
     ไม่งั้นตัวออกใบอัตโนมัติจะยังคิดว่าค้างอยู่แล้วออกใบซ้ำทุกเช้า */
  if (status === PM_DONE) {
    var o = pmObj_(pack.rows[row - 2], i);
    touchPlanLastDone_(o.machine, o.task, toDate_(changes.actual) || new Date());
  }

  writeAudit_('อัปเดต PM', id + ' → ' + (status || 'แก้ข้อมูล'), [], user.name);
  return { ok: true };
}

function touchPlanLastDone_(machine, task, when) {
  try {
    var sh = sheet_(SHEET_PMPLAN);
    var vals = sh.getDataRange().getValues();
    var head = vals[0];
    var iM = head.indexOf('เครื่องจักร'), iT = head.indexOf('งาน PM'), iL = head.indexOf('ทำครั้งล่าสุด');
    if (iM === -1 || iT === -1 || iL === -1) return;
    for (var r = 1; r < vals.length; r++) {
      if (canonical_(vals[r][iM]) === machine && String(vals[r][iT]).trim() === task) {
        sh.getRange(r + 1, iL + 1).setValue(when);
        SpreadsheetApp.flush();
        return;
      }
    }
  } catch (e) {
    Logger.log('อัปเดตทำครั้งล่าสุดไม่สำเร็จ: ' + e.message);   // สถานะบันทึกไปแล้ว อย่าให้ล้มทั้งคำสั่ง
  }
}

/** เลื่อนแผน — ปิดครั้งเดิมเป็น "เลื่อน" แล้วออกครั้งชดเชยในวันใหม่
    เก็บทั้งสองแถวไว้ จะได้ตอบผู้จัดการได้ว่าเลื่อนไปกี่ครั้ง เพราะอะไร */
function apiPmReschedule(token, id, newDate, reason) {
  var user = requireAuth_(token);
  var when = toDate_(newDate);
  if (!when) throw new Error('ต้องระบุวันที่ใหม่');
  reason = String(reason || '').trim();
  if (!reason) throw new Error('ต้องระบุเหตุผลที่เลื่อน — เป็นข้อมูลที่ผู้จัดการถามแน่นอน');

  var pack = pmRows_(), i = pmIdx_(pack.head);
  var row = pmFindRow_(pack, i, id);
  var old = pmObj_(pack.rows[row - 2], i);
  if (old.status === PM_DONE) throw new Error('รายการนี้ทำเสร็จแล้ว เลื่อนไม่ได้');
  if (old.status === PM_MOVED) throw new Error('รายการนี้ถูกเลื่อนไปแล้ว ให้ไปเลื่อนที่รายการชดเชยแทน');

  var maxSeq = 0;
  pack.rows.forEach(function (r) {
    var m = /^PM-(\d+)$/.exec(String(r[i['รหัส']] || ''));
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  });

  var sh = pack.sheet;
  sh.getRange(row, i['สถานะ'] + 1).setValue(PM_MOVED);
  sh.getRange(row, i['เหตุผลที่เลื่อน'] + 1).setValue(reason);

  var line = [];
  PMCAL_HEAD.forEach(function () { line.push(''); });
  line[i['รหัส']] = 'PM-' + (maxSeq + 1);
  line[i['เครื่องจักร']] = old.machine;
  line[i['งาน PM']] = old.task;
  line[i['วันที่วางแผน']] = when;
  line[i['สถานะ']] = PM_PLANNED;
  line[i['ผู้รับผิดชอบ']] = old.owner;
  line[i['ชดเชยจากวันที่']] = toDate_(old.planned);
  line[i['เหตุผลที่เลื่อน']] = reason;
  sh.getRange(sh.getLastRow() + 1, 1, 1, PMCAL_HEAD.length).setValues([line]);
  SpreadsheetApp.flush();

  writeAudit_('เลื่อนแผน PM', id + ' → ' + dayKey_(when) + ' (' + reason + ')', [], user.name);
  return { ok: true, newId: line[i['รหัส']] };
}

/** เพิ่ม/แก้แถวในชีต "แผน PM" จากหน้าเว็บ — ซ้ำคู่ (เครื่อง, งาน) ถือเป็นการแก้ */
function apiPmSavePlan(token, row) {
  var user = requireAuth_(token, 'LEAD');
  row = row || {};
  var machine = assertKnownMachine_(row.machine);
  var task = String(row.task || '').trim();
  if (!task) throw new Error('ต้องระบุชื่องาน PM');
  var cycle = Number(row.cycle) || 0;
  if (cycle <= 0) throw new Error('รอบ (วัน) ต้องมากกว่า 0');

  var sh = sheet_(SHEET_PMPLAN);
  var vals = sh.getDataRange().getValues();
  var head = vals[0];
  var iM = head.indexOf('เครื่องจักร'), iT = head.indexOf('งาน PM'),
      iC = head.indexOf('รอบ (วัน)'), iL = head.indexOf('ทำครั้งล่าสุด'),
      iO = head.indexOf('ผู้รับผิดชอบ'), iA = head.indexOf('ใช้งาน'),
      iK = head.indexOf('ประเภทงาน'), iH = head.indexOf('ชั่วโมงที่วางแผน'),
      iX = head.indexOf('หัวข้อตรวจ');

  var line = [];
  head.forEach(function () { line.push(''); });
  line[iM] = machine;
  line[iT] = task;
  line[iC] = cycle;
  if (iL > -1 && row.last) line[iL] = new Date(row.last);
  if (iO > -1) line[iO] = String(row.owner || '');
  if (iA > -1) line[iA] = row.active === false ? 'ไม่' : 'ใช่';
  if (iK > -1) line[iK] = PM_KINDS.indexOf(String(row.kind)) > -1 ? String(row.kind) : PM_KIND_DEFAULT;
  if (iH > -1) line[iH] = Number(row.hours) || 0;
  if (iX > -1) line[iX] = String(row.checklist || '');

  for (var r = 1; r < vals.length; r++) {
    if (canonical_(vals[r][iM]) === machine && String(vals[r][iT]).trim() === task) {
      if (iL > -1 && !row.last) line[iL] = vals[r][iL];     // ไม่ได้ส่งมาก็อย่าล้างของเดิมทิ้ง
      sh.getRange(r + 1, 1, 1, line.length).setValues([line]);
      SpreadsheetApp.flush();
      writeAudit_('แก้แผน PM', machine + ' · ' + task, [], user.name);
      return { ok: true, updated: true };
    }
  }
  sh.getRange(sh.getLastRow() + 1, 1, 1, line.length).setValues([line]);
  SpreadsheetApp.flush();
  writeAudit_('เพิ่มแผน PM', machine + ' · ' + task, [], user.name);
  return { ok: true, updated: false };
}

/* ═══════════ ความคิดเห็นต่อฝ่ายซ่อมบำรุง ═══════════
   เก็บสองทาง เพราะคนสองกลุ่มพูดคนละจังหวะกัน

   1) คะแนนตอนกดตรวจรับงาน — ทุกใบที่ปิดต้องผ่านจุดนี้อยู่แล้ว 100%
      ได้ผลตอบรับผูกกับงานจริงว่าใบไหน เครื่องไหน ใครซ่อม
   2) เมนูแนะนำ/ติชม — สำหรับเรื่องที่ไม่ผูกกับใบไหนเป็นพิเศษ
      เช่น "อยากให้มีช่างประจำกะดึก" ซึ่งไม่มีทางโผล่จากข้อ 1

   ทั้งสองทางลงชีตเดียวกัน จะได้นับรวมเป็นภาพเดียวไม่ต้องไปไล่อ่านสองที่ */

var SHEET_FEEDBACK = 'ความคิดเห็น';
var FEEDBACK_HEAD  = ['ประทับเวลา', 'ประเภท', 'คะแนน', 'เรื่อง', 'รายละเอียด',
                      'ผู้ให้ความเห็น', 'แผนก', 'เลขที่ใบแจ้งซ่อม'];
var FEEDBACK_TYPES = ['ชมเชย', 'เสนอแนะ', 'ติชม / ร้องเรียน'];
/* เลี้ยงเบียร์ = ความคิดเห็นอีกประเภท ไม่ใช่ชีตใหม่
   ชีต "ความคิดเห็น" มีช่องครบอยู่แล้ว และ Dashboard ของหัวหน้าก็อ่านชีตนี้อยู่แล้ว
   แยกชีตใหม่แปลว่าต้องเขียน ต้องอ่าน ต้องกันแถวบวม และต้องทำหน้าจอใหม่ เพื่อของที่มีอยู่แล้ว

   แต่ไม่อยู่ใน FEEDBACK_TYPES เพราะนั่นคือรายการชิปบนฟอร์ม
   ถ้าใส่รวมไป จะมีชิป "เลี้ยงเบียร์ช่าง" โผล่คู่กับ "ติชม / ร้องเรียน" ซึ่งคนละจังหวะกัน

   ชื่อช่างเก็บในช่อง "เรื่อง" ตรง ๆ ไม่ได้เพิ่มคอลัมน์ใหม่ — ใบประเภทนี้ไม่มีหัวข้อเรื่องอื่นให้เก็บ
   การนับยอดรายคนจึงเป็นแค่การจัดกลุ่มตามช่องเดิม ไม่ต้องไล่เติมคอลัมน์ให้ชีตเก่า */
var FEEDBACK_BEER  = 'เลี้ยงเบียร์ช่าง';
var BEER_TEAM      = 'ทั้งทีมซ่อมบำรุง';
var FEEDBACK_MAX   = 2000;

/** สร้างให้เองถ้ายังไม่มี — คนที่อัปเกรดจากเวอร์ชันก่อนจะได้ไม่ต้องรัน setup() ซ้ำ */
function fbSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_FEEDBACK);
  if (!sh) {
    sh = ss.insertSheet(SHEET_FEEDBACK);
    sh.getRange(1, 1, 1, FEEDBACK_HEAD.length).setValues([FEEDBACK_HEAD])
      .setFontWeight('bold').setBackground('#e8fbf1');
    sh.setFrozenRows(1);
  }
  return sh;
}

function writeFeedback_(row) {
  var sh = fbSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, 1, FEEDBACK_HEAD.length).setValues([[
    new Date(),
    row.type,
    row.rating || '',
    truncate_(row.subject || ''),
    String(row.detail || '').slice(0, FEEDBACK_MAX),
    truncate_(row.by || ''),
    truncate_(row.dept || ''),
    String(row.ticketId || '')
  ]]);
}

/* ผู้แจ้งไม่ต้องล็อกอิน เหมือนกับการแจ้งซ่อมและตรวจรับงาน
   บังคับแผนกแต่ไม่บังคับชื่อ — บังคับชื่อเมื่อไหร่ คนจะไม่กล้าติ เหลือแต่คำชม
   ซึ่งเท่ากับไม่ได้ข้อมูลอะไรเลย ส่วนแผนกยังพอไล่ต้นตอได้ถ้าเจอเรื่องหนัก */
function apiSendFeedback(payload) {
  payload = payload || {};
  var type = String(payload.type || '').trim();
  var beer = type === FEEDBACK_BEER;
  if (!beer && FEEDBACK_TYPES.indexOf(type) === -1) throw new Error('กรุณาเลือกประเภทความคิดเห็น');

  var subject = String(payload.subject || '').trim();
  if (!subject) throw new Error(beer ? 'กรุณาเลือกช่างที่จะเลี้ยง' : 'กรุณากรอกหัวข้อเรื่อง');
  /* เลี้ยงเบียร์ไม่บังคับแผนก — เป็นการขอบคุณ ไม่ใช่เรื่องร้องเรียนที่ต้องตามกลับไปหาต้นเรื่อง
     การบังคับกรอกเพิ่มอีกช่องในจังหวะแบบนี้ คือจังหวะที่คนกดปิดหน้าต่างทิ้ง */
  var dept = String(payload.dept || '').trim();
  if (!beer && !dept) throw new Error('กรุณาเลือกแผนกของผู้ให้ความเห็น');

  var rating = Number(payload.rating) || 0;
  if (rating && (rating < 1 || rating > 5)) throw new Error('คะแนนต้องอยู่ระหว่าง 1–5');

  writeFeedback_({
    type: type, rating: rating, subject: subject,
    detail: payload.detail, by: payload.by, dept: dept, ticketId: ''
  });
  SpreadsheetApp.flush();

  writeAudit_('รับความคิดเห็น', type, [], String(payload.by || 'ไม่ระบุชื่อ'));
  if (type === FEEDBACK_TYPES[2]) {
    sendMail_(cfg_('อีเมลหัวหน้า', ''), 'ความคิดเห็นถึงฝ่ายซ่อมบำรุง — ' + type,
      '<p><b>' + esc_(subject) + '</b></p><p>' + esc_(String(payload.detail || '')) + '</p>' +
      '<p>จาก: ' + esc_(String(payload.by || 'ไม่ระบุชื่อ')) + ' · ' + esc_(dept) + '</p>');
  }
  return { ok: true };
}

/** อ่านได้เฉพาะหัวหน้างานขึ้นไป — ความเห็นที่ไม่ลงชื่อต้องไม่กลายเป็นของสาธารณะ */
function apiGetFeedback(token) {
  requireAuth_(token, 'LEAD');
  var sh = fbSheet_();
  if (sh.getLastRow() < 2) return [];
  var vals = sh.getDataRange().getValues();
  var head = vals.shift();
  var idx = {};
  FEEDBACK_HEAD.forEach(function (h) { idx[h] = head.indexOf(h); });

  return vals.filter(function (r) { return r[idx['ประเภท']]; }).map(function (r) {
    return {
      at: iso_(toDate_(r[idx['ประทับเวลา']])),
      type: String(r[idx['ประเภท']]),
      rating: Number(r[idx['คะแนน']]) || 0,
      subject: String(r[idx['เรื่อง']] || ''),
      detail: String(r[idx['รายละเอียด']] || ''),
      by: String(r[idx['ผู้ให้ความเห็น']] || ''),
      dept: String(r[idx['แผนก']] || ''),
      ticketId: String(r[idx['เลขที่ใบแจ้งซ่อม']] || '')
    };
  }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
}

/* ═══════════ พารามิเตอร์เครื่องจักร — อ่านอย่างเดียว ═══════════
   CMMS เป็นแค่ "หน้าต่าง" ของโปรเจค ระบบบันทึกพารามิเตอร์เครื่องจักร
   ช่างยังกรอกที่ระบบนั้นเหมือนเดิม โมดูลนี้ไม่มีคำสั่งเขียนแม้แต่บรรทัดเดียว

   ตั้ง Script Property: PARAM_SHEET_ID = Spreadsheet ID ของโปรเจคนั้น
   บัญชีที่รัน CMMS ต้องเปิดไฟล์นั้นได้ (แชร์แบบ "ผู้มีสิทธิ์อ่าน" ก็พอ)

   เราไม่ได้เป็นคนออกแบบชีตปลายทาง จึงเดาหัวคอลัมน์จากชื่อที่พบบ่อย
   และรองรับสองทรงที่เจอจริง:
     long  — แถวละหนึ่งค่า   (… | พารามิเตอร์ | ค่า | …)
     wide  — แถวละหนึ่งกะ แล้วแตกคอลัมน์ตามพารามิเตอร์ (ทรงของ Google Form)
   เดาไม่ถูกให้ทับด้วยชีต "ตั้งค่า" ของ CMMS ไม่ต้องแก้โค้ด — ดู apiParamPeek() */

var PARAM_ALIAS = {
  date:    ['วันที่', 'วันที่บันทึก', 'วันที่ตรวจ', 'date', 'ประทับเวลา', 'timestamp'],
  shift:   ['กะ', 'ช่วงเวลา', 'รอบ', 'shift', 'round'],
  machine: ['เครื่องจักร', 'ชื่อเครื่อง', 'เครื่อง', 'machine'],
  param:   ['พารามิเตอร์', 'รายการตรวจ', 'รายการ', 'หัวข้อ', 'parameter'],
  value:   ['ค่าที่วัดได้', 'ผลการวัด', 'ค่าที่อ่านได้', 'ค่า', 'value', 'reading'],
  by:      ['ผู้บันทึก', 'ผู้กรอก', 'ผู้ตรวจ', 'ชื่อผู้บันทึก', 'by', 'operator'],
  note:    ['หมายเหตุ', 'note', 'remark'],
  data:    ['data', 'ค่าที่วัดทั้งหมด'],
  status:  ['สถานะ', 'สถานะเครื่อง', 'status'],
  time:    ['time', 'เวลา']
};

/* ทับการเดาได้ที่ชีต "ตั้งค่า" — ใส่ชื่อหัวคอลัมน์จริงลงไปตรง ๆ */
var PARAM_CFG = {
  sheet:   'ชีตพารามิเตอร์',
  date:    'คอลัมน์วันที่พารามิเตอร์',
  shift:   'คอลัมน์กะพารามิเตอร์',
  machine: 'คอลัมน์เครื่องจักรพารามิเตอร์',
  param:   'คอลัมน์ชื่อพารามิเตอร์',
  value:   'คอลัมน์ค่าพารามิเตอร์',
  by:      'คอลัมน์ผู้บันทึกพารามิเตอร์',
  note:    'คอลัมน์หมายเหตุพารามิเตอร์',
  data:    'คอลัมน์ค่ารวมพารามิเตอร์'
};

function paramSS_() {
  var id = prop_('PARAM_SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : ss_();
}

/* ไฟล์จริงของโรงงานแยกชีตตามตระกูลเครื่อง — "Data" (Extruder) · "Data UV" · "Data Cut-Slot"
   อ่านแค่ชีตเดียวจะเห็นเครื่องแค่กลุ่มเดียว แล้วอีกสองกลุ่มหายไปเงียบ ๆ โดยไม่มี error
   จึงรวมทุกชีตที่หน้าตาเป็นชีตบันทึก และกันชีตพิกัด/กราฟออกไป */
function paramLogSheets_() {
  var ss = paramSS_();
  var want = String(cfg_(PARAM_CFG.sheet, '')).trim();
  if (want) {
    var one = ss.getSheetByName(want);
    if (!one) throw new Error('ไม่พบชีต "' + want + '" ในไฟล์พารามิเตอร์');
    return [one];
  }
  var out = ss.getSheets().filter(function (sh) {
    var n = sh.getName().toLowerCase();
    if (n.indexOf('std') > -1 || n.indexOf('พิกัด') > -1 || n.indexOf('spec') > -1) return false;
    if (n.indexOf('chart') > -1 || n.indexOf('กราฟ') > -1 || n === 'machines') return false;
    return sh.getLastRow() > 1;
  });
  return out.length ? out : [ss.getSheets()[0]];
}

/** ชีตแรกที่เป็นชีตบันทึก — ส่วนที่ยังอ่านทีละชีตอยู่ใช้ตัวนี้ */
function paramLogSheet_() {
  var ss = paramSS_();
  var want = String(cfg_(PARAM_CFG.sheet, '')).trim();
  if (want) {
    var sh = ss.getSheetByName(want);
    if (!sh) throw new Error('ไม่พบชีต "' + want + '" ในไฟล์พารามิเตอร์');
    return sh;
  }
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    var n = all[i].getName().toLowerCase();
    /* ชีตบันทึกของโปรเจคต้นทางชื่อ "Logs" ซึ่งไม่มีคำว่าพารามิเตอร์อยู่เลย
       ถ้าไม่ใส่ไว้ ตัวเดาจะไปหยิบชีตแรกของไฟล์ซึ่งคือ Machines แล้วอ่านไม่ออกทั้งหน้า */
    if (n === 'logs' || n === 'log' || n === 'บันทึก') return all[i];
    if (n.indexOf('พารามิเตอร์') > -1 || n.indexOf('parameter') > -1 || n.indexOf('param') > -1) {
      if (n.indexOf('พิกัด') === -1 && n.indexOf('spec') === -1) return all[i];
    }
  }
  return all[0];       // ไฟล์ที่มีชีตเดียวคือกรณีที่เจอบ่อยที่สุด
}

/** หาคอลัมน์: ค่าที่ตั้งเองมาก่อน → ชื่อตรงเป๊ะ → ชื่อที่มีคำนั้นอยู่ข้างใน */
function pickCol_(low, aliases, override) {
  var i;
  if (override) {
    i = low.indexOf(String(override).trim().toLowerCase());
    if (i > -1) return i;
  }
  for (i = 0; i < aliases.length; i++) {
    var j = low.indexOf(aliases[i]);
    if (j > -1) return j;
  }
  for (i = 0; i < aliases.length; i++) {
    for (var k = 0; k < low.length; k++) {
      if (low[k] && low[k].indexOf(aliases[i]) > -1) return k;
    }
  }
  return -1;
}

function paramMap_(head) {
  var low = head.map(function (h) { return String(h || '').trim().toLowerCase(); });
  var m = {};
  Object.keys(PARAM_ALIAS).forEach(function (k) {
    m[k] = pickCol_(low, PARAM_ALIAS[k], cfg_(PARAM_CFG[k], ''));
  });
  /* ทรงที่สาม — kv: ค่าที่วัดได้ทุกตัวอยู่ในเซลล์ "data" เซลล์เดียว เป็น "key=value;key=value"
     โปรเจคต้นทางออกแบบแบบนี้เพื่อประหยัดเซลล์ (8 เซลล์ต่อการบันทึก แทน 29)
     และเพิ่มฟิลด์ใหม่ได้โดยไม่ต้องเพิ่มคอลัมน์ ราคาที่จ่ายคือ Pivot ตรง ๆ ไม่ได้
     ต้องมีคนกางออกก่อน ซึ่งคือหน้าที่ของ adapter ตัวนี้

     ชื่อที่คนอ่านรู้เรื่อง ค่ามาตรฐาน และเกณฑ์ ± ไม่ได้อยู่ในแถวบันทึก
     ต้องไปอ่านจากชีต Machines ของไฟล์เดียวกัน — ดู paramDefs_() */
  m.data = pickCol_(low, PARAM_ALIAS.data, cfg_(PARAM_CFG.data, ''));
  m.layout = m.data > -1 ? 'kv'
           : (m.param > -1 && m.value > -1) ? 'long' : 'wide';
  if (m.layout === 'wide') {
    var used = [m.date, m.shift, m.machine, m.by, m.note];
    m.cols = [];
    for (var i = 0; i < head.length; i++) {
      if (head[i] && used.indexOf(i) === -1) m.cols.push(i);
    }
  }
  return m;
}

/** ส่องชีตปลายทางว่าระบบเห็นอะไร — ใช้ตอนตั้งค่าครั้งแรกหรือเวลาข้อมูลไม่ขึ้น */
function apiParamPeek(token) {
  requireAuth_(token, 'LEAD');
  var ss = paramSS_();
  var sh = paramLogSheet_();
  var head = sh.getLastRow() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  var m = paramMap_(head);
  var named = {};
  ['date', 'shift', 'machine', 'param', 'value', 'by', 'note'].forEach(function (k) {
    named[k] = m[k] > -1 ? String(head[m[k]]) : '(ไม่เจอ)';
  });
  return {
    file: ss.getName(),
    external: !!prop_('PARAM_SHEET_ID'),
    sheets: ss.getSheets().map(function (x) { return x.getName(); }),
    using: sh.getName(),
    rows: Math.max(0, sh.getLastRow() - 1),
    headers: head.map(String),
    layout: m.layout,
    matched: named,
    paramColumns: m.layout === 'wide'
      ? m.cols.map(function (i) { return String(head[i]); }) : []
  };
}

/** พิกัดของทรง kv — โปรเจคต้นทางเก็บเป็น std กับเกณฑ์ ± ไม่ได้เก็บเป็นช่วง min/max
    แปลงเป็นช่วงตรงนี้ทีเดียว ตารางกับกราฟเดิมจะได้ตัดสินผ่าน/ไม่ผ่านได้โดยไม่ต้องรู้เรื่อง std */
function paramLimitsKv_() {
  var defs = paramDefs_(), out = [];
  Object.keys(defs).forEach(function (id) {
    var d = defs[id], lab = paramLabels_(d);
    Object.keys(d.std).forEach(function (k) {
      var t = Number(d.std[k]);
      if (!isFinite(t)) return;
      var tol = kvTolFor_(d.tol, k);
      out.push({
        machine: canonical_(id), param: lab[k] ? lab[k].label : k, unit: '',
        min: t - tol, target: t, max: t + tol
      });
    });
  });
  return out;
}

/** พิกัดมาตรฐาน — มีก็ใช้ ไม่มีก็แสดงค่าดิบไปโดยไม่ต้องบ่น */
function paramLimits_() {
  var kv = paramLimitsKv_();
  if (kv.length) return kv;
  var ss = paramSS_();
  var sh = null, all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    var n = all[i].getName().toLowerCase();
    if (n.indexOf('พิกัด') > -1 || n.indexOf('spec') > -1 || n.indexOf('มาตรฐาน') > -1) { sh = all[i]; break; }
  }
  if (!sh || sh.getLastRow() < 2) return [];

  var vals = sh.getDataRange().getValues();
  var head = vals.shift();
  var low = head.map(function (h) { return String(h || '').trim().toLowerCase(); });
  var iM = pickCol_(low, PARAM_ALIAS.machine, ''),
      iP = pickCol_(low, PARAM_ALIAS.param, ''),
      iU = pickCol_(low, ['หน่วย', 'unit'], ''),
      iLo = pickCol_(low, ['ค่าต่ำสุด', 'ต่ำสุด', 'min'], ''),
      iTg = pickCol_(low, ['ค่ามาตรฐาน', 'มาตรฐาน', 'target'], ''),
      iHi = pickCol_(low, ['ค่าสูงสุด', 'สูงสุด', 'max'], '');
  if (iM === -1 || iP === -1) return [];

  return vals.filter(function (r) { return r[iM] && r[iP]; }).map(function (r) {
    return {
      machine: canonical_(r[iM]), param: String(r[iP]).trim(),
      unit: iU > -1 ? String(r[iU] || '') : '',
      min: iLo > -1 ? numOrBlank_(r[iLo]) : '',
      target: iTg > -1 ? numOrBlank_(r[iTg]) : '',
      max: iHi > -1 ? numOrBlank_(r[iHi]) : ''
    };
  });
}

function numOrBlank_(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}

function paramStatus_(v, lo, hi) {
  if (lo !== '' && v < Number(lo)) return 'ต่ำกว่าพิกัด';
  if (hi !== '' && v > Number(hi)) return 'สูงกว่าพิกัด';
  return 'ปกติ';
}

/* ─────────── นิยามเครื่องจักรจากโปรเจคต้นทาง (ชีต Machines) ───────────
   สี่ฟังก์ชันแรกยกมาจาก Code.gs ของโปรเจคระบบบันทึกพารามิเตอร์ตรง ๆ
   ตั้งใจไม่เขียนใหม่ให้ "สวยกว่า" เพราะถ้าตีความ std/tol ต่างจากต้นทางแม้นิดเดียว
   สองระบบจะบอกว่าค่าเดียวกันผ่าน/ไม่ผ่านคนละอย่าง ซึ่งแย่กว่าไม่มีหน้านี้เลย */

var PARAM_SHEET_DEFS = 'Machines';

function kvParse_(str) {
  var out = {};
  String(str == null ? '' : str).split(';').forEach(function (pair) {
    var i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  });
  return out;
}

/** "#กลุ่ม;z1:ZONE 1:num" เป็น [{group:'กลุ่ม', fields:[{key,label,type}]}] */
function kvFields_(spec) {
  var groups = [], cur = null;
  String(spec == null ? '' : spec).split(';').forEach(function (tok) {
    tok = tok.trim();
    if (!tok) return;
    if (tok.charAt(0) === '#') {
      cur = { group: tok.slice(1).trim(), fields: [] };
      groups.push(cur);
      return;
    }
    if (!cur) { cur = { group: 'พารามิเตอร์', fields: [] }; groups.push(cur); }
    var a = tok.split(':');
    cur.fields.push({ key: a[0].trim(), label: (a[1] || a[0]).trim(), type: (a[2] || 'num').trim() });
  });
  return groups;
}

/** เกณฑ์ ± รับได้ทั้ง "10" (ทั้งเครื่อง) และ "z1=10;*=5" (รายฟิลด์ + ค่าตั้งต้น) */
function kvTol_(v) {
  var str = String(v === 0 ? '0' : (v == null ? '' : v)).trim();
  if (str.indexOf('=') < 0) return { all: Number(str) || 0, by: {} };
  var by = kvParse_(str);
  return { all: Number(by['*']) || 0, by: by };
}

function kvTolFor_(tol, key) {
  var t = tol.by[key];
  return (t === undefined || t === '') ? tol.all : (Number(t) || 0);
}

/** ค่าหลุดเมื่อ |ค่าที่วัด − std| > tol ของฟิลด์นั้น — ฟิลด์ที่ไม่มี std คือไม่ได้เฝ้า */
function kvCheck_(values, std, tol) {
  return Object.keys(std || {}).filter(function (k) {
    var a = Number(values[k]), t = Number(std[k]);
    return values[k] !== undefined && values[k] !== '' && isFinite(a) && isFinite(t) &&
           Math.abs(a - t) > kvTolFor_(tol, k);
  }).map(function (k) {
    return { key: k, actual: Number(values[k]), std: Number(std[k]), tol: kvTolFor_(tol, k) };
  });
}

/* ═══ พิกัดมาตรฐาน ═══
   ไฟล์ต้นทางมีชีต "Std.parameter" อยู่แล้ว เป็นทรง long หนึ่งแถว = หนึ่งพารามิเตอร์ของหนึ่งเครื่อง
   เดิมหน้านี้เปิดดูค่าได้แต่ตัดสินผ่าน/ไม่ผ่านไม่ได้ เพราะ std ว่าง

   หัวคอลัมน์อ่านจากหัวตาราง ไม่นับตำแหน่ง เพราะชีตนี้คนของโรงงานแก้เอง สลับคอลัมน์เมื่อไรก็ได้
   ยังคงอ่านอย่างเดียว ไม่มีคำสั่งเขียนกลับไปที่ไฟล์ต้นทางแม้แต่บรรทัดเดียว */
function paramStdSheet_() {
  var all;
  try { all = paramSS_().getSheets(); } catch (e) { return null; }
  for (var i = 0; i < all.length; i++) {
    var n = all[i].getName().toLowerCase();
    if ((n.indexOf('std') > -1 || n.indexOf('พิกัด') > -1 || n.indexOf('spec') > -1) &&
        all[i].getLastRow() > 1) return all[i];
  }
  return null;
}

/** { เครื่อง: { std: {พารามิเตอร์: ค่า}, tol: {all, by} } } — ไม่มีชีตก็คืนว่าง */
function paramStd_() {
  var sh = paramStdSheet_(), out = {};
  if (!sh) return out;
  var vals = sh.getDataRange().getValues();
  var head = vals.shift().map(function (h) { return String(h || '').trim().toLowerCase(); });
  var col = function (names) {
    for (var j = 0; j < names.length; j++)
      for (var i = 0; i < head.length; i++)
        if (head[i] === names[j] || head[i].indexOf(names[j]) === 0) return i;
    return -1;
  };
  var cM = col(['machine', 'เครื่อง', 'รหัส']);
  var cP = col(['param', 'พารามิเตอร์', 'หัวข้อ', 'จุดวัด']);
  var cS = col(['std', 'มาตรฐาน', 'ค่ากลาง']);
  var cT = col(['tol', 'เกณฑ์', 'พิกัด']);
  var cLo = col(['min', 'ต่ำสุด']);
  var cHi = col(['max', 'สูงสุด']);
  if (cM < 0 || cP < 0) return out;

  vals.forEach(function (r) {
    var id = String(r[cM] || '').trim(), p = String(r[cP] || '').trim();
    if (!id || !p) return;
    /* ช่องว่างคือ "ไม่ได้กำหนด" ไม่ใช่ศูนย์ — Number('') คืน 0 ซึ่งจะกลายเป็นพิกัด 0±0 */
    var cell = function (c) {
      if (c < 0 || r[c] === '' || r[c] === null || r[c] === undefined) return NaN;
      return Number(r[c]);
    };
    var s = cell(cS), t = cell(cT);
    /* บางช่องเขียนเป็น min/max แทน std/± — แปลงเป็นกึ่งกลาง ± ครึ่งช่วง
       เพราะ kvCheck_ ตัดสินด้วย |ค่า − std| > tol ตัวเดียว ไม่รู้จักช่วง */
    if (!isFinite(s) && cLo > -1 && cHi > -1) {
      var lo = cell(cLo), hi = cell(cHi);
      if (isFinite(lo) && isFinite(hi) && hi >= lo) { s = (lo + hi) / 2; t = (hi - lo) / 2; }
    }
    if (!isFinite(s)) return;                  // ไม่มีค่ามาตรฐาน = ไม่ได้เฝ้าช่องนี้
    var d = out[id] || (out[id] = { std: {}, tol: { all: 0, by: {} } });
    d.std[p] = s;
    if (isFinite(t)) d.tol.by[p] = t;
  });
  return out;
}

/** เติมพิกัดลงนิยามเครื่อง — ชื่อเทียบแบบไม่สนตัวพิมพ์
    ชีตพิกัดกับหัวคอลัมน์ของชีตบันทึกเป็นคนละคนพิมพ์ "Zone 1" กับ "ZONE 1" คืออันเดียวกัน */
function paramApplyStd_(defs) {
  var std;
  try { std = paramStd_(); } catch (e) { return defs; }
  var ids = Object.keys(std);
  if (!ids.length) return defs;
  var byLow = {};
  ids.forEach(function (k) { byLow[k.toLowerCase()] = std[k]; });

  Object.keys(defs).forEach(function (id) {
    var src = std[id] || byLow[String(id).toLowerCase()];
    if (!src) return;
    var d = defs[id], low = {};
    (d.groups || []).forEach(function (grp) {
      (grp.fields || []).forEach(function (fl) { low[String(fl.key).toLowerCase()] = fl.key; });
    });
    Object.keys(src.std).forEach(function (p) {
      var key = low[p.toLowerCase()] || p;
      d.std[key] = src.std[p];
      if (src.tol.by[p] !== undefined) d.tol.by[key] = src.tol.by[p];
    });
  });
  return defs;
}

/* ═══ เช็คลิสต์พารามิเตอร์ (ถอดจากฟอร์ม ISO) ═══
   ไฟล์ต้นทางมีแต่หัวคอลัมน์ดิบ "ZONE 1" "AMP." ซึ่งพอเอามาเรียงเป็นหน้าจอแล้ว
   ช่างมองไม่ออกว่าอันไหนคือจุดไหนบนเครื่อง และไม่รู้ว่าช่องไหนเป็นสวิตช์ ช่องไหนเครื่องแสดงเอง

   ของพวกนี้อยู่ในฟอร์ม ISO (FM-MT-10 ถึง FM-MT-23) ไม่ได้อยู่ในชีตข้อมูล
   จึงถอดมาเก็บไว้ที่ชีตของ CMMS เอง — ไม่ไปแตะไฟล์ต้นทางซึ่งเป็นอ่านอย่างเดียว

   ชีตนี้กำหนด "หน้าตา" อย่างเดียว ไม่ใช่เจ้าของค่า ค่ายังมาจากไฟล์ต้นทางเสมอ
   ส่วนพิกัด ถ้า Std.parameter ของต้นทางมี ให้ของต้นทางชนะ — เขาคือคนขึ้นทะเบียนกับผู้ตรวจ */
var PARAM_SHEET_CHECK = 'เช็คลิสต์พารามิเตอร์';
var CHECK_HEAD = ['เครื่อง', 'ฟอร์ม', 'รหัสเครื่องจักร', 'กลุ่ม', 'ลำดับ', 'ป้าย', 'key',
                  'ชนิด', 'std', 'min', 'max', 'หน่วย', 'tol', 'หมายเหตุ'];

/** { ชื่อเครื่อง: { form, groups: [{group, fields:[...]}] } } — ไม่มีชีตก็คืนค่าว่าง */
function paramChecklist_() {
  var sh = ss_().getSheetByName(PARAM_SHEET_CHECK);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;

  var vals = sh.getDataRange().getValues();
  var head = vals.shift().map(function (h) { return String(h || '').trim(); });
  var ix = {};
  head.forEach(function (h, i) { ix[h] = i; });
  if (ix['เครื่อง'] === undefined || ix['ป้าย'] === undefined) return out;

  var get = function (r, name) {
    var i = ix[name];
    return i === undefined ? '' : String(r[i] === null || r[i] === undefined ? '' : r[i]).trim();
  };

  vals.forEach(function (r) {
    var mc = get(r, 'เครื่อง');
    if (!mc) return;
    var m = out[mc] || (out[mc] = { form: '', code: '', groups: [], index: {} });
    if (!m.form) m.form = get(r, 'ฟอร์ม');
    if (!m.code) m.code = get(r, 'รหัสเครื่องจักร');

    var gname = get(r, 'กลุ่ม') || 'พารามิเตอร์';
    var grp = m.index[gname];
    if (!grp) {
      grp = m.index[gname] = { group: gname, fields: [] };
      m.groups.push(grp);
    }

    var kind = get(r, 'ชนิด') || 'num';
    var std = get(r, 'std'), lo = get(r, 'min'), hi = get(r, 'max'), tol = get(r, 'tol');
    /* เขียน min/max แทน std/± ก็ได้ — แปลงเป็นกึ่งกลาง ± ครึ่งช่วง เหมือนชีต Std.parameter */
    if (std === '' && lo !== '' && hi !== '' && Number(hi) >= Number(lo)) {
      std = String((Number(lo) + Number(hi)) / 2);
      tol = String((Number(hi) - Number(lo)) / 2);
    }
    grp.fields.push({
      key: get(r, 'key') || get(r, 'ป้าย'),
      label: get(r, 'ป้าย'),
      type: kind,
      unit: get(r, 'หน่วย'),
      std: std === '' ? '' : Number(std),
      tol: tol === '' ? '' : Number(tol),
      note: get(r, 'หมายเหตุ')
    });
  });

  Object.keys(out).forEach(function (k) { delete out[k].index; });
  return out;
}

/** จับช่องในเช็คลิสต์เข้ากับคอลัมน์จริงในชีตบันทึก — เทียบ key ก่อน แล้วค่อยเทียบป้าย
    ทั้งคู่ไม่สนตัวพิมพ์ เพราะคนเขียนฟอร์มกับคนตั้งหัวคอลัมน์เป็นคนละคน */
function paramMatchKey_(fl, seen) {
  /* ฟอร์มที่สร้างจาก Google Form ตั้งหัวคอลัมน์เป็น "กลุ่ม [หัวข้อ]" เหมือนฟอร์มเช็คชีต
     จึงลองเทียบกับชื่อที่ถอดวงเล็บออกแล้วด้วย ไม่งั้นย้ายมาใช้ฟอร์มเมื่อไรจับคู่ไม่ติดสักช่อง */
  var tries = [fl.key, fl.label];
  var strip = function (t) {
    var d = checkItemHead_(t);
    return d ? d.label : '';
  };
  Object.keys(seen).forEach(function (k) {
    if (k.charAt(0) === '\u0000') return;
    var lab = strip(k);
    if (lab && (lab === fl.label || lab === fl.key)) tries.push(k);
  });
  for (var i = 0; i < tries.length; i++) {
    var t = String(tries[i] || '').trim();
    if (!t) continue;
    if (seen[t]) return t;
    var low = seen['\u0000' + t.toLowerCase()];
    if (low) return low;
  }
  return '';
}

/** เอาโครงจากเช็คลิสต์มาแทนโครงที่อนุมานจากหัวคอลัมน์
    คอลัมน์ในชีตบันทึกที่ไม่มีในเช็คลิสต์ ต้องไม่หายไป — ไปอยู่กลุ่มท้ายสุดแทน
    ถ้าปล่อยให้หาย ช่างจะเห็นหน้าจอครบสวยทั้งที่ค่าบางตัวถูกซ่อน */
function paramApplyChecklist_(defs) {
  var cl;
  try { cl = paramChecklist_(); } catch (e) { return defs; }
  if (!Object.keys(cl).length) return defs;
  var byLow = {}, byCanon = {};
  Object.keys(cl).forEach(function (k) {
    byLow[k.toLowerCase()] = cl[k];
    /* ชื่อในเช็คลิสต์มาจากฟอร์ม ISO ("Extrusion 80") ไม่ใช่ชื่อในทะเบียน ("Extrusion 1 - 80")
       ต้องแปลงทั้งสองฝั่งก่อนเทียบ ไม่งั้นรวมไม่ติดแล้วขึ้นการ์ดสองใบของเครื่องเดียวกัน */
    var c = paramCmmsName_(k, k);
    if (c) byCanon[c.toLowerCase()] = cl[k];
  });

  Object.keys(defs).forEach(function (id) {
    var d = defs[id];
    var cm = paramCmmsName_(id, d.name);
    var src = cl[id] || byLow[String(id).toLowerCase()];
    if (!src && cm) src = cl[cm] || byLow[cm.toLowerCase()] || byCanon[cm.toLowerCase()];
    if (!src) return;
    src.used = 1;
    /* การ์ดใช้ชื่อในทะเบียนเสมอ — ปล่อยให้แต่ละไฟล์ใช้ชื่อของตัวเอง
       คนอ่านหน้าจอจะนึกว่าเป็นคนละเครื่อง ทั้งที่เป็นตัวเดียวกัน */
    if (cm) d.name = cm;

    // คอลัมน์ที่มีอยู่จริงในชีตบันทึก ทั้งแบบตรงตัวและแบบ lowercase
    var seen = {};
    (d.groups || []).forEach(function (grp) {
      (grp.fields || []).forEach(function (fl) {
        seen[fl.key] = 1;
        seen['\u0000' + String(fl.key).toLowerCase()] = fl.key;
      });
    });

    var used = {}, groups = [];
    src.groups.forEach(function (grp) {
      groups.push({
        group: grp.group,
        fields: grp.fields.map(function (fl) {
          var hit = paramMatchKey_(fl, seen);
          if (hit) used[hit] = 1;
          var o = {
            key: hit || fl.key, label: fl.label || fl.key, type: fl.type,
            unit: fl.unit, note: fl.note, linked: !!hit
          };
          /* พิกัดของต้นทางชนะเสมอ ของในเช็คลิสต์เป็นตัวสำรองเมื่อต้นทางยังไม่ได้ลง */
          if (d.std[o.key] === undefined && fl.std !== '') {
            d.std[o.key] = fl.std;
            if (fl.tol !== '') d.tol.by[o.key] = fl.tol;
          }
          return o;
        })
      });
    });

    var left = Object.keys(seen).filter(function (k) {
      return k.charAt(0) !== '\u0000' && !used[k];
    });
    if (left.length) {
      groups.push({
        group: 'ไม่อยู่ในเช็คลิสต์',
        fields: left.map(function (k) {
          return { key: k, label: k, type: 'num', unit: '', note: '', linked: true };
        })
      });
    }
    d.groups = groups;
    d.fromChecklist = true;
    if (!d.form && src.form) d.form = src.form;
    if (!d.code && src.code) d.code = src.code;
  });

  /* ═══ เครื่องที่ยังไม่เคยมีใครบันทึกค่า ═══
     เดิมรายชื่อเครื่องมาจาก "ใครเคยกรอกอะไรไว้บ้าง" ซึ่งใช้ได้ตอนที่หน้านี้อ่านอย่างเดียว
     พอหน้านี้ลงบันทึกได้แล้ว มันกลายเป็นงูกินหาง — ไม่มีข้อมูล จึงไม่มีการ์ด
     จึงไม่มีที่ให้กรอก จึงไม่มีข้อมูลตลอดไป เครื่องใหม่เข้าระบบไม่ได้เลยสักเครื่อง

     เช็คลิสต์คือ "เครื่องที่ ISO สั่งให้ตรวจ" ซึ่งคือรายชื่อที่ถูกต้องกว่า
     เครื่องที่ยังไม่มีค่าขึ้นการ์ดว่าง ๆ พร้อมปุ่มลงบันทึก ไม่ใช่หายไปเฉย ๆ */
  Object.keys(cl).forEach(function (name) {
    var src = cl[name];
    if (src.used || defs[name]) return;

    var d = { id: name, name: paramCmmsName_(name, name) || name,
              form: src.form || '', code: src.code || '', remark: '',
              std: {}, tol: { all: 0, by: {} }, derived: true, fromChecklist: true,
              groups: [] };
    src.groups.forEach(function (grp) {
      d.groups.push({
        group: grp.group,
        fields: grp.fields.map(function (fl) {
          if (fl.std !== '') {
            d.std[fl.key] = fl.std;
            if (fl.tol !== '') d.tol.by[fl.key] = fl.tol;
          }
          /* linked = true เพราะไม่ได้รอคอลัมน์จากไฟล์ต้นทาง — ช่องพวกนี้เก็บที่ชีตของเราเอง
             ขึ้นเส้นประว่า "ต้นทางไม่เก็บ" ทั้งเครื่องจะเป็นการโกหก */
          return { key: fl.key, label: fl.label || fl.key, type: fl.type,
                   unit: fl.unit, note: fl.note, linked: true };
        })
      });
    });
    defs[name] = d;
  });

  Object.keys(cl).forEach(function (k) { delete cl[k].used; });
  return defs;
}

/** นิยามทุกเครื่องจากชีต Machines — ไม่มีชีตนี้ก็คืนค่าว่าง ไม่ใช่โยน error
    เพราะทรง long/wide ที่รองรับอยู่เดิมไม่ได้ต้องใช้มัน */
var paramDefsCache_ = null;
function paramDefs_() {
  if (paramDefsCache_) return paramDefsCache_;
  paramDefsCache_ = {};
  var sh;
  /* เปิดไฟล์ต้นทางไม่ได้ (id ผิด/ไม่มีสิทธิ์) ก็ยังเหลือเช็คลิสต์
     หน้านี้จึงยังใช้งานได้ — ช่างลงค่าใหม่ได้ แค่ไม่เห็นของเก่าที่อยู่ในไฟล์นั้น */
  try { sh = paramSS_().getSheetByName(PARAM_SHEET_DEFS); }
  catch (e) { return (paramDefsCache_ = paramApplyChecklist_(paramDefsCache_)); }
  if (!sh || sh.getLastRow() < 2)
    return (paramDefsCache_ = paramApplyChecklist_(paramApplyStd_(paramDefsFromLogs_())));

  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    var id = String(r[0] || '').trim();
    if (!id) return;
    paramDefsCache_[id] = {
      id: id,
      name: String(r[1] || id).trim(),
      groups: kvFields_(r[2]),
      std: kvParse_(r[3]),
      tol: kvTol_(r[4]),
      remark: String(r[5] || ''),
      /* รหัสแบบฟอร์ม ISO — จะเปลี่ยนหลังขึ้นทะเบียนกับผู้ตรวจ อ่านจากชีตเสมอ ห้าม hardcode */
      form: String(r[6] || '')
    };
  });
  /* ชีต Machines อาจเว้น std ไว้แล้วไปเขียนที่ Std.parameter แทน — เติมทับของเดิม */
  return (paramDefsCache_ = paramApplyChecklist_(paramApplyStd_(paramDefsCache_)));
}

/* ═══ ไฟล์พารามิเตอร์ที่ไม่มีชีต "Machines" ═══
   ไฟล์จริงของโรงงาน (EXT Condition data) ไม่มีชีตนิยามเครื่อง มีแต่ชีตบันทึกกับ "Std.parameter"
   เดิมหน้านี้จึงตายทั้งหน้าพร้อมข้อความให้ไปตั้ง PARAM_SHEET_ID ทั้งที่ตั้งถูกแล้ว

   ของที่ "จำเป็นต้องมี" จริง ๆ เพื่อให้หน้านี้ใช้งานได้คือ รายชื่อเครื่อง กับ ชื่อฟิลด์
   ซึ่งอนุมานจากข้อมูลที่บันทึกไว้แล้วได้ทั้งคู่ — เครื่องมาจากคอลัมน์เครื่องจักร
   ฟิลด์มาจากหัวคอลัมน์ที่เหลือ ไม่ต้องให้ใครมานั่งประกาศซ้ำ

   ส่วน std/tol (พิกัดมาตรฐาน) ปล่อยว่างไว้โดยตั้งใจ — ยังไม่รู้รูปแบบชีต "Std.parameter"
   เดาแล้วตีความผิด = หน้าจอบอกว่าค่าหลุดสเปกทั้งที่ปกติ แล้วมีคนเปิดใบแจ้งซ่อมทิ้ง
   ซึ่งแย่กว่าไม่บอกเลย · ว่างแปลว่า "ดูค่าได้ แต่ยังไม่ตัดสินผ่าน/ไม่ผ่าน" */
function paramDefsFromLogs_() {
  var out = {};
  var logs;
  try { logs = paramLogs_(); } catch (e) { return out; }

  logs.forEach(function (x) {
    var id = x.machine;
    if (!id) return;
    var d = out[id] || (out[id] = {
      id: id, name: id, groups: [{ group: 'พารามิเตอร์', fields: [] }],
      std: {}, tol: { all: 0, by: {} }, remark: '', form: '', derived: true
    });
    var seen = {};
    d.groups[0].fields.forEach(function (f) { seen[f.key] = 1; });
    Object.keys(x.values).forEach(function (k) {
      if (!seen[k]) { seen[k] = 1; d.groups[0].fields.push({ key: k, label: k, type: 'num' }); }
    });
  });
  return out;
}

/** key เป็นชื่อที่คนอ่านรู้เรื่อง — key ที่ไม่มีในนิยาม (ฟิลด์ที่เพิ่งถูกลบ) ใช้ key เดิมไปก่อน
    ข้อมูลเก่ายังต้องอ่านได้ ถึงจะไม่มีช่องกรอกของมันในฟอร์มแล้วก็ตาม */
function paramLabels_(def) {
  var out = {};
  (def ? def.groups : []).forEach(function (g) {
    g.fields.forEach(function (f) { out[f.key] = { label: f.label, group: g.group, type: f.type }; });
  });
  return out;
}

/** ข้อมูลทั้งหมดที่หน้าเว็บต้องใช้ในการเรียกครั้งเดียว
    machines ได้จากข้อมูลจริง ไม่ใช่ทะเบียนของ CMMS — เครื่องที่ไม่มีใครกรอกค่าไม่ต้องขึ้นให้เลือก */
function apiParamData(token, machine, fromYmd, toYmd) {
  requireAuth_(token);

  var sh = paramLogSheet_();
  if (sh.getLastRow() < 2) {
    return { rows: [], machines: [], limits: [], layout: '', sheet: sh.getName(),
             external: !!prop_('PARAM_SHEET_ID') };
  }

  var vals = sh.getDataRange().getValues();
  var head = vals.shift();
  var m = paramMap_(head);
  if (m.machine === -1) {
    throw new Error('หาคอลัมน์เครื่องจักรในชีต "' + sh.getName() + '" ไม่เจอ — ' +
      'ใส่ชื่อหัวคอลัมน์จริงที่ชีต "ตั้งค่า" คีย์ "' + PARAM_CFG.machine + '" ' +
      '(รัน apiParamPeek ดูว่าระบบเห็นหัวคอลัมน์อะไรบ้าง)');
  }

  var tz = Session.getScriptTimeZone();
  var want = machine ? canonical_(machine) : '';
  var limits = {};
  paramLimits_().forEach(function (x) { limits[x.machine + '|' + x.param] = x; });

  var machines = {}, latest = {};

  vals.forEach(function (r) {
    if (!r[m.machine]) return;
    var mc = canonical_(r[m.machine]);
    machines[mc] = true;
    if (want && mc !== want) return;

    var d = m.date > -1 ? toDate_(r[m.date]) : null;
    if (!d) return;                                  // ไม่มีวันที่ก็เอามาวางบนแกนเวลาไม่ได้
    var ymd = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (fromYmd && ymd < fromYmd) return;
    if (toYmd && ymd > toYmd) return;

    var shift = m.shift > -1 ? String(r[m.shift] || '') : '';
    var by    = m.by > -1 ? String(r[m.by] || '') : '';
    var note  = m.note > -1 ? String(r[m.note] || '') : '';

    var pairs = [];
    if (m.layout === 'kv') {
      /* ใช้ชื่อที่แสดงผลเป็นชื่อพารามิเตอร์ ไม่ใช่ key ดิบ — "z1" ไม่มีความหมายกับใคร
         และ limits ด้านล่างก็ผูกด้วยชื่อที่แสดงผลเหมือนกัน จะได้เทียบกันติด */
      var lab = paramLabels_(paramDefs_()[String(r[m.machine]).trim()]);
      var kv = kvParse_(r[m.data]);
      Object.keys(kv).forEach(function (k) {
        pairs.push([(lab[k] ? lab[k].label : k), kv[k]]);
      });
    } else if (m.layout === 'long') {
      pairs.push([String(r[m.param] || '').trim(), r[m.value]]);
    } else {
      m.cols.forEach(function (i) { pairs.push([String(head[i]).trim(), r[i]]); });
    }

    pairs.forEach(function (pv) {
      var name = pv[0];
      if (!name) return;
      var n = Number(pv[1]);
      if (pv[1] === '' || pv[1] === null || isNaN(n)) return;   // ช่องว่าง = ไม่ได้วัด ไม่ใช่ 0

      var lim = limits[mc + '|' + name] || {};
      /* กะเดียวกันบันทึกซ้ำถือว่าแก้ค่า เก็บแถวท้ายสุดของชีตพอ
         ถ้าเก็บทุกแถว กราฟจะมีจุดซ้อนกันในเวลาเดียวโดยไม่มีใครรู้ว่าอันไหนจริง */
      latest[ymd + '|' + shift + '|' + mc + '|' + name] = {
        date: ymd, shift: shift, machine: mc, param: name, value: n,
        unit: lim.unit || '',
        status: paramStatus_(n, lim.min === undefined ? '' : lim.min,
                                lim.max === undefined ? '' : lim.max),
        by: by, note: note
      };
    });
  });

  var rows = Object.keys(latest).map(function (k) { return latest[k]; })
    .sort(function (a, b) {
      return (a.date + a.shift).localeCompare(b.date + b.shift) || a.param.localeCompare(b.param);
    });

  return {
    rows: rows,
    machines: Object.keys(machines).sort(),
    limits: want ? paramLimits_().filter(function (x) { return x.machine === want; }) : [],
    layout: m.layout,
    sheet: sh.getName(),
    external: !!prop_('PARAM_SHEET_ID')
  };
}


/* ═══════════ สถานะพารามิเตอร์รายเครื่อง ═══════════
   หน้านี้ตอบคำถามเดียว "ตอนนี้เครื่องไหนต้องเข้าไปดู" ซึ่งตารางค่ากับกราฟแนวโน้มตอบไม่ได้
   ตารางบอกว่าเคยเกิดอะไร กราฟบอกว่าแนวโน้มไปทางไหน แต่ไม่มีอันไหนบอกว่าตอนนี้ต้องทำอะไร

   ทุกอย่างอ่านอย่างเดียว ไม่มีคำสั่งเขียนกลับไปที่ไฟล์ต้นทางแม้แต่บรรทัดเดียว
   ช่างยังกรอกที่ระบบเดิม CMMS ไม่รับกรอก — ปุ่มบนหน้าจอพาไปที่ฟอร์มของระบบนั้น */

/** แถวบันทึกทั้งหมด เรียงเก่า -> ใหม่ ตามลำดับที่ต่อท้ายชีต (ข้อมูลเป็น append-only) */
/* คอลัมน์ที่เป็น "ข้อมูลประจำแถว" ไม่ใช่ "ค่าที่วัด" — ที่เหลือทั้งหมดถือเป็นพารามิเตอร์
   ทำแบบนี้เพราะเพิ่ม ZONE 8 ในไฟล์ต้นทางแล้วต้องขึ้นเองโดยไม่ต้องมาแก้โค้ดที่นี่ */
function paramMetaCols_(m, head) {
  var skip = {};
  ['date', 'time', 'shift', 'machine', 'status', 'by', 'note', 'param', 'value', 'data']
    .forEach(function (k) { if (m[k] > -1) skip[m[k]] = 1; });
  // คอลัมน์ที่หัวว่าง = คอลัมน์ที่ถูกลากทิ้งไว้ ไม่ใช่พารามิเตอร์
  head.forEach(function (h, i) { if (!String(h || '').trim()) skip[i] = 1; });
  return skip;
}

/** อ่านบันทึกทุกชีต — รองรับทั้งทรง kv (คอลัมน์ data) และทรง wide (คอลัมน์ละค่า) */
function paramLogs_() {
  var tz = Session.getScriptTimeZone();
  var out = [];

  paramLogSheets_().forEach(function (sh) {
    if (sh.getLastRow() < 2) return;
    var vals = sh.getDataRange().getValues();
    var head = vals.shift();
    var m = paramMap_(head);
    /* ชีตบันทึกต้องมีทั้ง "เครื่องไหน" และ "เมื่อไหร่" — ขาดอย่างใดอย่างหนึ่งไม่ใช่ชีตบันทึก
       กันไม่ให้ชีตนิยาม/ชีตพิกัดที่บังเอิญมีคอลัมน์ชื่อเครื่อง ถูกอ่านเป็นแถวบันทึก
       ซึ่งจะทำให้เครื่องที่ยังไม่มีใครกรอกค่า ดูเหมือนมีข้อมูลแล้ว */
    if (m.machine < 0 || (m.date < 0 && m.time < 0)) return;
    var wide = m.data < 0;
    var skip = wide ? paramMetaCols_(m, head) : null;

    vals.forEach(function (r) {
      if (!r[m.machine]) return;
      var d = m.date > -1 ? toDate_(r[m.date]) : null;
      var values;
      if (wide) {
        values = {};
        head.forEach(function (h, i) {
          if (skip[i]) return;
          var v = r[i];
          if (v === '' || v === null || v === undefined) return;
          values[String(h).trim()] = v;
        });
      } else {
        values = kvParse_(r[m.data]);
      }
      out.push({
        sheet: sh.getName(),
        date: d ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : String(r[m.date] || ''),
        round: m.shift > -1 ? String(r[m.shift] || '')
             : (m.time > -1 ? String(r[m.time] || '') : ''),
        machine: String(r[m.machine]).trim(),
        operator: m.by > -1 ? String(r[m.by] || '') : '',
        status: m.status > -1 ? String(r[m.status] || '') : '',
        values: values,
        note: m.note > -1 ? String(r[m.note] || '') : ''
      });
    });
  });

  // เรียงเก่า -> ใหม่ เพราะผู้เรียกใช้ "ตัวท้าย = ล่าสุด"
  out.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  return out;
}

/** ชื่อเครื่องในทะเบียน CMMS ที่ตรงกับเครื่องของระบบพารามิเตอร์ - ไม่ตรงคืนค่าว่าง
    ไม่เดาแบบใกล้เคียง เพราะใบแจ้งซ่อมที่ผูกเครื่องผิดแย่กว่าใบที่ออกไม่ได้ */
function paramCmmsName_(id, name) {
  var list = machines_();
  if (!list.length) return '';
  var tries = [id, name];
  for (var i = 0; i < tries.length; i++) {
    var c = canonical_(tries[i]);
    for (var j = 0; j < list.length; j++) if (list[j].name === c) return c;
  }
  return '';
}

function paramState_(log, alerts) {
  if (!log) return 'none';
  if (String(log.status).indexOf('หยุด') > -1) return 'stop';
  return alerts.length ? 'bad' : 'ok';
}

/** การ์ดสถานะทุกเครื่อง - เรียกครั้งเดียวตอนเปิดหน้า */
function apiParamStatus(token) {
  requireAuth_(token);
  var defs = paramDefs_();
  var ids = Object.keys(defs);
  if (!ids.length) {
    throw new Error(prop_('PARAM_SHEET_ID')
      ? 'เปิดไฟล์พารามิเตอร์ได้ แต่ยังอ่านเครื่องจักรไม่ได้สักเครื่อง - ' +
        'ชีตบันทึกต้องมีคอลัมน์ชื่อเครื่องจักร (เช่น "เครื่องจักร") และมีข้อมูลอย่างน้อย 1 แถว - ' +
        'รัน apiParamPeek เพื่อดูหัวคอลัมน์ที่ระบบมองเห็น'
      : 'ยังไม่ได้ตั้ง Script Property ชื่อ PARAM_SHEET_ID ให้ชี้ไฟล์ของระบบบันทึกพารามิเตอร์');
  }

  var logs = paramLogs_();
  var last = {};
  logs.forEach(function (x) { last[x.machine] = x; });      // เรียงเก่า->ใหม่ ตัวท้ายคือล่าสุด

  /* "รอบปัจจุบัน" = รอบของแถวที่เพิ่งถูกบันทึกล่าสุดในชีต
     ต้นทางไม่ได้เก็บตารางรอบไว้ที่ไหน การอ่านจากข้อมูลจริงจึงตรงกว่าการเพิ่มช่องตั้งค่า
     อีกช่องที่จะลืมแก้เวลาโรงงานเปลี่ยนกะ */
  var newest = logs.length ? logs[logs.length - 1] : null;
  var curKey = newest ? newest.date + '|' + newest.round : '';
  var oks = paramApprovals_();

  var out = ids.map(function (id) {
    var d = defs[id], log = last[id] || null;
    var lab = paramLabels_(d);
    var alerts = log ? kvCheck_(log.values, d.std, d.tol) : [];
    alerts.forEach(function (a) { a.label = lab[a.key] ? lab[a.key].label : a.key; });

    var total = 0;
    d.groups.forEach(function (g) { total += g.fields.length; });

    return {
      id: id, name: d.name, form: d.form, remark: d.remark,
      code: d.code || '',
      cmms: paramCmmsName_(id, d.name),
      approved: log ? ((oks[paramRoundKey_(id, log.date, log.round)] || {}).result || '') : '',
      state: paramState_(log, alerts),
      stale: !log || (log.date + '|' + log.round) !== curKey,
      date: log ? log.date : '', round: log ? log.round : '',
      operator: log ? log.operator : '', status: log ? log.status : '',
      watched: Object.keys(d.std).length, total: total,
      alerts: alerts
    };
  });

  return {
    machines: out,
    round: newest ? newest.round : '',
    asOf: newest ? newest.date : '',
    formUrl: String(cfg_('ลิงก์ฟอร์มพารามิเตอร์', '')),
    external: !!prop_('PARAM_SHEET_ID'),
    /* ยังไม่มีพิกัดมาตรฐานให้เทียบสักเครื่อง = หน้าจอดูค่าได้ แต่ยังตัดสินผ่าน/ไม่ผ่านไม่ได้
       ต้องบอกไว้ ไม่งั้นทุกเครื่องขึ้นเขียวแล้วคนเข้าใจว่าระบบตรวจให้แล้ว */
    noLimits: out.every(function (x) { return !x.watched; })
  };
}

/* ═══ วิศวกรรับรองค่าที่ช่างลง ═══
   เก็บเป็นชีตแยก ไม่ได้ไปเติมคอลัมน์ในแถวบันทึก เพราะเหตุผลสองข้อ
     1. แถวบันทึกเป็น append-only ตามข้อกำหนด ISO แก้ย้อนหลังไม่ได้
     2. แถวบันทึกบางแถวอยู่ในไฟล์ต้นทางซึ่งโมดูลนี้ "อ่านอย่างเดียว" — เขียนทับไม่ได้อยู่แล้ว
   การรับรองจึงเป็น "ข้อเท็จจริงใหม่ที่พูดถึงแถวเดิม" ไม่ใช่การแก้แถวเดิม

   ชีตนี้ก็ append-only เหมือนกัน เปลี่ยนใจให้รับรองใหม่ทับ แถวเก่ายังอยู่ให้ตรวจย้อน */
var SHEET_PARAM_OK = 'รับรองพารามิเตอร์';
var PARAM_OK_HEAD = ['เครื่องจักร', 'วันที่', 'รอบ', 'ผล', 'ผู้รับรอง', 'หมายเหตุ', 'รับรองเมื่อ'];
var PARAM_OK_RESULTS = ['รับรองแล้ว', 'ตีกลับให้ลงใหม่'];

function paramOkSheet_(create) {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_PARAM_OK);
  if (!sh && create) {
    sh = ss.insertSheet(SHEET_PARAM_OK);
    sh.getRange(1, 1, 1, PARAM_OK_HEAD.length).setValues([PARAM_OK_HEAD])
      .setFontWeight('bold').setBackground('#e8fbf1');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** คีย์ของ "หนึ่งรอบการบันทึก" — เครื่อง + วัน + รอบ */
function paramRoundKey_(id, date, round) {
  return [String(id || '').trim(), String(date || '').trim(), String(round || '').trim()].join('|');
}

/** { 'เครื่อง|วัน|รอบ': {result, by, at, note} } — แถวหลังทับแถวก่อน */
function paramApprovals_() {
  var sh;
  try { sh = paramOkSheet_(false); } catch (e) { return {}; }
  if (!sh || sh.getLastRow() < 2) return {};

  var vals = sh.getDataRange().getValues();
  var head = vals.shift().map(function (h) { return String(h || '').trim(); });
  var ix = {};
  head.forEach(function (h, i) { ix[h] = i; });
  var g = function (r, n) {
    var i = ix[n];
    return i === undefined ? '' : String(r[i] === null || r[i] === undefined ? '' : r[i]).trim();
  };

  var out = {};
  vals.forEach(function (r) {
    var id = g(r, 'เครื่องจักร');
    if (!id) return;
    out[paramRoundKey_(id, g(r, 'วันที่'), g(r, 'รอบ'))] = {
      result: g(r, 'ผล'), by: g(r, 'ผู้รับรอง'),
      note: g(r, 'หมายเหตุ'), at: g(r, 'รับรองเมื่อ')
    };
  });
  return out;
}

function paramCanApprove_(user) {
  return ['LEAD', 'ENG', 'ADMIN'].indexOf(String(user.role).toUpperCase()) > -1;
}

/** รับรอง (หรือตีกลับ) ค่าของรอบหนึ่ง — คืนรายละเอียดเครื่องชุดใหม่ให้หน้าจอวาดต่อ */
function apiParamApprove(token, id, payload) {
  var user = requireAuth_(token);
  if (!paramCanApprove_(user)) {
    throw new Error('เฉพาะหัวหน้างานหรือวิศวกรเท่านั้นที่รับรองค่าได้');
  }
  id = String(id || '').trim();
  payload = payload || {};

  var result = String(payload.result || '').trim();
  if (PARAM_OK_RESULTS.indexOf(result) < 0) {
    throw new Error('ผลการรับรองต้องเป็น ' + PARAM_OK_RESULTS.join(' หรือ '));
  }

  var date = String(payload.date || '').trim();
  var round = String(payload.round || '').trim();
  if (!date) throw new Error('ยังไม่มีรอบบันทึกให้รับรอง');

  /* คนลงค่ากับคนรับรองต้องไม่ใช่คนเดียวกัน — ถ้าเซ็นรับรองงานตัวเองได้
     ลายเซ็นนั้นไม่ได้แปลว่ามีใครมาตรวจ มันแปลว่าแค่มีคนกดปุ่มเพิ่มอีกหนึ่งครั้ง */
  var mine = paramLogs_().filter(function (x) {
    return x.machine === id && x.date === date && String(x.round) === round;
  });
  var who = mine.length ? mine[mine.length - 1].operator : '';
  if (who && who === user.name) {
    throw new Error('รอบนี้คุณเป็นคนลงบันทึกเอง ให้คนอื่นเป็นผู้รับรอง');
  }

  var tz = Session.getScriptTimeZone();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = paramOkSheet_(true);
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h || '').trim(); });
    var row = {
      'เครื่องจักร': id, 'วันที่': date, 'รอบ': round, 'ผล': result,
      'ผู้รับรอง': user.name, 'หมายเหตุ': String(payload.note || '').trim(),
      'รับรองเมื่อ': Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss')
    };
    sh.appendRow(head.map(function (h) { return row[h] === undefined ? '' : row[h]; }));
  } finally {
    lock.releaseLock();
  }

  return apiParamMachine(token, id, 7);
}

/** รายละเอียดเครื่องเดียว - ค่าที่วัดเทียบมาตรฐานทีละค่า + ประวัติย้อนหลัง */
function apiParamMachine(token, id, history) {
  requireAuth_(token);
  id = String(id || '').trim();
  var d = paramDefs_()[id];
  if (!d) throw new Error('ไม่พบเครื่อง "' + id + '" ในชีต ' + PARAM_SHEET_DEFS);

  var mine = paramLogs_().filter(function (x) { return x.machine === id; });
  var log = mine.length ? mine[mine.length - 1] : null;
  var values = log ? log.values : {};
  var bad = {};
  kvCheck_(values, d.std, d.tol).forEach(function (a) { bad[a.key] = a; });

  var groups = d.groups.map(function (g) {
    return {
      group: g.group,
      fields: g.fields.map(function (f) {
        var std = f.type === 'num' || !f.type ? d.std[f.key] : undefined;
        var has = std !== undefined && std !== '' && isFinite(Number(std));
        var v = values[f.key] === undefined ? '' : values[f.key];
        /* ช่องที่เครื่องแสดงเอง กับช่องที่เลิกใช้แล้ว ไม่ใช่ "ไม่ได้เฝ้า" คนละความหมายกัน
           ช่างต้องแยกออกว่าอันไหน "ไม่ต้องกรอก" กับอันไหน "กรอกแล้วแต่ไม่มีเกณฑ์" */
        var result = f.type === 'na' ? 'ไม่ได้ใช้งาน'
                   : f.type === 'auto' ? 'เครื่องแสดงเอง'
                   : f.type === 'onoff' ? (v === '' ? 'ยังไม่ลง' : String(v))
                   : !has ? 'ไม่ได้เฝ้า' : bad[f.key] ? 'หลุด' : 'ผ่าน';
        return {
          key: f.key, label: f.label, type: f.type,
          unit: f.unit || '', note: f.note || '',
          /* ช่องในเช็คลิสต์ที่หาคอลัมน์ในชีตบันทึกไม่เจอ = ต้นทางยังไม่ได้เก็บค่านี้
             ต้องบอกให้ต่างจาก "เก็บแล้วแต่ยังว่าง" ไม่งั้นไล่หาสาเหตุไม่เจอ */
          linked: f.linked === undefined ? true : !!f.linked,
          value: v,
          std: has ? Number(std) : '',
          tol: has ? kvTolFor_(d.tol, f.key) : '',
          result: result,
          diff: bad[f.key] ? bad[f.key].actual - bad[f.key].std : ''
        };
      })
    };
  });

  var oks = paramApprovals_();
  var n = Math.min(Math.max(Number(history) || 7, 1), 50);
  var hist = mine.slice(-n).reverse().map(function (x) {
    var ok = oks[paramRoundKey_(id, x.date, x.round)] || null;
    return {
      date: x.date, round: x.round, operator: x.operator, status: x.status,
      bad: kvCheck_(x.values, d.std, d.tol).length,
      okResult: ok ? ok.result : '', okBy: ok ? ok.by : ''
    };
  });

  return {
    id: id, name: d.name, form: d.form, remark: d.remark,
    cmms: paramCmmsName_(id, d.name),
    state: paramState_(log, kvCheck_(values, d.std, d.tol)),
    date: log ? log.date : '', round: log ? log.round : '',
    operator: log ? log.operator : '', status: log ? log.status : '',
    note: log ? log.note : '',
    groups: groups, history: hist,
    /* บอกหน้าเว็บไปเลยว่าคนนี้ลงเครื่องนี้ได้ไหม — ซ่อนปุ่มดีกว่าให้กดแล้วค่อยเด้ง error
       (ฝั่งเซิร์ฟเวอร์ยังเช็คซ้ำอยู่ดี ปุ่มที่ซ่อนไม่ใช่การกันสิทธิ์) */
    code: d.code || '',
    /* การรับรองของรอบล่าสุด — ไม่มี = ยังไม่มีใครตรวจ ซึ่งต่างจาก "ตรวจแล้วไม่ผ่าน" */
    approval: log ? (oks[paramRoundKey_(id, log.date, log.round)] || null) : null,
    canApprove: paramCanApprove_(requireAuth_(token)),
    approveSelf: !!(log && log.operator && log.operator === requireAuth_(token).name),
    formUrl: String(cfg_('ลิงก์ฟอร์มพารามิเตอร์', ''))
  };
}

/**
 * เปิดใบแจ้งซ่อมจากค่าที่หลุดมาตรฐาน - จุดที่สองระบบมาบรรจบกัน
 * เติมเครื่องจักร ค่าที่ผิดปกติ ค่ามาตรฐาน ผู้บันทึก และเวลาให้อัตโนมัติ
 * คนแจ้งไม่ต้องพิมพ์ตัวเลขซ้ำ ซึ่งเป็นจังหวะที่ตัวเลขจะเริ่มไม่ตรงกับที่วัดได้จริง
 */
function apiParamMakeTicket(token, id, payload) {
  var user = requireAuth_(token);
  payload = payload || {};
  var info = apiParamMachine(token, id, 1);
  if (!info.cmms) {
    throw new Error('เครื่อง "' + id + '" ยังไม่ได้ผูกกับทะเบียนเครื่องจักรของระบบแจ้งซ่อม - ' +
      'ใส่ "' + id + '" ลงช่อง "ชื่อเดิมที่เคยใช้" ของเครื่องนั้นในชีต "ทะเบียนเครื่องจักร" แล้วรัน clearCache()');
  }

  /* เครื่องที่ถูกบันทึกว่าหยุดเครื่องอ่านค่าได้ 0 แทบทุกช่อง ซึ่งหลุดมาตรฐานทุกตัวตามสูตร
     แต่มันคือเครื่องที่ดับอยู่ ไม่ใช่เครื่องที่พัง ออกใบให้จะได้ใบที่บอกว่า
     "ความเข้มแสง UV = 0 มาตรฐาน 160" ทั้งที่ไม่มีอะไรเสีย แล้วสถิติงานเสียก็เพี้ยนตาม */
  if (info.state === 'stop') {
    throw new Error('รอบล่าสุดของเครื่องนี้บันทึกไว้ว่า "' + info.status + '" ' +
      'ค่าที่อ่านได้จึงไม่ใช่ความผิดปกติ — ถ้าเครื่องเสียจริงให้แจ้งซ่อมจากหน้าแจ้งซ่อมใหม่ตามปกติ');
  }

  var bad = [];
  info.groups.forEach(function (g) {
    g.fields.forEach(function (f) {
      if (f.result === 'หลุด') {
        bad.push(f.label + ' = ' + f.value + ' (มาตรฐาน ' + f.std + ' +-' + f.tol + ')');
      }
    });
  });
  if (!bad.length) throw new Error('เครื่องนี้ไม่มีค่าที่หลุดมาตรฐานในรอบล่าสุด');

  var when = info.date + (info.round ? ' รอบ ' + info.round + ' น.' : '');
  var res = apiCreateTicket({
    department: 'ฝ่ายซ่อมบำรุง',
    reporter: user.name,
    work_type: 'เครื่องจักร',
    machine_name: info.cmms,
    description: 'พารามิเตอร์หลุดมาตรฐาน ' + bad.length + ' ค่า - ' + bad.join(' · ') +
                 (payload.note ? ' | ' + String(payload.note).trim() : ''),
    /* อ้างรหัสแบบฟอร์มและผู้บันทึกไว้ในใบ เพราะผู้ตรวจ ISO จะตามจากใบนี้กลับไปหาบันทึกต้นทาง */
    cause: 'พบจากการบันทึกพารามิเตอร์ ' + when + ' โดย ' + (info.operator || 'ไม่ระบุ') +
           (info.form ? ' (' + info.form + ')' : ''),
    action_needed: 'ต้องการเรียกช่างซ่อมบำรุง',
    priority: PRIORITIES.filter(function (x) { return x.key === payload.priority; }).length
      ? payload.priority : PRIORITY_DEFAULT,
    source: 'พบจากพารามิเตอร์เครื่องจักร'
  });

  writeAudit_('เปิดใบแจ้งซ่อมจากพารามิเตอร์', id + ' -> ' + res.ticket_id, [], user.name);
  return { ok: true, ticket_id: res.ticket_id };
}


/* ═══════════ ไทม์ไลน์ย้อนเหตุการณ์ ═══════════
   คำถามที่ระบบยังตอบไม่ได้คือ "เครื่องพังตอนบ่ายสามวันศุกร์ ก่อนหน้านั้นเกิดอะไรบ้าง"
   คำตอบกระจายอยู่สี่ที่ — ใบแจ้งซ่อม ตาราง PM เช็คชีตประจำวัน และบันทึกพารามิเตอร์
   ซึ่งไม่มีใครเปิดพร้อมกันสี่หน้าจอแล้วไล่เทียบเวลาเอง

   เอามาเรียงบนแกนเวลาเดียว แล้วรูปแบบที่มองไม่เห็นตอนแยกกันอยู่จะโผล่มาเอง
   เช่น ค่าอุณหภูมิไต่ขึ้นสามรอบติด แล้ววันรุ่งขึ้นเครื่องหยุด

   ทุกแหล่งถูกห่อ try/catch แยกกัน — ชีตพารามิเตอร์ยังไม่ได้ตั้งค่า
   ต้องไม่ทำให้ไทม์ไลน์ทั้งหน้าใช้ไม่ได้ แค่ขาดแถวของแหล่งนั้นไป */

function tlPush_(out, at, kind, title, detail, ref, bad) {
  if (!at) return;
  out.push({ at: at, kind: kind, title: title, detail: detail || '', ref: ref || '', bad: !!bad });
}

/** "16.00" -> "16:00" · "7.00" -> "07:00" — ต้นทางเก็บรอบเป็นข้อความแบบนี้ */
function tlRoundTime_(round) {
  var h = String(round || '').split('.')[0].trim();
  if (!h) return '00:00';
  return ('0' + h).slice(-2) + ':00';
}

/**
 * เหตุการณ์ทั้งหมดของเครื่องหนึ่งในช่วงวันที่กำหนด เรียงใหม่ -> เก่า
 * @param {string} machine ชื่อเครื่องในทะเบียน CMMS
 */
function apiTimeline(token, machine, fromYmd, toYmd) {
  requireAuth_(token);
  var name = canonical_(machine);
  if (!name) throw new Error('ต้องเลือกเครื่องจักรก่อน');

  var tz = Session.getScriptTimeZone();
  var to = /^\d{4}-\d{2}-\d{2}$/.test(String(toYmd || '')) ? toYmd : dayKey_(new Date());
  var from = /^\d{4}-\d{2}-\d{2}$/.test(String(fromYmd || '')) ? fromYmd : to;
  if (from > to) { var t = from; from = to; to = t; }

  var out = [];
  function stamp(v) {
    var d = toDate_(v);
    if (!d) return '';
    var key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    return (key >= from && key <= to) ? Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm') : '';
  }

  /* ── ใบแจ้งซ่อม ── ใบเดียวให้ได้หลายจุดบนแกนเวลา
     แจ้ง / เริ่มซ่อม / ซ่อมเสร็จ เป็นคนละเหตุการณ์กัน การยุบเป็นจุดเดียว
     จะทำให้มองไม่เห็นว่าใบที่แจ้งไว้สามวันเพิ่งมีคนเริ่มทำเมื่อวาน */
  try {
    rowsToObjects_().forEach(function (t) {
      if (canonical_(t.machine_name) !== name) return;
      tlPush_(out, stamp(t.created_at), 'ticket', 'แจ้งซ่อม ' + t.ticket_id,
        String(t.description || ''), t.ticket_id, t.priority === 'วิกฤต');
      tlPush_(out, stamp(t.started_at), 'ticket', 'เริ่มซ่อม ' + t.ticket_id,
        String(t.technician || t.assignee || ''), t.ticket_id, false);
      tlPush_(out, stamp(t.completed_at), 'ticket', 'ซ่อมเสร็จ ' + t.ticket_id,
        String(t.solution || ''), t.ticket_id, false);
    });
  } catch (e) {}

  /* ── งาน PM ── วันที่วางแผนกับวันที่ทำจริงเป็นคนละจุด
     ระยะห่างระหว่างสองจุดนี้คือสิ่งที่บอกว่าแผนถูกเลื่อนไปนานแค่ไหนก่อนเครื่องจะพัง */
  try {
    var pack = pmRows_(), i = pmIdx_(pack.head);
    pack.rows.forEach(function (r) {
      var o = pmObj_(r, i);
      if (canonical_(o.machine) !== name) return;
      if (o.planned >= from && o.planned <= to && o.status !== PM_DONE) {
        tlPush_(out, o.planned + ' 00:00', 'pm', 'PM ตามแผน: ' + o.task,
          o.status + (o.owner ? ' · ' + o.owner : ''), o.id, o.status === PM_MOVED);
      }
      if (o.actual && o.actual >= from && o.actual <= to) {
        tlPush_(out, o.actual + ' 00:00', 'pm', 'ทำ PM เสร็จ: ' + o.task,
          o.owner || '', o.id, false);
      }
    });
  } catch (e) {}

  /* ── เช็คชีตประจำวัน ── ค่าที่ช่างติ๊กว่าผิดปกติคือสัญญาณแรกสุดที่ระบบมี
     มักมาก่อนใบแจ้งซ่อมหลายวัน แต่ไม่เคยมีใครย้อนกลับไปดู */
  try {
    var colMachine = String(cfg_('คอลัมน์เครื่องจักร', 'เครื่องจักร'));
    var colBy      = String(cfg_('คอลัมน์ผู้ตรวจ', 'ผู้ตรวจ'));
    var colResult  = String(cfg_('คอลัมน์ผลการตรวจ', 'ผลการตรวจ'));
    var badWord    = String(cfg_('คำว่าผิดปกติ', 'ผิดปกติ'));
    readCheckRange_(from, to).forEach(function (r) {
      if (canonical_(r[colMachine]) !== name) return;
      var res = String(r[colResult] || '');
      tlPush_(out, Utilities.formatDate(r.__ts, tz, 'yyyy-MM-dd HH:mm'), 'check',
        'เช็คชีตประจำวัน', res + (r[colBy] ? ' · ' + r[colBy] : ''), '',
        res.indexOf(badWord) > -1);
    });
  } catch (e) {}

  /* ── บันทึกพารามิเตอร์ ── รอบที่ค่าหลุดมาตรฐานคือสัญญาณที่ละเอียดที่สุดในระบบ
     เพราะมันเป็นตัวเลข ไม่ใช่ความรู้สึกของคนที่เดินผ่าน */
  try {
    var defs = paramDefs_();
    var mine = {};
    Object.keys(defs).forEach(function (id) {
      if (paramCmmsName_(id, defs[id].name) === name) mine[id] = defs[id];
    });
    if (Object.keys(mine).length) {
      paramLogs_().forEach(function (x) {
        var d = mine[x.machine];
        if (!d || x.date < from || x.date > to) return;
        var bad = kvCheck_(x.values, d.std, d.tol);
        var lab = paramLabels_(d);
        tlPush_(out, x.date + ' ' + tlRoundTime_(x.round), 'param',
          'บันทึกพารามิเตอร์ รอบ ' + x.round + ' น.',
          (bad.length
            ? 'หลุด ' + bad.length + ' ค่า — ' + bad.slice(0, 3).map(function (a) {
                return (lab[a.key] ? lab[a.key].label : a.key) + ' ' + a.actual;
              }).join(' · ')
            : 'ค่าปกติ') + (x.operator ? ' · ' + x.operator : '') +
          (x.status ? ' · ' + x.status : ''),
          x.machine, bad.length > 0);
      });
    }
  } catch (e) {}

  out.sort(function (a, b) { return b.at.localeCompare(a.at); });
  return { machine: name, from: from, to: to, events: out };
}

/* ─────────── แจ้งเตือนอีเมล ─────────── */

function mailOn_() { return String(cfg_('เปิดแจ้งเตือน', 'ใช่')).trim() !== 'ไม่'; }

function sendMail_(to, subject, htmlBody) {
  if (!mailOn_()) return;
  to = String(to || '').trim();
  if (!to) return;
  try {
    MailApp.sendEmail({ to: to, subject: '[แจ้งซ่อม] ' + subject, htmlBody: htmlBody, name: 'ระบบแจ้งซ่อมบำรุง' });
  } catch (err) {
    Logger.log('ส่งอีเมลไม่สำเร็จ: ' + err.message);   // โควตาเต็มก็ไม่ควรทำให้งานหลักพัง
  }
}

function ticketLink_() {
  try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; }
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ช่องผู้รับผิดชอบเก็บได้หลายชื่อ คั่นด้วยจุลภาค — หนึ่งงานมีช่างช่วยกันหลายคนได้
   เก็บในคอลัมน์เดิมไม่เปลี่ยนโครงชีต ใบเก่าที่มีชื่อเดียวจึงอ่านได้เหมือนเดิม

   ห้ามเทียบด้วย indexOf บนสตริงดิบเด็ดขาด — "ชล" จะไปแมตช์ "ช่างชล" ด้วย
   ต้องแตกเป็นรายชื่อก่อนแล้วเทียบตรงตัวเสมอ */
function nameList_(v) {
  return String(v == null ? '' : v).split(',')
    .map(function (x) { return x.trim(); })
    .filter(String);
}

/* ชื่อเก่า -> ชื่อมาตรฐาน ฝั่งคน (คู่แฝดของ aliasMap_ ที่ทำกับเครื่องจักร)
   ไม่รวมสองตารางเข้าด้วยกันโดยตั้งใจ — ชื่อช่างกับชื่อเครื่องอยู่คนละ namespace
   ถ้าบังเอิญซ้ำกันจะแปลงข้ามประเภทกันเงียบ ๆ ซึ่งหายากกว่าปัญหาที่กำลังแก้ */
var techAliasCache_ = null;
function techAlias_() {
  if (techAliasCache_) return techAliasCache_;
  var map = {};
  team_().forEach(function (u) {
    map[u.name.toLowerCase()] = u.name;
    (u.aliases || []).forEach(function (a) { map[a.toLowerCase()] = u.name; });
  });
  techAliasCache_ = map;
  return map;
}

/** แปลงรายชื่อ (คั่นจุลภาค) ให้เป็นชื่อมาตรฐาน ตัดชื่อซ้ำออก
    ชื่อที่ไม่รู้จักปล่อยผ่าน ไม่ throw — ใบเก่ามีทั้ง "Supplier" และชื่อคนที่ลาออกไปแล้ว
    ถ้าปฏิเสธจะแก้ใบเก่าไม่ได้เลย ซึ่งแย่กว่าปล่อยให้ชื่อแปลกค้างอยู่ */
function canonTech_(v) {
  var map = techAlias_(), seen = {}, out = [];
  nameList_(v).forEach(function (n) {
    var c = map[n.toLowerCase()] || n;
    if (!seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; out.push(c); }
  });
  return out.join(', ');
}

/* ═══ ตรวจไฟล์ต้นทางหลังตั้ง Script Property ═══
   รันเองจากเมนู Apps Script หลังตั้ง PARAM_SHEET_ID / CHECK_SHEET_ID

   ต้องมีตัวนี้เพราะ "ใส่ id ผิดไฟล์" กับ "ใส่ถูกแต่ชื่อเครื่องไม่ตรงทะเบียน"
   หน้าตาบนหน้าจอเหมือนกันเป๊ะ — การ์ดว่าง ๆ ที่ไม่มี error ให้จับ
   อ่านอย่างเดียว ไม่แก้ไฟล์ไหนทั้งนั้น */
function sourceAudit() {
  var NL = '\n', out = [], reg = machines_();
  out.push('ทะเบียนเครื่องจักร: ' + reg.length + ' เครื่อง' +
    (reg.length ? '' : ' — ยังไม่ได้รัน setup() หรือชีตยังว่าง'));

  /* ชื่อที่ผูกทะเบียนไม่ติด = หน้าจอเห็นเครื่องนั้น แต่เปิดใบแจ้งซ่อมจากมันไม่ได้
     ใช้ตัวจับคู่ตัวเดียวกับที่หน้าจอใช้จริง ไม่งั้นรายงานผ่านแต่ของจริงไม่ผ่าน */
  var nameReport = function (names) {
    if (!reg.length) return '  (ข้ามการตรวจชื่อ — ยังไม่มีทะเบียนเครื่องจักร)';
    var hit = [], miss = [];
    names.forEach(function (n) { (paramCmmsName_(n, n) ? hit : miss).push(n); });
    var s = '  เครื่องที่เห็น ' + names.length +
      ' · ผูกทะเบียนติด ' + hit.length + ' · ไม่ติด ' + miss.length;
    if (miss.length) s += NL + miss.map(function (n) { return '    ✗ ' + n; }).join(NL);
    return s;
  };

  out.push('', '── พารามิเตอร์ · PARAM_SHEET_ID ' +
    (prop_('PARAM_SHEET_ID') ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง (ใช้ไฟล์ CMMS เอง)') + ' ──');
  try {
    out.push('  ไฟล์: ' + paramSS_().getName());
    out.push('  ชีตบันทึกที่ใช้: ' + paramLogSheets_().map(function (sh) {
      return sh.getName() + ' (' + Math.max(0, sh.getLastRow() - 1) + ' แถว)';
    }).join(' · '));
  } catch (e) { out.push('  ✗ เปิดไฟล์ไม่ได้: ' + e.message); }
  try {
    var cl = paramChecklist_(), ck = Object.keys(cl), nf = 0;
    ck.forEach(function (k) {
      cl[k].groups.forEach(function (g) { nf += g.fields.length; });
    });
    out.push('  เช็คลิสต์พารามิเตอร์: ' + ck.length + ' เครื่อง ' + nf + ' ช่อง' +
      (ck.length ? '' : ' — ยังไม่ได้วางชีต เครื่องที่ไม่เคยมีข้อมูลจะไม่ขึ้นบนหน้าจอ'));
  } catch (e) { out.push('  ✗ เช็คลิสต์: ' + e.message); }
  try {
    var defs = paramDefs_();
    out.push(nameReport(Object.keys(defs).map(function (k) { return defs[k].name || k; })));
  } catch (e) { out.push('  ✗ อ่านรายการเครื่องไม่ได้: ' + e.message); }

  out.push('', '── เช็คชีตประจำวัน · CHECK_SHEET_ID ' +
    (prop_(CHECK_PROP_ID) ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง (ใช้ชีต Daily Check ในไฟล์ CMMS)') + ' ──');
  try {
    out.push('  ไฟล์: ' + checkSS_().getName());
    var seen = {}, sheets = checkFormSheets_();
    if (!sheets.length)
      out.push('  ✗ ไม่เจอชีตคำตอบสักใบ — ชีตคำตอบต้องมีทั้งคอลัมน์เครื่องจักรและประทับเวลา');
    sheets.forEach(function (x) {
      var n = 0;
      x.head.forEach(function (h) { if (checkItemHead_(h)) n++; });
      out.push('  ' + x.sh.getName() + ' — ' + Math.max(0, x.sh.getLastRow() - 1) +
        ' แถว · ' + n + ' ข้อตรวจ · ผู้ตรวจ: ' +
        (x.meta.by > -1 ? String(x.head[x.meta.by]) : '✗ ไม่มีคอลัมน์'));
      x.sh.getRange(2, x.meta.machine + 1, x.sh.getLastRow() - 1, 1).getValues()
        .forEach(function (r) {
          var v = String(r[0] || '').trim();
          if (v) seen[v] = 1;
        });
    });
    out.push(nameReport(Object.keys(seen).sort()));
  } catch (e) { out.push('  ✗ เปิดไฟล์ไม่ได้: ' + e.message); }

  out.push('', 'ชื่อที่ขึ้น ✗ — เอาไปใส่ช่อง "ชื่อเดิมที่เคยใช้" ของเครื่องนั้นในชีต ' +
    SHEET_MACHINES + ' (คั่นหลายชื่อด้วย ,) แล้วรัน clearCache()');

  var msg = out.join(NL);
  Logger.log(msg);
  return msg;
}

/* รันเองจากเมนู Apps Script — กวาดชื่อในช่อง "ผู้เข้าซ่อม" ทั้งไฟล์ แล้วรายงานว่าเจอชื่ออะไรบ้าง

   ตัวนี้ไม่แก้ข้อมูล แค่รายงาน เพราะการชี้ว่า "ชล" คือคนเดียวกับ "ช่างชล" เป็นเรื่องที่หัวหน้าช่างรู้
   ระบบเดาแทนแล้วเดาผิด = เครดิตงานไปอยู่ผิดคน ซึ่งแก้ยากกว่าปล่อยให้คนตัดสินตั้งแต่แรก */
function techAudit() {
  var map = techAlias_(), count = {}, rows = rowsToObjects_();
  rows.forEach(function (t) {
    nameList_(t.technician).forEach(function (n) { count[n] = (count[n] || 0) + 1; });
  });

  var known = [], unknown = [];
  Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).forEach(function (n) {
    var hit = map[n.toLowerCase()];
    (hit ? known : unknown).push('  ' + n + ' (' + count[n] + ' ใบ)' +
      (hit && hit !== n ? ' -> ' + hit : ''));
  });

  var NL = '\n';
  var msg = 'ใบทั้งหมด ' + rows.length + ' · ชื่อในช่อง "ผู้เข้าซ่อม" ' +
    Object.keys(count).length + ' แบบ' + NL + NL +
    'รู้จักแล้ว ' + known.length + ' แบบ:' + NL + (known.join(NL) || '  -') + NL + NL +
    'ยังไม่รู้จัก ' + unknown.length + ' แบบ:' + NL + (unknown.join(NL) || '  -') + NL + NL +
    (unknown.length
      ? 'ชื่อที่ยังไม่รู้จัก — ถ้าเป็นคนในทีม ใส่ลงช่อง "ชื่อเดิมที่เคยใช้" ของคนนั้นในชีต Users ' +
        '(คั่นหลายชื่อด้วย ,) แล้วรัน clearCache() · ถ้าเป็นร้านนอก ย้ายไปช่อง "ผู้รับซ่อมภายนอก"'
      : 'ชื่อครบทุกแบบแล้ว — สถิติรายคนเชื่อถือได้');
  Logger.log(msg);
  return msg;
}

/* ═══ ตรวจคุณภาพข้อมูล ═══
   รันเองจากเมนู Apps Script — อ่านอย่างเดียว ไม่แก้อะไรสักช่อง

   ของเดิม "เครื่องไหนยังไม่มีผู้ดูแล" ต้องมีคนนั่งไล่ดูเอง
   รายการที่คนต้องจำ คือรายการที่จะหลุด จึงให้ชีตตรวจตัวเองแทน

   ทุกข้อที่ขึ้นต้องบอกได้ว่า "ไปแก้ที่ไหน" ไม่ใช่แค่บอกว่าผิด */
function dataIssues() {
  var NL = String.fromCharCode(10), out = [], total = 0;

  /** หัวข้อหนึ่งกอง — ไม่มีปัญหาก็ยังพิมพ์ เพื่อให้รู้ว่าตรวจแล้วจริง */
  function sect(title, lines, how) {
    total += lines.length;
    out.push('', '── ' + title + ' · ' +
      (lines.length ? '⚠ ' + lines.length : '✓ ไม่มี') + ' ──');
    lines.slice(0, 30).forEach(function (x) { out.push('  ' + x); });
    if (lines.length > 30) out.push('  … อีก ' + (lines.length - 30) + ' รายการ');
    if (lines.length && how) out.push('  → ' + how);
  }

  /* กองหนึ่งล้มไม่ควรลากกองที่เหลือลงไปด้วย
     เช่น เปิดไฟล์พารามิเตอร์ไม่ได้ ก็ยังต้องรู้ว่าเครื่องไหนไม่มีผู้ดูแล */
  function safe(fn) {
    try { return fn(); } catch (e) { return ['✗ ตรวจไม่ได้: ' + e.message]; }
  }

  // ══ ทะเบียนเครื่องจักร ══
  sect('เครื่องจักรไม่มีผู้ดูแล', safe(function () {
    return machines_().filter(function (m) { return !m.owner; })
      .map(function (m) { return m.name + ' (' + m.group + ')'; });
  }), 'ชีต ' + SHEET_MACHINES + ' ช่อง "ผู้ดูแล" — ' +
      'เครื่องที่ว่างจะไม่ขึ้นในโหมด "เครื่องของฉัน" ของใครเลย');

  sect('ชื่อ/รหัสเครื่องซ้ำกัน', safe(function () {
    var byName = {}, byCode = {}, bad = [];
    machines_().forEach(function (m) {
      var n = m.name.toLowerCase();
      if (byName[n]) bad.push('ชื่อซ้ำ: ' + m.name);
      byName[n] = 1;
      if (m.code) {
        var c = m.code.toLowerCase();
        if (byCode[c]) bad.push('รหัสซ้ำ: ' + m.code + ' (' + m.name + ')');
        byCode[c] = 1;
      }
    });
    return bad;
  }), 'ชื่อซ้ำทำให้สถิติรายเครื่องแตกเป็นสองก้อน');

  // ══ ผู้ใช้ ══
  sect('ผู้ใช้ในชีต Users', safe(function () {
    var bad = [], seen = {}, ok = { ALL: 1 };
    /* เทียบกับสถานีที่มีเครื่องอยู่จริง — นี่คือสิ่งที่ตัวกรองเทียบ
       เทียบกับรายชื่อในโค้ดจะฟ้องทุกคนเวลาชื่อสถานีเปลี่ยน ทั้งที่ระบบยังทำงานถูก */
    stations_().forEach(function (x) { ok[x] = 1; });
    readSheet_(SHEET_USERS).forEach(function (u) {
      var mail = String(u['อีเมล'] || '').trim().toLowerCase();
      var name = String(u['ชื่อ-นามสกุล'] || '').trim();
      if (!name) return;
      if (!mail) bad.push(name + ' — ไม่มีอีเมล ล็อกอินไม่ได้');
      else if (seen[mail]) bad.push(name + ' — อีเมลซ้ำกับคนก่อน: ' + mail);
      seen[mail] = 1;
      var role = String(u['บทบาท'] || '').trim().toUpperCase();
      if (!RANK[role]) bad.push(name + ' — บทบาท "' + role + '" ไม่มีในระบบ (ได้สิทธิ์ต่ำกว่าช่าง)');
      var st = String(u['สถานีประจำ'] || '').trim();
      if (st && !ok[st]) bad.push(name + ' — สถานี "' + st + '" ไม่มีเครื่องสักเครื่องในทะเบียน');
    });
    return bad;
  }), 'ชีต ' + SHEET_USERS + ' — ห้ามสลับลำดับคอลัมน์ 1-9');

  // ══ เช็คลิสต์พารามิเตอร์ ══
  var cl = null;
  try { cl = paramChecklist_(); } catch (e) { cl = null; }

  sect('ช่องในเช็คลิสต์ที่ไม่มีชื่อหัวข้อ', safe(function () {
    if (!cl) throw new Error('อ่านเช็คลิสต์ไม่ได้');
    var bad = [];
    Object.keys(cl).forEach(function (mc) {
      var n = 0;
      cl[mc].groups.forEach(function (g) {
        g.fields.forEach(function (f) { if (!f.label) n++; });
      });
      if (n) bad.push(mc + ' — ' + n + ' ช่อง');
    });
    return bad;
  }), 'ช่องไม่มีป้ายจะถูกข้ามตอนสร้างฟอร์ม และช่างจะไม่เห็นข้อนั้นเลย');

  sect('ค่ามาตรฐานที่น่าสงสัย', safe(function () {
    if (!cl) throw new Error('อ่านเช็คลิสต์ไม่ได้');
    var bad = [];
    Object.keys(cl).forEach(function (mc) {
      cl[mc].groups.forEach(function (g) {
        g.fields.forEach(function (f) {
          if (f.type !== 'num' || f.std === '' || f.std === 0) return;
          /* พิกัดกว้างเกินครึ่งของค่ามาตรฐาน = วัดอะไรก็ผ่าน เท่ากับไม่ได้ตรวจ */
          if (f.tol !== '' && Math.abs(f.tol) >= Math.abs(f.std) * 0.3) {
            bad.push(mc + ' · ' + (f.label || f.key) + ' = ' + f.std +
              ' ±' + f.tol + (f.unit ? ' ' + f.unit : ''));
          }
        });
      });
    });
    return bad;
  }), 'ให้วิศวกรยืนยันค่าที่ถูก — ซอฟต์แวร์เดาแทนไม่ได้');

  // ══ เช็คชีตประจำวัน ══
  sect('ชื่อเครื่องในคำตอบเช็คชีตที่ไม่อยู่ในทะเบียน', safe(function () {
    var known = {}, bad = {};
    machines_().forEach(function (m) { known[m.name.toLowerCase()] = 1; });
    if (!machines_().length) return [];
    checkFormSheets_().forEach(function (x) {
      var n = x.sh.getLastRow() - 1;
      if (n < 1) return;
      x.sh.getRange(2, x.meta.machine + 1, n, 1).getValues().forEach(function (r) {
        var raw = String(r[0] || '').trim();
        if (!raw) return;
        if (!known[canonical_(raw).toLowerCase()]) {
          bad[raw] = (bad[raw] || 0) + 1;
        }
      });
    });
    return Object.keys(bad).map(function (k) {
      return '"' + k + '" ×' + bad[k] + ' แถว';
    });
  }), 'ถ้าเป็นชื่อเครื่องจริง ใส่ลงช่อง "ชื่อเดิมที่เคยใช้" · ' +
      'ถ้าเป็นแถวขยะ ให้กักไว้ อย่าลบเงียบ — ข้อมูลเป็น append-only');

  sect('ฟอร์มเช็คชีตที่ไม่มีช่องผู้ตรวจ', safe(function () {
    return checkFormSheets_().filter(function (x) { return x.meta.by < 0; })
      .map(function (x) { return x.sh.getName(); });
  }), 'ไม่รู้ว่าใครตรวจ = อ้างผู้บันทึกตาม ISO ไม่ได้');

  // ══ ใบแจ้งซ่อม ══
  var rows = null;
  try { rows = rowsToObjects_(); } catch (e) { rows = null; }

  sect('ใบแจ้งซ่อมที่เวลาไม่สมเหตุสมผล', safe(function () {
    if (!rows) throw new Error('อ่านใบแจ้งซ่อมไม่ได้');
    var bad = [];
    rows.forEach(function (t) {
      var a = toDate_(t.started_at), b = toDate_(t.completed_at);
      if (a && b && b.getTime() < a.getTime()) {
        bad.push(t.ticket_id + ' — ซ่อมจบก่อนเริ่มซ่อม');
      }
      var c = toDate_(t.created_at);
      if (c && a && a.getTime() < c.getTime()) {
        bad.push(t.ticket_id + ' — เริ่มซ่อมก่อนเวลาแจ้ง');
      }
    });
    return bad;
  }), 'MTTR คิดจากสองช่องนี้ ใบที่เวลากลับด้านทำให้ค่าเฉลี่ยเพี้ยน');

  sect('ปิดงานแล้วแต่ไม่ได้บันทึกสาเหตุ/การซ่อม', safe(function () {
    if (!rows) throw new Error('อ่านใบแจ้งซ่อมไม่ได้');
    return rows.filter(function (t) {
      return t.status === STATUS_DONE &&
        !String(t.cause || '').trim() && !String(t.repair_action || '').trim();
    }).map(function (t) { return t.ticket_id + ' — ' + t.machine_name; });
  }), 'ปิดงานโดยไม่ระบุสาเหตุ = วิเคราะห์เครื่องเสียซ้ำไม่ได้');

  // ══ Script Properties ══
  sect('Script Properties', safe(function () {
    var bad = [];
    ['SHEET_ID', 'DRIVE_FOLDER_ID', 'DASHBOARD_PASSWORD', 'AUTH_SECRET'].forEach(function (k) {
      if (!prop_(k)) bad.push(k + ' — ยังไม่ได้ตั้ง');
    });
    var pw = prop_('DASHBOARD_PASSWORD');
    /* ไม่พิมพ์ค่าออกมา — รายงานนี้ถูกก๊อปไปวางในแชทได้ */
    if (pw && (pw.length < 6 || /^(\d)\1*$/.test(pw) || pw === '123456')) {
      bad.push('DASHBOARD_PASSWORD — สั้นหรือเดาง่ายเกินไป');
    }
    ['SHEET_ID', 'DRIVE_FOLDER_ID', 'PARAM_SHEET_ID', CHECK_PROP_ID].forEach(function (k) {
      var v = prop_(k);
      /* driveId_() ตัดลิงก์ให้เองอยู่แล้ว จึงเป็นแค่ความรกรุงรัง ไม่ใช่ข้อผิดพลาด */
      if (v && driveId_(v) !== v.trim()) {
        bad.push(k + ' — วางลิงก์ไว้แทนรหัส (ระบบตัดให้เองได้ ไม่พัง แต่อ่านยาก)');
      }
    });
    return bad;
  }), 'แก้ที่ Project Settings › Script Properties — ห้ามเก็บในชีต ' + SHEET_CONFIG);

  var msg = 'ตรวจคุณภาพข้อมูล — พบ ' + total + ' รายการที่ควรดู' +
    NL + out.join(NL) + NL + NL +
    (total
      ? 'แก้ข้อมูลในชีตแล้วรัน clearCache() แล้วรัน dataIssues() ซ้ำ'
      : 'ข้อมูลหลักครบถ้วน — รายงานทุกหน้าเชื่อถือได้');
  Logger.log(msg);
  return msg;
}

/** อีเมลของคนในทีมตามชื่อ */
function emailOf_(name) {
  var hit = team_().filter(function (u) { return u.name === String(name || '').trim(); })[0];
  return hit ? hit.email : '';
}

function notifyAssigned_(ticketId, assignee) {
  var to = nameList_(assignee).map(emailOf_).filter(String).join(',');
  if (!to) return;
  var url = ticketLink_();
  sendMail_(to, ticketId + ' — คุณได้รับมอบหมายงานนี้',
    '<p>ใบ <b>' + esc_(ticketId) + '</b> ถูกมอบหมายให้คุณแล้ว</p>' +
    (url ? '<p><a href="' + url + '">เปิดระบบแจ้งซ่อม</a></p>' : ''));
}

function notifyNewTicket_(t) {
  var url = ticketLink_();
  var to = cfg_('อีเมลช่าง', '');
  if (t.priority === 'วิกฤต') to = [to, cfg_('อีเมลหัวหน้า', '')].filter(String).join(',');
  sendMail_(to, '[' + t.priority + '] ' + t.ticket_id + ' ' + t.machine_name,
    '<h3>' + esc_(t.ticket_id) + '</h3>' +
    '<p><b>ระดับความสำคัญ:</b> ' + esc_(t.priority) + ' — ต้องปิดภายใน ' + thDate_(t.due_at) + '<br>' +
    '<b>เครื่องจักร:</b> ' + esc_(t.machine_name) + '<br>' +
    '<b>ผู้แจ้ง:</b> ' + esc_(t.reporter) + ' (' + esc_(t.department) + ')<br>' +
    '<b>อาการ:</b> ' + esc_(t.description) + '</p>' +
    (t.image_url ? '<p><a href="' + esc_(t.image_url) + '">ดูรูปที่แนบ</a></p>' : '') +
    (url ? '<p><a href="' + url + '">เปิดระบบแจ้งซ่อม</a></p>' : ''));
}

function notifyWaitVerify_(ticketId) {
  var url = ticketLink_();
  sendMail_(cfg_('อีเมลหัวหน้า', ''), ticketId + ' รอฝ่ายผลิตตรวจรับ',
    '<p>ใบ <b>' + esc_(ticketId) + '</b> ซ่อมเสร็จแล้ว รอฝ่ายผลิตตรวจรับงานตามมาตรฐาน ISO</p>' +
    (url ? '<p><a href="' + url + '">เปิดระบบเพื่อตรวจรับ</a></p>' : ''));
}

/** สรุปงานค้างส่งหัวหน้าทุกเช้า — ตั้งเวลาไว้ใน setupTriggers() */
/** เตือนช่างเป็นรายคนทุกเช้า — ต่างจาก dailyDigest() ที่ส่งสรุปให้หัวหน้าคนเดียว
    สรุปรวมบอกหัวหน้าว่ามีงานค้างกี่ใบ แต่ไม่มีใครรู้สึกว่าเป็นงานของตัวเอง
    ฉบับนี้ส่งถึงช่างแต่ละคนพร้อมรายการของเขาเอง จึงกดดันให้ขยับได้จริง

    งานที่ยังไม่มีผู้รับผิดชอบไม่มีใครให้เตือน จึงรวบส่งให้หัวหน้าไปจ่ายงาน */
function nudgeAssignees() {
  var hours = Number(cfg_('ชั่วโมงก่อนเตือนช่าง', 24)) || 24;
  var now = Date.now();
  var cut = hours * 36e5;

  var allRows = rowsToObjects_();
  var stuck = allRows.filter(function (t) {
    if (t.status === STATUS_DONE || t.status === STATUS_WAIT ||
        t.status === STATUS_CANCEL) return false;   // ปิดแล้ว/ยกเลิกแล้ว/รอคนอื่นตรวจ ไม่ใช่งานค้างที่ช่างขยับได้
    /* ของที่ส่งออกไปซ่อมข้างนอก "ค้าง" คนละความหมาย — ระหว่างรอของตามกำหนดถือว่าปกติ
       แต่พอเลยวันรับคืนแล้วยังไม่กลับมา ต้องมีคนโทรตาม ไม่งั้นของหายไปทั้งเดือนโดยไม่มีใครรู้
       ไม่ได้ใส่กำหนดรับคืนไว้ก็เตือน เพราะแปลว่าไม่มีใครถือกำหนดอยู่เลย */
    if (t.status === STATUS_OUT) {
      var back = toDate_(t.expect_back);
      return !back || back.getTime() < now;
    }
    var since = toDate_(t.started_at) || toDate_(t.created_at);
    return since && (now - since.getTime()) >= cut;
  });
  if (!stuck.length) { Logger.log('ไม่มีงานค้างเกิน ' + hours + ' ชม.'); return 'ไม่มีงานค้าง'; }

  var byPerson = {}, orphan = [];
  stuck.forEach(function (t) {
    var names = nameList_(t.assignee);          // ใบเดียวมอบหมายหลายคนได้ ต้องเตือนทุกคน
    if (!names.length) { orphan.push(t); return; }
    names.forEach(function (n) { (byPerson[n] = byPerson[n] || []).push(t); });
  });

  var url = ticketLink_();
  function listHtml(list) {
    return '<ul>' + list.map(function (t) {
      var since = toDate_(t.started_at) || toDate_(t.created_at);
      var hrs = Math.round((now - since.getTime()) / 36e5);
      var late = t.due_at && new Date(t.due_at).getTime() < now;
      return '<li><b>' + esc_(t.ticket_id) + '</b> — ' + esc_(t.machine_name) + '<br>' +
             esc_(t.description || t.cause || '-') +
             '<br><i>ค้างมา ' + hrs + ' ชม.' + (late ? ' · <span style="color:#b91c1c">เลยกำหนดแล้ว</span>' : '') +
             ' · สถานะ ' + esc_(t.status) + '</i></li>';
    }).join('') + '</ul>';
  }

  var sent = 0;
  Object.keys(byPerson).forEach(function (name) {
    var to = emailOf_(name);
    if (!to) return;                            // ไม่มีอีเมลในชีต Users ก็ส่งไม่ได้ ข้ามไป
    var list = byPerson[name];
    sendMail_(to, 'งานค้างของคุณ ' + list.length + ' ใบ',
      '<p>สวัสดีครับ ' + esc_(name) + ' — มีงานที่มอบหมายให้คุณและค้างเกิน ' + hours + ' ชั่วโมง</p>' +
      listHtml(list) +
      '<p>ถ้าติดปัญหาให้ใส่หมายเหตุไว้ในใบ หรือแจ้งหัวหน้าเพื่อเลื่อนกำหนด</p>' +
      (url ? '<p><a href="' + url + '">เปิดระบบแจ้งซ่อม</a></p>' : ''));
    sent++;
  });

  if (orphan.length) {
    sendMail_(cfg_('อีเมลหัวหน้า', ''), 'งานค้าง ' + orphan.length + ' ใบยังไม่มีผู้รับผิดชอบ',
      '<p>ค้างเกิน ' + hours + ' ชั่วโมงแล้วแต่ยังไม่ได้จ่ายงาน</p>' + listHtml(orphan) +
      (url ? '<p><a href="' + url + '">เปิดระบบแจ้งซ่อม</a></p>' : ''));
  }

  // อ่านชีตมาแล้วรอบหนึ่ง ส่งต่อให้เลยดีกว่าปล่อยให้ไปอ่านซ้ำอีกรอบ
  var escMsg = escalateOverdue(allRows);

  var msg = 'เตือนช่าง ' + sent + ' คน · งานไม่มีผู้รับผิดชอบ ' + orphan.length + ' ใบ · ' + escMsg;
  Logger.log(msg);
  return msg;
}

/* ═══════════ ยกระดับเมื่อเลยกำหนดไปไกล ═══════════
   เดิมงานที่เลยกำหนดมี "ป้ายแดง" บนหน้าจออย่างเดียว ซึ่งแปลว่าถ้าไม่มีใครเปิดดูก็ไม่มีใครรู้
   SLA ต่อระดับความสำคัญมีอยู่แล้ว (วิกฤต 4 ชม. · ด่วน 24 · ปกติ 72) แค่ยังไม่มีอะไรเกิดขึ้นเมื่อเลย

   เกณฑ์คิดจาก "เลยกำหนดมาอีกกี่เท่าของเวลาที่ให้ไว้ตั้งแต่แรก" ไม่ใช่จำนวนชั่วโมงคงที่
   งานวิกฤตที่ให้ 4 ชม. เลยมา 8 ชม. ร้ายแรงกว่างานปกติที่ให้ 72 ชม. เลยมา 8 ชม. มาก
   ใช้ชั่วโมงคงที่เมื่อไหร่ งานปกติจะท่วมกล่องจดหมายจนงานวิกฤตจม */

/** ใบที่เลยกำหนดจนเกินเกณฑ์ — แยกเป็นฟังก์ชันของตัวเองเพื่อให้เทสต์ได้โดยไม่ต้องแตะชีต */
function escalateRows_(rows, now, mult) {
  return rows.filter(function (t) {
    if (t.status === STATUS_DONE || t.status === STATUS_CANCEL) return false;
    var created = toDate_(t.created_at);
    if (!created) return false;                 // ใบเก่าที่ไม่มีวันที่ ตัดสินไม่ได้ อย่าเดา
    var sla = slaHoursFor_(t.priority);
    // หัวหน้าเลื่อนกำหนดให้ใหม่แล้วต้องนับจากกำหนดใหม่ ไม่ใช่ย้อนไปนับจากวันแจ้งเหมือนเดิม
    var due = toDate_(t.due_at) || new Date(created.getTime() + sla * 36e5);
    return now >= due.getTime() + sla * (mult - 1) * 36e5;
  }).sort(function (a, b) { return slaHoursFor_(a.priority) - slaHoursFor_(b.priority); });
}

/** ส่งอีเมลยกระดับให้หัวหน้า — รันเองจาก editor ก็ได้ ปกติถูกเรียกท้าย nudgeAssignees() */
function escalateOverdue(rows) {
  var mult = Number(cfg_('เท่าของ SLA ก่อนแจ้งหัวหน้า', 2)) || 2;
  if (mult < 1) mult = 1;
  var list = escalateRows_(rows || rowsToObjects_(), Date.now(), mult);
  if (!list.length) { Logger.log('ไม่มีใบที่ต้องยกระดับ'); return 'ไม่มีใบที่ต้องยกระดับ'; }

  var to = String(cfg_('อีเมลหัวหน้า', '')).trim();
  if (!to) { Logger.log('ยังไม่ได้ตั้งอีเมลหัวหน้าในชีตตั้งค่า'); return 'ยังไม่ได้ตั้งอีเมลหัวหน้า'; }

  var url = ticketLink_();
  var now = Date.now();
  var body = '<p>ใบแจ้งซ่อม ' + list.length + ' ใบเลยกำหนดเสร็จมาเกิน ' + mult +
             ' เท่าของเวลาที่ให้ไว้ ต้องมีคนตัดสินใจ — เพิ่มคน เลื่อนกำหนด หรือส่งซ่อมภายนอก</p><ul>' +
    list.map(function (t) {
      var due = toDate_(t.due_at);
      var over = due ? Math.round((now - due.getTime()) / 36e5) : 0;
      return '<li><b>' + esc_(t.ticket_id) + '</b> · ' + esc_(t.priority || PRIORITY_DEFAULT) +
             ' — ' + esc_(t.machine_name) + '<br>' +
             esc_(t.description || t.cause || '-') +
             '<br><i>เลยกำหนดมา ' + over + ' ชม. · สถานะ ' + esc_(t.status) +
             ' · ผู้รับผิดชอบ ' + esc_(t.assignee || 'ยังไม่มอบหมาย') + '</i></li>';
    }).join('') + '</ul>' + (url ? '<p><a href="' + url + '">เปิดระบบแจ้งซ่อม</a></p>' : '');

  sendMail_(to, '⚠ ต้องตัดสินใจ — งานเลยกำหนดหนัก ' + list.length + ' ใบ', body);
  var msg = 'ยกระดับ ' + list.length + ' ใบให้หัวหน้า';
  Logger.log(msg);
  return msg;
}

function dailyDigest() {
  var now = Date.now();
  var open = rowsToObjects_().filter(function (t) {
    return t.status !== STATUS_DONE && t.status !== STATUS_CANCEL;
  });
  if (!open.length) return 'ไม่มีงานค้าง';

  function block(title, list) {
    if (!list.length) return '';
    return '<h3>' + title + ' (' + list.length + ')</h3><ul>' + list.map(function (t) {
      var hrs = t.created_at ? Math.round((now - new Date(t.created_at)) / 36e5) : 0;
      return '<li><b>[' + esc_(t.priority || '-') + '] ' + esc_(t.ticket_id) + '</b> — ' +
             esc_(t.machine_name) + ' — ' + esc_(t.description) +
             (t.assignee ? ' <i>(' + esc_(t.assignee) + ')</i>' : ' <i>(ยังไม่มีผู้รับผิดชอบ)</i>') +
             ' <i>ค้าง ' + hrs + ' ชม.</i></li>';
    }).join('') + '</ul>';
  }

  // เกินกำหนดดูจากวันกำหนดเสร็จของใบนั้น ไม่ใช่ SLA ค่าเดียวกันทุกใบ
  var overdue = open.filter(function (t) { return t.due_at && new Date(t.due_at).getTime() < now; });
  var critical = open.filter(function (t) { return t.priority === 'วิกฤต'; });
  var unassigned = open.filter(function (t) { return !t.assignee; });
  var waitVerify = open.filter(function (t) { return t.status === STATUS_WAIT; });
  /* ของที่ส่งออกไปซ่อมข้างนอกอยู่ในมือคนอื่น ไม่มีใครในโรงงานเห็นความคืบหน้าเอง
     nudgeAssignees() เตือนเฉพาะของที่เลยกำหนดรับคืนแล้ว ซึ่งสายไปแล้ว
     ฉบับนี้อ่านชื่อมันทุกเช้าตั้งแต่ยังไม่เลยกำหนด จะได้มีคนโทรตามก่อนของหาย */
  var outside = open.filter(function (t) { return t.status === STATUS_OUT; });
  var url = ticketLink_();

  function outBlock(list) {
    if (!list.length) return '';
    return '<h3>📦 ส่งซ่อมภายนอก (' + list.length + ')</h3><ul>' + list.map(function (t) {
      var back = toDate_(t.expect_back);
      var days = back ? Math.floor((now - back.getTime()) / 864e5) : null;
      var note = days === null
        ? '<span style="color:#b91c1c">ยังไม่ได้ใส่กำหนดรับคืน</span>'
        : days > 0 ? '<span style="color:#b91c1c">เลยกำหนดรับคืนมา ' + days + ' วัน</span>'
        : days === 0 ? '<b>ครบกำหนดรับคืนวันนี้</b>'
        : 'กำหนดรับคืน ' + thDate_(back).slice(0, 10) + ' (อีก ' + (-days) + ' วัน)';
      return '<li><b>' + esc_(t.ticket_id) + '</b> — ' + esc_(t.machine_name) + ' — ' +
             esc_(t.vendor || 'ยังไม่ได้ระบุผู้รับซ่อม') + '<br><i>' + note + '</i></li>';
    }).join('') + '</ul>';
  }

  sendMail_(cfg_('อีเมลหัวหน้า', ''), 'สรุปงานค้าง ' + thDate_(new Date()).slice(0, 10),
    '<p>งานที่ยังไม่ปิดทั้งหมด <b>' + open.length + '</b> ใบ</p>' +
    block('🚨 ระดับวิกฤต', critical) +
    block('⚠️ เลยกำหนดเสร็จ', overdue) +
    block('👤 ยังไม่มีผู้รับผิดชอบ', unassigned) +
    block('🔍 รอฝ่ายผลิตตรวจรับ', waitVerify) +
    outBlock(outside) +
    (url ? '<p><a href="' + url + '">เปิดระบบแจ้งซ่อม</a></p>' : ''));

  Logger.log('ส่งสรุปงานค้าง ' + open.length + ' ใบ');
  return 'ส่งสรุปแล้ว';
}

/* ─────────── เช็คชีตประจำวัน (Daily Check Sheet) ───────────
   คำตอบจาก Google Form ตกลงชีต Daily Check ในไฟล์เดียวกัน
   ระบบแค่อ่านมาเทียบกับทะเบียนเครื่องจักรว่าวันนี้เครื่องไหนตรวจแล้วบ้าง
   — ไม่ต้องเชื่อม API ข้ามระบบเหมือนตอนใช้ Microsoft Forms            */

function dayKey_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/* ═══ เช็คชีตประจำวัน — ไฟล์คำตอบของจริง ═══
   โมดูลนี้เขียนไว้ตอนแรกสำหรับฟอร์มชีตเดียว 5 คอลัมน์
   (ประทับเวลา · เครื่องจักร · ผู้ตรวจ · ผลการตรวจ · หมายเหตุ)

   ของจริงชื่อ "ข้อมูล Daily Check Machine" เป็นคนละไฟล์ และหน้าตาคนละเรื่อง
     · 5 ชีตตามตระกูลเครื่อง — Cut-Slot · Slot Waste · Powder Mill · EXT · UV
     · 19 ถึง 120 คอลัมน์ หนึ่งคอลัมน์ = หนึ่งข้อตรวจ ชื่อหัวเป็น "กลุ่ม [หัวข้อ]"
     · หัวคอลัมน์ซ้ำกันได้ (Cut-Slot ซ้ำ 3 คู่ · EXT ซ้ำ 4 คู่) จึงอ้างด้วย index ไม่ใช่ชื่อ
     · คำตอบมีสองระบบปนกัน "ใช่/ไม่ใช่" กับ "ปกติ/ไม่ปกติ" เพราะฟอร์มถูกแก้กลางคัน
     · ไม่มีคอลัมน์ผู้ตรวจ — ยังไม่เคยถาม จึงไม่มีทางกู้ของเก่า แต่เสียบทีหลังได้ทันที
     · "วันที่ผลิต" ให้คนพิมพ์เอง พังไป 152 แถว (ปี พ.ศ. กลายเป็น 0068/0069)
       จึงใช้ "ประทับเวลา" ที่ Google ใส่ให้เองเป็นวันที่จริง

   แทนที่จะเขียนหน้าใหม่ทั้งหน้า แปลงแถวของจริงให้หน้าตาเหมือนรูปแบบเดิมตรงนี้ที่เดียว
   apiGetDailyCheck / apiCheckScore / หน้าไทม์ไลน์ จึงใช้ต่อได้โดยไม่ต้องแก้

   อ่านอย่างเดียวเหมือนโมดูลพารามิเตอร์ ช่างยังกรอกที่ Google Form เหมือนเดิม */
var CHECK_PROP_ID = 'CHECK_SHEET_ID';

/** ไฟล์คำตอบของฟอร์ม — ไม่ได้ตั้ง property ก็ใช้ชีตในไฟล์ CMMS แบบเดิม */
function checkSS_() {
  var id = prop_(CHECK_PROP_ID);
  return id ? SpreadsheetApp.openById(id) : ss_();
}

var CHECK_META = {
  ts:      ['ประทับเวลา', 'timestamp'],
  machine: ['เครื่องจักร', 'machine'],
  by:      ['ผู้ตรวจ', 'ผู้บันทึก', 'ชื่อผู้ตรวจ', 'อีเมล', 'email', 'ที่อยู่อีเมล'],
  shift:   ['กะทำงาน', 'กะ', 'shift'],
  day:     ['วันที่ผลิต', 'วันที่'],
  photo:   ['เพิ่มรูป', 'รูป', 'หลักฐาน'],
  status:  ['status machine', 'สถานะเครื่องจักร']
};

/** หาคอลัมน์ประจำแถวจากหัวตาราง — คืน index ตัวแรกที่ชื่อขึ้นต้น/มีคำที่รู้จัก
    ข้อตรวจทุกข้อมีวงเล็บเหลี่ยมเสมอ ("กลุ่ม [หัวข้อ]") จึงกันไม่ให้ถูกจับเป็นคอลัมน์ประจำแถว */
function checkMeta_(head) {
  var m = {};
  var low = head.map(function (h) { return String(h || '').trim().toLowerCase(); });
  Object.keys(CHECK_META).forEach(function (k) {
    m[k] = -1;
    for (var i = 0; i < low.length; i++) {
      if (low[i].indexOf('[') > -1) continue;
      for (var j = 0; j < CHECK_META[k].length; j++) {
        if (low[i].indexOf(CHECK_META[k][j].toLowerCase()) > -1) { m[k] = i; return; }
      }
    }
  });
  return m;
}

/** "กลุ่ม [หัวข้อ]" -> {group, label} · ไม่มีวงเล็บ = ไม่ใช่ข้อตรวจ */
function checkItemHead_(h) {
  var t = String(h || '').trim();
  var i = t.indexOf('[');
  if (i < 0 || t.charAt(t.length - 1) !== ']') return null;
  return { group: t.slice(0, i).trim() || 'ทั่วไป', label: t.slice(i + 1, -1).trim() };
}

/* "ใช่" กับ "ปกติ" คือผ่าน · "ไม่ใช่" กับ "ไม่ปกติ" คือไม่ผ่าน
   เช็ค "ไม่" ก่อนเสมอ เพราะ "ไม่ปกติ" มีคำว่า "ปกติ" อยู่ข้างใน
   ช่องว่าง = ข้อนั้นไม่ได้อยู่ในแบบฟอร์มของเครื่องนี้ ไม่ใช่ "ไม่ได้ตรวจ" */
function checkAnswer_(v) {
  var t = String(v == null ? '' : v).trim();
  if (!t) return '';
  if (t.indexOf('ไม่ปกติ') > -1 || t.indexOf('ไม่ใช่') > -1) return 'bad';
  if (t.indexOf('ปกติ') > -1 || t.indexOf('ใช่') > -1) return 'ok';
  return 'note';                       // ตัวเลข/ข้อความ เช่น น้ำหนักสีของ UV
}

/** ชีตคำตอบทุกใบ — ต้องมีทั้งคอลัมน์เครื่องจักรและเวลา ไม่งั้นไม่ใช่ชีตคำตอบ */
function checkFormSheets_() {
  var out = [];
  checkSS_().getSheets().forEach(function (sh) {
    if (sh.getLastRow() < 2 || sh.getLastColumn() < 3) return;
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var m = checkMeta_(head);
    if (m.machine > -1 && m.ts > -1) out.push({ sh: sh, head: head, meta: m });
  });
  return out;
}

/** อ่านไฟล์จริงทั้ง 5 ชีตแล้วแปลงเป็นรูปแบบเดิม — กรองด้วยวันของ "ประทับเวลา" */
function checkFormRows_(fromKey, toKey) {
  var out = [];
  checkFormSheets_().forEach(function (x) {
    var vals = x.sh.getDataRange().getValues();
    vals.shift();
    var m = x.meta, head = x.head;

    vals.forEach(function (r, idx) {
      var ts = toDate_(r[m.ts]);
      if (!ts) return;
      var key = dayKey_(ts);
      if (key < fromKey || key > toKey) return;

      var items = [], bad = 0, done = 0;
      head.forEach(function (h, i) {
        var def = checkItemHead_(h);
        if (!def) return;
        var a = checkAnswer_(r[i]);
        if (!a) return;                 // ข้อที่ไม่ใช่ของเครื่องนี้
        done++;
        if (a === 'bad') bad++;
        items.push({ group: def.group, label: def.label, value: String(r[i]).trim(), state: a });
      });

      var status = m.status > -1 ? String(r[m.status] || '').trim() : '';
      var o = {
        'ประทับเวลา': ts,
        'เครื่องจักร': m.machine > -1 ? String(r[m.machine] || '').trim() : '',
        /* ยังไม่มีคอลัมน์ผู้ตรวจในฟอร์ม — ปล่อยว่างไว้ ไม่เดา
           วันที่ฟอร์มเพิ่มคำถามนี้ โค้ดตรงนี้รับได้ทันทีโดยไม่ต้องแก้ */
        'ผู้ตรวจ': m.by > -1 ? String(r[m.by] || '').trim() : '',
        'ผลการตรวจ': bad ? 'ผิดปกติ' : (status || 'ปกติ'),
        'หมายเหตุ': status,
        __ts: ts, __sheet: x.sh.getName(), __row: idx + 2,
        __bad: bad, __done: done, __items: items,
        __shift: m.shift > -1 ? String(r[m.shift] || '').trim() : '',
        __photo: m.photo > -1 ? String(r[m.photo] || '').trim() : ''
      };
      out.push(o);
    });
  });

  out.sort(function (a, b) { return a.__ts - b.__ts; });
  return out;
}

/**
 * อ่านเฉพาะแถวท้าย ๆ ของชีต Daily Check
 * Form เขียนต่อท้ายตามเวลาอยู่แล้ว จึงไล่จากล่างขึ้นบนแล้วหยุดเมื่อเจอวันเก่ากว่าเป้าหมาย
 * ปีนึงมี 35 เครื่อง × 365 วัน ≈ 12,000 แถว ถ้าอ่านทั้งชีตทุกครั้งจะช้าขึ้นเรื่อย ๆ
 */
function readCheckRowsFor_(target) { return readCheckRange_(target, target); }

/** เหมือนกัน แต่รับช่วงวัน — ไทม์ไลน์ต้องย้อนหลายวัน ไม่ใช่วันเดียว
    ยังไล่จากล่างขึ้นบนและหยุดเมื่อพ้นช่วงเหมือนเดิม จึงไม่ได้อ่านทั้งชีตอยู่ดี */
function readCheckRange_(fromKey, toKey) {
  /* ตั้ง CHECK_SHEET_ID เมื่อไร = ใช้ไฟล์คำตอบของจริง ไม่ได้ตั้งก็ใช้ชีตเดิมในไฟล์ CMMS
     แยกสองทางแทนที่จะบังคับให้ไฟล์เก่าย้ายมา เพราะชีตเดิมยังมีคนใช้อยู่ */
  if (prop_(CHECK_PROP_ID)) {
    try { return checkFormRows_(fromKey, toKey); } catch (e) { return []; }
  }
  var sh;
  try { sh = sheet_(SHEET_CHECK); } catch (e) { return []; }
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  var lastCol = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var CHUNK = 500;
  var out = [];
  var cursor = lastRow;

  while (cursor >= 2) {
    var startRow = Math.max(2, cursor - CHUNK + 1);
    var block = sh.getRange(startRow, 1, cursor - startRow + 1, lastCol).getValues();
    var reachedOlder = false;

    for (var i = block.length - 1; i >= 0; i--) {
      var o = {};
      head.forEach(function (h, j) { if (h) o[h] = block[i][j]; });

      // คอลัมน์แรกของ Google Form คือเวลาที่ส่ง ไม่ว่าจะชื่อ Timestamp หรือ ประทับเวลา
      var ts = toDate_(o['ประทับเวลา'] || o['Timestamp'] || block[i][0]);
      if (!ts) continue;
      var key = dayKey_(ts);
      if (key >= fromKey && key <= toKey) { o.__ts = ts; out.push(o); }
      else if (key < fromKey) { reachedOlder = true; break; }
    }
    if (reachedOlder) break;
    cursor = startRow - 1;
  }
  return out;
}

/**
 * @param {string} dateStr วันที่รูปแบบ yyyy-MM-dd (เว้นว่าง = วันนี้)
 */
/* ═══ เช็คชีตประจำวันรายคน — ใช้วัดผลงาน "ช่างเทคนิคควบคุมเครื่องจักร" ═══
   ตำแหน่งนี้ไม่ได้ซ่อมเครื่อง จึงวัดด้วยใบแจ้งซ่อมไม่ได้เลย งานจริงของเขาคือ
   เดินตรวจเครื่องทุกวันและจับความผิดปกติให้ได้ก่อนเครื่องพัง

   ของพวกนี้มีอยู่ในชีต "Daily Check" อยู่แล้ว (ฟอร์มเขียนเข้ามาเอง) แค่ยังไม่มีใครสรุป
   ใช้ readCheckRange_ ตัวเดิมที่หน้าไทม์ไลน์ใช้อยู่ ไม่ต้องอ่านชีตใหม่

   คืน "จำนวนครั้ง" ไม่ใช่เปอร์เซ็นต์ เพราะตัวหาร (ควรตรวจกี่ครั้ง) ขึ้นกับตารางเวรที่ระบบไม่มี
   ฝั่งหน้าเว็บจะเอาไปเทียบกับ จำนวนเครื่อง × จำนวนวัน เองเป็นค่าประมาณ และบอกไว้ว่าเป็นค่าประมาณ */
function apiCheckScore(token, fromKey, toKey) {
  requireAuth_(token, 'LEAD');
  var colBy     = String(cfg_('คอลัมน์ผู้ตรวจ', 'ผู้ตรวจ'));
  var colResult = String(cfg_('คอลัมน์ผลการตรวจ', 'ผลการตรวจ'));
  var colMach   = String(cfg_('คอลัมน์เครื่องจักร', 'เครื่องจักร'));
  var badWord   = String(cfg_('คำว่าผิดปกติ', 'ผิดปกติ'));

  var by = {}, days = {}, machines = {};
  readCheckRange_(fromKey, toKey).forEach(function (r) {
    var who = canonTech_(r[colBy]);                 // ชื่อผู้ตรวจต้องผ่านตารางชื่อเดิมเหมือนช่องอื่น
    if (!who) return;
    var rec = by[who] || (by[who] = { name: who, checks: 0, abnormal: 0, machines: {}, days: {} });
    rec.checks++;
    if (badWord && String(r[colResult] || '').indexOf(badWord) > -1) rec.abnormal++;
    var m = canonical_(r[colMach]); if (m) { rec.machines[m] = 1; machines[m] = 1; }
    var d = dayKey_(r.__ts);       if (d) { rec.days[d] = 1; days[d] = 1; }
  });

  return {
    from: fromKey, to: toKey,
    machines: Object.keys(machines).length,
    days: Object.keys(days).length,
    people: Object.keys(by).map(function (n) {
      var r = by[n];
      return { name: r.name, checks: r.checks, abnormal: r.abnormal,
               machines: Object.keys(r.machines).length, days: Object.keys(r.days).length };
    })
  };
}

/* ═══ รายละเอียดการตรวจของเครื่องเดียว ═══
   การ์ดบอกได้แค่ "ตรวจแล้ว/ยังไม่ตรวจ/เจอผิดปกติ" ซึ่งไม่พอจะทำอะไรต่อ
   คนที่เห็นว่าเครื่องผิดปกติต้องรู้ว่า "ข้อไหน" ถึงจะตัดสินใจได้ว่าเปิดใบแจ้งซ่อมไหม */
function apiCheckDetail(token, machine, dateStr) {
  requireAuth_(token);
  var target = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || '')) ? dateStr : dayKey_(new Date());
  var want = canonical_(machine);

  var rows = readCheckRange_(target, target).filter(function (r) {
    return canonical_(r['เครื่องจักร']) === want;
  });
  if (!rows.length) {
    return { machine: want, date: target, found: false, groups: [], bad: [] };
  }

  // รอบล่าสุดของวันนั้น — ตรวจซ้ำรอบบ่ายต้องทับรอบเช้า
  var r = rows[rows.length - 1];
  var items = r.__items || [];

  var order = [], byGroup = {};
  items.forEach(function (it) {
    if (!byGroup[it.group]) { byGroup[it.group] = { group: it.group, items: [] }; order.push(byGroup[it.group]); }
    byGroup[it.group].items.push({ label: it.label, value: it.value, state: it.state });
  });

  return {
    machine: want, raw: r['เครื่องจักร'], date: target, found: true,
    at: r.__ts ? r.__ts.toISOString() : '',
    by: r['ผู้ตรวจ'] || '', shift: r.__shift || '', status: r['หมายเหตุ'] || '',
    photo: r.__photo || '',
    sheet: r.__sheet || '', row: r.__row || 0,
    total: items.length, done: r.__done || 0, badCount: r.__bad || 0,
    groups: order,
    bad: items.filter(function (x) { return x.state === 'bad'; })
              .map(function (x) { return x.group + ' — ' + x.label; }),
    /* กี่รอบในวันเดียวกัน — เครื่องที่ตรวจสองกะต้องไม่ดูเหมือนตรวจรอบเดียว */
    rounds: rows.length
  };
}

/** เปิดใบแจ้งซ่อมจากข้อที่ไม่ผ่าน — คนกดเอง ไม่ใช่ระบบเปิดให้อัตโนมัติ
    "ไฟสถานะไม่ติด" บางครั้งคือหลอดขาดที่เปลี่ยนเองจบ ไม่ใช่งานซ่อม
    ใบที่เปิดทิ้งไว้เองทำให้สถิติงานเสียเพี้ยน และไม่มีใครกล้าปิด */
function apiCheckMakeTicket(token, machine, dateStr, payload) {
  var user = requireAuth_(token);
  payload = payload || {};
  var d = apiCheckDetail(token, machine, dateStr);
  if (!d.found) throw new Error('ยังไม่มีผลการตรวจของเครื่องนี้ในวันที่เลือก');
  if (!d.bad.length) throw new Error('การตรวจรอบล่าสุดของเครื่องนี้ไม่มีข้อที่ไม่ผ่าน');

  var name = assertKnownMachine_(d.machine);
  var lines = d.bad.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n');

  var res = apiCreateTicket({
    department: 'ฝ่ายซ่อมบำรุง',
    reporter: user.name,
    work_type: 'เครื่องจักร',
    machine_name: name,
    description: 'พบจากเช็คชีตประจำวัน ' + thDate_(d.date) +
      (d.by ? ' โดย ' + d.by : '') + ' — ไม่ผ่าน ' + d.bad.length + ' ข้อ\n' + lines,
    cause: String(payload.cause || ''),
    action_needed: String(payload.action_needed || 'ต้องการเรียกช่างซ่อมบำรุง'),
    priority: PRIORITIES.filter(function (x) { return x.key === payload.priority; }).length
      ? payload.priority : PRIORITY_DEFAULT,
    source: 'เช็คชีตประจำวัน'
  });

  /* ISO: ต้องตามจากใบแจ้งซ่อมกลับไปหาแถวต้นทางได้ จึงเก็บชื่อชีตกับเลขแถวไว้ด้วย */
  writeAudit_('เปิดใบแจ้งซ่อมจากเช็คชีต',
    name + ' ' + d.date + ' (' + d.sheet + ' แถว ' + d.row + ') -> ' + res.ticket_id,
    [], user.name);
  return { ok: true, ticket_id: res.ticket_id };
}

/* หน้านี้อยู่ในรายการที่ต้องล็อกอิน แต่ API กลับไม่ขอ token
   ใครมีลิงก์ /exec ก็ดึงผลตรวจทั้งโรงงานได้ รวมถึงข้อที่ไม่ผ่านและชื่อคนตรวจ */
var CACHE_KEY_CHKFORM = 'chkform_v1';

/** ชื่อเครื่อง (ตัวเล็ก) -> ลิงก์กรอกฟอร์มของตระกูลนั้น

    ฟอร์มเช็คชีตมี 5 ใบแบ่งตามตระกูลเครื่อง ช่างที่เปิดการ์ด "Cut-Slot 2"
    ต้องไปโผล่ใบของ Cut-Slot ไม่ใช่ลิงก์กลาง ๆ ใบเดียวแล้วให้เดาเองว่าใบไหน

    เปิดฟอร์ม 5 ใบทุกครั้งที่โหลดหน้าแพงเกินไป จึงเก็บแคชไว้ 6 ชม.
    เปิดไม่ได้ (ไม่มีสิทธิ์แก้ฟอร์ม) ก็คืนค่าว่าง แล้วหน้าจอถอยไปใช้ลิงก์กลางจากชีตตั้งค่า */
var checkFormUrlCache_ = null;
function checkFormUrls_() {
  if (checkFormUrlCache_) return checkFormUrlCache_;
  /* แคชล่มไม่ใช่เหตุให้หน้าเช็คชีตตายทั้งหน้า อย่างมากก็แค่ช้าลง */
  var cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) {}
  if (cache) {
    var hit = cache.get(CACHE_KEY_CHKFORM);
    if (hit) { try { return (checkFormUrlCache_ = JSON.parse(hit)); } catch (e) {} }
  }

  var out = {};
  try {
    checkFormSheets_().forEach(function (x) {
      var n = x.sh.getLastRow() - 1;
      if (n < 1) return;
      var url;
      try { url = FormApp.openByUrl(x.sh.getFormUrl()).getPublishedUrl(); }
      catch (e) { return; }
      x.sh.getRange(2, x.meta.machine + 1, n, 1).getValues().forEach(function (r) {
        var v = canonical_(r[0]);
        if (v) out[v.toLowerCase()] = url;
      });
    });
  } catch (e) { return {}; }

  if (cache) { try { cache.put(CACHE_KEY_CHKFORM, JSON.stringify(out), CACHE_SEC_FORM); } catch (e) {} }
  return (checkFormUrlCache_ = out);
}

function apiGetDailyCheck(token, dateStr) {
  requireAuth_(token);
  var target = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || '')) ? dateStr : dayKey_(new Date());
  var colMachine = String(cfg_('คอลัมน์เครื่องจักร', 'เครื่องจักร'));
  var colBy      = String(cfg_('คอลัมน์ผู้ตรวจ', 'ผู้ตรวจ'));
  var colResult  = String(cfg_('คอลัมน์ผลการตรวจ', 'ผลการตรวจ'));
  var badWord    = String(cfg_('คำว่าผิดปกติ', 'ผิดปกติ'));

  var done = {};
  readCheckRowsFor_(target).forEach(function (r) {
    var name = canonical_(r[colMachine]);
    if (!name) return;
    var result = String(r[colResult] || '');
    var prev = done[name];
    if (prev && new Date(prev.at) > r.__ts) return;     // เก็บผลล่าสุดของวันนั้น
    done[name] = {
      at: r.__ts.toISOString(),
      by: String(r[colBy] || ''),
      result: result,
      /* จำนวนข้อที่ไม่ผ่าน — ไฟล์เก่าไม่มีรายข้อ จึงเป็น 0 แล้วการ์ดถอยไปใช้ข้อความแทน */
      badCount: Number(r.__bad || 0),
      done: Number(r.__done || 0),
      shift: String(r.__shift || ''),
      abnormal: !!(badWord && result.indexOf(badWord) > -1)
    };
  });

  var urls = checkFormUrls_();
  var list = machines_().map(function (m) {
    var d = done[m.name];
    return {
      name: m.name, code: m.code, group: m.group, location: m.location,
      formUrl: urls[String(m.name).toLowerCase()] || '',
      checked: !!d, at: d ? d.at : '', by: d ? d.by : '',
      result: d ? d.result : '', abnormal: d ? d.abnormal : false,
      badCount: d ? d.badCount : 0, done: d ? d.done : 0, shift: d ? d.shift : ''
    };
  });

  return {
    date: target,
    formUrl: String(cfg_('ลิงก์ฟอร์มเช็คชีต', '')),
    /* ฟอร์มยังไม่ได้ถามว่าใครเป็นคนตรวจ — ต้องบอกไว้ ไม่ใช่โชว์ช่องว่างเปล่า ๆ
       แล้วปล่อยให้คนเข้าใจว่าช่างลืมกรอก */
    noWho: list.every(function (x) { return !x.by; }),
    external: !!prop_(CHECK_PROP_ID),
    machines: list,
    total: list.length,
    checked: list.filter(function (x) { return x.checked; }).length,
    abnormal: list.filter(function (x) { return x.abnormal; }).length
  };
}
function repairSeq_(rows, t) {
  if (!t.machine_name) return '';
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].machine_name !== t.machine_name) continue;
    if (String(rows[i].created_at) <= String(t.created_at)) n++;
  }
  return n || '';
}

function fmDate_(v) {
  var d = toDate_(v);
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'd / M / ') + (d.getFullYear() + 543);
}

/** ปี พ.ศ. สองหลัก สำหรับช่องแคบ ๆ ในตารางระยะเวลาซ่อม */
function fmDateS_(v) {
  var d = toDate_(v);
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'd/M/') + String(d.getFullYear() + 543).slice(-2);
}

function fmTime_(v) {
  var d = toDate_(v);
  return d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH : mm') : '';
}

/** ตัดข้อความยาวลงบรรทัดประ ให้เต็มจำนวนบรรทัดที่ฟอร์มมี ไม่งั้นกรอบจะยุบ */
function fmLines_(text, perLine, total, prefix) {
  var words = String(text || '').replace(/\s+/g, ' ').trim();
  var out = [];
  if (prefix) words = prefix + words;
  while (words.length > perLine) {
    var cut = words.lastIndexOf(' ', perLine);
    if (cut < perLine * 0.5) cut = perLine;        // ภาษาไทยไม่มีเว้นวรรค ตัดตรง ๆ
    out.push(words.slice(0, cut));
    words = words.slice(cut).trim();
  }
  if (words) out.push(words);
  out = out.slice(0, total);
  while (out.length < total) out.push('&nbsp;');
  return out.map(function (l) { return '<div class="dt">' + l + '</div>'; }).join('');
}

function cbox_(on) {
  return '<span class="cb">' + (on ? '&#10004;' : '&nbsp;') + '</span>';
}

function apiTicketPdf(token, ticketId) {
  var actor = requireAuth_(token);

  var rows = rowsToObjects_();
  var t = null;
  for (var i = 0; i < rows.length; i++) if (rows[i].ticket_id === ticketId) t = rows[i];
  if (!t) throw new Error('ไม่พบใบแจ้งซ่อม ' + ticketId);

  /* ดึงรหัสเครื่องและอาคารจากทะเบียน — ฟอร์มมีช่องนี้แต่ใบแจ้งซ่อมไม่ได้เก็บไว้ */
  var info = null;
  machines_().forEach(function (m) { if (m.name === t.machine_name) info = m; });

  var wt = String(t.work_type || '');
  var isBuild   = wt === 'งานสร้างใหม่';
  var isMachine = wt.indexOf('เครื่องจักร') > -1;
  var isEquip   = wt.indexOf('อุปกรณ์') > -1;
  var isRepair  = !isBuild;                       // ทุกอย่างที่ไม่ใช่งานสร้างใหม่ = งานซ่อม
  var other     = (!isBuild && !isMachine && !isEquip) ? wt : '';

  var vs = String(t.verification_status || '');
  var passed   = vs && vs.indexOf('ส่งกลับ') === -1;
  var rejected = vs.indexOf('ส่งกลับ') > -1;

  var mins = Number(t.repair_minutes) || 0;
  var days = mins ? Math.floor(mins / 1440) : '';
  var hrs  = mins ? Math.round((mins % 1440) / 60 * 100) / 100 : '';

  var techs = String(t.technician || '').split(/[,และ\/]+/)
                .map(function (x) { return x.trim(); }).filter(String);
  var tech = function (n) { return techs[n] ? esc_(techs[n]) : ''; };

  /* ใบเก่ากรอกอาการไว้ในช่องสาเหตุ ต้องตกกลับเหมือนหน้าเว็บ ไม่งั้นช่องนี้ว่าง */
  var symptom = t.description || t.cause;
  var rootCause = (t.description && t.cause) ? t.cause : '';

  var remark = [];
  if (t.pr_no) remark.push('เลขที่ PR (ERP): ' + t.pr_no);
  if (Number(t.cost)) remark.push('ค่าใช้จ่ายรวม ' + Number(t.cost).toLocaleString('th-TH') + ' บาท');
  if (t.rejection_note) remark.push('ส่งกลับแก้ไขครั้งที่ ' + (Number(t.reject_count) || 1) + ': ' + t.rejection_note);
  if (t.source && t.source !== 'แจ้งซ่อม') remark.push('ที่มา: ' + t.source);
  if (t.image_url) remark.push('รูปประกอบ: ' + t.image_url);

  var html =
  '<meta charset="utf-8"><style>' +
  '@page{size:A4 portrait;margin:8mm}' +
  /* อย่าเปลี่ยนลำดับฟอนต์ชุดนี้ — TH SarabunPSK บางเครื่องเรนเดอร์เลขเป็นเลขไทย ๑๒๓
     ซึ่งฝ่ายบัญชีอ่านแล้วสับสน ชุดนี้ให้เลขอารบิกแน่นอน */
  'body{font-family:"Sarabun","TH Sarabun New","Noto Sans Thai",sans-serif;color:#000;margin:0}' +
  'table{border-collapse:collapse;width:100%;table-layout:fixed}' +
  'td{border:1px solid #000;padding:3px 5px;vertical-align:top;word-wrap:break-word;' +
     'font-size:11px;line-height:1.35}' +
  '.l{text-align:center;font-size:9px;line-height:1.25}' +
  '.ll{font-size:9px;line-height:1.25}' +
  '.c{text-align:center}' +
  '.v{height:17px;text-align:center;font-size:11.5px}' +
  '.g{background:#d9d9d9;font-weight:700;text-align:center;font-size:10px}' +
  '.n{border:none}.nt{border-top:none}.nb{border-bottom:none}' +
  '.cb{display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;' +
      'line-height:11px;font-size:10px;vertical-align:-1px}' +
  '.dt{border-bottom:1px dotted #666;min-height:17px;font-size:11.5px;line-height:1.5}' +
  '.tg{border:1px solid #000;padding:1px 10px;font-size:9.5px;display:inline-block}' +
  '.sg{height:26px;text-align:center;font-size:11.5px}' +
  '</style>' +

  '<table><colgroup><col span="43" style="width:2.3255%"></colgroup>' +

  '<tr><td colspan="9" style="padding:5px 6px;vertical-align:middle">' +
  '<img src="' + FORM_LOGO + '" style="height:30px"></td>' +
  '<td colspan="34" style="text-align:center;vertical-align:middle;font-size:21px;font-weight:700">' +
  'ใบแจ้งซ่อม</td></tr>' +

  '<tr><td colspan="14" class="l">หมายเลขใบแจ้งซ่อม</td><td colspan="11" class="l">ซ่อมครั้งที่</td>' +
  '<td colspan="9" class="l">วันที่แจ้ง</td><td colspan="9" class="l">เวลาที่แจ้ง</td></tr>' +
  '<tr><td colspan="14" class="v">' + esc_(t.ticket_id) + '</td>' +
  '<td colspan="11" class="v">' + repairSeq_(rows, t) + '</td>' +
  '<td colspan="9" class="v">' + fmDate_(t.created_at) + '</td>' +
  '<td colspan="9" class="v">' + fmTime_(t.created_at) + '</td></tr>' +

  '<tr><td colspan="14" class="l">หน่วยงานที่แจ้งซ่อม</td>' +
  '<td colspan="11" class="v">' + esc_(t.department) + '</td>' +
  '<td colspan="9" class="l">วันที่ต้องการ</td>' +
  '<td colspan="9" class="v">' + fmDate_(t.due_at) + '</td></tr>' +

  '<tr><td colspan="9" rowspan="2" class="l" style="vertical-align:middle"><b>ลักษณะงาน</b> &#10132;</td>' +
  '<td colspan="2" class="c">' + cbox_(isRepair) + '</td><td colspan="4" class="ll n">งานซ่อม</td>' +
  '<td colspan="2" class="c">' + cbox_(isBuild) + '</td><td colspan="4" class="ll n">งานสร้าง</td>' +
  '<td colspan="2" class="c">' + cbox_(false) + '</td><td colspan="4" class="ll n">Jig</td>' +
  '<td colspan="2" class="c">' + cbox_(!!other) + '</td>' +
  '<td colspan="14" class="ll n">Other ' + (esc_(other) || '&#8230;&#8230;&#8230;&#8230;&#8230;&#8230;') + '</td></tr>' +
  '<tr><td colspan="2" class="c">' + cbox_(isEquip) + '</td><td colspan="4" class="ll n">อุปกรณ์</td>' +
  '<td colspan="6" class="n"></td>' +
  '<td colspan="2" class="c">' + cbox_(isMachine) + '</td><td colspan="20" class="ll n">เครื่องจักร</td></tr>' +

  '<tr><td colspan="9" class="ll">ชื่อเครื่องจักร/อุปกรณ์</td>' +
  '<td colspan="14" style="height:15px">' + esc_(t.machine_name) + '</td>' +
  '<td colspan="8" class="ll">หมายเลขเครื่องจักร/อุปกรณ์</td>' +
  '<td colspan="12">' + (info ? esc_(info.code) : '') + '</td></tr>' +
  '<tr><td colspan="9" class="ll">สถานที่ซ่อม</td>' +
  '<td colspan="14" style="height:15px">' + (info ? esc_(info.location) : '') + '</td>' +
  '<td colspan="8" class="ll">ปัญหาที่พบ</td>' +
  '<td colspan="12"></td></tr>' +

  '<tr><td colspan="43" class="ll nb"><u>อาการเสีย/ลักษณะงาน</u></td></tr>' +
  '<tr><td colspan="43" class="nt" style="padding:3px 5px">' +
  fmLines_(symptom, 110, 3, '') +
  fmLines_(t.action_needed, 110, 1, t.action_needed ? 'ความต้องการ: ' : '') + '</td></tr>' +

  '<tr><td colspan="9" class="l">ผู้แจ้งซ่อม</td><td colspan="9" class="l">หัวหน้างาน/ผู้จัดการ</td>' +
  '<td colspan="2" class="c n" style="vertical-align:middle">&#10132;</td>' +
  '<td colspan="8" class="l">ซ่อมบำรุงรับเรื่อง</td><td colspan="8" class="l">กำหนดการซ่อมบำรุง</td>' +
  '<td colspan="7" class="l">ผู้แจ้งซ่อมรับทราบ</td></tr>' +
  '<tr><td colspan="9" class="sg">' + esc_(t.reporter) + '</td><td colspan="9" class="sg"></td>' +
  '<td colspan="2" class="n"></td><td colspan="8" class="sg">' + esc_(t.assignee) + '</td>' +
  '<td colspan="8" class="sg">' + fmDate_(t.due_at) + '</td><td colspan="7" class="sg"></td></tr>' +

  '<tr><td colspan="43" class="g">สรุปผลการดำเนินการตรวจสอบและซ่อมอาการเสีย</td></tr>' +

  '<tr><td colspan="19" rowspan="3" style="padding:3px 5px">' +
  '<div class="ll" style="margin-bottom:4px">รายชื่อผู้ซ่อม</div>' +
  '<table style="border:none"><tr>' +
  '<td class="n dt" style="width:50%">1. ' + tech(0) + '</td><td class="n dt">3. ' + tech(2) + '</td></tr>' +
  '<tr><td class="n dt">2. ' + tech(1) + '</td><td class="n dt">4. ' + tech(3) + '</td></tr></table></td>' +
  '<td colspan="16" class="l nb">ระยะเวลาซ่อม</td><td colspan="2" class="n"></td>' +
  '<td colspan="6" class="l nb">รวมระยะเวลาซ่อมจริง</td></tr>' +
  '<tr><td colspan="4" class="l">วันที่เริ่ม</td><td colspan="4" class="l">เวลา</td>' +
  '<td colspan="4" class="l">วันที่เสร็จ</td><td colspan="4" class="l">เวลา</td>' +
  '<td colspan="2" class="c n" style="vertical-align:middle">&#10132;</td>' +
  '<td colspan="3" class="l">วัน</td><td colspan="3" class="l">ชั่วโมง</td></tr>' +
  '<tr><td colspan="4" class="v">' + fmDateS_(t.started_at) + '</td>' +
  '<td colspan="4" class="v">' + fmTime_(t.started_at) + '</td>' +
  '<td colspan="4" class="v">' + fmDateS_(t.completed_at) + '</td>' +
  '<td colspan="4" class="v">' + fmTime_(t.completed_at) + '</td>' +
  '<td colspan="2" class="n"></td><td colspan="3" class="v">' + days + '</td>' +
  '<td colspan="3" class="v">' + hrs + '</td></tr>' +

  '<tr><td colspan="31" class="c nb" style="padding-top:3px"><span class="tg">บันทึกผลการซ่อม</span></td>' +
  '<td colspan="12" class="c nb" style="padding-top:3px"><span class="tg">อุปกรณ์และอะไหล่</span></td></tr>' +
  '<tr><td colspan="31" class="nt" style="padding:3px 5px">' +
  fmLines_(rootCause, 68, 3, 'สาเหตุ&#8230; ') + fmLines_(t.repair_action, 68, 4, 'การแก้ไข&#8230; ') +
  '</td><td colspan="12" class="nt" style="padding:3px 5px">' +
  '<div class="dt">1. </div><div class="dt">2. </div><div class="dt">3. </div><div class="dt">4. </div>' +
  '<div class="dt">5. </div><div class="dt">6. </div><div class="dt">7. </div><div class="dt">8. </div>' +
  '<div class="dt">9. </div><div class="dt">10. </div></td></tr>' +

  '<tr><td colspan="9" class="g">การทดสอบ</td><td colspan="18" class="ll">วิธีทดสอบ</td>' +
  '<td colspan="7" class="l">ผู้ควบคุมงาน/ส่งมอบ</td><td colspan="5" class="l">วันที่ส่งมอบ</td>' +
  '<td colspan="4" class="l">เวลา</td></tr>' +
  '<tr><td colspan="9" class="ll">' + cbox_(passed) + ' ผ่าน</td>' +
  '<td colspan="18" rowspan="3" style="padding:3px 5px">' +
  '<div class="dt">&nbsp;</div><div class="dt">&nbsp;</div><div class="dt">&nbsp;</div></td>' +
  '<td colspan="7" class="sg">' + esc_(t.technician) + '</td>' +
  '<td colspan="5" class="sg">' + fmDateS_(t.completed_at) + '</td>' +
  '<td colspan="4" class="sg">' + fmTime_(t.completed_at) + '</td></tr>' +
  '<tr><td colspan="9" class="ll">' + cbox_(rejected) + ' ไม่ผ่าน</td>' +
  '<td colspan="7" class="l">ผู้รับมอบ</td><td colspan="5" class="l">วันที่รับมอบ</td>' +
  '<td colspan="4" class="l">เวลา</td></tr>' +
  '<tr><td colspan="9" class="ll">' + cbox_(!vs) + ' ไม่จำเป็น</td>' +
  '<td colspan="7" class="sg">' + esc_(t.verified_by) + '</td>' +
  '<td colspan="5" class="sg">' + fmDateS_(t.verified_at) + '</td>' +
  '<td colspan="4" class="sg">' + fmTime_(t.verified_at) + '</td></tr>' +
  '<tr><td colspan="9" class="n"></td><td colspan="18" class="n"></td>' +
  '<td colspan="7" class="l">ผู้อนุมัติ</td><td colspan="5" class="l">วันที่</td>' +
  '<td colspan="4" class="l"></td></tr>' +
  '<tr><td colspan="9" class="g">Remark</td><td colspan="18" class="n"></td>' +
  '<td colspan="7" class="sg"></td><td colspan="5" class="sg"></td><td colspan="4" class="sg"></td></tr>' +
  '<tr><td colspan="43" style="padding:3px 5px">' + fmLines_(remark.join('  |  '), 110, 3, '') + '</td></tr>' +
  '</table>' +
  '<div style="font-size:8.5px;margin-top:3px">' + FORM_CODE + '</div>';

  var fname = t.ticket_id.replace(/\//g, '-');
  var pdf = Utilities.newBlob(html, 'text/html', fname + '.html')
                     .getAs('application/pdf')
                     .setName('FM-MT-04 ' + fname + '.pdf');

  writeAudit_('ออกเอกสาร FM-MT-04', t.ticket_id, [], actor.name);
  return { name: pdf.getName(), base64: Utilities.base64Encode(pdf.getBytes()) };
}

/* ═══════════ ใบงาน PM (FM-MT-05) ═══════════
   ใบแจ้งซ่อม FM-MT-04 ตอบคำถาม "ของพังแล้วซ่อมยังไง" ซึ่งเป็นเอกสารหลังเกิดเหตุ
   งาน PM เป็นคนละเรื่อง — ช่างต้องถือกระดาษเข้าไปหน้าเครื่องแล้วไล่ตรวจทีละหัวข้อ
   เอกสารจึงต้องเป็น "รายการที่ต้องทำ" พร้อมช่องให้ติ๊ก ไม่ใช่ช่องเขียนบรรยายเปล่า ๆ

   ── หัวข้อตรวจเก็บที่ชีต "แผน PM" ที่เดียว ──
   ไม่ได้ก๊อปลงทุกแถวใน "ตาราง PM" ตอนกางแผน เพราะแก้หัวข้อทีเดียวต้องมีผลกับทุกครั้งที่ยังไม่ได้ทำ
   ไม่งั้นแก้แล้วต้องไปกางตารางใหม่ทั้งปี ซึ่งไม่มีใครทำ
   ผลข้างเคียงที่ยอมรับ — ใบที่พิมพ์ไปแล้วเมื่อเดือนก่อนกับที่พิมพ์วันนี้อาจมีหัวข้อไม่เท่ากัน
   ถ้าวันหนึ่งต้องการให้ใบเก่าคงหัวข้อ ณ วันที่ทำไว้ ค่อยเพิ่มคอลัมน์ในตาราง PM แล้วก๊อปตอนกาง

   ── รูปแบบที่กรอกในชีต ──
   บรรทัดละหัวข้อ · ใส่เกณฑ์ต่อท้ายด้วย |  เช่น
     วัดอุณหภูมิเสื้อเกียร์ | ไม่เกิน 70 °C
   ช่องเกณฑ์คือสิ่งที่ทำให้ใบนี้เป็น guideline จริง ไม่ใช่แค่รายการชื่อ */

/** แตกข้อความหลายบรรทัดเป็นรายการ {text, spec} — บรรทัดว่างถูกตัดทิ้ง */
function parseChecklist_(raw) {
  return String(raw || '').split(/\r?\n/)
    .map(function (line) { return String(line).trim(); })
    .filter(String)
    .map(function (line) {
      var i = line.indexOf('|');
      return i === -1
        ? { text: line, spec: '' }
        : { text: line.slice(0, i).trim(), spec: line.slice(i + 1).trim() };
    });
}

/** หัวข้อตรวจของงานหนึ่ง — จับคู่จากชีตแผนด้วยชื่อเครื่อง + ชื่องาน */
function pmChecklistOf_(machine, task) {
  var hit = null;
  readSheet_(SHEET_PMPLAN).forEach(function (r) {
    if (hit) return;
    if (canonical_(r['เครื่องจักร']) === machine && String(r['งาน PM']).trim() === String(task).trim()) {
      hit = r;
    }
  });
  return {
    items: parseChecklist_(hit && hit['หัวข้อตรวจ']),
    cycle: hit ? (Number(hit['รอบ (วัน)']) || 0) : 0
  };
}

var PM_BLANK_LINES = 8;        // ไม่มีหัวข้อในแผน ก็ยังต้องมีที่ให้ช่างเขียนเอง

/**
 * ออกใบงาน PM เป็น PDF — ส่ง id เดียวหรือหลาย id (รวมเป็นไฟล์เดียว ขึ้นหน้าใหม่ทุกใบ)
 * @param {string|string[]} ids รหัสรายการใน "ตาราง PM"
 */
function apiPmWorkOrder(token, ids) {
  var actor = requireAuth_(token);
  var want = {};
  (Array.isArray(ids) ? ids : [ids]).forEach(function (x) {
    var id = String(x == null ? '' : x).trim();
    if (id) want[id] = true;
  });
  if (!Object.keys(want).length) throw new Error('ยังไม่ได้เลือกรายการ PM');
  if (Object.keys(want).length > 60) throw new Error('พิมพ์ได้ครั้งละไม่เกิน 60 ใบ');

  var pack = pmRows_(), i = pmIdx_(pack.head);
  var list = [];
  pack.rows.forEach(function (r) {
    var o = pmObj_(r, i);
    if (want[o.id]) list.push(o);
  });
  if (!list.length) throw new Error('ไม่พบรายการ PM ที่เลือก');
  list.sort(function (a, b) { return a.planned.localeCompare(b.planned) || a.machine.localeCompare(b.machine); });

  var company = String(cfg_('ชื่อบริษัท', 'YOUR COMPANY'));
  var reg = {};
  machines_().forEach(function (m) { reg[m.name] = m; });

  var css =
    '<meta charset="utf-8"><style>' +
    '@page{size:A4 portrait;margin:10mm}' +
    /* ชุดฟอนต์เดียวกับ FM-MT-04 ห้ามสลับลำดับ — บางเครื่องเรนเดอร์เลขเป็นเลขไทย ๑๒๓ */
    'body{font-family:"Sarabun","TH Sarabun New","Noto Sans Thai",sans-serif;color:#000;margin:0}' +
    'table{border-collapse:collapse;width:100%;table-layout:fixed}' +
    'td,th{border:1px solid #000;padding:4px 6px;vertical-align:top;font-size:12px;line-height:1.4;word-wrap:break-word}' +
    'th{background:#d9d9d9;font-weight:700;text-align:center;font-size:11px}' +
    '.no{border:none;padding:0}' +
    '.ttl{font-size:17px;font-weight:700;text-align:center}' +
    '.sub{font-size:11px;text-align:center}' +
    '.c{text-align:center}.r{text-align:right}' +
    '.lbl{background:#f2f2f2;font-weight:700;width:26%}' +
    '.box{font-size:15px;letter-spacing:2px}' +
    '.sign{height:56px;font-size:11px}' +
    '.pg{page-break-after:always}' +
    '</style>';

  var html = css + list.map(function (o, n) {
    var cl = pmChecklistOf_(o.machine, o.task);
    var info = reg[o.machine] || {};
    var rows = cl.items.length
      ? cl.items.map(function (it, k) {
          return '<tr><td class="c">' + (k + 1) + '</td><td>' + esc_(it.text) + '</td>' +
                 '<td>' + esc_(it.spec) + '</td>' +
                 '<td class="c box">☐</td><td class="c box">☐</td><td></td></tr>';
        }).join('')
      : (function () {
          var out = '';
          for (var k = 0; k < PM_BLANK_LINES; k++) {
            out += '<tr><td class="c">' + (k + 1) + '</td><td></td><td></td>' +
                   '<td class="c box">☐</td><td class="c box">☐</td><td></td></tr>';
          }
          return out;
        })();

    return '<div class="' + (n < list.length - 1 ? 'pg' : '') + '">' +
      '<table><tr>' +
        '<td class="lbl c" style="width:22%">' + esc_(company) + '</td>' +
        '<td><div class="ttl">ใบงานบำรุงรักษาเชิงป้องกัน</div>' +
            '<div class="sub">Preventive Maintenance Work Order</div></td>' +
        '<td style="width:22%" class="sub">เอกสารเลขที่ FM-MT-05<br>แก้ไขครั้งที่ 00<br>หน้า ' +
            (n + 1) + '/' + list.length + '</td>' +
      '</tr></table>' +

      '<table style="margin-top:4px">' +
      '<tr><td class="lbl">รหัสรายการ</td><td>' + esc_(o.id) + '</td>' +
          '<td class="lbl">วันที่ตามแผน</td><td>' + fmDate_(o.planned) + '</td></tr>' +
      '<tr><td class="lbl">เครื่องจักร / อุปกรณ์</td><td>' + esc_(o.machine) +
          (info.code ? ' (' + esc_(info.code) + ')' : '') + '</td>' +
          '<td class="lbl">สถานที่ติดตั้ง</td><td>' + esc_(info.location || '') + '</td></tr>' +
      '<tr><td class="lbl">ชื่องาน</td><td colspan="3">' + esc_(o.task) + '</td></tr>' +
      '<tr><td class="lbl">ประเภทงาน</td><td>' + esc_(o.kind) + '</td>' +
          '<td class="lbl">รอบการทำ</td><td>' + (cl.cycle ? cl.cycle + ' วัน' : '-') + '</td></tr>' +
      '<tr><td class="lbl">ผู้รับผิดชอบตามแผน</td><td>' + esc_(o.owner || '-') + '</td>' +
          '<td class="lbl">เวลาที่ประมาณไว้</td><td>' + (o.hours ? o.hours + ' ชั่วโมง' : '-') + '</td></tr>' +
      (o.movedFrom
        ? '<tr><td class="lbl">เลื่อนมาจากวันที่</td><td>' + fmDate_(o.movedFrom) + '</td>' +
          '<td class="lbl">เหตุผล</td><td>' + esc_(o.reason || '-') + '</td></tr>' : '') +
      '</table>' +

      '<table style="margin-top:6px">' +
      '<tr><th style="width:7%">ลำดับ</th><th style="width:34%">หัวข้อตรวจ / งานที่ต้องทำ</th>' +
          '<th style="width:21%">เกณฑ์ / ค่ามาตรฐาน</th>' +
          '<th style="width:9%">ปกติ</th><th style="width:9%">ผิดปกติ</th>' +
          '<th>ค่าที่วัดได้ / หมายเหตุ</th></tr>' +
      rows +
      '</table>' +

      '<table style="margin-top:6px">' +
      '<tr><td class="lbl">สรุปผล</td><td colspan="3">' +
          '<span class="box">☐</span> เสร็จสมบูรณ์ทุกหัวข้อ &nbsp;&nbsp;' +
          '<span class="box">☐</span> พบสิ่งผิดปกติ — ออกใบแจ้งซ่อมเลขที่ ______________ &nbsp;&nbsp;' +
          '<span class="box">☐</span> ทำไม่ครบ (ระบุเหตุผลด้านล่าง)</td></tr>' +
      '<tr><td class="lbl">เวลาเริ่ม – เวลาจบ</td><td>________ น. ถึง ________ น.</td>' +
          '<td class="lbl">รวมเวลาที่ใช้</td><td>________ ชั่วโมง</td></tr>' +
      '<tr><td class="lbl">อะไหล่ที่เปลี่ยน</td><td colspan="3" style="height:34px"></td></tr>' +
      '<tr><td class="lbl">หมายเหตุ / สิ่งที่พบ</td><td colspan="3" style="height:40px">' +
          esc_(o.note || '') + '</td></tr>' +
      '</table>' +

      '<table style="margin-top:6px">' +
      '<tr><th style="width:50%">ผู้ปฏิบัติงาน</th><th>ผู้ตรวจสอบ / หัวหน้างาน</th></tr>' +
      '<tr><td class="sign c">ลงชื่อ ............................................<br>วันที่ ......... / ......... / .........</td>' +
          '<td class="sign c">ลงชื่อ ............................................<br>วันที่ ......... / ......... / .........</td></tr>' +
      '</table></div>';
  }).join('');

  var fname = list.length === 1
    ? 'FM-MT-05 ' + list[0].id + ' ' + list[0].machine
    : 'FM-MT-05 ใบงาน PM ' + list.length + ' ใบ ' + list[0].planned.slice(0, 7);
  fname = fname.replace(/[\\\/:*?"<>|]/g, '-');

  var pdf = Utilities.newBlob(html, 'text/html', fname + '.html')
                     .getAs('application/pdf')
                     .setName(fname + '.pdf');

  writeAudit_('ออกใบงาน PM (FM-MT-05)', list.map(function (x) { return x.id; }).join(', '), [], actor.name);
  return { name: pdf.getName(), base64: Utilities.base64Encode(pdf.getBytes()), count: list.length };
}

/* ═══════════ รายงานสรุปงาน PM รายเดือน (FM-MT-06) ═══════════
   คนละใบกับ FM-MT-05 — ใบงานคือของที่ถือเข้าไปหน้าเครื่อง *ก่อน* ทำ
   รายงานคือของที่ส่งให้ผู้จัดการ *หลัง* จบเดือน ว่าทำไปกี่รายการ ตรงแผนกี่ %

   จงใจรับ items มาจากผู้เรียกไม่ใช่อ่านชีตเอง เพื่อให้พิมพ์ "ตามตัวกรองที่เห็นอยู่" ได้
   เหมือนใบงานทั้งเดือน ไม่งั้นกรองเฉพาะงานอาคารแล้วได้รายงานทั้งเดือนซึ่งไม่ตรงกับที่ดูอยู่ */

var TH_MONTHS_ = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** "2026-09" → "ก.ย. 2569" */
function thMonthLabel_(key) {
  var m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!m) return String(key || '');
  return TH_MONTHS_[Number(m[2]) - 1] + ' ' + (Number(m[1]) + 543);
}

/** สรุปตัวเลขของชุดรายการ — ใช้ทั้งรายงาน PDF และข้อความสำหรับไลน์ */
function pmSummarize_(items) {
  var today = dayKey_(new Date());
  var active = items.filter(function (x) { return x.status !== PM_SKIP; });
  var done = items.filter(function (x) { return x.status === PM_DONE; });
  var onTime = done.filter(function (x) { return x.actual && x.actual <= x.planned; });
  return {
    total: active.length,
    done: done.length,
    moved: items.filter(function (x) { return x.status === PM_MOVED; }).length,
    overdue: items.filter(function (x) {
      return x.status !== PM_DONE && x.status !== PM_SKIP && x.status !== PM_MOVED &&
             x.planned < today;
    }).length,
    hours: active.reduce(function (a, x) { return a + (x.hours || 0); }, 0),
    compliance: active.length ? Math.round((onTime.length / active.length) * 100) : null
  };
}

/**
 * รายงานสรุป PM เป็น PDF
 * @param {string} monthKey รูปแบบ yyyy-MM ใช้เป็นหัวเรื่อง
 * @param {string[]} ids    รหัสรายการที่จะใส่ในรายงาน (ตามตัวกรองที่หน้าเว็บแสดงอยู่)
 */
function apiPmReport(token, monthKey, ids) {
  var actor = requireAuth_(token, 'LEAD');
  var want = {};
  (ids || []).forEach(function (x) {
    var id = String(x == null ? '' : x).trim();
    if (id) want[id] = true;
  });
  if (!Object.keys(want).length) throw new Error('ไม่มีรายการ PM ให้ออกรายงาน');

  var pack = pmRows_(), i = pmIdx_(pack.head);
  var items = [];
  pack.rows.forEach(function (r) {
    var o = pmObj_(r, i);
    if (want[o.id]) items.push(o);
  });
  if (!items.length) throw new Error('ไม่พบรายการ PM ที่เลือก');
  items.sort(function (a, b) { return a.planned.localeCompare(b.planned) || a.machine.localeCompare(b.machine); });

  var sm = pmSummarize_(items);
  var label = thMonthLabel_(monthKey);
  var company = String(cfg_('ชื่อบริษัท', 'YOUR COMPANY'));
  var today = dayKey_(new Date());

  var css =
    '<meta charset="utf-8"><style>' +
    '@page{size:A4 landscape;margin:9mm}' +
    /* ชุดฟอนต์เดียวกับเอกสารอื่น ห้ามสลับลำดับ */
    'body{font-family:"Sarabun","TH Sarabun New","Noto Sans Thai",sans-serif;color:#000;margin:0}' +
    'table{border-collapse:collapse;width:100%;table-layout:fixed}' +
    'td,th{border:1px solid #000;padding:3px 5px;vertical-align:top;font-size:11px;line-height:1.35;word-wrap:break-word}' +
    'th{background:#d9d9d9;font-weight:700;text-align:center;font-size:10.5px}' +
    '.ttl{font-size:16px;font-weight:700;text-align:center}' +
    '.sub{font-size:10px;text-align:center}' +
    '.c{text-align:center}.r{text-align:right}' +
    '.lbl{background:#f2f2f2;font-weight:700}' +
    '.big{font-size:15px;font-weight:700;text-align:center}' +
    'thead{display:table-header-group}' +          /* หัวตารางซ้ำทุกหน้าเวลาพิมพ์หลายหน้า */
    '</style>';

  var html = css +
    '<table><tr>' +
      '<td class="lbl c" style="width:18%">' + esc_(company) + '</td>' +
      '<td><div class="ttl">รายงานสรุปงานบำรุงรักษาเชิงป้องกัน — ' + esc_(label) + '</div>' +
          '<div class="sub">Preventive Maintenance Monthly Report</div></td>' +
      '<td style="width:18%" class="sub">เอกสารเลขที่ FM-MT-06<br>พิมพ์เมื่อ ' + fmDate_(today) + '<br>โดย ' + esc_(actor.name) + '</td>' +
    '</tr></table>' +

    '<table style="margin-top:4px"><tr>' +
      '<td class="lbl c">รายการทั้งหมด</td><td class="lbl c">ทำเสร็จแล้ว</td>' +
      '<td class="lbl c">ยังไม่เสร็จ</td><td class="lbl c">เลยกำหนด</td>' +
      '<td class="lbl c">เลื่อนแผน</td><td class="lbl c">ชั่วโมงที่วางแผน</td>' +
      '<td class="lbl c">PM Compliance</td>' +
    '</tr><tr>' +
      '<td class="big">' + sm.total + '</td>' +
      '<td class="big">' + sm.done + '</td>' +
      '<td class="big">' + (sm.total - sm.done) + '</td>' +
      '<td class="big">' + sm.overdue + '</td>' +
      '<td class="big">' + sm.moved + '</td>' +
      '<td class="big">' + sm.hours + '</td>' +
      '<td class="big">' + (sm.compliance === null ? '-' : sm.compliance + '%') + '</td>' +
    '</tr></table>' +

    '<table style="margin-top:6px"><thead><tr>' +
      '<th style="width:7%">วันที่ตามแผน</th><th style="width:9%">ประเภทงาน</th>' +
      '<th style="width:14%">เครื่องจักร</th><th>งานที่ต้องทำ</th>' +
      '<th style="width:10%">ผู้รับผิดชอบ</th><th style="width:5%">ชม.</th>' +
      '<th style="width:9%">สถานะ</th><th style="width:7%">วันที่ทำจริง</th>' +
      '<th style="width:16%">หมายเหตุ / เหตุผลที่เลื่อน</th>' +
    '</tr></thead><tbody>' +
    items.map(function (o) {
      var late = o.status !== PM_DONE && o.status !== PM_SKIP && o.status !== PM_MOVED &&
                 o.planned < today;
      return '<tr>' +
        '<td class="c">' + fmDateS_(o.planned) + '</td>' +
        '<td>' + esc_(o.kind) + '</td>' +
        '<td>' + esc_(o.machine) + '</td>' +
        '<td>' + esc_(o.task) + '</td>' +
        '<td>' + esc_(o.owner || '-') + '</td>' +
        '<td class="c">' + (o.hours || '-') + '</td>' +
        '<td class="c">' + esc_(late ? 'เลยกำหนด' : o.status) + '</td>' +
        '<td class="c">' + (o.actual ? fmDateS_(o.actual) : '-') + '</td>' +
        '<td>' + esc_([o.reason, o.note, o.ticketId ? 'เปิดใบแจ้งซ่อม ' + o.ticketId : '']
                        .filter(String).join(' · ')) + '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>' +

    '<table style="margin-top:8px"><tr>' +
      '<th style="width:50%">ผู้จัดทำ</th><th>ผู้อนุมัติ</th></tr>' +
      '<tr><td class="c" style="height:52px">ลงชื่อ ............................................<br>' +
          'วันที่ ......... / ......... / .........</td>' +
          '<td class="c" style="height:52px">ลงชื่อ ............................................<br>' +
          'วันที่ ......... / ......... / .........</td></tr>' +
    '</table>';

  var fname = ('FM-MT-06 รายงาน PM ' + label).replace(/[\\\/:*?"<>|]/g, '-');
  var pdf = Utilities.newBlob(html, 'text/html', fname + '.html')
                     .getAs('application/pdf')
                     .setName(fname + '.pdf');

  writeAudit_('ออกรายงาน PM (FM-MT-06)', label + ' · ' + items.length + ' รายการ', [], actor.name);
  return { name: pdf.getName(), base64: Utilities.base64Encode(pdf.getBytes()), count: items.length };
}

/* ═══════════ นำเข้าข้อมูลเก่าจาก Excel (รันครั้งเดียว) ═══════════
   1) เปิด Google Sheet ของระบบ → ไฟล์ → นำเข้า → อัปโหลด แจ้งซ่อม.xlsx
      เลือก "แทรกชีตใหม่" แล้วเปลี่ยนชื่อแท็บที่ได้เป็น  ข้อมูลเก่า
   2) รัน importLegacy()       → โหมดซ้อม อ่านอย่างเดียว ดูผลที่ Execution log
   3) รัน importLegacyApply()  → เขียนจริง
   รันซ้ำได้ ใบที่มีอยู่แล้วจะถูกข้าม                                        */

var LEGACY_SHEET = 'ข้อมูลเก่า';

function importLegacy()      { return importLegacy_(false); }
function importLegacyApply() { return importLegacy_(true); }

/** ของเดิมเก็บ "เวลาซ่อมจบ" เป็นเวลานาฬิกาล้วน (15:30) ไม่มีวันที่
    เขียนลงไปตรง ๆ จะกลายเป็นปี 1899 แล้วสถิติเวลาซ่อมเพี้ยนทั้งระบบ
    จึงเอาวันที่ของใบแจ้งมาประกบ และถ้าได้เวลาก่อนเวลาแจ้ง แปลว่าซ่อมข้ามเที่ยงคืน */
function legacyEnd_(created, raw) {
  if (!created || raw === '' || raw == null) return '';
  var h, m;
  var d0 = toDate_(raw);
  if (d0 && d0.getFullYear() > 1900) return d0;      // บางแถวเก็บมาเป็นวันเวลาเต็มอยู่แล้ว
  if (d0) { h = d0.getHours(); m = d0.getMinutes(); }
  else {
    var t = /^(\d{1,2}):(\d{2})/.exec(String(raw).trim());   // บางแถวเป็นข้อความ '17:41'
    if (!t) return '';
    h = Number(t[1]); m = Number(t[2]);
  }
  var d = new Date(created.getTime());
  d.setHours(h, m, 0, 0);
  if (d < created) d.setDate(d.getDate() + 1);
  return d;
}

function importLegacy_(apply) {
  var src = ss_().getSheetByName(LEGACY_SHEET);
  if (!src) throw new Error('ไม่พบชีต "' + LEGACY_SHEET + '" — นำเข้าไฟล์ Excel เป็นแท็บใหม่แล้วตั้งชื่อนี้ก่อน');
  if (src.getLastRow() < 2) throw new Error('ชีต "' + LEGACY_SHEET + '" ไม่มีข้อมูล');

  var rows = src.getDataRange().getValues();
  var head = rows.shift().map(function (h) { return String(h == null ? '' : h).trim(); });
  if (head.indexOf('หมายเลขแจ้งซ่อม') === -1) {
    throw new Error('ไม่พบคอลัมน์ "หมายเลขแจ้งซ่อม" — ตรวจว่าแท็บนี้คือ Sheet1 ของไฟล์เก่า');
  }

  /* จับคู่ด้วย "ชื่อหัวคอลัมน์" ไม่ใช่ตำแหน่ง ไฟล์เก่ามีคอลัมน์แปลกปลอมคั่นอยู่หลายช่อง */
  var at  = function (r, name) { var i = head.indexOf(name); return i === -1 ? '' : r[i]; };
  var str = function (v) { return String(v == null ? '' : v).trim(); };

  var main = sheet_(SHEET_MAIN);
  var mainHead = main.getRange(1, 1, 1, main.getLastColumn()).getValues()[0];

  var seen = {};
  if (main.getLastRow() > 1) {
    var c = mainHead.indexOf(FIELD_MAP.ticket_id) + 1;
    main.getRange(2, c, main.getLastRow() - 1, 1).getValues().forEach(function (v) {
      seen[str(v[0])] = 'มีอยู่ในระบบแล้ว';
    });
  }

  var reg = {};
  machines_().forEach(function (m) { reg[m.name] = true; });

  var ready = [], skipped = [], unknown = {}, noDate = 0;

  rows.forEach(function (r) {
    var id = str(at(r, 'หมายเลขแจ้งซ่อม'));
    if (!id) return;                               // แถวว่างหรือแถวสรุปท้ายตาราง
    if (seen[id]) { skipped.push(id + ' — ' + seen[id]); return; }
    seen[id] = 'ซ้ำกันเองในไฟล์เก่า';

    var created = toDate_(at(r, 'เวลาแจ้ง')) || toDate_(at(r, 'วันที่แจ้ง'));
    if (!created) noDate++;

    var raw = str(at(r, 'เครื่องจักร'));
    var machine = canonical_(raw);
    if (raw && !reg[machine]) unknown[raw] = (unknown[raw] || 0) + 1;

    var done = str(at(r, 'สถานะ')).indexOf('ซ่อมแล้ว') > -1;

    ready.push({
      ticket_id: id,
      created_at: created || '',
      department: str(at(r, 'ฝ่าย')),
      reporter: str(at(r, 'ผู้แจ้ง')),
      work_type: str(at(r, 'ลักษณะงาน')),
      machine_name: machine,
      description: str(at(r, 'ระบุรายละเอียด')),
      cause: str(at(r, 'สาเหตุ')),
      action_needed: str(at(r, 'ระบุความต้องการ')),
      cost: Number(at(r, 'ค่าใช้จ่าย')) || 0,
      status_legacy: done ? 'ซ่อมแล้ว' : 'รอซ่อม',
      status: done ? STATUS_DONE : STATUS_OPEN,
      priority: PRIORITY_DEFAULT,
      due_at: '',           /* ตั้งใจเว้นว่าง ไม่งั้นใบเก่า 300 ใบโผล่ใน "เลยกำหนด" ทุกเช้า */
      assignee: '',
      started_at: '',
      completed_at: done ? legacyEnd_(created, at(r, 'เวลาซ่อมจบ')) : '',
      technician: str(at(r, 'ผู้เข้าซ่อม')),
      repair_action: str(at(r, 'การซ่อม')),
      repair_minutes: Number(at(r, 'ใช้เวลา')) || '',
      verified_by: '', verified_at: '', verification_status: '',
      rejection_note: '', reject_count: 0,
      source: 'ข้อมูลเก่า', image_url: ''
    });
  });

  var unknownList = Object.keys(unknown).map(function (k) { return k + ' (' + unknown[k] + ' ใบ)'; });
  var report = [
    'อ่านจากชีต "' + LEGACY_SHEET + '" ได้ ' + rows.length + ' แถว',
    'นำเข้าได้ ' + ready.length + ' ใบ',
    'ข้าม ' + skipped.length + ' ใบ' + (skipped.length ? ': ' + skipped.join(', ') : ''),
    'ไม่มีวันที่แจ้ง ' + noDate + ' ใบ',
    'ชื่อเครื่องที่ยังไม่ตรงทะเบียน ' + unknownList.length + ' ชื่อ' +
      (unknownList.length ? ' — เพิ่มในช่อง "ชื่อเดิมที่เคยใช้" ของชีตทะเบียนแล้วรันใหม่: ' +
       unknownList.join(', ') : '')
  ];

  if (!apply) {
    report.unshift('🔎 โหมดซ้อม ยังไม่เขียนอะไรลงชีต — ตรวจผลแล้วค่อยรัน importLegacyApply()');
    Logger.log(report.join('\n'));
    return report.join('\n');
  }
  if (!ready.length) { Logger.log('ไม่มีอะไรให้นำเข้า'); return 'ไม่มีอะไรให้นำเข้า'; }

  var keyOf = {};
  Object.keys(FIELD_MAP).forEach(function (k) { keyOf[FIELD_MAP[k]] = k; });

  var startSeq = main.getLastRow();
  var out = ready.map(function (t, i) {
    return mainHead.map(function (h) {
      if (h === 'ลำดับ') return startSeq + i;
      if (h === 'วันที่แจ้ง') return t.created_at;
      var k = keyOf[h];
      return k && t[k] !== undefined ? t[k] : '';
    });
  });

  /* เขียนทีเดียวทั้งก้อน — ถ้า appendRow ทีละแถว 300 กว่ารอบจะชนลิมิต 6 นาทีของ GAS */
  main.getRange(main.getLastRow() + 1, 1, out.length, mainHead.length).setValues(out);
  SpreadsheetApp.flush();
  writeAudit_('นำเข้าข้อมูลเก่า', ready.length + ' ใบ', [], 'ระบบ');

  report.unshift('✅ เขียนลงชีตเรียบร้อย');
  Logger.log(report.join('\n'));
  return report.join('\n');
}
