# Dev 4 — Commit & PR Workflow (แม่แบบ slash command)

> **เจ้าของแนวทาง:** Dev 4 (Auction Module & Real-time)
> **ไฟล์นี้คืออะไร:** สำเนาของ slash command ส่วนตัว `/commit` ที่ใช้อยู่จริง เอาขึ้น repo ไว้เป็น **แม่แบบให้เพื่อนในทีมก็อปไปปรับเป็นของตัวเอง**
> **ไม่ใช่กติกาทีม** — กติกาที่ทั้งทีมยึดร่วมกันอยู่ใน `CLAUDE.md` เท่านั้น ไฟล์นี้เป็นแนวทางส่วนบุคคล ปรับได้ตามใจ
> **ใช้คู่กับ:** [`dev4-auction-workflow.md`](./dev4-auction-workflow.md) — ไฟล์นั้นครอบ **build + test** ไฟล์นี้ครอบ **ship**
> **อ้างอิง:** `CLAUDE.md` หัวข้อ "Commit message" และ "PR step"

---

## ทำไมแยกเป็นคนละ command

`/dev4` กับ `/commit` ต่อกันเป็น cycle เดียว แต่แยกไฟล์กัน:

| | `/dev4` | `/commit` |
|---|---|---|
| ขอบเขต | build + test | ship |
| ทำอะไร | อ่าน SRS → ทำ requirement ทีละข้อ → เทสตามเกณฑ์การยอมรับ → รายงานผลจริง | ตรวจสถานะ git → ร่าง commit → push → เช็ค PR ค้าง → ประกอบ URL ฟอร์ม PR |
| จบที่ | "พร้อม commit หรือยัง?" | ส่ง URL ให้ผู้ใช้กด Create PR เอง |

เหตุผลที่ไม่ยัดรวมไฟล์เดียว: ขั้นตอน ship ใช้ซ้ำได้กับงานทุกชนิด ไม่ใช่แค่ requirement ฝั่ง auction
และถ้าเขียนขั้นตอน commit ไว้สองที่ พอแก้ที่หนึ่งแล้วลืมอีกที่ สองไฟล์จะเพี้ยนกัน
`/dev4` เลยชี้มาที่ `/commit` แทนที่จะอธิบายวิธี commit ซ้ำเอง

## วิธีนำไปใช้

1. สร้างไฟล์ `.claude/commands/commit.md` ในเครื่องตัวเอง
2. ก็อปเนื้อหาในบล็อกข้างล่างไปวาง แล้วแก้ให้ตรงกับสภาพแวดล้อมของตัวเอง
   - คำสั่งในบล็อกเป็น **PowerShell** (Windows) ถ้าใช้ macOS/Linux ให้แปลงเป็น bash
   - base branch ในไฟล์นี้ล็อกไว้ที่ `dev` ตาม `CLAUDE.md` — อย่าเปลี่ยนเป็น `main`
   - ตารางอ่านสถานะ A/B ในขั้นที่ 1 เป็นหัวใจของไฟล์นี้ อย่าตัดทิ้ง
3. เรียกใช้ด้วย `/commit <requirement-id>` เช่น `/commit AUC-003`

`.gitignore` กัน `.claude/*` ไว้แล้ว ไฟล์ command ในเครื่องตัวเองจะไม่ขึ้น git และไม่กระทบใคร

---

## เนื้อหาแม่แบบ (ก็อปทั้งบล็อก รวม frontmatter)

