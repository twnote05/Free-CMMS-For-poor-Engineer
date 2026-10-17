# -*- coding: utf-8 -*-
# Free CMMS for poor engineers — https://github.com/twnote05/Free-CMMS-For-poor-Engineer
# Required Notice: Copyright 2026 IE จอมขี้เกียจ
# PolyForm Noncommercial 1.0.0 — ห้ามใช้เชิงพาณิชย์ · ดู LICENSE.md
"""ดึงป้ายชื่อ (TEXT / MTEXT) จากแปลน CAD ที่เซฟเป็น DXF พร้อมพิกัดเป็นเมตร — ไว้วางเครื่องในผังโรงงาน

ใช้แต่ไลบรารีมาตรฐานของ Python อ่านแบบสตรีมทีละบรรทัด ไฟล์ร้อยเมกก็ไม่กินแรม

  python dxf_labels.py แปลน.dxf --origin 100000 50000 --scale 0.001
  python dxf_labels.py แปลน.dxf --origin 100000 50000 --scale 0.001 --grep "mix|pack|cool"

  --origin X Y   พิกัดใน DXF ของ "มุมซ้ายบนของอาคาร" — จุดนี้จะกลายเป็น (0,0) ของผัง
                 หาได้จากเส้นขอบอาคาร: เปิดใน CAD แล้วอ่านพิกัดมุมซ้ายบน (DXF แกน y ชี้ขึ้น ผังชี้ลง)
  --scale S      หน่วย DXF -> เมตร (มิลลิเมตร = 0.001 · เซนติเมตร = 0.01 · เมตร = 1)
  --grep REGEX   แสดงเฉพาะป้ายที่ตรง (ไม่สนตัวเล็กใหญ่)

ผลลัพธ์: บรรทัดละป้าย  "x  y  ข้อความ"  ตรงกับช่อง x y ใน LAYOUT ของ plant_layout.html ได้เลย
ตรวจจุดอ้างอิงก่อนใช้จริง: ป้ายเส้นบอกระยะความกว้างอาคารควรตกอยู่กลางผนังด้านนั้น ถ้าเลื่อน = origin ผิด

ข้อจำกัด: อ่านเฉพาะป้ายที่วางตรง ๆ ในแปลน ป้ายที่ซ่อนอยู่ในบล็อก (BLOCK/INSERT) จะไม่ขึ้น
           ถ้าป้ายหาย ใน CAD ให้ Explode บล็อกนั้นก่อนเซฟ DXF
"""
import argparse, io, re, sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def clean(t):
    t = re.sub(r"\\[A-Za-z][^;]*;", "", t)                 # \fArial|b0;  \C2;  \H0.8x; ฯลฯ
    t = t.replace("{", "").replace("}", "").replace("\\P", " ").replace("^J", " ")
    return re.sub(r"\s+", " ", t).strip()


def labels(path):
    f = io.open(path, encoding="utf-8", errors="replace")
    in_entities, ent, d = False, None, {}
    expect_sect = False

    def done():
        if in_entities and ent in ("TEXT", "MTEXT") and "t" in d and "x" in d and "y" in d:
            yield d["x"], d["y"], clean(d["t"])

    while True:
        code = f.readline()
        val = f.readline()
        if not val:
            break
        code, val = code.strip(), val.rstrip("\r\n")
        if code == "0":
            yield from done()
            ent, d = val, {}
            expect_sect = val == "SECTION"
            if val == "ENDSEC":
                in_entities = False
        elif expect_sect and code == "2":
            in_entities = val == "ENTITIES"        # แปลนจริงอยู่ใน ENTITIES ส่วน BLOCKS เป็นพิกัดท้องถิ่น
            expect_sect = False
        elif ent in ("TEXT", "MTEXT"):
            try:
                if code == "10" and "x" not in d:
                    d["x"] = float(val)
                elif code == "20" and "y" not in d:
                    d["y"] = float(val)
            except ValueError:
                pass
            if code in ("1", "3"):                 # MTEXT ยาวถูกแบ่งเป็นหลายท่อน (3 ... 3 แล้วจบด้วย 1)
                d["t"] = d.get("t", "") + val
    yield from done()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dxf")
    ap.add_argument("--origin", nargs=2, type=float, required=True, metavar=("X", "Y"))
    ap.add_argument("--scale", type=float, default=0.001)
    ap.add_argument("--grep", default="")
    a = ap.parse_args()
    ox, oy = a.origin
    rx = re.compile(a.grep, re.I) if a.grep else None
    rows = []
    for x, y, t in labels(a.dxf):
        if not t or re.fullmatch(r"[0-9.,\sxX]+", t):          # ตัวเลขบอกระยะเปล่า ๆ ไม่ใช่ชื่อ
            continue
        if rx and not rx.search(t):
            continue
        rows.append(((x - ox) * a.scale, (oy - y) * a.scale, t))
    rows.sort(key=lambda r: (round(r[1]), r[0]))
    for x, y, t in rows:
        print("%8.1f %8.1f  %s" % (x, y, t))
    print("# %d ป้าย" % len(rows), file=sys.stderr)


if __name__ == "__main__":
    main()
