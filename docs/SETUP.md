# การตั้งค่า DayTrace

อัปเดต 18 ตุลาคม 2569 (Asia/Bangkok)

## สิ่งที่เตรียมแล้วในงานนี้

- Supabase project: **DayTrace** ใน **Wittaya-Tasu's Org**
- Project reference: `bewdhwsfplacrblpxgan`
- Region: Singapore (`ap-southeast-1`), ราคาสร้างโครงการที่ตรวจผ่านตัวเชื่อม: $0/month
- API URL: `https://bewdhwsfplacrblpxgan.supabase.co`
- Migration แรก: `supabase/migrations/202610180001_daytrace.sql` ใช้กับ project นี้แล้ว
- `.env.local` ในเครื่องมี URL + publishable key แล้ว และถูก ignore ไม่อัปโหลดขึ้น source
- เปิด Google provider แล้ว ผู้ใช้เข้าสู่ระบบและอนุญาตบัญชีเจ้าของแล้ว ตรวจพบกิจกรรมแรกที่ผู้ใช้บันทึกใน Supabase ตรงกับหน้าแอพ
- ผู้ใช้สร้าง Google Cloud project **DayTrace** (`daytrace-512002`) และ Web client ชื่อ `DayTrace Web` แล้ว พร้อม origins localhost / 127.0.0.1 port 5173 และ Supabase Callback URL ผู้ใช้กรอกรหัสลับใน dashboard โดยตรง
- เผยแพร่ที่ **https://wittaya-tasu.github.io/DayTrace/** แล้ว หลังผู้ใช้อนุญาต Public repository **Wittaya-Tasu/DayTrace** ตรวจ Google Login บน URL จริงและโหลดกิจกรรมแรกกลับมาได้แล้ว ผู้ใช้ยืนยันการเปิดจากไอคอนบน iPhone และบันทึกออฟไลน์/เปิดกลับ/ซิงก์ ตรวจใน Supabase พบรายการทดสอบหนึ่งรายการ ไม่ซ้ำ

การเข้าสู่ supabase.com ด้วย GitHub ใช้จัดการ project ส่วนการเข้าสู่ **แอพ DayTrace** ใช้ Google ผ่าน Supabase Auth เป็นอีกขั้นตอนหนึ่ง

## 1. Google OAuth (ผู้ใช้ต้องทำส่วน credentials ใน dashboard)

