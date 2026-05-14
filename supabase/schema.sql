create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role' and typnamespace = 'public'::regnamespace) then
    create type public.user_role as enum ('employee', 'manager', 'director', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'attendance_status' and typnamespace = 'public'::regnamespace) then
    create type public.attendance_status as enum ('present', 'absent', 'late', 'checked-in-only', 'on-leave');
  end if;

  if not exists (select 1 from pg_type where typname = 'leave_type' and typnamespace = 'public'::regnamespace) then
    create type public.leave_type as enum ('sick', 'casual', 'annual');
  end if;

  if not exists (select 1 from pg_type where typname = 'leave_status' and typnamespace = 'public'::regnamespace) then
    create type public.leave_status as enum ('pending_manager', 'pending_director', 'approved', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_status' and typnamespace = 'public'::regnamespace) then
    create type public.approval_status as enum ('pending', 'approved', 'rejected');
  end if;
end
$$;

alter type public.leave_type add value if not exists 'emergency';

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.projects drop column if exists department_id;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'employee',
  project_id uuid references public.projects(id) on delete set null,
  reporting_time time not null default '09:00',
  check_in_grace_minutes integer not null default 15,
  check_out_reminder_time time not null default '19:00',
  sick_leave_days integer not null default 10,
  emergency_leave_days integer not null default 5,
  casual_leave_days integer not null default 10,
  annual_leave_days integer not null default 14,
  line_manager_id uuid references public.users(id) on delete set null,
  project_manager_id uuid references public.users(id) on delete set null,
  director_id uuid references public.users(id) on delete set null,
  phone text,
  is_active boolean not null default true,
  joined_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users drop column if exists department_id;
alter table public.users add column if not exists check_in_grace_minutes integer not null default 15;
alter table public.users add column if not exists check_out_reminder_time time not null default '19:00';
alter table public.users add column if not exists sick_leave_days integer not null default 10;
alter table public.users add column if not exists emergency_leave_days integer not null default 5;
alter table public.users add column if not exists casual_leave_days integer not null default 10;
alter table public.users add column if not exists annual_leave_days integer not null default 14;

drop table if exists public.departments;

create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  work_date date not null,
  reporting_time time not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  total_hours numeric(5, 2),
  status public.attendance_status not null default 'absent',
  remarks text,
  edited_by uuid references public.users(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_logs_employee_id_work_date_key unique (employee_id, work_date),
  constraint check_out_after_check_in check (
    check_out_at is null or check_in_at is null or check_out_at > check_in_at
  )
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  leave_type public.leave_type not null,
  start_date date not null,
  end_date date not null,
  total_days integer generated always as ((end_date - start_date) + 1) stored,
  reason text not null,
  status public.leave_status not null default 'pending_manager',
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint future_leave_only check (end_date >= start_date),
  constraint valid_leave_range check (end_date >= start_date)
);

create table if not exists public.approval_workflow (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests(id) on delete cascade,
  approval_level integer not null check (approval_level in (1, 2)),
  approver_id uuid not null references public.users(id) on delete restrict,
  approver_role text not null,
  status public.approval_status not null default 'pending',
  comment text,
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_workflow_leave_request_id_approval_level_key unique (leave_request_id, approval_level)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null check (category in ('attendance', 'leave', 'approval', 'admin')),
  title text not null,
  message text not null,
  link text,
  source_key text unique,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_settings (
  id uuid primary key default gen_random_uuid(),
  default_reporting_time time not null default '09:00',
  check_in_grace_minutes integer not null default 15,
  check_out_reminder_time time not null default '19:00',
  minimum_leave_notice_hours integer not null default 48,
  sick_leave_days integer not null default 10,
  emergency_leave_days integer not null default 5,
  casual_leave_days integer not null default 10,
  annual_leave_days integer not null default 14,
  casual_leave_notice_hours integer not null default 48,
  annual_leave_notice_hours integer not null default 48,
  leave_policy_notes text not null default 'Sick leave can be used for medical illness or treatment and does not require advance notice.
Emergency leave can be used for urgent personal or family situations and does not require advance notice.
Casual leave is for planned short personal time away and requires advance notice.
Annual leave is for planned vacations or longer breaks and requires advance notice.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.attendance_settings add column if not exists default_reporting_time time not null default '09:00';
alter table public.attendance_settings add column if not exists minimum_leave_notice_hours integer not null default 48;
alter table public.attendance_settings add column if not exists sick_leave_days integer not null default 10;
alter table public.attendance_settings add column if not exists emergency_leave_days integer not null default 5;
alter table public.attendance_settings add column if not exists casual_leave_days integer not null default 10;
alter table public.attendance_settings add column if not exists annual_leave_days integer not null default 14;
alter table public.attendance_settings add column if not exists casual_leave_notice_hours integer not null default 48;
alter table public.attendance_settings add column if not exists annual_leave_notice_hours integer not null default 48;
alter table public.attendance_settings add column if not exists leave_policy_notes text not null default 'Sick leave can be used for medical illness or treatment and does not require advance notice.
Emergency leave can be used for urgent personal or family situations and does not require advance notice.
Casual leave is for planned short personal time away and requires advance notice.
Annual leave is for planned vacations or longer breaks and requires advance notice.';

insert into public.attendance_settings (default_reporting_time, check_in_grace_minutes, check_out_reminder_time)
select '09:00', 15, '19:00'
where not exists (select 1 from public.attendance_settings);

create index if not exists attendance_logs_work_date_idx on public.attendance_logs(work_date);
create index if not exists attendance_logs_employee_date_idx on public.attendance_logs(employee_id, work_date desc);
create index if not exists leave_requests_employee_idx on public.leave_requests(employee_id, submitted_at desc);
create index if not exists approval_workflow_approver_idx on public.approval_workflow(approver_id, status);
create index if not exists users_role_idx on public.users(role);
create index if not exists notifications_user_read_idx on public.notifications(user_id, is_read, created_at desc);
create index if not exists notifications_source_key_idx on public.notifications(source_key);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.users (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email,
    'employee'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email;

  return new;
end;
$function$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $function$
  select role
  from public.users
  where id = auth.uid()
  limit 1;
$function$;

drop trigger if exists on_users_updated on public.users;
create trigger on_users_updated
before update on public.users
for each row
execute function public.handle_updated_at();

drop trigger if exists on_attendance_updated on public.attendance_logs;
create trigger on_attendance_updated
before update on public.attendance_logs
for each row
execute function public.handle_updated_at();

drop trigger if exists on_leave_updated on public.leave_requests;
create trigger on_leave_updated
before update on public.leave_requests
for each row
execute function public.handle_updated_at();

drop trigger if exists on_approval_updated on public.approval_workflow;
create trigger on_approval_updated
before update on public.approval_workflow
for each row
execute function public.handle_updated_at();

drop trigger if exists on_push_subscriptions_updated on public.push_subscriptions;
create trigger on_push_subscriptions_updated
before update on public.push_subscriptions
for each row
execute function public.handle_updated_at();

drop trigger if exists on_attendance_settings_updated on public.attendance_settings;
create trigger on_attendance_settings_updated
before update on public.attendance_settings
for each row
execute function public.handle_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.projects enable row level security;
alter table public.users enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.leave_requests enable row level security;
alter table public.approval_workflow enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.attendance_settings enable row level security;

drop policy if exists "Users can read active org users" on public.users;
create policy "Users can read active org users" on public.users
for select
using (is_active = true or public.current_user_role() = 'admin');

drop policy if exists "Admins manage users" on public.users;
create policy "Admins manage users" on public.users
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Employees read own attendance" on public.attendance_logs;
create policy "Employees read own attendance" on public.attendance_logs
for select
using (employee_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Employees insert own same-day check-in" on public.attendance_logs;
create policy "Employees insert own same-day check-in" on public.attendance_logs
for insert
with check (employee_id = auth.uid() and work_date = current_date);

drop policy if exists "Employees update own same-day checkout only" on public.attendance_logs;
create policy "Employees update own same-day checkout only" on public.attendance_logs
for update
using (employee_id = auth.uid() and work_date = current_date)
with check (employee_id = auth.uid() and work_date = current_date);

drop policy if exists "Admins manage attendance" on public.attendance_logs;
create policy "Admins manage attendance" on public.attendance_logs
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Employees manage own leave" on public.leave_requests;
create policy "Employees manage own leave" on public.leave_requests
for select
using (employee_id = auth.uid() or public.current_user_role() in ('manager', 'director', 'admin'));

drop policy if exists "Employees submit own leave" on public.leave_requests;
create policy "Employees submit own leave" on public.leave_requests
for insert
with check (
  employee_id = auth.uid()
  and start_date > current_date
  and end_date >= start_date
);

drop policy if exists "Approvers read workflow" on public.approval_workflow;
create policy "Approvers read workflow" on public.approval_workflow
for select
using (approver_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Approvers update assigned workflow" on public.approval_workflow;
create policy "Approvers update assigned workflow" on public.approval_workflow
for update
using (approver_id = auth.uid() or public.current_user_role() = 'admin')
with check (approver_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Admins read audit logs" on public.audit_logs;
create policy "Admins read audit logs" on public.audit_logs
for select
using (public.current_user_role() = 'admin');

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
for select
using (user_id = auth.uid());

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Admins manage attendance settings" on public.attendance_settings;
create policy "Admins manage attendance settings" on public.attendance_settings
for all
using (public.current_user_role() in ('admin', 'director'))
with check (public.current_user_role() in ('admin', 'director'));
