import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { initialSnapshot, validateSnapshot, type Operation, type Snapshot } from '../domain/model';

const url=import.meta.env.VITE_SUPABASE_URL?.trim(),key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const configured=!!(url&&key);
export const environmentId=url?new URL(url).hostname:'development';
export const supabase:SupabaseClient|null=configured?createClient(url,key,{auth:{flowType:'pkce',autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,storageKey:`daytrace-auth:${environmentId}`}}):null;
export const redirectUrl=()=>new URL(import.meta.env.BASE_URL,location.origin).href;
export async function signIn(){
  if(!supabase) throw Error('ยังไม่ได้ตั้งค่า Supabase');
  const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectUrl()}});if(error) throw error;
}
export async function ownerAllowed(){
  if(!supabase) return false;
  const {data,error}=await supabase.rpc('daytrace_is_owner');if(error) throw error;return data===true;
}
export interface RemoteSnapshot {snapshot:Snapshot;revision:number}
export interface Transport {pull():Promise<RemoteSnapshot>;apply(op:Operation):Promise<number>}
export class RemoteError extends Error {constructor(message:string,readonly kind:'conflict'|'auth'|'validation'|'network'){super(message);}}
function remoteError(error:{message:string;code?:string;status?:number}){
  if(error.message.includes('REVISION_CONFLICT')) return new RemoteError('ข้อมูลบนอีกเครื่องเปลี่ยนแล้ว','conflict');
  if(error.code==='42501'||error.code==='PGRST301'||error.status===401) return new RemoteError('กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าของ','auth');
  if(error.code?.startsWith('23')||error.code==='P0001'||error.code==='22023'||error.code==='22P02') return new RemoteError(error.message,'validation');
  return new RemoteError(error.message,'network');
}
export function transport(userId:string):Transport{
  const client=supabase;if(!client) throw Error('ยังไม่ได้ตั้งค่า Supabase');
  const checkUser=async()=>{const {data:{session}}=await client.auth.getSession();if(session?.user.id!==userId) throw new RemoteError('บัญชีไม่ตรงกับข้อมูลในเครื่อง','auth');};
  return {
    async pull(){
      await checkUser();const {data,error}=await client.rpc('daytrace_snapshot');if(error) throw remoteError(error);
      if(!data) throw new RemoteError('ไม่ได้รับอนุญาต','auth');
      return {snapshot:validateSnapshot(data.snapshot),revision:data.revision};
    },
    async apply(op){
      await checkUser();const {data,error}=await client.rpc('apply_timeline_operation',{p_operation_id:op.operation_id,p_expected_revision:op.expected_revision,p_type:op.type,p_payload:op.payload,p_device_id:op.device_id});
      if(error) throw remoteError(error);return data.revision;
    }
  };
}
export async function seedIfEmpty(t:Transport,deviceId:string){
  const remote=await t.pull();
  if(remote.revision===0&&remote.snapshot.categories.length===0){
    const s=initialSnapshot();
    await t.apply({operation_id:crypto.randomUUID(),expected_revision:0,type:'category_update',payload:s,created_at:new Date().toISOString(),device_id:deviceId});
    return t.pull();
  }
  return remote;
}
