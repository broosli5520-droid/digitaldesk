-- =====================================================================
-- DigitalDesk — School & Tuition Manager
-- One database, many institutes (schools, tuition centres, academies, madrasas).
-- Every row carries institute_id and is protected by Row Level Security:
-- a user sees only the institutes they belong to, and their role decides what they may change.
--   owner / admin : everything
--   accountant    : fees, payments, expenses, salaries (+ read students)
--   teacher       : attendance and marks (+ read students, classes)
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  created_at timestamptz not null default now()
);
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(coalesce(new.email, '')), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- plans (platform pricing)
create table public.plans (
  id text primary key,
  name text not null,
  price_monthly numeric(12,2) not null default 0,
  max_students int,                     -- null = unlimited
  max_staff_users int,                  -- logins (owner/admin/teacher/accountant); null = unlimited
  features text[] not null default '{}',
  sort int not null default 0
);
insert into public.plans (id, name, price_monthly, max_students, max_staff_users, features, sort) values
 ('free',     'Free',     0,    100,  3,    array['Up to 100 students','Admissions, attendance, fees, results','Fee challans, receipts & report cards','Parent portal & WhatsApp reminders','3 staff logins'], 1),
 ('basic',    'Basic',    1000, 400,  8,    array['Up to 400 students','Everything in Free','8 staff logins','Staff salaries & expenses','Priority help on WhatsApp'], 2),
 ('standard', 'Standard', 2000, 1000, 20,   array['Up to 1,000 students','Everything in Basic','20 staff logins','Multi-class bulk tools'], 3),
 ('premium',  'Premium',  3500, null, null, array['Unlimited students','Unlimited staff logins','Everything in Standard','Setup & data import done for you'], 4);

-- ---------------------------------------------------------------- institutes
create table public.institutes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$'),
  kind text not null default 'school' check (kind in ('school','tuition','academy','madrasa','college')),
  tagline text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  city text not null default '',
  principal_name text not null default '',
  session_label text not null default '',            -- e.g. "2026-27"
  currency text not null default 'PKR',
  fee_due_day int not null default 10 check (fee_due_day between 1 and 28),
  late_fee numeric(12,2) not null default 0 check (late_fee >= 0),
  bank_details text not null default '',              -- printed on fee challans
  admissions_open boolean not null default true,
  admission_note text not null default '',
  portal_enabled boolean not null default true,
  grading jsonb not null default '[{"min":90,"grade":"A+"},{"min":80,"grade":"A"},{"min":70,"grade":"B"},{"min":60,"grade":"C"},{"min":50,"grade":"D"},{"min":40,"grade":"E"},{"min":0,"grade":"F"}]',
  next_admission_no int not null default 1,
  next_invoice_no int not null default 1,
  next_receipt_no int not null default 1,
  plan_id text not null default 'free' references public.plans (id),
  plan_expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger institutes_updated before update on public.institutes for each row execute function public.set_updated_at();

create table public.institute_members (
  institute_id uuid not null references public.institutes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner','admin','accountant','teacher')),
  created_at timestamptz not null default now(),
  primary key (institute_id, user_id)
);
create index on public.institute_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin','accountant','teacher')),
  created_at timestamptz not null default now(),
  unique (institute_id, email)
);

create table public.platform_admins (user_id uuid primary key references auth.users (id) on delete cascade);

-- ---------------------------------------------------------------- access helpers
create or replace function public.member_role(p_inst uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.institute_members where institute_id = p_inst and user_id = auth.uid()
$$;
create or replace function public.is_member(p_inst uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.institute_members where institute_id = p_inst and user_id = auth.uid())
$$;
create or replace function public.has_role(p_inst uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.institute_members where institute_id = p_inst and user_id = auth.uid() and role = any (p_roles))
$$;
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
create or replace function public.effective_plan(p_inst uuid) returns public.plans
language sql stable security definer set search_path = public as $$
  select p.* from public.institutes i
  join public.plans p on p.id = case when i.plan_id <> 'free' and (i.plan_expires_at is null or i.plan_expires_at > now()) then i.plan_id else 'free' end
  where i.id = p_inst
$$;

-- ---------------------------------------------------------------- classes & subjects
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),   -- "Class 5", "Matric Physics batch", "Hifz"
  section text not null default '',
  monthly_fee numeric(12,2) not null default 0 check (monthly_fee >= 0),
  timing text not null default '',                                -- tuition batches: "4–6 pm"
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.classes (institute_id);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  max_marks numeric(6,2) not null default 100 check (max_marks > 0),
  sort int not null default 0
);
create index on public.subjects (class_id);

