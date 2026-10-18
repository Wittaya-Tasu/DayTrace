import { test,expect } from '@playwright/test';
import { mkdir,readFile } from 'node:fs/promises';

test('capture persists pending before selection, then edit and report from real records',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'ทดลองบันทึกในเครื่องนี้'}).click();
  await expect(page.getByRole('heading',{name:'วันนี้ของคุณ.'})).toBeVisible();
  await page.getByRole('button',{name:'เริ่มติดตาม',exact:true}).click();
  const input=page.locator('dialog input[type=datetime-local]');
  const now=new Date(Date.now()-135*60000);const local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
  // Reporting timezone is Bangkok even on browser devices in other timezones.
  const bangkok=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).replace(' ','T');
  await input.fill(bangkok||local);await page.getByRole('button',{name:'ยืนยันเริ่มติดตาม'}).click();
  await page.getByRole('button',{name:'บันทึกเวลา',exact:true}).click();
  await expect(page.getByRole('heading',{name:'เมื่อกี้ทำอะไร?'})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:/มี 1 ช่วงรอระบุกิจกรรม/})).toBeVisible();
  await page.getByRole('button',{name:/มี 1 ช่วงรอระบุกิจกรรม/}).click();
  await page.getByRole('button',{name:'ทำงาน',exact:true}).click();await page.getByRole('textbox',{name:/รายละเอียด/}).fill('ทดสอบข้อมูลจริง');
  await page.getByRole('button',{name:'บันทึกกิจกรรม',exact:true}).click();
  await expect(page.getByRole('button',{name:/มี 1 ช่วงรอระบุ/})).toHaveCount(0);
  if(test.info().project.name==='mobile-webkit'){
    await mkdir('docs/screenshots',{recursive:true});await page.screenshot({path:'docs/screenshots/mobile-capture.png',fullPage:true});await page.screenshot({path:'docs/screenshots/mobile-viewport.png',scale:'css'});
  }
  await page.getByRole('button',{name:'สรุป',exact:true}).click();await expect(page.getByRole('heading',{name:'สรุปการใช้เวลา'})).toBeVisible();
  await expect(page.getByRole('cell',{name:'ทำงาน',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'สัปดาห์',exact:true}).click();await expect(page.getByRole('columnheader',{name:'เฉลี่ย/วัน'})).toBeVisible();
  await page.getByRole('button',{name:'ตั้งค่า',exact:true}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'ส่งออก JSON สำหรับกู้คืน'}).click();
  const file=await download;expect(file.suggestedFilename()).toMatch(/^DayTrace_backup_.*\.json$/);
  const exported=JSON.parse(await readFile((await file.path())!,'utf8'));expect(exported.snapshot.intervals).toHaveLength(1);
  // Restore into a fresh browser profile: canonical records, not a replay of old operations.
  const fresh=await page.context().browser()!.newContext();const restored=await fresh.newPage();await restored.goto('/');await restored.getByRole('button',{name:'ทดลองบันทึกในเครื่องนี้'}).click();await restored.getByRole('button',{name:'ตั้งค่า',exact:true}).click();
  await restored.locator('input[type=file]').setInputFiles((await file.path())!);
  await expect(restored.getByRole('heading',{name:'ตรวจไฟล์ก่อนนำเข้า'})).toBeVisible();await restored.getByRole('button',{name:'ยืนยันนำเข้า',exact:true}).click();
  await restored.getByRole('button',{name:'สรุป',exact:true}).click();await expect(restored.getByRole('cell',{name:'ทำงาน',exact:true})).toBeVisible();
  await restored.getByRole('button',{name:'ตั้งค่า',exact:true}).click();await restored.locator('input[type=file]').setInputFiles((await file.path())!);
  // Versions were incremented on import, so repeating the original file requires an explicit choice.
  await expect(restored.getByRole('alert')).toContainText('ID');await fresh.close();
  expect(errors).toEqual([]);
});

test('375px mobile page fits and categories editor stays usable',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.goto('/');await page.getByRole('button',{name:'ทดลองบันทึกในเครื่องนี้'}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'ตั้งค่า',exact:true}).click();await page.getByRole('button',{name:'หมวดกิจกรรม',exact:true}).click();
  await page.getByRole('button',{name:'เพิ่มหมวดใหม่'}).click();await page.getByRole('textbox',{name:'ชื่อหมวด'}).fill('ทำสวน');await page.getByRole('button',{name:'บันทึกหมวดกิจกรรม'}).click();
  await expect(page.getByRole('button',{name:'ทำสวน แตะเพื่อแก้ไข',exact:true})).toBeVisible();
});
