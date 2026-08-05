-- VisionDS — accounts, run history, extension sync, explainer gating.
--
-- Authorization lives here, not in an API tier: every table has Row-Level
-- Security so a client (web or extension) can talk to Postgres directly and
-- only ever touch its own rows. Anonymous visitors match no policy and see
-- nothing, which keeps the app fully usable signed-out.
--
-- Apply with:  supabase db push   (or paste into the Supabase SQL editor)

-- ---------------------------------------------------------------------------
-- profiles — per-user metadata + explainer usage gating
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  username      text unique,
  explain_count integer not null default 0,
  explain_limit integer,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner reads" on public.profiles
  for select using (auth.uid() = user_id);

create policy "profiles: owner updates" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-provision a profile row the moment a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'username'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- runs — saved dry-run history (inputs to reproduce a trace, never the trace)
-- ---------------------------------------------------------------------------
create table if not exists public.runs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  language   text not null,
  code       text not null,
  testcases  jsonb not null default '[]'::jsonb,
  problem    jsonb,
  verdict    text,
  created_at timestamptz not null default now()
);

create index if not exists runs_user_created_idx
  on public.runs (user_id, created_at desc);

alter table public.runs enable row level security;

create policy "runs: owner reads" on public.runs
  for select using (auth.uid() = user_id);

create policy "runs: owner inserts" on public.runs
  for insert with check (auth.uid() = user_id);

create policy "runs: owner deletes" on public.runs
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- captures — extension pushes a LeetCode grab, web app pulls it
-- ---------------------------------------------------------------------------
create table if not exists public.captures (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  language    text not null,
  code        text not null,
  testcases   jsonb not null default '[]'::jsonb,
  problem     jsonb,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists captures_user_unconsumed_idx
  on public.captures (user_id, created_at desc)
  where consumed_at is null;

alter table public.captures enable row level security;

create policy "captures: owner reads" on public.captures
  for select using (auth.uid() = user_id);

create policy "captures: owner inserts" on public.captures
  for insert with check (auth.uid() = user_id);

create policy "captures: owner updates" on public.captures
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "captures: owner deletes" on public.captures
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- increment_explain_count — race-free usage bump, enforces the per-user cap
-- ---------------------------------------------------------------------------
create or replace function public.increment_explain_count()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  new_count integer;
  cap       integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select explain_limit into cap from public.profiles where user_id = auth.uid();

  update public.profiles
     set explain_count = explain_count + 1
   where user_id = auth.uid()
     and (explain_limit is null or explain_count < explain_limit)
  returning explain_count into new_count;

  if new_count is null then
    raise exception 'explain limit reached';
  end if;

  return new_count;
end;
$$;
