/* ตรวจ logic ที่ไม่ trivial ใน gas/app.html: เวลาซ่อม, ซ่อมซ้ำ, KPI, Heatmap, Export
   รัน: node test.js                                                        */
const fs = require("fs"), vm = require("vm"), assert = require("assert");

/* querySelector คืน null = "ไม่มี DOM" ซึ่งเป็นเงื่อนไขจริงของการรันนอกเบราว์เซอร์
   ฟังก์ชันที่อ่านค่าจากช่องบนหน้าจอต้องทนกับกรณีนี้ได้ ไม่ใช่โยน error */
const sandbox = { document: { addEventListener() {}, querySelector: () => null },
                  window: {}, console,
                  location: { href: "https://example.test/exec" } };
vm.runInNewContext(
  fs.readFileSync("gas/app.html", "utf8")
    .replace(/^\s*<script>/, "").replace(/<\/script>\s*$/, "") +
  "\nthis.setTickets = (v) => { tickets = v };" +
  "\nthis.fns = { fmtDuration, hoursBetween, elapsedHours," +
  "              findRepeats, machineStats, kpiSummary, heatData, heatColor, STATUS," +
  "              repeatByCount, riskLevel, legacyStatus, wrenchHours, waitHours, sheet1Rows, SHEET1_HEADERS," +
  "              ymd, lineText, symptom, median, needsMachine, nameList, hasName," +
  "              notifItems, backLate, live, isDead, workloadRows, dayOffKind, kpiDrill," +
  "              overlapHours, stopSpan, breakdownSpan, periodWindow," +
  "              techScore, TECH_MIN_N, waitedOutside, loggedWell, techDrill," +
  "              techTotal, TECH_WEIGHT_DEFAULT, TECH_INVERTED, KPI_PICK, ROLE_KPI, TS_COL," +
  "              stationMachines, isMyMachine, myStation, ticketScope };" +
  "\nthis.setME = (v) => { ME = v };" +
  "\nthis.setPmCal = (v) => { pmCal = v };" +
  "\nthis.setMachines = (v) => { MACHINES = v };",
  sandbox
);
const { fmtDuration, hoursBetween, elapsedHours,
        findRepeats, machineStats, kpiSummary, heatData, heatColor, STATUS,
        repeatByCount, riskLevel, legacyStatus, wrenchHours, waitHours, sheet1Rows, SHEET1_HEADERS,
        ymd, lineText, symptom, median, needsMachine, nameList, hasName,
        notifItems, backLate, live, isDead, workloadRows, dayOffKind, kpiDrill,
        overlapHours, stopSpan, breakdownSpan, periodWindow,
        techScore, TECH_MIN_N, waitedOutside, loggedWell, techDrill,
        techTotal, TECH_WEIGHT_DEFAULT, TECH_INVERTED, KPI_PICK,
        ROLE_KPI, TS_COL, stationMachines, isMyMachine, myStation,
        ticketScope } = sandbox.fns;

/* ═══ เวลา ═══ */
assert.strictEqual(fmtDuration(2.5), "2 ชม. 30 น.");
assert.strictEqual(fmtDuration(25), "1 วัน 1 ชม.");
assert.strictEqual(fmtDuration(0), "0 น.");
assert.strictEqual(fmtDuration(NaN), "");

assert.strictEqual(hoursBetween("2026-09-07T08:00:00Z", "2026-09-07T10:30:00Z"), 2.5);
assert.strictEqual(hoursBetween("2026-09-07T08:00:00Z", ""), null, "ยังไม่จบงาน = ไม่มีค่า");
assert.strictEqual(hoursBetween("2026-09-07T10:00:00Z", "2026-09-07T08:00:00Z"), null, "เวลาย้อนกลับ = ไม่นับ");

// งานค้างต้องนับถึง "ตอนนี้" ไม่ใช่คืน null
assert.strictEqual(
  elapsedHours({ created_at: "2026-09-07T00:00:00Z", completed_at: "" }, Date.parse("2026-09-08T00:00:00Z")),
  24, "งานที่ยังไม่ปิดต้องนับเวลาถึงปัจจุบัน");

/* ═══ ข้อมูลตัวอย่างสำหรับ analytics ═══ */
const mk = (id, machine, created, opt = {}) => ({
  ticket_id: id, machine_name: machine, created_at: created,
  description: "อาการ " + id, cost: 0, status: STATUS.WAIT,
  completed_at: "", reject_count: 0, ...opt,
});

const data = [
  mk("A1", "Cut Slot2", "2026-01-05T08:00:00Z", { status: STATUS.DONE, completed_at: "2026-01-05T18:00:00Z", cost: 1000 }),
  mk("A2", "Cut Slot2", "2026-01-20T08:00:00Z", { status: STATUS.DONE, completed_at: "2026-01-23T08:00:00Z", cost: 500 }),  // ซ้ำ 15 วัน
  mk("A3", "Cut Slot2", "2026-06-01T08:00:00Z", { status: STATUS.DONE, completed_at: "2026-06-01T12:00:00Z", cost: 200, reject_count: 1 }),
  mk("B1", "Die Cut",   "2026-03-10T08:00:00Z", { status: STATUS.REPAIR, cost: 300 }),
];

/* ═══ รายการซ่อมซ้ำ ═══ */
const r30 = findRepeats(data, 30);
assert.strictEqual(r30.length, 1, "ภายใน 30 วันต้องเจอคู่ซ้ำ 1 คู่");
assert.strictEqual(r30[0].machine, "Cut Slot2");
assert.strictEqual(r30[0].curr.ticket_id, "A2");
assert.strictEqual(r30[0].gapDays, 15);
assert.strictEqual(r30[0].cost, 1500, "ค่าใช้จ่ายต้องรวมทั้งสองใบ");

assert.strictEqual(findRepeats(data, 7).length, 0, "กรอบ 7 วันต้องไม่นับคู่ที่ห่าง 15 วัน");
assert.strictEqual(findRepeats(data, 200).length, 2, "กรอบกว้างต้องนับคู่ต่อเนื่องทั้งสองคู่");
// A3 ห่างจาก A2 132 วัน — ต้องไม่ถูกจับคู่ข้าม A2 กลับไปหา A1
assert.ok(findRepeats(data, 200).every((x) => x.prev.ticket_id !== "A1" || x.curr.ticket_id === "A2"));

/* ═══ สถิติรายเครื่อง ═══ */
const ms = machineStats(data, r30);
const cut = ms.find((s) => s.machine === "Cut Slot2");
assert.strictEqual(cut.count, 3);
assert.strictEqual(cut.cost, 1700);
assert.strictEqual(cut.repeat, 1);
assert.strictEqual(cut.downtime, 10 + 72 + 4);
assert.strictEqual(cut.mttr, (10 + 72 + 4) / 3);

const die = ms.find((s) => s.machine === "Die Cut");
assert.strictEqual(die.mttr, null, "เครื่องที่ยังไม่มีงานปิดต้องไม่มี MTTR (ไม่ใช่ 0)");
assert.strictEqual(die.downtime, 0);

/* ═══ KPI ═══ */
const k = kpiSummary(data, 24);
assert.strictEqual(k.total, 4);
assert.strictEqual(k.done, 3);
assert.strictEqual(k.open, 1);
assert.strictEqual(k.cost, 2000);
assert.strictEqual(k.costPerTicket, 500);
assert.strictEqual(k.onTime, 2, "ปิดใน 24 ชม. ได้ 2 ใบ (A1=10ชม., A3=4ชม.)");
assert.strictEqual(k.onTimeRate, 67);
assert.strictEqual(k.doneRate, 75);
assert.strictEqual(k.reworked, 1, "A3 ถูกส่งกลับแก้ไข 1 ครั้ง");
// ไม่มีใบไหนมีผลการตรวจรับ = ไม่รู้ผล ต้องเป็น null ไม่ใช่ 100% ที่หลอกผู้บริหาร
assert.strictEqual(k.firstTimeFix, null, "ยังไม่มีใบที่ตรวจรับ ต้องไม่รายงานตัวเลข");

const verifiedSet = [
  mk("V1", "Cut Slot2", "2026-01-05T08:00:00Z",
     { status: STATUS.DONE, completed_at: "2026-01-05T18:00:00Z", verification_status: "ผ่าน" }),
  mk("V2", "Cut Slot2", "2026-02-05T08:00:00Z",
     { status: STATUS.DONE, completed_at: "2026-02-05T18:00:00Z", verification_status: "ผ่าน" }),
  mk("V3", "Cut Slot2", "2026-03-05T08:00:00Z",
     { status: STATUS.DONE, completed_at: "2026-03-05T18:00:00Z", verification_status: "ผ่าน", reject_count: 1 }),
];
const kv = kpiSummary(verifiedSet, 24);
assert.strictEqual(kv.verified, 3);
assert.strictEqual(kv.firstTimeFix, 67, "ผ่านครั้งแรก 2 จาก 3 ใบที่ตรวจรับ");

/* ═══ มัธยฐาน — ข้อมูลซ่อมบำรุงมีตัวสุดโต่งเสมอ ═══ */
assert.strictEqual(k.costMedian, 400, "มัธยฐานนับเฉพาะใบที่มีค่าใช้จ่าย (200,300,500,1000)");
assert.strictEqual(k.paidCount, 4);
assert.ok(k.mttrMedian !== null && k.mttrMedian < k.mttr,
  "ใบ 72 ชม. ลากค่าเฉลี่ยขึ้น มัธยฐานต้องต่ำกว่า");
assert.strictEqual(kpiSummary([], 24).costMedian, null, "ไม่มีข้อมูลต้องเป็น null ไม่ใช่ 0");
assert.strictEqual(kpiSummary([], 24).mttrMedian, null);

assert.strictEqual(kpiSummary([], 24).mttr, null, "ชุดข้อมูลว่างต้องไม่หารศูนย์");
assert.strictEqual(kpiSummary([], 24).doneRate, 0);

/* ═══ Heatmap ═══ */
const hm = heatData(data, "machine");
assert.strictEqual(hm.cols.length, 12);
assert.strictEqual(hm.rows[0].label, "Cut Slot2", "แถวต้องเรียงจากเครื่องที่เสียมากสุด");
assert.strictEqual(hm.rows[0].cells[0], 2, "Cut Slot2 เสีย 2 ครั้งในเดือน ม.ค.");
assert.strictEqual(hm.rows[0].cells[5], 1, "และ 1 ครั้งในเดือน มิ.ย.");

const hw = heatData(data, "weekday");
assert.strictEqual(hw.rows.length, 7);
assert.strictEqual(hw.cols.length, 6);
assert.strictEqual(hw.rows.reduce((a, r) => a + r.cells.reduce((x, y) => x + y, 0), 0), 4,
  "ทุกใบต้องถูกนับลงช่องใดช่องหนึ่ง");

assert.strictEqual(heatColor(0, 10).bg, "#f8fafc", "ค่า 0 ต้องเป็นสีอ่อนสุด");
assert.notStrictEqual(heatColor(10, 10).bg, heatColor(1, 10).bg, "ค่าสูง/ต่ำต้องได้สีต่างกัน");

/* ═══ ความเข้ากันได้กับระบบ Excel เดิม ═══ */

// สถานะ: 4 สถานะใหม่ ต้อง map กลับเป็น 2 สถานะที่สูตร COUNTIFS เดิมใช้
assert.strictEqual(legacyStatus(STATUS.DONE), "ซ่อมแล้ว");
["รอซ่อม", "กำลังซ่อม", "รอฝ่ายผลิตตรวจสอบ"].forEach((st) =>
  assert.strictEqual(legacyStatus(st), "รอซ่อม", `${st} ต้องนับเป็นงานที่ยังไม่ปิด`));

// % ซ่อมซ้ำ แบบชีท "รายการซ่อมซ้ำ": นับ "เครื่อง" ที่แจ้ง >= 2 ครั้ง ไม่ใช่นับใบ
const rbc = repeatByCount(data);
assert.strictEqual(rbc.machines.length, 2, "มี 2 เครื่องที่ถูกแจ้งในรอบ");
assert.strictEqual(rbc.repeated.length, 1, "Cut Slot2 แจ้ง 3 ครั้ง = ซ่อมซ้ำ");
assert.strictEqual(rbc.repeated[0].machine, "Cut Slot2");
assert.strictEqual(rbc.rate, 50, "1 เครื่องจาก 2 เครื่อง = 50%");
assert.strictEqual(repeatByCount([]).rate, 0, "ไม่มีข้อมูลต้องไม่หารศูนย์");

// เกณฑ์ความเสี่ยงตามสูตร Heatmap!B (>=10 High Risk, >=5 Watch)
assert.strictEqual(riskLevel(10)[1], "🚨 High Risk");
assert.strictEqual(riskLevel(9)[1],  "⚠️ Watch");
assert.strictEqual(riskLevel(5)[1],  "⚠️ Watch");
assert.strictEqual(riskLevel(4)[1],  "✅ Normal");
assert.strictEqual(riskLevel(0)[1],  "✅ Normal");

/* ═══ สองไม้บรรทัดต้องไม่ปนกัน ═══
   "ช่างลงมือ" กับ "เครื่องรอ" ตอบคนละคำถาม ใบเดียวกันให้ค่าต่างกันได้หลายเท่า
   เดิมมีฟังก์ชันเดียวที่สลับไปมาตามว่าใบไหนมีข้อมูลอะไร แล้วบวกรวมเป็นก้อนเดียว */
{
  // ใบที่รออะไหล่: แจ้งวันที่ 5 เช้า ช่างลงมือวันที่ 6 เช้า เสร็จ 6 โมงเย็นวันเดียวกัน
  const slow = { created_at: "2026-01-05T08:00:00Z", started_at: "2026-01-06T08:00:00Z",
                 completed_at: "2026-01-06T18:00:00Z", repair_minutes: 600 };
  assert.strictEqual(wrenchHours(slow), 10, "ช่างลงมือ = เริ่มซ่อม→จบ");
  assert.strictEqual(waitHours(slow), 34, "เครื่องรอ = แจ้ง→จบ รวมเวลารออะไหล่ 24 ชม.");

  // ไม่เคยกดปุ่ม "เริ่มซ่อม" = ไม่รู้ว่าช่างลงมือนานแค่ไหน ต้องคืน null ไม่ใช่เดาเป็น 0
  const noStart = { created_at: "2026-01-05T08:00:00Z", completed_at: "2026-01-05T18:00:00Z" };
  assert.strictEqual(wrenchHours(noStart), null, "ไม่กดเริ่มซ่อม = ไม่รู้ ไม่ใช่ 0");
  assert.strictEqual(waitHours(noStart), 10, "แต่เวลาที่เครื่องรอยังคิดได้เสมอ");

  // "ใช้เวลา" ในชีตคือค่าที่ server คิดจาก เริ่มซ่อม→จบ ให้แล้ว ใช้ค่านั้นก่อน
  assert.strictEqual(
    wrenchHours({ created_at: "2026-01-05T08:00:00Z", completed_at: "2026-01-06T08:00:00Z", repair_minutes: 90 }),
    1.5);
  // ใบที่ยังไม่ปิดไม่มีทั้งสองค่า
  assert.strictEqual(waitHours({ created_at: "2026-01-05T08:00:00Z", completed_at: "" }), null);
}

// KPI ที่ยกมาจากระบบเดิม
const k2 = kpiSummary(data, 24, { workHours: 100, pmPlan: 20, pmDone: 19 });
assert.strictEqual(k2.pmRate, 95, "% การทำ PM = PM เสร็จ ÷ แผน PM");
/* %ซ่อมซ้ำ หัวเรื่องต้องเป็นสูตรของไฟล์ KPI Report (เคส ÷ ใบ) เพราะนั่นคือตัวที่ผู้ตรวจ ISO อ่าน
   ส่วนแบบนับเครื่องเก็บไว้เป็นอีกค่า เพราะตอบคนละคำถาม */
assert.strictEqual(k2.repeatCases, 1, "A2 ซ้ำกับ A1 ภายใน 30 วัน = 1 เคส");
assert.strictEqual(k2.repeatRate, 25, "1 เคส ÷ 4 ใบ = 25% (สูตรไฟล์ KPI)");
assert.strictEqual(k2.repeatMachineRate, 50, "1 จาก 2 เครื่องถูกแจ้งซ้ำ = 50% (นับเครื่อง)");
// กรอบวันแคบลงต้องได้เคสน้อยลง ไม่ใช่ค่าคงที่
assert.strictEqual(kpiSummary(data, 24, {}, 7).repeatCases, 0, "กรอบ 7 วันไม่นับคู่ที่ห่าง 15 วัน");
// ใบเดียวนับได้ครั้งเดียว ถึงจะถูกจับคู่ซ้ำหลายคู่
assert.ok(kpiSummary(data, 24, {}, 200).repeatCases <= data.length);
assert.ok(k2.breakdownRate > 0, "% Breakdown ต้องคำนวณได้เมื่อมีชั่วโมงทำงาน");
assert.strictEqual(kpiSummary(data, 24, {}).breakdownRate, null, "ไม่กรอกชั่วโมงทำงาน = ไม่แสดงผล ไม่ใช่ 0");
assert.strictEqual(kpiSummary(data, 24, {}).pmRate, null);

/* ═══ %Breakdown นับเฉพาะเครื่องจักรผลิต ═══
   ซ่อมปริ้นเตอร์หรือทาสีผนังไม่ใช่เวลาที่สายการผลิตหยุด ถ้านับรวมเข้าไป
   ตัวเลขจะสูงเกินจริงตลอด แล้วไม่มีใครเชื่อ KPI ตัวนี้อีกเลย */
{
  const mixed = [
    mk("M1", "Cut Slot2", "2026-01-05T08:00:00Z", { status: STATUS.DONE, completed_at: "2026-01-05T18:00:00Z" }),
    mk("M2", "พัดลมสำหรับคน Ext 1", "2026-01-06T08:00:00Z", { status: STATUS.DONE, completed_at: "2026-01-06T18:00:00Z" }),
    mk("M3", "", "2026-01-07T08:00:00Z", { status: STATUS.DONE, completed_at: "2026-01-07T18:00:00Z" }),
  ];
  // ยังไม่ได้โหลดทะเบียน = แยกไม่ออก ต้องนับทุกใบไปก่อน ไม่ใช่คืน 0% เงียบ ๆ
  assert.strictEqual(kpiSummary(mixed, 24, { workHours: 100 }).machineStops, 3);

  sandbox.setMachines([
    { name: "Cut Slot2", group: "เครื่องจักรหลัก" },
    { name: "พัดลมสำหรับคน Ext 1", group: "เครื่องใช้ไฟฟ้า" },
  ]);
  const kb = kpiSummary(mixed, 24, { workHours: 100 });
  assert.strictEqual(kb.machineStops, 1, "พัดลมกับงานอาคารต้องไม่ถูกนับเป็นเวลาที่การผลิตหยุด");
  assert.strictEqual(kb.machineDowntime, 10);
  assert.strictEqual(kb.breakdownRate, 10, "10 ชม. ÷ 100 ชม. = 10%");
  // เวลารวมของทุกใบยังนับหมด — คนละตัวกับตัวเศษของ %Breakdown
  assert.strictEqual(kb.downtime, 30);

  /* สองก้อนต้องใช้ตัวหารเดียวกันและต่างกันแค่ตัวเศษ
     ใบนี้ไม่มี started_at เลย "ช่างลงมือ" จึงเป็น 0 ชม. จาก 0 ใบ ไม่ใช่เท่ากับเครื่องรอ */
  assert.strictEqual(kb.machineHandsCount, 0, "ไม่มีใบไหนกดปุ่มเริ่มซ่อม");
  assert.strictEqual(kb.wrenchRate, 0);

  const withStart = mixed.map((t, i) => i === 0
    ? { ...t, started_at: "2026-01-05T16:00:00Z" }   // ลงมือ 2 ชม. สุดท้ายของ 10 ชม.
    : t);
  const kw = kpiSummary(withStart, 24, { workHours: 100 });
  assert.strictEqual(kw.machineDowntime, 10, "เครื่องยังรอ 10 ชม. เท่าเดิม");
  assert.strictEqual(kw.machineWrench, 2, "แต่ช่างลงมือแค่ 2 ชม.");
  assert.strictEqual(kw.breakdownRate, 10);
  assert.strictEqual(kw.wrenchRate, 2, "ช่องว่าง 8% คือเวลารอ ซึ่งเป็นคนละปัญหากับงานซ่อม");

  /* ═══ ตัวหารต้องคูณจำนวนเครื่องในทะเบียน ═══
     ตัวเศษรวมเวลาของทุกเครื่องเข้าด้วยกัน เครื่อง 5 ตัวพังพร้อมกันตัวละ 3 วัน
     ได้ตัวเศษ 15 วัน ทั้งที่ปฏิทินเดินไปแค่ 3 วัน หารด้วยชั่วโมงของเครื่องเดียว
     จะได้เปอร์เซ็นต์ทะลุ 100 ได้เรื่อย ๆ (ของจริงเคยขึ้น 409.4%) */
  sandbox.setMachines([
    { name: "Cut Slot2", group: "เครื่องจักรหลัก" },
    { name: "M-A", group: "เครื่องจักรหลัก" },
    { name: "M-B", group: "เครื่องจักรรอง" },
    { name: "พัดลมสำหรับคน Ext 1", group: "เครื่องใช้ไฟฟ้า" },
  ]);
  const kf = kpiSummary(mixed, 24, { workHours: 100 });
  assert.strictEqual(kf.fleet, 3, "นับเฉพาะเครื่องจักรหลัก/รอง ไม่รวมเครื่องใช้ไฟฟ้า");
  assert.strictEqual(kf.availHours, 300, "3 เครื่อง × 100 ชม.");
  assert.strictEqual(kf.machineDowntime, 10);
  assert.strictEqual(kf.breakdownRate, 3.3, "10 ÷ 300 ไม่ใช่ 10 ÷ 100");

  // เครื่องพังพร้อมกันหลายตัวต้องไม่ทำให้เปอร์เซ็นต์ทะลุ 100
  const sameDay = ["Cut Slot2", "M-A", "M-B"].map((m, i) =>
    mk("S" + i, m, "2026-03-02T00:00:00Z",
       { status: STATUS.DONE, completed_at: "2026-03-05T00:00:00Z" }));   // ตัวละ 72 ชม.
  const ks = kpiSummary(sameDay, 24, { workHours: 100 });
  assert.strictEqual(ks.machineDowntime, 216, "ตัวเศษรวมกันได้มากกว่าเวลาบนปฏิทิน");
  assert.strictEqual(ks.breakdownRate, 72, "216 ÷ 300 = 72% ไม่ใช่ 216%");
  assert.ok(ks.breakdownRate <= 100);

  // ยังไม่ได้โหลดทะเบียน = ไม่คูณ ดีกว่าหารด้วย 0 แล้วได้ Infinity
  sandbox.setMachines([]);
  const kn = kpiSummary(mixed, 24, { workHours: 100 });
  assert.strictEqual(kn.fleet, 1);
  assert.ok(isFinite(kn.breakdownRate));
}

// Export: จำนวนคอลัมน์ต้องตรงกับหัวตาราง และสถานะต้องเป็นค่าเดิม
const xl = sheet1Rows(data);
assert.strictEqual(xl.length, data.length);
xl.forEach((r) => assert.strictEqual(r.length, SHEET1_HEADERS.length, "จำนวนคอลัมน์ต้องตรงกับหัวตาราง"));
assert.strictEqual(xl[0][SHEET1_HEADERS.indexOf("หมายเลขแจ้งซ่อม")], "A1");
assert.strictEqual(xl[0][SHEET1_HEADERS.indexOf("สถานะ")], "ซ่อมแล้ว");
assert.strictEqual(xl[3][SHEET1_HEADERS.indexOf("สถานะ")], "รอซ่อม", "B1 สถานะกำลังซ่อม = ยังไม่ปิด");
// instanceof ใช้ไม่ได้ข้าม realm ของ vm จึงเช็คด้วย toString แทน
const isDate = (v) => Object.prototype.toString.call(v) === "[object Date]";
assert.ok(isDate(xl[0][SHEET1_HEADERS.indexOf("วันที่แจ้ง")]), "วันที่ต้องเป็น Date ให้ Excel จัดรูปแบบได้");
assert.strictEqual(xl[3][SHEET1_HEADERS.indexOf("เวลาซ่อมจบ")], "", "งานที่ยังไม่ปิดต้องเว้นว่าง ไม่ใช่ Invalid Date");

// GAS คอมไพล์ทุก <? ?> ใน index.html ไม่เว้นแม้อยู่ใน HTML comment
// เคยพังมาแล้วเพราะเขียน <?= ?> ไว้ในคอมเมนต์ แล้วได้ SyntaxError ชี้ไปที่ Code.gs แทน
{
  const idx = fs.readFileSync("gas/index.html", "utf8");
  const tags = idx.match(/<\?[\s\S]*?\?>/g) || [];
  const allowed = ['<?!= include("styles") ?>', '<?= prefillMachine ?>', '<?!= include("app") ?>'];
  tags.forEach((t) => {
    assert.ok(allowed.includes(t),
      "scriptlet แปลกปลอมใน index.html: " + t + " — ห้ามเขียน <? ?> แม้ในคอมเมนต์");
    assert.ok(!/;\s*\?>$/.test(t),
      "scriptlet ต้องเป็น expression ล้วน ห้ามมี ; ปิดท้าย: " + t);
  });
}

// Code.gs: รันทั้งไฟล์ในกล่องเปล่า ได้ตรวจ syntax ไปในตัว แล้วทดสอบ legacyEnd_
// ของเดิมเก็บเวลาซ่อมจบเป็นเวลานาฬิกาล้วน ถ้าแปลงผิดสถิติเวลาซ่อมเพี้ยนทั้งระบบ
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  const { legacyEnd_ } = gas;
  const start = new Date(2026, 0, 5, 8, 0);

  const sameDay = legacyEnd_(start, new Date(1899, 11, 30, 15, 30));
  assert.strictEqual(sameDay.getFullYear(), 2026, "เวลานาฬิกาล้วนต้องได้ปีของใบแจ้ง ไม่ใช่ 1899");
  assert.strictEqual(sameDay.getDate(), 5);
  assert.strictEqual(sameDay.getHours(), 15);

  const asText = legacyEnd_(start, "17:41");
  assert.strictEqual(asText.getHours(), 17, "บางแถวเก็บเวลามาเป็นข้อความ");
  assert.strictEqual(asText.getMinutes(), 41);

  const overnight = legacyEnd_(new Date(2026, 0, 5, 22, 0), "01:30");
  assert.strictEqual(overnight.getDate(), 6, "ซ่อมจบก่อนเวลาแจ้ง = ข้ามเที่ยงคืน ต้องบวกวัน");

  const full = legacyEnd_(start, new Date(2026, 0, 7, 9, 0));
  assert.strictEqual(full.getDate(), 7, "แถวที่เก็บวันเวลาเต็มมาแล้วต้องใช้ตามนั้น");

  ["", null, "ไม่ระบุ"].forEach((v) =>
    assert.strictEqual(legacyEnd_(start, v), "", "ค่าที่อ่านไม่ออกต้องเว้นว่าง ไม่ใช่ Invalid Date"));
}

/* ═══ ตัวกรองช่วงวันที่ ═══ */
// ต้องอิงเวลาเครื่อง ไม่ใช่ UTC — ใบที่แจ้ง 06:00 เช้าในไทย ถ้าใช้ toISOString() จะกลายเป็นเมื่อวาน
const early = new Date(2026, 8, 19, 6, 0);
assert.strictEqual(ymd(early), "2026-09-19", "ใบเช้ามืดต้องอยู่ในวันที่แจ้งจริง");
assert.strictEqual(ymd(new Date(2026, 8, 19, 23, 59)), "2026-09-19");
assert.strictEqual(ymd(new Date(2026, 0, 5)), "2026-01-05", "เดือนและวันต้องเติมศูนย์หน้า");
assert.strictEqual(ymd(""), "", "ค่าว่างต้องได้ค่าว่าง ไม่ใช่ NaN");
// เทียบเป็นข้อความได้เพราะรูปแบบ YYYY-MM-DD เรียงตรงกับลำดับเวลา
assert.ok(ymd(new Date(2026, 8, 19)) >= "2026-09-01" && ymd(new Date(2026, 8, 19)) <= "2026-09-30");

/* ═══ ข้อความสำหรับไลน์ ═══ */
const lt = lineText({ ticket_id: "MT-0316/2569", machine_name: "Wpc crusher", priority: "ด่วน",
                      description: "มีเสียงดังผิดปกติ", reporter: "สมชาย", department: "ฝ่ายผลิต",
                      created_at: "2026-09-04T01:42:00.000Z", status: "รอซ่อม", assignee: "" });
assert.ok(lt.includes("MT-0316/2569") && lt.includes("[ด่วน]"), "ต้องมีเลขที่และความสำคัญ");
assert.ok(lt.includes("Wpc crusher") && lt.includes("มีเสียงดังผิดปกติ"));
assert.ok(lt.includes("สมชาย (ฝ่ายผลิต)"), "ผู้แจ้งต้องมีฝ่ายกำกับ");
assert.ok(lt.includes("ยังไม่มอบหมาย"), "ยังไม่จ่ายงานต้องบอกชัด ไม่ใช่เว้นว่าง");
assert.ok(lt.includes("https://example.test/exec"), "ต้องแนบลิงก์เปิดใบงาน");
assert.ok(!lt.includes("สาเหตุ:"), "ช่องที่ยังไม่กรอกต้องไม่โผล่เป็นบรรทัดว่าง");

/* ═══ อาการว่าง ต้องตกกลับไปแสดงสาเหตุ ═══ */
// ใบเก่า 95% กรอกอาการไว้ในช่องสาเหตุ ถ้าไม่ตกกลับ หน้ารายการจะว่างเปล่า
assert.strictEqual(symptom({ description: "มอเตอร์ไหม้", cause: "ลูกปืนแตก" }), "มอเตอร์ไหม้");
assert.strictEqual(symptom({ description: "", cause: "ลูกปืนแตก" }), "ลูกปืนแตก");
assert.strictEqual(symptom({ description: "", cause: "" }), "");
assert.strictEqual(symptom({}), "");

/* ═══ บังคับเลือกเครื่องจักรเฉพาะงานที่เป็นเครื่องจักร ═══ */
// กฎนี้ต้องตรงกับ needsMachine_ ใน Code.gs เป๊ะ ๆ ถ้าหลุดจากกันฝั่งใดฝั่งหนึ่งจะปฏิเสธใบผิด
["เครื่องจักร", "PM เครื่องจักร"].forEach((w) =>
  assert.ok(needsMachine(w), w + " ต้องบังคับเลือกเครื่องจักร"));
["งานโครงสร้างอาคารและสถานที่", "อุปกรณ์สำนักงาน", "งานสร้างใหม่", "ซ่อมบำรุงอาคาร", "", undefined]
  .forEach((w) => assert.ok(!needsMachine(w), String(w) + " ไม่ควรบังคับ"));

// งานที่ไม่มีเครื่องจักรต้องไม่โผล่เป็นแท่งไร้ชื่อในกราฟอันดับเครื่องจักร
const mixed = [...data, mk("C1", "", "2026-04-01T08:00:00Z", { cost: 900 })];
assert.ok(!machineStats(mixed).some((m) => !m.machine), "ต้องไม่มีรายการชื่อว่างในสถิติรายเครื่อง");

