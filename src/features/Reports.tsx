import { useState } from 'react';
import { ChevronLeft,ChevronRight,CalendarDays } from 'lucide-react';
import type { Snapshot } from '../domain/model';
import { clock,dateKey,daySegments,duration,periodDates,shiftDate,shiftMonth,thaiDate,totals,type Segment } from '../domain/time';
import { Timeline,statusNames } from '../components/Timeline';
import { CategoryIcon } from '../components/Icon';
export function Reports({snapshot,now,onSelect}:{snapshot:Snapshot;now:number;onSelect:(s:Segment)=>void}){
  const today=dateKey(now,snapshot.timezone),[date,setDate]=useState(today),[mode,setMode]=useState<'day'|'week'|'month'>('day');
  const dates=periodDates(date,mode,today),summary=totals(snapshot,dates,now),rows=[...summary.byCategory.entries()].sort((a,b)=>b[1]-a[1]);
  function move(direction:number){setDate(mode==='month'?shiftMonth(date,direction):shiftDate(date,direction*(mode==='day'?1:7)));}
  return <div className="reports page-enter">
    <div className="page-heading"><div><p className="eyebrow">เห็นวันของคุณชัดขึ้น</p><h1>สรุปการใช้เวลา</h1></div><CalendarDays className="heading-icon" size={28}/></div>
    <div className="segmented" aria-label="ช่วงสรุป">{(['day','week','month'] as const).map((m,n)=><button key={m} className={mode===m?'selected':''} onClick={()=>setMode(m)}>{['วัน','สัปดาห์','เดือน'][n]}</button>)}</div>
    <div className="date-controls"><button className="icon-button" aria-label="ช่วงก่อนหน้า" onClick={()=>move(-1)}><ChevronLeft/></button><input aria-label="เลือกวันที่สรุป" type="date" value={date} onChange={e=>setDate(e.target.value)}/><button className="icon-button" aria-label="ช่วงถัดไป" onClick={()=>move(1)}><ChevronRight/></button><button className="text-button" onClick={()=>setDate(today)}>วันนี้</button></div>
    <section className="card"><div className="section-heading"><h2>{mode==='day'?thaiDate(date,true):`${dates.length?thaiDate(dates[0]):''} – ${dates.length?thaiDate(dates.at(-1)!):''}`}</h2>{dates.includes(today)&&<span className="pill">ถึงวันนี้</span>}</div>
      {!dates.length?<p className="muted">ยังไม่มีเวลาที่ผ่านไปในช่วงนี้</p>:dates.map(d=><Timeline key={d} snapshot={snapshot} date={d} now={now} onSelect={onSelect} compact={mode!=='day'}/>)}
      <div className="legend"><span><i className="legend-swatch pending"/>รอระบุ</span><span><i className="legend-swatch gap"/>ช่องว่าง</span><span><i className="legend-swatch open"/>กำลังเดิน</span><span><i className="legend-swatch future"/>อนาคต</span></div>
    </section>
    <section className="card"><div className="section-heading"><h2>เวลาของกิจกรรมหลัก</h2><span className="muted">{dates.length} วัน</span></div>
      <div className="table-wrap"><table><thead><tr><th>กิจกรรม</th><th>รวม</th>{mode!=='day'&&<th>เฉลี่ย/วัน</th>}<th>% {mode==='day'?'ของวัน':'ของช่วง'}</th></tr></thead><tbody>
      {rows.map(([id,ms])=>{const c=snapshot.categories.find(x=>x.id===id)!;return <tr key={id}><td><span className="table-category"><i style={{background:c.color}}/>{c.name}</span></td><td>{duration(ms,true)}</td>{mode!=='day'&&<td>{duration(ms/dates.length,true)}</td>}<td>{(ms/summary.denominator*100).toFixed(1)}%</td></tr>;})}
      {[[summary.pending,'รอระบุกิจกรรม'],[summary.gap,'ช่องว่าง · ยังไม่ระบุ'],[summary.open,'กำลังเดิน'],[summary.future,'เวลาที่ยังเหลือ']].filter(([ms])=>Number(ms)>0).map(([ms,name])=><tr className="muted" key={name}><td>{name}</td><td>{duration(Number(ms),true)}</td>{mode!=='day'&&<td>{duration(Number(ms)/dates.length,true)}</td>}<td>{summary.denominator?(Number(ms)/summary.denominator*100).toFixed(1):'0'}%</td></tr>)}
      </tbody></table></div>
      <p className="table-note">{mode==='day'?'เปอร์เซ็นต์คิดจากความยาววันจริง':'เปอร์เซ็นต์คิดจากความยาววันในช่วงถึงวันนี้ รวมเวลาที่ยังเหลือของวันนี้'} · รวมก่อนปัดตัวเลข</p>
    </section>
    <section className="card concurrent-report"><div className="section-heading"><h2>กิจกรรมร่วม</h2><span className="pill">แสดงแยกจากเวลารวม</span></div><p className="muted">เวลาที่ทำพร้อมกับกิจกรรมหลัก จึงไม่บวกเพิ่มในยอดรวมของวัน</p>
      {summary.bySecondaryCategory.size?<div className="table-wrap"><table aria-label="เวลาของกิจกรรมร่วม"><thead><tr><th>กิจกรรมร่วม</th><th>รวม</th>{mode!=='day'&&<th>เฉลี่ย/วัน</th>}</tr></thead><tbody>{[...summary.bySecondaryCategory.entries()].sort((a,b)=>b[1]-a[1]).map(([id,ms])=>{const c=snapshot.categories.find(x=>x.id===id)!;return <tr key={id}><td><span className="table-category"><i style={{background:c.color}}/>{c.name}</span></td><td>{duration(ms,true)}</td>{mode!=='day'&&<td>{duration(ms/dates.length,true)}</td>}</tr>;})}</tbody></table></div>:<p className="muted">ยังไม่มีกิจกรรมร่วมในช่วงนี้</p>}
    </section>
    {mode==='day'&&<section className="card"><h2>เรื่องราวของวันนี้</h2><div className="activity-list">{daySegments(snapshot,date,now).filter(r=>r.status!=='future').map((r,i)=>{const c=snapshot.categories.find(x=>x.id===r.categoryId);return <button key={i} className="activity-row" onClick={()=>onSelect(r)}><span className={`activity-icon ${r.status}`} style={{backgroundColor:c?`${c.color}25`:undefined,color:c?.color}}><CategoryIcon name={c?.icon??'circle'}/></span><span className="activity-info"><strong>{c?.name??statusNames[r.status]}</strong>{r.interval?.secondary_category_id&&<span className="secondary-activity">ร่วม: {snapshot.categories.find(c=>c.id===r.interval!.secondary_category_id)?.name}</span>}<small>{clock(r.start,snapshot.timezone)}–{clock(r.end,snapshot.timezone)}{r.interval?.note?` · ${r.interval.note}`:''}</small></span><span className="activity-duration">{duration(r.end-r.start,true)}</span><ChevronRight size={16}/></button>;})}</div></section>}
  </div>;
}
