import { z } from 'zod';
import { SnapshotSchema, operationTypes, validateSnapshot, type LocalState, type Snapshot } from '../domain/model';
import { dateKey } from '../domain/time';

const BackupSchema=z.object({
  app_id:z.literal('daytrace'),schema_version:z.union([z.literal(1),z.literal(2)]),exported_at:z.string().datetime({offset:true}),
  timezone:z.string(),snapshot:SnapshotSchema,
  sync_status:z.enum(['synced','unsynced','local']),
  pending_operations:z.array(z.object({operation_id:z.string().uuid(),expected_revision:z.number().int().nonnegative(),type:z.enum(operationTypes),payload:SnapshotSchema,created_at:z.string().datetime({offset:true}),device_id:z.string().uuid(),protocol_version:z.union([z.literal(1),z.literal(2)]).optional()}).strict()).max(50000)
}).strict();
export type Backup=z.infer<typeof BackupSchema>;
export function makeBackup(state:LocalState,cloud:boolean):Backup{
  // Explicit field allowlist: sessions, tokens and secrets cannot enter the export.
  return {app_id:'daytrace',schema_version:2,exported_at:new Date().toISOString(),timezone:state.view.timezone,snapshot:state.view,sync_status:cloud?(state.outbox.length?'unsynced':'synced'):'local',pending_operations:state.outbox};
}
export function parseBackup(text:string):Backup{
  if(new TextEncoder().encode(text).length>20*1024*1024) throw Error('รองรับไฟล์ JSON ขนาดไม่เกิน 20 MB');
  const result=BackupSchema.parse(JSON.parse(text));validateSnapshot(result.snapshot);
  if(result.timezone!==result.snapshot.timezone) throw Error('เขตเวลาในไฟล์ไม่ตรงกัน');
  if(result.snapshot.cursor_at&&Date.parse(result.snapshot.cursor_at)>Date.now()) throw Error('เวลาเริ่มช่วงเปิดอยู่ในอนาคต กรุณาตรวจนาฬิกา');
  for(const i of result.snapshot.intervals) if(Date.parse(i.end_at)>Date.now()) throw Error('ไฟล์มีช่วงเวลาอนาคต');
  // Never replay exported operations. Restore from validated records with a fresh import operation.
  return result;
}
export function csvCell(value:string){
  const safe=/^[\s\u0000-\u001f]*[=+\-@]/.test(value)||/^[\t\r\n]/.test(value)?`'${value}`:value;
  return `"${safe.replaceAll('"','""')}"`;
}
export function makeCsv(s:Snapshot){
  const header=['id','start_iso','end_iso','local_date_start','category','note','duration_seconds','reporting_timezone','status','secondary_category'];
  const rows=s.intervals.filter(i=>!i.deleted_at).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at)).map(i=>[
    i.id,i.start_at,i.end_at,dateKey(Date.parse(i.start_at),s.timezone),s.categories.find(c=>c.id===i.category_id)?.name??'',i.note,String((Date.parse(i.end_at)-Date.parse(i.start_at))/1000),s.timezone,i.category_id?'assigned':'pending',s.categories.find(c=>c.id===i.secondary_category_id)?.name??''
  ]);
  return '\uFEFF'+[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');
}
export function download(data:string,name:string,type:string){
  const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function backupName(timezone:string){
  const now=new Date();const time=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now).replace(':','');
  return `DayTrace_backup_${dateKey(now.getTime(),timezone)}_${time}.json`;
}
