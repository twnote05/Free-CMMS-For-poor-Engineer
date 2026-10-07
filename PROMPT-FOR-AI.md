# พรอมพ์สำหรับให้ AI ช่วยติดตั้ง

**ไทย** · [English below](#english)

ถ้าคุณใช้ **Claude Code / Codex / Cursor / Gemini CLI** — ไม่ต้องใช้ไฟล์นี้
เครื่องมือพวกนั้นอ่าน [AGENTS.md](AGENTS.md) เองอยู่แล้ว แค่เปิดโฟลเดอร์นี้แล้วบอกว่าจะทำอะไร

ไฟล์นี้มีไว้สำหรับ **AI แบบแชท** (ChatGPT, Gemini, Claude บนเว็บ) ที่คุณต้องก๊อปข้อความไปวางเอง

---

## วิธีใช้

1. ก๊อปข้อความในกรอบข้างล่างไปวางในแชท
2. แนบ **เฉพาะไฟล์ที่มันขอ** — อย่าลากทั้งโฟลเดอร์ใส่ ไฟล์โค้ดบางตัวยาวห้าพันบรรทัด แนบไปมันจะอ่านผ่าน ๆ แล้วเดา
3. ทำตามทีละขั้น

---

```
ผมจะติดตั้งระบบจาก repo ชื่อ Free-CMMS-For-poor-Engineer
มันเป็นเครื่องมือโรงงาน 3 ตัวที่รันบน Google Apps Script + Google Sheets

  cmms/          ระบบแจ้งซ่อม PM เช็คชีตประจำวัน
  stock/         ระบบคลังอะไหล่ เครื่องมือ ใบมีด
  wi-generator/  ตัวสร้างเอกสารโรงงาน (ไฟล์ HTML เดียว ไม่ต้องติดตั้ง)

ผมจะติดตั้ง: <ใส่ชื่อโฟลเดอร์ที่จะทำ>

สิ่งที่ผมอยากให้คุณทำ
- พาผมติดตั้งทีละขั้นตามไฟล์ docs/SETUP.th.md ของโฟลเดอร์นั้น
- ถามผมทีละคำถาม รอคำตอบก่อนค่อยไปขั้นต่อไป อย่ายิงรวดเดียวจบ
- ขั้นไหนที่ผมต้องเป็นคนกดเอง ให้บอกตรง ๆ ว่าต้องกดอะไรที่ไหน
  แล้วรอให้ผมบอกว่าเสร็จ อย่าทำเป็นว่าทำให้แล้ว
- ถ้าต้องดูโค้ด บอกชื่อไฟล์กับฟังก์ชันที่อยากดู ผมจะก๊อปให้เฉพาะส่วนนั้น

สิ่งที่คุณทำแทนผมไม่ได้ (ต้องเป็นผมเท่านั้น)
- สร้าง Google Sheet และโฟลเดอร์ใน Drive
- สร้างโปรเจค Apps Script และกดอนุญาตสิทธิ์
- ใส่ค่าใน Script Properties
- กด Deploy และเลือกสิทธิ์การเข้าถึง
- ทดสอบบนมือถือ

กฎที่ห้ามแนะนำให้ผมฝืน
- ห้ามเสนอให้ย้ายไป SQL / Firebase / ระบบสำเร็จรูป — ไม่มีงบและไม่มีคนดูแล
- ห้ามเสนอให้เปลี่ยนจาก PIN ไปใช้ Google OAuth — ช่างยืมมือถือกันใช้ หลายคนไม่มีบัญชีบริษัท
- คอลัมน์ 1-9 ของชีต Users ห้ามสลับลำดับ ถ้าผมใช้ cmms กับ stock คู่กัน
- UI เป็นภาษาไทย ข้อความฝังในโค้ด ไม่ต้องเสนอให้แยกไฟล์ภาษา

เริ่มจากถามผมว่าตอนนี้ไปถึงขั้นไหนแล้ว แล้วค่อยไปต่อจากตรงนั้น
```

---

## ถ้าติดปัญหาแทนที่จะติดตั้ง

```
ระบบ <cmms / stock / wi-generator> ของผมมีอาการแบบนี้: <อธิบายอาการ>

ก่อนจะเดาสาเหตุ ช่วยถามผมก่อนว่า
- เพิ่งแก้โค้ดแล้ว deploy หรือยัง (push ไม่ใช่ deploy)
- เพิ่งแก้ชีตแล้วล้างแคชหรือยัง
- รันตัวตรวจแล้วได้อะไร — cmms ใช้ dataIssues() และ sourceAudit()

ในไฟล์ docs/RUNBOOK.md ของโฟลเดอร์นั้นมีตารางอาการเสียที่เจอบ่อยอยู่แล้ว
ลองเทียบกับตารางนั้นก่อน ผมก๊อปมาให้ได้ถ้าต้องการ
```

---

<a name="english"></a>

# Prompt for handing this to an AI

**English** · [ไทย above](#พรอมพ์สำหรับให้-ai-ช่วยติดตั้ง)

Using **Claude Code / Codex / Cursor / Gemini CLI**? Skip this file. Those read [AGENTS.md](AGENTS.md) on their own — just open this folder and say what you want.

This is for **chat AIs** where you paste text yourself.

Attach only the files it asks for. Some source files are five thousand lines; dumping the whole folder makes it skim and guess.

```
I am installing a system from a repository called Free-CMMS-For-poor-Engineer.
It holds three factory tools that run on Google Apps Script + Google Sheets:

  cmms/          maintenance requests, PM, daily checklists
  stock/         spare parts, tools, blades
  wi-generator/  factory document generator (a single HTML file, nothing to install)

I am installing: <folder name>

What I want from you
- Walk me through docs/SETUP.md for that folder, one step at a time
- Ask one question, wait for my answer, then move on. Do not dump everything at once
- When a step is mine to do, say so plainly, tell me exactly what to click,
  and wait for me to confirm. Do not pretend you did it
- If you need to see code, name the file and function and I will paste that part

What you cannot do for me
- Create the Google Sheet and Drive folder
- Create the Apps Script project or grant OAuth consent
- Set Script Properties
- Press Deploy and choose access
- Test anything on a phone

Constraints you must not argue me out of
- No SQL, Firebase, or off-the-shelf CMMS — no budget, nobody to maintain it
- No Google OAuth instead of PIN login — technicians share phones and many
  have no company account
- Users sheet columns 1-9 must keep their order if I run cmms and stock together
- The UI is Thai with strings inline in the code. Do not propose extracting them

Start by asking where I have got to, then continue from there.
```
