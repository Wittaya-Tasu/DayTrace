-- Isolated fixtures only; safe to run after the legacy suite. Always rolls back.
begin;
insert into auth.users(id,email) values ('11000000-0000-4000-8000-000000000001','secondary-owner@example.invalid'),('11000000-0000-4000-8000-000000000002','secondary-other@example.invalid');
insert into public.owner_allowlist(user_id) values('11000000-0000-4000-8000-000000000001'),('11000000-0000-4000-8000-000000000002');
insert into public.categories(owner_user_id,id,name,color,icon,sort_order,is_pinned,version) values
('11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Travel','#176449','car',0,false,1),
('11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002','Learning','#619DEA','book',1,false,1),
('11000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000003','Other owner','#619DEA','book',0,false,1);
set local role anon;
do $$ begin
 begin perform public.daytrace_snapshot_v2();raise exception 'TEST FAILED: anonymous v2 snapshot';exception when insufficient_privilege then null;end;
 begin perform public.apply_timeline_operation_v2(null,0,'assign','{}',null);raise exception 'TEST FAILED: anonymous v2 write';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare
 row1 jsonb:='{"id":"31000000-0000-4000-8000-000000000001","start_at":"2026-10-19T16:30:00.123Z","end_at":"2026-10-19T18:30:00.123Z","category_id":"21000000-0000-4000-8000-000000000001","secondary_category_id":"21000000-0000-4000-8000-000000000002","note":"fixture","version":1,"deleted_at":null}';
 payload jsonb; result1 jsonb; device uuid:='41000000-0000-4000-8000-000000000001';
begin
 payload:=jsonb_build_object('categories','[]'::jsonb,'intervals',jsonb_build_array(row1),'cursor_at',row1->>'end_at','timezone','Asia/Bangkok');
 result1:=public.apply_timeline_operation_v2('51000000-0000-4000-8000-000000000001',0,'capture',payload,device);
 if public.apply_timeline_operation_v2('51000000-0000-4000-8000-000000000001',0,'capture',payload,device)<>result1 then raise exception 'TEST FAILED: v2 replay';end if;
 if (select count(*) from public.activity_intervals)<>1 then raise exception 'TEST FAILED: v2 duplicate';end if;
 if public.daytrace_snapshot_v2()->'snapshot'->'intervals'->0->>'secondary_category_id'<>row1->>'secondary_category_id' then raise exception 'TEST FAILED: v2 snapshot';end if;
 if (public.daytrace_snapshot()->'snapshot'->'intervals'->0) ? 'secondary_category_id' then raise exception 'TEST FAILED: legacy snapshot shape changed';end if;
 begin
  perform public.apply_timeline_operation_v2('51000000-0000-4000-8000-000000000001',0,'capture',jsonb_set(payload,'{intervals,0,secondary_category_id}','null'),device);
  raise exception 'TEST FAILED: same receipt with different secondary';
 exception when invalid_parameter_value then null;end;
 begin
  perform public.apply_timeline_operation_v2('51000000-0000-4000-8000-000000000002',1,'assign',jsonb_set(payload,'{intervals}',jsonb_build_array(row1||'{"secondary_category_id":"21000000-0000-4000-8000-000000000001","version":2}')),device);
  raise exception 'TEST FAILED: same category';
 exception when check_violation then null;end;
 begin
  perform public.apply_timeline_operation_v2('51000000-0000-4000-8000-000000000003',1,'assign',jsonb_set(payload,'{intervals}',jsonb_build_array(row1||'{"category_id":null,"version":2}')),device);
  raise exception 'TEST FAILED: secondary without primary';
 exception when check_violation then null;end;
 begin
  perform public.apply_timeline_operation_v2('51000000-0000-4000-8000-000000000004',1,'assign',jsonb_set(payload,'{intervals}',jsonb_build_array(row1||'{"secondary_category_id":"21000000-0000-4000-8000-000000000003","version":2}')),device);
  raise exception 'TEST FAILED: cross-owner secondary';
 exception when foreign_key_violation then null;end;
 begin
  perform public.apply_timeline_operation('51000000-0000-4000-8000-000000000005',1,'assign',jsonb_set(payload,'{intervals}',jsonb_build_array((row1-'secondary_category_id')||'{"version":2}')),device);
  raise exception 'TEST FAILED: legacy overwrote secondary';
 exception when invalid_parameter_value then if sqlerrm not like 'CLIENT_UPDATE_REQUIRED%' then raise;end if;end;
 if (select revision from public.timeline_state)<>1 or (select version from public.activity_intervals)<>1 then raise exception 'TEST FAILED: failed writes changed state';end if;
 -- Clearing is an explicit v2 operation and does not change timestamps.
 perform public.apply_timeline_operation_v2('51000000-0000-4000-8000-000000000006',1,'assign',jsonb_set(payload,'{intervals}',jsonb_build_array(row1||'{"secondary_category_id":null,"version":2}')),device);
 if (select secondary_category_id is not null or end_at-start_at<>interval '2 hours' from public.activity_intervals) then raise exception 'TEST FAILED: secondary removal';end if;
 -- A legacy lost acknowledgement must still replay after v2 activities exist.
 payload:=jsonb_set(payload,'{intervals}','[]');
 result1:=public.apply_timeline_operation('51000000-0000-4000-8000-000000000007',2,'category_update',payload,device);
 perform public.apply_timeline_operation_v2('51000000-0000-4000-8000-000000000008',3,'assign',jsonb_set(payload,'{intervals}',jsonb_build_array(row1||'{"version":3}')),device);
 if public.apply_timeline_operation('51000000-0000-4000-8000-000000000007',2,'category_update',payload,device)<>result1 then raise exception 'TEST FAILED: legacy lost acknowledgement replay';end if;
end $$;
reset role;
select 'PASS: v2 secondary persistence/replay/constraints/ownership, stable v1 snapshot, legacy-write guard and explicit removal' as secondary_database_tests;
rollback;
