/* ═══════════════════════════════════════════════════════════════════
   สร้าง Google Form จากเช็คลิสต์ — รันเองจากเมนู Apps Script

   363 ช่องใน 12 เครื่อง ถ้านั่งคลิกในหน้า Google Forms คือคลิกเป็นพันครั้ง
   และทุกครั้งที่พิมพ์ชื่อข้อผิดหนึ่งตัว ระบบจะจับคู่ช่องนั้นไม่ติดโดยไม่มี error ให้จับ
   จึงให้สคริปต์สร้างจากชีตเดียวกับที่หน้าจออ่าน — ชื่อข้อกับชื่อช่องมาจากแหล่งเดียวกันเสมอ

   ไฟล์นี้ไม่เกี่ยวกับการทำงานประจำวันของเว็บแอป รันครั้งเดียวตอนตั้งระบบ
   ลบทิ้งได้หลังสร้างฟอร์มเสร็จ ถ้าไม่อยากให้ใครเผลอรันซ้ำ
   ═══════════════════════════════════════════════════════════════════ */

var FORM_SHEET_REG = 'ทะเบียนฟอร์ม';
var FORM_REG_HEAD = ['เครื่องจักร', 'รหัสแบบฟอร์ม', 'ลิงก์กรอก', 'ลิงก์แก้ไขฟอร์ม', 'สร้างเมื่อ'];

/** ตัวเลือกของช่องเปิด/ปิด — ต้องตรงกับที่ checkAnswer_ รู้จัก ไม่งั้นอ่านกลับมาเป็น note หมด */
var FORM_ONOFF = ['ON', 'OFF'];
var FORM_SHIFTS = ['กะเช้า', 'กะดึก'];

/* ── ส่วนที่คิดเอง แยกจาก FormApp เพื่อให้ทดสอบได้โดยไม่ต้องสร้างฟอร์มจริง ── */

/** หนึ่งช่องในเช็คลิสต์ → สเปคของข้อถาม · คืน null = ข้ามช่องนี้
    เหตุผลที่ข้าม: ช่องไม่มีชื่อ (ป้ายในฟอร์ม ISO ถูกตัด ยังไม่มีใครยืนยันว่าคืออะไร)
    กับช่องที่เครื่องแสดงเอง/เลิกใช้ — ถามไปช่างก็ได้แต่เดาตัวเลขใส่ */
function formItemSpec_(f) {
  var label = String((f && f.label) || '').trim();
  if (!label) return null;
  var type = String((f && f.type) || 'num').trim().toLowerCase();
  if (type === 'auto' || type === 'na') return null;

  var hint = [];
  if (f.std !== '' && f.std !== null && f.std !== undefined && isFinite(Number(f.std))) {
    var s = Number(f.std);
    hint.push(f.tol !== '' && isFinite(Number(f.tol)) && Number(f.tol) > 0
      ? s + ' ± ' + Number(f.tol)
      : 'ค่ามาตรฐาน ' + s);
  }
  if (f.unit) hint.push('หน่วย: ' + f.unit);
  if (f.note) hint.push(String(f.note));

  return {
    label: label,
    kind: type === 'onoff' ? 'choice' : 'text',
    choices: type === 'onoff' ? FORM_ONOFF.slice() : [],
    help: hint.join(' · '),
    /* ตัวเลขที่หลุดสเปคต้องกรอกได้ ห้ามบังคับช่วง min–max
       ไม่งั้นวันที่เครื่องเพี้ยนจริง ช่างจะกรอกไม่ผ่าน แล้วไปโกหกตัวเลขให้ฟอร์มยอมรับแทน */
    number: type !== 'onoff'
  };
}

/** หัวข้อของข้อถาม — "กลุ่ม [ป้าย]" แบบเดียวกับฟอร์มเช็คชีต
    ซ้ำกันแล้วเติมเลขต่อท้าย เพราะหัวคอลัมน์ซ้ำคือสิ่งที่ทำให้ไฟล์เช็คชีตเดิมอ่านยาก */
