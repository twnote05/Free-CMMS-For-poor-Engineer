/**
 * รันชุดทดสอบทั้งหมด:  node tests/run.js
 *
 * ทดสอบตรรกะล้วน ๆ โดยสตับ Sheets/Drive/Lock ไว้ในหน่วยความจำ — ไม่แตะชีตจริง
 * รันได้ตลอด ไม่ต้องต่อเน็ต ไม่ต้อง deploy
 *
 * ยกเว้น scantest.html ที่ต้องเปิดในเบราว์เซอร์ (ใช้ canvas ถอดบาร์โค้ดจริง):
 *   npx http-server tests -p 8777   แล้วเปิด http://127.0.0.1:8777/scantest.html
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const HERE = __dirname;
const ROOT = path.dirname(HERE);

const SUITES = [
  ['seedtest',   'ข้อมูลตั้งต้นลงชีตถูกต้อง — จำนวนแถว ชนิดข้อมูล วันที่ กันเขียนทับ'],
  ['rendertest', 'ทุกหน้าจอเรนเดอร์ได้จริงกับข้อมูลเต็มคลัง — แท็กปิดครบ ไม่มีค่าหลุด'],
  ['scanroute',  'สแกนจากหน้าไหน รหัสกลับไปช่องนั้น'],
  ['trimtest',   'สำรอง & ตัดข้อมูลเก่า — ตัดถูกช่วง ไฟล์ครบก่อนลบ'],
  ['cattest',    'รหัสอะไหล่และหมวดชนิดต้องไม่ซ้ำกัน'],
  ['reftest',    'กันคีย์ซ้ำ — ทนการเขี่ย cache ทิ้ง ชีตสร้างเองได้'],
  ['protecttest','ล็อกชีตหลักฐาน — กันพิมพ์ทับยอด รันซ้ำไม่สะสม']
];

// ไฟล์ที่ต้องมีครบก่อน ไม่งั้นเทสจะฟ้องเป็น error งง ๆ แทนที่จะบอกว่าไฟล์หาย
const NEEDED = ['Code.gs', 'Auth.gs', 'Data.gs', 'App.js.html', 'Admin.js.html', 'Index.html']
  .map(f => 'src/' + f);
const missing = NEEDED.filter(f => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) {
  console.error('ไฟล์หาย: ' + missing.join(', '));
  process.exit(1);
}

let failed = 0;
for (const [name, what] of SUITES) {
  process.stdout.write(name.padEnd(12) + ' ');
  try {
    execFileSync(process.execPath, [path.join(HERE, name + '.js')], { stdio: 'pipe' });
    console.log('ผ่าน   ' + what);
  } catch (e) {
    failed++;
    console.log('ไม่ผ่าน ' + what);
    console.log(String(e.stdout || '').split('\n').filter(l => l.includes('✗')).join('\n'));
  }
}
console.log(failed ? `\n*** ไม่ผ่าน ${failed} ชุด ***` : '\nผ่านครบทุกชุด');
process.exit(failed ? 1 : 0);