/* ═══ ตัวอ่านพารามิเตอร์จากโปรเจคอื่น ═══ */
// อ่านชีตที่เราไม่ได้ออกแบบเอง จึงต้องเดาหัวคอลัมน์ให้ถูกทั้งทรง long และ wide
// เดาพลาด = หน้าเว็บว่างเปล่าโดยไม่มีใครรู้ว่าทำไม
{
  const makeSheet = (name, values) => ({
    getName: () => name,
    getLastRow: () => values.length,
    getLastColumn: () => (values[0] || []).length,
    getDataRange: () => ({ getValues: () => values.map((r) => r.slice()) }),
    getRange: (r, c, nr, nc) => ({ getValues: () => [values[r - 1].slice(c - 1, c - 1 + nc)] }),
  });

  const run = (sheets, machine) => {
    const gas = {};
    vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
    gas.PropertiesService = {
      getScriptProperties: () => ({ getProperty: (k) => (k === "PARAM_SHEET_ID" ? "FAKE" : "") }),
    };
    gas.SpreadsheetApp = { openById: () => ({ getName: () => "ไฟล์พารามิเตอร์", getSheets: () => sheets }) };
    gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
    gas.Utilities = {
      formatDate: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` +
                         `-${String(d.getDate()).padStart(2, "0")}`,
    };
    gas.cfg_ = () => "";                      // ไม่ตั้งค่าทับ = ต้องเดาเอาเองให้ได้
    gas.requireAuth_ = () => ({ name: "ช่างชล", role: "LEAD" });
    gas.canonical_ = (x) => String(x || "").trim();
    return gas.apiParamData("t", machine, "", "");
  };

  const d1 = new Date(2026, 8, 20, 8, 0), d2 = new Date(2026, 8, 21, 8, 0);
  const spec = makeSheet("พิกัดพารามิเตอร์", [
    ["เครื่องจักร", "พารามิเตอร์", "หน่วย", "ค่าต่ำสุด", "ค่ามาตรฐาน", "ค่าสูงสุด"],
    ["Ext3", "อุณหภูมิ", "°C", 165, 175, 185],
  ]);

  // ทรง long — แถวละหนึ่งค่า
  const long = run([spec, makeSheet("บันทึกพารามิเตอร์", [
    ["ประทับเวลา", "วันที่", "กะ", "เครื่องจักร", "พารามิเตอร์", "ค่า", "ผู้บันทึก"],
    ["", d1, "กะเช้า", "Ext3", "อุณหภูมิ", 170, "ชล"],
    ["", d2, "กะเช้า", "Ext3", "อุณหภูมิ", 191, "ชล"],
  ])], "Ext3");
  assert.strictEqual(long.layout, "long");
  assert.strictEqual(long.rows.length, 2);
  assert.strictEqual(long.rows[0].status, "ปกติ");
  assert.strictEqual(long.rows[1].status, "สูงกว่าพิกัด", "เกินค่าสูงสุดต้องถูกจับได้");
  assert.strictEqual(long.rows[0].unit, "°C", "หน่วยต้องดึงมาจากตารางพิกัด");

  // ทรง wide — แถวละหนึ่งกะ คอลัมน์ที่เหลือคือพารามิเตอร์ (ทรงของ Google Form)
  const wide = run([makeSheet("Form Responses 1", [
    ["ประทับเวลา", "เครื่องจักร", "กะ", "อุณหภูมิ", "ความเร็วสกรู", "ผู้บันทึก"],
    [d1, "Ext3", "กะเช้า", 170, 16, "ชล"],
    [d2, "Ext3", "กะบ่าย", 191, "", "ชล"],
  ])], "Ext3");
  assert.strictEqual(wide.layout, "wide");
  assert.strictEqual(wide.rows.length, 3, "ช่องว่างคือไม่ได้วัด ต้องไม่กลายเป็น 0");
  assert.ok(wide.rows.every((r) => r.value !== 0));
  assert.strictEqual(wide.machines.join(), "Ext3");

  // บันทึกซ้ำกะเดิม = แก้ค่า เก็บแถวท้ายสุด ไม่ใช่สองจุดซ้อนกันบนกราฟ
  const dup = run([makeSheet("param", [
    ["วันที่", "กะ", "เครื่องจักร", "พารามิเตอร์", "ค่า"],
    [d1, "กะเช้า", "Ext3", "อุณหภูมิ", 170],
    [d1, "กะเช้า", "Ext3", "อุณหภูมิ", 178],
  ])], "");
  assert.strictEqual(dup.rows.length, 1);
  assert.strictEqual(dup.rows[0].value, 178, "ค่าที่แก้ทีหลังต้องชนะ");

  // ไม่มีคอลัมน์เครื่องจักร = บอกให้ไปตั้งค่า ไม่ใช่เงียบแล้วโชว์ตารางว่าง
  assert.throws(() => run([makeSheet("x", [["วันที่", "ค่า"], [d1, 1]])], ""),
    /ตั้งค่า/, "หาคอลัมน์เครื่องจักรไม่เจอต้อง error ที่อ่านรู้เรื่อง");
}

/* ═══ มอบหมายงานได้หลายคน ═══ */
// เก็บหลายชื่อไว้ในช่องเดียวคั่นด้วยจุลภาค เทียบด้วย indexOf บนสตริงดิบไม่ได้เด็ดขาด
// "ชล" กับ "ช่างชล" เป็นคนละคน แต่ชื่อหนึ่งเป็นสับสตริงของอีกชื่อ
assert.strictEqual(nameList("ช่างชล, ช่างตั้ม ,ชล").join("|"), "ช่างชล|ช่างตั้ม|ชล");
assert.strictEqual(nameList("").length, 0);
assert.strictEqual(nameList(null).length, 0);
assert.strictEqual(nameList("ช่างชล,,  ,ช่างตั้ม").join("|"), "ช่างชล|ช่างตั้ม", "ช่องว่างกลางต้องถูกทิ้ง");

assert.ok(!hasName("ช่างชล", "ชล"), "ชื่อที่เป็นสับสตริงของอีกชื่อ ห้ามแมตช์กัน");
assert.ok(hasName("ช่างชล", "ช่างชล"));
assert.ok(hasName("ช่างตั้ม, ช่างเบิร์ด, ชล", "ชล"), "ชื่อสั้นที่อยู่ในรายการจริงต้องแมตช์");
assert.ok(!hasName("ช่างตั้ม, ช่างเบิร์ด", "ช่างชล"));
assert.ok(!hasName("", "ช่างชล"));
assert.ok(!hasName(undefined, "ช่างชล"));

// กฎเดียวกันต้องอยู่ฝั่ง server ด้วย ไม่งั้นอีเมลแจ้งมอบหมายจะส่งผิดคน
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  assert.strictEqual(gas.nameList_("ช่างชล, ชล").join("|"), "ช่างชล|ชล");
  assert.strictEqual(gas.nameList_("").length, 0);
  assert.strictEqual(gas.nameList_(null).length, 0);
}

/* ═══ แคชข้ามคำขอ ═══ */
// แคชล่มต้องไม่ทำให้ระบบล่มตาม — ต้องตกกลับไปอ่านชีตเงียบ ๆ
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };

  const store = {};
  gas.CacheService = { getScriptCache: () => ({
    get: (k) => (k in store ? store[k] : null),
    put: (k, v) => { store[k] = v; },
    removeAll: (ks) => ks.forEach((k) => delete store[k]),
  }) };

  gas.cachePut_("k", { a: 1, ไทย: "ได้" });
  assert.deepStrictEqual(gas.cacheGet_("k").a, 1);
  assert.strictEqual(gas.cacheGet_("k")["ไทย"], "ได้", "ภาษาไทยต้องผ่าน JSON ได้");
  assert.strictEqual(gas.cacheGet_("ไม่มีคีย์นี้"), null);

  /* ก้อนใหญ่เกินเพดานต้องถูกข้าม ไม่ใช่โยน error
     เพดานของ CacheService คิดเป็นไบต์ ภาษาไทยกินตัวละ 3 ไบต์
     เคยเช็คด้วย .length แล้วประเมินต่ำไป 3 เท่า — เทสต์นี้กันไม่ให้พลาดซ้ำ */
  gas.cachePut_("ok", { x: "ก".repeat(20000) });
  assert.ok(gas.cacheGet_("ok"), "20,000 ตัว = 60,000 ไบต์ ยังอยู่ในเพดาน");
  gas.cachePut_("big", { x: "ก".repeat(40000) });
  assert.strictEqual(gas.cacheGet_("big"), null, "40,000 ตัว = 120,000 ไบต์ ต้องถูกข้าม");

  // CacheService พังทั้งตัว
  gas.CacheService = { getScriptCache: () => { throw new Error("cache down"); } };
  assert.strictEqual(gas.cacheGet_("k"), null, "อ่านแคชพังต้องคืน null ไม่ใช่ throw");
  assert.doesNotThrow(() => gas.cachePut_("k", { a: 1 }), "เขียนแคชพังต้องไม่ throw");
  assert.doesNotThrow(() => gas.clearCache(), "ล้างแคชพังต้องไม่ throw");
}

/* ═══ ส่งซ่อมภายนอก: เลยกำหนดรับคืนหรือยัง ═══ */
{
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString();
  assert.strictEqual(backLate({ status: STATUS.OUT, expect_back: day(-2) }), true, "เลยมา 2 วัน");
  assert.strictEqual(backLate({ status: STATUS.OUT, expect_back: day(2) }), false, "ยังไม่ถึงกำหนด");
  // นัดรับ "วันนี้" ตอนเช้า ยังไม่ถือว่าเลยกำหนด — เทียบที่ระดับวัน ไม่ใช่ timestamp
  assert.strictEqual(backLate({ status: STATUS.OUT, expect_back: day(0) }), false, "วันนี้ยังไม่เลย");
  assert.strictEqual(backLate({ status: STATUS.OUT, expect_back: "" }), false, "ไม่ได้ใส่กำหนดไว้");
  assert.strictEqual(backLate({ status: STATUS.REPAIR, expect_back: day(-9) }), false,
    "ของกลับมาแล้ว ไม่ต้องเตือนเรื่องรับคืนอีก");
}

/* ═══ กระดิ่งแจ้งเตือน ═══ */
{
  const yday = new Date(Date.now() - 864e5).toISOString();
  sandbox.setME({ name: "ช่างชล", role: "TECH" });
  sandbox.setTickets([
    { ticket_id: "T1", machine_name: "Cut Slot2", assignee: "ช่างชล", status: STATUS.WAIT },
    { ticket_id: "T2", machine_name: "Die Cut",   assignee: "ช่างเอ",  status: STATUS.WAIT },
    { ticket_id: "T3", machine_name: "Mixer",     assignee: "ช่างชล", status: STATUS.REPAIR,
      rejection_note: "ยังมีเสียงดัง", reject_count: 1 },
    { ticket_id: "T4", machine_name: "Press",     assignee: "ช่างชล", status: STATUS.REPAIR, due_at: yday },
    { ticket_id: "T5", machine_name: "Saw",       assignee: "ช่างชล", status: STATUS.DONE },
  ]);

  let keys = notifItems().map((x) => x.key);
  assert.ok(keys.includes("new:T1"), "งานใหม่ของตัวเองต้องเด้ง");
  assert.ok(!keys.some((k) => k.endsWith(":T2")), "งานของคนอื่นต้องไม่เด้ง");
  assert.ok(keys.includes("rej:T3:1"), "งานที่ถูกส่งกลับต้องเด้ง");
  assert.ok(keys.includes("late:T4:" + ymd(yday)), "งานเลยกำหนดต้องเด้ง");
  assert.ok(!keys.some((k) => k.endsWith(":T5")), "งานที่ปิดแล้วต้องไม่เด้ง");

  /* คีย์ต้องมีจำนวนครั้งที่ส่งกลับอยู่ด้วย ไม่งั้นคนที่กดอ่านรอบแรกแล้ว
     จะไม่มีทางรู้เลยว่าโดนส่งกลับรอบสอง */
  sandbox.setTickets([{ ticket_id: "T3", machine_name: "Mixer", assignee: "ช่างชล",
    status: STATUS.REPAIR, rejection_note: "ยังไม่หาย", reject_count: 2 }]);
  assert.ok(notifItems().map((x) => x.key).includes("rej:T3:2"), "ส่งกลับรอบสองต้องได้คีย์ใหม่");

  // ช่างธรรมดาไม่ต้องรับรู้ว่างานที่ไม่ใช่ของตัวเองยังไม่มีคนรับ นั่นเป็นงานของหัวหน้า
  sandbox.setTickets([{ ticket_id: "T9", machine_name: "Lathe", assignee: "", status: STATUS.WAIT }]);
  assert.strictEqual(notifItems().length, 0, "ช่างไม่เห็นงานที่ยังไม่มอบหมาย");
  sandbox.setME({ name: "หัวหน้าเอ", role: "LEAD" });
  assert.ok(notifItems().map((x) => x.key).includes("free:T9"), "หัวหน้าต้องเห็นงานที่ยังไม่จ่าย");

  sandbox.setME(null);
  assert.strictEqual(notifItems().length, 0, "ยังไม่ล็อกอิน = ไม่รู้ว่า \"ฉัน\" คือใคร");
  sandbox.setTickets([]);
}

/* ═══ จัดการงานทีละหลายใบ ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };
  gas.requireAuth_ = () => ({ name: "หัวหน้าเอ", role: "LEAD" });

  let calls = [];
  gas.updateTicketInternal_ = (id, changes, ctx) => {
    if (id === "X9") throw new Error("ไม่พบใบแจ้งซ่อม X9");
    calls.push({ id, changes, ctx });
    return { ok: true };
  };

  let mails = [];
  gas.sendMail_ = (to, subj) => mails.push({ to, subj });
  gas.emailOf_ = (n) => n + "@test";
  gas.ticketLink_ = () => "";

  let r = gas.apiBulkUpdate("tok", ["A1", "A2", "A1"], { assignee: "ช่างชล" });
  assert.strictEqual(r.done, 2, "เลือกซ้ำต้องไม่กลายเป็นเขียนซ้ำ");
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].ctx.quiet, true, "ต้องปิดเมลรายใบ");
  assert.strictEqual(mails.length, 1, "จ่ายงาน 2 ใบให้คนเดียว ต้องส่งเมลฉบับเดียว");

  // ฟิลด์นอกรายการต้องถูกทิ้ง ไม่ใช่เขียนตามที่หน้าเว็บส่งมา
  calls = [];
  gas.apiBulkUpdate("tok", ["A1"], { status: "กำลังซ่อม", cost: 99999, verified_by: "ใครก็ไม่รู้" });
  assert.deepStrictEqual(Object.keys(calls[0].changes).join("|"), "status");

  // ปิดงานหลายใบพร้อมกันไม่ได้ — ISO ต้องมีผู้ตรวจรับเซ็นรายใบ
  assert.throws(() => gas.apiBulkUpdate("tok", ["A1"], { status: "ซ่อมเสร็จสมบูรณ์" }), /ตรวจรับ/);
  assert.throws(() => gas.apiBulkUpdate("tok", [], { status: "รอซ่อม" }), /ยังไม่ได้เลือกใบ/);
  assert.throws(() => gas.apiBulkUpdate("tok", ["A1"], { cost: 1 }), /ยังไม่ได้เลือกสิ่งที่จะแก้/);
  assert.throws(() => gas.apiBulkUpdate("tok", new Array(51).fill(0).map((_, i) => "T" + i),
    { status: "รอซ่อม" }), /ไม่เกิน 50/);

  // ใบที่พังต้องไม่ล้มทั้งชุด — ที่เหลือต้องไปต่อและรายงานกลับว่าใบไหนไม่ผ่าน
  calls = [];
  r = gas.apiBulkUpdate("tok", ["A1", "X9", "A2"], { priority: "ด่วน" });
  assert.strictEqual(r.done, 2);
  assert.strictEqual(r.failed.length, 1);
  assert.ok(r.failed[0].indexOf("X9") === 0);
}

/* ═══ เตือนช่าง: ของที่ส่งออกไปข้างนอกค้างคนละแบบ ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };
  gas.cfg_ = (k, d) => d;
  gas.ticketLink_ = () => "";
  gas.emailOf_ = (n) => n + "@test";

  const sent = [];
  gas.sendMail_ = (to, subj, body) => sent.push({ to, subj, body });

  const old = new Date(Date.now() - 10 * 864e5).toISOString();
  const soon = new Date(Date.now() + 5 * 864e5).toISOString();
  const past = new Date(Date.now() - 1 * 864e5).toISOString();

  gas.rowsToObjects_ = () => [
    { ticket_id: "O1", machine_name: "Cut", assignee: "ช่างชล", created_at: old,
      status: "ส่งซ่อมภายนอก", expect_back: soon },
    { ticket_id: "O2", machine_name: "Die", assignee: "ช่างชล", created_at: old,
      status: "ส่งซ่อมภายนอก", expect_back: past },
    { ticket_id: "O3", machine_name: "Saw", assignee: "ช่างชล", created_at: old,
      status: "ส่งซ่อมภายนอก", expect_back: "" },
  ];
  gas.nudgeAssignees();
  assert.strictEqual(sent.length, 1);
  const body = sent[0].body;
  assert.ok(body.indexOf("O1") === -1, "ยังไม่ถึงกำหนดรับคืน = รออยู่ตามปกติ ไม่ใช่งานค้าง");
  assert.ok(body.indexOf("O2") > -1, "เลยกำหนดรับคืนแล้วต้องเตือนให้ตามของ");
  assert.ok(body.indexOf("O3") > -1, "ไม่ได้ใส่กำหนดไว้ = ไม่มีใครถือกำหนดอยู่เลย ต้องเตือน");
}

/* ═══ เมลรายวันต้องอ่านชื่อของที่ส่งซ่อมภายนอกทุกใบ ไม่ใช่เฉพาะที่เลยกำหนด ═══
   nudgeAssignees เตือนตอนเลยกำหนดซึ่งสายไปแล้ว ฉบับนี้คือตัวที่ทำให้มีคนโทรตามก่อน */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };
  gas.cfg_ = (k, d) => d;
  gas.ticketLink_ = () => "";
  gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  gas.Utilities = { formatDate: (d) => {
    const q = (n) => String(n).padStart(2, "0");
    return `${q(d.getDate())}/${q(d.getMonth() + 1)}/`;
  } };

  const sent = [];
  gas.sendMail_ = (to, subj, body) => sent.push(body);

  const soon = new Date(Date.now() + 5 * 864e5).toISOString();
  const past = new Date(Date.now() - 3 * 864e5).toISOString();

  gas.rowsToObjects_ = () => [
    { ticket_id: "O1", machine_name: "Cut", status: "ส่งซ่อมภายนอก",
      vendor: "ร้านลับคม", expect_back: soon, created_at: soon },
    { ticket_id: "O2", machine_name: "Die", status: "ส่งซ่อมภายนอก",
      vendor: "", expect_back: past, created_at: past },
    { ticket_id: "D1", machine_name: "Saw", status: "ซ่อมเสร็จสมบูรณ์", created_at: past },
  ];
  gas.dailyDigest();
  const body = sent[0];
  assert.ok(body.indexOf("O1") > -1, "ยังไม่ถึงกำหนดก็ต้องรายงานความคืบหน้า");
  assert.ok(body.indexOf("ร้านลับคม") > -1, "ต้องบอกว่าของอยู่ที่ใคร ไม่งั้นไม่รู้จะโทรหาใคร");
  assert.ok(body.indexOf("เลยกำหนดรับคืนมา 3 วัน") > -1, "เลยกำหนดต้องบอกเป็นจำนวนวัน");
  assert.ok(body.indexOf("ยังไม่ได้ระบุผู้รับซ่อม") > -1);
  assert.ok(body.indexOf("D1") === -1, "ใบที่ปิดแล้วต้องไม่อยู่ในสรุปงานค้าง");
}

/* ═══ เลี้ยงเบียร์ช่าง — ประเภทใหม่ในชีตความคิดเห็นใบเดิม ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.SpreadsheetApp = { flush: () => {} };
  gas.writeAudit_ = () => {};
  gas.sendMail_ = () => {};
  gas.cfg_ = (k, d) => d;

  const rows = [];
  gas.writeFeedback_ = (r) => rows.push(r);

  // ไม่ต้องเลือกแผนก — เป็นการขอบคุณ ไม่ใช่เรื่องร้องเรียนที่ต้องตามกลับไปหาต้นเรื่อง
  gas.apiSendFeedback({ type: "เลี้ยงเบียร์ช่าง", subject: "ช่างตั้ม", detail: "ขอบคุณครับ", dept: "" });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].subject, "ช่างตั้ม", "ชื่อช่างต้องอยู่ในช่องเรื่อง ไม่งั้นนับยอดรายคนไม่ได้");

  // ประเภทอื่นยังต้องเลือกแผนกเหมือนเดิม
  assert.throws(() => gas.apiSendFeedback({ type: "ชมเชย", subject: "ดีมาก", dept: "" }), /แผนก/);
  // ประเภทมั่ว ๆ ยังถูกปฏิเสธ การเปิดรับเบียร์ต้องไม่เปิดรับทุกอย่าง
  assert.throws(() => gas.apiSendFeedback({ type: "อะไรก็ได้", subject: "x", dept: "ผลิต" }), /ประเภท/);
  // เลือกช่างไม่ครบต้องบอกให้ตรงเรื่อง ไม่ใช่ "กรุณากรอกหัวข้อเรื่อง"
  assert.throws(() => gas.apiSendFeedback({ type: "เลี้ยงเบียร์ช่าง", subject: "" }), /เลือกช่าง/);
}

/* ═══ QR พร้อมเพย์ — คนตั้งค่าพิมพ์เบอร์ ไม่ได้ไปแคปรูป QR มาวาง ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);

  // ชุดทดสอบมาตรฐานของ CRC-16/CCITT-FALSE — ผิดแม้แต่บิตเดียวธนาคารปฏิเสธทั้งใบ
  assert.strictEqual(gas.crc16_("123456789"), "29B1");

  const pp = gas.promptPayPayload_;
  const phone = pp("0812345678");
  // ค่าที่ธนาคารเช็คจริงคือ CRC ท้ายสุดต้องตรงกับที่คำนวณจากทุกตัวอักษรก่อนหน้า
  assert.strictEqual(gas.crc16_(phone.slice(0, -4)), phone.slice(-4));

  /* อ่าน payload กลับเป็น tag-length-value แบบเดียวกับที่แอปธนาคารอ่าน
     เช็คด้วยการค้นหาข้อความตรง ๆ ไม่พอ เพราะตัวเลขสองหลักไปโผล่ซ้ำในค่าของ tag อื่นได้ */
  const tlv = (str) => {
    const out = {};
    for (let i = 0; i + 4 <= str.length; ) {
      const id = str.slice(i, i + 2), n = Number(str.slice(i + 2, i + 4));
      out[id] = str.slice(i + 4, i + 4 + n);
      i += 4 + n;
    }
    return out;
  };
  const tags = tlv(phone);
  assert.strictEqual(tags["00"], "01", "เวอร์ชันของรูปแบบ");
  assert.strictEqual(tags["01"], "11", "QR ต้องใช้ซ้ำได้ ไม่ใช่ครั้งเดียวจบ");
  assert.strictEqual(tags["53"], "764", "สกุลเงินบาท");
  assert.strictEqual(tags["58"], "TH");
  assert.strictEqual(tags["54"], undefined, "ต้องไม่ผูกยอดเงิน — คนโอนพิมพ์เองว่าจะเลี้ยงเท่าไหร่");
  assert.strictEqual(tlv(tags["29"])["00"], "A000000677010111", "AID ของพร้อมเพย์");
  assert.strictEqual(tlv(tags["29"])["01"], "0066812345678", "เบอร์ต้องตัด 0 หน้าแล้วเติม 0066");

  // เครื่องหมายขีดที่คนพิมพ์ติดมาต้องไม่ทำให้พัง
  assert.strictEqual(pp("081-234-5678"), phone);
  assert.strictEqual(tlv(tlv(pp("1234567890123"))["29"])["02"], "1234567890123", "เลขบัตรประชาชน");
  assert.strictEqual(tlv(tlv(pp("012345678901234"))["29"])["03"], "012345678901234", "e-Wallet");

  // ไม่ใช่รูปแบบที่รู้จัก = ไม่ใช่พร้อมเพย์ ผู้เรียกจะได้ไปลองตีความเป็นรูปแทน
  ["", "abc", "0812345", "https://drive.google.com/file/d/xxx/view"].forEach((v) =>
    assert.strictEqual(pp(v), "", JSON.stringify(v)));

  // ใส่เบอร์ไว้ = ไม่ต้องไปหารูป สองทางนี้ต้องไม่โผล่พร้อมกัน
  gas.cfg_ = () => "0812345678";
  assert.strictEqual(gas.beerQrUrl_(), "");
}

/* ═══ QR เลี้ยงเบียร์แบบรูป — รับลิงก์แชร์ Drive ได้ ไม่ใช่เฉพาะ id เปล่า ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  const qr = (v) => { gas.cfg_ = () => v; return gas.beerQrUrl_(); };

  assert.strictEqual(qr(""), "", "ไม่ได้ตั้งค่าไว้ = ไม่โชว์ช่องทางโอน");
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz01234";
  assert.ok(qr(id).indexOf(id) > -1);
  // ลิงก์แชร์ทั้งเส้นคือสิ่งที่คนวางมาจริง ๆ — เคยทำใบแจ้งซ่อมหายมาแล้วตอนตั้ง DRIVE_FOLDER_ID
  assert.strictEqual(qr("https://drive.google.com/file/d/" + id + "/view?usp=drive_link"), qr(id));
  assert.strictEqual(qr("https://i.example.com/pay.png"), "https://i.example.com/pay.png",
                     "URL รูปจากที่อื่นต้องใช้ตรง ๆ ไม่ใช่ไปตีความเป็น id ของ Drive");
}

/* ═══ รายละเอียดใต้การ์ด KPI — ตัวเลขที่ตรวจสอบไม่ได้คือตัวเลขที่ไม่มีใครเชื่อ ═══ */
{
  /* ตั้งใจวางใบพัดลม (ที่ไม่ควรถูกนับ) ไว้ "ตัวแรก" และใบที่ทันกำหนดไว้ก่อนใบที่เลย
     ถ้าเรียงไม่ทำงาน ลำดับจะยังเป็นแบบนี้ เทสต์จึงจับได้จริง ไม่ใช่ผ่านเพราะบังเอิญ */
  const rows = [
    mk("D3", "พัดลมสำหรับคน Ext 1", "2026-01-07T08:00:00Z",
       { status: STATUS.DONE, completed_at: "2026-01-07T18:00:00Z" }),
    mk("D1", "Cut Slot2", "2026-01-05T08:00:00Z",
       { status: STATUS.DONE, completed_at: "2026-01-05T18:00:00Z", due_at: "2026-01-06T08:00:00Z" }),
    mk("D2", "Cut Slot2", "2026-01-06T08:00:00Z",
       { status: STATUS.DONE, completed_at: "2026-01-09T08:00:00Z", due_at: "2026-01-07T08:00:00Z" }),  // เลยกำหนด
  ];
  sandbox.setMachines([
    { name: "Cut Slot2", group: "เครื่องจักรหลัก" },
    { name: "พัดลมสำหรับคน Ext 1", group: "เครื่องใช้ไฟฟ้า" },
  ]);
  // drill ของ %Breakdown ตัดเวลาตามเดือน จึงต้องบอกปี/เดือน และชุดใบที่ใช้ตัด
  const p = { list: rows, pm: { workHours: 100 }, year: 2026, month: "01", all: rows };
  const k = kpiSummary(rows, 72, p.pm, 30, periodWindow(p));

  // ใบที่เลยกำหนดต้องขึ้นก่อน และถูกทำเครื่องหมายว่าผิดปกติ
  const ot = kpiDrill("onTime", k, p, 72);
  assert.strictEqual(ot.rows.length, 3);
  assert.strictEqual(ot.rows[0].cells[0], "D2", "ใบที่เลยกำหนดต้องอยู่บนสุด");
  assert.strictEqual(ot.rows[0].bad, true);
  assert.strictEqual(ot.rows[1].bad, false);

  /* %Breakdown ต้องแสดงทั้งใบที่นับและใบที่ถูกตัดทิ้งพร้อมเหตุผล
     ถ้าโชว์แต่ใบที่นับ คนจะสงสัยว่าทำไมใบที่ตัวเองปิดไปหายไป แล้วเลิกเชื่อตัวเลข */
  const bd = kpiDrill("breakdown", k, p, 72);
  assert.strictEqual(bd.rows.length, 3, "ต้องแสดงทุกใบที่ปิดแล้ว ไม่ใช่เฉพาะใบที่นับ");
  assert.strictEqual(bd.rows.filter((r) => r.bad).length, 1, "พัดลมต้องถูกทำเครื่องหมายว่าไม่นับ");
  assert.strictEqual(bd.rows[2].cells[0], "D3", "ใบที่ไม่นับต้องไปอยู่ท้ายสุด");
  assert.ok(bd.rows[2].cells[6].indexOf("ไม่นับ") > -1, bd.rows[2].cells[6]);
  // คอลัมน์เวลาต้องอยู่คู่กัน — ใบที่ไม่ได้ลงเวลาซ่อมต้องบอกตรง ๆ ไม่ใช่โชว์ 0
  assert.strictEqual(bd.head.slice(3, 6).join("|"),
    "หยุดในเดือนนี้|ทั้งใบ (คร่อมเดือน)|ช่างลงมือในเดือนนี้");
  assert.ok(bd.rows[0].cells[5].indexOf("ไม่ได้ลงเวลาซ่อม") > -1, bd.rows[0].cells[5]);
  // ใบที่ไม่คร่อมเดือนต้องขึ้น "—" ไม่ใช่เลขซ้ำกับคอลัมน์ซ้าย
  assert.strictEqual(bd.rows[0].cells[4], "—", "ใบที่อยู่ในเดือนเดียวไม่ต้องโชว์ความยาวทั้งใบ");

  /* ยอดรวมต้องอยู่ที่หัวคอลัมน์เวลา และต้องเป็นเลขเดียวกับที่การ์ดใช้
     ถ้าหัวตารางรวมทุกแถวที่แสดง จะรวมใบพัดลมเข้าไปด้วยแล้วไม่ตรงกับการ์ด */
  assert.ok(bd.sums[3].includes(fmtDuration(k.machineDowntime)), bd.sums[3]);
  assert.ok(bd.sums[5].includes(fmtDuration(k.machineWrench)), bd.sums[5]);
  assert.strictEqual(bd.sums[0], null, "คอลัมน์ที่ไม่ใช่ตัวเลขต้องไม่มียอดรวม");
  assert.strictEqual(bd.sums.length, bd.head.length, "ยอดรวมต้องเรียงตรงกับหัวคอลัมน์");
  // D1 10 ชม. + D2 72 ชม. = 82 · พัดลม 10 ชม. ต้องไม่ถูกบวกเข้าไป (ถ้าบวกจะได้ 92)
  assert.strictEqual(k.machineDowntime, 82, "ยอดรวมต้องนับเฉพาะใบของเครื่องจักรผลิต");

  // ซ่อมซ้ำนับเป็น "เครื่อง" ไม่ใช่ "ใบ" — รายการจึงต้องเป็นรายเครื่อง
  const rp = kpiDrill("repeat", k, p, 72);
  assert.strictEqual(rp.rows.length, 2, "2 เครื่อง ไม่ใช่ 3 ใบ");
  assert.strictEqual(rp.rows[0].cells[0], "Cut Slot2");
  assert.strictEqual(rp.rows[0].bad, true, "แจ้ง 2 ครั้ง = นับเป็นซ่อมซ้ำ");
  assert.strictEqual(rp.rows[1].bad, false);

  /* กดที่เครื่องแล้วต้องเข้าไปเห็นใบของเครื่องนั้น — ตัวเลข "แจ้ง 2 ครั้ง" อย่างเดียว
     ยังแยกไม่ออกว่าเป็นอาการเดียวกันซ้ำ (ซ่อมไม่หาย) หรือคนละเรื่องกัน (เครื่องเก่า) */
  assert.strictEqual(rp.rows[0].into, "Cut Slot2", "แถวรายเครื่องต้องกดเข้าไปต่อได้");
  const inner = kpiDrill("repeatMachine", k, p, 72, "Cut Slot2");
  assert.strictEqual(inner.rows.length, 2);
  assert.strictEqual(inner.back, true, "ชั้นในต้องมีปุ่มย้อนกลับ");
  assert.strictEqual(inner.rows[0].cells[0].indexOf("5/1/") > -1, true, "เรียงเก่า→ใหม่ ไม่ใช่ใหม่→เก่า");
  assert.ok(inner.rows[0].cells[4].indexOf("ครั้งแรก") > -1, inner.rows[0].cells[4]);
  assert.ok(inner.rows[1].cells[4].indexOf("1 วัน") > -1, inner.rows[1].cells[4]);
  assert.strictEqual(inner.rows[1].id, "D2", "กดแถวแล้วต้องเปิดใบนั้นได้");
  // เครื่องที่ไม่มีใบเลยต้องได้ตารางว่าง ไม่ใช่พัง
  assert.strictEqual(kpiDrill("repeatMachine", k, p, 72, "ไม่มีเครื่องนี้").rows.length, 0);

  assert.strictEqual(kpiDrill("ไม่มีชุดนี้", k, p, 72), null);
  sandbox.setMachines([]);
}

/* ═══ พารามิเตอร์เครื่องจักร — ทรง kv ของโปรเจคระบบบันทึกพารามิเตอร์ ═══
   ต้นทางยังไม่ได้ deploy จริง ชุดนี้จึงจำลองชีต Machines + Logs ตามรูปแบบที่ตกลงกันไว้
   สิ่งที่ต้องกันไว้ให้แน่นคือ "ตัดสินผ่าน/ไม่ผ่านเหมือนต้นทางเป๊ะ" — ถ้าเพี้ยน
   สองระบบจะบอกคนละอย่างกับค่าเดียวกัน ซึ่งแย่กว่าไม่มีหน้านี้เลย */
/* วัตถุที่สร้างในแซนด์บ็อกซ์ของ vm คนละ prototype กับฝั่งเทสต์ deepStrictEqual จึงไม่ผ่านทั้งที่ค่าตรงกัน */
const J = (v) => JSON.stringify(v);

function paramGas() {
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  gas.Utilities = { formatDate: (d) => {
    const q = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${q(d.getMonth() + 1)}-${q(d.getDate())}`;
  } };
  gas.prop_ = () => "PARAM_FILE";
  gas.cfg_ = (k, d) => d;
  gas.requireAuth_ = () => ({ name: "ช่างชล", role: "LEAD" });
  gas.writeAudit_ = () => {};
  gas.machines_ = () => [
    { name: "Extrusion 2 - 92", code: "SM-B4-EX-02", aliases: ["Ext2-92"] },
    { name: "UV 2", code: "SM-B3-UV-02", aliases: ["UV2"] },
  ];

  const MACHINES = [
    ["machineId", "name", "fields", "std", "tol", "remark", "form"],
    ["EXT2-92", "Extrusion 92-188",
     "#ข้อมูลงานที่ผลิต;product:Product / รหัสสินค้า:text;thickness:ความหนา:text;" +
     "#อุณหภูมิ Extruder;z1:ZONE 1 (°C):num;z2:ZONE 2 (°C):num;z3:ZONE 3 (°C):num;" +
     "#พารามิเตอร์เทคนิค;speed:SPEED (รอบสกรู):num;amp:AMP. (กระแสมอเตอร์):num",
     "z1=180;z2=180;z3=180;speed=45", "z1=10;speed=2;*=5", "บวก-ลบ ไม่เกิน 10 องศา", "FM-MT-11 Rev.00"],
    ["UV2", "UV 2 (SM-B4-UV-02)", "#ความเข้มแสง;uv1:หลอดที่ 1 (mj/cm²):num", "uv1=160", "20", "", "FM-MT-13 Rev.00"],
    ["TF1", "Transfer 1", "#ทั่วไป;t1:อุณหภูมิ (°C):num", "", "", "", "FM-MT-22 Rev.00"],
  ];
  const LOGS = [
    ["date", "round", "machine", "operator", "status", "data", "remark", "savedAt"],
    ["2026-09-28", "7.00", "EXT2-92", "ช่างสมชาย", "เดินเครื่องผลิต", "product=Modern Beige;z1=181;z2=182;z3=180;speed=45;amp=81", "", ""],
    ["2026-09-29", "7.00", "UV2", "ช่างอนุชา", "หยุดเครื่อง", "uv1=0", "ซ่อมสายพาน", ""],
    ["2026-09-29", "16.00", "EXT2-92", "ช่างวิรัตน์", "เดินเครื่องผลิต", "product=Modern Beige;z1=201;z2=201;z3=183.5;speed=45.5;amp=81", "", ""],
  ];
  const mk = (rows) => ({
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0].length,
    getName: () => "sheet",
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    getRange: (a, b, c, d) => ({ getValues: () => [rows[0].slice()] }),
  });
  gas.paramSS_ = () => ({
    getName: () => "ไฟล์พารามิเตอร์",
    getSheetByName: (n) => (n === "Machines" ? mk(MACHINES) : null),
    getSheets: () => [mk(MACHINES), Object.assign(mk(LOGS), { getName: () => "Logs" })],
  });
  gas.paramLogSheet_ = () => Object.assign(mk(LOGS), { getName: () => "Logs" });
  return gas;
}