function formTitle_(group, label, seen) {
  var base = String(group || 'พารามิเตอร์').trim() + ' [' + String(label).trim() + ']';
  if (!seen) return base;
  var t = base, n = 1;
  while (seen[t]) { n++; t = base.replace(/\]$/, ' ' + n + ']'); }
  seen[t] = true;
  return t;
}

/** ชีตไหนผูกกับฟอร์ม ชีตไหนไม่ผูก ชีตไหนถามไม่ได้ — แยกสามกองให้ชัด

    เดิมเขียน catch แล้วโยนทิ้งเป็นค่าว่าง ผลคือ "ไม่มีสิทธิ์อ่านฟอร์ม"
    กับ "ชีตนี้ไม่ได้ผูกฟอร์ม" รายงานออกมาหน้าตาเหมือนกันเป๊ะ คือเลข 0
    แล้วคนอ่าน log ก็ไปไล่ผิดทาง */
function formScanSheets_(sheets) {
  var ok = [], noForm = [], fail = [];
  sheets.forEach(function (sh) {
    var url;
    try { url = sh.getFormUrl(); }
    catch (e) { fail.push(sh.getName() + ' — getFormUrl: ' + e.message); return; }
    if (url) ok.push({ sh: sh, url: url });
    else noForm.push(sh.getName());
  });
  return { ok: ok, noForm: noForm, fail: fail };
}

/* ── ตัวสร้างจริง ── */

/** สร้างฟอร์มพารามิเตอร์ใบละเครื่องตามเช็คลิสต์ แล้วผูกคำตอบเข้าไฟล์ PARAM_SHEET_ID
    รันซ้ำได้ — เครื่องที่มีฟอร์มแล้ว (อยู่ในชีต ทะเบียนฟอร์ม) จะถูกข้าม */
function makeParamForms() {
  var cl = paramChecklist_();
  var names = Object.keys(cl);
  if (!names.length) throw new Error('ไม่มีข้อมูลในชีต "' + PARAM_SHEET_CHECK + '" — วาง checklist.csv ก่อน');

  var reg = formReg_(), made = [], skipped = [], noName = [];

  names.forEach(function (mc) {
    if (reg.map[mc]) { skipped.push(mc + ' (มีฟอร์มแล้ว)'); return; }
    var m = cl[mc];
    var form = FormApp.create((m.form ? m.form + ' — ' : '') + mc);
    /* ลงทะเบียนตั้งแต่ยังไม่ใส่ข้อถาม — ถ้าขั้นต่อไปล้ม ฟอร์มใบนี้จะยังอยู่ในทะเบียน
       รันซ้ำแล้วไม่สร้างซ้ำ ของเดิมพังตรงนี้: ล้มที่ setDestination แล้วฟอร์มที่สร้างไปแล้ว
       ไม่ถูกบันทึกไว้ที่ไหนเลย กลายเป็นใบกำพร้าที่คนต้องไปตามลบเอง */
    formRegAdd_(reg, mc, m.form, form.getPublishedUrl(), form.getEditUrl());
    form.setTitle((m.form ? m.form + ' — ' : '') + mc)
        .setDescription('บันทึกค่าพารามิเตอร์ ' + mc +
          (m.code ? ' (ทะเบียน ' + m.code + ')' : '') +
          '\nกรอกตามรอบที่กำหนด · ค่าที่หลุดสเปคให้กรอกตามจริง อย่าปรับให้สวย')
        .setCollectEmail(false)
        .setAllowResponseEdits(false)
        .setProgressBar(true);

    /* สามข้อประจำแถว — ไม่มีสามอันนี้ ระบบอ่านกลับมาแล้วไม่รู้ว่าใครวัด เครื่องไหน กะไหน */
    form.addMultipleChoiceItem().setTitle('เครื่องจักร')
        .setChoiceValues([mc]).setRequired(true);
    form.addTextItem().setTitle('ผู้บันทึก').setRequired(true);
    form.addMultipleChoiceItem().setTitle('กะทำงาน')
        .setChoiceValues(FORM_SHIFTS).setRequired(true);

    var seen = {}, n = 0;
    m.groups.forEach(function (g) {
      var specs = g.fields.map(formItemSpec_);
      var live = specs.filter(function (s) { return s; });
      if (!live.length) return;
      form.addSectionHeaderItem().setTitle(g.group);
      live.forEach(function (sp) {
        var title = formTitle_(g.group, sp.label, seen);
        if (sp.kind === 'choice') {
          form.addMultipleChoiceItem().setTitle(title).setHelpText(sp.help)
              .setChoiceValues(sp.choices);
        } else {
          var it = form.addTextItem().setTitle(title).setHelpText(sp.help);
          if (sp.number) {
            it.setValidation(FormApp.createTextValidation()
              .setHelpText('กรอกเป็นตัวเลข').requireNumber().build());
          }
        }
        n++;
      });
      g.fields.forEach(function (f, i) {
        if (!specs[i] && String(f.label || '').trim() === '') noName.push(mc + ' · ' + g.group);
      });
    });

    /* ผูกคำตอบเข้าไฟล์เดียวกับที่หน้าจออ่าน — ต้องมีสิทธิ์ "แก้ไข" ไฟล์นั้น
       แค่เปิดอ่านได้ไม่พอ ล้มตรงนี้ฟอร์มยังใช้ได้ปกติ แค่คำตอบไปกองใน Forms
       จึงรายงานแล้วไปต่อ ดีกว่าหยุดทั้งรอบแล้วทิ้งเครื่องที่เหลือไว้ครึ่ง ๆ กลาง ๆ */
    var dest = prop_('PARAM_SHEET_ID');
    if (dest) {
      try { form.setDestination(FormApp.DestinationType.SPREADSHEET, dest); }
      catch (e) {
        noName.push(mc + ' — ผูกไฟล์คำตอบไม่ได้ (ขอสิทธิ์แก้ไขไฟล์พารามิเตอร์): ' + e.message);
      }
    }
    made.push(mc + ' — ' + n + ' ข้อ');
  });

  return formLog_('สร้างฟอร์มพารามิเตอร์', made, skipped, noName);
}