1. เปิด [Supabase project](https://supabase.com/dashboard/project/bewdhwsfplacrblpxgan) → Authentication → Sign In / Providers → Google คัดลอก **Callback URL ที่หน้านั้นแสดงจริง**
2. เปิด [หน้าสร้าง Google Cloud project](https://console.cloud.google.com/projectcreate) ตั้งชื่อ DayTrace ใช้ Project ID ที่ Google แนะนำได้ หากบัญชีส่วนตัวไม่มีองค์กรให้ใช้ No organization จากนั้นเปิด [Google Auth Platform](https://console.cloud.google.com/auth/overview) และเลือก project นี้ การสร้าง OAuth client นี้ไม่ต้องเพิ่ม API เสียเงินหรือเปิด billing สำหรับงานนี้
3. ตั้ง Branding ชื่อ DayTrace, อีเมลติดต่อ และ Audience ตามประเภทบัญชี Google หากใช้ External / Testing ให้เพิ่มอีเมล Google ของเจ้าของใน Test users ใช้เฉพาะ scopes `openid`, `userinfo.email`, `userinfo.profile`
4. ไป Clients → Create client → **Web application**
5. Authorized JavaScript origins สำหรับ dev: `http://127.0.0.1:5173` และ/หรือ `http://localhost:5173` ตาม URL ที่เปิดใช้จริง (ไม่มี path) สำหรับ Pages ภายหลังใช้ origin ของ Pages ที่สร้างจริง
6. Authorized redirect URIs: วาง **Supabase Callback URL จากข้อ 1** เป็น URL ที่ Google ส่งกลับไป Supabase อย่าสับสนกับ URL หน้าแอพ
7. นำ Client ID + Client secret ไปใส่ Google provider ใน **Supabase dashboard เท่านั้น** แล้ว Enable และ Save ไม่ส่ง secret ในแชทหรือไฟล์โครงการ
8. Supabase → Authentication → URL Configuration ตั้ง Site URL สำหรับ dev เป็น URL ที่เปิดใช้อยู่ เช่น `http://127.0.0.1:5173/` และเพิ่ม Redirect URLs แบบเจาะจง ได้แก่ `http://127.0.0.1:5173/` และ `http://localhost:5173/` เมื่อเผยแพร่จึงเพิ่ม URL จริงของ Pages พร้อม base และ trailing slash
9. กลับ DayTrace หากอยู่โหมดพัฒนา ไปตั้งค่า → เข้าสู่ระบบด้วย Google ใช้ Google ของเจ้าของ
10. แอพจะแสดง **บัญชีนี้ยังไม่ได้รับอนุญาต** ในครั้งแรก นี่คือการป้องกันก่อนเพิ่ม owner ไม่ใช่สาเหตุให้ปิด RLS

อ้างอิง [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google) และ [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

## 2. เพิ่มบัญชีเจ้าของ

หลังจาก login ครั้งแรก แอพจะแสดง User UID ของบัญชีปัจจุบันในหน้า **บัญชีนี้ยังไม่ได้รับอนุญาต** ให้ผู้ดูแลตรวจว่าเป็นบัญชี Google ของเจ้าของและขอคำอนุญาตก่อนเพิ่มสิทธิ์ด้วย SQL Editor:

```sql
insert into public.owner_allowlist(user_id)
values ('REPLACE_WITH_VERIFIED_OWNER_AUTH_UUID'::uuid)
on conflict do nothing;
```

ตรวจอีเมลและ provider ว่าเป็นของเจ้าของจริง ห้ามเพิ่ม UUID จากไฟล์ backup หรือ request ของ client โดยไม่ตรวจบัญชี ไม่ให้ client เขียน allowlist เอง จากนั้นกด **ตรวจสิทธิ์อีกครั้ง** ในแอพ

ตัวเชื่อม Supabase ตรวจเฉพาะบัญชีปัจจุบันและเพิ่ม UUID ได้หลังเจ้าของอนุญาตแล้ว ไม่ต้องแสดงรายชื่อบัญชีอื่นหรือส่งรหัสผ่าน

## 3. ตรวจระบบออนไลน์ก่อนใช้งานจริง

- Login เจ้าของ → seed หมวดครั้งเดียว → เริ่ม / capture / assign → reload → ดูข้อมูลใน Supabase
- เปิดอุปกรณ์ที่สองด้วยบัญชีเดิม ดูว่าดึงข้อมูลได้และ cursor ตรง
- ออฟไลน์หลาย capture → reload → ออนไลน์ → ไม่มีแถวซ้ำ
- จำลอง lost ack และ revision conflict ในสภาพแวดล้อมทดสอบจริง
- ลอง Google อีกบัญชีที่ไม่ได้ allowlist: อ่าน/เขียนข้อมูลไม่ได้
- ตรวจ logout มี outbox, session หมดอายุ และ login กลับบัญชีเดิม
- ส่งออก JSON และกู้คืนใน profile ใหม่จริงก่อน update ใหญ่

`node scripts/check-cloud.mjs` ตรวจสถานะ Google provider และ anonymous RPC ผ่าน API จริงได้ โดยไม่ใช้ secret ชุด `tests/database.sql` ตรวจ role security ใน PostgreSQL และ rollback ข้อมูลทดสอบทั้งหมด แต่ไม่ได้แทนการทดสอบ Google OAuth สองบัญชีจริง

## 4. GitHub Pages

1. สร้าง repository **DayTrace** แยกจากแอพอื่น ถ้าใช้ Pages บน GitHub Free ให้ตรวจข้อกำหนดการใช้ public repository และราคา ณ วันเปิดบริการ หากจะ public ต้องตรวจ source ไม่มี secret หรือข้อมูลส่วนตัว
2. ตั้ง Pages → Source: GitHub Actions
3. เพิ่ม Actions variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (เป็นค่า public ของ frontend)
4. workflow `.github/workflows/pages.yml` ใช้ชื่อ repository จริงคำนวณ base; repo ชื่อ `DayTrace` ใช้ `/DayTrace/` URL ที่เผยแพร่และยืนยันแล้วคือ `https://wittaya-tasu.github.io/DayTrace/`
5. เพิ่ม URL ที่ Pages แสดงจริงใน Supabase Site URL / Redirect URLs และ Google Authorized JavaScript origins (origin ไม่มี path)
6. เปิด source บน GitHub แล้วกด workflow **Build and deploy DayTrace** ด้วยตัวเองเมื่อพร้อมเผยแพร่ Workflow ไม่ deploy อัตโนมัติเมื่อ push
7. ตรวจ production login, offline shell, manifest scope/start_url และ checklist iPhone ก่อนถือว่า release 1.0 พร้อม สถานะล่าสุด: production login, ไฟล์ PWA และการใช้งานหลักบน iPhone จริงผ่านแล้ว รุ่น 0.1.0 พร้อมเริ่มใช้งานส่วนตัว ส่วน QA ขั้นสูงยังคงรายการที่ไม่ผ่านการทดสอบไว้ใน docs/IPHONE_QA.md

อ้างอิง [Vite GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages) และ [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 5. ราคา / ข้อจำกัดบริการ

ตรวจ [Supabase pricing](https://supabase.com/pricing) และ [free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) ณ วันเปิดใช้งานอีกครั้ง Free มีโควตาและอาจพักเมื่อไม่ได้ใช้งาน เป้าหมายคือ 0 บาทต่อเดือนภายในโควตา ไม่มีการสมัคร Pro, ซื้อ domain, ใช้ SMS, AI API หรือ keep-alive ปลอม

หากติดต่อ cloud ไม่ได้ ยังใช้ข้อมูล local ได้ แอพไม่สรุปเองว่า project ถูกพักแน่นอนจาก network error ให้ตรวจ dashboard แล้วเปิดกลับตามสาเหตุจริง