> บล็อกข้างล่างใช้ **4 backtick** ครอบ เพราะข้างในมีบล็อกโค้ด ``` ซ้อนอยู่
> ตอนก็อปให้เอาเฉพาะข้างในบรรทัด ```` ออกมา

````markdown
---
description: commit + push งานที่ทำอยู่ แล้วส่ง URL เปิด PR ที่กรอก title/description ไว้ให้แล้ว
---

# /commit — commit, push, แล้วส่ง URL เปิดฟอร์ม PR ที่กรอกไว้ให้แล้ว

ใส่ requirement id เป็น argument ได้ เช่น `/commit AUC-002`
ถ้าไม่ใส่ ให้เดาจาก diff แล้วถามยืนยันในขั้นที่ 3

> **ห้ามกดสร้างหรือ merge PR ให้เองเด็ดขาด** (CLAUDE.md หัวข้อ PR step)
> คำสั่งนี้จบที่ "ส่ง URL ให้ผู้ใช้กดเอง" เท่านั้น — ห้ามเรียก `gh pr create`,
> `gh pr merge` หรือ `git merge` เข้า dev/main ไม่ว่ากรณีใด

---

## ขั้นที่ 1 — สำรวจสถานะก่อน

```powershell
git fetch --prune origin
$branch = git branch --show-current
$branch
git status --short
git log --oneline "origin/$branch..HEAD"   # A — ค้าง push จริงไหม
git log --oneline origin/dev..HEAD         # B — มีอะไรให้เปิด PR ไหม
```

**ต้องมี `--prune`** — GitHub ลบ branch ทิ้งอัตโนมัติหลัง merge PR แต่ `git fetch` เปล่าๆ
ไม่ลบ remote-tracking ref ที่ตายแล้วออก ทำให้ `origin/$branch` ยังชี้ commit เก่าค้างอยู่
แล้ว A จะรายงานว่า "มี commit ค้าง push" เทียบกับ branch ที่ไม่มีอยู่บน remote แล้ว

A กับ B ตอบคนละคำถาม อย่าใช้ตัวเดียววัดสองเรื่อง — ถ้า push แล้วแต่ PR ยังไม่ merge
A จะว่าง (ไม่ต้อง push ซ้ำ) แต่ B ไม่ว่าง (ยังมีของรอเข้า dev)

ถ้า `origin/$branch` ไม่มีบน remote (branch ใหม่ หรือถูกลบไปหลัง merge) คำสั่ง A จะ error
ให้ถือว่า "ยังไม่เคย push" แล้วดู B อย่างเดียวว่ามีอะไรให้เปิด PR ไหม

แล้วอ่าน diff จริงด้วย `git diff` และ `git diff --staged`

**หยุดทันทีถ้าเจอกรณีเหล่านี้** (บอกเหตุผลแล้วจบ อย่าทำต่อ):

- อยู่บน branch `main` หรือ `dev` — งานต้องอยู่บน `feat/<module>-dev<เลข>`
- มี `.env`, key, token หรือ secret อยู่ใน diff — เตือนแล้วให้ผู้ใช้เอาออกก่อน

**ถ้า working tree ไม่สะอาด** → ไปขั้นที่ 2 ตามปกติ

**ถ้า working tree สะอาด** ให้ดู A กับ B ประกอบกัน — **B คือตัวตัดสินว่ามี PR ให้ทำไหม**:

| A (ค้าง push) | B (รอเข้า dev) | แปลว่า | ทำอะไรต่อ |
|---|---|---|---|
| ว่าง | ว่าง | ไม่มีอะไรเลย | บอกว่าไม่มีอะไรให้ทำ แล้วจบ |
| ไม่ว่าง | ว่าง | branch ถูก ff ไปที่ dev หลัง PR merge แล้ว | **ไม่มี PR ให้ทำ** เสนอ `git push origin <branch>` เพื่อ sync remote ให้ตรง (ไม่บังคับ) แล้วจบ |
| ว่าง | ไม่ว่าง | push แล้ว รอเปิด/อัปเดต PR | ข้ามไปขั้นที่ 5 |
| ไม่ว่าง | ไม่ว่าง | มีของค้าง push | ข้ามไปขั้นที่ 4 แล้วต่อขั้นที่ 5 |

แถวที่สองคือกับดัก: A ไม่ว่างชวนให้คิดว่ามีงานค้าง ทั้งที่จริงๆ commit พวกนั้นเข้า dev
ไปแล้วผ่าน PR ที่ merge ไปเรียบร้อย ถ้าดู A อย่างเดียวจะไปยิง URL สร้าง PR เปล่าที่ไม่มี diff

ก่อนจบทุกกรณี ถ้า `git rev-list --count HEAD..origin/dev` > 0 ให้บอกว่า branch ตามหลัง dev
อยู่กี่ commit แล้วเสนอ `git merge --ff-only origin/dev` ก่อนเริ่มงานใหม่

## ขั้นที่ 2 — ร่างแผน commit

รูปแบบข้อความตาม CLAUDE.md: `<type>(<requirement-id>): <คำอธิบายภาษาอังกฤษสั้นๆ>`

- type: `feat` / `fix` / `refactor` / `test` / `docs` / `chore` / `ci`
- requirement-id ใส่เมื่อตรงกับ requirement ใน SRS โดยตรง งาน infra ทั่วไปข้ามได้
- ข้อความเป็นภาษาอังกฤษเสมอ

**ถ้า diff คร่อมงานหลายชนิด ให้เสนอแยก commit** เช่น โค้ดฟีเจอร์กับไฟล์เทส/เอกสาร
คนละ commit — บอกให้ชัดว่าไฟล์ไหนอยู่ commit ไหน อย่ายัดรวมกันเพราะขี้เกียจ

body ของ commit เขียนเมื่อมีอะไรที่ diff ไม่ได้บอก (เหตุผลของการตัดสินใจ, ทางที่ไม่เลือกและเพราะอะไร)
ถ้า diff อธิบายตัวเองได้อยู่แล้วก็เอาแค่บรรทัดเดียวพอ

## ขั้นที่ 3 — ยืนยันครั้งที่ 1

ใช้ AskUserQuestion ถามว่าจะ commit ตามแผนนี้ไหม ตัวเลือกอย่างน้อย:

- ตกลง commit + push ตามนี้
- ขอแก้ข้อความก่อน
- ขอแบ่ง commit ใหม่

**รอคำตอบจริงเสมอ ห้ามเดาว่าผู้ใช้ตอบตกลง**

## ขั้นที่ 4 — commit แล้ว push

- `git add` ให้**ระบุ path ตรงๆ** ห้ามใช้ `git add -A` หรือ `git add .`
- commit message หลายบรรทัดใช้ here-string (`@'` … `'@` ปิดที่คอลัมน์ 0)
- ถ้า pre-commit hook (husky/lint-staged) แก้ไฟล์หรือ fail ให้รายงานตามจริง อย่าใช้ `--no-verify`

**เช็ค dev ซ้ำอีกครั้งก่อน push** — ขั้นที่ 1 เช็คไปแล้วก็จริง แต่ระหว่างที่ร่าง
commit message, รอผู้ใช้ยืนยัน และรันเทส เวลาผ่านไปหลายนาที คนอื่นอาจ merge PR
เข้า dev ไปแล้ว:

```powershell
git fetch --prune origin
git rev-list --count HEAD..origin/dev
```

**ถ้าไม่ใช่ 0 ให้หยุดแล้วบอกผู้ใช้ก่อน** อย่าเพิ่ง push — ต้อง merge dev เข้ามา
แล้วรันเทสใหม่ ไม่งั้น PR จะพาของเก่าที่คนอื่นเพิ่งลบ/แก้ กลับเข้า dev

เคยเกิดจริง (21 ส.ค. 2026): push งาน BID-004 ไปตอนที่ตัวเลขยังเป็น 0 แต่ระหว่างนั้น
Dev 3 merge PR #54 ที่ลบ `apps/web/pnpm-lock.yaml` ทิ้ง ทำให้ branch ยังพาไฟล์ที่ถูก
ลบไปแล้วติดไปด้วย ถ้า merge PR นั้นก็จะเอา lockfile ซ้ำกลับเข้า dev โดยไม่มีใครตั้งใจ

> **ข้อนี้ยังไม่มีใน `dev2-commit-workflow.md` และ `dev3-commit-workflow.md`**
> ทั้งสามไฟล์สืบทอดต้นแบบเดียวกันจึงมีช่องโหว่เดียวกัน — Dev 2 กับ Dev 3
> เจอเคสนี้ได้เหมือนกัน ใครสนใจก็ก็อปบล็อกนี้ไปใส่ของตัวเองได้เลย

- push: `git push origin <branch>` (ครั้งแรกของ branch ใช้ `git push -u origin <branch>`)

ถ้ามาที่ขั้นนี้ทั้งที่ไม่มีอะไรจะ commit (มาจากตารางในขั้นที่ 1) ให้ **push อย่างเดียว**
ข้ามขั้นที่ 2 กับ 3 ไปได้เลย เพราะไม่มี commit message ให้ยืนยัน — แต่ยัง**ต้องเช็ค
dev ซ้ำก่อน push อยู่ดี**

## ขั้นที่ 5 — เช็คก่อนว่ามี PR เปิดค้างอยู่แล้วหรือยัง

```powershell
gh pr list --head (git branch --show-current) --base dev --state open --json number,url
```

**ถ้ามี PR เปิดอยู่แล้ว** → ไม่ต้องทำ URL ใหม่ เพราะ push เมื่อกี้อัปเดตเข้า PR เดิมให้แล้ว
ส่ง URL ของ PR เดิมให้ผู้ใช้ พร้อมสรุปว่า commit รอบนี้เพิ่มอะไรเข้าไป แล้วจบ

**ถ้ายังไม่มี** → ไปขั้นที่ 6

## ขั้นที่ 6 — ร่าง PR title + description แล้วยืนยันครั้งที่ 2

เป็นภาษาอังกฤษทั้งคู่ (ตาม CLAUDE.md) และต้องสอดคล้องกับสิ่งที่แก้จริง

โครง description ที่ใช้ได้ดี:

```markdown
## What
<ทำอะไร — ถ้ามี endpoint ใหม่ ใส่ตาราง method/path>

