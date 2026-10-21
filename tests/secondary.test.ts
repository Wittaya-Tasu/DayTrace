import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {describe,it,expect} from 'vitest';
import {initialSnapshot,validateSnapshot,active} from '../src/domain/model';
import {reduce} from '../src/domain/operations';
import {dayBounds,totals} from '../src/domain/time';
import {Repository,blankState} from '../src/data/local';
import {makeBackup,parseBackup,makeCsv} from '../src/backup/backup';

const at=(s:string)=>Date.parse(s),now=at('2026-10-20T12:00:00Z');
function pair(){let s=reduce(initialSnapshot(),{type:'initialize',at:at('2026-10-19T16:30:00Z')},now);s=reduce(s,{type:'capture',id:crypto.randomUUID(),at:at('2026-10-19T18:30:00Z')},now);return reduce(s,{type:'assign',id:s.intervals[0].id,categoryId:s.categories.find(c=>c.name==='เดินทาง')!.id,secondaryCategoryId:s.categories.find(c=>c.name==='เรียนรู้/พัฒนา')!.id,note:'podcast'},now);}
describe('concurrent activities',()=>{
 it('counts elapsed time once and clips both roles across Bangkok midnight',()=>{
  const s=pair(),row=s.intervals[0],summary=totals(s,['2026-10-19','2026-10-20'],now);
  expect(summary.byCategory.get(row.category_id!)).toBe(2*3600000);
  expect(summary.bySecondaryCategory.get(row.secondary_category_id!)).toBe(2*3600000);
  expect([...summary.byCategory.values()].reduce((a,b)=>a+b,0)+summary.pending+summary.gap+summary.open+summary.future).toBe(summary.denominator);
  expect(totals(s,['2026-10-19'],now).bySecondaryCategory.get(row.secondary_category_id!)).toBe(30*60000);
  expect(totals(s,['2026-10-20'],now).bySecondaryCategory.get(row.secondary_category_id!)).toBe(90*60000);
 });
 it('uses the actual DST day length without doubling the primary total',()=>{
  let s={...initialSnapshot(),timezone:'America/New_York'};const b=dayBounds('2026-03-08',s.timezone);
  s=reduce(s,{type:'initialize',at:b.start},now);s=reduce(s,{type:'capture',id:crypto.randomUUID(),at:b.end},now);s=reduce(s,{type:'assign',id:s.intervals[0].id,categoryId:s.categories[0].id,secondaryCategoryId:s.categories[1].id,note:''},now);
  const t=totals(s,['2026-03-08'],now);expect(t.denominator).toBe(23*3600000);expect([...t.byCategory.values()]).toEqual([t.denominator]);expect([...t.bySecondaryCategory.values()]).toEqual([t.denominator]);
 });
 it('rejects same-category, missing-primary, unknown or archived secondary selections',()=>{
  const s=pair(),r=s.intervals[0];
  for(const [primary,secondary] of [[r.category_id,r.category_id],[null,r.secondary_category_id],[r.category_id,crypto.randomUUID()]] as const) expect(()=>reduce(s,{type:'assign',id:r.id,categoryId:primary,secondaryCategoryId:secondary,note:''},now)).toThrow();
  const archived=structuredClone(s);archived.categories.find(c=>c.id===r.secondary_category_id)!.archived_at=new Date(now).toISOString();
  expect(()=>reduce(archived,{type:'assign',id:r.id,categoryId:r.category_id,secondaryCategoryId:r.secondary_category_id,note:''},now)).toThrow('เก็บถาวร');
 });
 it('keeps both activities through split, merge, boundary edits, trash, restore and undo',()=>{
  const original=pair(),r=original.intervals[0];let s=reduce(original,{type:'split',id:r.id,at:at('2026-10-19T17:30:00Z'),newId:crypto.randomUUID()},now);
  expect(active(s).every(i=>i.secondary_category_id===r.secondary_category_id)).toBe(true);
  s=reduce(s,{type:'merge',ids:active(s).map(i=>i.id),categoryId:r.category_id,secondaryCategoryId:r.secondary_category_id,note:r.note},now);
  s=reduce(s,{type:'adjust_boundary',id:r.id,start:at(r.start_at)+1000,end:at(r.end_at),adjustNeighbors:true},now);
  s=reduce(s,{type:'soft_delete',id:r.id,at:now},now);s=reduce(s,{type:'restore',id:r.id,at:now},now);
  expect(active(s)[0].secondary_category_id).toBe(r.secondary_category_id);
  s=reduce(s,{type:'undo',snapshot:original},now);expect(active(s)[0].start_at).toBe(r.start_at);expect(active(s)[0].secondary_category_id).toBe(r.secondary_category_id);
 });
 it('persists both activities in JSON v2 and CSV, while importing legacy v1 as primary-only',()=>{
  const state=blankState();state.view=pair();state.canonical=state.view;
  const backup=makeBackup(state,false);expect(backup.schema_version).toBe(2);expect(parseBackup(JSON.stringify(backup)).snapshot).toEqual(state.view);
  const csv=makeCsv(state.view);expect(csv.split('\r\n')).toHaveLength(2);expect(csv).toContain('secondary_category');expect(csv).toContain('เรียนรู้/พัฒนา');
  const legacy=JSON.parse(JSON.stringify(backup));legacy.schema_version=1;for(const r of legacy.snapshot.intervals)delete r.secondary_category_id;
  expect(parseBackup(JSON.stringify(legacy)).snapshot.intervals[0].secondary_category_id).toBeNull();
 });
 it('removes a secondary activity without changing its time range',()=>{
  const s=pair(),r=s.intervals[0],next=reduce(s,{type:'assign',id:r.id,categoryId:r.category_id,secondaryCategoryId:null,note:r.note},now);
  expect(next.intervals[0].start_at).toBe(r.start_at);expect(next.intervals[0].end_at).toBe(r.end_at);expect(totals(next,['2026-10-19','2026-10-20'],now).bySecondaryCategory.size).toBe(0);
  expect(()=>validateSnapshot({...s,intervals:[{...r,secondary_category_id:r.category_id}]})).toThrow();
 });
 it('upgrades a real v1 IndexedDB store while preserving a sent-but-unacknowledged payload byte-for-byte',async()=>{
  const namespace=`upgrade-${crypto.randomUUID()}`,name=`daytrace:v1:${namespace}`;
  const s=pair();const legacy=JSON.parse(JSON.stringify(blankState()));legacy.view=s;legacy.canonical=s;legacy.history=[{before:s,after_revision:1,label:'legacy',created_at:new Date().toISOString()}];
  legacy.outbox=[{operation_id:crypto.randomUUID(),expected_revision:0,type:'assign',payload:{...s,categories:[]},created_at:new Date().toISOString(),device_id:legacy.deviceId}];
  const old=JSON.parse(JSON.stringify(legacy));for(const snapshot of [old.view,old.canonical,...old.history.map((h:any)=>h.before),old.outbox[0].payload])for(const row of snapshot.intervals)delete row.secondary_category_id;
  const originalPayload=JSON.stringify(old.outbox[0].payload),id=old.outbox[0].operation_id;
  const db=new Dexie(name);db.version(1).stores({states:'id'});await db.table('states').put(old);db.close();
  const repo=new Repository(namespace,true);try{const upgraded=await repo.state();expect(upgraded.view.intervals[0].secondary_category_id).toBeNull();expect(upgraded.history[0].before.intervals[0].secondary_category_id).toBeNull();expect(upgraded.outbox[0].operation_id).toBe(id);expect(upgraded.outbox[0].protocol_version).toBe(1);expect(JSON.stringify(upgraded.outbox[0].payload)).toBe(originalPayload);}finally{repo.db.close();await Dexie.delete(name);}
 });
});