-- ---------------------------------------------------------------- students
create table public.students (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  admission_no int not null,
  roll_no text not null default '',
  name text not null check (char_length(name) between 1 and 100),
  father_name text not null default '',
  gender text not null default '' check (gender in ('','male','female')),
  dob date,
  phone text not null default '',          -- guardian (WhatsApp)
  phone2 text not null default '',
  address text not null default '',
  class_id uuid references public.classes (id) on delete set null,
  admission_date date not null default current_date,
  monthly_fee numeric(12,2) check (monthly_fee >= 0),   -- null = the class fee
  discount numeric(12,2) not null default 0 check (discount >= 0),  -- monthly concession
  family_code text not null default '',    -- siblings share it (family challan & sibling view)
  status text not null default 'active' check (status in ('active','left','graduated')),
  left_on date,
  notes text not null default '',
  portal_pin text not null default lpad((floor(random() * 1000000))::int::text, 6, '0'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institute_id, admission_no)
);
create index on public.students (institute_id, class_id);
create index on public.students (institute_id, family_code);
create trigger students_updated before update on public.students for each row execute function public.set_updated_at();

-- Admission numbers: next number per institute (row-locked, no gaps from races)
create or replace function public.students_assign_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.admission_no is null or new.admission_no <= 0 then
    update public.institutes set next_admission_no = next_admission_no + 1
     where id = new.institute_id returning next_admission_no - 1 into new.admission_no;
  else
    update public.institutes set next_admission_no = greatest(next_admission_no, new.admission_no + 1) where id = new.institute_id;
  end if;
  return new;
end $$;
create trigger students_no before insert on public.students for each row execute function public.students_assign_no();

-- Plan limit: active students
create or replace function public.students_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_count int;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then return new; end if;
  select max_students into v_max from public.effective_plan(new.institute_id);
  if v_max is null then return new; end if;
  select count(*) into v_count from public.students where institute_id = new.institute_id and status = 'active';
  if v_count >= v_max then
    raise exception 'plan limit: Your plan allows % active students. Upgrade in Plan & Billing to add more.', v_max;
  end if;
  return new;
end $$;
create trigger students_limit before insert or update of status on public.students for each row execute function public.students_limit();

