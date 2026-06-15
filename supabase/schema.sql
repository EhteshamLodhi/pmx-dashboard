create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role' and typnamespace = 'public'::regnamespace) then
    create type public.user_role as enum ('employee', 'manager', 'director', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'attendance_status' and typnamespace = 'public'::regnamespace) then
    create type public.attendance_status as enum ('present', 'absent', 'late', 'checked-in-only', 'half-day', 'on-leave', 'holiday', 'weekly-off');
  end if;

  if not exists (select 1 from pg_type where typname = 'leave_type' and typnamespace = 'public'::regnamespace) then
    create type public.leave_type as enum ('sick', 'minor_sick', 'emergency', 'casual', 'annual', 'paternity', 'marriage', 'hajj', 'umrah');
  end if;

  if not exists (select 1 from pg_type where typname = 'leave_status' and typnamespace = 'public'::regnamespace) then
    create type public.leave_status as enum ('pending_manager', 'pending_project_manager', 'pending_director', 'approved', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_status' and typnamespace = 'public'::regnamespace) then
    create type public.approval_status as enum ('pending', 'approved', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'reimbursement_status' and typnamespace = 'public'::regnamespace) then
    create type public.reimbursement_status as enum ('draft', 'submitted', 'pending_manager', 'pending_director', 'approved', 'rejected', 'paid', 'cancelled', 'more_info');
  end if;

  if not exists (select 1 from pg_type where typname = 'reimbursement_approval_status' and typnamespace = 'public'::regnamespace) then
    create type public.reimbursement_approval_status as enum ('pending', 'approved', 'rejected', 'more_info');
  end if;
end
$$;

alter type public.leave_type add value if not exists 'emergency';
alter type public.leave_type add value if not exists 'minor_sick';
alter type public.leave_type add value if not exists 'paternity';
alter type public.leave_type add value if not exists 'marriage';
alter type public.leave_type add value if not exists 'hajj';
alter type public.leave_type add value if not exists 'umrah';
alter type public.leave_status add value if not exists 'pending_project_manager';
alter type public.attendance_status add value if not exists 'half-day';
alter type public.attendance_status add value if not exists 'holiday';
alter type public.attendance_status add value if not exists 'weekly-off';
alter type public.reimbursement_status add value if not exists 'more_info';
alter type public.reimbursement_approval_status add value if not exists 'more_info';

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
  reporting_time time not null default '11:00',
  check_in_grace_minutes integer not null default 0,
  check_out_reminder_time time not null default '20:00',
  sick_leave_days integer not null default 0,
  minor_sick_leave_days integer not null default 12,
  emergency_leave_days integer not null default 3,
  casual_leave_days integer not null default 12,
  annual_leave_days integer not null default 10,
  paternity_leave_days integer not null default 3,
  marriage_leave_days integer not null default 3,
  hajj_leave_days integer not null default 40,
  umrah_leave_days integer not null default 0,
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
alter table public.users alter column reporting_time set default '11:00';
alter table public.users alter column check_in_grace_minutes set default 0;
alter table public.users alter column check_out_reminder_time set default '20:00';
alter table public.users alter column sick_leave_days set default 0;
alter table public.users alter column emergency_leave_days set default 3;
alter table public.users alter column casual_leave_days set default 12;
alter table public.users alter column annual_leave_days set default 10;
alter table public.users add column if not exists check_in_grace_minutes integer not null default 0;
alter table public.users add column if not exists check_out_reminder_time time not null default '20:00';
alter table public.users add column if not exists sick_leave_days integer not null default 0;
alter table public.users add column if not exists minor_sick_leave_days integer not null default 12;
alter table public.users add column if not exists emergency_leave_days integer not null default 3;
alter table public.users add column if not exists casual_leave_days integer not null default 12;
alter table public.users add column if not exists annual_leave_days integer not null default 10;
alter table public.users add column if not exists paternity_leave_days integer not null default 3;
alter table public.users add column if not exists marriage_leave_days integer not null default 3;
alter table public.users add column if not exists hajj_leave_days integer not null default 40;
alter table public.users add column if not exists umrah_leave_days integer not null default 0;

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
  approval_level integer not null check (approval_level in (1, 2, 3)),
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
  category text not null check (category in ('attendance', 'leave', 'approval', 'admin', 'reimbursement')),
  title text not null,
  message text not null,
  link text,
  source_key text unique,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications
  add constraint notifications_category_check check (category in ('attendance', 'leave', 'approval', 'admin', 'reimbursement'));

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions add column if not exists p256dh text;
alter table public.push_subscriptions add column if not exists auth text;

update public.push_subscriptions
set
  p256dh = coalesce(p256dh, subscription -> 'keys' ->> 'p256dh'),
  auth = coalesce(auth, subscription -> 'keys' ->> 'auth')
where p256dh is null or auth is null;

delete from public.push_subscriptions
where endpoint is null or p256dh is null or auth is null;

alter table public.push_subscriptions alter column p256dh set not null;
alter table public.push_subscriptions alter column auth set not null;

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_name text not null,
  holiday_date date not null,
  start_date date not null default current_date,
  end_date date not null default current_date,
  recurring boolean not null default false,
  holiday_type text not null default 'public' check (holiday_type in ('public', 'company', 'optional')),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint holidays_valid_range check (end_date >= start_date),
  constraint holidays_unique_date_name unique (holiday_date, holiday_name)
);

