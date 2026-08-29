# Dev 3 — Commit & PR Workflow (แม่แบบ slash command, bash/macOS)

> **เจ้าของแนวทาง:** Dev 3 (E-Commerce Module)
> **ไฟล์นี้คืออะไร:** สำเนาของ slash command ส่วนตัว `/commit` ที่ใช้อยู่จริง เอาขึ้น repo ไว้เป็น **แม่แบบให้เพื่อนในทีมก็อปไปปรับเป็นของตัวเอง**
> **ไม่ใช่กติกาทีม** — กติกาที่ทั้งทีมยึดร่วมกันอยู่ใน `CLAUDE.md` เท่านั้น ไฟล์นี้เป็นแนวทางส่วนบุคคล ปรับได้ตามใจ
> **ใช้คู่กับ:** [`dev3-ecommerce-workflow.md`](./dev3-ecommerce-workflow.md) — ไฟล์นั้นครอบ **build + test** ไฟล์นี้ครอบ **ship**
> **อ้างอิง:** `CLAUDE.md` หัวข้อ "Commit message" และ "PR step"

---

## ต่างจาก `dev4-commit-workflow.md` ยังไง

แนวคิดและตาราง A/B ยกมาจากของ Dev 4 ทั้งหมด (เครดิตเขา) ต่างกันแค่สภาพแวดล้อม:

| | Dev 4 | ไฟล์นี้ |
|---|---|---|
| เชลล์ | PowerShell (Windows) | **bash/zsh (macOS)** |
| here-doc | `@'` … `'@` | `<<'EOF'` … `EOF` |
| encode URL | `[uri]::EscapeDataString()` | `python3 -c 'urllib.parse.quote'` |
| อ่าน remote slug | `-replace` | `sed -E` |

ถ้าใช้ Windows ให้ไปดูของ Dev 4 ตรงๆ จะตรงกว่า

---

## ข้อกำหนดก่อนใช้

`gh` ต้องติดตั้งและ **login แล้ว** (ขั้นที่ 5 ใช้เช็ค PR ที่เปิดค้าง)

```bash
brew install gh
gh auth login          # เปิด browser ทำครั้งเดียวจบ
gh auth status         # ยืนยันว่าติดแล้ว
```

ถ้าไม่มี `gh` หรือยังไม่ login ให้ **ข้ามขั้นที่ 5** แล้วบอกผู้ใช้ว่าข้ามเพราะอะไร
อย่าเดาว่ามี PR เปิดอยู่หรือไม่มี

---

## วิธีนำไปใช้

1. สร้างไฟล์ `.claude/commands/commit.md` ในเครื่องตัวเอง
2. ก็อปเนื้อหาในบล็อกข้างล่างไปวาง แล้วแก้ให้ตรงกับตัวเอง
   - base branch ล็อกไว้ที่ `dev` ตาม `CLAUDE.md` — อย่าเปลี่ยนเป็น `main`
   - ตารางอ่านสถานะ A/B ในขั้นที่ 1 เป็นหัวใจของไฟล์นี้ อย่าตัดทิ้ง
3. เรียกใช้ด้วย `/commit <requirement-id>` เช่น `/commit PROD-006`

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

ใส่ requirement id เป็น argument ได้ เช่น `/commit PROD-006`
ถ้าไม่ใส่ ให้เดาจาก diff แล้วถามยืนยันในขั้นที่ 3

> **ห้ามกดสร้างหรือ merge PR ให้เองเด็ดขาด** (CLAUDE.md หัวข้อ PR step)
> คำสั่งนี้จบที่ "ส่ง URL ให้ผู้ใช้กดเอง" เท่านั้น — ห้ามเรียก `gh pr create`,
> `gh pr merge` หรือ `git merge` เข้า dev/main ไม่ว่ากรณีใด

---

## ขั้นที่ 1 — สำรวจสถานะก่อน

```bash
git fetch --prune origin
branch=$(git branch --show-current)
echo "$branch"
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
  ถ้างานคร่อมหลาย requirement (เช่น e2e ที่ครอบ PROD+CART+SHIP) ให้ **ข้าม id** ดีกว่าเลือกมั่ว
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
- commit message หลายบรรทัดใช้ here-doc ผ่าน `-F -`:

  ```bash
  git commit -F - <<'MSG'
  test: add end-to-end coverage for the e-commerce module

  อธิบายเหตุผลตรงนี้

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  MSG
  ```

  ใช้ `<<'MSG'` (มี quote) เสมอ ไม่งั้น `$` กับ backtick ในข้อความจะโดนเชลล์แปลง
- push: `git push origin "$branch"` (ครั้งแรกของ branch ใช้ `git push -u origin "$branch"`)
- ถ้า pre-commit hook (husky/lint-staged) แก้ไฟล์หรือ fail ให้รายงานตามจริง อย่าใช้ `--no-verify`

ถ้ามาที่ขั้นนี้ทั้งที่ไม่มีอะไรจะ commit (มาจากตารางในขั้นที่ 1) ให้ **push อย่างเดียว**
ข้ามขั้นที่ 2 กับ 3 ไปได้เลย เพราะไม่มี commit message ให้ยืนยัน

## ขั้นที่ 5 — เช็คก่อนว่ามี PR เปิดค้างอยู่แล้วหรือยัง

```bash
gh pr list --head "$(git branch --show-current)" --base dev --state open --json number,url
```

ถ้า `gh` ไม่มีหรือยังไม่ได้ `gh auth login` คำสั่งนี้จะ error — ให้**ข้ามขั้นนี้แล้วบอกผู้ใช้
ตามตรงว่าข้ามเพราะอะไร** อย่าเดาว่ามีหรือไม่มี PR เปิดอยู่

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

```bash
branch=$(git branch --show-current)
slug=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')

title='test(PROD-006): ...'
body=$(cat <<'EOF'
## What
...
EOF
)

enc() { python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))'; }
url="https://github.com/$slug/compare/dev...$branch?expand=1"
url+="&title=$(printf '%s' "$title" | enc)"
url+="&body=$(printf '%s' "$body" | enc)"

echo "${#url}"
echo "$url"
```

หมายเหตุ:

- **อย่า encode ชื่อ branch** — GitHub รับ `/` ใน path ของ compare อยู่แล้ว (`dev...feat/ecommerce-dev3`)
  ตัวแปร `$branch` จึงต่อเข้า URL ตรงๆ ไม่ผ่าน `enc`
- encode เฉพาะ `title` กับ `body` · `safe=""` สำคัญ ไม่งั้น `/` กับ `#` จะไม่ถูก encode
- ใช้ `printf '%s'` ไม่ใช่ `echo` เพราะ `echo` เติม newline ท้ายให้เอง
- **ถ้าความยาว URL เกิน 8000** GitHub จะตอบ 414 ให้ตัด description เหลือเฉพาะ What กับ Testing
  แล้วบอกผู้ใช้ตามตรงว่าตัดอะไรออก พร้อมพิมพ์ description ฉบับเต็มไว้ในแชทให้ copy วางเองได้

ปิดท้ายด้วยการพิมพ์ URL เป็นบรรทัดเดี่ยวๆ (ให้คลิกได้) แล้วเตือนสองเรื่อง:

1. ตรวจว่า base เป็น `dev` — GitHub มักตั้ง default เป็น `main`
2. อ่าน title/description ที่กรอกมาให้ก่อนกด **Create pull request**
````