/** เพิ่มคำถาม "ผู้ตรวจ" ให้ฟอร์มเช็คชีตที่มีอยู่แล้ว — ใบไหนมีแล้วข้าม
    หาฟอร์มจากชีตคำตอบเอง ไม่ต้องไปตามหา id ทีละใบ */
function addInspectorToCheckForms() {
  var done = [], skip = [];
  var scan = formScanSheets_(checkSS_().getSheets());
  var fail = scan.fail.slice();
  if (scan.noForm.length)
    fail.push('ไม่ได้ผูกกับฟอร์ม: ' + scan.noForm.join(', '));
  scan.ok.forEach(function (x) {
    var sh = x.sh, form;
    /* เปิดฟอร์มไม่ได้ = ไม่ได้เป็นผู้แก้ไขของใบนั้น (อ่านคำตอบได้ไม่ได้แปลว่าแก้ฟอร์มได้)
       พิมพ์ลิงก์ออกมาด้วย ไม่งั้นคนอ่าน log ต้องไปไล่หาฟอร์มเองว่าใบไหน */
    try { form = FormApp.openByUrl(x.url); }
    catch (e) {
      fail.push(sh.getName() + ' — เปิดฟอร์มไม่ได้ ขอสิทธิ์ "ผู้แก้ไข" ของใบนี้: ' + x.url);
      return;
    }

    var has = form.getItems().some(function (it) {
      var t = String(it.getTitle() || '').trim().toLowerCase();
      if (t.indexOf('[') > -1) return false;   // ข้อตรวจ ไม่ใช่คอลัมน์ประจำแถว
      return CHECK_META.by.some(function (w) { return t.indexOf(w.toLowerCase()) > -1; });
    });
    if (has) { skip.push(form.getTitle()); return; }

    form.addTextItem().setTitle('ผู้ตรวจ')
        .setHelpText('ชื่อช่างที่เดินตรวจรอบนี้').setRequired(true);
    done.push(form.getTitle() + ' (' + sh.getName() + ')');
  });
  return formLog_('เพิ่มคำถามผู้ตรวจ', done, skip, fail);
}

