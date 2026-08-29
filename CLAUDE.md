# BidNest — Auction & Marketplace

Group Project (5 developers อ้างอิงจากไฟล์ Team-role-distribution)

**อย่าเปลี่ยน tech stack และอย่าเปลี่ยน schema โดยไม่ถาม**

## ให้อ้างอิงข้อมูลจากไฟล์ SRS และ Team-role-distribution เป็นหลัก

## Git commits

Do NOT add "Co-Authored-By: Claude" or "Claude-Session:" trailer to commit messages.

## กติกาการทำงาน

- ตอบและอธิบายเป็นภาษาไทย
- อธิบายโค้ดที่แก้ทุกครั้ง (แก้อะไรไป ตำแหน่งไหน) เพื่อให้คนในทีมรับทราบ
- ชื่อ branch: `feat/<module>-dev<เลข>` เช่น `feat/auth-dev2`, `feat/frontend-dev1`, `feat/ecommerce-dev3`, `feat/auction-dev4`, `feat/ai-dev5`
- ห้าม commit ไฟล์ `.env` หรือ hardcode secret/API key ลงในโค้ดเด็ดขาด

## แนวทางส่วนตัวของแต่ละคน — อย่าแก้ไฟล์นี้

ไฟล์ `CLAUDE.md` นี้เป็น **กติกาที่ทั้งทีมยึดร่วมกัน** ทุกคนควรได้พฤติกรรมพื้นฐานเหมือนกัน จึงตั้ง CODEOWNERS ไว้ — เสนอแก้ได้ปกติผ่าน PR แต่ต้องตกลงกับทีมก่อน merge

ถ้าอยากเพิ่มขั้นตอนหรือแนวทางเฉพาะของตัวเอง (เช่น ลำดับ requirement ที่ตัวเองรับผิดชอบ, วิธีเทสที่ถนัด, สไตล์การเขียนโค้ดส่วนตัว) **ให้สร้างเป็น slash command ส่วนตัวแทน:**

```
.claude/commands/<ชื่อที่อยากเรียก>.md
```

แล้วเรียกใช้ด้วย `/<ชื่อนั้น>` ตอนคุยกับ Claude Code

`.gitignore` กัน `.claude/*` ไว้แล้ว ไฟล์จะอยู่แค่เครื่องตัวเอง **ไม่ขึ้น git และไม่กระทบใคร** ต่างคนต่างมีแนวทางของตัวเองได้เต็มที่โดยไม่ต้องแตะไฟล์นี้

## Commit message

รูปแบบ: `<type>(<requirement-id>): คำอธิบายภาษาอังกฤษสั้นๆ`

- type: `feat` / `fix` / `refactor` / `test` / `docs` / `chore` / `ci`
- requirement-id: ใส่เมื่อ commit ตรงกับ requirement ใน SRS โดยตรง (เช่น `AUTH-001`, `PROD-005`) ข้ามได้ถ้าเป็นงาน infra ทั่วไปที่ไม่ผูกกับ requirement ไหน
- ตัวอย่าง: `feat(AUTH-001): add local registration endpoint`
- commit message เป็นภาษาอังกฤษเสมอ (เหมือน PR title/description)

## PR step

- base branch ต้องเป็น `dev` เสมอ (ไม่ใช่ `main` โดยตรง)
- หลังจากที่มีการ commit ผ่านแล้ว ให้สร้าง title PR และ PR description (เป็นภาษาอังกฤษ) ให้มีความสอดคล้องกันกับสิ่งที่ทำหรือแก้ไข กรอกในแบบฟอร์ม PR ให้ผู้ใช้เป็นคนรีวิวและกด confirm PR เอง ห้ามกดให้

## เอกสารประกอบ

- SRS: `docs\requirements\BidNest-Auction and Marketplace-v7.pdf`
- ER Diagram: `docs\architecture\erd\bidnest-erd-v1.dbml` หรือ link: https://dbdiagram.io/d/BidNest-6a803e3ee093539a9ebf8fff
- Database schema: `apps\api\prisma\schema.prisma`
- ADR (บันทึกการตัดสินใจเชิงสถาปัตยกรรม): `docs\architecture\adr\`
- ผัง Workflow (ภาพรวมระบบ + ผังรายฟีเจอร์ วาดจากโค้ดจริง): `docs\architecture\workflows\`
- Kickoff Guide: `docs\KICKOFF_GUIDE.md` (ชื่อ branch แต่ละคน, ขั้นตอน setup, CI/CD)
- Figma: https://www.figma.com/design/XjSmZZgT0IBPc8do84WaRa/Bidnest?node-id=57-6305&t=7Q2cpzBvbxZK0oHj-1

## ระยะเวลาทำโปรเจค 14 วัน

- มีการใช้ Jira ในการควบคุมการทำงานในทีม : https://pitchayauds.atlassian.net/jira/software/projects/BN/boards/2?filter=&groupBy=none&atlOrigin=eyJpIjoiMzQzMmE4NDkzMWU4NGUwYWEwYzRmYWU0ZGJlZDlhYTIiLCJwIjoiaiJ9
