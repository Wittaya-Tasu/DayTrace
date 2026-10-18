import { useEffect,useRef,useState } from 'react';
import { liveQuery } from 'dexie';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Clock3,ChartNoAxesCombined,Settings as SettingsIcon,ArrowUpRight,Plus,ChevronRight,Undo2,Leaf,CloudCheck,WifiOff,ArrowRight,CalendarDays,AlertCircle,Download } from 'lucide-react';
import { Repository } from './data/local';
import { configured,environmentId,ownerAllowed,seedIfEmpty,signIn,supabase,transport } from './data/remote';
import { SyncEngine,type SyncStatus } from './sync/engine';
import type { LocalState } from './domain/model';
import { active } from './domain/model';
import type { Command } from './domain/operations';
import { clock,dateKey,dayBounds,duration,inputTime,parseInput,thaiDate,totals,type Segment } from './domain/time';
import { backupName,download,makeBackup } from './backup/backup';
import { Timeline } from './components/Timeline';
import { Modal } from './components/Modal';
import { CategoryIcon } from './components/Icon';
import { Editor } from './features/Editor';
import { Reports } from './features/Reports';
import { Settings,statusText } from './features/Settings';

type Account={repo:Repository;cloud:boolean;email?:string;userId?:string};
export default function App(){
  const [account,setAccount]=useState<Account|null>(null),[state,setState]=useState<LocalState|null>(null),[booting,setBooting]=useState(true),[authError,setAuthError]=useState(''),[waiting,setWaiting]=useState(false);
  const [signedInId,setSignedInId]=useState<string|null>(null);
  const [tab,setTab]=useState<'capture'|'reports'|'settings'>('capture'),[now,setNow]=useState(Date.now()),[status,setStatus]=useState<SyncStatus>('local'),[toast,setToast]=useState(''),[busy,setBusy]=useState(false),[editor,setEditor]=useState<string|null>(null),[startOpen,setStartOpen]=useState(false),[gap,setGap]=useState<Segment|null>(null);
  const engine=useRef<SyncEngine|null>(null),captureLock=useRef(false),activeUser=useRef<string|null>(null);
  const {needRefresh:[needsUpdate],offlineReady:[offlineReady],updateServiceWorker}=useRegisterSW();
  const notify=(message:string)=>setToast(message);
  const localMode=()=>{localStorage.setItem('daytrace-mode','development');activeUser.current='development';setAccount({repo:new Repository('development'),cloud:false});setWaiting(false);setAuthError('');setBooting(false);};

  useEffect(()=>{
    let cancelled=false;
    async function load(){
      try{
        if(localStorage.getItem('daytrace-mode')==='development'){if(!cancelled)localMode();return;}
        if(!supabase){if(!cancelled){setBooting(false);}return;}
        const {data:{session},error}=await supabase.auth.getSession();if(error)throw error;
        if(cancelled)return;
        if(!session){activeUser.current=null;setSignedInId(null);setAccount(null);setState(null);setWaiting(false);setBooting(false);return;}
        setSignedInId(session.user.id);
        if(activeUser.current===session.user.id){setBooting(false);return;}
        const cacheKey=`daytrace-owner:${environmentId}:${session.user.id}`;
        let allowed=false;
        try{allowed=await ownerAllowed();if(allowed)localStorage.setItem(cacheKey,'verified');else localStorage.removeItem(cacheKey);}
        catch(e){if(localStorage.getItem(cacheKey)==='verified'){allowed=true;setStatus('unavailable');}else throw e;}
        if(cancelled)return;
        if(!allowed){setWaiting(true);setAccount(null);setState(null);setBooting(false);return;}
        const repo=new Repository(`${environmentId}:${session.user.id}`,true);
        const local=await repo.state();
        if(navigator.onLine&&!local.outbox.length){
          try{const remote=await seedIfEmpty(transport(session.user.id),local.deviceId);await repo.pull(remote.snapshot,remote.revision);}
          catch{setStatus('unavailable');}
        }
        if(cancelled)return;
        activeUser.current=session.user.id;setWaiting(false);setAccount({repo,cloud:true,email:session.user.email,userId:session.user.id});setBooting(false);
      }catch(e){if(!cancelled){setAuthError(e instanceof Error?e.message:String(e));setBooting(false);}}
    }
    void load();
    const {data:subscription}=supabase?.auth.onAuthStateChange(()=>{setTimeout(()=>{if(!cancelled)void load();},0);})??{data:null};
    return ()=>{cancelled=true;subscription?.subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!account)return;
    setState(null);
    let alive=true;
    let subscription:{unsubscribe:()=>void}|undefined;
    void account.repo.state().then(()=>{
      if(!alive)return;
      subscription=liveQuery(()=>account.repo.db.states.get('state')).subscribe({next:s=>{if(s)setState(s);},error:e=>notify(`เปิดที่เก็บข้อมูลไม่สำเร็จ: ${e.message} กรุณาอนุญาตพื้นที่จัดเก็บ`)});
    }).catch(e=>notify(`เปิดที่เก็บข้อมูลไม่สำเร็จ: ${e.message} กรุณาอนุญาตพื้นที่จัดเก็บ`));
    if(account.cloud&&account.userId){engine.current=new SyncEngine(account.repo,transport(account.userId),(next,message)=>{setStatus(next);if(message&&next!=='unavailable')notify(message);});void engine.current.sync();}
    else setStatus('local');
    const online=()=>engine.current?.schedule(),foreground=()=>{setNow(Date.now());if(document.visibilityState==='visible')engine.current?.schedule();};
    window.addEventListener('online',online);document.addEventListener('visibilitychange',foreground);
    const offline=()=>setStatus(account.cloud?'offline':'local');window.addEventListener('offline',offline);
    return ()=>{alive=false;subscription?.unsubscribe();engine.current?.stop();engine.current=null;window.removeEventListener('online',online);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',foreground);};
  },[account]);
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(id);},[]);
  useEffect(()=>{if(toast){const id=setTimeout(()=>setToast(''),6500);return ()=>clearTimeout(id);}},[toast]);
  async function login(){try{localStorage.removeItem('daytrace-mode');await signIn();}catch(e){notify(e instanceof Error?e.message:String(e));}}
  async function run(command:Command,label:string){
    if(!account)throw Error('ยังไม่พร้อม');
    await account.repo.mutate(command,label);
    if(account.cloud){setStatus('pending');engine.current?.schedule();}
  }
  async function capture(){
    const at=Date.now();if(captureLock.current||!state)return;
    if(!state.view.cursor_at){setStartOpen(true);return;}
    captureLock.current=true;setBusy(true);const id=crypto.randomUUID();
    try{await run({type:'capture',at,id},'บันทึกเวลา');setEditor(id);notify('เก็บเวลาในเครื่องแล้ว');}
    catch(e){notify(e instanceof Error?e.message:String(e));}
    finally{captureLock.current=false;setBusy(false);}
  }
  async function undo(){if(!account)return;try{await account.repo.undo();engine.current?.schedule();notify('ย้อนกลับรายการล่าสุดแล้ว');}catch(e){notify(e instanceof Error?e.message:String(e));}}
  async function logout(){
    if(!account||!supabase)return;
    const current=await account.repo.state();
    if(current.outbox.length){if(!confirm(`มี ${current.outbox.length} รายการยังไม่ส่ง กดตกลงเพื่อส่งออกไฟล์สำรองก่อนออกจากระบบ คิวจะเก็บไว้ในเครื่องสำหรับบัญชีเดิม`))return;download(JSON.stringify(makeBackup(current,true),null,2),backupName(current.view.timezone),'application/json');}
    engine.current?.stop();const {error}=await supabase.auth.signOut();if(error){notify(error.message);return;}
    setAccount(null);setState(null);activeUser.current=null;
  }
  function selectSegment(row:Segment){if(row.interval)setEditor(row.interval.id);else if(row.status==='gap')setGap(row);else notify(row.status==='open'?'ช่วงนี้กำลังเดิน กดบันทึกเวลาเมื่อจบกิจกรรม':'เวลาช่วงนี้ยังมาไม่ถึง');}
  if(booting)return <div className="boot"><Leaf className="brand-symbol"/><h1>DayTrace</h1><p>กำลังเปิดวันของคุณ…</p></div>;
  if(!account)return <main className="welcome"><div className="welcome-mark"><Leaf size={38}/></div><span className="eyebrow">DAYTRACE · วันของฉัน</span><h1>ทุกช่วงเวลา<br/>เป็นเรื่องราวของคุณ<span>.</span></h1><p className="welcome-copy">กดบันทึกสิ่งที่เพิ่งทำ<br/>แล้วค่อย ๆ มองเห็นว่า วันหนึ่งผ่านไปกับอะไร</p><div className="welcome-preview"><Clock3/><span>กดเมื่อจบช่วง → เลือกกิจกรรม → เห็นภาพทั้งวัน</span></div>
      {waiting&&<div className="notice"><strong>บัญชีนี้ยังไม่ได้รับอนุญาต</strong><p>เข้าสู่ระบบสำเร็จแล้ว แต่ต้องเพิ่มบัญชีเจ้าของใน Supabase ก่อน จึงอ่านหรือบันทึกข้อมูลบนคลาวด์ได้</p>{signedInId&&<label className="field">รหัสบัญชีสำหรับอนุญาตเจ้าของ<input aria-label="รหัสบัญชี Supabase ของคุณ" readOnly value={signedInId}/></label>}<button className="secondary full" onClick={()=>location.reload()}>ตรวจสิทธิ์อีกครั้ง</button><button className="text-button full" onClick={()=>void supabase?.auth.signOut()}>เปลี่ยนบัญชี</button></div>}
      {authError&&<p className="error" role="alert">{authError}</p>}
      <button className="primary full" disabled={!configured} onClick={()=>void login()}>เข้าสู่ระบบด้วย Google <ArrowRight size={20}/></button>{!configured&&<small className="muted">ยังไม่ได้ตั้งค่า Supabase · ใช้โหมดพัฒนาด้านล่างก่อนได้</small>}
      <button className="secondary full" onClick={localMode}>ทดลองบันทึกในเครื่องนี้</button><small className="welcome-footnote">ข้อมูลในโหมดพัฒนาแยกจากบัญชีคลาวด์<br/>ส่งออก JSON แล้วย้ายเข้าในบัญชีได้ภายหลัง</small>{toast&&<p role="status">{toast}</p>}
    </main>;
  if(!state)return <main className="boot"><Leaf/><p>กำลังเปิดข้อมูลในเครื่อง…</p>{toast&&<p role="alert">{toast}</p>}</main>;
  const s=state.view,today=dateKey(now,s.timezone),summary=totals(s,[today],now),assigned=[...summary.byCategory.values()].reduce((a,b)=>a+b,0),pending=active(s).filter(i=>!i.category_id),recent=active(s).slice(-5).reverse();
  const lastUndo=state.history.at(-1),canUndo=lastUndo?.after_revision===state.revision+state.outbox.length&&!state.conflict;
  const backupDue=!state.lastExportedAt||now-Date.parse(state.lastExportedAt)>7*86400000;
  const currentStatus=state.conflict?'conflict':account.cloud&&state.outbox.length&&status==='synced'?'pending':status;
  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="#capture" onClick={()=>setTab('capture')}><span className="brand-logo"><Leaf size={24}/></span><span>DayTrace<small>วันของฉัน</small></span></a><button className={`sync-badge ${currentStatus}`} onClick={()=>setTab('settings')}>{currentStatus==='offline'?<WifiOff size={15}/>:currentStatus==='synced'?<CloudCheck size={16}/>:<span className="status-dot"/>}<span>{statusText[currentStatus]}</span></button></header>
    <main className="app-main">
      {needsUpdate&&<div className="notice update-notice"><span>มี DayTrace เวอร์ชันใหม่ พร้อมอัปเดตเมื่อคุณบันทึกเสร็จ</span><button className="secondary" disabled={busy||!!editor||startOpen||!!gap} onClick={()=>{if(confirm('แนะนำให้ส่งออก JSON ก่อนอัปเดต ยืนยันเปิดแอพเวอร์ชันใหม่?'))void updateServiceWorker(true);}}>อัปเดตแอพ</button></div>}
      {state.conflict&&<button className="error full" onClick={()=>setTab('settings')}><AlertCircle size={18}/>ข้อมูลสองเครื่องขัดแย้ง · ไปตั้งค่าเพื่อเลือกข้อมูลที่จะใช้</button>}
      {tab==='capture'&&<div className="page-enter"><div className="page-heading"><div><p className="eyebrow">เก็บเรื่องราวระหว่างวัน</p><h1>วันนี้ของคุณ<span className="heading-period">.</span></h1><p className="date-line"><CalendarDays size={16}/>{thaiDate(today,true)}</p></div><span className="today-stamp">{new Intl.DateTimeFormat('en',{timeZone:s.timezone,day:'2-digit'}).format(new Date(now))}<small>{new Intl.DateTimeFormat('th-TH',{timeZone:s.timezone,month:'short'}).format(new Date(now))}</small></span></div>
        <div className="capture-layout"><section className="capture-card"><div className="capture-top"><span className="light-label"><span className="live-dot"/>{s.cursor_at?'จากการกดครั้งล่าสุด':'เริ่มต้นวันของคุณ'}</span><Clock3 size={22}/></div><div className="elapsed">{s.cursor_at?duration(Math.max(0,now-Date.parse(s.cursor_at)),true):'พร้อมเมื่อคุณพร้อม'}</div><p className="capture-range">{s.cursor_at?`${clock(s.cursor_at,s.timezone)} – ${clock(now,s.timezone)}`:'เริ่มเก็บเวลา แล้วกลับมาบันทึกเมื่อจบกิจกรรม'}</p><p className="capture-hint">{s.cursor_at?'ช่วงนี้ยังไม่ระบุกิจกรรม':'เลือกเวลาเริ่มย้อนหลังได้'}</p><button className="capture-button" disabled={busy||!!state.conflict} onClick={()=>void capture()}><span className="capture-plus"><Plus size={25}/></span>{busy?'กำลังเก็บเวลา…':s.cursor_at?'บันทึกเวลา':'เริ่มติดตาม'}<ArrowUpRight size={24}/></button><p className="capture-footnote">{s.cursor_at?'กดแล้วเลือกสิ่งที่เพิ่งทำ':'ยังไม่สร้างกิจกรรม จนกว่าจะกดบันทึกครั้งถัดไป'}</p></section>
        <section className="day-overview card"><div className="section-heading"><h2>ภาพรวมวันนี้</h2><span className="pill">{dayBounds(today,s.timezone).length/3600000} ชั่วโมง</span></div><div className="overview-value">{duration(assigned)}<span>ระบุกิจกรรมแล้ว</span></div><Timeline snapshot={s} date={today} now={now} onSelect={selectSegment}/><div className="mini-stats"><div><i className="stat-dot green"/><strong>{summary.byCategory.size}</strong><span>กิจกรรม</span></div><div><i className="stat-dot amber"/><strong>{pending.length}</strong><span>ช่วงรอระบุ</span></div></div><button className="text-button overview-link" onClick={()=>setTab('reports')}>ดูสรุปทั้งหมด <ArrowRight size={17}/></button></section></div>
        {!!pending.length&&<button className="pending-banner" onClick={()=>setEditor(pending[0].id)}><span className="pending-clock"><Clock3 size={23}/></span><span><strong>มี {pending.length} ช่วงรอระบุกิจกรรม</strong><small>เวลาเก็บไว้แล้ว กลับมาเติมเมื่อพร้อม</small></span><ChevronRight size={20}/></button>}
        <section className="card recent-card"><div className="section-heading"><h2>กิจกรรมล่าสุด</h2><button className="text-button" onClick={()=>setTab('reports')}>ดูทั้งวัน <ChevronRight size={16}/></button></div>{recent.length?<div className="activity-list">{recent.map(i=>{const c=s.categories.find(c=>c.id===i.category_id);return <button key={i.id} className="activity-row" onClick={()=>setEditor(i.id)}><span className={`activity-icon ${c?'':'pending'}`} style={{backgroundColor:c?`${c.color}25`:undefined,color:c?.color}}><CategoryIcon name={c?.icon??'circle'}/></span><span className="activity-info"><strong>{c?.name??'รอระบุกิจกรรม'}</strong><small>{clock(i.start_at,s.timezone)} – {clock(i.end_at,s.timezone)}{dateKey(Date.parse(i.start_at),s.timezone)!==today?` · ${thaiDate(dateKey(Date.parse(i.start_at),s.timezone))}`:''}{i.note?` · ${i.note}`:''}</small></span><span className="activity-duration">{duration(Date.parse(i.end_at)-Date.parse(i.start_at),true)}</span><ChevronRight size={16}/></button>;})}</div>:<div className="empty-state"><span className="empty-icon"><Leaf size={31}/></span><strong>วันของคุณกำลังเริ่มต้น</strong><p>กิจกรรมจะปรากฏที่นี่หลังจากกดบันทึกเวลา<br/>ไม่ต้องรีบ ทุกช่วงเวลาค่อย ๆ เติมได้</p></div>}
          {canUndo&&<button className="undo-button" onClick={()=>void undo()}><Undo2 size={17}/>ย้อนกลับ: {lastUndo.label}</button>}
        </section>
        {backupDue&&<button className="backup-reminder" onClick={()=>setTab('settings')}><Download size={18}/><span>{state.lastExportedAt?'ครบ 7 วันแล้ว แวะสำรองข้อมูลของคุณ':'เก็บไฟล์สำรองแรกของคุณได้ในตั้งค่า'}</span><ChevronRight size={16}/></button>}
        <p className="quiet-note">บันทึกเพื่อรู้จักวันของตัวเอง ทีละช่วงเวลา</p>
      </div>}
      {tab==='reports'&&<Reports snapshot={s} now={now} onSelect={selectSegment}/>}
      {tab==='settings'&&<Settings state={state} repo={account.repo} run={run} refresh={async()=>{setState(await account.repo.state());}} cloud={account.cloud} userEmail={account.email} syncStatus={currentStatus} onSync={()=>void engine.current?.sync()} onLogin={()=>void login()} onLogout={()=>void logout()} notify={notify}/>}
    </main>
    <nav className="bottom-nav" aria-label="เมนูหลัก">{([{id:'capture',label:'บันทึก',Icon:Clock3},{id:'reports',label:'สรุป',Icon:ChartNoAxesCombined},{id:'settings',label:'ตั้งค่า',Icon:SettingsIcon}] as const).map(({id,label,Icon})=><button key={id} className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>{setTab(id);window.scrollTo({top:0,behavior:'smooth'});}}><Icon size={23}/><span>{label}</span></button>)}</nav>
    {toast&&<div className="toast" role="status" onClick={()=>setToast('')}>{toast}</div>}
    {editor&&s.intervals.some(i=>i.id===editor&&!i.deleted_at)&&<Editor key={editor} snapshot={s} id={editor} run={run} onClose={()=>setEditor(null)}/>}
    {startOpen&&<TimeForm snapshot={s} title="เริ่มติดตามเวลา" start={now} initialize onClose={()=>setStartOpen(false)} onSave={async(start)=>{await run({type:'initialize',at:start},'เริ่มติดตาม');setStartOpen(false);notify('เริ่มติดตามแล้ว กลับมากดบันทึกเมื่อจบกิจกรรม');}}/>}
    {gap&&<TimeForm snapshot={s} title="เติมกิจกรรมในช่องว่าง" start={gap.start} end={gap.end} onClose={()=>setGap(null)} onSave={async(start,end,categoryId,note)=>{await run({type:'fill_gap',id:crypto.randomUUID(),start,end:end!,categoryId,note},'เติมช่องว่าง');setGap(null);notify('เติมกิจกรรมแล้ว');}}/>}
    {offlineReady&&<span className="sr-only" role="status">แอพพร้อมเปิดแบบออฟไลน์แล้ว</span>}
  </div>;
}
function TimeForm({snapshot,title,start,end,initialize=false,onClose,onSave}:{snapshot:LocalState['view'];title:string;start:number;end?:number;initialize?:boolean;onClose:()=>void;onSave:(start:number,end:number|undefined,categoryId:string|null,note:string)=>Promise<void>}){
  const [from,setFrom]=useState(inputTime(start,snapshot.timezone)),[to,setTo]=useState(inputTime(end??start,snapshot.timezone)),[category,setCategory]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const parsePreserved=(v:string,original:number)=>v===inputTime(original,snapshot.timezone)?original:parseInput(v,snapshot.timezone);
  return <Modal title={title} onClose={onClose}><p className="muted">{initialize?'ตั้งจุดเริ่มต้นโดยยังไม่สร้างกิจกรรม ศูนย์นาที ก่อนเวลาเริ่มจะแสดงเป็นช่องว่างให้เติมภายหลัง':'เพิ่มช่วงใหม่เฉพาะช่องว่าง เวลาต้องไม่ซ้อนกิจกรรมที่มีอยู่'} · {snapshot.timezone}</p><form onSubmit={e=>{e.preventDefault();setBusy(true);void (async()=>{try{await onSave(parsePreserved(from,start),initialize?undefined:parsePreserved(to,end!),category||null,note);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}})();}}><label className="field">เวลาเริ่ม<input type="datetime-local" value={from} required onChange={e=>setFrom(e.target.value)}/></label>{!initialize&&<><label className="field">เวลาสิ้นสุด<input type="datetime-local" value={to} required onChange={e=>setTo(e.target.value)}/></label><label className="field">กิจกรรม<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">ไว้ระบุภายหลัง</option>{snapshot.categories.filter(c=>!c.archived_at).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field">รายละเอียด<textarea value={note} maxLength={1000} onChange={e=>setNote(e.target.value)}/></label></>}{error&&<p className="error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy?'กำลังบันทึก…':initialize?'ยืนยันเริ่มติดตาม':'บันทึกกิจกรรมในช่องว่าง'}</button></form></Modal>;
}

