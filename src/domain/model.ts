import { z } from 'zod';

const stamp = z.string().datetime({ offset: true }).refine(v => Number.isFinite(Date.parse(v))).transform(v=>new Date(v).toISOString());
const uuid = z.string().uuid();
export const CategorySchema = z.object({
  id: uuid, name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(40), sort_order: z.number().int().nonnegative(), is_pinned: z.boolean(),
  archived_at: stamp.nullable(), version: z.number().int().positive()
}).strict();
export const IntervalSchema = z.object({
  id: uuid, start_at: stamp, end_at: stamp, category_id: uuid.nullable(),
  note: z.string().max(1000), version: z.number().int().positive(), deleted_at: stamp.nullable()
}).strict();
export const SnapshotSchema = z.object({
  categories: z.array(CategorySchema).max(500), intervals: z.array(IntervalSchema).max(50000),
  cursor_at: stamp.nullable(), timezone: z.string().max(80).refine(v => {
    try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; }
  })
}).strict();
export type Category = z.infer<typeof CategorySchema>;
export type Interval = z.infer<typeof IntervalSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export const operationTypes = ['initialize','capture','assign','split','merge','adjust_boundary','soft_delete','restore','undo','category_update','import_batch','fill_gap','profile_update'] as const;
export type OperationType = typeof operationTypes[number];
export interface Patch { categories: Category[]; intervals: Interval[]; cursor_at: string | null; timezone: string }
export interface Operation { operation_id: string; expected_revision: number; type: OperationType; payload: Patch; created_at: string; device_id: string }
export interface History { before: Snapshot; after_revision: number; label: string; created_at: string }
export interface LocalState {
  id: 'state'; canonical: Snapshot; view: Snapshot; revision: number; outbox: Operation[];
  history: History[]; lastSyncedAt: string | null; lastExportedAt: string | null;
  deviceId: string; conflict: { message: string; remote: Snapshot; revision: number } | null;
}
export const active = (s: Snapshot) => s.intervals.filter(i => !i.deleted_at).sort((a,b) => Date.parse(a.start_at)-Date.parse(b.start_at));
export const iso = (n: number) => new Date(n).toISOString();

export function validateSnapshot(input: unknown): Snapshot {
  const s = SnapshotSchema.parse(input);
  const cats = new Set(s.categories.map(c => c.id));
  if (cats.size !== s.categories.length || new Set(s.intervals.map(i => i.id)).size !== s.intervals.length) throw Error('มีรหัสข้อมูลซ้ำ');
  for (const i of s.intervals) {
    if (Date.parse(i.end_at) <= Date.parse(i.start_at)) throw Error('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
    if (i.category_id && !cats.has(i.category_id)) throw Error('ไม่พบหมวดกิจกรรมที่อ้างถึง');
    if (!i.deleted_at && (!s.cursor_at || Date.parse(i.end_at) > Date.parse(s.cursor_at))) throw Error('ช่วงเวลาล้ำเข้าไปในช่วงกำลังเดิน');
  }
  const intervals = active(s);
  for (let n=1;n<intervals.length;n++) if (Date.parse(intervals[n].start_at)<Date.parse(intervals[n-1].end_at)) throw Error('ช่วงเวลาซ้อนกัน กรุณาแก้ไขก่อน');
  return s;
}

const seeds = [
  ['นอน','#9B8AF0','moon'], ['ทำงาน','#58B98A','briefcase'], ['กินข้าว','#F69B43','utensils'],
  ['ดูแลตัวเอง','#D8B85E','sun'], ['เดินทาง','#619DEA','car'], ['พักผ่อน','#EE99AF','coffee'],
  ['เรียนรู้','#58ADAC','book'], ['ออกกำลัง','#EC7180','heart'], ['งานบ้าน / ธุระ','#A18A74','home'],
  ['ครอบครัว / สังคม','#A778C1','users'], ['อื่น ๆ','#83929B','circle']
];
export const initialSnapshot = (): Snapshot => ({
  categories: seeds.map(([name,color,icon],i) => ({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name,color,icon,sort_order:i,is_pinned:i<3,archived_at:null,version:1})),
  intervals: [], cursor_at: null, timezone: 'Asia/Bangkok'
});
export function patchBetween(before: Snapshot, after: Snapshot): Patch {
  return {
    categories: after.categories.filter(c => JSON.stringify(c)!==JSON.stringify(before.categories.find(x=>x.id===c.id))),
    intervals: after.intervals.filter(i => JSON.stringify(i)!==JSON.stringify(before.intervals.find(x=>x.id===i.id))),
    cursor_at: after.cursor_at, timezone: after.timezone
  };
}
export function applyPatch(s: Snapshot, p: Patch): Snapshot {
  const upsert = <T extends {id: string}>(old:T[], next:T[]) => [...old.filter(x=>!next.some(y=>y.id===x.id)),...next];
  return validateSnapshot({ categories:upsert(s.categories,p.categories), intervals:upsert(s.intervals,p.intervals),cursor_at:p.cursor_at,timezone:p.timezone });
}
