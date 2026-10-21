import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir } from 'node:fs/promises';
const db=new PGlite();
try{
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  const migrations=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name,migrations),'utf8'));
  const results=await db.exec(await readFile(new URL('../tests/database.sql',import.meta.url),'utf8'));
  console.log(JSON.stringify(results.filter(r=>r.rows?.length).map(r=>r.rows),null,2));
  const secondary=await db.exec(await readFile(new URL('../tests/secondary-database.sql',import.meta.url),'utf8'));
  console.log(JSON.stringify(secondary.filter(r=>r.rows?.length).map(r=>r.rows),null,2));
}finally{await db.close();}