{
  const gas = paramGas();

  // ── ตัวแยกข้อความ ยกมาจากต้นทาง ต้องให้ผลเหมือนกันทุกกรณี ──
  assert.strictEqual(J(gas.kvParse_("z1=196;m1=60")), J({ z1: "196", m1: "60" }));
  assert.strictEqual(J(gas.kvParse_("")), "{}", "เซลล์ว่างต้องไม่พัง");
  assert.strictEqual(J(gas.kvParse_("=5;x=")), J({ x: "" }), "key ว่างต้องถูกทิ้ง ค่าว่างต้องเก็บไว้");

  const tol = gas.kvTol_("z1=10;speed=2;*=5");
  assert.strictEqual(gas.kvTolFor_(tol, "z1"), 10);
  assert.strictEqual(gas.kvTolFor_(tol, "speed"), 2);
  // ฟิลด์ในเครื่องเดียวกันคนละหน่วย ±10 ที่ถูกกับ °C ไร้ความหมายกับ % จึงต้องมีค่าตั้งต้น
  assert.strictEqual(gas.kvTolFor_(tol, "อะไรก็ไม่รู้"), 5);
  assert.strictEqual(gas.kvTolFor_(gas.kvTol_("10"), "z1"), 10, "ตัวเลขเดียวใช้ทั้งเครื่อง");
  assert.strictEqual(gas.kvTolFor_(gas.kvTol_(""), "z1"), 0);

  const g = gas.kvFields_("#กลุ่มแรก;z1:ZONE 1:num;#กลุ่มสอง;sw:สวิตช์:onoff;bare");
  assert.strictEqual(g.length, 2);
  assert.strictEqual(J(g[0].fields[0]), J({ key: "z1", label: "ZONE 1", type: "num" }));
  assert.strictEqual(g[1].fields[1].label, "bare", "ไม่ใส่ป้ายกำกับให้ใช้ key เป็นป้าย");
  assert.strictEqual(g[1].fields[1].type, "num", "ไม่ระบุชนิดถือว่าเป็นตัวเลข");

  // ── ตัดสินผ่าน/ไม่ผ่าน ──
  const std = { z1: "180", z2: "180", z3: "180", speed: "45" };
  const bad = gas.kvCheck_({ z1: "201", z2: "186", z3: "183.5", speed: "45.5", amp: "999" }, std, tol);
  // z1 ห่าง 21 เกิน 10 · z2 ไม่ได้ระบุเกณฑ์จึงใช้ค่าตั้งต้น 5 ห่าง 6 ก็หลุดเหมือนกัน
  assert.strictEqual(J(bad.map((x) => x.key).sort()), J(["z1", "z2"]));
  // amp ไม่มีค่ามาตรฐาน = เก็บค่าไว้เฉย ๆ ไม่ใช่ "ผ่าน" และต้องไม่ถูกเตือน
  assert.ok(!bad.some((x) => x.key === "amp"));
  // ค่าว่าง = ไม่ได้วัด ไม่ใช่ 0 ถ้านับเป็น 0 ทุกช่องที่ยังไม่กรอกจะกลายเป็นของหลุดมาตรฐาน
  assert.strictEqual(gas.kvCheck_({ z1: "" }, { z1: "180" }, tol).length, 0);
}

{
  const gas = paramGas();
  const st = gas.apiParamStatus("t");
  const by = {};
  st.machines.forEach((m) => { by[m.id] = m; });

  assert.strictEqual(st.round, "16.00", "รอบปัจจุบันคือรอบของแถวที่บันทึกล่าสุด");
  assert.strictEqual(st.asOf, "2026-09-29");

  assert.strictEqual(by["EXT2-92"].state, "bad");
  assert.strictEqual(J(by["EXT2-92"].alerts.map((a) => a.label)), J(["ZONE 1 (°C)", "ZONE 2 (°C)"]),
    "ต้องได้ชื่อไทยจากชีต Machines ไม่ใช่ key ดิบอย่าง z1");
  assert.strictEqual(by["EXT2-92"].stale, false);
  assert.strictEqual(by["EXT2-92"].watched, 4);
  assert.strictEqual(by["EXT2-92"].total, 7);
  assert.strictEqual(by["EXT2-92"].form, "FM-MT-11 Rev.00", "รหัสฟอร์มต้องมาจากชีต ห้าม hardcode");

  // หยุดเครื่องมาก่อนค่าหลุด — เครื่องที่ดับอยู่ ค่า 0 ทุกตัวไม่ใช่ความผิดปกติ
  assert.strictEqual(by["UV2"].state, "stop");
  assert.strictEqual(by["UV2"].stale, true, "บันทึกรอบ 7.00 ตอนที่รอบปัจจุบันคือ 16.00");

  // เครื่องที่ยังไม่มีใครบันทึกต้องขึ้นการ์ดด้วย ไม่ใช่หายไปเงียบ ๆ
  assert.strictEqual(by["TF1"].state, "none");
  assert.strictEqual(by["TF1"].watched, 0);

  // ── ผูกกับทะเบียนเครื่องจักรของ CMMS ──
  assert.strictEqual(by["EXT2-92"].cmms, "Extrusion 2 - 92", "ชื่อเดิม Ext2-92 ในทะเบียนต้องจับได้");
  assert.strictEqual(by["TF1"].cmms, "", "ไม่มีในทะเบียน = ต้องว่าง ไม่ใช่เดาชื่อใกล้เคียง");
}

{
  const gas = paramGas();
  const d = gas.apiParamMachine("t", "EXT2-92");
  assert.strictEqual(d.operator, "ช่างวิรัตน์");
  assert.strictEqual(d.groups.length, 3, "ต้องแบ่งกลุ่มตาม #ชื่อกลุ่ม");

  const f = {};
  d.groups.forEach((g) => g.fields.forEach((x) => { f[x.key] = x; }));
  assert.strictEqual(f.z1.result, "หลุด");
  assert.strictEqual(f.z1.diff, 21);
  assert.strictEqual(f.z3.result, "ผ่าน");
  assert.strictEqual(f.amp.result, "ไม่ได้เฝ้า", "ไม่มีค่ามาตรฐาน = ไม่ได้เฝ้า ไม่ใช่ผ่าน");
  assert.strictEqual(f.amp.std, "");
  assert.strictEqual(f.product.value, "Modern Beige", "ข้อมูลงานที่ผลิตต้องแสดงด้วย ใช้สืบย้อนของเสีย");

  // ประวัติเรียงใหม่->เก่า และนับค่าที่หลุดของแต่ละรอบ
  assert.strictEqual(J(d.history.map((h) => h.round)), J(["16.00", "7.00"]));
  assert.strictEqual(J(d.history.map((h) => h.bad)), J([2, 0]));
}

{
  const gas = paramGas();
  const made = [];
  gas.apiCreateTicket = (p) => { made.push(p); return { ticket_id: "MT-0999/2569" }; };

  const res = gas.apiParamMakeTicket("t", "EXT2-92", { priority: "วิกฤต" });
  assert.strictEqual(res.ticket_id, "MT-0999/2569");
  const t = made[0];
  assert.strictEqual(t.machine_name, "Extrusion 2 - 92", "ต้องใช้ชื่อในทะเบียน ไม่ใช่ EXT2-92");
  assert.ok(t.description.indexOf("ZONE 1 (°C) = 201") > -1, "ต้องเติมค่าที่หลุดให้เอง");
  assert.ok(t.description.indexOf("มาตรฐาน 180") > -1);
  assert.ok(t.description.indexOf("ZONE 3") === -1, "ค่าที่ผ่านต้องไม่ไปอยู่ในใบ");
  // ISO: ใบต้องตามกลับไปหาบันทึกต้นทางได้ — ผู้บันทึก เวลา และรหัสแบบฟอร์ม
  assert.ok(t.cause.indexOf("ช่างวิรัตน์") > -1 && t.cause.indexOf("16.00") > -1 &&
            t.cause.indexOf("FM-MT-11 Rev.00") > -1, t.cause);
  assert.strictEqual(t.priority, "วิกฤต");

  // เครื่องที่ยังไม่ผูกทะเบียนต้องปฏิเสธพร้อมบอกวิธีแก้ ไม่ใช่ออกใบที่ผูกเครื่องผิด
  assert.throws(() => gas.apiParamMakeTicket("t", "TF1", {}), /ชื่อเดิมที่เคยใช้/);
  /* เครื่องที่บันทึกว่าหยุดเครื่องอ่านค่าได้ 0 ซึ่งหลุดมาตรฐานทุกตัวตามสูตร
     แต่เป็นเครื่องที่ดับอยู่ ไม่ใช่เครื่องที่พัง ต้องไม่ออกใบให้ ไม่งั้นสถิติงานเสียเพี้ยน */
  assert.throws(() => gas.apiParamMakeTicket("t", "UV2", {}), /หยุดเครื่อง/);
}

{
  // ── ตารางกับกราฟเดิมต้องอ่านทรง kv ได้ด้วย ไม่ใช่มีแต่หน้าสถานะที่ใช้ได้ ──
  const gas = paramGas();
  gas.canonical_ = (v) => ({ "EXT2-92": "Extrusion 2 - 92", "UV2": "UV 2", "TF1": "TF1" }[String(v).trim()] || String(v).trim());
  const out = gas.apiParamData("t", "", "", "");
  assert.strictEqual(out.layout, "kv");
  const z1 = out.rows.filter((r) => r.param === "ZONE 1 (°C)");
  assert.strictEqual(z1.length, 2, "ต้องกางเซลล์ data ออกเป็นแถวละค่า");
  assert.strictEqual(z1[1].value, 201);
  assert.strictEqual(z1[1].status, "สูงกว่าพิกัด", "พิกัดต้องคิดจาก std ± เกณฑ์ ของต้นทาง");
  assert.strictEqual(z1[0].status, "ปกติ");
  // ค่าที่เป็นข้อความ (Product) ไม่ใช่ตัวเลข ต้องไม่ไปโผล่ในกราฟแนวโน้ม
  assert.ok(!out.rows.some((r) => r.param.indexOf("Product") > -1));
}


/* ═══ ถังขยะ — ใบที่ยกเลิกต้องหลุดออกจากทุกตัวเลข ═══ */
{
  const base = [
    mk("C1", "Cut Slot2", "2026-02-01T08:00:00Z", { status: STATUS.DONE, completed_at: "2026-02-01T10:00:00Z", cost: 900 }),
    mk("C2", "Cut Slot2", "2026-02-02T08:00:00Z", { status: STATUS.CANCEL, cost: 5000, cancel_reason: "แจ้งซ้ำ" }),
  ];
  assert.strictEqual(live(base).length, 1, "ใบที่ยกเลิกต้องหายจากชุดข้อมูลที่ใช้คำนวณ");
  assert.strictEqual(isDead(base[1]), true);
  assert.strictEqual(isDead(base[0]), false);
  // ค่าใช้จ่ายของใบที่ยกเลิกต้องไม่ไปโผล่ในสถิติรายเครื่อง
  assert.strictEqual(machineStats(live(base), []).find((x) => x.machine === "Cut Slot2").cost, 900);
}

/* ═══ กระดานภาระงานช่าง ═══ */
{
  const now = new Date();
  const yday = new Date(now.getTime() - 864e5).toISOString();
  sandbox.setTickets([
    { ticket_id: "W1", machine_name: "A", assignee: "ช่างชล", status: STATUS.WAIT, priority: "วิกฤต", due_at: yday },
    { ticket_id: "W2", machine_name: "B", assignee: "ช่างชล, ช่างตั้ม", status: STATUS.REPAIR, priority: "ปกติ" },
    { ticket_id: "W3", machine_name: "C", assignee: "ช่างตั้ม", status: STATUS.CANCEL, priority: "ด่วน" },
    { ticket_id: "W4", machine_name: "D", assignee: "",        status: STATUS.WAIT, priority: "ปกติ" },
    { ticket_id: "W5", machine_name: "E", assignee: "ช่างชล", technician: "ช่างเบิร์ด", status: STATUS.DONE,
      created_at: "2026-02-01T08:00:00Z", started_at: "2026-02-01T08:00:00Z", completed_at: "2026-02-01T10:00:00Z" },
  ]);
  const rows = workloadRows({ list: [] });      // ช่วงเวลาว่าง = วัดเฉพาะงานค้าง ณ ตอนนี้
  const chon = rows.find((r) => r.name === "ช่างชล");
  const tum  = rows.find((r) => r.name === "ช่างตั้ม");

  assert.strictEqual(chon.open, 2, "ช่างชลถือ W1 กับ W2");
  assert.strictEqual(tum.open, 1, "ใบที่ยกเลิกต้องไม่นับเป็นภาระงาน");
  assert.strictEqual(chon.urgent, 1, "นับเฉพาะวิกฤต+ด่วน");
  assert.strictEqual(chon.late, 1, "W1 เลยกำหนดมาเมื่อวาน");
  assert.ok(!rows.some((r) => r.name === ""), "ใบที่ยังไม่มอบหมายต้องไม่กลายเป็นคนชื่อว่าง");
  // ใบเดียวมอบหมาย 2 คน ต้องนับให้ทั้งคู่
  assert.ok(chon.byStatus[STATUS.REPAIR] === 1 && tum.byStatus[STATUS.REPAIR] === 1);

  /* เครดิตงานที่ปิดแล้วต้องไปที่ "ผู้เข้าซ่อม" ไม่ใช่คนที่ถูกมอบหมายไว้แต่แรก
     และเวลาที่แสดงต้องเป็นเวลาที่ช่างลงมือจริง — ใบที่ค้างรออะไหล่ 5 วันไม่ใช่ภาระของช่าง */
  const closed = workloadRows({ list: [{ ticket_id: "W5", assignee: "ช่างชล", technician: "ช่างเบิร์ด",
    status: STATUS.DONE, created_at: "2026-02-01T08:00:00Z",
    started_at: "2026-02-01T09:00:00Z", completed_at: "2026-02-01T10:00:00Z" }] });
  assert.strictEqual(closed.find((r) => r.name === "ช่างเบิร์ด").closed, 1);
  assert.strictEqual(closed.find((r) => r.name === "ช่างเบิร์ด").mttr, 1,
    "ลงมือ 09:00-10:00 = 1 ชม. ไม่ใช่ 2 ชม. ที่นับรวมชั่วโมงที่ใบรอคิวอยู่");

  // ไม่เคยกดปุ่ม "เริ่มซ่อม" = ไม่รู้ว่าลงมือนานแค่ไหน ต้องเว้นว่าง ไม่ใช่เดาจากเวลาที่ใบค้าง
  const noStart = workloadRows({ list: [{ ticket_id: "W6", technician: "ช่างเบิร์ด",
    status: STATUS.DONE, created_at: "2026-02-01T08:00:00Z", completed_at: "2026-02-05T10:00:00Z" }] });
  assert.strictEqual(noStart.find((r) => r.name === "ช่างเบิร์ด").mttr, null);
  assert.ok(!closed.find((r) => r.name === "ช่างชล")?.closed, "คนที่ถูกมอบหมายแต่ไม่ได้ลงมือ ไม่ได้เครดิต");
  sandbox.setTickets([]);
}

/* ═══ วันหยุดในปฏิทิน ═══ */
{
  sandbox.setPmCal({ holidays: { "2026-04-13": { name: "วันสงกรานต์" } }, workSaturday: false });
  assert.strictEqual(dayOffKind("2026-04-13"), "holiday");
  assert.strictEqual(dayOffKind("2026-09-20"), "weekend", "20 ก.ย. 2026 เป็นวันอาทิตย์");
  assert.strictEqual(dayOffKind("2026-09-19"), "weekend", "19 ก.ย. 2026 เป็นวันเสาร์");
  assert.strictEqual(dayOffKind("2026-09-23"), "", "วันพุธเป็นวันทำงาน");

  // โรงงานที่ทำงานวันเสาร์ ต้องไม่ถูกมองว่าเสาร์เป็นวันหยุด แต่อาทิตย์ยังหยุดอยู่
  sandbox.setPmCal({ holidays: {}, workSaturday: true });
  assert.strictEqual(dayOffKind("2026-09-19"), "", "ทำงานวันเสาร์");
  assert.strictEqual(dayOffKind("2026-09-20"), "weekend");
  sandbox.setPmCal(null);
  assert.strictEqual(dayOffKind("2026-09-23"), "", "ยังไม่โหลดปฏิทินต้องไม่พัง");
}

/* ═══ ยกระดับเมื่อเลยกำหนดไปไกล ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };
  gas.cfg_ = (k, d) => d;                     // SLA ตามค่าตั้งต้น: วิกฤต 4 · ปกติ 72

  const now = Date.parse("2026-09-23T12:00:00Z");
  const hrs = (h) => new Date(now - h * 36e5).toISOString();

  const rows = [
    // วิกฤต SLA 4 ชม. → กำหนดเสร็จที่ 4 ชม. · เกณฑ์ 2 เท่า = แจ้งเมื่อผ่าน 8 ชม.
    { ticket_id: "E1", priority: "วิกฤต", status: "รอซ่อม", created_at: hrs(9),  due_at: "" },
    { ticket_id: "E2", priority: "วิกฤต", status: "รอซ่อม", created_at: hrs(7),  due_at: "" },
    // ปกติ SLA 72 ชม. → แจ้งเมื่อผ่าน 144 ชม. · 100 ชม. ยังไม่ถึง
    { ticket_id: "E3", priority: "ปกติ",  status: "กำลังซ่อม", created_at: hrs(100), due_at: "" },
    { ticket_id: "E4", priority: "ปกติ",  status: "กำลังซ่อม", created_at: hrs(200), due_at: "" },
    { ticket_id: "E5", priority: "วิกฤต", status: "ซ่อมเสร็จสมบูรณ์", created_at: hrs(500), due_at: "" },
    { ticket_id: "E6", priority: "วิกฤต", status: "ยกเลิก",   created_at: hrs(500), due_at: "" },
    { ticket_id: "E7", priority: "วิกฤต", status: "รอซ่อม",   created_at: "",       due_at: "" },
  ];

  const ids = gas.escalateRows_(rows, now, 2).map((t) => t.ticket_id).join("|");
  assert.strictEqual(ids, "E1|E4", "เฉพาะใบที่เลยกำหนดเกิน 2 เท่าของ SLA ของระดับตัวเอง");

  /* หัวใจของเกณฑ์นี้ — งานปกติที่เลยมา 100 ชม. ยังไม่ถูกแจ้ง
     แต่งานวิกฤตที่เลยมาแค่ 5 ชม. ถูกแจ้งแล้ว ถ้าใช้ชั่วโมงคงที่จะกลับด้านกันทันที */
  assert.ok(!ids.includes("E3"));

  // หัวหน้าเลื่อนกำหนดให้ใหม่ ต้องนับจากกำหนดใหม่ ไม่ใช่ย้อนไปนับจากวันแจ้ง
  const moved = [{ ticket_id: "M1", priority: "วิกฤต", status: "รอซ่อม",
    created_at: hrs(100), due_at: new Date(now + 36e5).toISOString() }];
  assert.strictEqual(gas.escalateRows_(moved, now, 2).length, 0, "เลื่อนกำหนดแล้วต้องไม่ถูกแจ้ง");

  // ปรับเกณฑ์ให้เข้มขึ้นแล้วต้องแจ้งน้อยลง
  assert.ok(gas.escalateRows_(rows, now, 5).length < gas.escalateRows_(rows, now, 2).length);
}

/* ═══ ยกเลิกใบ — ด่านฝั่ง server ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };

  let asked = null;
  gas.requireAuth_ = (tok, role) => { if (role) asked = role; return { name: "หัวหน้าเอ", role: "LEAD" }; };
  let got = null;
  gas.updateTicketInternal_ = (id, ch) => { got = ch; return { ok: true }; };

  // ไม่ใส่เหตุผล = ไม่ให้ผ่าน
  assert.throws(() => gas.apiUpdateTicket("tok", "T1", { status: "ยกเลิก" }), /เหตุผล/);
  assert.throws(() => gas.apiUpdateTicket("tok", "T1", { status: "ยกเลิก", cancel_reason: "   " }), /เหตุผล/);

  asked = null;
  gas.apiUpdateTicket("tok", "T1", { status: "ยกเลิก", cancel_reason: "แจ้งซ้ำ" });
  assert.strictEqual(asked, "LEAD", "ยกเลิกต้องขอสิทธิ์หัวหน้างาน");
  assert.strictEqual(got.cancel_reason, "แจ้งซ้ำ");

  // ยกเลิกทีละหลายใบไม่ได้ เพราะเหตุผลต้องเป็นรายใบ
  assert.throws(() => gas.apiBulkUpdate("tok", ["T1"], { status: "ยกเลิก" }), /รายใบ/);
}

/* ═══ ตาราง PM รับงานวางแผนทุกชนิด ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };
  gas.canonical_ = (v) => String(v || "");
  gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  gas.Utilities = {
    formatDate: (d) => {
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },
    formatString: (f, y, m) => `${y}-${String(m).padStart(2, "0")}`,
  };

  const H = gas.PMCAL_HEAD;
  const at = (name) => H.indexOf(name);
  const mkRow = (o) => H.map((h) => (h in o ? o[h] : ""));

  // แถวใหม่ที่มีครบสองช่อง
  const full = mkRow({ "รหัส": "PM-1", "เครื่องจักร": "Cut", "งาน PM": "ล้างฟิลเตอร์",
    "วันที่วางแผน": new Date("2026-09-10T00:00:00"), "สถานะ": "วางแผนไว้",
    "ประเภทงาน": "ปรับปรุง", "ชั่วโมงที่วางแผน": 8 });
  const o1 = gas.pmObj_(full, gas.pmIdx_(H));
  assert.strictEqual(o1.kind, "ปรับปรุง");
  assert.strictEqual(o1.hours, 8);

  /* แถวเก่าที่ยังไม่ได้รัน upgradeSheet() — ไม่มีสองคอลัมน์นี้เลย
     ต้องไม่พัง และต้องถือว่าเป็น PM ตามรอบ ซึ่งเป็นของจริงของแถวเก่าทั้งหมด */
  const OLD = H.slice(0, H.length - 2);
  const oldRow = OLD.map((h) => (h === "รหัส" ? "PM-9" : h === "สถานะ" ? "วางแผนไว้" : ""));
  const o2 = gas.pmObj_(oldRow, gas.pmIdx_(OLD));
  assert.strictEqual(o2.kind, "PM ตามรอบ", "แถวเก่าต้องถือเป็น PM ตามรอบ");
  assert.strictEqual(o2.hours, 0);

  // ── ออกตารางล่วงหน้า ต้องยกประเภท/ชั่วโมงจากชีตแผนมาด้วย ──
  gas.requireAuth_ = () => ({ name: "หัวหน้าเอ", role: "LEAD" });
  gas.assertKnownMachine_ = (m) => String(m);
  gas.writeAudit_ = () => {};
  gas.SpreadsheetApp = { flush: () => {} };
  gas.readSheet_ = () => [{
    "เครื่องจักร": "Cut", "งาน PM": "ล้าง Cooling Tower", "รอบ (วัน)": 30,
    "ทำครั้งล่าสุด": "", "ผู้รับผิดชอบ": "ช่างชล", "ใช้งาน": "ใช่",
    "ประเภทงาน": "งานอาคาร", "ชั่วโมงที่วางแผน": 8,
  }];
  let written = null;
  gas.pmRows_ = () => ({ rows: [], head: H, sheet: {
    getLastRow: () => 1,
    getRange: () => ({ setValues: (v) => { written = v; } }),
  } });

  const res = gas.apiPmBuildSchedule("tok", 2);
  assert.ok(res.created > 0, "ต้องออกตารางได้");
  assert.strictEqual(written[0].length, H.length, "แถวที่เขียนต้องยาวเท่าหัวตาราง");
  assert.strictEqual(written[0][at("ประเภทงาน")], "งานอาคาร");
  assert.strictEqual(written[0][at("ชั่วโมงที่วางแผน")], 8);
}

/* ═══ แก้ประเภท/ชั่วโมงรายรายการ ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };
  gas.canonical_ = (v) => String(v || "");
  gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  gas.Utilities = {
    formatDate: (d) => {
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    },
    formatString: (f, y, m) => `${y}-${String(m).padStart(2, "0")}`,
  };
  gas.requireAuth_ = () => ({ name: "ช่างชล", role: "TECH" });
  gas.writeAudit_ = () => {};
  gas.SpreadsheetApp = { flush: () => {} };

  const H = gas.PMCAL_HEAD;
  const makeSheet = (head) => {
    const hits = [];
    return { hits, sheet: {
      getRange: (r, c) => ({ setValue: (v) => hits.push([head[c - 1], v]) }),
    } };
  };

  // ── ชีตที่อัปเกรดแล้ว ──
  let m = makeSheet(H);
  gas.pmRows_ = () => ({ rows: [H.map(() => "")], head: H, sheet: m.sheet });
  gas.pmFindRow_ = () => 2;
  gas.apiPmUpdate("tok", "PM-1", { kind: "ติดตั้งใหม่", hours: 6 });
  assert.strictEqual(m.hits.filter((h) => h[0] === "ประเภทงาน")[0][1], "ติดตั้งใหม่");
  assert.strictEqual(m.hits.filter((h) => h[0] === "ชั่วโมงที่วางแผน")[0][1], 6);

  // ประเภทมั่ว ๆ ต้องไม่ผ่าน ไม่งั้นตัวกรองจะมีค่าที่ไม่มีใครเลือกได้โผล่ขึ้นมา
  assert.throws(() => gas.apiPmUpdate("tok", "PM-1", { kind: "งานมโน" }), /ประเภทงาน/);

  /* ── ชีตที่ยังไม่ได้อัปเกรด ──
     ต้องบันทึกสถานะได้ตามปกติ ไม่ใช่ล้มทั้งรายการเพราะไม่มีคอลัมน์ใหม่
     (getRange(row, 0) จะโยน error ถ้าไม่เช็ค index) */
  const OLD = H.slice(0, H.length - 2);
  m = makeSheet(OLD);
  gas.pmRows_ = () => ({ rows: [OLD.map(() => "")], head: OLD, sheet: m.sheet });
  assert.doesNotThrow(() => gas.apiPmUpdate("tok", "PM-1", { status: "กำลังทำ", kind: "ปรับปรุง", hours: 4 }));
  assert.strictEqual(m.hits.filter((h) => h[0] === "สถานะ")[0][1], "กำลังทำ");
  assert.strictEqual(m.hits.filter((h) => h[0] === "ประเภทงาน").length, 0, "ไม่มีคอลัมน์ก็ต้องข้ามเงียบ ๆ");
}

/* ═══ หัวข้อตรวจในใบงาน PM ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  const NL = String.fromCharCode(10);

  const p1 = gas.parseChecklist_([
    "ตรวจระดับน้ำมันเกียร์ | อยู่ระหว่างขีด MIN–MAX",
    "  อัดจาระบีแบริ่ง  ",
    "",
    "วัดอุณหภูมิ | ไม่เกิน 70 °C",
    "",
  ].join(NL));
  assert.strictEqual(p1.length, 3, "บรรทัดว่างต้องถูกตัดทิ้ง");
  assert.strictEqual(p1[0].text, "ตรวจระดับน้ำมันเกียร์");
  assert.strictEqual(p1[0].spec, "อยู่ระหว่างขีด MIN–MAX");
  assert.strictEqual(p1[1].text, "อัดจาระบีแบริ่ง", "ต้องตัดช่องว่างหัวท้าย");
  assert.strictEqual(p1[1].spec, "", "ไม่ใส่เกณฑ์ก็ต้องได้หัวข้อเปล่า ไม่ใช่ undefined");

  // ขึ้นบรรทัดแบบ Windows ที่ติดมาจากการก๊อปจาก Excel ต้องอ่านได้เหมือนกัน
  assert.strictEqual(gas.parseChecklist_(["ก | 1", "ข | 2"].join(String.fromCharCode(13,10))).length, 2);

  // มี | หลายตัว — ตัวแรกเท่านั้นที่เป็นตัวแบ่ง ที่เหลือเป็นส่วนหนึ่งของเกณฑ์
  const p2 = gas.parseChecklist_("วัดค่า | 6-8 bar | เช็คทุกกะ");
  assert.strictEqual(p2[0].text, "วัดค่า");
  assert.strictEqual(p2[0].spec, "6-8 bar | เช็คทุกกะ");

  assert.strictEqual(gas.parseChecklist_("").length, 0);
  assert.strictEqual(gas.parseChecklist_(null).length, 0);
}

/* ═══ รหัสไฟล์/โฟลเดอร์ที่คนวางมาเป็นลิงก์ ═══
   บั๊กจริงจากหน้างาน — แจ้งซ่อมพร้อมรูปแล้วขึ้น
   "Exception: รหัสไฟล์หรือโฟลเดอร์ไม่ถูกต้อง: 1Pxv...?usp=drive_link"
   แล้วใบแจ้งซ่อมหายไปทั้งใบ                                              */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz01234";

  assert.strictEqual(gas.driveId_(ID + "?usp=drive_link"), ID, "ค่าที่เจอจริงเมื่อวาน");
  assert.strictEqual(gas.driveId_(ID + "?usp=sharing"), ID);
  assert.strictEqual(gas.driveId_("https://drive.google.com/drive/folders/" + ID + "?usp=sharing"), ID);
  assert.strictEqual(gas.driveId_("  " + ID + "  "), ID, "ช่องว่างหัวท้ายจากการก๊อป");
  assert.strictEqual(gas.driveId_(ID), ID, "รหัสเปล่าต้องไม่ถูกแก้");

  const SID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
  assert.strictEqual(
    gas.driveId_("https://docs.google.com/spreadsheets/d/" + SID + "/edit#gid=0"), SID,
    "ลิงก์ชีตต้องได้รหัสชีต ไม่ใช่คำว่า spreadsheets");

  assert.strictEqual(gas.driveId_(""), "");
  assert.strictEqual(gas.driveId_(null), "");
  assert.strictEqual(gas.driveId_(undefined), "");
}

