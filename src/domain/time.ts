import { Temporal } from '@js-temporal/polyfill';
import { active, type Snapshot, type Interval } from './model';

export function dateKey(time:number,timezone:string){return Temporal.Instant.fromEpochMilliseconds(time).toZonedDateTimeISO(timezone).toPlainDate().toString();}
export function dayBounds(date:string,timezone:string){
  const d=Temporal.PlainDate.from(date);
  const start=d.toZonedDateTime(timezone).epochMilliseconds;
  const end=d.add({days:1}).toZonedDateTime(timezone).epochMilliseconds;
  return {start,end,length:end-start};
}
export function shiftDate(date:string,days:number){return Temporal.PlainDate.from(date).add({days}).toString();}
export function shiftMonth(date:string,months:number){return Temporal.PlainDate.from(date).add({months}).toString();}
export function periodDates(date:string,mode:'day'|'week'|'month',today:string){
  const d=Temporal.PlainDate.from(date);
  const start=mode==='week'?d.subtract({days:d.dayOfWeek-1}):mode==='month'?d.with({day:1}):d;
  const end=mode==='week'?start.add({days:6}):mode==='month'?start.add({months:1}).subtract({days:1}):d;
  const dates:string[]=[];
  for(let day=start;Temporal.PlainDate.compare(day,end)<=0;day=day.add({days:1})){
    if(day.toString()<=today) dates.push(day.toString());
  }
  return dates;
}
export type Segment={start:number;end:number;status:'assigned'|'pending'|'gap'|'open'|'future';interval?:Interval;categoryId?:string|null};
export function daySegments(s:Snapshot,date:string,now=Date.now()):Segment[]{
  const {start,end}=dayBounds(date,s.timezone);
  const rows:Segment[]=active(s).map(i=>({start:Math.max(start,Date.parse(i.start_at)),end:Math.min(end,Date.parse(i.end_at),now),status:i.category_id?'assigned':'pending',interval:i,categoryId:i.category_id}));
  if(s.cursor_at) rows.push({start:Math.max(start,Date.parse(s.cursor_at)),end:Math.min(end,now),status:'open'});
  const clipped=rows.filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start);
  const output:Segment[]=[];let cursor=start;
  for(const row of clipped){if(row.start>cursor) output.push({start:cursor,end:row.start,status:'gap'});output.push(row);cursor=row.end;}
  const elapsedEnd=Math.max(start,Math.min(end,now));
  if(cursor<elapsedEnd) output.push({start:cursor,end:elapsedEnd,status:'gap'});
  if(now<end) output.push({start:Math.max(now,start),end,status:'future'});
  return output;
}
export function totals(s:Snapshot,dates:string[],now=Date.now()){
  const byCategory=new Map<string,number>();let pending=0,gap=0,open=0,future=0,denominator=0;
  for(const date of dates){denominator+=dayBounds(date,s.timezone).length;
    for(const row of daySegments(s,date,now)){
      const ms=row.end-row.start;
      if(row.status==='assigned') byCategory.set(row.categoryId!, (byCategory.get(row.categoryId!)??0)+ms);
      else if(row.status==='pending') pending+=ms;else if(row.status==='gap') gap+=ms;else if(row.status==='open') open+=ms;else future+=ms;
    }
  }
  return {byCategory,pending,gap,open,future,denominator};
}
export function duration(ms:number,seconds=false){
  const total=Math.max(0,Math.floor(ms/1000)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;
  if(seconds&&h===0&&m===0) return `${s} วินาที`;
  return h?`${h} ชม. ${m} นาที`:`${m} นาที`;
}
export const clock=(value:string|number,timezone:string)=>new Intl.DateTimeFormat('th-TH',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
export const thaiDate=(date:string,full=false)=>new Intl.DateTimeFormat('th-TH',{timeZone:'UTC',weekday:full?'long':undefined,day:'numeric',month:full?'long':'short',year:'numeric'}).format(new Date(`${date}T12:00:00Z`));
export function inputTime(time:string|number,timezone:string){return Temporal.Instant.from(new Date(time).toISOString()).toZonedDateTimeISO(timezone).toPlainDateTime().toString({smallestUnit:'minute'});}
export function parseInput(value:string,timezone:string){return Temporal.PlainDateTime.from(value).toZonedDateTime(timezone,{disambiguation:'reject'}).epochMilliseconds;}
