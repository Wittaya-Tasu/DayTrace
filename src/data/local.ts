import Dexie, { type EntityTable } from 'dexie';
import { applyPatch, initialSnapshot, iso, patchBetween, validateSnapshot, type LocalState, type Operation, type Snapshot } from '../domain/model';
import { reduce, type Command } from '../domain/operations';

export class DayTraceDB extends Dexie {
  states!:EntityTable<LocalState,'id'>;
  constructor(namespace:string){
    super(`daytrace:v1:${namespace}`);
    this.version(1).stores({states:'id'});
    this.version(2).stores({states:'id'}).upgrade(tx=>tx.table('states').toCollection().modify((state:LocalState)=>{
      state.canonical=validateSnapshot(state.canonical);state.view=validateSnapshot(state.view);
      for(const h of state.history) h.before=validateSnapshot(h.before);
      if(state.conflict) state.conflict.remote=validateSnapshot(state.conflict.remote);
      // Receipt hashes include the original payload: never normalize an old outbox payload.
      for(const op of state.outbox) op.protocol_version??=1;
    }));
  }
}
export const blankState=():LocalState=>({id:'state',canonical:initialSnapshot(),view:initialSnapshot(),revision:0,outbox:[],history:[],lastSyncedAt:null,lastExportedAt:null,deviceId:crypto.randomUUID(),conflict:null});

export class Repository {
  db:DayTraceDB;
  readonly namespace:string;
  constructor(namespace:string,readonly cloud=false){this.namespace=namespace;this.db=new DayTraceDB(namespace);}
  async state():Promise<LocalState>{
    return this.db.transaction('rw',this.db.states,async()=>{
      const current=await this.db.states.get('state');if(current) return current;
      const initial=blankState();await this.db.states.add(initial);return initial;
    });
  }
  async mutate(command:Command,label:string):Promise<LocalState>{
    return this.db.transaction('rw',this.db.states,async()=>{
      const current=await this.db.states.get('state')??blankState();
      if(current.conflict) throw Error('กรุณาจัดการข้อมูลขัดแย้งก่อนบันทึกต่อ ข้อมูลเดิมยังอยู่ครบ');
      const before=structuredClone(current.view),next=reduce(before,command);
      const revision=current.revision+current.outbox.length;
      // New IDs and timestamps are allocated before queueing; retries reuse the operation verbatim.
      const operation:Operation={operation_id:crypto.randomUUID(),expected_revision:revision,type:command.type,payload:patchBetween(before,next),created_at:iso(Date.now()),device_id:current.deviceId,protocol_version:2};
      if(this.cloud) current.outbox.push(operation);else {current.revision++;current.canonical=next;}
      current.view=next;
      current.history.push({before,after_revision:revision+1,label,created_at:iso(Date.now())});
      current.history=current.history.filter(h=>Date.now()-Date.parse(h.created_at)<90*86400000).slice(-50);
      await this.db.states.put(current);return current;
    });
  }
  async undo(){
    return this.db.transaction('rw',this.db.states,async()=>{
      const current=await this.db.states.get('state');if(!current) throw Error('ไม่มีรายการให้ย้อนกลับ');
      const item=current.history.at(-1),revision=current.revision+current.outbox.length;
      if(!item||item.after_revision!==revision||Date.now()-Date.parse(item.created_at)>90*86400000||current.conflict) throw Error('มีการเปลี่ยนแปลงใหม่แล้ว กรุณาแก้จากรายการย้อนหลัง');
      const next=reduce(current.view,{type:'undo',snapshot:item.before});
      if(this.cloud) current.outbox.push({operation_id:crypto.randomUUID(),expected_revision:revision,type:'undo',payload:patchBetween(current.view,next),created_at:iso(Date.now()),device_id:current.deviceId,protocol_version:2});
      else {current.revision++;current.canonical=next;}
      current.view=next;current.history=[];await this.db.states.put(current);return current;
    });
  }
  async acknowledge(operation:Operation,revision:number){
    return this.db.transaction('rw',this.db.states,async()=>{
      const current=await this.db.states.get('state');
      if(!current||current.outbox[0]?.operation_id!==operation.operation_id) throw Error('คิวเปลี่ยนระหว่างซิงก์ กรุณาลองอีกครั้ง');
      if(revision!==operation.expected_revision+1) throw Error('revision จากเซิร์ฟเวอร์ไม่ตรง');
      current.canonical=applyPatch(current.canonical,operation.payload);current.revision=revision;current.outbox.shift();
      current.view=current.outbox.reduce((s,op)=>applyPatch(s,op.payload),current.canonical);
      current.lastSyncedAt=iso(Date.now());await this.db.states.put(current);return current;
    });
  }
  async pull(snapshot:Snapshot,revision:number){
    return this.db.transaction('rw',this.db.states,async()=>{
      const current=await this.db.states.get('state')??blankState();
      if(current.outbox.length||current.conflict) return current;
      if(revision<current.revision) throw Error('เซิร์ฟเวอร์ส่ง revision เก่ากว่าข้อมูลในเครื่อง');
      current.canonical=validateSnapshot(snapshot);current.view=current.canonical;
      if(current.revision!==revision) current.history=[];
      current.revision=revision;current.lastSyncedAt=iso(Date.now());await this.db.states.put(current);return current;
    });
  }
  async setConflict(remote:Snapshot,revision:number,message:string){
    return this.db.transaction('rw',this.db.states,async()=>{
      const current=await this.db.states.get('state');if(!current) throw Error('ไม่พบข้อมูล');
      current.conflict={remote:validateSnapshot(remote),revision,message};await this.db.states.put(current);return current;
    });
  }
  async resolveConflict(snapshot:Snapshot){
    return this.db.transaction('rw',this.db.states,async()=>{
      const current=await this.db.states.get('state');if(!current?.conflict) throw Error('ไม่พบข้อมูลขัดแย้ง');
      const {remote,revision}=current.conflict;
      const next=reduce(remote,{type:'import_batch',snapshot});
      const op:Operation={operation_id:crypto.randomUUID(),expected_revision:revision,type:'import_batch',payload:patchBetween(remote,next),created_at:iso(Date.now()),device_id:current.deviceId,protocol_version:2};
      current.canonical=remote;current.revision=revision;current.view=next;current.outbox=[op];current.history=[];current.conflict=null;
      await this.db.states.put(current);return current;
    });
  }
  async markExported(){await this.db.transaction('rw',this.db.states,async()=>{const s=await this.db.states.get('state');if(s){s.lastExportedAt=iso(Date.now());await this.db.states.put(s);}});}
}