/* ═══ งาน PM แยกจากใบแจ้งซ่อม ═══ */
{
  const src = fs.readFileSync("gas/Code.gs", "utf8");
  // ตัวออกใบ PM อัตโนมัติถูกถอดออกแล้ว — ถ้าใครเผลอใส่กลับมา เทสต์นี้จะจับได้
  assert.ok(!/function generatePMTickets/.test(src), "ต้องไม่มีตัวออกใบ PM อัตโนมัติอีก");
  assert.ok(!/function apiGeneratePM/.test(src));
  /* appendTicket_ ต้องปรากฏแค่ 2 ที่ — ตัวฟังก์ชันเอง กับการเรียกใน apiCreateTicket
     มากกว่านี้แปลว่ามีทางอื่นแอบสร้างใบแจ้งซ่อมได้อีก */
  assert.strictEqual(src.split("appendTicket_(").length - 1, 2,
    "มีทางเดียวที่สร้างใบแจ้งซ่อมได้");

  const gas = {};
  vm.runInNewContext(src, gas);
  gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  gas.Utilities = { formatDate: (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  } };

  assert.strictEqual(gas.thMonthLabel_("2026-09"), "ก.ย. 2569");
  assert.strictEqual(gas.thMonthLabel_("2026-01"), "ม.ค. 2569");
  assert.strictEqual(gas.thMonthLabel_("อะไรก็ไม่รู้"), "อะไรก็ไม่รู้", "รูปแบบผิดต้องไม่พัง");

  /* Compliance นับเฉพาะที่เสร็จ "ไม่เกินวันที่วางไว้"
     ทำช้ากว่าแผนถือว่าเสร็จ แต่ไม่ได้คะแนน ไม่งั้นเลื่อนแล้วทำก็ยังได้ 100% ตลอด */
  const sm = gas.pmSummarize_([
    { status: "เสร็จแล้ว", planned: "2026-09-04", actual: "2026-09-04", hours: 4 },
    { status: "เสร็จแล้ว", planned: "2026-09-10", actual: "2026-09-14", hours: 2 },
    { status: "เลื่อน",    planned: "2026-09-15", actual: "",           hours: 8 },
    { status: "วางแผนไว้", planned: "1990-01-01", actual: "",           hours: 16 },
    { status: "ยกเลิก",    planned: "2026-09-20", actual: "",           hours: 99 },
  ]);
  assert.strictEqual(sm.total, 4, "รายการที่ยกเลิกไม่นับ");
  assert.strictEqual(sm.done, 2);
  assert.strictEqual(sm.moved, 1);
  assert.strictEqual(sm.overdue, 1, "เลยวันวางแผนและยังไม่ได้ทำ");
  assert.strictEqual(sm.hours, 30, "ชั่วโมงต้องไม่รวมรายการที่ยกเลิก");
  assert.strictEqual(sm.compliance, 25, "เสร็จตรงเวลา 1 จาก 4 = 25%");

  assert.strictEqual(gas.pmSummarize_([]).compliance, null, "ไม่มีรายการต้องคืน null ไม่ใช่ 0%");
}

/* ═══ ชื่อไทยใน token ต้องไม่กลายเป็น ?????? ═══
   เจอจากเอกสาร FM-MT-06 จริงที่ขึ้นว่า "โดย ??????"
   base64EncodeWebSafe(string) แบบไม่ใส่ charset แปลงอักษรไทยเป็น "?" ทุกตัว
   ชื่อผู้แก้ในชีต Audit ก็มาจาก token ตัวนี้ จึงเสียหายไปด้วยทั้งหมด            */
{
  const src = fs.readFileSync("gas/Code.gs", "utf8");
  const i = src.indexOf("function signUser_");
  const body = src.slice(i, i + 500);
  assert.ok(/base64EncodeWebSafe\([\s\S]*Utilities\.Charset\.UTF_8/.test(body),
    "signUser_ ต้องระบุ Charset.UTF_8 ไม่งั้นชื่อไทยกลายเป็น ??????");

  // จำลองพฤติกรรมของทั้งสองแบบให้เห็นว่าต่างกันจริง
  const thai = "ช่างตั้ม";
  const utf8 = Buffer.from(thai, "utf8").toString("base64");
  const ascii = Buffer.from(thai, "ascii").toString("base64");
  assert.strictEqual(Buffer.from(utf8, "base64").toString("utf8"), thai);
  assert.notStrictEqual(Buffer.from(ascii, "base64").toString("utf8"), thai,
    "ถอดจากชุดอักขระผิดต้องได้ชื่อที่ไม่ตรง");
}

/* ═══ กางตาราง PM — งานรอบสั้นต้องไม่ท่วมปฏิทิน ═══
   เจอจริง: "Air compresser 100hp ทำความสะอาดฟิวเตอร์" รอบ 1 วัน
   กางลง 12 เดือน = ~365 แถวของงานเดียว รายงานทั้งหน้ากลายเป็นบรรทัดซ้ำ      */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };
  gas.writeAudit_ = () => {};
  gas.canonical_ = (v) => String(v || "");
  gas.SpreadsheetApp = { flush: () => {} };
  gas.cfg_ = (k, d) => d;
  gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  gas.Utilities = { formatDate: (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  } };
  gas.assertKnownMachine_ = (m) => {
    if (String(m).indexOf("ไม่มี") > -1) throw new Error("ไม่อยู่ในทะเบียน");
    return String(m);
  };
  gas.readSheet_ = () => [
    { "เครื่องจักร": "Air compresser 100hp", "งาน PM": "ทำความสะอาดฟิวเตอร์",
      "รอบ (วัน)": 1, "ใช้งาน": "ใช่" },
    { "เครื่องจักร": "Extrusion 3 - 110", "งาน PM": "เปลี่ยนน้ำมันเกียร์",
      "รอบ (วัน)": 90, "ใช้งาน": "ใช่", "ชั่วโมงที่วางแผน": 4 },
    { "เครื่องจักร": "เครื่องที่ไม่มีในทะเบียน", "งาน PM": "อะไรสักอย่าง",
      "รอบ (วัน)": 30, "ใช้งาน": "ใช่" },
    { "เครื่องจักร": "UV 2", "งาน PM": "ยังไม่ใส่รอบ", "รอบ (วัน)": 0, "ใช้งาน": "ใช่" },
  ];
  let written = 0;
  gas.pmRows_ = () => ({ rows: [], head: gas.PMCAL_HEAD, sheet: {
    getLastRow: () => 1,
    getRange: () => ({ setValues: (v) => { written = v.length; } }),
  } });

  const r = gas.pmBuildSchedule_(12, "ทดสอบ");
  assert.ok(r.created > 0 && r.created < 20, "รอบ 90 วัน / 12 เดือน ต้องได้ไม่กี่ครั้ง");
  assert.strictEqual(r.created, written);
  assert.strictEqual(r.skipped.length, 3, "ต้องข้าม 3 แผนและบอกเหตุผลทุกอัน");

  const why = r.skipped.join(" ");
  assert.ok(/รอบ 1 วัน สั้นกว่า/.test(why), "งานรายวันต้องถูกข้ามพร้อมเหตุผล");
  assert.ok(/ชื่อเครื่องไม่ตรงทะเบียน/.test(why), "เดิมข้ามเงียบ ๆ จนหาไม่เจอว่าหายไปไหน");
  assert.ok(/ยังไม่ได้ใส่รอบ/.test(why));

  // ไม่มีแผนเลยต้องคืนรูปแบบเดียวกัน ไม่ใช่ตัวเลขเปล่า ไม่งั้นผู้เรียกอ่าน .skipped แล้วพัง
  gas.readSheet_ = () => [];
  const empty = gas.pmBuildSchedule_(12);
  assert.strictEqual(empty.created, 0);
  assert.strictEqual(empty.skipped.length, 0);
}

/* ═══ ตัดเวลาเครื่องหยุดให้อยู่ในเดือน — ต้นเหตุที่ %Breakdown เคยเพี้ยน ═══
   ของจริงที่เจอบนหน้าจอ: ใบเดียวนับไป 46 วัน ในเดือนที่ให้เครื่องละ 24 วัน
   และสองใบแบบนั้นรวมกันเป็น 93% ของตัวเศษทั้งก้อน อีก 31 ใบแทบไม่มีผล */
{
  sandbox.setMachines([
    { name: "Cut Slot2",  group: "เครื่องจักรหลัก" },
    { name: "Die Cut",    group: "เครื่องจักรหลัก" },
    { name: "พัดลมออฟฟิศ", group: "เครื่องใช้ไฟฟ้า" },
  ]);
  const winOf = (year, month, all) =>
    periodWindow({ year, month, all, pm: { workHours: 576 } });

  /* ── ใบที่คร่อมสามเดือน ── */
  const span = mk("X1", "Cut Slot2", "2026-08-25T00:00:00Z",
                  { status: STATUS.DONE, completed_at: "2026-10-10T00:00:00Z" });
  const sp = stopSpan(span, "wait", Date.now());
  const full = (sp[1] - sp[0]) / 36e5;
  assert.ok(full > 1100, "ใบนี้ยาว ~46 วัน — ถ้าไม่ยาวเทสต์ที่เหลือก็ไม่ได้ทดสอบอะไร");

  const months = ["08", "09", "10", "11"].map((m) => {
    const w = winOf(2026, m, [span]);
    return overlapHours(sp[0], sp[1], w.from, w.to);
  });

  /* คุณสมบัติที่สำคัญที่สุด: หั่นแล้วเวลาต้องไม่หายและไม่งอก
     ถ้าผลรวมไม่เท่าความยาวจริง แปลว่าเดือนใดเดือนหนึ่งนับซ้ำหรือนับตก */
  const sum = months.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - full) < 1e-6,
    `หั่นตามเดือนแล้วเวลาต้องเท่าเดิม: ${sum} ≠ ${full}`);

  // สิงหาคมต้องเหลือแค่ปลายเดือน ไม่ใช่ทั้ง 46 วันเหมือนสูตรเก่า
  const wAug = winOf(2026, "08", [span]);
  assert.strictEqual(months[0], (wAug.to - sp[0]) / 36e5, "สิงหาคม = ตั้งแต่วันแจ้งถึงสิ้นเดือน");
  assert.ok(months[0] < full / 4, "ถ้ายังได้เกือบทั้งใบ แปลว่ายังไม่ได้ตัด");
  assert.ok(months[1] > months[0], "กันยายนเต็มเดือนต้องมากกว่าเศษปลายสิงหาคม");
  assert.strictEqual(months[3], 0, "เดือนที่ใบปิดไปแล้วต้องเป็น 0 ไม่ใช่ค่าติดลบ");

  /* ── ใบที่แจ้งเดือนก่อนแล้วยังค้าง ต้องถูกนับเข้าเดือนนี้ ──
     สูตรเก่ากรองใบตามวันที่แจ้ง ใบพวกนี้จึงหายไปทั้งที่เครื่องยังหยุดอยู่จริง */
  const stuck = mk("X2", "Die Cut", "2026-07-10T00:00:00Z", { status: STATUS.REPAIR });
  const w9 = winOf(2026, "09", [stuck]);
  const r9 = breakdownSpan([stuck], w9, "wait");
  assert.strictEqual(r9.count, 1, "ใบที่แจ้งเดือนก่อนแต่ยังค้าง ต้องถูกนับเข้าเดือนนี้");
  assert.ok(r9.hours > 0);

  /* ── เพดานรายเครื่อง — สองใบของเครื่องเดียวกันที่เวลาซ้อนกัน ห้ามนับเวลาเดียวกันสองรอบ ── */
  const a = mk("X3", "Cut Slot2", "2026-09-01T00:00:00Z",
               { status: STATUS.DONE, completed_at: "2026-09-30T00:00:00Z" });
  const b = mk("X4", "Cut Slot2", "2026-09-02T00:00:00Z",
               { status: STATUS.DONE, completed_at: "2026-09-29T00:00:00Z" });
  const wSep = winOf(2026, "09", [a, b]);
  const capped = breakdownSpan([a, b], wSep, "wait");
  assert.strictEqual(capped.hours, 576, "เครื่องหนึ่งตัวหยุดได้มากสุดเท่าที่เดือนนั้นมีให้");
  assert.strictEqual(capped.capped, 1, "ต้องรายงานว่ามีการปัดลง ไม่ใช่ปัดเงียบ ๆ");

  assert.strictEqual(capped.merged, 1, "สองใบที่เวลาซ้อนกันต้องถูกรวมเป็นช่วงเดียว");

  /* ไม่มีเพดาน (ยังไม่กรอกชั่วโมงทำงาน) ต้องไม่ปัด และต้องไม่พังเพราะ Infinity
     ที่สำคัญกว่า: ต้องได้ "ช่วงรวม" (1–30 ก.ย. = 696 ชม.) ไม่ใช่ผลบวกของสองใบ (1,344 ชม.)
     ถ้าบวกตรง ๆ เครื่องที่ถูกแจ้งละเอียดจะดูเหมือนหยุดนานกว่าเครื่องที่แจ้งใบเดียว */
  const noCap = breakdownSpan([a, b], { ...wSep, cap: Infinity }, "wait");
  assert.strictEqual(noCap.capped, 0);
  assert.strictEqual(noCap.hours, 29 * 24, "ต้องเป็นช่วงรวม ไม่ใช่ผลบวกของทุกใบ");

  // ใบที่ไม่ทับกันบนเครื่องเดียวกันต้องบวกกันตามปกติ ไม่ใช่ถูกรวมทิ้ง
  const c1 = mk("X6", "Die Cut", "2026-09-01T00:00:00Z",
                { status: STATUS.DONE, completed_at: "2026-09-03T00:00:00Z" });
  const c2 = mk("X7", "Die Cut", "2026-09-10T00:00:00Z",
                { status: STATUS.DONE, completed_at: "2026-09-12T00:00:00Z" });
  const apart = breakdownSpan([c1, c2], { ...wSep, cap: Infinity }, "wait");
  assert.strictEqual(apart.hours, 96, "สองช่วงที่ไม่ทับกันต้องบวกกัน");
  assert.strictEqual(apart.merged, 0);

  /* ── งานที่ไม่ใช่เครื่องจักรผลิตยังต้องถูกตัดออกเหมือนเดิม ── */
  const fan = mk("X5", "พัดลมออฟฟิศ", "2026-09-05T00:00:00Z",
                 { status: STATUS.DONE, completed_at: "2026-09-06T00:00:00Z" });
  assert.strictEqual(breakdownSpan([fan], wSep, "wait").count, 0, "พัดลมออฟฟิศไม่ใช่สายการผลิตหยุด");

  /* ── kpiSummary: ส่งหน้าต่างเข้าไปแล้วต้องได้เลขที่ต่ำลงจริง ไม่ใช่เท่าเดิม ── */
  const aug = [span];
  sandbox.setTickets(aug);
  const kOld = kpiSummary(aug, 72, { workHours: 576 }, 30);            // ทางเดิม ไม่ตัดเดือน
  const kNew = kpiSummary(aug, 72, { workHours: 576 }, 30, wAug);      // ตัดตามเดือน
  assert.ok(kOld.machineDowntime > kNew.machineDowntime,
    "ตัดตามเดือนแล้วตัวเศษต้องเล็กลง ไม่งั้นแปลว่าไม่ได้ตัด");
  assert.strictEqual(kNew.breakdownClipped, true);
  assert.strictEqual(kOld.breakdownClipped, false, "ทางเดิมต้องยังใช้ได้ สำหรับที่เรียกแบบไม่มีเดือน");
  /* ใบนี้เป็นของเครื่องตัวเดียว ซึ่งเดือนหนึ่งหยุดได้มากสุด 576 ชม.
     สูตรเก่าให้ค่าเกินนั้น = นับเวลาของเดือนอื่นมาใส่เดือนนี้จริง ไม่ใช่เทสต์เดาเอา */
  assert.ok(kOld.machineDowntime > 576,
    "ยืนยันว่าสูตรเก่าให้เครื่องเดียวหยุดเกินชั่วโมงที่เดือนนั้นมีให้");
  assert.ok(kNew.machineDowntime <= 576, "ค่าใหม่ต้องไม่เกินโควตาของเครื่องในเดือนนั้น");
}

/* ═══ ช่างลงมือ: ช่อง "ใช้เวลา" ที่ช่างกรอกต้องถูกนับ ไม่ใช่เฉพาะปุ่มเริ่มซ่อม ═══
   เคยพลาดมาแล้วจริง — ตอนเปลี่ยนมาตัดเวลาตามเดือน โค้ดอ่านแต่ started_at
   ค่าต่ำจึงกลายเป็น 0 น. ทั้งตาราง ทั้งที่ช่างกรอกนาทีไว้ครบ */
{
  sandbox.setMachines([{ name: "Cut Slot2", group: "เครื่องจักรหลัก" },
                       { name: "Mixer 2",   group: "เครื่องจักรรอง" }]);
  const now = Date.now();
  const winSep = periodWindow({ year: 2026, month: "09", all: [], pm: {}, group: "" });

  // กรอกช่อง "ใช้เวลา" อย่างเดียว ไม่ได้กดปุ่มเริ่มซ่อม — เคสที่พบมากที่สุดของจริง
  const byMinutes = mk("W1", "Cut Slot2", "2026-09-05T00:00:00Z",
    { status: STATUS.DONE, completed_at: "2026-09-08T00:00:00Z", repair_minutes: 90 });
  const sp = stopSpan(byMinutes, "wrench", now);
  assert.ok(sp, "ใบที่กรอกนาทีไว้ต้องมีช่วงเวลาช่างลงมือ ไม่ใช่ null");
  assert.strictEqual((sp[1] - sp[0]) / 36e5, 1.5, "90 นาที = 1.5 ชม.");
  assert.strictEqual(sp[1], Date.parse(byMinutes.completed_at), "ยึดท้ายไว้ที่เวลาปิดใบ");
  assert.strictEqual(breakdownSpan([byMinutes], winSep, "wrench").hours, 1.5);

  // กดปุ่มอย่างเดียว ไม่ได้กรอกนาที
  const byButton = mk("W2", "Cut Slot2", "2026-09-05T00:00:00Z",
    { status: STATUS.DONE, started_at: "2026-09-07T00:00:00Z", completed_at: "2026-09-08T00:00:00Z" });
  assert.strictEqual((stopSpan(byButton, "wrench", now).reduce((a, b) => b - a)) / 36e5, 24);

  // มีทั้งคู่ → เชื่อเลขที่คนกรอก เหมือนที่ wrenchHours ทำ จะได้ไม่ขัดกันเองสองหน้าจอ
  const both = { ...byButton, ticket_id: "W3", repair_minutes: 30 };
  const bs = stopSpan(both, "wrench", now);
  assert.strictEqual((bs[1] - bs[0]) / 36e5, 0.5);
  assert.strictEqual(wrenchHours(both), 0.5, "ต้องตรงกับ wrenchHours ที่หน้าอื่นใช้");

  // ไม่มีทั้งสองอย่าง = ไม่รู้ ต้องคืน null ไม่ใช่ 0
  const neither = mk("W4", "Cut Slot2", "2026-09-05T00:00:00Z",
    { status: STATUS.DONE, completed_at: "2026-09-08T00:00:00Z" });
  assert.strictEqual(stopSpan(neither, "wrench", now), null);
  assert.strictEqual(breakdownSpan([neither], winSep, "wrench").count, 0);

  /* ═══ ฟิลเตอร์กลุ่มเครื่องจักร — ตัวเศษและตัวหารต้องขยับพร้อมกัน ═══ */
  const main = mk("G1", "Cut Slot2", "2026-09-01T00:00:00Z",
    { status: STATUS.DONE, completed_at: "2026-09-03T00:00:00Z" });
  const sub = mk("G2", "Mixer 2", "2026-09-01T00:00:00Z",
    { status: STATUS.DONE, completed_at: "2026-09-02T00:00:00Z" });
  const both2 = [main, sub];
  const w = (g) => periodWindow({ year: 2026, month: "09", all: both2, pm: { workHours: 576 }, group: g });

  assert.strictEqual(breakdownSpan(both2, w(""), "wait").hours, 72, "ทั้งหมด = 48 + 24");
  assert.strictEqual(breakdownSpan(both2, w("เครื่องจักรหลัก"), "wait").hours, 48);
  assert.strictEqual(breakdownSpan(both2, w("เครื่องจักรรอง"), "wait").hours, 24);

  sandbox.setTickets(both2);
  const kAll  = kpiSummary(both2, 72, { workHours: 576 }, 30, w(""));
  const kMain = kpiSummary(both2, 72, { workHours: 576 }, 30, w("เครื่องจักรหลัก"));
  assert.strictEqual(kAll.fleet, 2, "ทั้งหมด = เครื่องหลัก + เครื่องรอง");
  assert.strictEqual(kMain.fleet, 1, "ตัวหารต้องนับเฉพาะเครื่องในกลุ่มที่เลือก");
  assert.strictEqual(kMain.bdGroup, "เครื่องจักรหลัก");
  /* ถ้าลืมขยับตัวหาร เลขของกลุ่มเดียวจะเล็กลงครึ่งหนึ่งแบบเงียบ ๆ
     เทสต์นี้จึงเช็คค่าจริง ไม่ใช่แค่เช็คว่าตัวเศษเปลี่ยน */
  assert.strictEqual(kMain.breakdownRate, Math.round(48 / 576 * 1000) / 10);
  assert.strictEqual(kAll.breakdownRate, Math.round(72 / 1152 * 1000) / 10);
}

/* ═══ เป้าหมายบนการ์ด KPI ต้องตรงกับไฟล์ KPI Report ของแผนก ═══
   เป้าพวกนี้อยู่ใน panelKpi ซึ่งต้องมี DOM ถึงจะรันได้ จึงตรวจที่ตัวหนังสือในไฟล์แทน
   เป็นการตรวจที่อ่อน แต่จับสิ่งที่พังบ่อยที่สุดได้: มีคนแก้เกณฑ์สีโดยไม่แก้ป้ายเป้า
   แล้วหน้าจอขึ้นเขียวทั้งที่เอกสารบอกว่าตก ซึ่งไม่มีใครจับได้จนถึงวันตรวจ

   ที่มาของตัวเลข: เซลล์ D7 แถว "เป้าหมาย" หัวชีตทั้งสี่ของ KPI Report <เดือน>69.xlsx */
{
  const src = fs.readFileSync("gas/app.html", "utf8");

  // ป้ายเป้าที่แสดงบนการ์ด
  for (const txt of ["%การซ่อมเครื่องจักรซ้ำ ≤ 10%", "ใบแจ้งซ่อมคงค้างเป็น 0",
                     "ทำตามแผนซ่อมบำรุง (PM) 100%", "ไม่เกิน 3% ต่อเดือน"]) {
    assert.ok(src.includes(txt), `หายไปจากการ์ด KPI: ${txt}`);
  }

  // เกณฑ์สีต้องเป็นเลขเดียวกับป้าย ไม่ใช่เลขที่เราคิดเอง
  assert.ok(src.includes("color: ok(k.repeatRate <= 10)"), "% ซ่อมซ้ำ ต้องเขียวที่ <= 10 ตามเอกสาร");
  assert.ok(src.includes("ok((k.breakdownRate ?? 0) <= 3)"), "% Breakdown ต้องเขียวที่ <= 3 ตามเอกสาร");
  assert.ok(src.includes("color: ok(k.pmRate === 100)"), "% PM ต้องเขียวที่ = 100 เป๊ะ");
  assert.ok(src.includes("color: ok(!k.open)"), "ใบคงค้าง ต้องเขียวเมื่อเป็น 0 เท่านั้น");

  // สี่ใบนี้ต้องติดดาว และต้องไม่มีใบอื่นติดไปด้วย
  assert.strictEqual((src.match(/star: true/g) || []).length, 4,
    "KPI ที่ไฟล์ของแผนกใช้ประเมินมี 4 ตัว — ติดดาวเกินหรือขาดแปลว่าจัดกลุ่มผิด");

  // ป้ายตัดสินต้องใช้คำเดียวกับช่อง Judgement ในไฟล์ จะได้ลอกลงเอกสารได้ตรงคำ
  assert.ok(src.includes('"บรรลุเป้าหมาย" : "ไม่บรรลุเป้าหมาย"'), "ป้ายต้องใช้คำเดียวกับไฟล์");

  // กลุ่มการ์ดต้องมีสองกลุ่มจริง ไม่ใช่กองเดียวเหมือนเดิม
  assert.ok(src.includes("const kpiSection = ("), "ต้องมีตัวช่วยวาดหัวข้อกลุ่ม");
  assert.strictEqual((src.match(/\n    kpiSection\(/g) || []).length, 2,
    "การ์ด KPI ต้องแบ่งเป็น 2 กลุ่ม — ตัวที่ถูกประเมิน กับตัวที่เอาไว้วิเคราะห์");
}

/* ═══ Phase 0: ล็อกชื่อช่าง — ชื่อเดียวกันต้องไม่กระจายเป็นหลายคนในสถิติรายคน ═══
   ปัญหาเดียวกับชื่อเครื่องจักรที่เคยแตก 117 แบบ แก้ด้วยกลไกเดียวกัน (ตารางชื่อเดิม) */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.readSheet_ = () => [
    { 'ชื่อ-นามสกุล': 'ช่างชล',  'บทบาท': 'TECH', 'ใช้งาน': 'ใช่', 'ชื่อเดิมที่เคยใช้': 'ชล, นายชล' },
    { 'ชื่อ-นามสกุล': 'ช่างตั้ม', 'บทบาท': 'TECH', 'ใช้งาน': 'ใช่', 'ชื่อเดิมที่เคยใช้': 'ตั้ม' },
    { 'ชื่อ-นามสกุล': 'ลาออกไปแล้ว', 'บทบาท': 'TECH', 'ใช้งาน': 'ไม่', 'ชื่อเดิมที่เคยใช้': '' },
  ];
  const { canonTech_ } = gas;

  assert.strictEqual(canonTech_('ชล'), 'ช่างชล', 'ชื่อเล่นต้องถูกแปลงเป็นชื่อมาตรฐาน');
  assert.strictEqual(canonTech_('นายชล'), 'ช่างชล');
  assert.strictEqual(canonTech_('ช่างชล'), 'ช่างชล', 'ชื่อที่ถูกอยู่แล้วต้องไม่ถูกแปลงเพี้ยน');
  assert.strictEqual(canonTech_('  ชล  '), 'ช่างชล', 'ช่องว่างหัวท้ายต้องไม่ทำให้แมตช์พลาด');

  // ใบเดียวมีช่างหลายคน — ต้องแปลงทีละชื่อ ไม่ใช่ทั้งก้อน
  assert.strictEqual(canonTech_('ชล, ตั้ม'), 'ช่างชล, ช่างตั้ม');

  /* คนเดียวกันถูกพิมพ์สองแบบในใบเดียว ต้องเหลือชื่อเดียว
     ถ้าไม่ตัดซ้ำ ช่างคนนั้นจะได้เครดิตสองเท่าจากใบเดียว ซึ่งเป็นสิ่งที่ Phase 0 ต้องกัน */
  assert.strictEqual(canonTech_('ชล, ช่างชล'), 'ช่างชล');

  // ชื่อที่ไม่รู้จักต้องปล่อยผ่าน ไม่ใช่ throw หรือทิ้ง — ใบเก่ามี "Supplier" และคนที่ลาออกไปแล้ว
  assert.strictEqual(canonTech_('Supplier'), 'Supplier');
  assert.strictEqual(canonTech_('ชล, 2K'), 'ช่างชล, 2K');

  // คนที่ปิด "ใช้งาน" ไม่อยู่ในทีมแล้ว ชื่อจึงไม่ถูกแปลง แต่ต้องยังบันทึกได้
  assert.strictEqual(canonTech_('ลาออกไปแล้ว'), 'ลาออกไปแล้ว');

  assert.strictEqual(canonTech_(''), '');
  assert.strictEqual(canonTech_(null), '');

  // คอลัมน์ alias ต้องต่อท้าย ไม่สลับ 9 ช่องแรกที่ Auth.gs ของโปรเจค Stock ใช้อยู่
  /* ต้องแปลงที่ updateTicketInternal_ ซึ่งเป็นทางเข้าเดียวของทุกการเขียนชีต
     (แก้ใบ · จ่ายงานหลายใบ · ตรวจรับ) ถ้าไปดักที่ apiUpdateTicket จะหลุดทางอื่น */
  const src = fs.readFileSync("gas/Code.gs", "utf8");
  const fn = src.slice(src.indexOf("function updateTicketInternal_"));
  assert.ok(fn.slice(0, 600).includes("canonTech_(changes[f])"),
    "ต้องแปลงชื่อที่ updateTicketInternal_ ไม่งั้นทางเขียนอื่นยังเขียนชื่อดิบลงชีตได้");

  assert.strictEqual(gas.USERS_HEAD[9], 'ชื่อเดิมที่เคยใช้');
  assert.strictEqual(gas.USERS_HEAD.slice(0, 9).join(','),
    'อีเมล,ชื่อ-นามสกุล,บทบาท,ใช้งาน,PIN,SALT,FAILED,LOCKED,รูป',
    'สลับลำดับ 9 คอลัมน์แรกแล้วระบบล็อกอินของโปรเจค Stock จะอ่านผิดช่อง');
}

/* หน้าเว็บต้องไม่มีช่องพิมพ์ชื่อช่างอิสระหลงเหลือ ไม่งั้นข้อมูลแตกกลับมาอีก */
{
  const app = fs.readFileSync("gas/app.html", "utf8");
  assert.ok(!/id="mTech"[^>]*class="inp"/.test(app), 'ช่อง "ผู้เข้าซ่อม" ต้องเป็นชิป ไม่ใช่ input');
  assert.ok(app.includes('nameChips(t.technician, "tech")'), "ต้องวาดชิปจากรายชื่อทีม");
  assert.ok(app.includes('#mAssign .chip, #mTech .chip'),
    "ชิปผู้เข้าซ่อมต้องกดสลับได้ ไม่งั้นเลือกไม่ได้เลย");
}

