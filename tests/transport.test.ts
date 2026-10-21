import {it,expect,vi,afterEach} from 'vitest';
import type {Operation} from '../src/domain/model';
const client=vi.hoisted(()=>({auth:{getSession:vi.fn()},rpc:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>client}));
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();vi.clearAllMocks();});
async function remote(){vi.stubEnv('VITE_SUPABASE_URL','https://unit-test.supabase.co');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','public-test');client.auth.getSession.mockResolvedValue({data:{session:{user:{id:'test-owner'}}}});return import('../src/data/remote');}
function operation(protocol_version?:1|2):Operation{return {operation_id:crypto.randomUUID(),expected_revision:3,type:'assign',payload:{categories:[],intervals:[],cursor_at:null,timezone:'Asia/Bangkok'},created_at:new Date().toISOString(),device_id:crypto.randomUUID(),protocol_version};}
it('routes fresh operations to v2 and legacy lost-ack payloads to v1 unchanged',async()=>{
 const {transport}=await remote(),t=transport('test-owner');client.rpc.mockResolvedValue({data:{revision:4},error:null});
 for(const version of [undefined,1,2] as const){const op=operation(version),before=JSON.stringify(op.payload);expect(await t.apply(op)).toBe(4);expect(client.rpc.mock.calls.at(-1)![0]).toBe(version===2?'apply_timeline_operation_v2':'apply_timeline_operation');expect(JSON.stringify(client.rpc.mock.calls.at(-1)![1].p_payload)).toBe(before);}
});
it('pulls the v2 snapshot and maps a blocked legacy queue to recoverable conflict',async()=>{
 const {transport}=await remote(),t=transport('test-owner');client.rpc.mockResolvedValueOnce({data:{revision:8,snapshot:{categories:[],intervals:[],cursor_at:null,timezone:'Asia/Bangkok'}},error:null});
 expect((await t.pull()).revision).toBe(8);expect(client.rpc.mock.calls[0][0]).toBe('daytrace_snapshot_v2');
 client.rpc.mockResolvedValueOnce({data:null,error:{code:'22023',message:'CLIENT_UPDATE_REQUIRED: update DayTrace'}});
 await expect(t.apply(operation(1))).rejects.toMatchObject({kind:'conflict'});
});
