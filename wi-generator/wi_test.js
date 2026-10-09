/*! Free CMMS for poor engineers — https://github.com/twnote05/Free-CMMS-For-poor-Engineer
 *  Required Notice: Copyright 2026 IE จอมขี้เกียจ
 *  PolyForm Noncommercial 1.0.0 — ห้ามใช้เชิงพาณิชย์ · ดู LICENSE.md
 */
/* ============================================================================
   ตรวจสูตรคำนวณของ WI_Generator.html เทียบกับค่าที่คำนวณมือแยกไว้ต่างหาก
   ใช้:  node wi_test.js
   ไม่ต้องติดตั้งอะไรเพิ่ม — ดึงโค้ดชุดเดียวกับที่เบราว์เซอร์ใช้ออกมารันตรง ๆ
   แก้สูตรในไฟล์ HTML เมื่อไหร่ รันไฟล์นี้ซ้ำก่อนเอาไปใช้งานจริงทุกครั้ง
   ========================================================================== */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'WI_Generator.html'), 'utf8');
const src = html.slice(html.indexOf('const N = v =>'),
                      html.indexOf('/* ---------------------- ข้อมูลแถว'));
const { TABLES, qcStats, visCols, sdOf, apOf, AP_S, AP_O, AP_D } =
  new Function(src + ';return {TABLES,qcStats,visCols,sdOf,apOf,AP_S,AP_O,AP_D};')();

const fails = [];
const eq = (name, got, want, tol = 1e-3) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : String(got) === String(want);
  if (!ok) fails.push(`${name}: got ${got} want ${want}`);
};
const col = (doc, k) => TABLES[doc].cols.find(c => c.k === k);
const cell = (doc, k, r, ps, i, all) => col(doc, k).f(r, ps, i, all || [r]);
const sumOf = (doc, rs, ps) => Object.fromEntries(TABLES[doc].sum(rs, ps));

/* ---- ROUTING SHEET : เวลาสะสม ---- */
{
  const rs = [{ ct: 10, man: 1 }, { ct: 20, man: 2 }, { ct: 30, man: 1 }];
  rs.forEach((r, i) => eq('ROUTE cum' + i, cell('ROUTE', 'cum', r, {}, i, rs), [10, 30, 60][i]));
  const s = sumOf('ROUTE', rs, {});
  eq('ROUTE เวลารวม', s['เวลารวมทั้งสาย'], '60 วินาที');
  eq('ROUTE กำลังคน', s['กำลังคนรวม'], '4 คน');
}

/* ---- BOM : ต้องเบิก = ใช้จริง / (1 - %ของเสีย) ตามหลัก MRP ---- */
{
  const ps = { lot: 100 }, rs = [{ qty: 2, price: 5 }, { qty: 1, price: 10 }];
  eq('BOM ไม่เผื่อ need', cell('BOM', 'need', rs[0], ps), 200);
  eq('BOM ไม่เผื่อ cost', cell('BOM', 'cost', rs[0], ps), 1000);
  eq('BOM lot=0 กันหารศูนย์', cell('BOM', 'cost', rs[0], { lot: 0 }), 10);
  const rs2 = [{ qty: 2, price: 5, scrap: 5 }, { qty: 1, price: 10 }];
  eq('BOM เผื่อ 5% need', cell('BOM', 'need', rs2[0], ps), 210.5263);   // 200/0.95 ไม่ใช่ 200x1.05
  eq('BOM เผื่อ 5% cost', cell('BOM', 'cost', rs2[0], ps), 1052.6316);
  const s = sumOf('BOM', rs2, ps);
  eq('BOM ต้นทุนรวม', s['ต้นทุนวัตถุดิบรวม (เผื่อของเสียแล้ว)'], '2052.63 บาท');
  eq('BOM ส่วนเผื่อ', s['ส่วนที่เผื่อของเสีย'], '52.63 บาท (2.6 %)');
  eq('BOM ต่อหน่วย', s['ต้นทุน/หน่วยผลิต'], '20.53 บาท');
  eq('BOM scrap 0 เท่าเดิม', cell('BOM', 'need', { qty: 2, scrap: 0 }, ps), 200);
  eq('BOM scrap 100 ไม่หารศูนย์', cell('BOM', 'need', { qty: 1, scrap: 100 }, ps), 100);
  eq('BOM เตือน scrap ผิดช่วง',
     sumOf('BOM', [{ qty: 1, scrap: 100 }], ps)['⚠ ค่าผิด'], '1 แถวใส่ % ของเสียนอกช่วง 0-99');
}