/* ═══ Phase 1: ผลงานช่างรายคน ═══
   ตัวเลขรายคนจะถูกเอาไปตัดสินคน จึงต้องผิดยากกว่าตัวเลขของเครื่องจักร
   ทุกเคสที่นี่มาจากข้อผิดพลาดที่เคยคิดจะปล่อยผ่าน ไม่ใช่เคสสมมติให้ครบ ๆ */
{
  sandbox.setMachines([{ name: "Cut Slot2", group: "เครื่องจักรหลัก" },
                       { name: "Die Cut",   group: "เครื่องจักรหลัก" }]);
  const t = (id, opt = {}) => ({
    ticket_id: id, machine_name: "Cut Slot2", description: "อาการ " + id,
    created_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-01T04:00:00Z",
    status: STATUS.DONE, cost: 0, reject_count: 0, repair_minutes: 60,
    started_at: "", repair_action: "เปลี่ยนอะไหล่", technician: "ชล",
    assignee: "", vendor: "", pr_no: "", verification_status: "", ...opt,
  });

  /* ── เครดิตงาน ── */
  {
    // ผู้เข้าซ่อมมาก่อนผู้รับผิดชอบ — คนที่ลงมือจริงคือคนที่ควรได้เครดิต
    const r = techScore([t("A", { technician: "ชล", assignee: "ตั้ม" })], { open: [], pmItems: [] });
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].name, "ชล", "มีผู้เข้าซ่อมแล้วต้องไม่ให้เครดิตผู้รับผิดชอบ");

    // ไม่ได้กรอกผู้เข้าซ่อม ค่อยตกมาที่ผู้รับผิดชอบ ไม่ใช่หายไปเฉย ๆ
    const r2 = techScore([t("B", { technician: "", assignee: "ตั้ม" })], { open: [], pmItems: [] });
    assert.strictEqual(r2[0].name, "ตั้ม");

    // ใบเดียวช่วยกันหลายคน ทุกคนได้เครดิตเต็มใบ
    const r3 = techScore([t("C", { technician: "ชล, ตั้ม" })], { open: [], pmItems: [] });
    assert.strictEqual(r3.length, 2);
    assert.ok(r3.every((x) => x.closed === 1));

    // ใบที่ยังไม่ปิดต้องไม่ถูกนับเป็นผลงาน
    assert.strictEqual(
      techScore([t("D", { status: STATUS.REPAIR, completed_at: "" })], { open: [], pmItems: [] }).length,
      0, "ใบที่ยังไม่ปิดไม่ใช่ผลงาน");
  }

  /* ── First-Time Fix: ตัวหารคือ "ใบที่ถูกตรวจรับ" ไม่ใช่ใบทั้งหมด ── */
  {
    const r = techScore([
      t("E1", { verification_status: "ผ่าน", reject_count: 0 }),
      t("E2", { verification_status: "ผ่าน", reject_count: 2 }),
      t("E3", { verification_status: "" }),              // ยังไม่ตรวจรับ = ไม่รู้ผล
    ], { open: [], pmItems: [] })[0];
    assert.strictEqual(r.verified, 2, "ใบที่ไม่ถูกตรวจรับต้องไม่อยู่ในตัวหาร");
    assert.strictEqual(r.ftfRate, 50);

    // ไม่มีใบไหนถูกตรวจรับเลย = ไม่รู้ผล ต้องคืน null ไม่ใช่ 100%
    assert.strictEqual(techScore([t("E4")], { open: [], pmItems: [] })[0].ftfRate, null,
      "ไม่มีข้อมูลต้องเป็น null ไม่ใช่เลขสวยที่หลอกคนอ่าน");
  }

  /* ── ตรงเวลา: ใบที่รอของจากข้างนอก ช่างเร่งเองไม่ได้ ต้องไม่เอามาตัดสิน ── */
  {
    const late = { created_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-20T00:00:00Z",
                   due_at: "2026-09-02T00:00:00Z" };
    const r = techScore([
      t("F1", late),                                  // ช้าเพราะช่าง
      t("F2", { ...late, vendor: "ร้านกลึง" }),        // ช้าเพราะส่งออกไปข้างนอก
      t("F3", { ...late, pr_no: "PR2569-001" }),      // ช้าเพราะรอจัดซื้อ
    ], { open: [], pmItems: [] })[0];
    assert.strictEqual(r.onTimeBase, 1, "ใบที่รอของนอกต้องถูกตัดออกจากตัวหาร");
    assert.strictEqual(r.onTimeRate, 0);
    assert.strictEqual(waitedOutside({ vendor: " " }), false, "ช่องว่างล้วนไม่ใช่การส่งออกจริง");
  }

  /* ── วินัยการบันทึก: ต้องมีทั้งเวลาซ่อมและสิ่งที่ทำ ขาดอย่างใดอย่างหนึ่งไม่ผ่าน ── */
  {
    assert.strictEqual(loggedWell({ repair_minutes: 60, repair_action: "x" }), true);
    assert.strictEqual(loggedWell({ started_at: "2026-09-01T00:00:00Z", repair_action: "x" }), true,
      "กดปุ่มเริ่มซ่อมก็นับ ไม่ใช่บังคับกรอกนาทีอย่างเดียว");
    assert.strictEqual(loggedWell({ repair_minutes: 60, repair_action: "  " }), false,
      "เว้นว่างด้วยช่องว่างต้องไม่ผ่าน");
    assert.strictEqual(loggedWell({ repair_minutes: 0, repair_action: "x" }), false);

    const r = techScore([t("G1"), t("G2", { repair_action: "", repair_minutes: 0 })],
                        { open: [], pmItems: [] })[0];
    assert.strictEqual(r.logRate, 50);
  }

  /* ── ซ่อมซ้ำ: ความรับผิดอยู่ที่คนที่ปิดใบก่อนหน้า ไม่ใช่คนที่มารับใบใหม่ ──
     ถ้าโทษคนรับใบใหม่ ช่างจะเลี่ยงไม่รับงานต่อจากเพื่อน ซึ่งทำให้ทีมพัง */
  {
    const r = techScore([
      t("H1", { technician: "ชล", created_at: "2026-09-01T00:00:00Z" }),
      t("H2", { technician: "ตั้ม", created_at: "2026-09-10T00:00:00Z" }),   // เครื่องเดิมกลับมาใน 9 วัน
    ], { open: [], pmItems: [], repeatWin: 30 });
    const chol = r.find((x) => x.name === "ชล"), tum = r.find((x) => x.name === "ตั้ม");
    assert.strictEqual(chol.repeats, 1, "คนที่ซ่อมรอบแรกเป็นคนรับผิด");
    assert.strictEqual(tum.repeats, 0, "คนที่มารับใบใหม่ไม่ใช่คนผิด");
    assert.strictEqual(chol.repeatRate, 100);

    /* ใบก่อนหน้าที่ยังไม่ปิด ยังไม่ถือว่า "ซ่อมแล้วกลับมาเสีย"
       ถ้าไม่กัน repeats จะมากกว่า closed แล้ว % ซ่อมซ้ำของคนนั้นทะลุ 100% */
    const stillOpen = techScore([
      t("H5", { technician: "ชล", status: STATUS.REPAIR, completed_at: "",
                created_at: "2026-09-01T00:00:00Z" }),
      t("H6", { technician: "ตั้ม", created_at: "2026-09-05T00:00:00Z" }),
    ], { open: [], pmItems: [], repeatWin: 30 });
    assert.strictEqual(stillOpen.find((x) => x.name === "ชล"), undefined,
      "ใบที่ยังไม่ปิดต้องไม่ทำให้คนนั้นโผล่มาพร้อมยอดซ่อมซ้ำ");

    // นอกกรอบวันต้องไม่นับ
    const far = techScore([
      t("H3", { technician: "ชล", created_at: "2026-09-01T00:00:00Z" }),
      t("H4", { technician: "ตั้ม", created_at: "2026-11-01T00:00:00Z" }),
    ], { open: [], pmItems: [], repeatWin: 30 }).find((x) => x.name === "ชล");
    assert.strictEqual(far.repeats, 0);
  }

  /* ── PM ตามแผน ── */
  {
    const r = techScore([t("I1")], { open: [], pmItems: [
      { owner: "ชล", actual: "2026-09-02" },
      { owner: "ชล", actual: "" },
      { owner: "ตั้ม", actual: "2026-09-03" },
    ] });
    const chol = r.find((x) => x.name === "ชล");
    assert.strictEqual(chol.pmPlan, 2);
    assert.strictEqual(chol.pmRate, 50);

    // ยังไม่ได้เปิดหน้าแผน PM = ไม่มีข้อมูล ต้องเป็น null ไม่ใช่ 0%
    assert.strictEqual(techScore([t("I2")], { open: [], pmItems: [] })[0].pmRate, null);

    // คนที่มีแต่งาน PM ยังไม่เคยปิดใบซ่อม ต้องยังโผล่ในรายงาน ไม่ใช่หายไป
    const only = techScore([], { open: [], pmItems: [{ owner: "โฟร์", actual: "" }] });
    assert.strictEqual(only.length, 1);
    assert.strictEqual(only[0].closed, 0);
  }

  /* ── ข้อมูลน้อยต้องบอกว่าน้อย ไม่ใช่โชว์เลขที่ดูเหมือนตัดสินได้ ── */
  {
    const few = techScore([t("J1"), t("J2")], { open: [], pmItems: [] })[0];
    assert.strictEqual(few.enough, false, `ปิด 2 ใบยังไม่พอตัดสิน (เกณฑ์ ${TECH_MIN_N})`);
    const many = techScore(["K1", "K2", "K3", "K4", "K5"].map((id) => t(id)),
                           { open: [], pmItems: [] })[0];
    assert.strictEqual(many.enough, true);
  }

  /* ── งานค้าง: ไม่ขึ้นกับช่วงเวลาที่เลือก เพราะคำถามคือ "ตอนนี้ใครงานล้น" ── */
  {
    const r = techScore([t("L1", { repair_minutes: 90 })], {
      pmItems: [],
      open: [{ assignee: "ชล" }, { assignee: "ชล" }, { assignee: "ตั้ม" }],
      weekHours: 45,
    });
    const chol = r.find((x) => x.name === "ชล");
    assert.strictEqual(chol.open, 2);
    // 2 ใบ × มัธยฐาน 1.5 ชม. ÷ 45 ชม./สัปดาห์
    assert.strictEqual(chol.backlogWeeks, Math.round((2 * 1.5 / 45) * 10) / 10);

    // ไม่เคยปิดใบ = ไม่รู้ว่าใบหนึ่งใช้เวลาเท่าไหร่ ต้องไม่เดาเป็น 0
    assert.strictEqual(r.find((x) => x.name === "ตั้ม").backlogWeeks, null);
  }
}

/* ═══ Phase 2: กดตัวเลขของช่างแล้วต้องเห็นใบที่ประกอบเป็นเลขนั้น ═══
   ตัวเลขรายคนจะถูกเอาไปคุยกับเจ้าตัว ถ้ากดดูที่มาไม่ได้ก็เถียงกันไม่จบ */
{
  sandbox.setMachines([{ name: "Cut Slot2", group: "เครื่องจักรหลัก" }]);
  const t = (id, opt = {}) => ({
    ticket_id: id, machine_name: "Cut Slot2", description: "อาการ " + id,
    created_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-01T04:00:00Z",
    status: STATUS.DONE, cost: 0, reject_count: 0, repair_minutes: 60,
    started_at: "", repair_action: "เปลี่ยนอะไหล่", technician: "ชล",
    assignee: "", vendor: "", pr_no: "", verification_status: "", ...opt,
  });

  const list = [
    t("P1"),
    t("P2", { verification_status: "ผ่าน", reject_count: 1 }),
    t("P3", { technician: "ตั้ม" }),                       // คนอื่น ต้องไม่หลุดเข้ามา
    t("P4", { technician: "ชล", created_at: "2026-09-12T00:00:00Z" }),  // ซ้ำกับ P1..P3
  ];
  sandbox.setTickets([...list, { ticket_id: "P9", status: STATUS.REPAIR, assignee: "ชล",
    machine_name: "Cut Slot2", created_at: "2026-09-20T00:00:00Z", completed_at: "" }]);
  const p = { list, pm: {}, year: 2026, month: "09" };

  // ทางแยกต้องวิ่งเข้า techDrill ไม่ใช่ตกลง switch ของ KPI แผนก
  const viaKey = kpiDrill("tech:closed", {}, p, 72, "ชล");
  assert.ok(viaKey, 'kpiDrill ต้องรับ key "tech:*" ได้ ไม่งั้นกดตัวเลขแล้วไม่มีอะไรเกิดขึ้น');
  assert.ok(viaKey.title.includes("ชล"), "หัวตารางต้องบอกว่าเป็นของใคร");

  // ทุกตัวต้องเปิดได้ และต้องมีหัวคอลัมน์ครบเท่าจำนวนช่องในแถว
  ["closed", "ftf", "onTime", "log", "repeat", "pm", "open"].forEach((m) => {
    const d = techDrill(m, "ชล", p, 72);
    assert.ok(d, `techDrill("${m}") ต้องไม่คืน null`);
    assert.ok(d.formula, `${m}: ต้องบอกสูตรที่ใช้ ไม่ใช่โชว์รายการเปล่า ๆ`);
    d.rows.forEach((r) => assert.strictEqual(r.cells.length, d.head.length,
      `${m}: จำนวนช่องในแถวไม่ตรงกับหัวคอลัมน์ — ตารางจะเหลื่อม`));
  });

  // ใบของคนอื่นต้องไม่หลุดเข้ามา
  const closed = techDrill("closed", "ชล", p, 72);
  assert.strictEqual(closed.rows.length, 3);
  assert.ok(!closed.rows.some((r) => r.cells[0] === "P3"), "ใบของช่างคนอื่นต้องไม่อยู่ในนี้");

  // FTF: ตัวหารคือใบที่ถูกตรวจรับ จึงต้องมีแค่ใบเดียวในตาราง และต้องถูกทำเครื่องหมายว่าผิดปกติ
  const ftf = techDrill("ftf", "ชล", p, 72);
  assert.strictEqual(ftf.rows.length, 1);
  assert.strictEqual(ftf.rows[0].bad, true);

  // ซ่อมซ้ำ: ต้องขึ้นเป็น "คู่" ให้เทียบอาการได้ ไม่ใช่รายการใบเดี่ยว
  const rep = techDrill("repeat", "ชล", p, 72);
  assert.ok(rep.head.length === 6 && rep.rows.every((r) => r.cells.length === 6),
    "ต้องเห็นทั้งใบเดิมและใบที่ซ้ำคู่กัน ไม่งั้นตัดสินไม่ได้ว่าอาการเดียวกันไหม");

  // งานค้างดูทั้งระบบ ไม่ใช่เฉพาะช่วงที่เลือก
  const op = techDrill("open", "ชล", p, 72);
  assert.strictEqual(op.rows.length, 1);
  assert.strictEqual(op.rows[0].cells[0], "P9");

  // ชื่อที่ไม่มีอยู่จริงต้องได้ตารางว่าง ไม่ใช่ throw
  assert.strictEqual(techDrill("closed", "ไม่มีคนนี้", p, 72).rows.length, 0);
  assert.strictEqual(techDrill("ไม่มี metric นี้", "ชล", p, 72), null);
}

/* หน้าจอต้องต่อสายครบ — ลืมจุดใดจุดหนึ่งแล้วแท็บจะว่างเปล่าโดยไม่มี error ให้เห็น */
{
  const app = fs.readFileSync("gas/app.html", "utf8");
  const idx = fs.readFileSync("gas/index.html", "utf8");
  // ผลงานรายคนย้ายไปอยู่ใต้เมนู KPI แล้ว ไม่ใช่แท็บย่อยของ Dashboard อีกต่อไป
  assert.ok(!app.includes('["tech",'), "ต้องไม่เหลือแท็บย่อยเดิมไว้");
  assert.ok(!idx.includes('id="sub-tech"'), "panel เดิมต้องถูกย้ายออก ไม่ใช่ทิ้งไว้ซ้ำ");
  assert.ok(idx.includes('id="rolePick"'), "ต้องมีช่องเลือกตำแหน่งในหน้า KPI");
  assert.ok(idx.includes('id="tsBody"'), "ต้องมี tbody ให้เขียนแถวลงไป");
  assert.ok(app.includes('openKpiDrill("tech:" + c.dataset.tsm'), "ต้องผูกคลิกที่ตัวเลข");
}

/* ═══ Phase 3: คะแนนรวมถ่วงน้ำหนัก ═══
   คะแนนก้อนเดียวจะถูกเอาไปใช้ตัดสินคน ความผิดพลาดที่นี่จึงราคาแพงกว่าที่อื่นทั้งหมด */
{
  const base = { enough: true, ftfRate: 100, onTimeRate: 100, logRate: 100,
                 repeatRate: 0, pmRate: 100 };

  // ทุกตัวเต็ม = 100 · ซ่อมซ้ำ 0% คือดีที่สุด ไม่ใช่แย่ที่สุด
  assert.strictEqual(techTotal(base, TECH_WEIGHT_DEFAULT).score, 100);

  /* ตัวที่ยิ่งน้อยยิ่งดีต้องกลับด้าน — ถ้าลืมกลับ ช่างที่ซ่อมซ้ำเยอะจะได้คะแนนสูง */
  assert.ok(TECH_INVERTED.includes("repeat"));
  /* น้ำหนักที่ส่งเข้ามาถูก "ผสม" ทับค่าตั้งต้น ไม่ใช่แทนที่ทั้งก้อน —
     ถ้ามีคนลบแถวน้ำหนักออกจากชีต ตัวนั้นต้องไม่หายไปจากคะแนนแบบเงียบ ๆ
     เทสต์ที่อยากวัดตัวเดียวจึงต้องสั่งปิดตัวอื่นด้วย 0 เอง */
  const only = (key, w) => ({ ftf: 0, onTime: 0, log: 0, repeat: 0, pm: 0, [key]: w });
  const r100 = techTotal({ ...base, repeatRate: 100 }, only("repeat", 20));
  assert.strictEqual(r100.score, 0, "ซ่อมซ้ำ 100% ต้องได้ 0 คะแนน ไม่ใช่ 100");

  /* ตัวที่ไม่มีข้อมูลต้องถูกตัดออกจาก *ทั้งเศษและส่วน* ไม่ใช่นับเป็น 0
     ช่างที่เดือนนั้นไม่มีงาน PM ให้ทำ ต้องไม่โดนหักคะแนนจากงานที่ไม่มีใครมอบหมาย */
  const noPm = techTotal({ ...base, pmRate: null }, TECH_WEIGHT_DEFAULT);
  assert.strictEqual(noPm.score, 100, "ไม่มีข้อมูล PM ต้องไม่ลากคะแนนลง");
  assert.strictEqual(noPm.usedWeight,
    TECH_WEIGHT_DEFAULT.ftf + TECH_WEIGHT_DEFAULT.onTime +
    TECH_WEIGHT_DEFAULT.log + TECH_WEIGHT_DEFAULT.repeat,
    "น้ำหนักของตัวที่ไม่มีข้อมูลต้องหายไปจากตัวหารด้วย");
  assert.strictEqual(noPm.parts.length, 4);

  // ถ่วงน้ำหนักจริง ไม่ใช่เฉลี่ยเฉย ๆ
  const w = techTotal({ enough: true, ftfRate: 100, onTimeRate: 0, logRate: null,
                        repeatRate: null, pmRate: null },
                      { ...only("ftf", 75), onTime: 25 });
  assert.strictEqual(w.score, 75, "100×75 + 0×25 ÷ 100 = 75");

  // น้ำหนัก 0 = ไม่เอาตัวนั้นมาคิดเลย (ปิดตัวชี้วัดได้จากชีตโดยไม่ต้องแก้โค้ด)
  const off = techTotal({ ...base, ftfRate: 0 }, { ...only("onTime", 10), ftf: 0 });
  assert.strictEqual(off.score, 100);
  assert.ok(!off.parts.some((x) => x.key === "ftf"));

  // ข้อมูลไม่พอ = ไม่ให้คะแนน ไม่ใช่ให้ 0 (ซึ่งอ่านเหมือน "ทำงานแย่")
  assert.strictEqual(techTotal({ ...base, enough: false }, TECH_WEIGHT_DEFAULT), null);
  // ไม่มีตัวไหนมีข้อมูลเลย ก็ให้คะแนนไม่ได้
  assert.strictEqual(techTotal({ enough: true, ftfRate: null, onTimeRate: null,
    logRate: null, repeatRate: null, pmRate: null }, TECH_WEIGHT_DEFAULT), null);

  // น้ำหนักจากชีตต้องมาแทนค่าตั้งต้นได้จริง
  const t = (id, opt = {}) => ({
    ticket_id: id, machine_name: "Cut Slot2", description: "x", created_at: "2026-09-01T00:00:00Z",
    completed_at: "2026-09-01T04:00:00Z", status: STATUS.DONE, cost: 0, reject_count: 0,
    repair_minutes: 60, started_at: "", repair_action: "ทำแล้ว", technician: "ชล",
    assignee: "", vendor: "", pr_no: "", verification_status: "ผ่าน", ...opt });
  sandbox.setMachines([{ name: "Cut Slot2", group: "เครื่องจักรหลัก" }]);
  const five = ["A", "B", "C", "D", "E"].map((x) => t(x));
  const scored = techScore(five, { open: [], pmItems: [], weights: only("ftf", 100) })[0];
  assert.strictEqual(scored.total.usedWeight, 100, "ต้องใช้น้ำหนักที่ส่งเข้ามา ไม่ใช่ค่าตั้งต้น");
  assert.strictEqual(scored.total.score, 100);

  // เรียงตามคะแนนก่อน — ตารางต้องเอาคนที่ทำได้ดีขึ้นก่อน ไม่ใช่เรียงตามจำนวนใบ
  const mixed = techScore([
    ...five,
    ...["F", "G", "H", "I", "J", "K"].map((x) =>
      t(x, { technician: "ตั้ม", reject_count: 1 })),
  ], { open: [], pmItems: [] });
  assert.strictEqual(mixed[0].name, "ชล", "คนคะแนนสูงต้องอยู่บนสุด แม้ปิดใบน้อยกว่า");
  assert.ok(mixed[0].total.score > mixed[1].total.score);
}


/* ═══ วิศวกรรับรองค่าพารามิเตอร์ ═══
   เขียนลงชีตของ CMMS เอง ไฟล์ต้นทางต้องไม่ถูกแตะแม้แถวเดียว */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  // ตรึงเวลา "ตอนนี้" ไว้ แต่วันที่ของแถวเก่าต้องฟอร์แมตตามของจริง ไม่งั้นเทียบลำดับไม่ได้
  gas.Utilities = { formatDate: (d, tz, f) => {
    const q = (n) => String(n).padStart(2, "0");
    const day = `${d.getFullYear()}-${q(d.getMonth() + 1)}-${q(d.getDate())}`;
    return f.indexOf("HH") > -1 ? day + " 09:00:00" : day;
  } };
  gas.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  gas.prop_ = () => "PARAM_FILE";
  gas.cfg_ = (k, d) => d;
  gas.machines_ = () => [{ name: "Extrusion 110", owner: "\u0e0a\u0e48\u0e32\u0e07 Ext" },
                         { name: "UV 2", owner: "\u0e0a\u0e48\u0e32\u0e07 UV" }];
  gas.aliasMap_ = () => ({ "ext3-110": "Extrusion 110", "uv2": "UV 2" });
  gas.team_ = () => [{ name: "\u0e0a\u0e48\u0e32\u0e07\u0e42\u0e1f\u0e23\u0e4c", role: "TECH", station: "\u0e0a\u0e48\u0e32\u0e07 Ext" },
                     { name: "\u0e0a\u0e48\u0e32\u0e07\u0e40\u0e1a\u0e34\u0e23\u0e4c\u0e14", role: "TECH", station: "\u0e0a\u0e48\u0e32\u0e07 UV" }];

  const HEAD = ["Date", "Time", "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23", "\u0e2a\u0e16\u0e32\u0e19\u0e30", "\u0e0a\u0e48\u0e32\u0e07\u0e1c\u0e39\u0e49\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01", "ZONE 1", "MOLD 8"];
  const DATA = [HEAD,
    ["2026-09-29", 7, "EXT3-110", "\u0e40\u0e14\u0e34\u0e19\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e1c\u0e25\u0e34\u0e15", "\u0e0a\u0e48\u0e32\u0e07\u0e42\u0e1f\u0e23\u0e4c", 198, 0],
    ["2026-09-30", 7, "EXT3-110", "\u0e40\u0e14\u0e34\u0e19\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e1c\u0e25\u0e34\u0e15", "\u0e0a\u0e48\u0e32\u0e07\u0e42\u0e1f\u0e23\u0e4c", 199, 0]];
  const CL = [["\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07", "\u0e1f\u0e2d\u0e23\u0e4c\u0e21", "\u0e23\u0e2b\u0e31\u0e2a\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23", "\u0e01\u0e25\u0e38\u0e48\u0e21", "\u0e1b\u0e49\u0e32\u0e22", "key", "\u0e0a\u0e19\u0e34\u0e14", "std", "\u0e2b\u0e19\u0e48\u0e27\u0e22", "tol"],
    ["Extrusion 110", "FM-MT-12-00", "SM-B4-EX-03", "Barrel", "ZONE 1", "ZONE 1", "num", 200, "\u00b0C", 5],
    ["Extrusion 110", "FM-MT-12-00", "SM-B4-EX-03", "Mold", "MOLD 8", "MOLD 8", "na", "", "", ""],
    ["Extrusion 110", "FM-MT-12-00", "SM-B4-EX-03", "Mold", "Pressure", "pressure", "auto", "", "Mpa", ""],
    ["Extrusion 110", "FM-MT-12-00", "SM-B4-EX-03", "Switch", "Vacuum", "vacuum", "onoff", "", "", ""]];

  const mk = (rows, name) => ({
    getLastRow: () => rows.length, getLastColumn: () => rows[0].length, getName: () => name,
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    getRange: () => ({ getValues: () => [rows[0].slice()],
                       setValues() { return this; }, setFontWeight() { return this; },
                       setBackground() { return this; } }),
    setFrozenRows() {},
    appendRow: (r) => rows.push(r.slice()),
    rows,
  });
  gas.paramSS_ = () => ({ getName: () => "EXT", getSheetByName: () => null,
                          getSheets: () => [mk(DATA, "Data")] });

  // \u0e0a\u0e35\u0e15\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e02\u0e2d\u0e07 CMMS \u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35 \u2014 \u0e15\u0e49\u0e2d\u0e07\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e43\u0e2b\u0e49\u0e15\u0e2d\u0e19\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e41\u0e23\u0e01
  const ok = { sh: null };
  gas.ss_ = () => ({
    getSheetByName: (n) => n === "\u0e40\u0e0a\u0e47\u0e04\u0e25\u0e34\u0e2a\u0e15\u0e4c\u0e1e\u0e32\u0e23\u0e32\u0e21\u0e34\u0e40\u0e15\u0e2d\u0e23\u0e4c" ? mk(CL, n)
            : n === "\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e1e\u0e32\u0e23\u0e32\u0e21\u0e34\u0e40\u0e15\u0e2d\u0e23\u0e4c" ? ok.sh : null,
    insertSheet: (n) => (ok.sh = mk([gas.PARAM_OK_HEAD.slice()], n)),
  });

  const tech = { name: "\u0e0a\u0e48\u0e32\u0e07\u0e42\u0e1f\u0e23\u0e4c", role: "TECH" };
  let who = tech;
  gas.requireAuth_ = () => who;

  /* ══ วิศวกรรับรองค่าที่ช่างลง ══ */
  const lead = { name: "\u0e2b\u0e31\u0e27\u0e2b\u0e19\u0e49\u0e32\u0e0a\u0e48\u0e32\u0e07", role: "LEAD" };
  const r0 = gas.apiParamMachine("t", "EXT3-110", 7);
  assert.strictEqual(r0.approval, null, "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e43\u0e04\u0e23\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07 = null \u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48 \u0e1c\u0e48\u0e32\u0e19");
  assert.strictEqual(r0.canApprove, false, "\u0e0a\u0e48\u0e32\u0e07\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49");
  assert.strictEqual(r0.code, "SM-B4-EX-03", "\u0e23\u0e2b\u0e31\u0e2a\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e32\u0e08\u0e32\u0e01\u0e40\u0e0a\u0e47\u0e04\u0e25\u0e34\u0e2a\u0e15\u0e4c");

  assert.throws(() => gas.apiParamApprove("t", "EXT3-110",
    { date: r0.date, round: r0.round, result: "\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e41\u0e25\u0e49\u0e27" }),
    /\u0e2b\u0e31\u0e27\u0e2b\u0e19\u0e49\u0e32\u0e07\u0e32\u0e19\u0e2b\u0e23\u0e37\u0e2d\u0e27\u0e34\u0e28\u0e27\u0e01\u0e23/, "\u0e0a\u0e48\u0e32\u0e07\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e40\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49");

  who = lead;
  assert.throws(() => gas.apiParamApprove("t", "EXT3-110",
    { date: r0.date, round: r0.round, result: "\u0e2d\u0e30\u0e44\u0e23\u0e01\u0e47\u0e44\u0e21\u0e48\u0e23\u0e39\u0e49" }),
    /\u0e1c\u0e25\u0e01\u0e32\u0e23\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07/, "\u0e1c\u0e25\u0e19\u0e2d\u0e01\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19");

  const r1 = gas.apiParamApprove("t", "EXT3-110",
    { date: r0.date, round: r0.round, result: "\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e41\u0e25\u0e49\u0e27", note: "\u0e14\u0e39\u0e2b\u0e19\u0e49\u0e32\u0e07\u0e32\u0e19\u0e41\u0e25\u0e49\u0e27" });
  assert.strictEqual(r1.approval.result, "\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e41\u0e25\u0e49\u0e27");
  assert.strictEqual(r1.approval.by, "\u0e2b\u0e31\u0e27\u0e2b\u0e19\u0e49\u0e32\u0e0a\u0e48\u0e32\u0e07");
  assert.strictEqual(r1.history[0].okResult, "\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e41\u0e25\u0e49\u0e27", "\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e15\u0e49\u0e2d\u0e07\u0e1e\u0e01\u0e1c\u0e25\u0e01\u0e32\u0e23\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e44\u0e1b\u0e14\u0e49\u0e27\u0e22");
  assert.strictEqual(r1.history[r1.history.length - 1].okResult, "", "\u0e23\u0e2d\u0e1a\u0e2d\u0e37\u0e48\u0e19\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e1e\u0e25\u0e2d\u0e22\u0e44\u0e14\u0e49\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e44\u0e1b\u0e14\u0e49\u0e27\u0e22");

  // \u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e0b\u0e49\u0e33\u0e44\u0e14\u0e49 \u0e41\u0e16\u0e27\u0e43\u0e2b\u0e21\u0e48\u0e17\u0e31\u0e1a \u0e41\u0e16\u0e27\u0e40\u0e01\u0e48\u0e32\u0e22\u0e31\u0e07\u0e2d\u0e22\u0e39\u0e48 (append-only)
  const r2 = gas.apiParamApprove("t", "EXT3-110",
    { date: r0.date, round: r0.round, result: "\u0e15\u0e35\u0e01\u0e25\u0e31\u0e1a\u0e43\u0e2b\u0e49\u0e25\u0e07\u0e43\u0e2b\u0e21\u0e48", note: "\u0e27\u0e31\u0e14\u0e0b\u0e49\u0e33" });
  assert.strictEqual(r2.approval.result, "\u0e15\u0e35\u0e01\u0e25\u0e31\u0e1a\u0e43\u0e2b\u0e49\u0e25\u0e07\u0e43\u0e2b\u0e21\u0e48", "\u0e41\u0e16\u0e27\u0e2b\u0e25\u0e31\u0e07\u0e17\u0e31\u0e1a\u0e41\u0e16\u0e27\u0e01\u0e48\u0e2d\u0e19");
  assert.strictEqual(ok.sh.rows.length, 3, "\u0e15\u0e49\u0e2d\u0e07\u0e15\u0e48\u0e2d\u0e17\u0e49\u0e32\u0e22 \u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e40\u0e02\u0e35\u0e22\u0e19\u0e17\u0e31\u0e1a\u0e41\u0e16\u0e27\u0e40\u0e14\u0e34\u0e21");

  /* \u0e04\u0e19\u0e25\u0e07\u0e04\u0e48\u0e32\u0e01\u0e31\u0e1a\u0e04\u0e19\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e04\u0e19\u0e40\u0e14\u0e35\u0e22\u0e27\u0e01\u0e31\u0e19
     \u0e40\u0e0b\u0e47\u0e19\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e07\u0e32\u0e19\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07\u0e44\u0e14\u0e49 = \u0e25\u0e32\u0e22\u0e40\u0e0b\u0e47\u0e19\u0e19\u0e31\u0e49\u0e19\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e41\u0e1b\u0e25\u0e27\u0e48\u0e32\u0e21\u0e35\u0e43\u0e04\u0e23\u0e21\u0e32\u0e15\u0e23\u0e27\u0e08 */
  who = { name: "\u0e0a\u0e48\u0e32\u0e07\u0e42\u0e1f\u0e23\u0e4c", role: "LEAD" };
  assert.throws(() => gas.apiParamApprove("t", "EXT3-110",
    { date: r0.date, round: r0.round, result: "\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e41\u0e25\u0e49\u0e27" }),
    /\u0e04\u0e38\u0e13\u0e40\u0e1b\u0e47\u0e19\u0e04\u0e19\u0e25\u0e07\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e40\u0e2d\u0e07/);
  assert.strictEqual(gas.apiParamMachine("t", "EXT3-110", 7).approveSelf, true,
    "\u0e2b\u0e19\u0e49\u0e32\u0e08\u0e2d\u0e15\u0e49\u0e2d\u0e07\u0e23\u0e39\u0e49\u0e27\u0e48\u0e32\u0e04\u0e19\u0e19\u0e35\u0e49\u0e25\u0e07\u0e40\u0e2d\u0e07 \u0e08\u0e30\u0e44\u0e14\u0e49\u0e0b\u0e48\u0e2d\u0e19\u0e1b\u0e38\u0e48\u0e21");
  who = tech;

  /* ชื่อผู้รับรองต้องมาจากคนที่ล็อกอินเท่านั้น
     ถ้ารับชื่อจากหน้าเว็บได้ ลายเซ็นบนแถวนั้นก็คือชื่อที่ใครก็พิมพ์ใส่ได้ */
  who = lead;
  const spoof = gas.apiParamApprove("t", "EXT3-110", { date: r0.date, round: r0.round,
    result: "รับรองแล้ว", by: "คนอื่น", "ผู้รับรอง": "คนอื่น" });
  assert.strictEqual(spoof.approval.by, "หัวหน้าช่าง",
    "ต้องไม่รับชื่อผู้รับรองจากหน้าเว็บ");
  who = tech;

  const app2 = fs.readFileSync("gas/app.html", "utf8");
  assert.ok(fs.readFileSync("gas/index.html", "utf8").includes('id="pdOkMe"'), "แถบรับรองต้องมีช่องผู้รับรอง");
  assert.ok(/\$\("#pdOkMe"\)\.textContent = ME/.test(app2),
    "ชื่อผู้รับรองบนหน้าจอต้องมาจากคนที่ล็อกอิน ไม่ใช่ช่องให้พิมพ์");
  assert.ok(/gsAuth\("apiParamApprove"/.test(app2), "\u0e1b\u0e38\u0e48\u0e21\u0e23\u0e31\u0e1a\u0e23\u0e2d\u0e07\u0e15\u0e49\u0e2d\u0e07\u0e40\u0e23\u0e35\u0e22\u0e01 apiParamApprove");

  /* ══ หน้าพารามิเตอร์เป็นแดชบอร์ดอ่านอย่างเดียว ══
     ช่างกรอกที่ Google Form ระบบอ่านมาแสดง
     เคยทำปุ่มกรอกในระบบไว้รอบหนึ่งแล้วถอดออก เทสต์ชุดนี้กันไม่ให้มันกลับมาเงียบ ๆ */
  const app = fs.readFileSync("gas/app.html", "utf8");
  const idx = fs.readFileSync("gas/index.html", "utf8");
  const code = fs.readFileSync("gas/Code.gs", "utf8");
  assert.ok(!/function apiParamSave/.test(code), "ต้องไม่มี API บันทึกพารามิเตอร์");
  assert.ok(!/apiParamSave/.test(app), "หน้าเว็บต้องไม่เรียกบันทึก");
  assert.ok(!idx.includes('id="pdSave"'), "ต้องไม่มีปุ่มบันทึกบนหน้าจอ");
  assert.ok(idx.includes('id="pdFormLink"'), "ต้องมีลิงก์ไปฟอร์มแทน");
  /* ปุ่มที่ไม่ได้ใส่ style="background:..." ต้องไม่กลายเป็นตัวหนังสือขาวบนพื้นโปร่งใส
     เคยเจอมาแล้วกับปุ่มบันทึกและปุ่มรับรอง — มองไม่เห็นเลยและไม่มี error ให้จับ */
  const css = fs.readFileSync("gas/styles.html", "utf8");
  const i0 = css.indexOf("\n.btn {"), i1 = css.indexOf("}", i0);
  assert.ok(i0 > -1 && /background:\s*(?!transparent|none)\S/.test(css.slice(i0, i1)), ".btn ต้องมีสีพื้นตั้งต้น");
}