## Why
<requirement id + เกณฑ์การยอมรับข้อไหนที่ตอบ>

## Decisions worth a second pair of eyes
<จุดที่คนรีวิวควรเถียงได้ — ทางที่เลือกและเหตุผล>

## Testing
<ตารางผลเทสตามจริง ผ่านกี่ข้อ ชุดไหน>

## Not covered here
<สิ่งที่ยังไม่ได้ทำและเพราะอะไร>
```

แล้วใช้ AskUserQuestion ยืนยัน: ตกลง / ขอแก้ title / ขอแก้ description — **รอคำตอบ**

## ขั้นที่ 7 — ประกอบ URL แล้วส่งให้ผู้ใช้

base ต้องเป็น `dev` เสมอ ไม่ใช่ `main`

```powershell
$branch = git branch --show-current
$slug = ((git remote get-url origin) -replace '^.*github\.com[:/]', '') -replace '\.git$', ''

$title = 'feat(AUC-002): ...'
$body = @'
## What
...
'@

$url = "https://github.com/$slug/compare/dev...$branch" +
       "?expand=1&title=" + [uri]::EscapeDataString($title) +
       "&body=" + [uri]::EscapeDataString($body)

$url.Length
$url
```

หมายเหตุ:

- **อย่า encode ชื่อ branch** — GitHub รับ `/` ใน path ของ compare อยู่แล้ว (`dev...feat/auction-dev4`)
- encode เฉพาะ `title` กับ `body` ด้วย `[uri]::EscapeDataString()` ขึ้นบรรทัดใหม่จะกลายเป็น `%0A` เอง
- **ถ้า `$url.Length` เกิน 8000** GitHub จะตอบ 414 ให้ตัด description เหลือเฉพาะ What กับ Testing
  แล้วบอกผู้ใช้ตามตรงว่าตัดอะไรออก พร้อมพิมพ์ description ฉบับเต็มไว้ในแชทให้ copy วางเองได้

ปิดท้ายด้วยการพิมพ์ URL เป็นบรรทัดเดี่ยวๆ (ให้คลิกได้) แล้วเตือนสองเรื่อง:

1. ตรวจว่า base เป็น `dev` — GitHub มักตั้ง default เป็น `main`
2. อ่าน title/description ที่กรอกมาให้ก่อนกด **Create pull request**
````
