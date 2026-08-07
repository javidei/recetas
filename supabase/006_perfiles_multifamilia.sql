-- Recetario de Javi · perfiles, nombres de usuario y familias múltiples
-- Ejecutar una sola vez después de 005_permisos_recetas.sql.
-- No borra recetas, cuentas ni familias existentes.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- PERFIL DEL RECETARIO
-- ---------------------------------------------------------------------------
alter table public.recetario_accounts add column if not exists username text;
alter table public.recetario_accounts add column if not exists username_normalized text;
alter table public.recetario_accounts add column if not exists avatar_path text;

alter table public.recetario_accounts
  drop constraint if exists recetario_accounts_username_format;
alter table public.recetario_accounts
  add constraint recetario_accounts_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,24}$');

create unique index if not exists recetario_accounts_username_normalized_uidx
  on public.recetario_accounts(username_normalized)
  where username_normalized is not null;

create or replace function public.normalize_recetario_username()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.username is null or trim(new.username) = '' then
    new.username := null;
    new.username_normalized := null;
  else
    new.username := lower(trim(new.username));
    new.username_normalized := new.username;
  end if;
  return new;
end;
$$;

drop trigger if exists recetario_accounts_normalize_username on public.recetario_accounts;
create trigger recetario_accounts_normalize_username
before insert or update of username on public.recetario_accounts
for each row execute function public.normalize_recetario_username();

update public.recetario_accounts
set username = lower(trim(username)),
    username_normalized = lower(trim(username))
where username is not null and trim(username) <> '';

-- Los registros nuevos pueden traer ya el nombre de usuario desde el formulario.
create or replace function public.handle_new_recetario_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role text;
  requested_username text;
begin
  if coalesce(new.raw_user_meta_data ->> 'app', '') <> 'recetario' then
    return new;
  end if;

  if (select count(*) from public.recetario_accounts where is_active) >= 10 then
    raise exception 'El recetario ya tiene el máximo de 10 cuentas activas.';
  end if;

  chosen_role := case
    when not exists (select 1 from public.recetario_accounts where role = 'admin') then 'admin'
    else 'member'
  end;

  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  if requested_username = '' then requested_username := null; end if;
  if requested_username is not null and requested_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'El nombre de usuario no es válido.';
  end if;

  insert into public.recetario_accounts (id, display_name, email, role, username)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1),
      'Familiar'
    ),
    new.email,
    chosen_role,
    requested_username
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_recetario_account on auth.users;
create trigger on_auth_user_created_recetario_account
after insert on auth.users
for each row execute function public.handle_new_recetario_account();

-- ---------------------------------------------------------------------------
-- FAMILIAS MÚLTIPLES
-- ---------------------------------------------------------------------------
-- La PK (family_id, user_id) ya impide que alguien se duplique dentro del mismo
-- grupo. Eliminamos únicamente la restricción que impedía pertenecer a varios.
alter table public.recipe_family_members
  drop constraint if exists recipe_family_members_user_id_key;

