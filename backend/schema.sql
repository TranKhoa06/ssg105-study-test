-- No question text or image bytes belong in this public schema.
create table if not exists public.ssg_members(
  user_id uuid primary key references auth.users(id),
  role text not null default 'member' check(role in ('admin','member')),
  status text not null default 'pending' check(status in ('pending','active','blocked')),
  created_at timestamptz not null default now()
);
create table if not exists public.ssg_questions(
  id integer primary key check(id>0),
  data jsonb not null check(jsonb_typeof(data)='object'),
  published boolean not null default false
);
create table if not exists public.ssg_progress(
  user_id uuid primary key references auth.users(id),
  data jsonb not null check(jsonb_typeof(data)='object'),
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.ssg_members enable row level security;
alter table public.ssg_questions enable row level security;
alter table public.ssg_progress enable row level security;
revoke all on public.ssg_members,public.ssg_questions,public.ssg_progress from anon,authenticated;
grant select on public.ssg_members,public.ssg_questions,public.ssg_progress to authenticated;

create or replace function public.ssg_is_active() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ssg_members where user_id=auth.uid() and status='active');
$$;
create or replace function public.ssg_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.ssg_members where user_id=auth.uid() and role='admin' and status='active');
$$;
revoke all on function public.ssg_is_active(),public.ssg_is_admin() from public,anon;
grant execute on function public.ssg_is_active(),public.ssg_is_admin() to authenticated;

drop policy if exists ssg_read_own_member on public.ssg_members;
create policy ssg_read_own_member on public.ssg_members for select to authenticated using(user_id=auth.uid());
drop policy if exists ssg_read_questions on public.ssg_questions;
create policy ssg_read_questions on public.ssg_questions for select to authenticated using(public.ssg_is_active() and published);
drop policy if exists ssg_read_own_progress on public.ssg_progress;
create policy ssg_read_own_progress on public.ssg_progress for select to authenticated using(public.ssg_is_active() and user_id=auth.uid());

create or replace function public.ssg_save_progress(p_data jsonb,p_expected_revision bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; next_revision bigint; caller uuid:=auth.uid();
begin
  if caller is null or not public.ssg_is_active() then raise exception 'Access denied' using errcode='42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or p_data->>'subject' is distinct from 'SSG105' or p_data->>'version' is distinct from '1' or
     jsonb_typeof(p_data->'attempts') is distinct from 'array' or jsonb_typeof(p_data->'bookmarks') is distinct from 'array' or
     octet_length(p_data::text)>5000000 then raise exception 'Invalid progress'; end if;
  -- Lock even a previously missing progress row to serialize the first save.
  perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
  select revision into current_revision from public.ssg_progress where user_id=caller for update;
  current_revision:=coalesce(current_revision,0);
  if current_revision<>p_expected_revision then raise exception 'Progress changed on another device. Reload before saving.' using errcode='40001'; end if;
  next_revision:=current_revision+1;
  insert into public.ssg_progress(user_id,data,revision) values(caller,p_data,next_revision)
  on conflict(user_id) do update set data=excluded.data,revision=excluded.revision,updated_at=now();
  return next_revision;
end;
$$;
revoke all on function public.ssg_save_progress(jsonb,bigint) from public,anon;
grant execute on function public.ssg_save_progress(jsonb,bigint) to authenticated;

create or replace function public.ssg_register_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.ssg_members(user_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.ssg_register_user() from public,anon,authenticated;
drop trigger if exists ssg_on_auth_user_created on auth.users;
create trigger ssg_on_auth_user_created after insert on auth.users for each row execute function public.ssg_register_user();
insert into public.ssg_members(user_id) select id from auth.users on conflict do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ssg105-private','ssg105-private',false,25000000,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists ssg_read_private_images on storage.objects;
create policy ssg_read_private_images on storage.objects for select to authenticated
using(bucket_id='ssg105-private' and public.ssg_is_active());
-- Uploads and membership approval use trusted administration, never a browser service key.