/** ค่าหลอกที่ยัดลงแต่ละข้อ — ต้องไม่โดน url-encode ไม่งั้นเทียบกลับไม่ได้ */
function formMark_(i) { return 'zq' + i + 'zq'; }

/** ลิงก์เติมค่าล่วงหน้า -> [ "ชื่อข้อ = entry.123", ... ]
    แยกออกมาเพราะนี่คือส่วนที่พังเงียบได้ ถ้าจับคู่ผิดข้อ ลิงก์ QR จะไปเติมผิดช่อง */
function formEntryPairs_(url, titles) {
  var out = [];
  String(url).split(/[?&]/).forEach(function (p) {
    var kv = p.split('=');
    if (kv[0].indexOf('entry.') !== 0) return;
    var m = /^zq(\d+)zq$/.exec(kv[1] || '');
    if (!m) return;
    var i = Number(m[1]);
    if (titles[i] !== undefined) out.push(titles[i] + ' = ' + kv[0]);
  });
  return out;
}

/** รหัส entry.XXXX ของทุกฟอร์ม พร้อมชื่อข้อที่มันคู่กัน
    เอาไปทำลิงก์เติมชื่อช่างล่วงหน้า ?entry.123=ช่างชล แล้วแปะ QR ไว้ที่เครื่อง */
function formEntryIds() {
  var out = [];
  var dump = function (form, where) {
    var items = form.getItems(FormApp.ItemType.TEXT);
    if (!items.length) return;
    var r = form.createResponse(), titles = [];
    items.forEach(function (it, i) {
      titles.push(it.getTitle());
      r = r.withItemResponse(it.asTextItem().createResponse(formMark_(i)));
    });
    var pairs = formEntryPairs_(r.toPrefilledUrl(), titles);
    out.push(where + ' — ' + form.getTitle() + ':\n    ' + pairs.join('\n    '));
  };

  var scan = formScanSheets_(checkSS_().getSheets());
  scan.fail.forEach(function (m) { out.push('✗ ' + m); });
  scan.ok.forEach(function (x) {
    try { dump(FormApp.openByUrl(x.url), 'เช็คชีต'); }
    catch (e) { out.push('✗ ' + x.sh.getName() + ': ' + e.message); }
  });
  formReg_().rows.forEach(function (r) {
    try { dump(FormApp.openByUrl(r[3]), 'พารามิเตอร์'); } catch (e) {}
  });

  var msg = out.length ? out.join('\n') : 'ยังไม่มีฟอร์มที่มีข้อถามแบบพิมพ์ข้อความ';
  Logger.log(msg);
  return msg;
}

/* ── ทะเบียนฟอร์ม: กันสร้างซ้ำ และเป็นที่เก็บลิงก์ให้คนเอาไปแจกช่าง ── */

function formReg_() {
  var ss = ss_(), sh = ss.getSheetByName(FORM_SHEET_REG);
  if (!sh) {
    sh = ss.insertSheet(FORM_SHEET_REG);
    sh.getRange(1, 1, 1, FORM_REG_HEAD.length).setValues([FORM_REG_HEAD]);
  }
  var rows = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, FORM_REG_HEAD.length).getValues() : [];
  var map = {};
  rows.forEach(function (r) { if (r[0]) map[String(r[0]).trim()] = r; });
  return { sh: sh, rows: rows, map: map };
}

function formRegAdd_(reg, machine, code, url, editUrl) {
  reg.sh.appendRow([machine, code || '', url, editUrl, new Date()]);
  reg.map[machine] = [machine, code || '', url, editUrl];
}

function formLog_(head, done, skip, bad) {
  var NL = '\n';
  var block = function (t, a) {
    return t + ' ' + a.length + (a.length ? ':' + NL + '  ' + a.join(NL + '  ') : '');
  };
  var msg = head + NL + NL + block('ทำแล้ว', done) + NL + NL + block('ข้าม', skip) +
    (bad && bad.length ? NL + NL + block('⚠️ ต้องดูเอง', bad) : '');
  Logger.log(msg);
  return msg;
}
