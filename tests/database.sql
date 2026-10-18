-- Run against PGlite OR the real Supabase SQL tool. All fixtures roll back.
begin;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','daytrace-test-owner@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','daytrace-test-other@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','daytrace-test-denied@example.invalid');
insert into public.owner_allowlist(user_id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.categories(owner_user_id,id,name,color,icon,sort_order,is_pinned,version) values('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Other owner category','#176449','circle',0,false,1);

set local role anon;
do $$ begin
  begin perform public.daytrace_snapshot(); raise exception 'TEST FAILED: anonymous RPC'; exception when insufficient_privilege then null; end;
  begin perform count(*) from public.activity_intervals; raise exception 'TEST FAILED: anonymous SELECT'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$ begin
  if public.daytrace_is_owner() then raise exception 'TEST FAILED: non-owner allowed'; end if;
  if (select count(*) from public.categories)<>0 then raise exception 'TEST FAILED: non-owner read'; end if;
  begin perform public.daytrace_snapshot(); raise exception 'TEST FAILED: non-owner RPC'; exception when insufficient_privilege then null; end;
  begin insert into public.owner_allowlist(user_id) values(auth.uid()); raise exception 'TEST FAILED: self-allowlist'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare
  cat jsonb:='{"id":"20000000-0000-4000-8000-000000000001","name":"งาน","color":"#176449","icon":"briefcase","sort_order":0,"is_pinned":false,"archived_at":null,"version":1}';
  row1 jsonb:='{"id":"30000000-0000-4000-8000-000000000001","start_at":"2026-10-17T01:30:00.123Z","end_at":"2026-10-17T03:45:00.123Z","category_id":null,"note":"","version":1,"deleted_at":null}';
  payload jsonb; result1 jsonb; result2 jsonb; snap jsonb;
  device uuid:='40000000-0000-4000-8000-000000000001';
begin
  if not public.daytrace_is_owner() then raise exception 'TEST FAILED: owner access'; end if;
  if (select count(*) from public.categories)<>0 then raise exception 'TEST FAILED: cross-owner read'; end if;
  begin insert into public.profiles(owner_user_id) values(auth.uid()); raise exception 'TEST FAILED: direct DML bypass'; exception when insufficient_privilege then null; end;
  payload:=jsonb_build_object('categories',jsonb_build_array(cat),'intervals','[]'::jsonb,'cursor_at','2026-10-17T01:30:00.123Z','timezone','Asia/Bangkok');
  perform public.apply_timeline_operation('50000000-0000-4000-8000-000000000001',0,'initialize',payload,device);
  payload:=jsonb_build_object('categories','[]'::jsonb,'intervals',jsonb_build_array(row1),'cursor_at','2026-10-17T03:45:00.123Z','timezone','Asia/Bangkok');
  result1:=public.apply_timeline_operation('50000000-0000-4000-8000-000000000002',1,'capture',payload,device);
  result2:=public.apply_timeline_operation('50000000-0000-4000-8000-000000000002',1,'capture',payload,device);
  if result1<>result2 or (select count(*) from public.activity_intervals)<>1 then raise exception 'TEST FAILED: receipt replay'; end if;
  if (select extract(epoch from end_at-start_at) from public.activity_intervals)<>8100 then raise exception 'TEST FAILED: capture duration'; end if;
  begin
    perform public.apply_timeline_operation('50000000-0000-4000-8000-000000000002',1,'assign',payload,device);
    raise exception 'TEST FAILED: ID payload reuse';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.apply_timeline_operation('50000000-0000-4000-8000-000000000003',1,'capture',payload,device);
    raise exception 'TEST FAILED: revision accepted';
  exception when raise_exception then if sqlerrm not like 'REVISION_CONFLICT%' then raise; end if; end;
  -- Partially written interval + cursor must roll back if overlap validation fails.
  begin
    perform public.apply_timeline_operation('50000000-0000-4000-8000-000000000004',2,'fill_gap',jsonb_set(payload,'{intervals}',jsonb_build_array(row1||'{"id":"30000000-0000-4000-8000-000000000004"}'::jsonb)),device);
    raise exception 'TEST FAILED: overlap accepted';
  exception when exclusion_violation then null; end;
  if (select count(*) from public.activity_intervals)<>1 or (select revision from public.timeline_state)<>2 then raise exception 'TEST FAILED: failed mutation partially committed'; end if;
  -- Force deferred composite FK validation inside the subtransaction.
  begin
    perform public.apply_timeline_operation('50000000-0000-4000-8000-000000000005',2,'assign',jsonb_set(payload,'{intervals}',jsonb_build_array(row1||'{"version":2,"category_id":"20000000-0000-4000-8000-000000000002"}'::jsonb)),device);
    set constraints all immediate;
    raise exception 'TEST FAILED: cross-owner category accepted';
  exception when foreign_key_violation then null; end;
  begin
    perform public.apply_timeline_operation('50000000-0000-4000-8000-000000000006',2,'fill_gap',jsonb_set(payload,'{intervals}',jsonb_build_array(row1||'{"id":"30000000-0000-4000-8000-000000000006","start_at":"2026-10-17T04:00:00Z","end_at":"2026-10-17T05:00:00Z"}'::jsonb)),device);
    raise exception 'TEST FAILED: open range accepted';
  exception when invalid_parameter_value then null; end;
  if (select count(*) from public.mutation_receipts)<>2 then raise exception 'TEST FAILED: receipt for failed mutation'; end if;
  snap:=public.daytrace_snapshot();
  if (snap->>'revision')::integer<>2 or jsonb_array_length(snap->'snapshot'->'intervals')<>1 then raise exception 'TEST FAILED: snapshot inconsistent'; end if;
end $$;
reset role;
select 'PASS: anonymous / non-owner / cross-owner / direct-write restrictions, capture milliseconds, receipt replay, reused IDs, revision conflict, overlap rollback, open-range invariant, composite FK, canonical snapshot' as database_tests;
rollback;
