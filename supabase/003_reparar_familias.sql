-- Recetario de Javi · reparación de perfiles y familias
-- Ejecutar después de 002_familias.sql.
-- Esta migración evita colisiones con la tabla genérica public.profiles
-- utilizada por otros proyectos del mismo Supabase.

create extension if not exists pgcrypto;

create table if not exists public.recipe_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Familiar' check (char_length(display_name) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.recipe_profiles (id, display_name)
select
  id,
  coalesce(
    nullif(trim(raw_user_meta_data ->> 'display_name'), ''),
    split_part(email, '@', 1),
    'Familiar'
  )
from auth.users
on conflict (id) do nothing;

create table if not exists public.recipe_families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 70),
  owner_id uuid not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_family_members (
  family_id uuid not null references public.recipe_families(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id),
  unique (user_id)
);

-- Asegura que los perfiles necesarios existan antes de cambiar las claves externas.
insert into public.recipe_profiles (id, display_name)
select distinct family.owner_id, 'Familiar'
from public.recipe_families family
where family.owner_id is not null
on conflict (id) do nothing;

insert into public.recipe_profiles (id, display_name)
select distinct member.user_id, 'Familiar'
from public.recipe_family_members member
where member.user_id is not null
on conflict (id) do nothing;

alter table public.recipe_families
  drop constraint if exists recipe_families_owner_id_fkey;
alter table public.recipe_families
  add constraint recipe_families_owner_id_fkey
  foreign key (owner_id) references public.recipe_profiles(id) on delete cascade;

alter table public.recipe_family_members
  drop constraint if exists recipe_family_members_user_id_fkey;
alter table public.recipe_family_members
  add constraint recipe_family_members_user_id_fkey
  foreign key (user_id) references public.recipe_profiles(id) on delete cascade;

alter table public.recipes
  add column if not exists family_id uuid references public.recipe_families(id) on delete set null;
alter table public.recipes
  add column if not exists visibility text not null default 'private';

alter table public.recipes drop constraint if exists recipes_visibility_check;
alter table public.recipes add constraint recipes_visibility_check
  check (visibility in ('private', 'family', 'public'));

alter table public.recipes drop constraint if exists recipes_family_visibility_check;
alter table public.recipes add constraint recipes_family_visibility_check
  check (visibility <> 'family' or family_id is not null);

create index if not exists recipes_family_idx on public.recipes(family_id, visibility);
create index if not exists recipe_family_members_user_idx on public.recipe_family_members(user_id);

create or replace function public.handle_new_recipe_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.recipe_profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1),
      'Familiar'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_recetario on auth.users;
create trigger on_auth_user_created_recetario
after insert on auth.users
for each row execute function public.handle_new_recipe_user();

create or replace function public.is_recipe_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_family_id is not null and exists (
    select 1
    from public.recipe_family_members member
    where member.family_id = target_family_id
      and member.user_id = auth.uid()
  );
$$;

create or replace function public.is_recipe_family_owner(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_family_id is not null and exists (
    select 1
    from public.recipe_families family
    where family.id = target_family_id
      and family.owner_id = auth.uid()
  );
$$;

create or replace function public.create_recipe_family(family_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if exists (
    select 1 from public.recipe_family_members
    where user_id = auth.uid()
  ) then
    raise exception 'Ya perteneces a una familia.';
  end if;

  insert into public.recipe_profiles (id, display_name)
  values (auth.uid(), 'Familiar')
  on conflict (id) do nothing;

  insert into public.recipe_families (name, owner_id)
  values (trim(family_name), auth.uid())
  returning id into new_family_id;

  insert into public.recipe_family_members (family_id, user_id, role)
  values (new_family_id, auth.uid(), 'owner');

  return new_family_id;
end;
$$;

create or replace function public.join_recipe_family(family_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if exists (
    select 1 from public.recipe_family_members
    where user_id = auth.uid()
  ) then
    raise exception 'Ya perteneces a una familia.';
  end if;

  select id into target_family_id
  from public.recipe_families
  where upper(invite_code) = upper(trim(family_code));

  if target_family_id is null then
    raise exception 'El código familiar no es válido.';
  end if;

  insert into public.recipe_profiles (id, display_name)
  values (auth.uid(), 'Familiar')
  on conflict (id) do nothing;

  insert into public.recipe_family_members (family_id, user_id, role)
  values (target_family_id, auth.uid(), 'member');

  return target_family_id;
end;
$$;

alter table public.recipe_profiles enable row level security;
alter table public.recipe_families enable row level security;
alter table public.recipe_family_members enable row level security;

drop policy if exists "Authenticated users read recipe profiles" on public.recipe_profiles;
create policy "Authenticated users read recipe profiles"
on public.recipe_profiles for select to authenticated
using (true);

drop policy if exists "Users update their recipe profile" on public.recipe_profiles;
create policy "Users update their recipe profile"
on public.recipe_profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Users create their recipe profile" on public.recipe_profiles;
create policy "Users create their recipe profile"
on public.recipe_profiles for insert to authenticated
with check (id = auth.uid());

drop policy if exists "Members read their recipe family" on public.recipe_families;
create policy "Members read their recipe family"
on public.recipe_families for select to authenticated
using (public.is_recipe_family_member(id));

drop policy if exists "Owners update their recipe family" on public.recipe_families;
create policy "Owners update their recipe family"
on public.recipe_families for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Members read recipe family members" on public.recipe_family_members;
create policy "Members read recipe family members"
on public.recipe_family_members for select to authenticated
using (public.is_recipe_family_member(family_id));

drop policy if exists "Owners manage recipe family members" on public.recipe_family_members;
create policy "Owners manage recipe family members"
on public.recipe_family_members for delete to authenticated
using (public.is_recipe_family_owner(family_id) and role <> 'owner');

grant select, insert, update on public.recipe_profiles to authenticated;
grant select, insert, update, delete on public.recipe_families to authenticated;
grant select, insert, update, delete on public.recipe_family_members to authenticated;
grant execute on function public.is_recipe_family_member(uuid) to authenticated;
grant execute on function public.is_recipe_family_owner(uuid) to authenticated;
grant execute on function public.create_recipe_family(text) to authenticated;
grant execute on function public.join_recipe_family(text) to authenticated;

-- Fuerza a PostgREST a refrescar inmediatamente tablas, columnas y funciones nuevas.
notify pgrst, 'reload schema';
