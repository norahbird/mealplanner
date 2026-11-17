-- Meal Planner schema.
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query). It is safe to run
-- more than once, and it can live in the same Supabase project as other apps: every table and
-- function it creates starts with meal_, and it changes nothing else.
--
-- Data belongs to a household rather than to one account, so a partner can be added later
-- without moving anything. Row Level Security means an account can only see or change data
-- in households it is a member of. The app creates your household the first time you sign in.

create table if not exists meal_households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Home',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists meal_household_members (
  household_id uuid not null references meal_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Ingredients double as the "on hand" list: status is null when an ingredient isn't tracked.
create table if not exists meal_ingredients (
  id uuid primary key,
  household_id uuid not null references meal_households(id) on delete cascade,
  name text not null,
  section text not null default 'Other',
  location text not null default 'pantry' check (location in ('fridge', 'freezer', 'pantry')),
  shelf_life_days integer,
  staple boolean not null default false,
  status text check (status in ('have', 'low', 'out')),
  use_by date,
  updated_at timestamptz not null default now(),
  unique (household_id, name)
);

create table if not exists meal_recipes (
  id uuid primary key,
  household_id uuid not null references meal_households(id) on delete cascade,
  title text not null,
  servings integer not null default 2,
  ingredients jsonb not null default '[]'::jsonb,
  steps text not null default '',
  tags text[] not null default '{}',
  source_url text,
  notes text not null default '',
  rating smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists meal_plan_entries (
  id uuid primary key,
  household_id uuid not null references meal_households(id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('lunch', 'dinner')),
  kind text not null check (kind in ('recipe', 'leftovers', 'note')),
  recipe_id uuid references meal_recipes(id) on delete set null,
  leftover_of uuid references meal_plan_entries(id) on delete cascade,
  title text not null default '',
  servings integer not null default 1,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists meal_grocery_items (
  id uuid primary key,
  household_id uuid not null references meal_households(id) on delete cascade,
  ingredient_id uuid references meal_ingredients(id) on delete cascade,
  name text not null default '',
  amount text not null default '',
  section text not null default 'Other',
  forced boolean not null default false,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meal_household_members_user_idx on meal_household_members (user_id);
create index if not exists meal_ingredients_household_idx on meal_ingredients (household_id);
create index if not exists meal_recipes_household_idx on meal_recipes (household_id);
create index if not exists meal_plan_entries_household_idx on meal_plan_entries (household_id, date);
create index if not exists meal_grocery_items_household_idx on meal_grocery_items (household_id);

-- ---- Access rules -------------------------------------------------------------------------

create or replace function meal_is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from meal_household_members where household_id = hid and user_id = auth.uid()
  );
$$;

alter table meal_households enable row level security;
alter table meal_household_members enable row level security;
alter table meal_ingredients enable row level security;
alter table meal_recipes enable row level security;
alter table meal_plan_entries enable row level security;
alter table meal_grocery_items enable row level security;

drop policy if exists "meal_households_members" on meal_households;
create policy "meal_households_members" on meal_households
  for select using (meal_is_member(id));
drop policy if exists "meal_households_members_update" on meal_households;
create policy "meal_households_members_update" on meal_households
  for update using (meal_is_member(id)) with check (meal_is_member(id));

drop policy if exists "meal_household_members_read" on meal_household_members;
create policy "meal_household_members_read" on meal_household_members
  for select using (meal_is_member(household_id));

drop policy if exists "meal_ingredients_members" on meal_ingredients;
create policy "meal_ingredients_members" on meal_ingredients
  for all using (meal_is_member(household_id)) with check (meal_is_member(household_id));

drop policy if exists "meal_recipes_members" on meal_recipes;
create policy "meal_recipes_members" on meal_recipes
  for all using (meal_is_member(household_id)) with check (meal_is_member(household_id));

drop policy if exists "meal_plan_entries_members" on meal_plan_entries;
create policy "meal_plan_entries_members" on meal_plan_entries
  for all using (meal_is_member(household_id)) with check (meal_is_member(household_id));

drop policy if exists "meal_grocery_items_members" on meal_grocery_items;
create policy "meal_grocery_items_members" on meal_grocery_items
  for all using (meal_is_member(household_id)) with check (meal_is_member(household_id));

grant select, update on meal_households to authenticated;
grant select on meal_household_members to authenticated;
grant select, insert, update, delete on meal_ingredients, meal_recipes, meal_plan_entries, meal_grocery_items
  to authenticated;

-- Returns the signed-in account's household, creating one (with the account as owner) the
-- first time. Households are only ever created here, never directly by the app.
create or replace function meal_my_household() returns meal_households
language plpgsql security definer set search_path = public as $$
declare
  h meal_households;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  -- Two devices signing in for the first time at once still get one household.
  perform pg_advisory_xact_lock(hashtext('meal_my_household:' || auth.uid()::text));

  select hh.* into h
  from meal_households hh
  join meal_household_members m on m.household_id = hh.id
  where m.user_id = auth.uid()
  order by m.created_at
  limit 1;

  if not found then
    insert into meal_households default values returning * into h;
    insert into meal_household_members (household_id, user_id, role) values (h.id, auth.uid(), 'owner');
  end if;
  return h;
end;
$$;

revoke execute on function meal_my_household() from public, anon;
grant execute on function meal_my_household() to authenticated;
revoke execute on function meal_is_member(uuid) from public, anon;
grant execute on function meal_is_member(uuid) to authenticated;