-- ---------------------------------------------------------------- online admission requests
create table public.admission_requests (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  student_name text not null check (char_length(student_name) between 1 and 100),
  father_name text not null default '',
  phone text not null check (char_length(phone) between 7 and 20),
  class_wanted text not null default '',
  dob date,
  gender text not null default '' check (gender in ('','male','female')),
  address text not null default '',
  previous_school text not null default '',
  message text not null default '',
  status text not null default 'new' check (status in ('new','contacted','accepted','rejected')),
  student_id uuid references public.students (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.admission_requests (institute_id, status);

-- Public form (no login). Limits: 5 per phone per day, 200 per institute per day.
create or replace function public.submit_admission(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_inst public.institutes; v_phone text := left(trim(coalesce(p->>'phone','')), 20);
begin
  select * into v_inst from public.institutes where slug = lower(p_slug);
  if v_inst.id is null then raise exception 'Institute not found'; end if;
  if not v_inst.admissions_open then raise exception 'Admissions are closed right now.'; end if;
  if char_length(trim(coalesce(p->>'student_name',''))) < 1 or char_length(regexp_replace(v_phone, '\D', '', 'g')) < 7 then
    raise exception 'Please enter the student name and a valid phone number.';
  end if;
  if (select count(*) from public.admission_requests where institute_id = v_inst.id and phone = v_phone and created_at > now() - interval '1 day') >= 5
     or (select count(*) from public.admission_requests where institute_id = v_inst.id and created_at > now() - interval '1 day') >= 200 then
    raise exception 'Too many requests today. Please call the institute.';
  end if;
  insert into public.admission_requests (institute_id, student_name, father_name, phone, class_wanted, dob, gender, address, previous_school, message)
  values (v_inst.id, left(trim(p->>'student_name'),100), left(coalesce(p->>'father_name',''),100), v_phone, left(coalesce(p->>'class_wanted',''),60),
          nullif(p->>'dob','')::date, case when p->>'gender' in ('male','female') then p->>'gender' else '' end,
          left(coalesce(p->>'address',''),300), left(coalesce(p->>'previous_school',''),120), left(coalesce(p->>'message',''),1000));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- attendance
create table public.attendance (
  institute_id uuid not null references public.institutes (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  day date not null,
  status text not null check (status in ('P','A','L','V')),   -- present, absent, late, leave
  marked_by uuid references auth.users (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (student_id, day)
);
create index on public.attendance (institute_id, day);

-- ---------------------------------------------------------------- staff & salaries
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  designation text not null default '',
  phone text not null default '',
  monthly_salary numeric(12,2) not null default 0 check (monthly_salary >= 0),
  joined_on date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.staff (institute_id);

create table public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric(12,2) not null check (amount >= 0),
  deduction numeric(12,2) not null default 0 check (deduction >= 0),
  paid_on date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (staff_id, month)
);

-- ---------------------------------------------------------------- fees
create table public.fee_invoices (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  invoice_no int not null,
  month date check (month is null or extract(day from month) = 1),  -- monthly fee; null = other (admission, exam, books…)
  items jsonb not null default '[]',      -- [{"label":"Tuition fee","amount":2000}, …]
  amount numeric(12,2) not null default 0 check (amount >= 0),      -- sum of items
  discount numeric(12,2) not null default 0 check (discount >= 0),
  fine numeric(12,2) not null default 0 check (fine >= 0),
  paid numeric(12,2) not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','waived')),
  due_date date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (institute_id, invoice_no)
);
create unique index fee_invoices_one_month on public.fee_invoices (student_id, month) where month is not null;
create index on public.fee_invoices (institute_id, status);
create index on public.fee_invoices (institute_id, month);

create or replace function public.fee_total(i public.fee_invoices) returns numeric language sql immutable as $$
  select greatest(i.amount - i.discount, 0) + i.fine
$$;

create or replace function public.invoices_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.institutes set next_invoice_no = next_invoice_no + 1 where id = new.institute_id returning next_invoice_no - 1 into new.invoice_no;
  end if;
  -- amount always equals the items
  select coalesce(sum((x->>'amount')::numeric), 0) into new.amount from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) x;
  if new.status <> 'waived' then
    new.status := case when new.paid <= 0 then 'unpaid'
                       when new.paid >= greatest(new.amount - new.discount, 0) + new.fine then 'paid'
                       else 'partial' end;
  end if;
  return new;
end $$;
create trigger invoices_before before insert or update on public.fee_invoices for each row execute function public.invoices_before();

create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  invoice_id uuid not null references public.fee_invoices (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  receipt_no int not null,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash','bank','jazzcash','easypaisa','other')),
  reference text not null default '',
  paid_on date not null default current_date,
  received_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (institute_id, receipt_no)
);
create index on public.fee_payments (institute_id, paid_on);
create index on public.fee_payments (invoice_id);

create or replace function public.payments_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare v public.fee_invoices;
begin
  select * into v from public.fee_invoices where id = new.invoice_id;
  if v.id is null or v.institute_id <> new.institute_id then raise exception 'Invoice not found'; end if;
  new.student_id := v.student_id;
  new.received_by := coalesce(new.received_by, auth.uid());
  update public.institutes set next_receipt_no = next_receipt_no + 1 where id = new.institute_id returning next_receipt_no - 1 into new.receipt_no;
  return new;
end $$;
create trigger payments_before before insert on public.fee_payments for each row execute function public.payments_before();

create or replace function public.payments_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_inv uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.fee_invoices set paid = (select coalesce(sum(amount),0) from public.fee_payments where invoice_id = v_inv) where id = v_inv;
  return null;
end $$;
create trigger payments_after after insert or delete on public.fee_payments for each row execute function public.payments_after();

-- Create the month's fee invoices for every active student (skips students who already have one).
create or replace function public.generate_month_fees(p_inst uuid, p_month date, p_class uuid default null, p_extra jsonb default '[]') returns int
language plpgsql security definer set search_path = public as $$
declare v_inst public.institutes; v_month date := date_trunc('month', p_month)::date; v_count int;
begin
  if not public.has_role(p_inst, array['owner','admin','accountant']) then raise exception 'permission denied'; end if;
  select * into v_inst from public.institutes where id = p_inst;
  insert into public.fee_invoices (institute_id, student_id, invoice_no, month, items, discount, due_date)
  select p_inst, s.id, 0, v_month,
         jsonb_build_array(jsonb_build_object('label', 'Monthly fee — ' || to_char(v_month, 'Mon YYYY'), 'amount', coalesce(s.monthly_fee, c.monthly_fee, 0)))
           || coalesce(p_extra, '[]'::jsonb),
         least(s.discount, coalesce(s.monthly_fee, c.monthly_fee, 0)),
         v_month + (v_inst.fee_due_day - 1)
  from public.students s left join public.classes c on c.id = s.class_id
  where s.institute_id = p_inst and s.status = 'active' and (p_class is null or s.class_id = p_class)
    and not exists (select 1 from public.fee_invoices f where f.student_id = s.id and f.month = v_month)
  order by s.admission_no;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Add the late fine to unpaid invoices past their due date (once per invoice).
create or replace function public.apply_late_fines(p_inst uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_fine numeric; v_count int;
begin
  if not public.has_role(p_inst, array['owner','admin','accountant']) then raise exception 'permission denied'; end if;
  select late_fee into v_fine from public.institutes where id = p_inst;
  if coalesce(v_fine, 0) <= 0 then return 0; end if;
  update public.fee_invoices set fine = v_fine
   where institute_id = p_inst and status in ('unpaid','partial') and fine = 0 and due_date < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------- exams & marks
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  exam_date date,
  published boolean not null default false,       -- visible in the parent portal
  created_at timestamptz not null default now()
);
create index on public.exams (institute_id, class_id);

create table public.marks (
  institute_id uuid not null references public.institutes (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  obtained numeric(6,2) check (obtained >= 0),
  absent boolean not null default false,
  primary key (exam_id, student_id, subject_id)
);

-- ---------------------------------------------------------------- expenses & notices
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  category text not null default 'Other',
  amount numeric(12,2) not null check (amount > 0),
  spent_on date not null default current_date,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.expenses (institute_id, spent_on);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  body text not null default '',
  class_id uuid references public.classes (id) on delete cascade,   -- null = everyone
  created_at timestamptz not null default now()
);
create index on public.notices (institute_id, created_at desc);

-- ---------------------------------------------------------------- cross-tenant safety
-- A child row may only point at rows of the same institute.
create or replace function public.same_institute() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid; j jsonb := to_jsonb(new);
begin
  -- (fields are read through jsonb because each table has different columns)
  if j ? 'class_id' and j->>'class_id' is not null then
    select institute_id into v from public.classes where id = (j->>'class_id')::uuid;
    if v is distinct from new.institute_id then raise exception 'Class belongs to another institute'; end if;
  end if;
  if j ? 'student_id' then
    select institute_id into v from public.students where id = (j->>'student_id')::uuid;
    if v is distinct from new.institute_id then raise exception 'Student belongs to another institute'; end if;
  end if;
  if j ? 'exam_id' then
    select institute_id into v from public.exams where id = (j->>'exam_id')::uuid;
    if v is distinct from new.institute_id then raise exception 'Exam belongs to another institute'; end if;
  end if;
  if j ? 'subject_id' then
    select institute_id into v from public.subjects where id = (j->>'subject_id')::uuid;
    if v is distinct from new.institute_id then raise exception 'Subject belongs to another institute'; end if;
  end if;
  if j ? 'staff_id' then
    select institute_id into v from public.staff where id = (j->>'staff_id')::uuid;
    if v is distinct from new.institute_id then raise exception 'Staff belongs to another institute'; end if;
  end if;
  return new;
end $$;
create trigger chk before insert or update on public.students        for each row execute function public.same_institute();
create trigger chk before insert or update on public.exams           for each row execute function public.same_institute();
create trigger chk before insert or update on public.notices         for each row execute function public.same_institute();
create trigger chk before insert or update on public.subjects        for each row execute function public.same_institute();
create trigger chk before insert or update on public.attendance      for each row execute function public.same_institute();
create trigger chk before insert or update on public.fee_invoices    for each row execute function public.same_institute();
create trigger chk before insert or update on public.marks           for each row execute function public.same_institute();
create trigger chk before insert or update on public.salary_payments for each row execute function public.same_institute();

-- ---------------------------------------------------------------- institute setup & team RPCs
create or replace function public.create_institute(p_name text, p_slug text, p_kind text, p_phone text default '', p_city text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  if (select count(*) from public.institute_members where user_id = auth.uid() and role = 'owner') >= 5 then
    raise exception 'You can own up to 5 institutes.';
  end if;
  insert into public.institutes (name, slug, kind, phone, city, created_by)
  values (trim(p_name), lower(trim(p_slug)), coalesce(nullif(p_kind,''),'school'), coalesce(p_phone,''), coalesce(p_city,''), auth.uid())
  returning id into v_id;
  insert into public.institute_members (institute_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

create or replace function public.accept_invitations() returns int
language plpgsql security definer set search_path = public as $$
declare v_email text; v_count int := 0; r record;
begin
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;
  for r in select * from public.invitations where email = v_email loop
    insert into public.institute_members (institute_id, user_id, role) values (r.institute_id, auth.uid(), r.role) on conflict do nothing;
    delete from public.invitations where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.invite_member(p_inst uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_max int; v_count int; v_email text := lower(trim(p_email));
begin
  if not public.has_role(p_inst, array['owner','admin']) then raise exception 'permission denied'; end if;
  if p_role not in ('admin','accountant','teacher') then raise exception 'Invalid role'; end if;
  if p_role = 'admin' and not public.has_role(p_inst, array['owner']) then raise exception 'Only the owner can add admins.'; end if;
  select max_staff_users into v_max from public.effective_plan(p_inst);
  select (select count(*) from public.institute_members where institute_id = p_inst) + (select count(*) from public.invitations where institute_id = p_inst) into v_count;
  if v_max is not null and v_count >= v_max then raise exception 'plan limit: Your plan allows % staff logins. Upgrade in Plan & Billing.', v_max; end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is not null then
    insert into public.institute_members (institute_id, user_id, role) values (p_inst, v_user, p_role)
      on conflict (institute_id, user_id) do update set role = excluded.role where public.institute_members.role <> 'owner';
    return 'added';
  end if;
  insert into public.invitations (institute_id, email, role) values (p_inst, v_email, p_role)
    on conflict (institute_id, email) do update set role = excluded.role;
  return 'invited';
end $$;

create or replace function public.remove_member(p_inst uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(p_inst, array['owner','admin']) then raise exception 'permission denied'; end if;
  if exists (select 1 from public.institute_members where institute_id = p_inst and user_id = p_user and role = 'owner') then
    raise exception 'The owner cannot be removed.';
  end if;
  delete from public.institute_members where institute_id = p_inst and user_id = p_user;
end $$;

create or replace function public.team_list(p_inst uuid) returns table (user_id uuid, email text, full_name text, role text, pending boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.email, p.full_name, m.role, false from public.institute_members m join public.profiles p on p.id = m.user_id
   where m.institute_id = p_inst and public.is_member(p_inst)
  union all
  select null, i.email, '', i.role, true from public.invitations i where i.institute_id = p_inst and public.is_member(p_inst)
$$;

-- ---------------------------------------------------------------- public info (admission page & portal header)
create or replace function public.get_public_institute(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', i.name, 'slug', i.slug, 'kind', i.kind, 'tagline', i.tagline, 'phone', i.phone, 'email', i.email,
    'address', i.address, 'city', i.city, 'admissions_open', i.admissions_open, 'admission_note', i.admission_note, 'portal_enabled', i.portal_enabled,
    'classes', coalesce((select jsonb_agg(trim(c.name || ' ' || c.section) order by c.sort, c.name) from public.classes c where c.institute_id = i.id and c.active), '[]'))
  from public.institutes i where i.slug = lower(p_slug)
$$;

-- ---------------------------------------------------------------- parent portal
-- Parents log in with the admission number + the 6-digit PIN printed on the fee challan / ID card.
create table public.portal_attempts (
  institute_id uuid not null, admission_no int not null, at timestamptz not null default now()
);
create index on public.portal_attempts (institute_id, admission_no, at);

create or replace function public.portal_view(p_slug text, p_admission_no int, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_inst public.institutes; s public.students; v_res jsonb;
begin
  select * into v_inst from public.institutes where slug = lower(p_slug);
  if v_inst.id is null or not v_inst.portal_enabled then raise exception 'Portal not available'; end if;
  if (select count(*) from public.portal_attempts where institute_id = v_inst.id and admission_no = p_admission_no and at > now() - interval '1 hour') >= 8 then
    raise exception 'Too many wrong tries. Please wait an hour or ask the office for the PIN.';
  end if;
  select * into s from public.students where institute_id = v_inst.id and admission_no = p_admission_no and portal_pin = trim(p_pin);
  if s.id is null then
    insert into public.portal_attempts (institute_id, admission_no) values (v_inst.id, p_admission_no);
    raise exception 'Admission number or PIN is wrong.';
  end if;
  delete from public.portal_attempts where at < now() - interval '1 day';
  select jsonb_build_object(
    'institute', jsonb_build_object('name', v_inst.name, 'phone', v_inst.phone, 'address', v_inst.address, 'currency', v_inst.currency, 'bank_details', v_inst.bank_details, 'kind', v_inst.kind, 'grading', v_inst.grading),
    'student', jsonb_build_object('name', s.name, 'father_name', s.father_name, 'admission_no', s.admission_no, 'roll_no', s.roll_no, 'status', s.status,
       'class', (select trim(c.name || ' ' || c.section) from public.classes c where c.id = s.class_id)),
    'attendance', (select jsonb_build_object(
        'days', count(*), 'present', count(*) filter (where a.status in ('P','L')), 'absent', count(*) filter (where a.status = 'A'), 'leave', count(*) filter (where a.status = 'V'),
        'recent', coalesce(jsonb_agg(jsonb_build_object('day', a.day, 'status', a.status) order by a.day desc) filter (where a.day > current_date - 14), '[]'))
       from public.attendance a where a.student_id = s.id and a.day > current_date - 90),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('invoice_no', f.invoice_no, 'month', f.month, 'items', f.items, 'total', public.fee_total(f), 'paid', f.paid,
        'status', f.status, 'due_date', f.due_date) order by f.created_at desc)
       from (select * from public.fee_invoices where student_id = s.id order by created_at desc limit 12) f), '[]'),
    'results', coalesce((select jsonb_agg(jsonb_build_object('exam', e.name, 'date', e.exam_date,
        'subjects', (select jsonb_agg(jsonb_build_object('subject', sub.name, 'max', sub.max_marks, 'obtained', m.obtained, 'absent', m.absent) order by sub.sort, sub.name)
                     from public.subjects sub left join public.marks m on m.subject_id = sub.id and m.exam_id = e.id and m.student_id = s.id where sub.class_id = e.class_id))
        order by e.exam_date desc nulls last)
       from public.exams e where e.class_id = s.class_id and e.published), '[]'),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('title', n.title, 'body', n.body, 'date', n.created_at) order by n.created_at desc)
       from (select * from public.notices where institute_id = v_inst.id and (class_id is null or class_id = s.class_id) order by created_at desc limit 10) n), '[]')
  ) into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------- dashboard numbers
create or replace function public.dashboard_stats(p_inst uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_member(p_inst) then null else jsonb_build_object(
    'students', (select count(*) from public.students where institute_id = p_inst and status = 'active'),
    'classes', (select count(*) from public.classes where institute_id = p_inst and active),
    'staff', (select count(*) from public.staff where institute_id = p_inst and active),
    'new_admissions', (select count(*) from public.admission_requests where institute_id = p_inst and status = 'new'),
    'today_marked', (select count(*) from public.attendance where institute_id = p_inst and day = current_date),
    'today_present', (select count(*) from public.attendance where institute_id = p_inst and day = current_date and status in ('P','L')),
    'today_absent', (select count(*) from public.attendance where institute_id = p_inst and day = current_date and status = 'A'),
    'month_collected', (select coalesce(sum(amount),0) from public.fee_payments where institute_id = p_inst and paid_on >= date_trunc('month', current_date)),
    'month_expenses', (select coalesce(sum(amount),0) from public.expenses where institute_id = p_inst and spent_on >= date_trunc('month', current_date))
                      + (select coalesce(sum(amount - deduction),0) from public.salary_payments where institute_id = p_inst and paid_on >= date_trunc('month', current_date)),
    'outstanding', (select coalesce(sum(public.fee_total(f) - f.paid),0) from public.fee_invoices f where institute_id = p_inst and status in ('unpaid','partial')),
    'defaulters', (select count(distinct student_id) from public.fee_invoices where institute_id = p_inst and status in ('unpaid','partial') and due_date < current_date),
    'collection_by_month', coalesce((select jsonb_agg(x order by x->>'month') from (
        select jsonb_build_object('month', to_char(date_trunc('month', paid_on), 'YYYY-MM'), 'amount', sum(amount)) x
        from public.fee_payments where institute_id = p_inst and paid_on >= date_trunc('month', current_date) - interval '5 months'
        group by date_trunc('month', paid_on)) t), '[]')
  ) end
$$;

-- ---------------------------------------------------------------- billing (manual payments to the platform owner)
create table public.payment_settings (
  id int primary key default 1 check (id = 1),
  jazzcash text not null default '', easypaisa text not null default '', bank_name text not null default '',
  account_title text not null default '', account_iban text not null default '', instructions text not null default ''
);
insert into public.payment_settings (id) values (1);

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  plan_id text not null references public.plans (id),
  months int not null default 1 check (months between 1 and 12),
  amount numeric(12,2) not null,
  method text not null check (method in ('jazzcash','easypaisa','bank')),
  transaction_id text not null check (char_length(transaction_id) between 4 and 60),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create or replace function public.request_plan(p_inst uuid, p_plan text, p_months int, p_method text, p_tid text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_price numeric; v_id uuid;
begin
  if not public.has_role(p_inst, array['owner','admin']) then raise exception 'permission denied'; end if;
  select price_monthly into v_price from public.plans where id = p_plan;
  if v_price is null or v_price <= 0 then raise exception 'Choose a paid plan'; end if;
  if (select count(*) from public.payment_requests where institute_id = p_inst and status = 'pending') >= 3 then
    raise exception 'You already have payments waiting for approval.';
  end if;
  insert into public.payment_requests (institute_id, plan_id, months, amount, method, transaction_id)
  values (p_inst, p_plan, greatest(1, least(12, p_months)), v_price * greatest(1, least(12, p_months)), p_method, trim(p_tid)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.review_payment(p_id uuid, p_approve boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r public.payment_requests;
begin
  if not public.is_platform_admin() then raise exception 'permission denied'; end if;
  select * into r from public.payment_requests where id = p_id for update;
  if r.id is null or r.status <> 'pending' then raise exception 'Already reviewed'; end if;
  update public.payment_requests set status = case when p_approve then 'approved' else 'rejected' end, note = coalesce(p_note,''), reviewed_at = now() where id = p_id;
  if p_approve then
    update public.institutes set plan_id = r.plan_id,
      plan_expires_at = greatest(coalesce(case when plan_id = r.plan_id then plan_expires_at end, now()), now()) + make_interval(months => r.months)
    where id = r.institute_id;
  end if;
end $$;

create or replace function public.admin_institutes() returns table (id uuid, name text, slug text, kind text, city text, plan_id text, plan_expires_at timestamptz, students bigint, created_at timestamptz, owner_email text)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.slug, i.kind, i.city, i.plan_id, i.plan_expires_at,
         (select count(*) from public.students s where s.institute_id = i.id and s.status = 'active'), i.created_at,
         (select p.email from public.institute_members m join public.profiles p on p.id = m.user_id where m.institute_id = i.id and m.role = 'owner' limit 1)
  from public.institutes i where public.is_platform_admin() order by i.created_at desc
$$;

create or replace function public.admin_set_plan(p_inst uuid, p_plan text, p_months int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'permission denied'; end if;
  update public.institutes set plan_id = p_plan, plan_expires_at = case when p_plan = 'free' then null else now() + make_interval(months => greatest(p_months,1)) end where id = p_inst;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.institutes enable row level security;
alter table public.institute_members enable row level security;
alter table public.invitations enable row level security;
alter table public.platform_admins enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.students enable row level security;
alter table public.admission_requests enable row level security;
alter table public.attendance enable row level security;
alter table public.staff enable row level security;
alter table public.salary_payments enable row level security;
alter table public.fee_invoices enable row level security;
alter table public.fee_payments enable row level security;
alter table public.exams enable row level security;
alter table public.marks enable row level security;
alter table public.expenses enable row level security;
alter table public.notices enable row level security;
alter table public.portal_attempts enable row level security;
alter table public.payment_settings enable row level security;
alter table public.payment_requests enable row level security;

create policy profiles_self on public.profiles for select using (id = auth.uid());
create policy plans_read on public.plans for select using (true);
create policy inst_read on public.institutes for select using (public.is_member(id) or public.is_platform_admin());
create policy inst_update on public.institutes for update using (public.has_role(id, array['owner','admin'])) with check (public.has_role(id, array['owner','admin']));
create policy members_read on public.institute_members for select using (public.is_member(institute_id));
create policy members_role on public.institute_members for update using (public.has_role(institute_id, array['owner'])) with check (role <> 'owner');
create policy invites_read on public.invitations for select using (public.has_role(institute_id, array['owner','admin']));
create policy invites_delete on public.invitations for delete using (public.has_role(institute_id, array['owner','admin']));
create policy padmins_self on public.platform_admins for select using (user_id = auth.uid());

-- read for every member; write by role
create policy r on public.classes for select using (public.is_member(institute_id));
create policy w on public.classes for all using (public.has_role(institute_id, array['owner','admin'])) with check (public.has_role(institute_id, array['owner','admin']));
create policy r on public.subjects for select using (public.is_member(institute_id));
create policy w on public.subjects for all using (public.has_role(institute_id, array['owner','admin'])) with check (public.has_role(institute_id, array['owner','admin']));
create policy r on public.students for select using (public.is_member(institute_id));
create policy w on public.students for all using (public.has_role(institute_id, array['owner','admin'])) with check (public.has_role(institute_id, array['owner','admin']));
create policy r on public.admission_requests for select using (public.has_role(institute_id, array['owner','admin']));
create policy w on public.admission_requests for all using (public.has_role(institute_id, array['owner','admin'])) with check (public.has_role(institute_id, array['owner','admin']));
create policy r on public.attendance for select using (public.is_member(institute_id));
create policy w on public.attendance for all using (public.has_role(institute_id, array['owner','admin','teacher'])) with check (public.has_role(institute_id, array['owner','admin','teacher']));
create policy r on public.staff for select using (public.has_role(institute_id, array['owner','admin','accountant']));
create policy w on public.staff for all using (public.has_role(institute_id, array['owner','admin'])) with check (public.has_role(institute_id, array['owner','admin']));
create policy r on public.salary_payments for select using (public.has_role(institute_id, array['owner','admin','accountant']));
create policy w on public.salary_payments for all using (public.has_role(institute_id, array['owner','admin','accountant'])) with check (public.has_role(institute_id, array['owner','admin','accountant']));
create policy r on public.fee_invoices for select using (public.has_role(institute_id, array['owner','admin','accountant']));
create policy w on public.fee_invoices for all using (public.has_role(institute_id, array['owner','admin','accountant'])) with check (public.has_role(institute_id, array['owner','admin','accountant']));
create policy r on public.fee_payments for select using (public.has_role(institute_id, array['owner','admin','accountant']));
create policy ins on public.fee_payments for insert with check (public.has_role(institute_id, array['owner','admin','accountant']));
create policy del on public.fee_payments for delete using (public.has_role(institute_id, array['owner','admin']));
create policy r on public.exams for select using (public.is_member(institute_id));
create policy w on public.exams for all using (public.has_role(institute_id, array['owner','admin','teacher'])) with check (public.has_role(institute_id, array['owner','admin','teacher']));
create policy r on public.marks for select using (public.is_member(institute_id));
create policy w on public.marks for all using (public.has_role(institute_id, array['owner','admin','teacher'])) with check (public.has_role(institute_id, array['owner','admin','teacher']));
create policy r on public.expenses for select using (public.has_role(institute_id, array['owner','admin','accountant']));
create policy w on public.expenses for all using (public.has_role(institute_id, array['owner','admin','accountant'])) with check (public.has_role(institute_id, array['owner','admin','accountant']));
create policy r on public.notices for select using (public.is_member(institute_id));
create policy w on public.notices for all using (public.has_role(institute_id, array['owner','admin'])) with check (public.has_role(institute_id, array['owner','admin']));
create policy r on public.payment_settings for select using (auth.uid() is not null);
create policy w on public.payment_settings for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy r on public.payment_requests for select using (public.has_role(institute_id, array['owner','admin']) or public.is_platform_admin());

-- Table access for the API roles (works whether or not the project auto-grants new tables). RLS above still decides which rows.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant select on public.plans to anon;

-- Column guard: members may not change their own plan or counters through a normal update.
revoke update on public.institutes from authenticated;
grant update (name, slug, kind, tagline, phone, email, address, city, principal_name, session_label, currency, fee_due_day, late_fee, bank_details,
              admissions_open, admission_note, portal_enabled, grading) on public.institutes to authenticated;
-- Payment rows are never edited directly (paid/status come from the trigger).
revoke update on public.fee_payments from authenticated;
revoke update on public.fee_invoices from authenticated;
grant update (month, items, discount, fine, status, due_date, note) on public.fee_invoices to authenticated;

-- Public (not signed in) callers only get these functions.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.submit_admission(text, jsonb) to anon, authenticated;
grant execute on function public.get_public_institute(text) to anon, authenticated;
grant execute on function public.portal_view(text, int, text) to anon, authenticated;