/* ═══ ตัวเลขบนชิปต้องเปลี่ยนตามช่วงเวลาที่เลือก ═══
   เดิมชิปนับจากใบทั้งระบบ เลือก "เดือนนี้" แล้วชิปยังขึ้น 340 แต่ตารางมีแถวเดียว */
{
  const T = [
    { ticket_id: "A1", created_at: "2026-10-02T03:00:00Z", status: STATUS.DONE,
      priority: "\u0e1b\u0e01\u0e15\u0e34", machine_name: "Powder mill", description: "", reporter: "", assignee: "" },
    { ticket_id: "A2", created_at: "2026-10-02T04:00:00Z", status: STATUS.WAIT,
      priority: "\u0e27\u0e34\u0e01\u0e24\u0e15", machine_name: "UV 2", description: "", reporter: "", assignee: "" },
    { ticket_id: "B1", created_at: "2026-09-15T03:00:00Z", status: STATUS.WAIT,
      priority: "\u0e1b\u0e01\u0e15\u0e34", machine_name: "Powder mill", description: "", reporter: "", assignee: "" },
    { ticket_id: "B2", created_at: "2026-08-01T03:00:00Z", status: STATUS.DONE,
      priority: "\u0e1b\u0e01\u0e15\u0e34", machine_name: "XPE 1", description: "", reporter: "", assignee: "" },
  ];
  const n = (f) => ticketScope(T, f).length;

  assert.strictEqual(n({}), 4, "\u0e44\u0e21\u0e48\u0e43\u0e2a\u0e48\u0e15\u0e31\u0e27\u0e01\u0e23\u0e2d\u0e07 = \u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14");
  assert.strictEqual(n({ from: "2026-10-01", to: "2026-10-03" }), 2,
    "\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02\u0e1a\u0e19\u0e0a\u0e34\u0e1b\u0e15\u0e49\u0e2d\u0e07\u0e2b\u0e14\u0e15\u0e32\u0e21\u0e0a\u0e48\u0e27\u0e07\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48");
  assert.strictEqual(n({ from: "2026-10-01" }), 2);
  assert.strictEqual(n({ to: "2026-08-31" }), 1);
  assert.strictEqual(n({ pri: "\u0e27\u0e34\u0e01\u0e24\u0e15" }), 1, "\u0e15\u0e31\u0e27\u0e01\u0e23\u0e2d\u0e07\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e33\u0e04\u0e31\u0e0d\u0e01\u0e47\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e1c\u0e25");
  assert.strictEqual(n({ q: "powder" }), 2, "\u0e04\u0e49\u0e19\u0e2b\u0e32\u0e01\u0e47\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e1c\u0e25 \u0e41\u0e25\u0e30\u0e44\u0e21\u0e48\u0e2a\u0e19\u0e15\u0e31\u0e27\u0e1e\u0e34\u0e21\u0e1e\u0e4c");
  assert.strictEqual(n({ from: "2026-10-01", to: "2026-10-03", q: "powder" }), 1,
    "\u0e2b\u0e25\u0e32\u0e22\u0e15\u0e31\u0e27\u0e01\u0e23\u0e2d\u0e07\u0e15\u0e49\u0e2d\u0e07\u0e17\u0e33\u0e07\u0e32\u0e19\u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e01\u0e31\u0e19");

  /* \u0e2a\u0e16\u0e32\u0e19\u0e30\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e2d\u0e22\u0e39\u0e48\u0e43\u0e19\u0e15\u0e31\u0e27\u0e01\u0e23\u0e2d\u0e07\u0e19\u0e35\u0e49 \u2014 \u0e44\u0e21\u0e48\u0e07\u0e31\u0e49\u0e19\u0e0a\u0e34\u0e1b "\u0e23\u0e2d\u0e0b\u0e48\u0e2d\u0e21" \u0e08\u0e30\u0e19\u0e31\u0e1a\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e23\u0e2d\u0e0b\u0e48\u0e2d\u0e21\u0e02\u0e2d\u0e07\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07 */
  const inMonth = ticketScope(T, { from: "2026-10-01", to: "2026-10-03" });
  assert.strictEqual(inMonth.filter((t) => t.status === STATUS.WAIT).length, 1);
  assert.strictEqual(inMonth.filter((t) => t.status === STATUS.DONE).length, 1);
}


/* ═══ เช็คชีตประจำวัน — ไฟล์คำตอบของจริง ═══
   5 ชีต หัวคอลัมน์ซ้ำ คำตอบสองระบบปนกัน ไม่มีคอลัมน์ผู้ตรวจ วันที่ผลิตพัง */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  gas.Logger = { log: () => {} };
  gas.Utilities = { formatDate: (d) => {
    const q = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${q(d.getMonth() + 1)}-${q(d.getDate())}`;
  } };
  gas.prop_ = (k) => (k === "CHECK_SHEET_ID" ? "CHECK_FILE" : "");
  gas.cfg_ = (k, d) => d;
  gas.requireAuth_ = () => ({ name: "\u0e2b\u0e31\u0e27\u0e2b\u0e19\u0e49\u0e32\u0e0a\u0e48\u0e32\u0e07", role: "LEAD" });
  gas.aliasMap_ = () => ({
    "sloted machine #2": "Sloted 2",
    "extrusion machine #3 - 110": "Extrusion 110",
    "extrusion machine #3": "Extrusion 110",
  });
  gas.machines_ = () => [
    { name: "Sloted 2", code: "SL2", group: "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23\u0e2b\u0e25\u0e31\u0e01", location: "" },
    { name: "Extrusion 110", code: "EX3", group: "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23\u0e2b\u0e25\u0e31\u0e01", location: "" },
    { name: "XPE 1", code: "XP1", group: "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23\u0e2b\u0e25\u0e31\u0e01", location: "" },
  ];

  const T1 = new Date(2026, 9, 2, 8, 10);   // 2026-10-02 \u0e40\u0e0a\u0e49\u0e32
  const T2 = new Date(2026, 9, 2, 20, 5);   // \u0e27\u0e31\u0e19\u0e40\u0e14\u0e35\u0e22\u0e27\u0e01\u0e31\u0e19 \u0e23\u0e2d\u0e1a\u0e14\u0e36\u0e01
  const T0 = new Date(2026, 9, 1, 9, 0);

  /* \u0e2b\u0e31\u0e27\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c\u0e0b\u0e49\u0e33\u0e01\u0e31\u0e19\u0e08\u0e23\u0e34\u0e07\u0e43\u0e19\u0e44\u0e1f\u0e25\u0e4c\u0e02\u0e2d\u0e07\u0e42\u0e23\u0e07\u0e07\u0e32\u0e19 (Cut-Slot \u0e0b\u0e49\u0e33 3 \u0e04\u0e39\u0e48) \u2014 \u0e15\u0e49\u0e2d\u0e07\u0e2d\u0e48\u0e32\u0e19\u0e14\u0e49\u0e27\u0e22 index */
  const CUT = [
    ["\u0e1b\u0e23\u0e30\u0e17\u0e31\u0e1a\u0e40\u0e27\u0e25\u0e32", "\u0e2b\u0e32\u0e01\u0e1e\u0e1a\u0e04\u0e27\u0e32\u0e21\u0e1c\u0e34\u0e14\u0e1b\u0e01\u0e15\u0e34\u0e43\u0e2b\u0e49\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e23\u0e39\u0e1b", "\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e1c\u0e25\u0e34\u0e15", "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23",
     "\u0e01\u0e30\u0e17\u0e33\u0e07\u0e32\u0e19 (Shift)",
     "\u0e15\u0e39\u0e49 Control [\u0e2a\u0e27\u0e34\u0e15\u0e0a\u0e4c\u0e2a\u0e30\u0e2d\u0e32\u0e14]",
     "\u0e15\u0e39\u0e49 Control [\u0e2a\u0e27\u0e34\u0e15\u0e0a\u0e4c\u0e2a\u0e30\u0e2d\u0e32\u0e14]",
     "\u0e21\u0e2d\u0e40\u0e15\u0e2d\u0e23\u0e4c [\u0e44\u0e21\u0e48\u0e2a\u0e31\u0e48\u0e19]",
     "Status Machine "],
    // \u0e23\u0e2d\u0e1a\u0e40\u0e0a\u0e49\u0e32: \u0e1c\u0e48\u0e32\u0e19\u0e2b\u0e21\u0e14 \u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c\u0e0b\u0e49\u0e33\u0e15\u0e31\u0e27\u0e17\u0e35\u0e48\u0e2a\u0e2d\u0e07\u0e27\u0e48\u0e32\u0e07 = \u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e02\u0e2d\u0e07\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e19\u0e35\u0e49
    [T1, "", "2/10/0069", "Sloted machine #2", "\u0e01\u0e30\u0e40\u0e0a\u0e49\u0e32", "\u0e43\u0e0a\u0e48", "", "\u0e1b\u0e01\u0e15\u0e34", "\u0e1b\u0e01\u0e15\u0e34"],
    // \u0e23\u0e2d\u0e1a\u0e14\u0e36\u0e01: \u0e40\u0e08\u0e2d\u0e02\u0e49\u0e2d\u0e17\u0e35\u0e48\u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19 2 \u0e02\u0e49\u0e2d \u0e04\u0e19\u0e25\u0e30\u0e23\u0e30\u0e1a\u0e1a\u0e04\u0e33\u0e15\u0e2d\u0e1a
    [T2, "http://pic", "2/10/0069", "Sloted machine #2", "\u0e01\u0e30\u0e14\u0e36\u0e01", "\u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48", "", "\u0e44\u0e21\u0e48\u0e1b\u0e01\u0e15\u0e34", "\u0e1b\u0e01\u0e15\u0e34"],
    [T0, "", "1/10/0069", "Sloted machine #2", "\u0e01\u0e30\u0e40\u0e0a\u0e49\u0e32", "\u0e43\u0e0a\u0e48", "", "\u0e1b\u0e01\u0e15\u0e34", "\u0e1b\u0e01\u0e15\u0e34"],
    [T0, "", "1/10/0069", "Slot \u0e44\u0e21\u0e48\u0e23\u0e39\u0e49\u0e08\u0e31\u0e01", "\u0e01\u0e30\u0e40\u0e0a\u0e49\u0e32", "\u0e43\u0e0a\u0e48", "", "\u0e1b\u0e01\u0e15\u0e34", "\u0e1b\u0e01\u0e15\u0e34"],
  ];
  const EXT = [
    ["\u0e1b\u0e23\u0e30\u0e17\u0e31\u0e1a\u0e40\u0e27\u0e25\u0e32", "\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e1c\u0e25\u0e34\u0e15", "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23",
     "\u0e0a\u0e38\u0e14\u0e09\u0e35\u0e14 [\u0e15\u0e39\u0e49\u0e04\u0e2d\u0e19\u0e42\u0e17\u0e23\u0e25\u0e1b\u0e01\u0e15\u0e34]",
     /* \u0e02\u0e49\u0e2d\u0e15\u0e23\u0e27\u0e08\u0e17\u0e35\u0e48\u0e0a\u0e37\u0e48\u0e2d\u0e21\u0e35\u0e04\u0e33\u0e27\u0e48\u0e32 "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23" \u0e2d\u0e22\u0e39\u0e48\u0e02\u0e49\u0e32\u0e07\u0e43\u0e19 \u2014 UV \u0e02\u0e2d\u0e07\u0e08\u0e23\u0e34\u0e07\u0e21\u0e35\u0e41\u0e1a\u0e1a\u0e19\u0e35\u0e49\n        \u0e16\u0e49\u0e32\u0e2b\u0e32\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e42\u0e14\u0e22\u0e44\u0e21\u0e48\u0e01\u0e31\u0e19\u0e02\u0e49\u0e2d\u0e15\u0e23\u0e27\u0e08\u0e2d\u0e2d\u0e01 \u0e08\u0e30\u0e2d\u0e48\u0e32\u0e19\u0e42\u0e14\u0e19\u0e0a\u0e48\u0e2d\u0e07\u0e19\u0e35\u0e49\u0e41\u0e17\u0e19 */
     "\u0e44\u0e1f [\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23\u0e42\u0e0a\u0e27\u0e4c\u0e1b\u0e01\u0e15\u0e34]", "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23"],
    [T1, "2/10/0069", "Extrusion machine #3 - 110", "\u0e43\u0e0a\u0e48",
     "\u0e44\u0e21\u0e48\u0e1b\u0e01\u0e15\u0e34", "\u0e2b\u0e22\u0e38\u0e14\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07"],
  ];

  const mk = (rows, name) => ({
    getLastRow: () => rows.length, getLastColumn: () => rows[0].length, getName: () => name,
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    getRange: (r, c, nr, nc) => ({ getValues: () =>
      rows.slice(r - 1, r - 1 + (nr || 1))
          .map((x) => x.slice(c - 1, c - 1 + (nc || x.length))) }),
  });
  gas.SpreadsheetApp = { openById: () => ({ getName: () => "Daily Check Machine",
    getSheets: () => [mk(CUT, "Cut-Slot"), mk(EXT, "EXT")] }) };

  // \u2500\u2500 \u0e2b\u0e31\u0e27\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c\u0e41\u0e1a\u0e1a "\u0e01\u0e25\u0e38\u0e48\u0e21 [\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d]" \u2500\u2500
  assert.strictEqual(J(gas.checkItemHead_("\u0e15\u0e39\u0e49 Control [\u0e2a\u0e27\u0e34\u0e15\u0e0a\u0e4c\u0e2a\u0e30\u0e2d\u0e32\u0e14]")),
    J({ group: "\u0e15\u0e39\u0e49 Control", label: "\u0e2a\u0e27\u0e34\u0e15\u0e0a\u0e4c\u0e2a\u0e30\u0e2d\u0e32\u0e14" }));
  assert.strictEqual(gas.checkItemHead_("\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e08\u0e31\u0e01\u0e23"), null,
    "\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e41\u0e16\u0e27\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e01\u0e25\u0e32\u0e22\u0e40\u0e1b\u0e47\u0e19\u0e02\u0e49\u0e2d\u0e15\u0e23\u0e27\u0e08");

  // \u2500\u2500 "\u0e44\u0e21\u0e48\u0e1b\u0e01\u0e15\u0e34" \u0e21\u0e35\u0e04\u0e33\u0e27\u0e48\u0e32 "\u0e1b\u0e01\u0e15\u0e34" \u0e2d\u0e22\u0e39\u0e48\u0e02\u0e49\u0e32\u0e07\u0e43\u0e19 \u2014 \u0e15\u0e49\u0e2d\u0e07\u0e40\u0e0a\u0e47\u0e04 "\u0e44\u0e21\u0e48" \u0e01\u0e48\u0e2d\u0e19 \u2500\u2500
  assert.strictEqual(gas.checkAnswer_("\u0e1b\u0e01\u0e15\u0e34"), "ok");
  assert.strictEqual(gas.checkAnswer_("\u0e44\u0e21\u0e48\u0e1b\u0e01\u0e15\u0e34"), "bad");
  assert.strictEqual(gas.checkAnswer_("\u0e43\u0e0a\u0e48"), "ok");
  assert.strictEqual(gas.checkAnswer_("\u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48"), "bad");
  assert.strictEqual(gas.checkAnswer_(""), "", "\u0e0a\u0e48\u0e2d\u0e07\u0e27\u0e48\u0e32\u0e07 = \u0e02\u0e49\u0e2d\u0e19\u0e35\u0e49\u0e44\u0e21\u0e48\u0e21\u0e35\u0e43\u0e19\u0e1f\u0e2d\u0e23\u0e4c\u0e21\u0e02\u0e2d\u0e07\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e19\u0e35\u0e49");
  assert.strictEqual(gas.checkAnswer_("160"), "note", "\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02\u0e40\u0e0a\u0e48\u0e19\u0e19\u0e49\u0e33\u0e2b\u0e19\u0e31\u0e01\u0e2a\u0e35 \u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e1c\u0e48\u0e32\u0e19/\u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19");

  // \u2500\u2500 \u0e2d\u0e48\u0e32\u0e19\u0e17\u0e38\u0e01\u0e0a\u0e35\u0e15 \u0e01\u0e23\u0e2d\u0e07\u0e14\u0e49\u0e27\u0e22\u0e27\u0e31\u0e19\u0e02\u0e2d\u0e07\u0e1b\u0e23\u0e30\u0e17\u0e31\u0e1a\u0e40\u0e27\u0e25\u0e32 \u2500\u2500
  const rows = gas.readCheckRange_("2026-10-02", "2026-10-02");
  assert.strictEqual(rows.length, 3, "2 \u0e23\u0e2d\u0e1a\u0e02\u0e2d\u0e07 Cut-Slot + 1 \u0e02\u0e2d\u0e07 EXT \u2014 \u0e41\u0e16\u0e27\u0e27\u0e31\u0e19\u0e01\u0e48\u0e2d\u0e19\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e15\u0e34\u0e14\u0e21\u0e32");
  assert.ok(rows.every((r) => !r["\u0e1c\u0e39\u0e49\u0e15\u0e23\u0e27\u0e08"]), "\u0e1f\u0e2d\u0e23\u0e4c\u0e21\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e16\u0e32\u0e21\u0e27\u0e48\u0e32\u0e43\u0e04\u0e23\u0e15\u0e23\u0e27\u0e08");

  const night = rows.filter((r) => r.__shift.indexOf("\u0e14\u0e36\u0e01") > -1)[0];
  assert.strictEqual(night.__bad, 2, "\u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48 + \u0e44\u0e21\u0e48\u0e1b\u0e01\u0e15\u0e34 = \u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19 2 \u0e02\u0e49\u0e2d");
  assert.strictEqual(night.__done, 2, "\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c\u0e0b\u0e49\u0e33\u0e17\u0e35\u0e48\u0e40\u0e27\u0e49\u0e19\u0e44\u0e27\u0e49\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e16\u0e39\u0e01\u0e19\u0e31\u0e1a");
  assert.strictEqual(night["\u0e1c\u0e25\u0e01\u0e32\u0e23\u0e15\u0e23\u0e27\u0e08"], "\u0e1c\u0e34\u0e14\u0e1b\u0e01\u0e15\u0e34",
    "\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19 = \u0e1c\u0e34\u0e14\u0e1b\u0e01\u0e15\u0e34 \u0e41\u0e21\u0e49 Status Machine \u0e08\u0e30\u0e40\u0e02\u0e35\u0e22\u0e19\u0e27\u0e48\u0e32\u0e1b\u0e01\u0e15\u0e34");
  assert.strictEqual(night.__photo, "http://pic");

  // \u2500\u2500 \u0e2b\u0e19\u0e49\u0e32\u0e01\u0e23\u0e30\u0e14\u0e32\u0e19\u0e23\u0e32\u0e22\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07 \u2500\u2500
  const b = gas.apiGetDailyCheck("t", "2026-10-02");
  assert.strictEqual(b.total, 3);
  assert.strictEqual(b.checked, 2, "Sloted 2 \u0e01\u0e31\u0e1a Extrusion 110 \u0e15\u0e23\u0e27\u0e08\u0e41\u0e25\u0e49\u0e27 XPE 1 \u0e22\u0e31\u0e07");
  assert.strictEqual(b.abnormal, 2, "Sloted 2 \u0e01\u0e31\u0e1a Extrusion 110 \u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19\u0e17\u0e31\u0e49\u0e07\u0e04\u0e39\u0e48");
  const ex = gas.apiCheckDetail("t", "Extrusion machine #3 - 110", "2026-10-02");
  assert.strictEqual(ex.status, "\u0e2b\u0e22\u0e38\u0e14\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07",
    "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e32\u0e08\u0e32\u0e01\u0e0a\u0e48\u0e2d\u0e07\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e08\u0e23\u0e34\u0e07 \u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e02\u0e49\u0e2d\u0e15\u0e23\u0e27\u0e08\u0e17\u0e35\u0e48\u0e0a\u0e37\u0e48\u0e2d\u0e04\u0e25\u0e49\u0e32\u0e22\u0e01\u0e31\u0e19");
  assert.strictEqual(ex.badCount, 1);
  assert.strictEqual(b.noWho, true, "\u0e15\u0e49\u0e2d\u0e07\u0e1a\u0e2d\u0e01\u0e2b\u0e19\u0e49\u0e32\u0e40\u0e27\u0e47\u0e1a\u0e27\u0e48\u0e32\u0e1f\u0e2d\u0e23\u0e4c\u0e21\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c\u0e1c\u0e39\u0e49\u0e15\u0e23\u0e27\u0e08");
  const sl = b.machines.filter((x) => x.name === "Sloted 2")[0];
  assert.strictEqual(sl.abnormal, true, "\u0e23\u0e2d\u0e1a\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14\u0e02\u0e2d\u0e07\u0e27\u0e31\u0e19\u0e04\u0e37\u0e2d\u0e01\u0e30\u0e14\u0e36\u0e01 \u0e0b\u0e36\u0e48\u0e07\u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19");
  assert.strictEqual(sl.badCount, 2);
  assert.strictEqual(b.machines.filter((x) => x.name === "XPE 1")[0].checked, false);

  // \u2500\u2500 \u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e23\u0e32\u0e22\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07 \u2500\u2500
  const d = gas.apiCheckDetail("t", "Sloted machine #2", "2026-10-02");
  assert.strictEqual(d.found, true);
  assert.strictEqual(d.machine, "Sloted 2", "\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e15\u0e49\u0e2d\u0e07\u0e1c\u0e48\u0e32\u0e19\u0e15\u0e32\u0e23\u0e32\u0e07\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e14\u0e34\u0e21");
  assert.strictEqual(d.rounds, 2, "\u0e27\u0e31\u0e19\u0e40\u0e14\u0e35\u0e22\u0e27\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e07\u0e23\u0e2d\u0e1a \u0e15\u0e49\u0e2d\u0e07\u0e1a\u0e2d\u0e01\u0e44\u0e27\u0e49");
  assert.strictEqual(d.badCount, 2, "\u0e40\u0e2d\u0e32\u0e23\u0e2d\u0e1a\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14 \u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e23\u0e2d\u0e1a\u0e41\u0e23\u0e01");
  assert.strictEqual(J(d.groups.map((g) => g.group)), J(["\u0e15\u0e39\u0e49 Control", "\u0e21\u0e2d\u0e40\u0e15\u0e2d\u0e23\u0e4c"]),
    "\u0e08\u0e31\u0e14\u0e01\u0e25\u0e38\u0e48\u0e21\u0e15\u0e32\u0e21\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d\u0e43\u0e19\u0e1f\u0e2d\u0e23\u0e4c\u0e21");
  assert.strictEqual(d.bad.length, 2);

  // \u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e44\u0e21\u0e48\u0e21\u0e35\u0e01\u0e32\u0e23\u0e15\u0e23\u0e27\u0e08
  assert.strictEqual(gas.apiCheckDetail("t", "XPE 1", "2026-10-02").found, false);
  /* ══ sourceAudit: ตัวตรวจที่รันเองหลังตั้ง Script Property ══
     ต้องบอกสองเรื่องที่หน้าจอบอกไม่ได้ — ชื่อเครื่องที่ผูกทะเบียนไม่ติด
     กับชีตที่ไม่มีคอลัมน์ผู้ตรวจ ทั้งคู่เป็นอาการเงียบที่ไม่มี error ให้จับ */
  const au = gas.sourceAudit();
  assert.ok(au.indexOf("✗ Slot ไม่รู้จัก") > -1,
    "ชื่อที่ไม่มีในทะเบียนต้องถูกรายงาน");
  assert.ok(au.indexOf("✗ Sloted machine #2") === -1,
    "ชื่อที่ผูกทะเบียนติดแล้วไม่ต้องขึ้นให้รก");
  assert.ok(au.indexOf("ผู้ตรวจ: ✗") > -1,
    "ชีตที่ไม่มีคอลัมน์ผู้ตรวจต้องรายงาน");
}

/* ═══ เมนู KPI แยกออกมาเป็นหน้าของตัวเอง ═══ */
{
  const app = fs.readFileSync("gas/app.html", "utf8");
  const idx = fs.readFileSync("gas/index.html", "utf8");

  assert.ok(idx.includes('data-tab="kpi"'), "ต้องมีปุ่มเมนู KPI");
  assert.ok(app.includes('kpi:    ["KPI"'), "ต้องมีชื่อหน้าของเมนู KPI");
  assert.ok(/NEED_LOGIN = \[[^\]]*"kpi"/.test(app), "หน้า KPI ต้องบังคับล็อกอิน");

  /* แถบแท็บย่อยของ Dashboard ต้องไม่มี KPI ซ้ำ — มันมีเมนูของตัวเองแล้ว
     แต่พาเนล #sub-kpi ต้องคงอยู่ เพราะเมนู KPI ใช้พาเนลเดียวกันนี้ */
  const subs = app.match(/const SUB_TABS = \[([\s\S]*?)\n\];/);
  assert.ok(subs, "หา SUB_TABS ไม่เจอ");
  assert.ok(!/\["kpi"/.test(subs[1]), "Dashboard Summary ต้องไม่มีแท็บย่อย KPI ซ้ำกับเมนู KPI");
  assert.ok(idx.includes('id="sub-kpi"'), "พาเนล #sub-kpi ต้องยังอยู่ — เมนู KPI ใช้มัน");
  assert.ok(/if \(!kpiOnly && subTab === "kpi"\) subTab = "overview"/.test(app),
    "กลับมา Dashboard ต้องรีเซ็ตแท็บย่อย ไม่งั้นค้างที่พาเนล KPI โดยไม่มีปุ่มไหน active");

  /* ทุกคีย์ในรายการ "ดูทีละตัว" ต้องเป็นคีย์ที่ kpiDrill รู้จักจริง
     ไม่งั้นเลือกแล้วหน้าเงียบ ไม่มีอะไรขึ้น และไม่มี error ให้เห็นด้วย */
  const known = ["onTime", "mttr", "doneRate", "ftf", "cost", "open", "breakdown",
                 "repeat", "repeatMachine"];
  KPI_PICK.forEach(([key, label]) => {
    assert.ok(known.includes(key), `KPI_PICK มีคีย์ที่ kpiDrill ไม่รู้จัก: ${key}`);
    assert.ok(label && label.length, `${key}: ต้องมีชื่อให้คนอ่าน`);
  });
  assert.strictEqual(new Set(KPI_PICK.map(([k]) => k)).size, KPI_PICK.length, "คีย์ซ้ำ");

  // ใช้ตัวสร้างตารางร่วมกัน ไม่ลอกโค้ดไว้สองที่
  assert.ok(app.includes("const drillHead = (d)") && app.includes("const drillBody = (d)"));
  assert.strictEqual((app.match(/drillBody\(d\)/g) || []).length, 2,
    "ตารางรายละเอียดต้องวาดด้วยตัวสร้างเดียวกันทั้งในโมดอลและในหน้า");
}

/* ═══ Phase 4: การ์ดผลงานของฉัน ═══ */
{
  const app = fs.readFileSync("gas/app.html", "utf8");
  assert.ok(app.includes("paintMyScore(user);"), "หน้าต้อนรับต้องเรียกการ์ดผลงานของฉัน");
  assert.ok(fs.readFileSync("gas/index.html", "utf8").includes('id="wcMine"'), "ต้องมีที่วางการ์ด");
  /* ห้ามเอาคะแนนรวมหรือชื่อคนอื่นมาขึ้นตรงนี้ — หน้าต้อนรับเป็นที่ให้กำลังใจตัวเอง
     ไม่ใช่กระดานจัดอันดับ ซึ่งทำให้ช่างเลี่ยงงานยากและแย่งงานง่าย */
  const fn = app.slice(app.indexOf("function paintMyScore"), app.indexOf("function showWelcome"));
  assert.ok(!fn.includes(".total"), "การ์ดผลงานของฉันต้องไม่โชว์คะแนนรวม");
  assert.ok(fn.includes("prevDate"), "ต้องเทียบกับเดือนที่แล้วของตัวเอง");
}

/* ═══ KPI แยกตามตำแหน่ง ═══
   สี่ตำแหน่งทำงานคนละอย่าง วัดด้วยไม้บรรทัดอันเดียวกันไม่ได้ —
   เอา MTTR ไปวัดช่างเทคนิคคุมเครื่อง เขาก็ได้ศูนย์ทุกเดือนทั้งที่ทำงานเต็มที่ */
{
  const roles = Object.keys(ROLE_KPI);
  assert.strictEqual(roles.length, 4, "ต้องมีครบสี่ตำแหน่ง");

  roles.forEach((key) => {
    const d = ROLE_KPI[key];
    assert.ok(d.label && d.note, `${key}: ต้องมีชื่อและคำอธิบายว่าตำแหน่งนี้ถูกวัดเรื่องอะไร`);
    assert.ok(["ticket", "check", "lead", "dept"].includes(d.source), `${key}: แหล่งข้อมูลไม่รู้จัก`);
    // ทุกคอลัมน์ที่ตำแหน่งนั้นเรียกใช้ ต้องมีนิยามจริง ไม่งั้นตารางพังตอนเลือกตำแหน่งนั้น
    d.cols.forEach((c) => assert.ok(TS_COL[c], `${key}: ไม่มีนิยามคอลัมน์ ${c}`));
    // น้ำหนักต้องชี้ไปที่ตัวชี้วัดที่ตำแหน่งนั้นมีจริง ไม่ใช่ให้คะแนนจากของที่ไม่ได้วัด
    Object.keys(d.weights).forEach((w) =>
      assert.ok(d.cols.includes(w + "Rate"), `${key}: ให้น้ำหนัก ${w} ทั้งที่ไม่ได้วัดตัวนั้น`));
  });

  /* ตำแหน่งที่ยังวัดไม่ครบต้องประกาศไว้ว่าขาดอะไร ไม่ใช่เงียบ
     หน้าจอที่เงียบทำให้คนเข้าใจว่าระบบวัดครบแล้ว ซึ่งอันตรายกว่าการบอกว่ายังวัดไม่ได้ */
  ["CONTROL", "TECHLEAD", "MAINTLEAD"].forEach((key) => {
    assert.ok(ROLE_KPI[key].missing.length, `${key}: ต้องบอกว่าตัวไหนยังวัดให้ไม่ได้`);
    ROLE_KPI[key].missing.forEach(([what, why]) => {
      assert.ok(what && why, `${key}: ต้องบอกทั้ง "ขาดอะไร" และ "เพราะอะไร"`);
    });
  });

  // ช่างซ่อมบำรุงเป็นตำแหน่งเดียวที่ข้อมูลครบ จึงเป็นตำแหน่งเดียวที่ให้คะแนนรวมได้
  assert.strictEqual(ROLE_KPI.MAINT.missing.length, 0);
  assert.ok(Object.keys(ROLE_KPI.MAINT.weights).length, "ช่างซ่อมบำรุงต้องมีน้ำหนักคะแนน");
  /* ช่างเทคนิคให้คะแนนได้แล้วตั้งแต่มีสถานีประจำ — ตัวหารคือ "เครื่องของสถานีเขา"
     แต่คะแนนต้องมาจากความครอบคลุมอย่างเดียว ยังไม่เอาจำนวนครั้งมาคิด เพราะยังไม่มีตารางเวร */
  assert.strictEqual(J(Object.keys(ROLE_KPI.CONTROL.weights)), J(["cover"]),
    "ช่างเทคนิควัดที่ตรวจครบทุกเครื่องของสถานี ไม่ใช่ตรวจเยอะ");
  assert.ok(ROLE_KPI.CONTROL.cols.includes("shouldMachines"),
    "ต้องโชว์ตัวหารให้เห็น ไม่ใช่โชว์แต่เปอร์เซ็นต์");
  assert.ok(ROLE_KPI.CONTROL.missing.some(([w]) => w.includes("รอบ")),
    "ยังวัดไม่ได้ว่าตรวจครบทุกรอบไหม — ต้องบอกไว้");

  // นิยามคอลัมน์ต้องครบรูปแบบ [label, get, kind, isBad, drillKey]
  Object.entries(TS_COL).forEach(([key, def]) => {
    assert.strictEqual(def.length, 5, `TS_COL.${key}: รูปแบบไม่ครบ`);
    assert.ok(["pct", "num", "wk", "txt"].includes(def[2]), `TS_COL.${key}: หน่วยไม่รู้จัก`);
    assert.strictEqual(typeof def[1], "function");
    assert.strictEqual(typeof def[3], "function");
  });

  // คีย์ drill ที่คอลัมน์อ้างถึง ต้องเป็นคีย์ที่ techDrill รู้จักจริง
  const known = ["closed", "ftf", "onTime", "log", "repeat", "pm", "open", ""];
  Object.entries(TS_COL).forEach(([key, def]) => {
    assert.ok(known.includes(def[4]) || def[4] === "raised" || def[4] === "verify",
      `TS_COL.${key}: ชี้ไป drill ที่ไม่มี (${def[4]})`);
  });
}

/* ชื่อเมนูต้องเปลี่ยนครบทุกไฟล์ ไม่ใช่เปลี่ยนแค่ที่เห็นบนจอ */
{
  // ตรวจเฉพาะไฟล์โค้ด — README อ้างชื่อเดิมได้ เพราะต้องเล่าว่าเปลี่ยนมาจากอะไร
  ["gas/app.html", "gas/index.html"].forEach((f) => {
    assert.ok(!fs.readFileSync(f, "utf8").includes("Dashboard KPI"),
      `${f}: ยังเหลือชื่อเดิม "Dashboard KPI"`);
  });
}

/* ═══ ไฟล์พารามิเตอร์จริงของโรงงาน — ทรง wide หลายชีต ไม่มีชีต "Machines" ═══
   ของจริงชื่อ "EXT Condition data" มีชีต Data / Data UV / Data Cut-Slot / Std.parameter / Chart
   เดิมหน้านี้ตายทั้งหน้าเพราะหาชีต Machines ไม่เจอ ทั้งที่ตั้ง PARAM_SHEET_ID ถูกแล้ว */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  gas.Utilities = { formatDate: (d) => {
    const q = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${q(d.getMonth() + 1)}-${q(d.getDate())}`;
  } };
  gas.prop_ = () => "PARAM_FILE";
  gas.cfg_ = (k, d) => d;
  gas.requireAuth_ = () => ({ name: "x", role: "LEAD" });
  gas.machines_ = () => [];

  const HEAD = ["Date", "Time", "เครื่องจักร", "สถานะ", "ช่างผู้บันทึก",
                "ZONE 1", "ZONE 2", "MOLD 1", "อุณหภูมิภายนอก", "FEED", "SPEED", "AMP.", ""];
  const DATA = [HEAD,
    ["2026-05-20", 12, "EXT1-80", "หยุดเครื่อง", "ช่างเบิร์ด", 0, 0, 0, 0, 0, 0, 0, ""],
    ["2026-05-21", 7, "EXT3-110", "เดินเครื่องผลิต", "ช่างโฟร์", 195, 209, 200, 28, 30, 18.8, 210, ""],
    ["2026-05-22", 16, "EXT3-110", "เดินเครื่องผลิต", "เบิร์ด", 194, 210, 200, 35, 19.6, 31, 207.1, ""]];
  const UV = [["Date", "Time", "เครื่องจักร", "สถานะ", "ช่างผู้บันทึก", "UV 1"],
    ["2026-05-22", 7, "UV2", "เดินเครื่องผลิต", "เดชา", 160]];
  const STD = [["machine", "param", "std", "tol"], ["EXT3-110", "ZONE 1", 195, 5]];

  const mk = (rows, name) => ({
    getLastRow: () => rows.length, getLastColumn: () => rows[0].length, getName: () => name,
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    getRange: () => ({ getValues: () => [rows[0].slice()] }),
  });
  gas.paramSS_ = () => ({
    getName: () => "EXT Condition data",
    getSheetByName: (n) => null,                       // ไม่มีชีต Machines เลย
    getSheets: () => [mk(DATA, "Data"), mk(UV, "Data UV"),
                      mk(STD, "Std.parameter"), mk([["x"], ["y"]], "Chart")],
  });

  // ── อ่านทุกชีตบันทึก ไม่ใช่ชีตเดียว ──
  const sheets = gas.paramLogSheets_().map((x) => x.getName());
  assert.strictEqual(J(sheets), J(["Data", "Data UV"]),
    "ต้องอ่านชีตบันทึกทุกชีต และต้องไม่เอาชีตพิกัด/กราฟมาด้วย");

  const logs = gas.paramLogs_();
  assert.strictEqual(logs.length, 4, "4 แถวจากสองชีตรวมกัน");

  const ext = logs.filter((x) => x.machine === "EXT3-110");
  assert.strictEqual(ext.length, 2);
  // ทรง wide: ทุกคอลัมน์ที่ไม่ใช่ข้อมูลประจำแถว ถือเป็นค่าที่วัด
  assert.strictEqual(ext[0].values["ZONE 1"], 195);
  assert.strictEqual(ext[0].values["AMP."], 210);
  assert.strictEqual(ext[0].operator, "ช่างโฟร์", "ช่างผู้บันทึกต้องอ่านได้ — ใช้วัด KPI ช่างเทคนิคด้วย");
  assert.strictEqual(ext[0].status, "เดินเครื่องผลิต");
  assert.strictEqual(ext[0].round, "7", "ไม่มีคอลัมน์กะ ให้ใช้คอลัมน์เวลาเป็นรอบ");

  // คอลัมน์ประจำแถวต้องไม่หลุดไปเป็นค่าที่วัด ไม่งั้นจะมีพารามิเตอร์ชื่อ "สถานะ" โผล่มา
  ["Date", "Time", "เครื่องจักร", "สถานะ", "ช่างผู้บันทึก", ""].forEach((k) =>
    assert.ok(!(k in ext[0].values), `"${k}" เป็นข้อมูลประจำแถว ไม่ใช่ค่าที่วัด`));

  // ── สร้างนิยามเครื่องจากข้อมูลจริงเมื่อไม่มีชีต Machines ──
  const defs = gas.paramDefs_();
  assert.strictEqual(J(Object.keys(defs).sort()), J(["EXT1-80", "EXT3-110", "UV2"]),
    "รายชื่อเครื่องต้องมาจากคอลัมน์เครื่องจักรของข้อมูลจริง");
  assert.strictEqual(defs["EXT3-110"].derived, true, "ต้องบอกว่านิยามนี้อนุมานมา ไม่ได้ประกาศไว้");
  assert.ok(defs["EXT3-110"].groups[0].fields.some((f) => f.key === "SPEED"));

  /* พิกัดมาจากชีต Std.parameter ของไฟล์ต้นทาง ไม่ใช่เดาเอง
     ช่องที่ไม่มีในชีตนั้นต้องคงไม่ถูกเฝ้า — ดูค่าได้แต่ไม่ตัดสินผ่าน/ไม่ผ่าน */
  assert.strictEqual(J(defs["EXT3-110"].std), J({ "ZONE 1": 195 }),
    "ต้องอ่านพิกัดจากชีต Std.parameter");
  assert.strictEqual(gas.kvTolFor_(defs["EXT3-110"].tol, "ZONE 1"), 5);
  assert.strictEqual(J(defs["EXT1-80"].std), J({}),
    "เครื่องที่ไม่มีแถวในชีตพิกัด ต้องไม่ไปยืมพิกัดของเครื่องอื่น");

  // ZONE 1 = 194 อยู่ใน 195±5 ส่วน ZONE 2 = 210 ไม่มีพิกัด จึงไม่ควรเตือน
  assert.strictEqual(gas.kvCheck_(ext[1].values, defs["EXT3-110"].std,
    defs["EXT3-110"].tol).length, 0, "ค่าอยู่ในพิกัด = ต้องไม่เตือน");
  assert.strictEqual(J(gas.kvCheck_({ "ZONE 1": 201 }, defs["EXT3-110"].std,
    defs["EXT3-110"].tol).map((a) => a.key)), J(["ZONE 1"]), "หลุด 195±5 ต้องเตือน");

  // ── หน้าสถานะต้องเปิดได้ ไม่ใช่ตายทั้งหน้า ──
  const st = gas.apiParamStatus("t");
  assert.strictEqual(st.machines.length, 3);
  const by = {}; st.machines.forEach((m) => { by[m.id] = m; });
  assert.strictEqual(by["EXT1-80"].state, "stop", "สถานะหยุดเครื่องต้องอ่านได้");
  assert.strictEqual(by["EXT3-110"].state, "ok", "ค่าล่าสุดอยู่ในพิกัด");
  assert.strictEqual(by["EXT3-110"].watched, 1, "เฝ้า ZONE 1 ตัวเดียวตามที่ชีตพิกัดมี");
  assert.strictEqual(st.noLimits, false, "มีพิกัดแล้วอย่างน้อยหนึ่งเครื่อง ต้องเลิกขึ้นแถบเตือน");

  /* ชีตพิกัดที่เขียน min/max แทน std/± ก็ต้องใช้ได้ — ฟอร์ม ISO บางใบเขียนแบบนั้น
     เช่น Hoper ของ Hot and Coolmix 3 ที่มีค่า Min/Max ไม่มี ± */
  gas.paramDefsCache_ = null;
  const MM = [["machine", "param", "std", "tol", "min", "max"],
              ["EXT3-110", "SPEED", "", "", 18, 22]];
  const base = gas.paramSS_;
  gas.paramSS_ = () => {
    const ss = base();
    return { getName: ss.getName, getSheetByName: ss.getSheetByName,
             getSheets: () => ss.getSheets().map((s) =>
               s.getName() === "Std.parameter" ? mk(MM, "Std.parameter") : s) };
  };
  const d2 = gas.paramDefs_();
  assert.strictEqual(d2["EXT3-110"].std["SPEED"], 20, "min/max → กึ่งกลางช่วง");
  assert.strictEqual(gas.kvTolFor_(d2["EXT3-110"].tol, "SPEED"), 2, "min/max → ครึ่งช่วง");
  gas.paramSS_ = base;
  gas.paramDefsCache_ = null;
}