alter table public.holidays add column if not exists start_date date;
alter table public.holidays add column if not exists end_date date;

update public.holidays
set
  start_date = coalesce(start_date, holiday_date),
  end_date = coalesce(end_date, start_date, holiday_date)
where start_date is null or end_date is null;

alter table public.holidays alter column start_date set default current_date;
alter table public.holidays alter column end_date set default current_date;
alter table public.holidays alter column start_date set not null;
alter table public.holidays alter column end_date set not null;

alter table public.holidays drop constraint if exists holidays_valid_range;
alter table public.holidays
  add constraint holidays_valid_range check (end_date >= start_date);

create table if not exists public.attendance_settings (
  id uuid primary key default gen_random_uuid(),
  policy_effective_date date not null default '2026-06-15',
  default_reporting_time time not null default '11:00',
  check_in_grace_minutes integer not null default 0,
  global_reporting_time time not null default '11:00',
  global_grace_period integer not null default 0,
  check_out_reminder_time time not null default '20:00',
  closing_time time not null default '20:00',
  working_days text[] not null default array['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  weekly_off_days text[] not null default array['saturday', 'sunday'],
  work_week_effective_from date not null default '2026-06-15',
  minimum_leave_notice_hours integer not null default 48,
  sick_leave_days integer not null default 0,
  minor_sick_leave_days integer not null default 12,
  emergency_leave_days integer not null default 3,
  casual_leave_days integer not null default 12,
  annual_leave_days integer not null default 10,
  paternity_leave_days integer not null default 3,
  marriage_leave_days integer not null default 3,
  hajj_leave_days integer not null default 40,
  umrah_leave_days integer not null default 0,
  casual_sick_monthly_cap_days integer not null default 2,
  late_conversion_count integer not null default 3,
  annual_leave_eligibility_months integer not null default 12,
  casual_leave_notice_hours integer not null default 0,
  annual_leave_notice_hours integer not null default 360,
  annual_leave_notice_working_days integer not null default 15,
  leave_policy_notes text not null default 'Policy effective 15 June 2026.
Office timing is 11:00 AM to 8:00 PM. Any check-in after 11:00 AM is late unless approved.
Annual leave is 10 working days after 1 continuous year of service and requires 15 working days advance notice.
Casual leave and minor sick leave share a combined 12 working day annual pool, with a 2 day monthly cap unless specially approved.
Emergency, paternity, and marriage leave allow up to 3 working days. Hajj leave allows up to 40 calendar days subject to approval. Umrah leave is case-by-case.
Unused leave lapses at year end and is not encashable.
Leave approval chain is Line Manager -> Director.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reimbursement_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reimbursement_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default ('RB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  employee_id uuid not null references public.users(id) on delete cascade,
  category_id uuid references public.reimbursement_categories(id) on delete set null,
  expense_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'PKR',
  project text,
  vendor_name text,
  receipt_number text,
  description text not null,
  status public.reimbursement_status not null default 'submitted',
  submitted_at timestamptz,
  decided_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reimbursement_attachments (
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid not null references public.reimbursement_requests(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size integer not null default 0,
  file_path text not null,
  public_url text,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint reimbursement_attachment_type_check check (lower(file_type) in ('application/pdf', 'image/jpeg', 'image/jpg', 'image/png'))
);

create table if not exists public.reimbursement_approvals (
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid not null references public.reimbursement_requests(id) on delete cascade,
  approval_level integer not null check (approval_level in (1, 2, 3)),
  approver_id uuid not null references public.users(id) on delete restrict,
  approver_role text not null,
  status public.reimbursement_approval_status not null default 'pending',
  comment text,
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reimbursement_approvals_request_level_key unique (reimbursement_id, approval_level)
);

create table if not exists public.reimbursement_payments (
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid not null unique references public.reimbursement_requests(id) on delete cascade,
  payment_date date not null,
  payment_method text not null check (payment_method in ('bank_transfer', 'cash', 'cheque', 'other')),
  payment_reference text,
  remarks text,
  processed_by uuid references public.users(id) on delete set null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.reimbursement_comments (
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid not null references public.reimbursement_requests(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  comment text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reimbursement_audit_logs (
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid references public.reimbursement_requests(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

insert into public.reimbursement_categories (name)
values
  ('Transportation'),
  ('Fuel'),
  ('Dinner'),
  ('Lunch'),
  ('Hotel'),
  ('Mobile'),
  ('Internet'),
  ('Client Entertainment'),
  ('Office Supplies'),
  ('Project Expense'),
  ('Miscellaneous')
on conflict (name) do nothing;

alter table public.attendance_settings add column if not exists policy_effective_date date not null default '2026-06-15';
alter table public.attendance_settings add column if not exists closing_time time not null default '20:00';
alter table public.attendance_settings alter column default_reporting_time set default '11:00';
alter table public.attendance_settings alter column check_in_grace_minutes set default 0;
alter table public.attendance_settings alter column check_out_reminder_time set default '20:00';
alter table public.attendance_settings add column if not exists default_reporting_time time not null default '11:00';
alter table public.attendance_settings add column if not exists global_reporting_time time not null default '11:00';
alter table public.attendance_settings add column if not exists global_grace_period integer not null default 0;
alter table public.attendance_settings add column if not exists working_days text[] not null default array['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
alter table public.attendance_settings add column if not exists weekly_off_days text[] not null default array['saturday', 'sunday'];
alter table public.attendance_settings add column if not exists work_week_effective_from date not null default '2026-06-15';
alter table public.attendance_settings add column if not exists minimum_leave_notice_hours integer not null default 48;
alter table public.attendance_settings add column if not exists sick_leave_days integer not null default 0;
alter table public.attendance_settings add column if not exists minor_sick_leave_days integer not null default 12;
alter table public.attendance_settings add column if not exists emergency_leave_days integer not null default 3;
alter table public.attendance_settings add column if not exists casual_leave_days integer not null default 12;
alter table public.attendance_settings add column if not exists annual_leave_days integer not null default 10;
alter table public.attendance_settings add column if not exists paternity_leave_days integer not null default 3;
alter table public.attendance_settings add column if not exists marriage_leave_days integer not null default 3;
alter table public.attendance_settings add column if not exists hajj_leave_days integer not null default 40;
alter table public.attendance_settings add column if not exists umrah_leave_days integer not null default 0;
alter table public.attendance_settings add column if not exists casual_sick_monthly_cap_days integer not null default 2;
alter table public.attendance_settings add column if not exists late_conversion_count integer not null default 3;
alter table public.attendance_settings add column if not exists annual_leave_eligibility_months integer not null default 12;
alter table public.attendance_settings add column if not exists casual_leave_notice_hours integer not null default 0;
alter table public.attendance_settings add column if not exists annual_leave_notice_hours integer not null default 360;
alter table public.attendance_settings add column if not exists annual_leave_notice_working_days integer not null default 15;
alter table public.attendance_settings add column if not exists leave_policy_notes text not null default 'Policy effective 15 June 2026.
Office timing is 11:00 AM to 8:00 PM. Any check-in after 11:00 AM is late unless approved.
Annual leave is 10 working days after 1 continuous year of service and requires 15 working days advance notice.
Casual leave and minor sick leave share a combined 12 working day annual pool, with a 2 day monthly cap unless specially approved.
Emergency, paternity, and marriage leave allow up to 3 working days. Hajj leave allows up to 40 calendar days subject to approval. Umrah leave is case-by-case.
Unused leave lapses at year end and is not encashable.
Leave approval chain is Line Manager -> Director.';

insert into public.attendance_settings (default_reporting_time, check_in_grace_minutes, check_out_reminder_time)
select '11:00', 0, '20:00'
where not exists (select 1 from public.attendance_settings);

update public.attendance_settings
set
  policy_effective_date = coalesce(policy_effective_date, '2026-06-15'),
  default_reporting_time = coalesce(default_reporting_time, '11:00'),
  global_reporting_time = coalesce(global_reporting_time, default_reporting_time, '11:00'),
  check_in_grace_minutes = coalesce(check_in_grace_minutes, 0),
  global_grace_period = coalesce(global_grace_period, check_in_grace_minutes, 0),
  check_out_reminder_time = coalesce(check_out_reminder_time, '20:00'),
  closing_time = coalesce(closing_time, check_out_reminder_time, '20:00'),
  casual_leave_days = coalesce(casual_leave_days, 12),
  annual_leave_days = coalesce(annual_leave_days, 10),
  emergency_leave_days = coalesce(emergency_leave_days, 3),
  minor_sick_leave_days = coalesce(minor_sick_leave_days, 12),
  paternity_leave_days = coalesce(paternity_leave_days, 3),
  marriage_leave_days = coalesce(marriage_leave_days, 3),
  hajj_leave_days = coalesce(hajj_leave_days, 40),
  umrah_leave_days = coalesce(umrah_leave_days, 0),
  casual_sick_monthly_cap_days = coalesce(casual_sick_monthly_cap_days, 2),
  late_conversion_count = coalesce(late_conversion_count, 3),
  annual_leave_eligibility_months = coalesce(annual_leave_eligibility_months, 12),
  casual_leave_notice_hours = coalesce(casual_leave_notice_hours, 0),
  annual_leave_notice_hours = coalesce(annual_leave_notice_hours, 360),
  annual_leave_notice_working_days = coalesce(annual_leave_notice_working_days, 15);

update public.attendance_settings
set
  default_reporting_time = case when default_reporting_time = '09:00' then '11:00' else default_reporting_time end,
  global_reporting_time = case when global_reporting_time = '09:00' then '11:00' else global_reporting_time end,
  check_in_grace_minutes = case when check_in_grace_minutes = 15 then 0 else check_in_grace_minutes end,
  global_grace_period = case when global_grace_period = 15 then 0 else global_grace_period end,
  check_out_reminder_time = case when check_out_reminder_time = '19:00' then '20:00' else check_out_reminder_time end,
  closing_time = case when closing_time = '19:00' then '20:00' else closing_time end,
  sick_leave_days = case when sick_leave_days = 10 then 0 else sick_leave_days end,
  emergency_leave_days = case when emergency_leave_days = 5 then 3 else emergency_leave_days end,
  casual_leave_days = case when casual_leave_days = 10 then 12 else casual_leave_days end,
  annual_leave_days = case when annual_leave_days = 14 then 10 else annual_leave_days end,
  casual_leave_notice_hours = case when casual_leave_notice_hours = 48 then 0 else casual_leave_notice_hours end,
  annual_leave_notice_hours = case when annual_leave_notice_hours = 48 then 360 else annual_leave_notice_hours end,
  annual_leave_notice_working_days = case when annual_leave_notice_working_days = 2 then 15 else annual_leave_notice_working_days end;

alter table public.approval_workflow drop constraint if exists approval_workflow_approval_level_check;
alter table public.approval_workflow
  add constraint approval_workflow_approval_level_check check (approval_level in (1, 2, 3));

create index if not exists attendance_logs_work_date_idx on public.attendance_logs(work_date);
create index if not exists attendance_logs_employee_date_idx on public.attendance_logs(employee_id, work_date desc);
create index if not exists leave_requests_employee_idx on public.leave_requests(employee_id, submitted_at desc);
create index if not exists approval_workflow_approver_idx on public.approval_workflow(approver_id, status);
create index if not exists users_role_idx on public.users(role);
create index if not exists notifications_user_read_idx on public.notifications(user_id, is_read, created_at desc);
create index if not exists notifications_source_key_idx on public.notifications(source_key);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
create unique index if not exists push_subscriptions_endpoint_unique_idx on public.push_subscriptions(endpoint);
create index if not exists holidays_date_idx on public.holidays(holiday_date);
create index if not exists holidays_range_idx on public.holidays(start_date, end_date);
create index if not exists holidays_recurring_idx on public.holidays(recurring);
create index if not exists reimbursement_requests_employee_idx on public.reimbursement_requests(employee_id, created_at desc);
create index if not exists reimbursement_requests_status_idx on public.reimbursement_requests(status, created_at desc);
create index if not exists reimbursement_approvals_approver_idx on public.reimbursement_approvals(approver_id, status);
create index if not exists reimbursement_attachments_request_idx on public.reimbursement_attachments(reimbursement_id);

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

drop trigger if exists on_holidays_updated on public.holidays;
create trigger on_holidays_updated
before update on public.holidays
for each row
execute function public.handle_updated_at();

drop trigger if exists on_attendance_settings_updated on public.attendance_settings;
create trigger on_attendance_settings_updated
before update on public.attendance_settings
for each row
execute function public.handle_updated_at();

drop trigger if exists on_reimbursement_categories_updated on public.reimbursement_categories;
create trigger on_reimbursement_categories_updated
before update on public.reimbursement_categories
for each row
execute function public.handle_updated_at();

drop trigger if exists on_reimbursement_requests_updated on public.reimbursement_requests;
create trigger on_reimbursement_requests_updated
before update on public.reimbursement_requests
for each row
execute function public.handle_updated_at();

drop trigger if exists on_reimbursement_approvals_updated on public.reimbursement_approvals;
create trigger on_reimbursement_approvals_updated
before update on public.reimbursement_approvals
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
alter table public.holidays enable row level security;
alter table public.attendance_settings enable row level security;
alter table public.reimbursement_categories enable row level security;
alter table public.reimbursement_requests enable row level security;
alter table public.reimbursement_attachments enable row level security;
alter table public.reimbursement_approvals enable row level security;
alter table public.reimbursement_payments enable row level security;
alter table public.reimbursement_comments enable row level security;
alter table public.reimbursement_audit_logs enable row level security;

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

drop policy if exists "Authenticated users read holidays" on public.holidays;
create policy "Authenticated users read holidays" on public.holidays
for select
using (auth.uid() is not null);

drop policy if exists "Admins manage holidays" on public.holidays;
create policy "Admins manage holidays" on public.holidays
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Admins manage attendance settings" on public.attendance_settings;
create policy "Admins manage attendance settings" on public.attendance_settings
for all
using (public.current_user_role() in ('admin', 'director'))
with check (public.current_user_role() in ('admin', 'director'));

drop policy if exists "Authenticated users read reimbursement categories" on public.reimbursement_categories;
create policy "Authenticated users read reimbursement categories" on public.reimbursement_categories
for select
using (auth.uid() is not null);

drop policy if exists "Admins manage reimbursement categories" on public.reimbursement_categories;
create policy "Admins manage reimbursement categories" on public.reimbursement_categories
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Users read reimbursement requests" on public.reimbursement_requests;
create policy "Users read reimbursement requests" on public.reimbursement_requests
for select
using (employee_id = auth.uid() or public.current_user_role() in ('manager', 'director', 'admin'));

drop policy if exists "Employees submit reimbursements" on public.reimbursement_requests;
create policy "Employees submit reimbursements" on public.reimbursement_requests
for insert
with check (employee_id = auth.uid());

drop policy if exists "Employees update eligible reimbursements" on public.reimbursement_requests;
create policy "Employees update eligible reimbursements" on public.reimbursement_requests
for update
using (employee_id = auth.uid() or public.current_user_role() = 'admin')
with check (employee_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Users read reimbursement attachments" on public.reimbursement_attachments;
create policy "Users read reimbursement attachments" on public.reimbursement_attachments
for select
using (
  exists (
    select 1 from public.reimbursement_requests r
    where r.id = reimbursement_id
      and (r.employee_id = auth.uid() or public.current_user_role() in ('manager', 'director', 'admin'))
  )
);

drop policy if exists "Users insert reimbursement attachments" on public.reimbursement_attachments;
create policy "Users insert reimbursement attachments" on public.reimbursement_attachments
for insert
with check (uploaded_by = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Approvers read reimbursement workflow" on public.reimbursement_approvals;
create policy "Approvers read reimbursement workflow" on public.reimbursement_approvals
for select
using (approver_id = auth.uid() or public.current_user_role() in ('admin', 'director'));

drop policy if exists "Approvers update reimbursement workflow" on public.reimbursement_approvals;
create policy "Approvers update reimbursement workflow" on public.reimbursement_approvals
for update
using (approver_id = auth.uid() or public.current_user_role() = 'admin')
with check (approver_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Admins manage reimbursement payments" on public.reimbursement_payments;
create policy "Admins manage reimbursement payments" on public.reimbursement_payments
for all
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "Users read reimbursement comments" on public.reimbursement_comments;
create policy "Users read reimbursement comments" on public.reimbursement_comments
for select
using (
  exists (
    select 1 from public.reimbursement_requests r
    where r.id = reimbursement_id
      and (r.employee_id = auth.uid() or public.current_user_role() in ('manager', 'director', 'admin'))
  )
);

drop policy if exists "Admins read reimbursement audit logs" on public.reimbursement_audit_logs;
create policy "Admins read reimbursement audit logs" on public.reimbursement_audit_logs
for select
using (public.current_user_role() = 'admin');
