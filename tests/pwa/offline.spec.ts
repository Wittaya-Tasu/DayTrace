import { test,expect } from '@playwright/test';
test('production PWA shell, fonts and IndexedDB survive an offline reload',async({page,context})=>{
  await page.goto('/');await page.getByRole('button',{name:'ทดลองบันทึกในเครื่องนี้'}).click();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('button',{name:'เริ่มติดตาม',exact:true}).click();await page.getByRole('button',{name:'ยืนยันเริ่มติดตาม'}).click();
  await page.getByRole('button',{name:'บันทึกเวลา',exact:true}).click();await page.getByRole('button',{name:'ไว้ระบุทีหลัง',exact:true}).click();
  await context.setOffline(true);await page.reload();
  await expect(page.getByRole('button',{name:/มี 1 ช่วงรอระบุกิจกรรม/})).toBeVisible();
  await page.getByRole('button',{name:/มี 1 ช่วงรอระบุกิจกรรม/}).click();await page.getByRole('button',{name:'เดินทาง',exact:true}).click();await page.getByRole('combobox',{name:'กิจกรรมร่วม',exact:true}).selectOption({label:'เรียนรู้/พัฒนา'});await page.getByRole('button',{name:'บันทึกกิจกรรม',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeHidden();await expect(page.locator('.activity-row').filter({hasText:'เดินทาง'}).filter({hasText:'ร่วม: เรียนรู้/พัฒนา'})).toBeVisible();
  await page.reload();await expect(page.locator('.activity-row').filter({hasText:'ร่วม: เรียนรู้/พัฒนา'})).toBeVisible();
  const cached=await page.evaluate(async()=>{const names=await caches.keys();const urls:string[]=[];for(const n of names){const c=await caches.open(n);for(const r of await c.keys())urls.push(r.url);}return urls;});
  expect(cached.some(url=>url.endsWith('.woff2'))).toBe(true);
  expect(cached.some(url=>url.includes('supabase.co')||url.includes('code='))).toBe(false);
  await context.setOffline(false);
});