/* ═══ เช็คลิสต์พารามิเตอร์ถอดจากฟอร์ม ISO ═══
   ไฟล์ต้นทางมีแต่หัวคอลัมน์ดิบ กลุ่ม/หน่วย/ชนิดช่องอยู่ในฟอร์ม จึงเก็บไว้ที่ชีตของ CMMS เอง */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Session = { getScriptTimeZone: () => "Asia/Bangkok" };
  gas.Utilities = { formatDate: () => "2026-05-21" };
  gas.prop_ = () => "PARAM_FILE";
  gas.cfg_ = (k, d) => d;
  gas.requireAuth_ = () => ({ name: "x", role: "LEAD" });
  /* สามชื่อของเครื่องเดียวกัน — ทะเบียน / ไฟล์บันทึก / เช็คลิสต์ ISO
     ไม่มีสองที่เขียนเหมือนกันเลย ต้องแปลงทุกฝั่งก่อนเทียบ */
  gas.machines_ = () => [{ name: "Extrusion 3 - 110" }, { name: "UV 2" }];
  gas.aliasMap_ = () => ({
    "ext3-110": "Extrusion 3 - 110",
    "extrusion 110": "Extrusion 3 - 110",
  });

  const HEAD = ["Date", "Time", "เครื่องจักร", "สถานะ", "ช่างผู้บันทึก",
                "ZONE 1", "MOLD 8", "AMP."];
  const DATA = [HEAD,
    ["2026-05-21", 7, "EXT3-110", "เดินเครื่องผลิต", "ช่างโฟร์", 212, 0, 18]];

  // เช็คลิสต์: ZONE 1 ตรงคอลัมน์ · Barrel 2 ไม่มีคอลัมน์ · AMP. ไม่มีในเช็คลิสต์
  const CL = [["เครื่อง", "ฟอร์ม", "รหัสเครื่องจักร", "กลุ่ม", "ลำดับ", "ป้าย", "key",
               "ชนิด", "std", "min", "max", "หน่วย", "tol", "หมายเหตุ"],
    ["Extrusion 110", "FM-MT-12-00", "SM-B4-EX-03", "Screw & Barrel", 1, "zone 1", "barrel1", "num", 200, "", "", "°C", 5, ""],
    ["Extrusion 110", "FM-MT-12-00", "SM-B4-EX-03", "Screw & Barrel", 2, "Barrel 2", "barrel2", "num", 205, "", "", "°C", 5, ""],
    ["Extrusion 110", "FM-MT-12-00", "SM-B4-EX-03", "Mold T-Die", 3, "MOLD 8", "mold8", "na", "", "", "", "", "", ""],
    ["Extrusion 110", "FM-MT-12-00", "SM-B4-EX-03", "Mold T-Die", 4, "Pressure", "pressure", "auto", "", "", "", "Mpa", "", "ปรับอัตโนมัติ"],
    ["Extrusion 110", "FM-MT-12-00", "SM-B4-EX-03", "Roller", 5, "Tension", "tension", "num", "", 160, 180, "N", "", ""],
    // เครื่องที่ยังไม่เคยมีใครบันทึกค่าสักรอบ — ไม่มีแถวไหนในชีตบันทึกเอ่ยถึงเลย
    ["UV 2", "FM-MT-13-00", "SM-B4-UV-02", "Conveyor", 1, "ความถี่สายพาน", "conv_hz", "num", 20, "", "", "Hz", 5, ""],
    ["UV 2", "FM-MT-13-00", "SM-B4-UV-02", "Conveyor", 2, "Power switch", "pw", "onoff", "", "", "", "", "", ""]];

  const mk = (rows, name) => ({
    getLastRow: () => rows.length, getLastColumn: () => rows[0].length, getName: () => name,
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    getRange: () => ({ getValues: () => [rows[0].slice()] }),
  });
  gas.paramSS_ = () => ({
    getName: () => "EXT Condition data",
    getSheetByName: () => null,
    getSheets: () => [mk(DATA, "Data")],
  });
  gas.ss_ = () => ({ getSheetByName: (n) =>
    n === "เช็คลิสต์พารามิเตอร์" ? mk(CL, n) : null });

  const d = gas.paramDefs_()["EXT3-110"];
  assert.strictEqual(J(d.groups.map((g) => g.group)),
    J(["Screw & Barrel", "Mold T-Die", "Roller", "ไม่อยู่ในเช็คลิสต์"]),
    "กลุ่มต้องเรียงตามฟอร์ม และคอลัมน์ที่ไม่มีในฟอร์มต้องไม่หาย");

  const fl = {};
  d.groups.forEach((g) => g.fields.forEach((f) => { fl[f.label] = f; }));
  assert.strictEqual(fl["zone 1"].key, "ZONE 1", "ป้ายต้องจับคอลัมน์ได้แม้ตัวพิมพ์ไม่ตรง");
  assert.strictEqual(fl["zone 1"].linked, true);
  assert.strictEqual(fl["Barrel 2"].linked, false, "ไม่มีคอลัมน์ในชีตบันทึก = ต้องบอกว่าต้นทางยังไม่เก็บ");
  assert.strictEqual(fl["AMP."].linked, true, "ค่าที่มีจริงแต่ไม่มีในฟอร์ม ห้ามซ่อน");

  // min/max ในเช็คลิสต์ -> กึ่งกลาง ± ครึ่งช่วง
  assert.strictEqual(d.std["tension"], 170);
  assert.strictEqual(gas.kvTolFor_(d.tol, "tension"), 10);
  // ช่อง auto/na ต้องไม่มีพิกัด ไม่งั้นเครื่องดับแล้วอ่านได้ 0 จะเปิดใบแจ้งซ่อมทิ้ง
  assert.strictEqual(d.std["MOLD 8"], undefined);

  const m = gas.apiParamMachine("t", "EXT3-110", 7);
  const by = {};
  m.groups.forEach((g) => g.fields.forEach((f) => { by[f.label] = f; }));
  assert.strictEqual(by["zone 1"].result, "หลุด", "212 หลุด 200±5");
  assert.strictEqual(by["zone 1"].unit, "°C", "หน่วยต้องส่งถึงหน้าเว็บ");
  assert.strictEqual(by["MOLD 8"].result, "ไม่ได้ใช้งาน",
    "เครื่องที่เลิกใช้อ่านได้ 0 ต้องไม่กลายเป็นค่าหลุด");
  assert.strictEqual(by["Pressure"].result, "เครื่องแสดงเอง");
  assert.strictEqual(by["Pressure"].note, "ปรับอัตโนมัติ");
  assert.strictEqual(m.form, "FM-MT-12-00", "รหัสแบบฟอร์ม ISO อ่านจากชีต ห้าม hardcode");

  // ไม่มีชีตเช็คลิสต์ = กลับไปใช้หัวคอลัมน์ดิบเหมือนเดิม ไม่ใช่หน้าว่าง

  /* เครื่องที่อยู่ในเช็คลิสต์แต่ยังไม่มีข้อมูล ต้องขึ้นการ์ดด้วย
     ไม่งั้นงูกินหาง — ไม่มีข้อมูล จึงไม่มีการ์ด จึงไม่มีที่ให้กรอก จึงไม่มีข้อมูลตลอดไป */
  const fresh = gas.paramDefs_()["UV 2"];
  assert.ok(fresh, "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e17\u0e35\u0e48\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e40\u0e04\u0e22\u0e21\u0e35\u0e43\u0e04\u0e23\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01 \u0e01\u0e47\u0e15\u0e49\u0e2d\u0e07\u0e2d\u0e22\u0e39\u0e48\u0e43\u0e19\u0e23\u0e32\u0e22\u0e0a\u0e37\u0e48\u0e2d");
  assert.strictEqual(fresh.code, "SM-B4-UV-02", "รหัสเครื่องจักรของเครื่องที่ยังไม่มีข้อมูล");
  assert.strictEqual(fresh.form, "FM-MT-13-00", "ISO: \u0e15\u0e49\u0e2d\u0e07\u0e2d\u0e49\u0e32\u0e07\u0e23\u0e2b\u0e31\u0e2a\u0e41\u0e1a\u0e1a\u0e1f\u0e2d\u0e23\u0e4c\u0e21\u0e02\u0e2d\u0e07\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e19\u0e31\u0e49\u0e19");
  assert.strictEqual(fresh.std["conv_hz"], 20, "\u0e1e\u0e34\u0e01\u0e31\u0e14\u0e43\u0e19\u0e40\u0e0a\u0e47\u0e04\u0e25\u0e34\u0e2a\u0e15\u0e4c\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e32\u0e14\u0e49\u0e27\u0e22");
  assert.strictEqual(gas.kvTolFor_(fresh.tol, "conv_hz"), 5);
  assert.ok(fresh.groups[0].fields.every((f) => f.linked),
    "\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e23\u0e2d\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c\u0e08\u0e32\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e15\u0e49\u0e19\u0e17\u0e32\u0e07 \u0e2b\u0e49\u0e32\u0e21\u0e02\u0e36\u0e49\u0e19\u0e40\u0e2a\u0e49\u0e19\u0e1b\u0e23\u0e30\u0e17\u0e31\u0e49\u0e07\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07");

  // \u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e17\u0e35\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e41\u0e25\u0e49\u0e27\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e42\u0e14\u0e19\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e0b\u0e49\u0e33\u0e40\u0e1b\u0e47\u0e19\u0e2d\u0e35\u0e01\u0e43\u0e1a
  assert.strictEqual(gas.paramDefs_()["EXT3-110"].name, "Extrusion 3 - 110",
    "การ์ดต้องขึ้นชื่อตามทะเบียน ไม่ใช่ชื่อดิบในไฟล์บันทึก");
  assert.strictEqual(gas.paramDefs_()["Extrusion 110"], undefined,
    "EXT3-110 \u0e01\u0e31\u0e1a Extrusion 110 \u0e04\u0e37\u0e2d\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e40\u0e14\u0e35\u0e22\u0e27\u0e01\u0e31\u0e19 \u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e02\u0e36\u0e49\u0e19\u0e2a\u0e2d\u0e07\u0e01\u0e32\u0e23\u0e4c\u0e14");

  const stAll = gas.apiParamStatus("t");
  const uv = stAll.machines.filter((m) => m.id === "UV 2")[0];
  assert.ok(uv, "\u0e2b\u0e19\u0e49\u0e32\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e17\u0e35\u0e48\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e14\u0e49\u0e27\u0e22");
  assert.strictEqual(uv.state, "none", "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e48\u0e32 = \u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e15\u0e31\u0e14\u0e2a\u0e34\u0e19\u0e1c\u0e48\u0e32\u0e19/\u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19");
  assert.strictEqual(uv.cmms, "UV 2", "\u0e15\u0e49\u0e2d\u0e07\u0e1c\u0e39\u0e01\u0e01\u0e31\u0e1a\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e44\u0e14\u0e49 \u0e44\u0e21\u0e48\u0e07\u0e31\u0e49\u0e19\u0e40\u0e1b\u0e34\u0e14\u0e43\u0e1a\u0e41\u0e08\u0e49\u0e07\u0e0b\u0e48\u0e2d\u0e21\u0e08\u0e32\u0e01\u0e04\u0e48\u0e32\u0e17\u0e35\u0e48\u0e2b\u0e25\u0e38\u0e14\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49");
  assert.strictEqual(uv.total, 2);
  assert.strictEqual(uv.watched, 1, "\u0e19\u0e31\u0e1a\u0e40\u0e09\u0e1e\u0e32\u0e30\u0e08\u0e38\u0e14\u0e17\u0e35\u0e48\u0e21\u0e35\u0e1e\u0e34\u0e01\u0e31\u0e14 \u0e0a\u0e48\u0e2d\u0e07 on/off \u0e44\u0e21\u0e48\u0e19\u0e31\u0e1a");

  gas.paramDefsCache_ = null;
  gas.ss_ = () => ({ getSheetByName: () => null });
  const bare = gas.paramDefs_()["EXT3-110"];
  assert.strictEqual(bare.groups.length, 1);
  assert.ok(bare.groups[0].fields.some((f) => f.key === "ZONE 1"));
}

/* ═══ ช่างเทคนิคประจำสถานี ═══
   ของจริงแบ่งงานเป็นกลุ่มเครื่องตามสายงาน ไม่ได้แบ่งเป็นรายเครื่องรายคน
     ช่าง Ext -> Extrusion 80/92/110 + Hot and Coolmix 2/3 · ช่าง UV -> UV 2
     ช่าง Cut Slot -> Sloted 1/2 + Tranfer 1/3 · ช่าง XPE -> XPE 1/2 */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);

  // คอลัมน์ใหม่ต้องต่อท้าย ไม่สลับ 9 ช่องแรกที่ Auth.gs ของโปรเจค Stock ใช้ index เดิม
  assert.strictEqual(gas.USERS_HEAD[10], "สถานีประจำ");
  assert.strictEqual(gas.US.STATION, 10, "index ต้องตรงกับตำแหน่งคอลัมน์");
  assert.strictEqual(gas.US.PHOTO, 8, "ห้ามขยับช่องเดิม");
  /* รายชื่อสถานีมาจากช่อง "ผู้ดูแล" ในทะเบียน ไม่ใช่รายชื่อที่พิมพ์ไว้ในโค้ด
     ของเดิมพิมพ์ 'ช่าง Ext' ไว้ แต่ชีตจริงใช้ 'EXT' — สองฝั่งไม่เคยตรงกันเลย */
  gas.machinesCache_ = null;
  gas.machines_ = () => [
    { name: "Extrusion 80", owner: "EXT" },
    { name: "UV 2", owner: "UV" },
    { name: "Extrusion 92", owner: "EXT" },
    { name: "Powder mill", owner: "" },
    { name: "Arm saw", owner: "  " },
  ];
  assert.strictEqual(J(gas.stations_()), J(["EXT", "UV"]),
    "ไม่ซ้ำ ไม่เอาช่องว่าง และเรียงคงที่");
  assert.strictEqual(typeof gas.STATIONS, "undefined",
    "รายชื่อที่พิมพ์ตายไว้ต้องไม่เหลืออยู่ — มันคือต้นเหตุของการฟ้องผิด 18 รายการ");

  gas.readSheet_ = () => [
    { "ชื่อ-นามสกุล": "ช่างชล", "บทบาท": "TECH", "ใช้งาน": "ใช่", "สถานีประจำ": "ช่าง Ext" },
    { "ชื่อ-นามสกุล": "หัวหน้าช่าง", "บทบาท": "LEAD", "ใช้งาน": "ใช่", "สถานีประจำ": "" },
  ];
  const team = gas.team_();
  assert.strictEqual(team[0].station, "ช่าง Ext");
  assert.strictEqual(team[1].station, "", "หัวหน้าไม่ได้ประจำสถานีไหน = ว่าง ไม่ใช่เดาให้");
}

/* ฝั่งหน้าเว็บ: เครื่องของสถานี + ตัวหารของ KPI ช่างเทคนิค */
{
  sandbox.setMachines([
    { name: "Extrusion 80", group: "เครื่องจักรหลัก", owner: "ช่าง Ext" },
    { name: "Extrusion 92", group: "เครื่องจักรหลัก", owner: "ช่าง Ext" },
    { name: "Extrusion 110", group: "เครื่องจักรหลัก", owner: "ช่าง Ext" },
    { name: "UV 2",         group: "เครื่องจักรหลัก", owner: "ช่าง UV" },
    { name: "Sloted 1",     group: "เครื่องจักรรอง",  owner: "ช่าง Cut Slot" },
    { name: "แอร์ออฟฟิศ",    group: "เครื่องใช้ไฟฟ้า", owner: "" },
  ]);
  const { stationMachines, isMyMachine, myStation } = sandbox.fns;

  assert.strictEqual(stationMachines("ช่าง Ext").length, 3);
  assert.strictEqual(stationMachines("ช่าง UV").length, 1);
  assert.strictEqual(stationMachines("").length, 0, "ไม่ระบุสถานี = ไม่ใช่เจ้าของเครื่องทั้งโรงงาน");

  sandbox.setME({ name: "ช่างชล", role: "TECH", station: "ช่าง Ext" });
  assert.strictEqual(myStation(), "ช่าง Ext");
  assert.strictEqual(isMyMachine("Extrusion 92"), true);
  assert.strictEqual(isMyMachine("UV 2"), false, "เครื่องของสถานีอื่นต้องไม่ถูกนับเป็นของเรา");

  // หัวหน้าไม่มีสถานี ต้องไม่กลายเป็นเจ้าของทุกเครื่อง
  sandbox.setME({ name: "หัวหน้าช่าง", role: "LEAD", station: "" });
  assert.strictEqual(myStation(), "");
  assert.strictEqual(isMyMachine("Extrusion 92"), false);
}

console.log("OK — ผ่านทั้งหมด");

/* ═══ ตัวสร้างฟอร์มจากเช็คลิสต์ ═══
   ส่วนที่คิดเองทดสอบได้โดยไม่ต้องแตะ FormApp — ที่เหลือเป็นการเรียก API ตรง ๆ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Forms.gs", "utf8"), gas);

  const num = gas.formItemSpec_({ label: "ZONE 1", type: "num", unit: "\u00b0C", std: 190, tol: 5 });
  assert.strictEqual(num.kind, "text");
  assert.strictEqual(num.number, true);
  assert.ok(num.help.includes("190 \u00b1 5"), "\u0e15\u0e49\u0e2d\u0e07\u0e1a\u0e2d\u0e01\u0e2a\u0e40\u0e1b\u0e04\u0e43\u0e15\u0e49\u0e02\u0e49\u0e2d");
  assert.ok(num.help.includes("\u00b0C"));

  const sw = gas.formItemSpec_({ label: "\u0e2a\u0e27\u0e34\u0e15\u0e0a\u0e4c\u0e14\u0e39\u0e14", type: "onoff" });
  assert.strictEqual(sw.kind, "choice");
  assert.strictEqual(gas.J, undefined);
  assert.strictEqual(sw.choices.join("/"), "ON/OFF");
  assert.strictEqual(sw.number, false, "\u0e0a\u0e48\u0e2d\u0e07\u0e40\u0e1b\u0e34\u0e14\u0e1b\u0e34\u0e14\u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02");

  /* \u0e0a\u0e48\u0e2d\u0e07\u0e17\u0e35\u0e48\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e41\u0e2a\u0e14\u0e07\u0e40\u0e2d\u0e07/\u0e40\u0e25\u0e34\u0e01\u0e43\u0e0a\u0e49 \u0e01\u0e31\u0e1a\u0e0a\u0e48\u0e2d\u0e07\u0e17\u0e35\u0e48\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e0a\u0e37\u0e48\u0e2d \u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e01\u0e25\u0e32\u0e22\u0e40\u0e1b\u0e47\u0e19\u0e02\u0e49\u0e2d\u0e16\u0e32\u0e21 */
  assert.strictEqual(gas.formItemSpec_({ label: "RPM", type: "auto" }), null);
  assert.strictEqual(gas.formItemSpec_({ label: "\u0e40\u0e25\u0e34\u0e01\u0e43\u0e0a\u0e49", type: "na" }), null);
  assert.strictEqual(gas.formItemSpec_({ label: "   ", type: "num" }), null,
    "\u0e0a\u0e48\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e0a\u0e37\u0e48\u0e2d\u0e15\u0e49\u0e2d\u0e07\u0e02\u0e49\u0e32\u0e21 \u0e44\u0e21\u0e48\u0e43\u0e0a\u0e48\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e02\u0e49\u0e2d\u0e40\u0e1b\u0e25\u0e48\u0e32");

  // \u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d\u0e0b\u0e49\u0e33\u0e01\u0e31\u0e19\u0e15\u0e49\u0e2d\u0e07\u0e41\u0e22\u0e01\u0e44\u0e14\u0e49 \u2014 \u0e2b\u0e31\u0e27\u0e04\u0e2d\u0e25\u0e31\u0e21\u0e19\u0e4c\u0e0b\u0e49\u0e33\u0e04\u0e37\u0e2d\u0e2a\u0e34\u0e48\u0e07\u0e17\u0e35\u0e48\u0e17\u0e33\u0e43\u0e2b\u0e49\u0e44\u0e1f\u0e25\u0e4c\u0e40\u0e0a\u0e47\u0e04\u0e0a\u0e35\u0e15\u0e40\u0e14\u0e34\u0e21\u0e2d\u0e48\u0e32\u0e19\u0e22\u0e32\u0e01
  const seen = {};
  assert.strictEqual(gas.formTitle_("\u0e15\u0e39\u0e49 Control", "AMP.", seen), "\u0e15\u0e39\u0e49 Control [AMP.]");
  assert.strictEqual(gas.formTitle_("\u0e15\u0e39\u0e49 Control", "AMP.", seen), "\u0e15\u0e39\u0e49 Control [AMP. 2]");
  assert.strictEqual(gas.formTitle_("\u0e15\u0e39\u0e49 Control", "AMP.", seen), "\u0e15\u0e39\u0e49 Control [AMP. 3]");

  /* \u0e04\u0e48\u0e32\u0e17\u0e35\u0e48\u0e2b\u0e25\u0e38\u0e14\u0e2a\u0e40\u0e1b\u0e04\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e23\u0e2d\u0e01\u0e44\u0e14\u0e49
     \u0e16\u0e49\u0e32\u0e1f\u0e2d\u0e23\u0e4c\u0e21\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a\u0e0a\u0e48\u0e27\u0e07 min-max \u0e0a\u0e48\u0e32\u0e07\u0e08\u0e30\u0e01\u0e23\u0e2d\u0e01\u0e44\u0e21\u0e48\u0e1c\u0e48\u0e32\u0e19 \u0e41\u0e25\u0e49\u0e27\u0e44\u0e1b\u0e42\u0e01\u0e2b\u0e01\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02\u0e43\u0e2b\u0e49\u0e1f\u0e2d\u0e23\u0e4c\u0e21\u0e22\u0e2d\u0e21\u0e23\u0e31\u0e1a */
  const src = fs.readFileSync("gas/Forms.gs", "utf8");
  assert.ok(!/requireNumberBetween/.test(src), "\u0e2b\u0e49\u0e32\u0e21\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a\u0e0a\u0e48\u0e27\u0e07\u0e04\u0e48\u0e32\u0e43\u0e19\u0e1f\u0e2d\u0e23\u0e4c\u0e21");
  assert.ok(/requireNumber\(\)/.test(src), "\u0e0a\u0e48\u0e2d\u0e07\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02\u0e15\u0e49\u0e2d\u0e07\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a\u0e43\u0e2b\u0e49\u0e40\u0e1b\u0e47\u0e19\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02");
}

