import type { Snapshot } from '../domain/model';
import { clock, dayBounds, daySegments, duration, thaiDate, type Segment } from '../domain/time';
export const statusNames={assigned:'ระบุแล้ว',pending:'รอระบุกิจกรรม',gap:'ช่องว่าง · ยังไม่ระบุ',open:'กำลังเดิน',future:'เวลาที่ยังมาไม่ถึง'};
export function Timeline({snapshot,date,now,onSelect,compact=false}:{snapshot:Snapshot;date:string;now:number;onSelect:(s:Segment)=>void;compact?:boolean}){
  const bounds=dayBounds(date,snapshot.timezone),segments=daySegments(snapshot,date,now);
  return <div className={compact?'dayline compact':'dayline'}>
    {compact&&<span className="dayline-date">{thaiDate(date)}</span>}
    <div className="dayline-main">
      {!compact&&<div className="time-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>}
      <div className="timeline" role="group" aria-label={`แถบเวลาวันที่ ${thaiDate(date)} ${duration(bounds.length)}`}>
        {segments.map((row,n)=>{
          const category=snapshot.categories.find(c=>c.id===row.categoryId);
          const label=`${category?.name??statusNames[row.status]} ${clock(row.start,snapshot.timezone)}–${clock(row.end,snapshot.timezone)} ${duration(row.end-row.start,true)}`;
          return <button key={n} className={`segment ${row.status}`} style={{width:`${(row.end-row.start)/bounds.length*100}%`,backgroundColor:category?.color}} aria-label={label} title={label} onClick={()=>onSelect(row)}/>;
        })}
      </div>
      {bounds.length!==86400000&&<small className="muted">วันนี้ยาว {bounds.length/3600000} ชั่วโมงตามเขตเวลา (DST)</small>}
    </div>
  </div>;
}
