# BidNest — Auction & Marketplace

Group Project (5 developers อ้างอิงจากไฟล์ Team-role-distribution)

**อย่าเปลี่ยน tech stack และอย่าเปลี่ยน schema โดยไม่ถาม**

## ให้อ้างอิงข้อมูลจากไฟล์ SRS และ Team-role-distribution เป็นหลัก

## กติกาการทำงาน

- ตอบและอธิบายเป็นภาษาไทย
- อธิบายโค้ดที่แก้ทุกครั้ง (แก้อะไรไป ตำแหน่งไหน) เพื่อให้คนในทีมรับทราบ
- ชื่อ branch: `feat/<module>-dev<เลข>` เช่น `feat/auth-dev2`, `feat/frontend-dev1`, `feat/ecommerce-dev3`, `feat/auction-dev4`, `feat/ai-dev5`
- ห้าม commit ไฟล์ `.env` หรือ hardcode secret/API key ลงในโค้ดเด็ดขาด

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

- SRS: `docs\requirements\BidNest-Auction and Marketplace-v4.pdf`
- ER Diagram: `docs\architecture\erd\bidnest-erd-v1.dbml` หรือ link: https://dbdiagram.io/d/BidNest-6a803e3ee093539a9ebf8fff
- Database schema: `apps\api\prisma\schema.prisma`
- Kickoff Guide: `docs\KICKOFF_GUIDE.md` (ชื่อ branch แต่ละคน, ขั้นตอน setup, CI/CD)
- Figma: coming soon

## ระยะเวลาทำโปรเจค 14 วัน

- มีการใช้ Jira ในการควบคุมการทำงานในทีม (Coming soon)
