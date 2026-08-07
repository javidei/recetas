-- Recetario de Javi · límites familiares, borrado de grupos y comentarios
-- Ejecutar una sola vez después de 006_perfiles_multifamilia.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- REGLA: máximo 3 familias por usuario, salvo administrador general.
-- ---------------------------------------------------------------------------
create or replace function public.recetario_family_limit_reached(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_recetario_admin() and target_user_id = auth.uid() then false
    else (select count(*) from public.recipe_family_members where user_id = target_user_id) >= 3
  end;
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
  perform public.ensure_recetario_account(null);

  if not public.is_recetario_active() then
    raise exception 'Tu cuenta está desactivada.';
  end if;

  if not public.is_recetario_admin() and public.recetario_family_limit_reached(auth.uid()) then
    raise exception 'Solo puedes pertenecer a un máximo de 3 familias.';
  end if;

  if char_length(trim(family_name)) < 2 or char_length(trim(family_name)) > 70 then
    raise exception 'El nombre debe tener entre 2 y 70 caracteres.';
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

  if not public.is_recetario_admin() and public.recetario_family_limit_reached(auth.uid()) then
    raise exception 'Solo puedes pertenecer a un máximo de 3 familias.';
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

-- El creador puede borrar su familia. El admin general puede borrar cualquiera.
create or replace function public.delete_recipe_family(target_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner uuid;
begin
  select owner_id into target_owner
  from public.recipe_families
  where id = target_family_id;

  if target_owner is null then
    raise exception 'No se encontró la familia.';
  end if;

  if not public.is_recetario_admin() and target_owner <> auth.uid() then
    raise exception 'Solo quien creó la familia puede eliminarla.';
  end if;

  -- Evita dejar recetas con visibility='family' y family_id nulo.
  update public.recipes
  set visibility = 'private', family_id = null, is_public = false
  where family_id = target_family_id;

  delete from public.recipe_families where id = target_family_id;
end;
$$;

grant execute on function public.recetario_family_limit_reached(uuid) to authenticated;
grant execute on function public.delete_recipe_family(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- COMENTARIOS ANIDADOS EN RECETAS
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_comments (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  author_id uuid not null references public.recetario_accounts(id) on delete cascade,
  parent_id uuid references public.recipe_comments(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipe_comments_recipe_idx on public.recipe_comments(recipe_id, created_at);
create index if not exists recipe_comments_parent_idx on public.recipe_comments(parent_id, created_at);
create index if not exists recipe_comments_author_idx on public.recipe_comments(author_id);

create or replace function public.set_recipe_comment_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recipe_comments_set_updated_at on public.recipe_comments;
create trigger recipe_comments_set_updated_at
before update of body on public.recipe_comments
for each row execute function public.set_recipe_comment_updated_at();

create or replace function public.can_access_recipe(target_recipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recipes recipe
    where recipe.id = target_recipe_id
      and (
        public.is_recetario_admin()
        or (
          public.is_recetario_active()
          and (
            recipe.owner_id = auth.uid()
            or recipe.visibility = 'public'
            or (
              recipe.visibility = 'family'
              and public.is_recipe_family_member(recipe.family_id)
            )
          )
        )
      )
  );
$$;

create or replace function public.validate_recipe_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_recipe_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select recipe_id into parent_recipe_id
  from public.recipe_comments
  where id = new.parent_id;

  if parent_recipe_id is null or parent_recipe_id <> new.recipe_id then
    raise exception 'El comentario al que respondes no pertenece a esta receta.';
  end if;

  return new;
end;
$$;

drop trigger if exists recipe_comments_validate_parent on public.recipe_comments;
create trigger recipe_comments_validate_parent
before insert on public.recipe_comments
for each row execute function public.validate_recipe_comment_parent();

alter table public.recipe_comments enable row level security;

drop policy if exists "Recipe comments are readable" on public.recipe_comments;
create policy "Recipe comments are readable"
on public.recipe_comments for select to authenticated
using (public.can_access_recipe(recipe_id));

drop policy if exists "Active users create recipe comments" on public.recipe_comments;
create policy "Active users create recipe comments"
on public.recipe_comments for insert to authenticated
with check (
  author_id = auth.uid()
  and public.is_recetario_active()
  and public.can_access_recipe(recipe_id)
);

drop policy if exists "Authors edit recipe comments" on public.recipe_comments;
create policy "Authors edit recipe comments"
on public.recipe_comments for update to authenticated
using (author_id = auth.uid() and public.is_recetario_active())
with check (author_id = auth.uid() and public.is_recetario_active());

drop policy if exists "Authors or admin delete recipe comments" on public.recipe_comments;
create policy "Authors or admin delete recipe comments"
on public.recipe_comments for delete to authenticated
using (author_id = auth.uid() or public.is_recetario_admin());

grant select, insert, delete on public.recipe_comments to authenticated;
grant update(body) on public.recipe_comments to authenticated;
grant execute on function public.can_access_recipe(uuid) to authenticated;

notify pgrst, 'reload schema';
