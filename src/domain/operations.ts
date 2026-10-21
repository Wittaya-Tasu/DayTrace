import { active, iso, validateSnapshot, type Snapshot, type Category } from './model';

export type Command =
 | { type:'initialize'; at:number }
 | { type:'capture'; at:number; id:string }
 | { type:'assign'; id:string; categoryId:string|null; secondaryCategoryId?:string|null; note:string }
 | { type:'split'; id:string; at:number; newId:string }
 | { type:'merge'; ids:string[]; categoryId:string|null; secondaryCategoryId?:string|null; note:string }
 | { type:'adjust_boundary'; id:string; start:number; end:number; adjustNeighbors:boolean }
 | { type:'adjust_boundary'; cursor:number }
 | { type:'soft_delete'|'restore'; id:string; at:number }
 | { type:'fill_gap'; start:number; end:number; id:string; categoryId:string|null; secondaryCategoryId?:string|null; note:string }
 | { type:'category_update'; category:Category }
 | { type:'profile_update'; timezone:string }
 | { type:'import_batch'|'undo'; snapshot:Snapshot };

export function reduce(s:Snapshot, command:Command, now=Date.now()):Snapshot {
  const next=structuredClone(s);
  const get=(id:string) => { const i=next.intervals.find(x=>x.id===id&&!x.deleted_at); if(!i) throw Error('ไม่พบช่วงเวลา'); return i; };
  const validTime=(t:number) => {if(!Number.isFinite(t)||t>now) throw Error('เวลาไม่ถูกต้องหรือเป็นเวลาอนาคต');};
  switch(command.type){
    case 'initialize':
      if(next.cursor_at) throw Error('เริ่มติดตามแล้ว');
      validTime(command.at); next.cursor_at=iso(command.at); break;
    case 'capture': {
      if(!next.cursor_at) throw Error('เริ่มติดตามก่อนบันทึก');
      validTime(command.at);
      if(command.at<=Date.parse(next.cursor_at)) throw Error('เวลาปัจจุบันไม่อยู่หลังการกดล่าสุด กรุณาตรวจนาฬิกาหรือแก้เวลาเริ่ม');
      next.intervals.push({id:command.id,start_at:next.cursor_at,end_at:iso(command.at),category_id:null,secondary_category_id:null,note:'',version:1,deleted_at:null});
      next.cursor_at=iso(command.at); break;
    }
    case 'assign': {const i=get(command.id); i.category_id=command.categoryId;i.secondary_category_id=command.secondaryCategoryId??null;i.note=command.note;i.version++;break;}
    case 'split': {
      const i=get(command.id); if(command.at<=Date.parse(i.start_at)||command.at>=Date.parse(i.end_at)) throw Error('จุดแบ่งต้องอยู่ภายในช่วงเวลา');
      const end=i.end_at;i.end_at=iso(command.at);i.version++;
      next.intervals.push({...i,id:command.newId,start_at:i.end_at,end_at:end,version:1});break;
    }
    case 'merge': {
      const rows=command.ids.map(get).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at));
      if(rows.length<2||new Set(command.ids).size!==rows.length) throw Error('เลือกอย่างน้อยสองช่วงที่ติดกัน');
      for(let n=1;n<rows.length;n++) if(Date.parse(rows[n-1].end_at)!==Date.parse(rows[n].start_at)) throw Error('รวมได้เฉพาะช่วงที่ติดกัน');
      rows[0].end_at=rows.at(-1)!.end_at;rows[0].category_id=command.categoryId;rows[0].secondary_category_id=command.secondaryCategoryId??null;rows[0].note=command.note;rows[0].version++;
      rows.slice(1).forEach(i=>{i.deleted_at=iso(now);i.version++;});break;
    }
    case 'adjust_boundary': {
      if('cursor' in command){validTime(command.cursor);next.cursor_at=iso(command.cursor);break;}
      validTime(command.start);validTime(command.end);
      const i=get(command.id), oldStart=i.start_at,oldEnd=i.end_at;
      if(command.adjustNeighbors){
        const prev=next.intervals.find(x=>!x.deleted_at&&x.id!==i.id&&x.end_at===oldStart);
        const after=next.intervals.find(x=>!x.deleted_at&&x.id!==i.id&&x.start_at===oldEnd);
        if(prev){prev.end_at=iso(command.start);prev.version++;}
        if(after){after.start_at=iso(command.end);after.version++;}
      }
      i.start_at=iso(command.start);i.end_at=iso(command.end);i.version++;
      if(oldEnd===next.cursor_at) next.cursor_at=i.end_at;break;
    }
    case 'soft_delete': {const i=get(command.id);i.deleted_at=iso(command.at);i.version++;break;}
    case 'restore': {
      const i=next.intervals.find(x=>x.id===command.id&&x.deleted_at);
      if(!i||command.at-Date.parse(i.deleted_at!)>30*86400000) throw Error('พ้นระยะเวลากู้คืน 30 วันแล้ว');
      i.deleted_at=null;i.version++;break;
    }
    case 'fill_gap':
      validTime(command.start);validTime(command.end);
      next.intervals.push({id:command.id,start_at:iso(command.start),end_at:iso(command.end),category_id:command.categoryId,secondary_category_id:command.secondaryCategoryId??null,note:command.note,version:1,deleted_at:null});break;
    case 'category_update': {
      const old=next.categories.find(c=>c.id===command.category.id);
      const row={...command.category,version:(old?.version??0)+1};
      next.categories=next.categories.filter(c=>c.id!==row.id);next.categories.push(row);break;
    }
    case 'profile_update':next.timezone=command.timezone;break;
    case 'import_batch':case 'undo': {
      const wanted=validateSnapshot(command.snapshot);
      // Tombstones preserve synchronization and receipts; never remove a row silently.
      const merged:Snapshot={...wanted,
        categories:[...next.categories.filter(c=>!wanted.categories.some(x=>x.id===c.id)).map(c=>({...c,archived_at:iso(now),version:c.version+1})),...wanted.categories.map(c=>({...c,version:Math.max(c.version,next.categories.find(x=>x.id===c.id)?.version??0)+1}))],
        intervals:[...next.intervals.filter(i=>!wanted.intervals.some(x=>x.id===i.id)).map(i=>({...i,deleted_at:iso(now),version:i.version+1})),...wanted.intervals.map(i=>({...i,version:Math.max(i.version,next.intervals.find(x=>x.id===i.id)?.version??0)+1}))]
      };
      return validateSnapshot(merged);
    }
  }
  const result=validateSnapshot(next);
  // Archived categories retain their historical references; new assignments require an active category.
  if('categoryId' in command && command.categoryId && !result.categories.some(c=>c.id===command.categoryId&&!c.archived_at)) throw Error('หมวดนี้ถูกเก็บถาวรแล้ว');
  if('secondaryCategoryId' in command && command.secondaryCategoryId && !result.categories.some(c=>c.id===command.secondaryCategoryId&&!c.archived_at)) throw Error('หมวดกิจกรรมร่วมนี้ถูกเก็บถาวรแล้ว');
  return result;
}

export function previewBoundary(s:Snapshot,id:string,start:number,end:number,adjustNeighbors:boolean){
  return reduce(s,{type:'adjust_boundary',id,start,end,adjustNeighbors});
}
export function mergeSnapshots(current:Snapshot,incoming:Snapshot,preferIncoming=false):Snapshot{
  const merge=<T extends {id:string;version:number}>(a:T[],b:T[])=>{
    const map=new Map(a.map(v=>[v.id,v]));
    for(const item of b){const old=map.get(item.id);if(old&&JSON.stringify(old)!==JSON.stringify(item)&&!preferIncoming) throw Error('มี ID เดิมแต่ข้อมูลต่างกัน กรุณาเลือกวิธีนำเข้า');map.set(item.id,item);}
    return [...map.values()];
  };
  const cursor=[current.cursor_at,incoming.cursor_at].filter((x):x is string=>!!x).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)??null;
  return validateSnapshot({categories:merge(current.categories,incoming.categories),intervals:merge(current.intervals,incoming.intervals),cursor_at:cursor,timezone:current.timezone});
}
