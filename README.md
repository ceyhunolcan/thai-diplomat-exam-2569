# เตรียมสอบนักการทูต ภาค ก 2569

[เปิดชุดฝึกและข้อสอบจำลอง](https://ceyhunolcan.github.io/thai-diplomat-exam-2569/)

- 1,048 ข้อฝึก รวม 39 ชุดฝึกและชุดอ้างอิงเพิ่มเติม ค้นหาด้วยชื่อหัวข้อหรือคำสำคัญ แล้วกรองระดับหรือวิชาได้
- ข้อสอบฝึกไม่จับเวลา 7 ชุด และข้อสอบจับเวลาอีก 2 ชุด ชุดละ 60 ข้อใหม่ แบ่งความรู้ทั่วไป 120 นาที และ English 90 นาที แต่ละวิชาเริ่มเมื่อตกลงเริ่ม และเวลานับต่อเมื่อออกจากหน้า
- กลับมาทำข้อสอบต่อในเบราว์เซอร์เดิม ดูคะแนนแยกวิชา ทำเฉพาะข้อที่พลาดอีกครั้ง หรือฝึกจากคลังรวมข้อที่พลาด
- ดาวน์โหลด [index.html](index.html) เพื่อใช้งานออฟไลน์ การบันทึกจากไฟล์ขึ้นอยู่กับเบราว์เซอร์

ชุดฝึกเป็นคำถามแต่งตามขอบเขตใน [ประกาศกระทรวงการต่างประเทศ](https://www.mfa.go.th/th/content/สอบนักการทูต2569) ข้อสอบจับเวลามีคลังข้อสอบแยกและจำนวนข้อสำหรับฝึก ผลสอบแยกเวลาและหัวข้อพร้อมชุดฝึกที่ตรงกับจุดอ่อน

## When to add a new set

If she has unused mocks, review missed questions and use the next mock to check whether the same gaps recur. Add a short, targeted practice set when a topic keeps coming up in her mistakes. Add a fresh mixed mock once she has worked through the existing mocks and needs another assessment with unfamiliar questions. Update current-affairs questions when their facts change.

## How to publish a set

1. Add a file in [content/sets](content/sets/), following [the first set](content/sets/01.json). Assign a new set ID, a Thai title, and level `1` (foundation), `2` (applied), or `3` (advanced). Each question needs a unique ID beginning with the set ID, a subject (`th` or `en`), three choices, an answer that matches one choice, and a short explanation. Reading questions can use a `passage` field. Add `tags` to a set for useful search terms. Cite Thai factual questions using keys from [content/sources.json](content/sources.json).
2. For a new mock, append an entry to [content/mocks.json](content/mocks.json) with a new mock ID and the question IDs in display order. Include both subjects. Keep the current mock entries and question IDs so existing drafts and history can still resolve them. Use fresh questions for a new assessment.
3. For a timed mock, add unique, assessment-only questions in [content/assessments](content/assessments/), label them with keys from [content/topics.json](content/topics.json), and add the matching mock in `mocks.json`. Use the Thai section first and the English section second. Keep the two sections balanced.
4. Run `python3 build.py`, then `python3 build.py --check`. Open the generated `index.html` and try the new set. Commit the content files and generated `index.html` and push to `main`. GitHub Pages publishes that branch.

The build requires Python 3 and its standard library. The published page is self-contained. Progress is stored on the browser and site she uses, with no account or cross-device sync.
