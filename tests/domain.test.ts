import { describe,it,expect } from 'vitest';
import { initialSnapshot,validateSnapshot,active,iso } from '../src/domain/model';
import { reduce,mergeSnapshots } from '../src/domain/operations';
import { daySegments,dayBounds,totals,periodDates } from '../src/domain/time';
import { blankState } from '../src/data/local';
import { makeBackup,parseBackup,makeCsv } from '../src/backup/backup';

const t=(value:string)=>Date.parse(`2026-10-17T${value}+07:00`),id=()=>crypto.randomUUID(),now=t('23:00:00');
function captured(){let s=reduce(initialSnapshot(),{type:'initialize',at:t('08:30:00')},now);return reduce(s,{type:'capture',at:t('10:45:00'),id:id()},now);}
describe('time capture and timeline invariants',()=>{
  it('T01/T02 retrospective assignment keeps the exact tap end, including milliseconds',()=>{
    let s=reduce(initialSnapshot(),{type:'initialize',at:t('08:30:00.123')},now);
    expect(s.intervals).toHaveLength(0);
    s=reduce(s,{type:'capture',at:t('10:45:00.123'),id:id()},now);
    const row=s.intervals[0];s=reduce(s,{type:'assign',id:row.id,categoryId:s.categories[1].id,note:'งาน'},t('10:45:20'));
    expect(Date.parse(s.intervals[0].end_at)-Date.parse(s.intervals[0].start_at)).toBe(135*60000);
    expect(s.intervals[0].end_at).toBe(iso(t('10:45:00.123')));
  });
  it('T05 split + merge preserve milliseconds and all time',()=>{
    let s=captured();const original=s.intervals[0];
    s=reduce(s,{type:'split',id:original.id,at:t('09:23:45.789'),newId:id()},now);
    expect(active(s).reduce((sum,i)=>sum+Date.parse(i.end_at)-Date.parse(i.start_at),0)).toBe(135*60000);
    s=reduce(s,{type:'merge',ids:s.intervals.map(i=>i.id),categoryId:s.categories[1].id,note:'รวม'},now);
    expect(active(s)).toHaveLength(1);expect(active(s)[0].start_at).toBe(original.start_at);expect(active(s)[0].end_at).toBe(original.end_at);
  });
  it('rejects nonadjacent merges, bad split points, overlap and open-range violations',()=>{
    const s=captured(),i=s.intervals[0];
    expect(()=>reduce(s,{type:'split',id:i.id,at:Date.parse(i.start_at),newId:id()},now)).toThrow();
    expect(()=>reduce(s,{type:'fill_gap',id:id(),start:t('09:00:00'),end:t('10:00:00'),categoryId:null,note:''},now)).toThrow('ซ้อน');
    expect(()=>reduce(s,{type:'fill_gap',id:id(),start:t('11:00:00'),end:t('12:00:00'),categoryId:null,note:''},now)).toThrow('กำลังเดิน');
    expect(()=>validateSnapshot({...s,intervals:[i,{...i,id:i.id}]})).toThrow('ซ้ำ');
  });
  it('T10 deleted interval becomes a gap and overlapping restore is rejected',()=>{
    let s=captured();const i=s.intervals[0];s=reduce(s,{type:'soft_delete',id:i.id,at:now},now);
    expect(active(s)).toHaveLength(0);
    expect(daySegments(s,'2026-10-17',now).find(x=>x.status==='gap')!.end).toBe(t('10:45:00'));
    s=reduce(s,{type:'fill_gap',id:id(),start:t('08:30:00'),end:t('10:45:00'),categoryId:null,note:''},now);
    expect(()=>reduce(s,{type:'restore',id:i.id,at:now},now)).toThrow('ซ้อน');
    expect(()=>reduce(s,{type:'restore',id:i.id,at:now+31*86400000},now+31*86400000)).toThrow('30 วัน');
  });
  it('boundary edits change shared edges atomically and reject collapsing neighbors',()=>{
    let s=captured();s=reduce(s,{type:'capture',id:id(),at:t('12:00:00')},now);const rows=active(s);
    s=reduce(s,{type:'adjust_boundary',id:rows[0].id,start:t('08:30:00'),end:t('11:00:00'),adjustNeighbors:true},now);
    expect(active(s)[1].start_at).toBe(iso(t('11:00:00')));
    expect(()=>reduce(s,{type:'adjust_boundary',id:rows[0].id,start:t('08:30:00'),end:t('12:30:00'),adjustNeighbors:true},now)).toThrow();
  });
  it('T22 rejects a backward device clock and future capture',()=>{
    const s=captured();expect(()=>reduce(s,{type:'capture',at:t('10:44:00'),id:id()},now)).toThrow('นาฬิกา');
    expect(()=>reduce(s,{type:'capture',at:now+1,id:id()},now)).toThrow('อนาคต');
  });
});
describe('calendar reporting',()=>{
  it('T06 sleep across midnight is a single record, clipped to 30m + 7h30m',()=>{
    const start=Date.parse('2026-10-16T23:30:00+07:00'),end=t('07:30:00');
    let s=reduce(initialSnapshot(),{type:'initialize',at:start},now);s=reduce(s,{type:'capture',id:id(),at:end},now);
    s=reduce(s,{type:'assign',id:s.intervals[0].id,categoryId:s.categories[0].id,note:''},now);
    expect(totals(s,['2026-10-16'],now).byCategory.get(s.categories[0].id)).toBe(30*60000);
    expect(totals(s,['2026-10-17'],now).byCategory.get(s.categories[0].id)).toBe(450*60000);
    expect(s.intervals).toHaveLength(1);
  });
  it('T07/T08/T09/T24 partitions full days without counting future as elapsed',()=>{
    const s=captured(),segments=daySegments(s,'2026-10-17',now);
    expect(segments[0].status).toBe('gap');expect(segments.at(-1)!.status).toBe('future');
    expect(segments.reduce((sum,r)=>sum+r.end-r.start,0)).toBe(86400000);
    expect(segments.find(r=>r.status==='open')!.end-segments.find(r=>r.status==='open')!.start).toBe(now-t('10:45:00'));
    expect(daySegments(s,'2026-10-18',now)).toEqual([{start:Date.parse('2026-10-18T00:00:00+07:00'),end:Date.parse('2026-10-19T00:00:00+07:00'),status:'future'}]);
    const afterDays=now+5*86400000;const previous=daySegments(s,'2026-10-19',afterDays);
    expect(previous).toHaveLength(1);expect(previous[0].status).toBe('open');
  });
  it('T23 supports actual 23/25 hour DST days',()=>{
    expect(dayBounds('2026-03-08','America/New_York').length).toBe(23*3600000);
    expect(dayBounds('2026-11-01','America/New_York').length).toBe(25*3600000);
    expect(dayBounds('2026-10-17','Asia/Bangkok').length).toBe(24*3600000);
  });
  it('uses Monday weeks and excludes future dates from period averages',()=>{
    expect(periodDates('2026-10-17','week','2026-10-17')).toEqual(['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17']);
    expect(periodDates('2026-10-17','month','2026-10-17')).toHaveLength(17);
  });
});
describe('backup and import',()=>{
  it('T17/T18 round-trips categories, intervals and cursor without tokens; rejects damaged data',()=>{
    const state=blankState();state.view=captured();const text=JSON.stringify(makeBackup(state,false));
    expect(parseBackup(text).snapshot).toEqual(state.view);
    expect(text).not.toMatch(/access_token|refresh_token|service_role/);
    expect(()=>parseBackup('{broken')).toThrow();
    expect(()=>parseBackup(JSON.stringify({...makeBackup(state,false),schema_version:999}))).toThrow();
    expect(mergeSnapshots(state.view,state.view).intervals).toHaveLength(1);
    const different=structuredClone(state.view);different.intervals[0].note='different';
    expect(()=>mergeSnapshots(state.view,different)).toThrow('ID');
  });
  it('T19 CSV escapes formulas, commas, quotes, and newlines and preserves Thai BOM',()=>{
    const s=captured();s.intervals[0].note='  =HYPERLINK("x"),ภาษาไทย\nบรรทัดใหม่';
    const csv=makeCsv(s);expect(csv.startsWith('\uFEFF')).toBe(true);expect(csv).toContain('"\'  =HYPERLINK(""x""),ภาษาไทย\nบรรทัดใหม่"');expect(csv.split('\r\n')).toHaveLength(2);
  });
});
