-- Last Done: database schema and security rules.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a fresh project.

-- ── Tables ──────────────────────────────────────────────────────────────

-- A household is a shared list. Everyone gets their own household on first
-- sign-in; roommates join it with the invite code.
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 8)),
  created_by  uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  display_name text not null default 'Someone',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.chores (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  interval_days numeric not null check (interval_days > 0 and interval_days <= 3650),
  created_at    timestamptz not null default now(),
  unique (id, household_id)
);

create table public.completions (
  id           uuid primary key default gen_random_uuid(),
  chore_id     uuid not null,
  household_id uuid not null,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  done_at      timestamptz not null default now(),
  -- the composite key stops a completion pointing at another household's chore
  foreign key (chore_id, household_id) references public.chores (id, household_id) on delete cascade
);

create index on public.household_members (user_id);
create index on public.chores (household_id);
create index on public.completions (household_id, done_at desc);
create index on public.completions (chore_id, done_at desc);

-- ── Helpers ─────────────────────────────────────────────────────────────

-- True when the signed-in user belongs to the household. SECURITY DEFINER so
-- the policies below can call it without recursing into their own checks.
create function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members where household_id = hid and user_id = auth.uid()
  );
$$;

create function public.my_display_name() returns text
language sql stable as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    split_part(auth.jwt() ->> 'email', '@', 1),
    'Someone'
  );
$$;

-- ── Row-level security ──────────────────────────────────────────────────
-- With RLS on, every query only sees rows these policies allow, whatever the
-- website's code asks for.

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.chores            enable row level security;
alter table public.completions       enable row level security;

create policy "members read household"   on public.households for select using (public.is_member(id));
create policy "members rename household" on public.households for update using (public.is_member(id));
create policy "creator deletes household" on public.households for delete using (created_by = auth.uid());
-- households are created through create_household() below, not direct inserts

create policy "members see each other" on public.household_members for select using (public.is_member(household_id));
create policy "rename yourself"        on public.household_members for update using (user_id = auth.uid());
create policy "leave household"        on public.household_members for delete using (user_id = auth.uid());
-- joining goes through join_household() below

create policy "members read chores"   on public.chores for select using (public.is_member(household_id));
create policy "members add chores"    on public.chores for insert with check (public.is_member(household_id));
create policy "members edit chores"   on public.chores for update using (public.is_member(household_id));
create policy "members delete chores" on public.chores for delete using (public.is_member(household_id));

create policy "members read completions" on public.completions for select using (public.is_member(household_id));
create policy "members log completions"  on public.completions for insert
  with check (public.is_member(household_id) and user_id = auth.uid());
create policy "undo your own completions" on public.completions for delete using (user_id = auth.uid());

-- Updates may only touch the columns the app edits: a household's name and your
-- own display name. Without this, "rename yourself" would also let you rewrite
-- household_id on your membership row and move yourself into another list.
revoke update on public.households, public.household_members from anon, authenticated;
grant update (name) on public.households to authenticated;
grant update (display_name) on public.household_members to authenticated;

-- ── Functions the app calls ─────────────────────────────────────────────

create function public.create_household(p_name text) returns public.households
language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into households (name, created_by) values (p_name, auth.uid()) returning * into h;
  insert into household_members (household_id, user_id, display_name)
    values (h.id, auth.uid(), my_display_name());
  return h;
end;
$$;

create function public.join_household(p_code text) returns public.households
language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into h from households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'No household has that code'; end if;
  insert into household_members (household_id, user_id, display_name)
    values (h.id, auth.uid(), my_display_name())
    on conflict do nothing;
  return h;
end;
$$;

-- New random invite code, e.g. after a roommate moves out.
create function public.reset_invite_code(hid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(md5(random()::text), 1, 8));
begin
  if not is_member(hid) then raise exception 'not a member'; end if;
  update households set invite_code = c where id = hid;
  return c;
end;
$$;

revoke execute on function public.create_household(text)  from public, anon;
revoke execute on function public.join_household(text)    from public, anon;
revoke execute on function public.reset_invite_code(uuid) from public, anon;
grant  execute on function public.create_household(text)  to authenticated;
grant  execute on function public.join_household(text)    to authenticated;
grant  execute on function public.reset_invite_code(uuid) to authenticated;

-- ── Live updates ────────────────────────────────────────────────────────
-- Lets a roommate's phone update the moment someone taps Done.
alter publication supabase_realtime add table public.chores, public.completions;