/* ---- TIME STUDY : NT = เฉลี่ย x Rating , ST = NT x (1+Allowance) ---- */
{
  const ps = { rating: 100, allow: 13 }, r = { c1: 10, c2: 12, c3: 11, rt: 110 };
  eq('TIME เฉลี่ย', cell('TIME', 'avg', r, ps), 11);
  eq('TIME NT', cell('TIME', 'nt', r, ps), 12.1);
  eq('TIME ST', cell('TIME', 'st', r, ps), 13.673);
  eq('TIME rating ว่าง ใช้ค่าตั้งต้น', cell('TIME', 'nt', { c1: 10 }, ps), 10);
  // 10,12,11 -> x̄=11, s=1 ; n = (1.960x1 / (0.05x11))^2 = 12.70 -> 13 รอบ
  const ps2 = { rating: 100, allow: 13, conf: 95, prec: 5 };
  eq('TIME ส่วนเบี่ยงเบน', sdOf([10, 12, 11]), 1);
  eq('TIME รอบที่ควรจับ 95%', cell('TIME', 'nreq', r, ps2), 13);
  eq('TIME รอบที่ควรจับ 99%', cell('TIME', 'nreq', r, { ...ps2, conf: 99 }), 22);
  eq('TIME ยอม ±10% จับน้อยลง', cell('TIME', 'nreq', r, { ...ps2, prec: 10 }), 4);
  eq('TIME จับไม่พอ ไฮไลต์', TABLES.TIME.hi(r, ps2), true);
  eq('TIME เวลานิ่ง จับ 3 รอบพอ', TABLES.TIME.hi({ c1: 10, c2: 10, c3: 10 }, ps2), false);
  eq('TIME เตือนในสรุป',
     /ยังไม่พอ 1 องค์ประกอบ/.test(sumOf('TIME', [r], ps2)['จำนวนรอบที่จับ']), true);
}

/* ---- CAPACITY : (เวลาว่าง x 60 / CT) x เครื่อง x ประสิทธิภาพ ---- */
{
  const ps = { shift: 480, stop: 60, demand: 1000 };
  const r = { mc: 'M1', ct: 30, cav: 2, eff: 90 };
  eq('CAP กำลังผลิต', cell('CAP', 'cap', r, ps), 1512);
  eq('CAP ส่วนต่าง', cell('CAP', 'gap', r, ps), 512);
  eq('CAP สถานะ', cell('CAP', 'stt', r, ps), 'พอ');
  const rs = [r, { mc: 'M2', ct: 60, cav: 1, eff: 100 }];      // M2 = 420 ชิ้น = คอขวด
  const s = sumOf('CAP', rs, ps);
  eq('CAP คอขวด', s['กำลังผลิตของสายการผลิต (คอขวด)'], '420 ชิ้น/กะ');
  eq('CAP ชื่อจุดคอขวด', s['จุดคอขวด'], 'M2');
}

/* ---- LINE BALANCING : คอขวดและประสิทธิภาพต้องคิดจำนวนคนด้วย ---- */
{
  const ps = { shift: 420, demand: 600 };                      // takt = 25200/600 = 42
  const rs = [{ st: 'A', time: 40, man: 1 }, { st: 'B', time: 90, man: 2 },
              { st: 'C', time: 35, man: 1 }];                  // เวลา/คน = 40, 45, 35
  eq('LINE เวลาต่อคน', cell('LINE', 'per', rs[1], ps), 45);
  eq('LINE รอคอย A', cell('LINE', 'idle', rs[0], ps, 0, rs), 5);
  eq('LINE รอคอย B', cell('LINE', 'idle', rs[1], ps, 1, rs), 0);
  eq('LINE รอคอย C', cell('LINE', 'idle', rs[2], ps, 2, rs), 10);
  const s = sumOf('LINE', rs, ps);
  eq('LINE Takt', s['Takt Time'], '42.00 วิ/ชิ้น');
  eq('LINE คอขวด', s['Bottleneck (รอบเวลาสูงสุด)'], '45.00 วิ — B');
  eq('LINE ประสิทธิภาพ', s['Line Balance Efficiency'], '91.7 %  (Balance Delay 8.3 %)'); // 165/(4x45)
  eq('LINE รอคอยรวม', s['เวลารอคอยรวม'], '15.00 วิ');
  eq('LINE คนต่ำสุด', s['จำนวนคนต่ำสุดตามทฤษฎี'], '4 คน');      // ceil(165/42)
  eq('LINE กำลังผลิต', s['กำลังผลิตที่สายทำได้'], '560 ชิ้น/กะ'); // 25200/45
}

