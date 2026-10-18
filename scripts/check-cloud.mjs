import { readFile } from 'node:fs/promises';
const env=Object.fromEntries((await readFile('.env.local','utf8')).trim().split(/\r?\n/).map(line=>{const p=line.indexOf('=');return [line.slice(0,p),line.slice(p+1)];}));
const headers={apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY};
const settings=await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/settings`,{headers});
if(!settings.ok) throw Error(`Auth settings HTTP ${settings.status}`);
const auth=await settings.json();console.log(JSON.stringify({google_login_enabled:auth.external?.google,email_login_enabled:auth.external?.email}));
for(const rpc of ['daytrace_is_owner','daytrace_snapshot']){
  const res=await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/${rpc}`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
  console.log(`Anonymous ${rpc}: HTTP ${res.status} ${res.ok?'UNEXPECTED':'denied'}`);
  if(res.ok) throw Error('Anonymous RPC must be denied');
}
