create extension if not exists pgcrypto;

create table if not exists public.users (
  uid uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  person_key text not null default '' check (person_key in ('','P','M','L')),
  role text not null default 'employee' check (role in ('admin','employee','locator')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create unique index if not exists users_person_key_unique
  on public.users(person_key)
  where person_key <> '';

create table if not exists public.schedules (
  week_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.settings (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  from_uid uuid references auth.users(id),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_reports (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.location_config (
  id text primary key default 'main',
  vehicle_id text not null default '',
  registration text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.vehicle_tracking (
  vehicle_id text primary key,
  registration text not null default '',
  owner_uid uuid references auth.users(id),
  latitude double precision,
  longitude double precision,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_locations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id text not null references public.vehicle_tracking(vehicle_id) on delete cascade,
  owner_uid uuid references auth.users(id),
  registration text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists chat_messages_created_at_idx on public.chat_messages(created_at desc);
create index if not exists whatsapp_reports_uid_created_at_idx on public.whatsapp_reports(uid, created_at desc);

create index if not exists vehicle_locations_vehicle_time_idx
  on public.vehicle_locations(vehicle_id, updated_at desc);

create table if not exists public.audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_uid uuid references auth.users(id),
  target_uid uuid references auth.users(id),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.users
    where uid = auth.uid() and disabled = false
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.users
    where uid = auth.uid() and disabled = false and role = 'admin'
  );
$$;

alter table public.users enable row level security;
alter table public.schedules enable row level security;
alter table public.settings enable row level security;
alter table public.proposals enable row level security;
alter table public.chat_messages enable row level security;
alter table public.whatsapp_reports enable row level security;
alter table public.location_config enable row level security;
alter table public.vehicle_tracking enable row level security;
alter table public.vehicle_locations enable row level security;
alter table public.audit enable row level security;

drop policy if exists users_select on public.users;
create policy users_select on public.users
for select using (auth.uid() = uid or public.is_admin());

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users
for all using (public.is_admin() and uid <> auth.uid())
with check (public.is_admin() and uid <> auth.uid());

drop policy if exists schedules_read on public.schedules;
create policy schedules_read on public.schedules
for select using (public.is_active_user());

drop policy if exists schedules_admin_write on public.schedules;
create policy schedules_admin_write on public.schedules
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings
for select using (public.is_active_user());

drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists proposals_access on public.proposals;
create policy proposals_access on public.proposals
for select using (public.is_admin() or from_uid = auth.uid());

drop policy if exists proposals_create on public.proposals;
create policy proposals_create on public.proposals
for insert with check (public.is_active_user() and from_uid = auth.uid());

drop policy if exists proposals_admin_update on public.proposals;
create policy proposals_admin_update on public.proposals
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists chat_read on public.chat_messages;
create policy chat_read on public.chat_messages
for select using (public.is_active_user());

drop policy if exists chat_create on public.chat_messages;
create policy chat_create on public.chat_messages
for insert with check (public.is_active_user() and uid = auth.uid());

drop policy if exists chat_admin_modify on public.chat_messages;
create policy chat_admin_modify on public.chat_messages
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists reports_read on public.whatsapp_reports;
create policy reports_read on public.whatsapp_reports
for select using (public.is_admin() or uid = auth.uid());

drop policy if exists reports_create on public.whatsapp_reports;
create policy reports_create on public.whatsapp_reports
for insert with check (public.is_active_user() and uid = auth.uid());

drop policy if exists reports_admin_modify on public.whatsapp_reports;
create policy reports_admin_modify on public.whatsapp_reports
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists location_config_read on public.location_config;
create policy location_config_read on public.location_config
for select using (public.is_active_user());

drop policy if exists location_config_admin_write on public.location_config;
create policy location_config_admin_write on public.location_config
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists vehicle_tracking_read on public.vehicle_tracking;
create policy vehicle_tracking_read on public.vehicle_tracking
for select using (
  public.is_admin()
  or (
    public.is_active_user()
    and (
      owner_uid = auth.uid()
      or vehicle_id = (select vehicle_id from public.location_config where id='main')
      or registration = (select registration from public.location_config where id='main')
    )
  )
);

drop policy if exists vehicle_tracking_locator_write on public.vehicle_tracking;
create policy vehicle_tracking_locator_write on public.vehicle_tracking
for insert with check (
  public.is_admin()
  or (
    public.is_active_user()
    and exists(select 1 from public.users u where u.uid=auth.uid() and u.role='locator')
    and owner_uid = auth.uid()
    and vehicle_id = (select vehicle_id from public.location_config where id='main')
  )
);

drop policy if exists vehicle_tracking_locator_update on public.vehicle_tracking;
create policy vehicle_tracking_locator_update on public.vehicle_tracking
for update using (
  public.is_admin()
  or (
    public.is_active_user()
    and owner_uid = auth.uid()
    and exists(select 1 from public.users u where u.uid=auth.uid() and u.role='locator')
    and vehicle_id = (select vehicle_id from public.location_config where id='main')
  )
) with check (
  public.is_admin()
  or (
    public.is_active_user()
    and owner_uid = auth.uid()
    and exists(select 1 from public.users u where u.uid=auth.uid() and u.role='locator')
    and vehicle_id = (select vehicle_id from public.location_config where id='main')
  )
);

drop policy if exists vehicle_tracking_admin_delete on public.vehicle_tracking;
create policy vehicle_tracking_admin_delete on public.vehicle_tracking
for delete using (public.is_admin());

drop policy if exists vehicle_locations_read on public.vehicle_locations;
create policy vehicle_locations_read on public.vehicle_locations
for select using (
  public.is_admin()
  or (public.is_active_user() and (owner_uid = auth.uid() or vehicle_id = (select vehicle_id from public.location_config where id='main')))
);

drop policy if exists vehicle_locations_locator_write on public.vehicle_locations;
create policy vehicle_locations_locator_write on public.vehicle_locations
for insert with check (
  public.is_admin()
  or (
    public.is_active_user()
    and owner_uid = auth.uid()
    and exists(select 1 from public.users u where u.uid=auth.uid() and u.role='locator')
    and vehicle_id = (select vehicle_id from public.location_config where id='main')
    and latitude between -90 and 90
    and longitude between -180 and 180
  )
);

drop policy if exists audit_admin_read on public.audit;
create policy audit_admin_read on public.audit
for select using (public.is_admin());

alter publication supabase_realtime add table public.schedules;
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.vehicle_tracking;
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.whatsapp_reports;


-- Retention: keep vehicle history for 7 days. This function can be invoked by
-- Supabase scheduled infrastructure without requiring Google Cloud Functions.
create or replace function public.cleanup_vehicle_locations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare deleted_count integer;
begin
  delete from public.vehicle_locations where updated_at < now() - interval '7 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
