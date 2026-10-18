import type { Repository } from '../data/local';
import { RemoteError, type Transport } from '../data/remote';

export type SyncStatus='local'|'offline'|'pending'|'syncing'|'synced'|'auth'|'unavailable'|'conflict'|'invalid';
export class SyncEngine {
  private running=false;private attempt=0;private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
  constructor(private repo:Repository,private remote:Transport,private notify:(status:SyncStatus,message?:string)=>void){}
  stop(){this.stopped=true;clearTimeout(this.timer);}
  schedule(){if(this.stopped)return;clearTimeout(this.timer);this.timer=setTimeout(()=>void this.sync(),500);}
  async sync(){
    if(this.running||this.stopped) return;
    if(!navigator.onLine){this.notify('offline');return;}
    this.running=true;clearTimeout(this.timer);
    try{
      if(!navigator.locks) throw new RemoteError('เบราว์เซอร์นี้ไม่รองรับการล็อกคิว กรุณาใช้ Safari รุ่นปัจจุบัน','validation');
      await navigator.locks.request(`daytrace-sync:${this.repo.namespace}`,{mode:'exclusive'},async()=>{
        if(this.stopped)return;
        const current=await this.repo.state();if(current.conflict){this.notify('conflict');return;}
        this.notify('syncing');
        let state=current;
        while(state.outbox.length&&!this.stopped){
          const op=state.outbox[0];const revision=await this.remote.apply(op);
          state=await this.repo.acknowledge(op,revision);
        }
        if(this.stopped)return;
        const remote=await this.remote.pull();await this.repo.pull(remote.snapshot,remote.revision);
        this.attempt=0;this.notify('synced');
      });
    }catch(error){
      if(this.stopped)return;
      if(error instanceof RemoteError&&error.kind==='conflict'){
        try{const r=await this.remote.pull();await this.repo.setConflict(r.snapshot,r.revision,error.message);this.notify('conflict');}
        catch{this.notify('unavailable','อ่านข้อมูลเซิร์ฟเวอร์ไม่ได้ คิวในเครื่องยังอยู่');this.retry();}
      }else if(error instanceof RemoteError&&error.kind==='auth') this.notify('auth',error.message);
      else if(error instanceof RemoteError&&error.kind==='validation') this.notify('invalid',error.message);
      else {this.notify('unavailable',error instanceof Error?error.message:String(error));this.retry();}
    }finally{this.running=false;}
  }
  private retry(){const delay=Math.min(60000,1000*2**Math.min(++this.attempt,6))*(0.75+Math.random()*0.5);this.timer=setTimeout(()=>void this.sync(),delay);}
}
