import { useState } from 'react';
import { Scissors, Link2, Trash2, Clock3, Check, Bookmark } from 'lucide-react';
import type { Snapshot } from '../domain/model';
import type { Command } from '../domain/operations';
import { previewBoundary } from '../domain/operations';
import { active } from '../domain/model';
import { clock,duration,inputTime,parseInput } from '../domain/time';
import { Modal } from '../components/Modal';
import { CategoryIcon } from '../components/Icon';

export function Editor({snapshot,id,run,onClose}:{snapshot:Snapshot;id:string;run:(c:Command,label:string)=>Promise<void>;onClose:()=>void}){
  const interval=snapshot.intervals.find(i=>i.id===id&&!i.deleted_at)!;
  const [categoryId,setCategoryId]=useState<string|null>(interval?.category_id??null),[note,setNote]=useState(interval?.note??'');
  const [secondaryCategoryId,setSecondaryCategoryId]=useState<string|null>(interval?.secondary_category_id??null);
  const [openedSnapshot]=useState(()=>JSON.stringify(snapshot));
  const [tool,setTool]=useState<'main'|'split'|'boundary'|'merge'>('main');
  const [start,setStart]=useState(inputTime(interval?.start_at??Date.now(),snapshot.timezone)),[end,setEnd]=useState(inputTime(interval?.end_at??Date.now(),snapshot.timezone));
  const [split,setSplit]=useState(inputTime(interval?(Date.parse(interval.start_at)+Date.parse(interval.end_at))/2:Date.now(),snapshot.timezone));
  const [adjust,setAdjust]=useState(true),[preview,setPreview]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[mergeId,setMergeId]=useState('');
  if(!interval)return null;
  const categories=snapshot.categories.filter(c=>!c.archived_at).sort((a,b)=>Number(b.is_pinned)-Number(a.is_pinned)||a.sort_order-b.sort_order);
  const neighbors=active(snapshot).filter(i=>i.id!==id&&(i.start_at===interval.end_at||i.end_at===interval.start_at));
  async function commit(command:Command,label:string){setBusy(true);setError('');try{if(JSON.stringify(snapshot)!==openedSnapshot)throw Error('ข้อมูลเปลี่ยนระหว่างแก้ไข กรุณาปิดแล้วเปิดช่วงนี้ใหม่เพื่อดูข้อมูลล่าสุด');await run(command,label);onClose();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  return <Modal title={interval.category_id?'แก้ไขกิจกรรม':'เมื่อกี้ทำอะไร?'} onClose={onClose}>
    <div className="frozen-time"><Clock3 size={20}/><div><strong>{clock(interval.start_at,snapshot.timezone)} – {clock(interval.end_at,snapshot.timezone)}</strong><span>{duration(Date.parse(interval.end_at)-Date.parse(interval.start_at),true)} · เวลาถูกเก็บไว้แล้ว</span></div></div>
    {error&&<p className="error" role="alert">{error}</p>}
    {tool==='main'?<>
      <p className="field-title">กิจกรรมหลัก</p>
      <div className="category-grid">{categories.map(c=><button key={c.id} className={`category-choice ${categoryId===c.id?'selected':''}`} onClick={()=>{setCategoryId(c.id);if(secondaryCategoryId===c.id)setSecondaryCategoryId(null);}} aria-pressed={categoryId===c.id}>
        <span className="category-icon" style={{backgroundColor:`${c.color}25`,color:c.color}}><CategoryIcon name={c.icon}/></span><span>{c.name}</span>{categoryId===c.id?<Check size={17}/>:c.is_pinned?<Bookmark size={13}/>:null}
      </button>)}</div>
      <label className="field">กิจกรรมร่วม <span className="muted">(ไม่บังคับ)</span><select aria-label="กิจกรรมร่วม" value={secondaryCategoryId??''} disabled={!categoryId} onChange={e=>setSecondaryCategoryId(e.target.value||null)}><option value="">ไม่มีกิจกรรมร่วม</option>{categories.filter(c=>c.id!==categoryId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <p className="muted secondary-activity-help">ทำพร้อมกันตลอดช่วงนี้ · นับเวลารวมครั้งเดียว และสรุปเวลาร่วมแยก</p>
      <label className="field">รายละเอียด <span className="muted">(ไม่บังคับ)</span><textarea value={note} maxLength={1000} onChange={e=>setNote(e.target.value)} rows={3} placeholder="เติมเรื่องเล็ก ๆ ของช่วงเวลานี้…"/></label>
      <small className="muted counter">{note.length}/1,000</small>
      <button className="primary full" disabled={busy||!categoryId} onClick={()=>void commit({type:'assign',id,categoryId,secondaryCategoryId,note},'ระบุกิจกรรม')}><Check size={20}/>บันทึกกิจกรรม</button>
      <button className="text-button full" onClick={onClose}>ไว้ระบุทีหลัง</button>
      <div className="editor-tools">
        <button className="secondary" onClick={()=>setTool('split')}><Scissors size={17}/>แบ่งช่วงเวลา</button>
        <button className="secondary" onClick={()=>setTool('boundary')}><Clock3 size={17}/>แก้เวลา</button>
        {!!neighbors.length&&<button className="secondary" onClick={()=>setTool('merge')}><Link2 size={17}/>รวมช่วง</button>}
        <button className="danger subtle" disabled={busy} onClick={()=>{if(confirm('ลบกิจกรรมนี้? เวลาจะกลายเป็นช่องว่าง และกู้คืนได้ภายใน 30 วัน'))void commit({type:'soft_delete',id,at:Date.now()},'ลบกิจกรรม');}}><Trash2 size={17}/>ลบ</button>
      </div>
      {interval.category_id&&<button className="text-button full" disabled={busy} onClick={()=>void commit({type:'assign',id,categoryId:null,note},'คืนเป็นรอระบุ')}>เปลี่ยนเป็นรอระบุกิจกรรม</button>}
    </>:<>
      <button className="text-button" onClick={()=>{setTool('main');setPreview(null);setError('');}}>← กลับไปเลือกกิจกรรม</button>
      {tool==='split'&&<><p>แบ่งเป็นสองช่วงโดยเวลารวมเท่าเดิม จากนั้นเปิดแต่ละช่วงเพื่อเลือกกิจกรรม</p><label className="field">จุดแบ่ง ({snapshot.timezone})<input type="datetime-local" value={split} onChange={e=>setSplit(e.target.value)}/></label><button className="primary full" disabled={busy} onClick={()=>{try{void commit({type:'split',id,at:parseInput(split,snapshot.timezone),newId:crypto.randomUUID()},'แบ่งช่วงเวลา');}catch(e){setError(String(e));}}}>ยืนยันแบ่งช่วงเวลา</button></>}
      {tool==='boundary'&&<>
        <label className="field">เริ่ม ({snapshot.timezone})<input type="datetime-local" value={start} onChange={e=>{setStart(e.target.value);setPreview(null);}}/></label>
        <label className="field">สิ้นสุด<input type="datetime-local" value={end} onChange={e=>{setEnd(e.target.value);setPreview(null);}}/></label>
        <label className="check-field"><input type="checkbox" checked={adjust} onChange={e=>{setAdjust(e.target.checked);setPreview(null);}}/>ปรับขอบร่วมกับช่วงที่ติดกัน</label>
        <button className="secondary full" onClick={()=>{try{setPreview(previewBoundary(snapshot,id,parseInput(start,snapshot.timezone),parseInput(end,snapshot.timezone),adjust));setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}>ดูผลก่อนบันทึก</button>
        {preview&&<div className="notice"><strong>ช่วงที่จะเปลี่ยน</strong>{preview.intervals.filter(i=>JSON.stringify(i)!==JSON.stringify(snapshot.intervals.find(x=>x.id===i.id))).map(i=><p key={i.id}>{snapshot.categories.find(c=>c.id===i.category_id)?.name??'รอระบุ'} · {clock(i.start_at,snapshot.timezone)}–{clock(i.end_at,snapshot.timezone)} · {duration(Date.parse(i.end_at)-Date.parse(i.start_at),true)}</p>)}</div>}
        <button className="primary full" disabled={busy||!preview} onClick={()=>void commit({type:'adjust_boundary',id,start:parseInput(start,snapshot.timezone),end:parseInput(end,snapshot.timezone),adjustNeighbors:adjust},'แก้ขอบเวลา')}>ยืนยันแก้เวลาตามที่แสดง</button>
      </>}
      {tool==='merge'&&<><p>กิจกรรมหลัก กิจกรรมร่วม และรายละเอียดที่เลือกในหน้าก่อน จะใช้กับช่วงที่รวมทั้งหมด</p>{neighbors.map(i=><label key={i.id} className="radio-row"><input type="radio" name="merge" checked={mergeId===i.id} onChange={()=>setMergeId(i.id)}/><span>{clock(i.start_at,snapshot.timezone)}–{clock(i.end_at,snapshot.timezone)} · {snapshot.categories.find(c=>c.id===i.category_id)?.name??'รอระบุ'}<small>{i.note||'ไม่มีรายละเอียด'}</small></span></label>)}<div className="notice">หลังรวม: {categories.find(c=>c.id===categoryId)?.name??'รอระบุ'}<br/>กิจกรรมร่วม: {categories.find(c=>c.id===secondaryCategoryId)?.name??'ไม่มี'}<br/>รายละเอียด: {note||'ไม่มีรายละเอียด'}</div><button className="primary full" disabled={busy||!mergeId} onClick={()=>void commit({type:'merge',ids:[id,mergeId],categoryId,secondaryCategoryId,note},'รวมช่วงเวลา')}>ยืนยันรวมช่วงและใช้รายละเอียดนี้</button></>}
    </>}
  </Modal>;
}