/* ---- CHECK SHEET : สัดส่วนพาเรโต ---- */
{
  const ps = { lot: 1000 };
  const rs = [{ type: 'รอยขีด', qty: 30 }, { qty: 20 }, { type: 'สีเพี้ยน', qty: 50 }];
  eq('CHECK สัดส่วน', cell('CHECK', 'pct', rs[0], ps, 0, rs), 30);
  eq('CHECK เทียบยอดผลิต', cell('CHECK', 'ppm', rs[0], ps, 0, rs), 3);
  const s = sumOf('CHECK', rs, ps);
  eq('CHECK ของเสียรวม', s['ของเสียรวม'], '100 ชิ้น');
  eq('CHECK อัตราของเสีย', s['อัตราของเสีย'], '10.00 %');
  eq('CHECK อันดับ 1', s['ปัญหาอันดับ 1'], 'สีเพี้ยน (50 ชิ้น)');
}

/* ---- CONTROL CHART X̄-R : ขีดควบคุม + Cp/Cpk + กฎ Nelson ---- */
{
  const P3 = { nsub: 3, usl: '', lsl: '' };
  const rs = [{ x1: 10, x2: 12, x3: 11 }, { x1: 9, x2: 11, x3: 10 }, { x1: 12, x2: 13, x3: 14 }];
  const st = qcStats(rs, P3);
  eq('QC n', st.n, 3);
  eq('QC X̄̄', st.xbb, 11.33333);
  eq('QC R̄', st.rb, 2);
  eq('QC UCLx', st.uclx, 11.33333 + 1.023 * 2);        // A2(n=3) = 1.023
  eq('QC LCLx', st.lclx, 11.33333 - 1.023 * 2);
  eq('QC UCLr', st.uclr, 2 * 2.574);                   // D4(n=3) = 2.574
  eq('QC LCLr', st.lclr, 0);
  eq('QC จุดหลุดขีด', st.out, 0);
  eq('QC sigma', st.sigma, 2 / 1.693);                 // d2(n=3) = 1.693
  eq('QC กลุ่มเท่ากัน', st.even, true);
  eq('QC ไม่มีสัญญาณเตือน', st.rule.rules.length, 0);
  const s = sumOf('QC', rs, { nsub: 3, usl: 15, lsl: 8 });
  eq('QC Cp', s['Cp'], '0.99');                        // 7/(6x1.18134)
  eq('QC Cpk', s['Cpk'], '0.94 (ไม่ผ่าน ต้องแก้ไข)');
  eq('QC ไม่ใส่สเปคก็ไม่มี Cp', sumOf('QC', rs, P3)['Cp'], undefined);
  eq('QC เตือนกลุ่มไม่เท่ากัน',
     /ไม่เท่ากัน/.test(sumOf('QC', [{ x1: 1, x2: 2 }, { x1: 1, x2: 2, x3: 3 }],
       { nsub: 3, usl: '', lsl: '' })['ขนาดกลุ่มตัวอย่าง n']), true);
  eq('QC จับจุดหลุดขีดได้',
     qcStats([{ x1: 10, x2: 10 }, { x1: 10, x2: 10 }, { x1: 99, x2: 99 }], { nsub: 2 }).out > 0, true);

  const xk = pp => visCols(TABLES.QC, pp).filter(c => /^x\d+$/.test(c.k)).map(c => c.k);
  eq('QC n=3 ซ่อน x4-x10', xk(P3).join(','), 'x1,x2,x3');
  eq('QC n=10 เปิดครบ', xk({ nsub: 10 }).length, 10);
  eq('QC n เกินช่วงบีบกลับ', xk({ nsub: 99 }).length, 10);
  eq('QC ไม่นับช่องที่ปิดอยู่', cell('QC', 'xb', { x1: 10, x2: 12, x3: 11, x4: 99 }, P3), 11);
  eq('QC เปิด n=4 แล้วนับ x4', cell('QC', 'xb', { x1: 10, x2: 12, x3: 11, x4: 99 }, { nsub: 4 }), 33);
  eq('QC n=8 ใช้ค่าคงที่ของ n=8',
     qcStats([...Array(3)].map(() => ({ x1:1,x2:2,x3:3,x4:4,x5:5,x6:6,x7:7,x8:8 })), { nsub: 8 }).n, 8);

  // กฎ Nelson : 6 จุดไต่ขึ้นต่อเนื่อง
  const trend = [1, 2, 3, 4, 5, 6].map(v => ({ x1: v - 0.5, x2: v + 0.5 }));
  eq('QC กฎแนวโน้ม', qcStats(trend, { nsub: 2 }).rule.rules[0], '6 จุดไต่ขึ้นหรือไล่ลงต่อเนื่อง');
  eq('QC กฎแนวโน้มครอบคลุม 6 จุด', qcStats(trend, { nsub: 2 }).rule.hit.size, 6);
  // กฎ Nelson : 2 ใน 3 จุดเลย 2 ซิกมา (R̄=1 -> ซิกมา = A2x1/3 = 0.6267)
  const st3 = qcStats([0,0,0,0,0,0,0,0,3,3].map(v => ({ x1: v - 0.5, x2: v + 0.5 })), { nsub: 2 });
  eq('QC กฎ 2 ใน 3', st3.rule.rules.join('|'), '2 ใน 3 จุดเลย 2 ซิกมา ข้างเดียวกัน');
  eq('QC 2 ใน 3 หลุดขีดด้วย', st3.out, 2);
}

