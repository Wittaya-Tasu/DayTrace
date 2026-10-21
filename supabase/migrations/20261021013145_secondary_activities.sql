-- Additive concurrent activity support. Legacy RPC shapes stay stable for cached PWAs.
begin;
-- Hold the same writer lock order as the RPCs and verify existing data is untouched.
lock table public.timeline_state,public.activity_intervals in access exclusive mode;
create temporary table daytrace_secondary_upgrade_guard on commit drop as
select (select md5(coalesce(jsonb_agg(to_jsonb(i) order by owner_user_id,id)::text,'[]')) from public.activity_intervals i) as activities,
       (select md5(coalesce(jsonb_agg(to_jsonb(t) order by owner_user_id)::text,'[]')) from public.timeline_state t) as timelines;
alter table public.activity_intervals add column secondary_category_id uuid;
alter table public.activity_intervals add constraint activity_secondary_owner_fk foreign key(owner_user_id,secondary_category_id) references public.categories(owner_user_id,id) deferrable initially deferred;
alter table public.activity_intervals add constraint activity_distinct_secondary check(secondary_category_id is null or (category_id is not null and secondary_category_id<>category_id));
create index activity_owner_secondary on public.activity_intervals(owner_user_id,secondary_category_id);
comment on column public.activity_intervals.secondary_category_id is 'Optional activity performed throughout the same interval; counted separately from primary elapsed-time totals.';

create function public.daytrace_snapshot_v2() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare u uuid:=auth.uid(); result jsonb;
begin
  if not public.daytrace_is_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  select jsonb_build_object(
    'revision',coalesce((select revision from public.timeline_state where owner_user_id=u),0),
    'snapshot',jsonb_build_object(
      'cursor_at',(select cursor_at from public.timeline_state where owner_user_id=u),
      'timezone',coalesce((select reporting_timezone from public.profiles where owner_user_id=u),'Asia/Bangkok'),
      'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'color',color,'icon',icon,'sort_order',sort_order,'is_pinned',is_pinned,'archived_at',archived_at,'version',version) order by sort_order,id) from public.categories where owner_user_id=u),'[]'::jsonb),
      'intervals',coalesce((select jsonb_agg(jsonb_build_object('id',id,'start_at',start_at,'end_at',end_at,'category_id',category_id,'secondary_category_id',secondary_category_id,'note',note,'version',version,'deleted_at',deleted_at) order by start_at,id) from public.activity_intervals where owner_user_id=u),'[]'::jsonb)
    )
  ) into result;
  return result;
end $$;
revoke all on function public.daytrace_snapshot_v2() from public,anon;
grant execute on function public.daytrace_snapshot_v2() to authenticated;

