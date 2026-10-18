# DayTrace — วันของฉัน

PWA ภาษาไทยสำหรับเจ้าของคนเดียว กดจบช่วงที่ผ่านมา แล้วเลือกว่าทำอะไรในช่วงนั้น เก็บลงเครื่องก่อนและซิงก์ Supabase เมื่อพร้อม

**สถานะ: 0.1.0 development** — ส่วน local ใช้งานและทดสอบได้ ยังไม่ใช่ release 1.0 ที่ผ่าน Google OAuth / หลายอุปกรณ์ / iPhone จริงครบแล้ว ดู [PROJECT_STATUS.md](PROJECT_STATUS.md)

## เริ่มในเครื่อง

ต้องมี Node.js 22.12+ (ทดสอบด้วย 24.19.0) และ pnpm 11.25.0

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Windows PowerShell ใช้ `Copy-Item .env.example .env.local` แทน `cp` ได้ เปิด URL ที่ Vite แสดง (ปกติ http://127.0.0.1:5173/) เลือก **ทดลองบันทึกในเครื่องนี้** ไม่ต้องมีบัญชีหรือข้อมูลตัวอย่าง ข้อมูลนี้แยกจากบัญชีคลาวด์ ส่งออก JSON แล้วย้ายเข้าในบัญชีเจ้าของภายหลังได้

หากมี `.env.local` ที่ตั้งค่าแล้ว ให้เก็บไว้ ไม่เขียนทับด้วยตัวอย่าง

```sh
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
pnpm exec playwright install chromium webkit
pnpm test:e2e
pnpm exec playwright test -c playwright.pwa.config.ts
```

การทดสอบฐานข้อมูลในเครื่องใช้ PostgreSQL WASM (PGlite); ชุด `tests/database.sql` เดียวกันรันกับ Supabase จริงได้ และ rollback fixture ทั้งหมด การทดสอบ PWA ใช้ production build จากคำสั่ง build ล่าสุด

## วิธีใช้

1. กด **เริ่มติดตาม** เลือกเวลาเริ่มได้ ยังไม่สร้างกิจกรรมระยะศูนย์
2. เมื่อจบช่วง กด **บันทึกเวลา** เก็บเวลาทันที แล้วเลือกกิจกรรมที่เพิ่งทำ
3. ปิดแผงหรือเลือก **ไว้ระบุทีหลัง** ได้ เวลาไม่หาย กดบันทึกช่วงต่อไปได้
4. แตะรายการเพื่อแก้หมวด รายละเอียด แบ่ง/รวมช่วง แก้ขอบเวลา หรือย้ายลงถังขยะ
5. หน้า **สรุป** ดูวัน สัปดาห์ (จันทร์–อาทิตย์) เดือน และเติมกิจกรรมในช่องว่างได้
6. **ตั้งค่า** จัดหมวด ปักหมุด เปลี่ยนสี/ไอคอน ดูคิวซิงก์ แก้ cursor กู้คืน และส่งออก/นำเข้า

บันทึกตาม UTC ด้วย millisecond; สรุปเริ่มที่ Asia/Bangkok คงที่แม้เดินทาง สีนอนข้ามคืนเก็บเป็นรายการเดียวแล้วแบ่งยอดให้แต่ละวันตามจริง ช่วงกำลังเดินและอนาคตไม่ถือเป็นกิจกรรมที่ยืนยันแล้ว

## ตั้งค่าคลาวด์และเผยแพร่

- [คู่มือ Supabase + Google Login + GitHub Pages](docs/SETUP.md)
- [สถาปัตยกรรมและ sync protocol](docs/ARCHITECTURE.md)
- [สิทธิ์และผลตรวจความปลอดภัย](docs/SECURITY.md)
- [ทดสอบบน iPhone จริง](docs/IPHONE_QA.md)
- [การอัปเดตและกู้คืน](docs/OPERATIONS.md)

ไม่ต้องใส่ service_role, database password หรือ Google client secret ในโค้ด, GitHub, JSON หรือแชท ตัวแปร VITE_* และ publishable key เป็นข้อมูลที่มองเห็นได้ใน browser ความปลอดภัยอยู่ที่ RLS และ RPC ที่ตรวจบัญชีเจ้าของ

## สำรองและข้อจำกัด

JSON เป็นไฟล์กู้คืนเต็มระบบ; CSV (UTF-8 BOM) สำหรับวิเคราะห์ แอพเตือนส่งออกเมื่อไม่เคยส่งออกหรือเกิน 7 วัน ไม่สำรอง Drive อัตโนมัติ และไม่รับรองว่า browser ดาวน์โหลดแล้วเท่ากับเก็บใน iCloud สำเร็จ

ข้อมูลในเครื่องอาจหายเมื่อล้างข้อมูลเว็บไซต์หรือทำเครื่องหาย IndexedDB ไม่ใช่ encrypted vault ซิงก์ไม่ใช่ backup และไม่รับประกันการส่งคิวขณะปิดแอพ เปิดออนไลน์ครั้งแรกเพื่อโหลด shell / fonts และเข้าสู่ระบบก่อนใช้ออฟไลน์

โหมดคลาวด์หยุดคิวเมื่อ revision ขัดแย้ง เก็บคำสั่งเดิมไว้ ตรวจและ export ทั้งสองฝั่งก่อนเลือก merge / ชุดหลัก การ merge ไม่แก้ช่วงซ้อนหรือ ID เดิมที่มีข้อมูลต่างกันให้เอง

รองรับ JSON ≤20 MB, ≤500 หมวด และ ≤50,000 ช่วง (รวม tombstones) ต่อบัญชี; undo ในเครื่องล่าสุดได้เมื่อ revision ยังตรง เก็บไม่เกิน 50 รายการ / 90 วัน; กู้คืนถังขยะ 30 วัน; server เก็บ receipts ต่อเนื่อง ปัจจุบัน tombstones เก่าคงอยู่จนมี migration สำหรับ archival ที่ปลอดภัย

## สิทธิ์ assets

Sarabun self-host จาก @fontsource/sarabun ใช้ SIL OFL 1.1 ([license](public/FONT_LICENSE.txt)); ไอคอน UI จาก lucide-react (ISC); ไอคอนแอพสร้างในโครงการด้วย `scripts/generate-icons.py` ไม่มีรูปบุคคลหรือภาพจากแหล่งอื่น