/* ---- FMEA : RPN + Action Priority ของ AIAG-VDA ---- */
{
  const ps = { rpn: 100, opt: 0 }, rs = [{ s: 5, o: 4, d: 6 }, { s: 2, o: 2, d: 2 }];
  eq('FMEA RPN', cell('FMEA', 'rpn', rs[0], ps), 120);
  eq('FMEA RPN สรุป', sumOf('FMEA', rs, ps)['RPN สูงสุด / ที่เกินเกณฑ์ 100'], '120 / 1 รายการ');
  eq('FMEA เตือนผิดสเกล', sumOf('FMEA', [{ s: 12, o: 4, d: 6 }], ps)['⚠ ค่าผิดสเกล'],
     '1 แถวมี S/O/D ไม่ใช่จำนวนเต็ม 1-10');

  // ตาราง AP ฉบับเต็ม — ในแต่ละบรรทัดเรียงตามช่วง D คือ 7-10 / 5-6 / 2-4 / 1
  const WANT = {
    '9-10': { '8-10': 'HHHH', '6-7': 'HHHH', '4-5': 'HHHM', '2-3': 'HMLL', '1': 'LLLL' },
    '7-8':  { '8-10': 'HHHH', '6-7': 'HHHM', '4-5': 'HMMM', '2-3': 'MMLL', '1': 'LLLL' },
    '4-6':  { '8-10': 'HHMM', '6-7': 'MMML', '4-5': 'MLLL', '2-3': 'LLLL', '1': 'LLLL' },
    '2-3':  { '8-10': 'MMLL', '6-7': 'LLLL', '4-5': 'LLLL', '2-3': 'LLLL', '1': 'LLLL' },
    '1':    { '8-10': 'LLLL', '6-7': 'LLLL', '4-5': 'LLLL', '2-3': 'LLLL', '1': 'LLLL' },
  };
  const key = b => (b[0] === b[1] ? String(b[0]) : b.join('-'));
  for (const sb of AP_S) for (const ob of AP_O) AP_D.forEach((db, di) => {
    const want = WANT[key(sb)][key(ob)][di];
    for (const sv of [sb[0], sb[1]]) for (const ov of [ob[0], ob[1]]) for (const dv of [db[0], db[1]])
      if (apOf(sv, ov, dv) !== want)
        fails.push(`AP S=${sv} O=${ov} D=${dv}: got ${apOf(sv, ov, dv)} want ${want}`);
  });

  // ครบ 1000 ช่อง และห้ามย้อนแย้ง : เพิ่ม S/O/D แล้วความเร่งด่วนต้องไม่ลดลง
  const rank = { L: 1, M: 2, H: 3 };
  let cells = 0, mono = true;
  for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) for (let c = 1; c <= 10; c++) {
    const v = apOf(a, b, c); cells++;
    if (!'HML'.includes(v)) fails.push(`AP ${a}/${b}/${c} = ${v}`);
    if (a < 10 && rank[apOf(a + 1, b, c)] < rank[v]) mono = false;
    if (b < 10 && rank[apOf(a, b + 1, c)] < rank[v]) mono = false;
    if (c < 10 && rank[apOf(a, b, c + 1)] < rank[v]) mono = false;
  }
  eq('AP ครบ 1000 ช่อง', cells, 1000);
  eq('AP ไม่ย้อนแย้ง', mono, true);
  eq('AP ช่องว่าง', apOf('', 5, 5), '-');
  eq('AP S=10 O=1 D=1', apOf(10, 1, 1), 'L');
  eq('AP S=10 O=5 D=1', apOf(10, 5, 1), 'M');
  eq('AP S=10 O=6 D=1', apOf(10, 6, 1), 'H');   // RPN แค่ 60 แต่ต้องแก้ก่อนปล่อยผลิต
  eq('AP S=1 ทุกกรณี', apOf(1, 10, 10), 'L');

  eq('FMEA ไฮไลต์ AP=H', TABLES.FMEA.hi({ s: 9, o: 5, d: 5 }, ps), true);
  eq('FMEA ไฮไลต์ AP=M', TABLES.FMEA.hi({ s: 7, o: 4, d: 5 }, ps), 'mid');
  eq('FMEA ไม่ไฮไลต์ AP=L', TABLES.FMEA.hi({ s: 2, o: 2, d: 2 }, ps), false);

  const keysOf = pp => visCols(TABLES.FMEA, pp).map(c => c.k);
  eq('FMEA ปิดช่องติดตาม', keysOf({ opt: 0 }).includes('s2'), false);
  eq('FMEA เปิดช่องติดตาม', keysOf({ opt: 1 }).includes('ap2'), true);
  eq('FMEA รอบแรก 11 คอลัมน์', keysOf({ opt: 0 }).length, 11);

  const rs2 = [{ s: 9, o: 6, d: 6, s2: 9, o2: 2, d2: 2 },    // H -> L
               { s: 9, o: 6, d: 6, s2: 9, o2: 6, d2: 6 }];   // เท่าเดิม
  const s2 = sumOf('FMEA', rs2, { rpn: 100, opt: 1 });
  eq('FMEA AP ใหม่', cell('FMEA', 'ap2', rs2[0], { opt: 1 }), 'L');
  eq('FMEA AP สูงก่อนแก้', s2['AP สูง (H) — ต้องมีมาตรการก่อนปล่อยผลิต'], '2 รายการ');
  eq('FMEA ลดได้จริง', s2['ความเสี่ยงลดลงจริง'], '1 รายการ');
  eq('FMEA ยังเหลือ H', s2['ยังเหลือ AP สูง (H) หลังแก้ไข'], '1 รายการ');
}