/* ═══ แยกสามกอง: ผูกฟอร์ม / ไม่ผูก / ถามไม่ได้ ═══
   รอบแรกเขียน catch แล้วโยนทิ้ง ผลคือ log บอก "ไม่เจอฟอร์ม 0 ใบ"
   ทั้งที่ของจริงคือสคริปต์ไม่มีสิทธิ์อ่านฟอร์ม — คนละเรื่องกันคนละทางแก้ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Forms.gs", "utf8"), gas);

  const sh = (name, fn) => ({ getName: () => name, getFormUrl: fn });
  const r = gas.formScanSheets_([
    sh("Cut-Slot", () => "https://docs.google.com/forms/d/AAA/edit"),
    sh("\u0e0a\u0e35\u0e1523", () => null),
    sh("UV", () => { throw new Error("no permission"); }),
  ]);

  assert.strictEqual(r.ok.length, 1);
  assert.strictEqual(r.ok[0].url, "https://docs.google.com/forms/d/AAA/edit");
  assert.strictEqual(J(r.noForm), J(["\u0e0a\u0e35\u0e1523"]));
  assert.strictEqual(r.fail.length, 1, "\u0e0a\u0e35\u0e15\u0e17\u0e35\u0e48\u0e16\u0e32\u0e21\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e40\u0e07\u0e35\u0e22\u0e1a\u0e2b\u0e32\u0e22");
  assert.ok(r.fail[0].includes("UV") && r.fail[0].includes("no permission"),
    "\u0e15\u0e49\u0e2d\u0e07\u0e1a\u0e2d\u0e01\u0e0a\u0e37\u0e48\u0e2d\u0e0a\u0e35\u0e15\u0e41\u0e25\u0e30\u0e2a\u0e32\u0e40\u0e2b\u0e15\u0e38");
}

/* ═══ จับคู่ entry.XXXX กับชื่อข้อ ═══
   รอบแรกพิมพ์แต่รหัส พอฟอร์ม UV มีช่องพิมพ์ข้อความ 5 ช่อง เลยไม่มีทางรู้ว่าอันไหนคือผู้ตรวจ
   จับคู่ผิดข้อ = ลิงก์ QR ไปเติมชื่อช่างลงช่องผิด */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Forms.gs", "utf8"), gas);

  const titles = ["\u0e19\u0e49\u0e33\u0e2b\u0e19\u0e31\u0e01\u0e2a\u0e35", "\u0e1c\u0e39\u0e49\u0e15\u0e23\u0e27\u0e08"];
  const url = "https://docs.google.com/forms/d/e/X/viewform?usp=pp_url" +
    "&entry.111=" + gas.formMark_(0) + "&entry.222=" + gas.formMark_(1);
  assert.strictEqual(J(gas.formEntryPairs_(url, titles)),
    J(["\u0e19\u0e49\u0e33\u0e2b\u0e19\u0e31\u0e01\u0e2a\u0e35 = entry.111", "\u0e1c\u0e39\u0e49\u0e15\u0e23\u0e27\u0e08 = entry.222"]));

  // ช่องที่ฟอร์มเติมค่าอื่นมาเอง ต้องไม่ถูกนับเป็นคู่
  assert.strictEqual(J(gas.formEntryPairs_(
    "?entry.999=hello&entry.111=" + gas.formMark_(0), titles)),
    J(["\u0e19\u0e49\u0e33\u0e2b\u0e19\u0e31\u0e01\u0e2a\u0e35 = entry.111"]));

  // ค่าหลอกที่ชี้ไปข้อที่ไม่มีอยู่ ต้องถูกทิ้ง ไม่ใช่กลายเป็น "undefined = entry.333"
  assert.strictEqual(J(gas.formEntryPairs_("?entry.333=zq9zq", titles)), J([]));

  /* ══ ลำดับในการสร้างฟอร์ม ══
     ของเดิมลงทะเบียนทีหลัง setDestination พอ setDestination โยน error
     ฟอร์มที่สร้างไปแล้วไม่ถูกบันทึกไว้ที่ไหน รันซ้ำก็สร้างใบใหม่ทับไปเรื่อย ๆ */
  const src = fs.readFileSync("gas/Forms.gs", "utf8");
  const mk = src.slice(src.indexOf("function makeParamForms"));
  const iReg = mk.indexOf("formRegAdd_(");
  const iDest = mk.indexOf("setDestination(");
  assert.ok(iReg > -1 && iDest > -1);
  assert.ok(iReg < iDest, "\u0e15\u0e49\u0e2d\u0e07\u0e25\u0e07\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e01\u0e48\u0e2d\u0e19\u0e1c\u0e39\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e04\u0e33\u0e15\u0e2d\u0e1a \u0e44\u0e21\u0e48\u0e07\u0e31\u0e49\u0e19\u0e44\u0e14\u0e49\u0e1f\u0e2d\u0e23\u0e4c\u0e21\u0e01\u0e33\u0e1e\u0e23\u0e49\u0e32");
  assert.ok(/try \{ form\.setDestination/.test(src),
    "\u0e1c\u0e39\u0e01\u0e44\u0e1f\u0e25\u0e4c\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49 \u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e25\u0e49\u0e21\u0e17\u0e31\u0e49\u0e07\u0e23\u0e2d\u0e1a");
}

/* ═══ สิทธิ์ตามบทบาท ═══
   ไล่ทั้งระบบแล้วเจอสามรู: ADMIN ไม่มีใน RANK · เช็คชีตเปิดให้ดึงโดยไม่ล็อกอิน
   · มี API เปิดใบแจ้งซ่อมที่ไม่ขอ token และไม่มีใครเรียก */
{
  const code = fs.readFileSync("gas/Code.gs", "utf8");
  const app = fs.readFileSync("gas/app.html", "utf8");

  // ── ADMIN ต้องไม่ต่ำกว่าช่าง ──
  const gas = {};
  vm.runInNewContext(code, gas);
  assert.ok(gas.RANK.ADMIN > gas.RANK.TECH,
    "ADMIN \u0e16\u0e39\u0e01\u0e2d\u0e49\u0e32\u0e07\u0e43\u0e19 paramCanApprove_ \u0e08\u0e36\u0e07\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e2d\u0e31\u0e19\u0e14\u0e31\u0e1a\u0e43\u0e19 RANK");
  assert.ok(gas.RANK.ADMIN >= gas.RANK.LEAD);
  // ฝั่งหน้าเว็บต้องรู้จักบทบาทชุดเดียวกัน ไม่งั้น ADMIN เห็นเมนูไม่ครบ
  const roles = Object.keys(gas.RANK);
  const cut = (mark, n) => app.slice(app.indexOf(mark), app.indexOf(mark) + n);
  const rankLine = cut("const RANK_OF", 140);
  const labelLine = cut("const ROLE_LABEL", 240);
  roles.forEach((r) => {
    assert.ok(rankLine.includes(r + ":"), "RANK_OF ขาด " + r);
    assert.ok(labelLine.includes(r + ":"), "ROLE_LABEL ขาด " + r);
  });

  /* ── ทุกหน้าที่อยู่ใน NEED_LOGIN ต้องมี API ที่ขอ token ──
     หน้าเช็คชีตเคยอยู่หลังล็อกอินแต่ API เปิดโล่ง ใครมีลิงก์ /exec ก็ดึงผลตรวจทั้งโรงงานได้ */
  const head = code.slice(code.indexOf("function apiGetDailyCheck"),
                          code.indexOf("function apiGetDailyCheck") + 320);
  assert.ok(/apiGetDailyCheck\(token/.test(head) && /requireAuth_\(token\)/.test(head),
    "apiGetDailyCheck \u0e15\u0e49\u0e2d\u0e07\u0e02\u0e2d token");
  assert.ok(/gsAuth\("apiGetDailyCheck"/.test(app), "\u0e2b\u0e19\u0e49\u0e32\u0e40\u0e27\u0e47\u0e1a\u0e15\u0e49\u0e2d\u0e07\u0e2a\u0e48\u0e07 token \u0e44\u0e1b\u0e14\u0e49\u0e27\u0e22");

  // ── ทางเขียนที่ไม่ขอ token ต้องเหลือเฉพาะที่ตั้งใจ (ผู้แจ้ง/ฝ่ายผลิตไม่ต้องล็อกอิน) ──
  assert.ok(!/function apiTicketFromCheck/.test(code),
    "API \u0e40\u0e1b\u0e34\u0e14\u0e43\u0e1a\u0e41\u0e08\u0e49\u0e07\u0e0b\u0e48\u0e2d\u0e21\u0e17\u0e35\u0e48\u0e44\u0e21\u0e48\u0e02\u0e2d token \u0e41\u0e25\u0e30\u0e44\u0e21\u0e48\u0e21\u0e35\u0e43\u0e04\u0e23\u0e40\u0e23\u0e35\u0e22\u0e01 \u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35");
}

/* ═══ สวิตช์ "เฉพาะเครื่องที่ฉันดูแล" ═══
   ช่างคนหนึ่งดูแลไม่กี่เครื่อง แต่หน้าจอโชว์ทั้งโรงงาน — เรียงของตัวเองขึ้นก่อนยังต้องไถหา */
{
  const app = fs.readFileSync("gas/app.html", "utf8");
  const idx = fs.readFileSync("gas/index.html", "utf8");
  const css = fs.readFileSync("gas/styles.html", "utf8");
  const code = fs.readFileSync("gas/Code.gs", "utf8");

  ["paramMineOnly", "checkMineOnly", "paramMineWrap", "checkMineWrap"].forEach((id) =>
    assert.ok(idx.includes(`id="${id}"`), "\u0e02\u0e32\u0e14 " + id));
  assert.ok(css.includes(".mine-only"), "\u0e2a\u0e27\u0e34\u0e15\u0e0a\u0e4c\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e2a\u0e44\u0e15\u0e25\u0e4c \u0e44\u0e21\u0e48\u0e07\u0e31\u0e49\u0e19\u0e01\u0e14\u0e44\u0e21\u0e48\u0e23\u0e39\u0e49\u0e27\u0e48\u0e32\u0e01\u0e14\u0e44\u0e14\u0e49");
  assert.ok(/mineOnlyBind\("param"/.test(app) && /mineOnlyBind\("check"/.test(app),
    "\u0e15\u0e49\u0e2d\u0e07\u0e43\u0e0a\u0e49\u0e17\u0e31\u0e49\u0e07\u0e2a\u0e2d\u0e07\u0e2b\u0e19\u0e49\u0e32");

  /* ลอจิกของตัวกรอง — ส่วนที่พลาดแล้วหน้าจอว่างเปล่าโดยไม่มี error */
  const ctx = {};
  vm.runInNewContext(
    app.slice(app.indexOf("const mineOnly = {"), app.indexOf("/** ผูกสวิตช์")) +
    "\nvar out = { mineOnly, mineOnlyOn };", ctx,
    { filename: "mineOnly" });

  // หัวหน้าไม่ได้ประจำสถานี -> ต้องเห็นครบทั้งโรงงานเสมอ
  ctx.myStation = () => "";
  ctx.isLead = () => true;
  ctx.out.mineOnly.param = null;
  assert.strictEqual(ctx.out.mineOnlyOn("param"), false, "\u0e2b\u0e31\u0e27\u0e2b\u0e19\u0e49\u0e32\u0e15\u0e49\u0e2d\u0e07\u0e40\u0e2b\u0e47\u0e19\u0e04\u0e23\u0e1a");

  // หัวหน้าที่ "มีสถานี" ด้วยก็ยังต้องเห็นครบ — สถานีไม่ใช่เหตุผลที่จะปิดตาหัวหน้า
  ctx.myStation = () => "EXT";
  ctx.out.mineOnly.param = null;
  assert.strictEqual(ctx.out.mineOnlyOn("param"), false,
    "หัวหน้าที่มีสถานีก็ต้องเห็นครบ");

  // ช่างที่มีสถานี -> เปิดให้เองตั้งแต่แรก
  ctx.myStation = () => "EXT";
  ctx.isLead = () => false;
  ctx.out.mineOnly.check = null;
  assert.strictEqual(ctx.out.mineOnlyOn("check"), true, "\u0e0a\u0e48\u0e32\u0e07\u0e17\u0e35\u0e48\u0e21\u0e35\u0e2a\u0e16\u0e32\u0e19\u0e35 \u0e40\u0e1b\u0e34\u0e14\u0e43\u0e2b\u0e49\u0e40\u0e2d\u0e07");

  // ปิดเองแล้วต้องจำไว้ ไม่ใช่เด้งกลับทุกครั้งที่เปลี่ยนวันที่
  ctx.out.mineOnly.check = false;
  assert.strictEqual(ctx.out.mineOnlyOn("check"), false, "\u0e01\u0e14\u0e1b\u0e34\u0e14\u0e41\u0e25\u0e49\u0e27\u0e15\u0e49\u0e2d\u0e07\u0e08\u0e33");

  // ── ลิงก์ฟอร์มรายเครื่องมาจาก server ──
  assert.ok(/formUrl: urls\[/.test(code), "\u0e01\u0e32\u0e23\u0e4c\u0e14\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e1f\u0e2d\u0e23\u0e4c\u0e21\u0e02\u0e2d\u0e07\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07");
  assert.ok(app.includes("m.formUrl ?"), "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e02\u0e36\u0e49\u0e19\u0e1b\u0e38\u0e48\u0e21");
  // ย้ายฟอร์มแล้วลิงก์ต้องไม่ค้างในแคชข้ามวัน
  const cleared = code.match(/removeAll\(\s*\[([^\]]*)\]\)/);
  assert.ok(cleared, "หา clearCache ไม่เจอ");
  ["CACHE_KEY_CONFIG", "CACHE_KEY_HOLIDAY", "CACHE_KEY_CHKFORM", "CACHE_KEY_USERS"]
    .forEach((k) => assert.ok(cleared[1].includes(k), `clearCache ต้องล้าง ${k} ด้วย`));
}

/* ═══ สถานี "ALL" ═══
   หัวหน้าในชีต Users ใช้คำนี้แปลว่าดูแลทั้งโรงงาน ไม่ใช่ชื่อสถานีจริง
   ถ้าอ่านตรงตัวจะได้ 0 เครื่อง แล้วแถบบนหน้าจอโกหกว่าเขาไม่รับผิดชอบอะไรเลย */
{
  const app = fs.readFileSync("gas/app.html", "utf8");
  const ctx = {
    MACHINES: [
      { name: "Extrusion 1 - 80", owner: "EXT" },
      { name: "UV 1", owner: "UV" },
      { name: "Powder mill", owner: "" },
    ],
  };
  vm.runInNewContext(
    app.slice(app.indexOf('const ALL_STATION'), app.indexOf("const isMyMachine")) +
    "\nvar out = { stationMachines };", ctx, { filename: "station" });
  const names = (st) => ctx.out.stationMachines(st).map((m) => m.name);

  assert.strictEqual(J(names("EXT")), J(["Extrusion 1 - 80"]));
  assert.strictEqual(J(names("")), J([]), "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e2a\u0e16\u0e32\u0e19\u0e35 = \u0e44\u0e21\u0e48\u0e21\u0e35\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e02\u0e2d\u0e07\u0e15\u0e31\u0e27\u0e40\u0e2d\u0e07");
  assert.strictEqual(ctx.out.stationMachines("ALL").length, 3, "ALL = \u0e17\u0e31\u0e49\u0e07\u0e42\u0e23\u0e07\u0e07\u0e32\u0e19 \u0e23\u0e27\u0e21\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e17\u0e35\u0e48\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e2a\u0e16\u0e32\u0e19\u0e35\u0e14\u0e49\u0e27\u0e22");
  assert.strictEqual(ctx.out.stationMachines(" all ").length, 3, "\u0e2a\u0e30\u0e01\u0e14\u0e15\u0e31\u0e27\u0e40\u0e25\u0e47\u0e01/\u0e21\u0e35\u0e0a\u0e48\u0e2d\u0e07\u0e27\u0e48\u0e32\u0e07\u0e01\u0e47\u0e15\u0e49\u0e2d\u0e07\u0e15\u0e34\u0e14");
  // คืน copy ไม่ใช่ตัวจริง ไม่งั้นใครเผลอ sort ทีเดียวทะเบียนทั้งระบบสลับลำดับ
  ctx.out.stationMachines("ALL").pop();
  assert.strictEqual(ctx.MACHINES.length, 3, "\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e41\u0e01\u0e49\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e15\u0e31\u0e27\u0e08\u0e23\u0e34\u0e07");
}


/* ═══ dataIssues() — ตัวตรวจคุณภาพข้อมูล ═══
   รายงานที่เงียบไปแม้แค่กองเดียว แย่กว่าไม่มีรายงานเลย
   เพราะคนอ่านแล้วเชื่อว่าข้อนั้นผ่าน — ทุกกองจึงต้องมีเคสที่ปล่อยของเสียเข้าไปจริง */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };

  gas.machines_ = () => [
    { name: "EXT 1", code: "E1", group: "EXT", owner: "\u0e0a\u0e48\u0e32\u0e07 Ext" },
    { name: "Powder mill", code: "PM1", group: "MIX", owner: "" },
    { name: "UV 1", code: "U1", group: "UV", owner: "\u0e0a\u0e48\u0e32\u0e07\u0e22\u0e39\u0e27\u0e35" },
    { name: "uv 1", code: "U1", group: "UV", owner: "\u0e0a\u0e48\u0e32\u0e07 UV" },
  ];
  gas.canonical_ = (n) => String(n || "").trim();

  gas.readSheet_ = () => [
    { "\u0e2d\u0e35\u0e40\u0e21\u0e25": "a@x", "\u0e0a\u0e37\u0e48\u0e2d-\u0e19\u0e32\u0e21\u0e2a\u0e01\u0e38\u0e25": "\u0e2a\u0e21\u0e0a\u0e32\u0e22",
      "\u0e1a\u0e17\u0e1a\u0e32\u0e17": "TECH", "\u0e2a\u0e16\u0e32\u0e19\u0e35\u0e1b\u0e23\u0e30\u0e08\u0e33": "\u0e0a\u0e48\u0e32\u0e07 Ext" },
    { "\u0e2d\u0e35\u0e40\u0e21\u0e25": "b@x", "\u0e0a\u0e37\u0e48\u0e2d-\u0e19\u0e32\u0e21\u0e2a\u0e01\u0e38\u0e25": "\u0e2a\u0e21\u0e2b\u0e0d\u0e34\u0e07",
      "\u0e1a\u0e17\u0e1a\u0e32\u0e17": "SUPER", "\u0e2a\u0e16\u0e32\u0e19\u0e35\u0e1b\u0e23\u0e30\u0e08\u0e33": "ALL" },
    { "\u0e2d\u0e35\u0e40\u0e21\u0e25": "c@x", "\u0e0a\u0e37\u0e48\u0e2d-\u0e19\u0e32\u0e21\u0e2a\u0e01\u0e38\u0e25": "\u0e2a\u0e21\u0e28\u0e23\u0e35",
      "\u0e1a\u0e17\u0e1a\u0e32\u0e17": "ENG", "\u0e2a\u0e16\u0e32\u0e19\u0e35\u0e1b\u0e23\u0e30\u0e08\u0e33": "\u0e0a\u0e48\u0e32\u0e07\u0e44\u0e1f" },
  ];

  gas.paramChecklist_ = () => ({
    "EXT 1": { groups: [{ group: "g", fields: [
      { label: "", key: "", type: "num", std: "", tol: "", unit: "" },
      { label: "\u0e2d\u0e38\u0e13\u0e2b\u0e20\u0e39\u0e21\u0e34", key: "t", type: "num", std: 200, tol: 5, unit: "C" },
      { label: "\u0e2e\u0e35\u0e15\u0e40\u0e15\u0e2d\u0e23\u0e4c", key: "h", type: "num", std: 100, tol: 50, unit: "C" },
    ] }] },
  });

  const sheetOf = (name, vals, by) => ({
    sh: {
      getName: () => name,
      getLastRow: () => vals.length + 1,
      getRange: (r, c, n) => ({ getValues: () => vals.slice(r - 2, r - 2 + n).map((v) => [v]) }),
    },
    head: [], meta: { machine: 0, by },
  });
  gas.checkFormSheets_ = () => [
    sheetOf("Cut-Slot", ["EXT 1", "\u0e1b\u0e01\u0e15\u0e34", "\u0e1b\u0e01\u0e15\u0e34"], 5),
    sheetOf("UV", ["EXT 1"], -1),
  ];

  gas.rowsToObjects_ = () => [
    { ticket_id: "W1", started_at: "2026-10-02T10:00:00", completed_at: "2026-10-02T09:00:00" },
    { ticket_id: "W2", created_at: "2026-10-02T10:00:00", started_at: "2026-10-02T09:00:00" },
    { ticket_id: "W3", status: gas.STATUS_DONE, cause: "", repair_action: "", machine_name: "EXT 1" },
    { ticket_id: "W4", status: gas.STATUS_DONE, cause: "\u0e25\u0e39\u0e01\u0e1b\u0e37\u0e19\u0e41\u0e15\u0e01", repair_action: "\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19" },
  ];

  const PROPS = {
    SHEET_ID: "1abcdefghijklmnopqrstuvwxyz",
    DRIVE_FOLDER_ID: "https://drive.google.com/drive/folders/1Pxv0123456789abcdefghijkl?usp=sharing",
    DASHBOARD_PASSWORD: "abcde",
    AUTH_SECRET: "",
  };
  gas.prop_ = (k) => PROPS[k] || "";

  const r = gas.dataIssues();
  const has = (s) => r.indexOf(s) > -1;

  // ── ทะเบียน ──
  assert.ok(has("Powder mill (MIX)"), "เครื่องไม่มีผู้ดูแลต้องขึ้น");
  assert.ok(!has("EXT 1 (EXT)"), "เครื่องที่มีผู้ดูแลแล้วต้องไม่ขึ้นให้รก");
  assert.ok(has("\u0e0a\u0e37\u0e48\u0e2d\u0e0b\u0e49\u0e33: uv 1"), "ชื่อซ้ำต่างตัวพิมพ์ก็คือซ้ำ");
  assert.ok(has("\u0e23\u0e2b\u0e31\u0e2a\u0e0b\u0e49\u0e33: U1"), "รหัสเครื่องซ้ำ");

  // ── Users ──
  assert.ok(has('\u0e1a\u0e17\u0e1a\u0e32\u0e17 "SUPER"'), "บทบาทนอกระบบต้องขึ้น");
  assert.ok(has('\u0e2a\u0e16\u0e32\u0e19\u0e35 "\u0e0a\u0e48\u0e32\u0e07\u0e44\u0e1f"'), "สถานีของคนที่ไม่มีจริง");
  assert.ok(!has("\u0e2a\u0e21\u0e0a\u0e32\u0e22 \u2014"), "คนที่ข้อมูลครบต้องไม่ขึ้น");
  assert.ok(!has('\u0e2a\u0e16\u0e32\u0e19\u0e35 "ALL"'), "ALL \u0e04\u0e37\u0e2d\u0e04\u0e48\u0e32\u0e17\u0e35\u0e48\u0e16\u0e39\u0e01");

  // ── เช็คลิสต์ ──
  assert.ok(has("EXT 1 \u2014 1 \u0e0a\u0e48\u0e2d\u0e07"), "ช่องไม่มีป้ายต้องนับได้");
  assert.ok(has("\u0e2e\u0e35\u0e15\u0e40\u0e15\u0e2d\u0e23\u0e4c = 100 \u00b150"), "พิกัดกว้างเกินต้องขึ้น");
  assert.ok(!has("\u0e2d\u0e38\u0e13\u0e2b\u0e20\u0e39\u0e21\u0e34 = 200"), "พิกัดปกติต้องไม่ขึ้น");

  // ── เช็คชีต ──
  assert.ok(has('"\u0e1b\u0e01\u0e15\u0e34" \u00d72 \u0e41\u0e16\u0e27'), "แถวขยะต้องนับรวม ไม่ใช่รายงานทีละแถว");
  /* เทียบชื่อชีตเฉยๆ ไม่พอ — "UV" โผล่ในกองอื่นอยู่แล้ว เทสจึงผ่านได้ทั้งที่กองนี้ว่าง */
  assert.ok(/ผู้ตรวจ · ⚠ 1 /.test(r),
    "ชีตที่ไม่มีช่องผู้ตรวจต้องขึ้น 1 ชีต");

  // ── ใบแจ้งซ่อม ──
  assert.ok(has("W1"), "ซ่อมจบก่อนเริ่มซ่อม");
  assert.ok(has("W2"), "เริ่มซ่อมก่อนเวลาแจ้ง");
  assert.ok(has("W3"), "ปิดงานโดยไม่บันทึกสาเหตุ");
  assert.ok(!has("W4"), "ใบที่ครบต้องไม่ขึ้น");

  // ── Script Properties ──
  assert.ok(has("AUTH_SECRET"), "property ที่ขาดต้องขึ้น");
  assert.ok(has("DASHBOARD_PASSWORD \u2014"), "รหัสเดาง่ายต้องขึ้น");
  assert.ok(!has("abcde"), "ห้ามพิมพ์รหัสผ่านออกมาในรายงาน");
  assert.ok(has("DRIVE_FOLDER_ID \u2014 \u0e27\u0e32\u0e07\u0e25\u0e34\u0e07\u0e01\u0e4c"), "ลิงก์แทนรหัสต้องขึ้น (ใช้ได้ แต่อ่านยาก)");
  assert.ok(!has("SHEET_ID \u2014"), "SHEET_ID ที่ถูกต้องไม่ขึ้น");

  /* สามกฎคนละข้อ ต้องมีตัวอย่างของใครของมัน ไม่งั้นลบข้อไหนออกก็ไม่มีเทสพัง */
  const pwFlagged = (v) => {
    PROPS.DASHBOARD_PASSWORD = v;
    return gas.dataIssues().indexOf("DASHBOARD_PASSWORD —") > -1;
  };
  assert.ok(pwFlagged("111111"), "เลขซ้ำล้วน — ยาวพอแต่เดาได้");
  assert.ok(pwFlagged("123456"), "เลขเรียง — ยาวพอและไม่ซ้ำตัว แต่เดาได้");
  assert.ok(!pwFlagged("Brt#2026!mt"), "รหัสที่ใช้ได้ต้องไม่ขึ้น");

  // อ่านอย่างเดียว — ห้ามมีคำสั่งเขียนหลุดเข้ามา
  const src = fs.readFileSync("gas/Code.gs", "utf8");
  const body = src.slice(src.indexOf("function dataIssues()"),
                         src.indexOf("/** \u0e2d\u0e35\u0e40\u0e21\u0e25\u0e02\u0e2d\u0e07\u0e04\u0e19\u0e43\u0e19\u0e17\u0e35\u0e21\u0e15\u0e32\u0e21\u0e0a\u0e37\u0e48\u0e2d */"));
  assert.ok(body.length > 500, "หาตัว dataIssues ไม่เจอ");
  [/setValue/, /appendRow/, /setValues/, /deleteRow/, /\.clear\(/].forEach((re) => {
    assert.ok(!re.test(body), `dataIssues \u0e15\u0e49\u0e2d\u0e07\u0e2d\u0e48\u0e32\u0e19\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e40\u0e14\u0e35\u0e22\u0e27 \u0e41\u0e15\u0e48\u0e40\u0e08\u0e2d: ${re}`);
  });
}


/* ═══ สิทธิ์อ่านสดจากชีต ไม่เชื่อ token อย่างเดียว ═══
   token อายุ 8 ชม. หัวหน้ากดปิดบัญชีตอนบ่ายสอง แล้วคนนั้นยังทำงานถึงเย็น
   ไม่ได้ — การปิดบัญชีต้องมีผลทันที ไม่งั้นการปิดก็ไม่มีความหมาย */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.Logger = { log: () => {} };
  gas.userFromToken_ = (t) =>
    t === "bad" ? null : { email: "a@x", name: "\u0e0a\u0e48\u0e32\u0e07\u0e0a\u0e25", role: String(t) };

  const USERS = [
    { "\u0e2d\u0e35\u0e40\u0e21\u0e25": "a@x", "\u0e0a\u0e37\u0e48\u0e2d-\u0e19\u0e32\u0e21\u0e2a\u0e01\u0e38\u0e25": "\u0e0a\u0e48\u0e32\u0e07\u0e0a\u0e25",
      "\u0e1a\u0e17\u0e1a\u0e32\u0e17": "TECH", "\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19": "\u0e43\u0e0a\u0e48", "\u0e2a\u0e16\u0e32\u0e19\u0e35\u0e1b\u0e23\u0e30\u0e08\u0e33": "EXT" },
  ];
  gas.readSheet_ = () => USERS;

  // บทบาทมาจากชีต ไม่ใช่จาก token — token อ้าง LEAD ก็ไม่ช่วย
  assert.strictEqual(gas.requireAuth_("LEAD").role, "TECH",
    "บทบาทต้องมาจากชีต — ไม่งั้นแก้ token เองแล้วเลื่อนขั้นได้");
  assert.strictEqual(gas.requireAuth_("TECH").station, "EXT", "สถานีมาจากชีตด้วย");
  assert.throws(() => gas.requireAuth_("TECH", "LEAD"), /\u0e2a\u0e34\u0e17\u0e18\u0e34/,
    "ช่างทำงานที่ต้องเป็นหัวหน้าไม่ได้");

  // ปิดบัญชีแล้วต้องเข้าไม่ได้ทันที ทั้งที่ token ยังไม่หมดอายุ
  USERS[0]["\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19"] = "\u0e44\u0e21\u0e48";
  assert.throws(() => gas.requireAuth_("TECH"), /\u0e1b\u0e34\u0e14\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19/,
    "ปิดบัญชีแล้วต้องใช้งานต่อไม่ได้");
  USERS[0]["\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19"] = "\u0e43\u0e0a\u0e48";

  // ลบชื่อออกจากชีตไปเลย = ไม่มีสิทธิ์อีกต่อไป
  gas.readSheet_ = () => [];
  assert.throws(() => gas.requireAuth_("TECH"), /\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e1a\u0e31\u0e0d\u0e0a\u0e35/,
    "คนที่ถูกลบออกจากชีตต้องเข้าไม่ได้");

  /* อ่านชีตไม่ได้ — ไม่ใช่เหตุให้ทั้งโรงงานหยุดทำงาน
     Google ล่มชั่วคราวเกิดขึ้นได้ แต่งานซ่อมรอไม่ได้ */
  gas.readSheet_ = () => { throw new Error("\u0e2d\u0e48\u0e32\u0e19\u0e0a\u0e35\u0e15\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49"); };
  assert.strictEqual(gas.requireAuth_("ENG").role, "ENG",
    "ชีตล่ม — ถอยไปใช้ค่าใน token ดีกว่าปิดระบบทั้งโรงงาน");

  // token ปลอม/หมดอายุ ต้องตกด่านแรกเสมอ
  assert.throws(() => gas.requireAuth_("bad"), /\u0e40\u0e02\u0e49\u0e32\u0e2a\u0e39\u0e48\u0e23\u0e30\u0e1a\u0e1a/);
}

/* ═══ รายชื่อพนักงานไม่หลุดออกกับคนที่ไม่ได้ล็อกอิน ═══ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  gas.verify_ = (t) => t === "good";

  const full = { machines: [{ name: "EXT 1" }], team: [{ name: "\u0e0a\u0e48\u0e32\u0e07\u0e0a\u0e25", role: "TECH" }],
                 companyName: "ACME" };

  const anon = gas.configForViewer_(full, "");
  assert.strictEqual(J(anon.team), J([]), "ไม่มี token = ไม่ได้รายชื่อพนักงาน");
  assert.strictEqual(anon.machines.length, 1, "ทะเบียนเครื่องต้องยังมี — ฝ่ายผลิตแจ้งซ่อมโดยไม่ล็อกอิน");
  assert.strictEqual(anon.companyName, "ACME");
  assert.strictEqual(gas.configForViewer_(full, "good").team.length, 1, "ล็อกอินแล้วเห็นครบ");

  // ตัดสำเนา ไม่ใช่ตัดของจริงในแคช
  assert.strictEqual(full.team.length, 1, "ต้องไม่แก้ก้อนที่อยู่ในแคช");

  // หน้าจอต้องส่ง token ไปด้วย ไม่งั้นก็ไม่มีวันได้รายชื่อ
  const app = fs.readFileSync("gas/app.html", "utf8");
  assert.ok(app.includes('gs("apiGetConfig", getToken())'), "หน้าจอต้องส่ง token ไปกับ apiGetConfig");
  /* ล็อกอินเสร็จต้องโหลด config ซ้ำ — รอบแรกโหลดตอนยังไม่มี token รายชื่อจึงว่าง */
  const after = app.slice(app.indexOf("const res = await login("), app.indexOf("await refresh();", app.indexOf("const res = await login(")));
  assert.ok(after.includes("await loadConfig()"), "หลังล็อกอินต้องโหลด config ใหม่ ไม่งั้นดรอปดาวน์ผู้รับผิดชอบจะว่าง");
}

/* ═══ PIN ของใหม่ต้องยาวพอและไม่เดาง่าย ═══
   บังคับเฉพาะตอนตั้งครั้งแรก — คนที่ใช้ 4 หลักอยู่เดิมยังเข้าได้ */
{
  const gas = {};
  vm.runInNewContext(fs.readFileSync("gas/Code.gs", "utf8"), gas);
  const w = gas.pinTooWeak_;

  assert.strictEqual(w("846203"), "", "เลขสุ่ม 6 หลัก ใช้ได้");
  assert.strictEqual(w("84620391"), "", "8 หลักก็ได้");
  assert.ok(w("1234"), "4 หลักสั้นไป");
  assert.ok(w("12345"), "5 หลักก็ยังสั้น");
  assert.ok(w("123456789"), "9 หลักยาวเกิน");
  assert.ok(w("84620a"), "มีตัวอักษรไม่ได้");
  assert.ok(w("111111"), "เลขซ้ำล้วน");
  assert.ok(w("123456"), "เรียงขึ้น");
  assert.ok(w("987654"), "เรียงลง");
  assert.strictEqual(w("123457"), "", "เกือบเรียงแต่ไม่เรียง — ผ่าน");

  /* ด่านตรวจ PIN ต้องอยู่ในกิ่ง "ยังไม่เคยตั้ง" เท่านั้น
     ถ้าหลุดออกมาครอบทั้งฟังก์ชัน ช่างทุกคนที่ใช้ PIN สี่หลักจะเข้าระบบไม่ได้อีกเลย */
  const code = fs.readFileSync("gas/Code.gs", "utf8");
  const login = code.slice(code.indexOf("function apiLogin("), code.indexOf("function resetPin("));
  const guard = login.indexOf("pinTooWeak_(pin)");
  const firstTime = login.indexOf("if (!stored) {");
  const compare = login.indexOf("safeEqual_(hashPin_(pin, salt), stored)");
  assert.ok(guard > firstTime && guard < compare,
    "การตรวจความแข็งของ PIN ต้องอยู่เฉพาะกิ่งตั้งใหม่ — ไม่งั้นคนเก่าเข้าไม่ได้");
  assert.ok(/if \(weak\) throw/.test(login),
    "เจอ PIN อ่อนแล้วต้องโยนทิ้ง ไม่ใช่คำนวณไว้เฉย ๆ แล้วบันทึกต่อ");
  assert.ok(/isActive_\(rows\[i\]\[US\.ACTIVE\]\)/.test(login),
    'ช่อง "ใช้งาน" เป็นคำว่า "ไม่" ก็ต้องกันได้ ไม่ใช่เฉพาะ false');
}