create or replace function public.create_recipe_family(family_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_family_id uuid;
begin
  perform public.ensure_recetario_account(null);

  if not public.is_recetario_active() then
    raise exception 'Tu cuenta está desactivada.';
  end if;

  if char_length(trim(family_name)) < 2 then
    raise exception 'El nombre de la familia es demasiado corto.';
  end if;

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
  perform public.ensure_recetario_account(null);

  if not public.is_recetario_active() then
    raise exception 'Tu cuenta está desactivada.';
  end if;

  select id into target_family_id
  from public.recipe_families
  where upper(invite_code) = upper(trim(family_code));

  if target_family_id is null then
    raise exception 'El código familiar no es válido.';
  end if;

  if exists (
    select 1 from public.recipe_family_members
    where family_id = target_family_id and user_id = auth.uid()
  ) then
    raise exception 'Ya perteneces a esta familia.';
  end if;

  insert into public.recipe_family_members (family_id, user_id, role)
  values (target_family_id, auth.uid(), 'member');

  return target_family_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- ADMINISTRACIÓN
-- ---------------------------------------------------------------------------
drop function if exists public.admin_list_recetario_accounts();
create function public.admin_list_recetario_accounts()
returns table (
  id uuid,
  display_name text,
  username text,
  email text,
  avatar_path text,
  role text,
  is_active boolean,
  created_at timestamptz,
  families jsonb,
  recipe_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_recetario_admin() then
    raise exception 'No tienes permisos de administrador.';
  end if;

  return query
  select
    account.id,
    account.display_name,
    account.username,
    account.email,
    account.avatar_path,
    account.role,
    account.is_active,
    account.created_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', family.id,
          'name', family.name,
          'member_role', membership.role
        ) order by family.name
      )
      from public.recipe_family_members membership
      join public.recipe_families family on family.id = membership.family_id
      where membership.user_id = account.id
    ), '[]'::jsonb) as families,
    (select count(*)::bigint from public.recipes recipe where recipe.owner_id = account.id) as recipe_count
  from public.recetario_accounts account
  order by case when account.role = 'admin' then 0 else 1 end,
           account.created_at asc;
end;
$$;

create or replace function public.admin_list_recipe_families()
returns table (
  id uuid,
  name text,
  invite_code text,
  owner_id uuid,
  owner_name text,
  member_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_recetario_admin() then
    raise exception 'No tienes permisos de administrador.';
  end if;

  return query
  select
    family.id,
    family.name,
    family.invite_code,
    family.owner_id,
    coalesce(owner_account.display_name, owner_account.username, 'Administrador') as owner_name,
    count(member.user_id)::bigint as member_count
  from public.recipe_families family
  left join public.recetario_accounts owner_account on owner_account.id = family.owner_id
  left join public.recipe_family_members member on member.family_id = family.id
  group by family.id, family.name, family.invite_code, family.owner_id,
           owner_account.display_name, owner_account.username
  order by family.name;
end;
$$;

create or replace function public.admin_rename_recipe_family(target_family_id uuid, new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_recetario_admin() then
    raise exception 'No tienes permisos de administrador.';
  end if;

  if char_length(trim(new_name)) < 2 or char_length(trim(new_name)) > 70 then
    raise exception 'El nombre debe tener entre 2 y 70 caracteres.';
  end if;

  update public.recipe_families
  set name = trim(new_name), updated_at = now()
  where id = target_family_id;

  if not found then
    raise exception 'No se encontró la familia.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- AVATARES
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-avatars', 'recipe-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Recetario avatars readable" on storage.objects;
drop policy if exists "Recetario avatar owners upload" on storage.objects;
drop policy if exists "Recetario avatar owners update" on storage.objects;
drop policy if exists "Recetario avatar owners delete" on storage.objects;

create policy "Recetario avatars readable"
on storage.objects for select to authenticated
using (
  bucket_id = 'recipe-avatars'
  and public.is_recetario_active()
);

create policy "Recetario avatar owners upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recipe-avatars'
  and public.is_recetario_active()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Recetario avatar owners update"
on storage.objects for update to authenticated
using (
  bucket_id = 'recipe-avatars'
  and public.is_recetario_active()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'recipe-avatars'
  and public.is_recetario_active()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Recetario avatar owners delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'recipe-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- El usuario solo puede modificar columnas inocuas de su propio perfil.
revoke update on public.recetario_accounts from authenticated;
grant update(display_name, username, avatar_path) on public.recetario_accounts to authenticated;
grant select on public.recetario_accounts to authenticated;

grant execute on function public.create_recipe_family(text) to authenticated;
grant execute on function public.join_recipe_family(text) to authenticated;
grant execute on function public.admin_list_recetario_accounts() to authenticated;
grant execute on function public.admin_list_recipe_families() to authenticated;
grant execute on function public.admin_rename_recipe_family(uuid, text) to authenticated;

notify pgrst, 'reload schema';