/* ---- SMED : เวลาเปลี่ยนรุ่นที่นับจริงคืองาน Internal เท่านั้น ---- */
{
  const rs = [{ type: 'Internal', now: 20, aft: 8 }, { type: 'External', now: 15, aft: 15 },
              { type: 'Internal', now: 10, aft: 6 }];
  eq('SMED ลดลงรายแถว', cell('SMED', 'cut', rs[0], {}), 12);
  const s = Object.fromEntries(TABLES.SMED.sum(rs, {}));
  eq('SMED หยุดเครื่องเดิม', s['เวลาหยุดเครื่องเดิม (Internal)'], '30.00 นาที');
  eq('SMED หลังปรับปรุง', s['หลังปรับปรุง (Internal)'], '14.00 นาที');
  eq('SMED ลดลง', s['ลดลง'], '16.00 นาที (53.3 %)');
  eq('SMED งานรวม', s['เวลางานรวมทุกกิจกรรม'], '45.00 -> 29.00 นาที');
  eq('SMED นับประเภท', s['กิจกรรม Internal / External'], '2 / 1 รายการ');
}

/* ---- EQUIPMENT : นับสถานะ ---- */
{
  const s = Object.fromEntries(TABLES.EQUIP.sum([{ stt: 'พร้อมใช้' }, { stt: 'ซ่อม' }, {}]));
  eq('EQUIP ทั้งหมด', s['จำนวนอุปกรณ์ทั้งหมด'], '3 รายการ');
  eq('EQUIP พร้อมใช้', s['พร้อมใช้งาน'], '2 รายการ');
  eq('EQUIP ต้องติดตาม', s['ต้องติดตาม'], '1 รายการ');
}