create function public.apply_timeline_operation_v2(
  p_operation_id uuid,p_expected_revision bigint,p_type text,p_payload jsonb,p_device_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u uuid:=auth.uid(); r bigint; request_digest text;
  receipt public.mutation_receipts%rowtype;
  item jsonb; before_row jsonb; entity uuid; old_version bigint;
  cursor_value timestamptz; timezone_value text; answer jsonb;
begin
  if not public.daytrace_is_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or p_device_id is null or p_expected_revision is null or p_expected_revision<0 or p_payload is null then
    raise exception 'INVALID_OPERATION' using errcode='22023';
  end if;
  if p_type is null or p_type not in ('initialize','capture','assign','split','merge','adjust_boundary','soft_delete','restore','undo','category_update','import_batch','fill_gap','profile_update') then
    raise exception 'INVALID_OPERATION_TYPE' using errcode='22023';
  end if;
  if octet_length(p_payload::text)>20*1024*1024 or jsonb_typeof(p_payload)<>'object'
    or jsonb_typeof(p_payload->'categories') is distinct from 'array'
    or jsonb_typeof(p_payload->'intervals') is distinct from 'array'
    or not (p_payload ? 'cursor_at') or not (p_payload ? 'timezone')
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('categories','intervals','cursor_at','timezone'))
    or jsonb_array_length(p_payload->'categories')>500 or jsonb_array_length(p_payload->'intervals')>50000 then
    raise exception 'INVALID_PAYLOAD' using errcode='22023';
  end if;
  -- JSONB canonical serialization makes the receipt independent of property ordering.
  request_digest:=md5(jsonb_build_object('type',p_type,'revision',p_expected_revision,'payload',p_payload,'device',p_device_id,'protocol',2)::text);
  insert into public.timeline_state(owner_user_id) values(u) on conflict do nothing;
  select revision into r from public.timeline_state where owner_user_id=u for update;
  select * into receipt from public.mutation_receipts where owner_user_id=u and operation_id=p_operation_id;
  if found then
    if receipt.request_hash<>request_digest then raise exception 'OPERATION_ID_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode='22023'; end if;
    return receipt.result;
  end if;
  if r<>p_expected_revision then raise exception 'REVISION_CONFLICT current=%',r using errcode='P0001'; end if;
  timezone_value:=p_payload->>'timezone';
  if timezone_value is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=timezone_value) then raise exception 'INVALID_TIMEZONE' using errcode='22023'; end if;
  cursor_value:=(p_payload->>'cursor_at')::timestamptz;
  -- Timestamp is from the user's device, including offline captures. Never substitute delivery time.
  if cursor_value is not null and not isfinite(cursor_value) then raise exception 'INVALID_CURSOR' using errcode='22023'; end if;
  insert into public.profiles(owner_user_id) values(u) on conflict do nothing;

  for item in select value from jsonb_array_elements(p_payload->'categories') loop
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','name','color','icon','sort_order','is_pinned','archived_at','version')) then raise exception 'INVALID_CATEGORY_FIELDS' using errcode='22023'; end if;
    entity:=(item->>'id')::uuid;
    select to_jsonb(c),c.version into before_row,old_version from public.categories c where c.owner_user_id=u and c.id=entity;
    if found and (item->>'version')::bigint<=old_version then raise exception 'CATEGORY_VERSION_CONFLICT' using errcode='22023'; end if;
    insert into public.categories(id,owner_user_id,name,color,icon,sort_order,is_pinned,archived_at,version)
    values(entity,u,item->>'name',item->>'color',item->>'icon',(item->>'sort_order')::integer,(item->>'is_pinned')::boolean,(item->>'archived_at')::timestamptz,(item->>'version')::bigint)
    on conflict(owner_user_id,id) do update set name=excluded.name,color=excluded.color,icon=excluded.icon,sort_order=excluded.sort_order,is_pinned=excluded.is_pinned,archived_at=excluded.archived_at,version=excluded.version,updated_at=now();
    insert into public.change_log(owner_user_id,operation_id,entity_type,entity_id,before_value,after_value,device_id) values(u,p_operation_id,'category',entity::text,before_row,item,p_device_id);
  end loop;
  for item in select value from jsonb_array_elements(p_payload->'intervals') loop
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','start_at','end_at','category_id','secondary_category_id','note','version','deleted_at')) then raise exception 'INVALID_INTERVAL_FIELDS' using errcode='22023'; end if;
    if not (item ? 'secondary_category_id') then raise exception 'SECONDARY_FIELD_REQUIRED' using errcode='22023'; end if;
    if item->>'secondary_category_id' is not null and not exists(select 1 from public.categories where owner_user_id=u and id=(item->>'secondary_category_id')::uuid) then raise exception 'SECONDARY_CATEGORY_OWNER_REQUIRED' using errcode='23503'; end if;
    entity:=(item->>'id')::uuid;
    select to_jsonb(i),i.version into before_row,old_version from public.activity_intervals i where i.owner_user_id=u and i.id=entity;
    if found then
      if (item->>'version')::bigint<=old_version then raise exception 'INTERVAL_VERSION_CONFLICT' using errcode='22023'; end if;
      if before_row->>'deleted_at' is not null and item->>'deleted_at' is null and (before_row->>'deleted_at')::timestamptz<now()-interval '30 days' then raise exception 'RESTORE_EXPIRED' using errcode='22023'; end if;
    end if;
    if not isfinite((item->>'start_at')::timestamptz) or not isfinite((item->>'end_at')::timestamptz) then raise exception 'INVALID_TIME' using errcode='22023'; end if;
    insert into public.activity_intervals(id,owner_user_id,start_at,end_at,category_id,secondary_category_id,note,version,deleted_at)
    values(entity,u,(item->>'start_at')::timestamptz,(item->>'end_at')::timestamptz,(item->>'category_id')::uuid,(item->>'secondary_category_id')::uuid,item->>'note',(item->>'version')::bigint,(item->>'deleted_at')::timestamptz)
    on conflict(owner_user_id,id) do update set start_at=excluded.start_at,end_at=excluded.end_at,category_id=excluded.category_id,secondary_category_id=excluded.secondary_category_id,note=excluded.note,version=excluded.version,deleted_at=excluded.deleted_at,updated_at=now();
    insert into public.change_log(owner_user_id,operation_id,entity_type,entity_id,before_value,after_value,device_id) values(u,p_operation_id,'interval',entity::text,before_row,item,p_device_id);
  end loop;
  -- No direct DML is allowed. Every writer holds this owner's timeline lock until commit.
  -- This is the transactional equivalent of an exclusion constraint, tested in test-db.mjs.
  if exists(
    select 1 from (select start_at,lag(end_at) over(order by start_at,end_at) previous_end from public.activity_intervals where owner_user_id=u and deleted_at is null) q where start_at<previous_end
  ) then raise exception 'INTERVAL_OVERLAP' using errcode='23P01'; end if;
  if exists(select 1 from public.activity_intervals where owner_user_id=u and deleted_at is null and (cursor_value is null or end_at>cursor_value)) then raise exception 'OPEN_RANGE_OVERLAP' using errcode='22023'; end if;
  if (select count(*) from public.categories where owner_user_id=u)>500 or (select count(*) from public.activity_intervals where owner_user_id=u)>50000 then raise exception 'DATASET_LIMIT' using errcode='22023'; end if;
  before_row:=jsonb_build_object('cursor_at',(select cursor_at from public.timeline_state where owner_user_id=u),'timezone',(select reporting_timezone from public.profiles where owner_user_id=u),'revision',r);
  update public.timeline_state set cursor_at=cursor_value,revision=r+1,updated_at=now() where owner_user_id=u;
  update public.profiles set reporting_timezone=timezone_value,updated_at=now() where owner_user_id=u;
  insert into public.change_log(owner_user_id,operation_id,entity_type,entity_id,before_value,after_value,device_id) values(u,p_operation_id,'timeline',u::text,before_row,jsonb_build_object('cursor_at',cursor_value,'timezone',timezone_value,'revision',r+1),p_device_id);
  answer:=jsonb_build_object('operation_id',p_operation_id,'revision',r+1);
  insert into public.mutation_receipts(owner_user_id,operation_id,request_hash,applied_revision,result) values(u,p_operation_id,request_digest,r+1,answer);
  -- Retain receipts permanently for replay safety; audit history has an explicit 90-day bound.
  delete from public.change_log where owner_user_id=u and created_at<now()-interval '90 days';
  return answer;
