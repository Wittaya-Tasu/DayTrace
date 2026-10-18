import 'fake-indexeddb/auto';
import { describe,it,expect,afterEach,vi } from 'vitest';
import { Repository } from '../src/data/local';
import { active,applyPatch } from '../src/domain/model';
import { SyncEngine } from '../src/sync/engine';
import { RemoteError,type Transport } from '../src/data/remote';
const repos:Repository[]=[];
const repo=(cloud=false,namespace:string=crypto.randomUUID())=>{const r=new Repository(namespace,cloud);repos.push(r);return r;};
afterEach(async()=>{for(const r of repos.splice(0)) await r.db.delete();vi.restoreAllMocks();});
describe('IndexedDB durability',()=>{
  it('T03/T11 pending interval, cursor and outbox survive closing and reopening',async()=>{
    const r=repo(true),now=Date.now();await r.state();await r.mutate({type:'initialize',at:now-100000},'start');
    await r.mutate({type:'capture',at:now-1,id:crypto.randomUUID()},'capture');r.db.close();
    const next=repo(true,r.namespace),state=await next.state();
    expect(state.outbox).toHaveLength(2);expect(state.view.cursor_at).toBe(new Date(now-1).toISOString());expect(active(state.view)[0].category_id).toBeNull();
  });
  it('T04 failed storage write rolls back interval, cursor, and outbox',async()=>{
    const r=repo(true),before=await r.state();
    vi.spyOn(r.db.states,'put').mockRejectedValueOnce(new DOMException('Quota exceeded','QuotaExceededError'));
    await expect(r.mutate({type:'initialize',at:Date.now()-1000},'start')).rejects.toThrow();
    expect(await r.state()).toEqual(before);
  });
  it('same-time duplicate capture across serialized transactions cannot create two intervals',async()=>{
    const r=repo(true),now=Date.now();await r.mutate({type:'initialize',at:now-10000},'start');
    const results=await Promise.allSettled([r.mutate({type:'capture',at:now-1,id:crypto.randomUUID()},'one'),r.mutate({type:'capture',at:now-1,id:crypto.randomUUID()},'two')]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(active((await r.state()).view)).toHaveLength(1);
  });
  it('undo restores cursor and preserves tombstones; revision changes prevent stale undo',async()=>{
    const r=repo(),now=Date.now();await r.mutate({type:'initialize',at:now-10000},'start');const before=await r.state();
    await r.mutate({type:'capture',at:now-1,id:crypto.randomUUID()},'capture');await r.undo();
    const state=await r.state();expect(state.view.cursor_at).toBe(before.view.cursor_at);expect(active(state.view)).toHaveLength(0);expect(state.view.intervals[0].deleted_at).not.toBeNull();
    await r.pull(state.view,state.revision+1);await expect(r.undo()).rejects.toThrow();
  });
  it('T15 namespaces prevent account A queue appearing in account B',async()=>{
    const a=repo(true),b=repo(true);await a.mutate({type:'initialize',at:Date.now()-1000},'start');
    expect((await b.state()).outbox).toHaveLength(0);expect((await a.state()).outbox).toHaveLength(1);
  });
});
describe('sync delivery',()=>{
  const locks={request:async(_key:string,_opts:unknown,fn:()=>Promise<void>)=>fn()};
  function browser(){vi.stubGlobal('navigator',{onLine:true,locks});}
  it('T12 retries the same ID after server commit / lost ack, without duplicating data',async()=>{
    browser();const r=repo(true);await r.mutate({type:'initialize',at:Date.now()-10000},'start');await r.mutate({type:'capture',at:Date.now()-1,id:crypto.randomUUID()},'capture');
    const initial=await r.state();let canonical=initial.canonical,revision=0,lost=false;const receipts=new Map<string,number>(),ids:string[]=[];
    const remote:Transport={pull:async()=>({snapshot:canonical,revision}),apply:async(op)=>{ids.push(op.operation_id);if(receipts.has(op.operation_id))return receipts.get(op.operation_id)!;canonical=applyPatch(canonical,op.payload);receipts.set(op.operation_id,++revision);if(!lost){lost=true;throw Error('network dropped after commit');}return revision;}};
    const statuses:string[]=[];const engine=new SyncEngine(r,remote,s=>statuses.push(s));await engine.sync();expect((await r.state()).outbox).toHaveLength(2);await engine.sync();engine.stop();
    expect(ids[0]).toBe(ids[1]);expect(receipts.size).toBe(2);expect(active(canonical)).toHaveLength(1);expect((await r.state()).outbox).toHaveLength(0);expect(statuses.at(-1)).toBe('synced');
  });
  it('T13 conflict stops the queue and retains original payloads',async()=>{
    browser();const r=repo(true);await r.mutate({type:'initialize',at:Date.now()-10000},'start');const before=await r.state();
    const engine=new SyncEngine(r,{pull:async()=>({snapshot:before.canonical,revision:7}),apply:async()=>{throw new RemoteError('REVISION_CONFLICT','conflict');}},()=>{});await engine.sync();engine.stop();const after=await r.state();expect(after.outbox).toEqual(before.outbox);expect(after.conflict?.revision).toBe(7);await expect(r.mutate({type:'capture',at:Date.now(),id:crypto.randomUUID()},'capture')).rejects.toThrow('ขัดแย้ง');
  });
  it('T16 expired auth keeps the local queue',async()=>{
    browser();const r=repo(true);await r.mutate({type:'initialize',at:Date.now()-1000},'start');const statuses:string[]=[];
    const engine=new SyncEngine(r,{pull:async()=>{throw Error();},apply:async()=>{throw new RemoteError('login required','auth');}},s=>statuses.push(s));await engine.sync();engine.stop();expect((await r.state()).outbox).toHaveLength(1);expect(statuses.at(-1)).toBe('auth');
  });
});