/* ---- ตารางว่างและค่าศูนย์ ต้องไม่ทำให้โปรแกรมพัง ---- */
for (const k of Object.keys(TABLES)) {
  try {
    const def = (TABLES[k].pars || []).reduce((o, x) => (o[x.id] = x.v, o), {});
    const zero = (TABLES[k].pars || []).reduce((o, x) => (o[x.id] = 0, o), {});
    TABLES[k].sum && TABLES[k].sum([], def);
    TABLES[k].sum && TABLES[k].sum([{}], zero);
    TABLES[k].cols.filter(c => c.t === 'calc').forEach(c => c.f({}, def, 0, [{}]));
    TABLES[k].hi && TABLES[k].hi({}, def);
  } catch (e) { fails.push(k + ' แถวว่าง: ' + e.message); }
}

/* ---- ตัวสร้างไฟล์ Excel (ข้ามถ้ายังไม่ได้ลง exceljs) ---- */
let xl = 'ข้าม (ยังไม่ได้ติดตั้ง exceljs — รัน npm i exceljs ถ้าต้องการตรวจส่วนนี้ด้วย)';
try {
  const ExcelJS = require('exceljs');
  const xsrc = html.slice(html.indexOf('const XFONT ='),
    html.indexOf('\n}', html.indexOf('async function buildAnyWorkbook')) + 2);
  const build = new Function('ExcelJS', xsrc + ';return buildAnyWorkbook;')(ExcelJS);
  const h = { subject: 'ทดสอบ', docno: 'T-1', rev: '0', date: '', dept: '', owner: '',
              signs: [{}, {}, {}] };
  const jobs = {
    TABLE: ['TABLE', { sheet: 'T', title: 'ตาราง', groups: [[0, 1]], sum: [['รวม', '1']],
      cols: [{ h: 'AP', w: 10 }, { h: 'RPN', w: 10, num: true }],
      rows: [{ hi: true, cells: ['H', 729] }, { hi: 'mid', cells: ['M', 216] }] }],
    SKILL: ['SKILL', { skills: ['ก', 'ข'], min: 2, can: [2, 0], by: 'หัวหน้า',
      people: [{ name: 'ก', pos: 'ช่าง', lv: [2, 0], ok: 1 }],
      legend: [[0, 'ยังไม่ได้อบรม']], sum: [['จำนวนพนักงาน', '1 คน']] }],
    OPL:  ['OPL',  { kindText: 'พื้นฐาน', trainer: 'ก', rows: 8, cells: [{ desc: 'ก', img: null }] }],
    DIAG: ['DIAG', { title: 'VSM', per: 1, sign: true, items: [{ desc: 'ก', img: null }] }],
    SIGN: ['SIGN', { items: [{ kind: 'ห้าม', band: 'FFD7182A', fg: 'FF000000',
                               th: 'ห้ามสูบบุหรี่', en: 'NO SMOKING', img: null }] }],
  };
  const sizes = [];
  for (const [name, [kind, d]] of Object.entries(jobs)) {
    sizes.push(build(ExcelJS, kind, h, d, 'A4').then(b => {
      if (b.byteLength < 3000) fails.push('Excel ' + name + ' เล็กผิดปกติ: ' + b.byteLength);
      return name + ' ' + b.byteLength;
    }));
  }
  xl = sizes;
} catch (e) {
  if (!/Cannot find module 'exceljs'/.test(e.message)) fails.push('Excel: ' + e.message);
}

Promise.all(Array.isArray(xl) ? xl : []).then(done => {
  if (done.length) console.log('สร้างไฟล์ Excel ได้:', done.join(' | '));
  else console.log('ตัวสร้าง Excel:', xl);
  console.log(fails.length ? 'ไม่ผ่าน ' + fails.length + ' ข้อ\n' + fails.join('\n')
                           : 'ผ่านทั้งหมด');
  process.exit(fails.length ? 1 : 0);
});