end $$;
revoke all on function public.apply_timeline_operation_v2(uuid,bigint,text,jsonb,uuid) from public,anon;
grant execute on function public.apply_timeline_operation_v2(uuid,bigint,text,jsonb,uuid) to authenticated;

create or replace function public.apply_timeline_operation(
  p_operation_id uuid,p_expected_revision bigint,p_type text,p_payload jsonb,p_device_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  u uuid:=auth.uid(); r bigint; request_digest text;
  receipt public.mutation_receipts%rowtype;
  item jsonb; before_row jsonb; entity uuid; old_version bigint;
  cursor_value timestamptz; timezone_value text; answer jsonb;
begin
  if not public.daytrace_is_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  if p_operation_id is null or p_device_id is null or p_expected_revision is null or p_expected_revision<0 or p_payload is null then
    raise exception 'INVALID_OPERATION' using errcode='22023';
  end if;
  if p_type is null or p_type not in ('initialize','capture','assign','split','merge','adjust_boundary','soft_delete','restore','undo','category_update','import_batch','fill_gap','profile_update') then
    raise exception 'INVALID_OPERATION_TYPE' using errcode='22023';
  end if;
  if octet_length(p_payload::text)>20*1024*1024 or jsonb_typeof(p_payload)<>'object'
    or jsonb_typeof(p_payload->'categories') is distinct from 'array'
    or jsonb_typeof(p_payload->'intervals') is distinct from 'array'
    or not (p_payload ? 'cursor_at') or not (p_payload ? 'timezone')
    or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('categories','intervals','cursor_at','timezone'))
    or jsonb_array_length(p_payload->'categories')>500 or jsonb_array_length(p_payload->'intervals')>50000 then
    raise exception 'INVALID_PAYLOAD' using errcode='22023';
  end if;
  -- JSONB canonical serialization makes the receipt independent of property ordering.
  request_digest:=md5(jsonb_build_object('type',p_type,'revision',p_expected_revision,'payload',p_payload,'device',p_device_id)::text);
  insert into public.timeline_state(owner_user_id) values(u) on conflict do nothing;
  select revision into r from public.timeline_state where owner_user_id=u for update;
  select * into receipt from public.mutation_receipts where owner_user_id=u and operation_id=p_operation_id;
  if found then
    if receipt.request_hash<>request_digest then raise exception 'OPERATION_ID_REUSED_WITH_DIFFERENT_PAYLOAD' using errcode='22023'; end if;
    return receipt.result;
  end if;
  -- Old receipt replays above are safe. New legacy writes must not lose a secondary activity.
  if exists(select 1 from public.activity_intervals where owner_user_id=u and secondary_category_id is not null) then
    raise exception 'CLIENT_UPDATE_REQUIRED: update DayTrace to use concurrent activities' using errcode='22023';
  end if;
  if r<>p_expected_revision then raise exception 'REVISION_CONFLICT current=%',r using errcode='P0001'; end if;
  timezone_value:=p_payload->>'timezone';
  if timezone_value is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=timezone_value) then raise exception 'INVALID_TIMEZONE' using errcode='22023'; end if;
  cursor_value:=(p_payload->>'cursor_at')::timestamptz;
  -- Timestamp is from the user's device, including offline captures. Never substitute delivery time.
  if cursor_value is not null and not isfinite(cursor_value) then raise exception 'INVALID_CURSOR' using errcode='22023'; end if;
  insert into public.profiles(owner_user_id) values(u) on conflict do nothing;

  for item in select value from jsonb_array_elements(p_payload->'categories') loop
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','name','color','icon','sort_order','is_pinned','archived_at','version')) then raise exception 'INVALID_CATEGORY_FIELDS' using errcode='22023'; end if;
    entity:=(item->>'id')::uuid;
    select to_jsonb(c),c.version into before_row,old_version from public.categories c where c.owner_user_id=u and c.id=entity;
    if found and (item->>'version')::bigint<=old_version then raise exception 'CATEGORY_VERSION_CONFLICT' using errcode='22023'; end if;
    insert into public.categories(id,owner_user_id,name,color,icon,sort_order,is_pinned,archived_at,version)
    values(entity,u,item->>'name',item->>'color',item->>'icon',(item->>'sort_order')::integer,(item->>'is_pinned')::boolean,(item->>'archived_at')::timestamptz,(item->>'version')::bigint)
    on conflict(owner_user_id,id) do update set name=excluded.name,color=excluded.color,icon=excluded.icon,sort_order=excluded.sort_order,is_pinned=excluded.is_pinned,archived_at=excluded.archived_at,version=excluded.version,updated_at=now();
    insert into public.change_log(owner_user_id,operation_id,entity_type,entity_id,before_value,after_value,device_id) values(u,p_operation_id,'category',entity::text,before_row,item,p_device_id);
  end loop;
  for item in select value from jsonb_array_elements(p_payload->'intervals') loop
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('id','start_at','end_at','category_id','note','version','deleted_at')) then raise exception 'INVALID_INTERVAL_FIELDS' using errcode='22023'; end if;
    entity:=(item->>'id')::uuid;
    select to_jsonb(i),i.version into before_row,old_version from public.activity_intervals i where i.owner_user_id=u and i.id=entity;
    if found then
      if (item->>'version')::bigint<=old_version then raise exception 'INTERVAL_VERSION_CONFLICT' using errcode='22023'; end if;
      if before_row->>'deleted_at' is not null and item->>'deleted_at' is null and (before_row->>'deleted_at')::timestamptz<now()-interval '30 days' then raise exception 'RESTORE_EXPIRED' using errcode='22023'; end if;
    end if;
    if not isfinite((item->>'start_at')::timestamptz) or not isfinite((item->>'end_at')::timestamptz) then raise exception 'INVALID_TIME' using errcode='22023'; end if;
    insert into public.activity_intervals(id,owner_user_id,start_at,end_at,category_id,note,version,deleted_at)
    values(entity,u,(item->>'start_at')::timestamptz,(item->>'end_at')::timestamptz,(item->>'category_id')::uuid,item->>'note',(item->>'version')::bigint,(item->>'deleted_at')::timestamptz)
    on conflict(owner_user_id,id) do update set start_at=excluded.start_at,end_at=excluded.end_at,category_id=excluded.category_id,note=excluded.note,version=excluded.version,deleted_at=excluded.deleted_at,updated_at=now();
    insert into public.change_log(owner_user_id,operation_id,entity_type,entity_id,before_value,after_value,device_id) values(u,p_operation_id,'interval',entity::text,before_row,item,p_device_id);
  end loop;
  -- No direct DML is allowed. Every writer holds this owner's timeline lock until commit.
  -- This is the transactional equivalent of an exclusion constraint, tested in test-db.mjs.
  if exists(
    select 1 from (select start_at,lag(end_at) over(order by start_at,end_at) previous_end from public.activity_intervals where owner_user_id=u and deleted_at is null) q where start_at<previous_end
  ) then raise exception 'INTERVAL_OVERLAP' using errcode='23P01'; end if;
  if exists(select 1 from public.activity_intervals where owner_user_id=u and deleted_at is null and (cursor_value is null or end_at>cursor_value)) then raise exception 'OPEN_RANGE_OVERLAP' using errcode='22023'; end if;
  if (select count(*) from public.categories where owner_user_id=u)>500 or (select count(*) from public.activity_intervals where owner_user_id=u)>50000 then raise exception 'DATASET_LIMIT' using errcode='22023'; end if;
  before_row:=jsonb_build_object('cursor_at',(select cursor_at from public.timeline_state where owner_user_id=u),'timezone',(select reporting_timezone from public.profiles where owner_user_id=u),'revision',r);
  update public.timeline_state set cursor_at=cursor_value,revision=r+1,updated_at=now() where owner_user_id=u;
  update public.profiles set reporting_timezone=timezone_value,updated_at=now() where owner_user_id=u;
  insert into public.change_log(owner_user_id,operation_id,entity_type,entity_id,before_value,after_value,device_id) values(u,p_operation_id,'timeline',u::text,before_row,jsonb_build_object('cursor_at',cursor_value,'timezone',timezone_value,'revision',r+1),p_device_id);
  answer:=jsonb_build_object('operation_id',p_operation_id,'revision',r+1);
  insert into public.mutation_receipts(owner_user_id,operation_id,request_hash,applied_revision,result) values(u,p_operation_id,request_digest,r+1,answer);
  -- Retain receipts permanently for replay safety; audit history has an explicit 90-day bound.
  delete from public.change_log where owner_user_id=u and created_at<now()-interval '90 days';
  return answer;
end $$;
revoke all on function public.apply_timeline_operation(uuid,bigint,text,jsonb,uuid) from public,anon;
grant execute on function public.apply_timeline_operation(uuid,bigint,text,jsonb,uuid) to authenticated;
do $guard$ begin
 if (select activities from daytrace_secondary_upgrade_guard) is distinct from
    (select md5(coalesce(jsonb_agg(to_jsonb(i)-'secondary_category_id' order by owner_user_id,id)::text,'[]')) from public.activity_intervals i)
 or (select timelines from daytrace_secondary_upgrade_guard) is distinct from
    (select md5(coalesce(jsonb_agg(to_jsonb(t) order by owner_user_id)::text,'[]')) from public.timeline_state t)
 then raise exception 'Existing data changed during secondary-activity migration'; end if;
end $guard$;
commit;
