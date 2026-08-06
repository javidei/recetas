-- Recetario de Javi · reparación completa de perfiles y familias
-- Ejecutar después de 002_familias.sql.
-- Esta migración evita colisiones con la tabla genérica public.profiles
-- utilizada por otros proyectos del mismo Supabase y completa todos los permisos.

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

update public.recipes
set visibility = case when is_public then 'public' else 'private' end
where visibility is null;

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

create or replace function public.can_read_recipe_image(target_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recipes recipe
    where recipe.cover_image_path = target_path
      and (
        recipe.owner_id = auth.uid()
        or recipe.visibility = 'public'
        or (
          recipe.visibility = 'family'
          and public.is_recipe_family_member(recipe.family_id)
        )
      )
  );
$$;

alter table public.recipe_profiles enable row level security;
alter table public.recipe_families enable row level security;
alter table public.recipe_family_members enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;

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

drop policy if exists "Public recipes are readable" on public.recipes;
drop policy if exists "Owners can create recipes" on public.recipes;
drop policy if exists "Owners can update recipes" on public.recipes;
drop policy if exists "Owners can delete recipes" on public.recipes;
drop policy if exists "Accessible recipes are readable" on public.recipes;
drop policy if exists "Owners create accessible recipes" on public.recipes;
drop policy if exists "Owners update their recipes" on public.recipes;
drop policy if exists "Owners delete their recipes" on public.recipes;

create policy "Accessible recipes are readable"
on public.recipes for select
using (
  owner_id = auth.uid()
  or visibility = 'public'
  or (
    visibility = 'family'
    and public.is_recipe_family_member(family_id)
  )
);

create policy "Owners create accessible recipes"
on public.recipes for insert to authenticated
with check (
  owner_id = auth.uid()
  and (
    visibility in ('private', 'public')
    or (
      visibility = 'family'
      and public.is_recipe_family_member(family_id)
    )
  )
);

create policy "Owners update their recipes"
on public.recipes for update to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and (
    visibility in ('private', 'public')
    or (
      visibility = 'family'
      and public.is_recipe_family_member(family_id)
    )
  )
);

create policy "Owners delete their recipes"
on public.recipes for delete to authenticated
using (owner_id = auth.uid());

drop policy if exists "Ingredients follow recipe access" on public.recipe_ingredients;
drop policy if exists "Owners manage ingredients" on public.recipe_ingredients;
drop policy if exists "Accessible ingredients are readable" on public.recipe_ingredients;
drop policy if exists "Owners manage recipe ingredients" on public.recipe_ingredients;

create policy "Accessible ingredients are readable"
on public.recipe_ingredients for select
using (exists (
  select 1
  from public.recipes recipe
  where recipe.id = recipe_id
    and (
      recipe.owner_id = auth.uid()
      or recipe.visibility = 'public'
      or (
        recipe.visibility = 'family'
        and public.is_recipe_family_member(recipe.family_id)
      )
    )
));

create policy "Owners manage recipe ingredients"
on public.recipe_ingredients for all to authenticated
using (exists (
  select 1 from public.recipes recipe
  where recipe.id = recipe_id and recipe.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.recipes recipe
  where recipe.id = recipe_id and recipe.owner_id = auth.uid()
));

drop policy if exists "Steps follow recipe access" on public.recipe_steps;
drop policy if exists "Owners manage steps" on public.recipe_steps;
drop policy if exists "Accessible steps are readable" on public.recipe_steps;
drop policy if exists "Owners manage recipe steps" on public.recipe_steps;

create policy "Accessible steps are readable"
on public.recipe_steps for select
using (exists (
  select 1
  from public.recipes recipe
  where recipe.id = recipe_id
    and (
      recipe.owner_id = auth.uid()
      or recipe.visibility = 'public'
      or (
        recipe.visibility = 'family'
        and public.is_recipe_family_member(recipe.family_id)
      )
    )
));

create policy "Owners manage recipe steps"
on public.recipe_steps for all to authenticated
using (exists (
  select 1 from public.recipes recipe
  where recipe.id = recipe_id and recipe.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.recipes recipe
  where recipe.id = recipe_id and recipe.owner_id = auth.uid()
));

drop policy if exists "Users can read their recipe images" on storage.objects;
drop policy if exists "Users can upload their recipe images" on storage.objects;
drop policy if exists "Users can update their recipe images" on storage.objects;
drop policy if exists "Users can delete their recipe images" on storage.objects;
drop policy if exists "Recipe image readers" on storage.objects;
drop policy if exists "Recipe image owners upload" on storage.objects;
drop policy if exists "Recipe image owners update" on storage.objects;
drop policy if exists "Recipe image owners delete" on storage.objects;

create policy "Recipe image readers"
on storage.objects for select
using (
  bucket_id = 'recipe-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.can_read_recipe_image(name)
  )
);

create policy "Recipe image owners upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Recipe image owners update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Recipe image owners delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recipe-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

grant select, insert, update on public.recipe_profiles to authenticated;
grant select, insert, update, delete on public.recipe_families to authenticated;
grant select, insert, update, delete on public.recipe_family_members to authenticated;
grant execute on function public.is_recipe_family_member(uuid) to authenticated;
grant execute on function public.is_recipe_family_owner(uuid) to authenticated;
grant execute on function public.create_recipe_family(text) to authenticated;
grant execute on function public.join_recipe_family(text) to authenticated;
grant execute on function public.can_read_recipe_image(text) to authenticated;

-- Fuerza a PostgREST a refrescar inmediatamente tablas, columnas y funciones nuevas.
notify pgrst, 'reload schema';
