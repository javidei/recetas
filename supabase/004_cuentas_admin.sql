-- Recetario de Javi · cuentas aisladas y administración
-- Ejecutar una sola vez después de 003_reparar_familias.sql.
-- No modifica ni elimina usuarios de otros proyectos del mismo Supabase.

create table if not exists public.recetario_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Familiar' check (char_length(display_name) between 1 and 60),
  email text,
  role text not null default 'member' check (role in ('admin', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migra únicamente usuarios que ya tengan datos propios del recetario.
with used_users as (
  select owner_id as id from public.recipes where owner_id is not null
  union
  select owner_id as id from public.recipe_families where owner_id is not null
  union
  select user_id as id from public.recipe_family_members where user_id is not null
)
insert into public.recetario_accounts (id, display_name, email)
select
  u.id,
  coalesce(
    nullif(trim(rp.display_name), ''),
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    split_part(u.email, '@', 1),
    'Familiar'
  ),
  u.email
from used_users used
join auth.users u on u.id = used.id
left join public.recipe_profiles rp on rp.id = u.id
on conflict (id) do update
set email = excluded.email,
    updated_at = now();

-- Si ya había cuentas del recetario, la más antigua pasa a ser la administradora inicial.
do $$
begin
  if exists (select 1 from public.recetario_accounts)
     and not exists (select 1 from public.recetario_accounts where role = 'admin') then
    update public.recetario_accounts
    set role = 'admin', updated_at = now()
    where id = (
      select account.id
      from public.recetario_accounts account
      join auth.users usr on usr.id = account.id
      order by usr.created_at asc, account.id
      limit 1
    );
  end if;
end;
$$;

-- Las familias quedan vinculadas únicamente a cuentas del Recetario.
alter table public.recipe_families
  drop constraint if exists recipe_families_owner_id_fkey;
alter table public.recipe_family_members
  drop constraint if exists recipe_family_members_user_id_fkey;

-- Por seguridad, crea las cuentas que falten para relaciones familiares existentes.
insert into public.recetario_accounts (id, display_name, email)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(u.email, '@', 1), 'Familiar'),
       u.email
from auth.users u
where u.id in (
  select owner_id from public.recipe_families
  union
  select user_id from public.recipe_family_members
)
on conflict (id) do nothing;

alter table public.recipe_families
  add constraint recipe_families_owner_id_fkey
  foreign key (owner_id) references public.recetario_accounts(id) on delete cascade;

alter table public.recipe_family_members
  add constraint recipe_family_members_user_id_fkey
  foreign key (user_id) references public.recetario_accounts(id) on delete cascade;

create or replace function public.is_recetario_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recetario_accounts account
    where account.id = auth.uid()
      and account.role = 'admin'
      and account.is_active
  );
$$;

create or replace function public.is_recetario_active(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recetario_accounts account
    where account.id = target_user_id
      and account.is_active
  );
$$;

create or replace function public.shares_recipe_family(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recipe_family_members mine
    join public.recipe_family_members other
      on other.family_id = mine.family_id
    where mine.user_id = auth.uid()
      and other.user_id = target_user_id
  );
$$;

create or replace function public.ensure_recetario_account(requested_display_name text default null)
returns public.recetario_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.recetario_accounts;
  current_email text;
  chosen_name text;
  chosen_role text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into account
  from public.recetario_accounts
  where id = auth.uid();

  if found then
    return account;
  end if;

  if (select count(*) from public.recetario_accounts where is_active) >= 10 then
    raise exception 'El recetario ya tiene el máximo de 10 cuentas activas.';
  end if;

  select email into current_email
  from auth.users
  where id = auth.uid();

  chosen_name := coalesce(
    nullif(trim(requested_display_name), ''),
    split_part(current_email, '@', 1),
    'Familiar'
  );

  chosen_role := case
    when not exists (select 1 from public.recetario_accounts where role = 'admin') then 'admin'
    else 'member'
  end;

  insert into public.recetario_accounts (id, display_name, email, role)
  values (auth.uid(), chosen_name, current_email, chosen_role)
  returning * into account;

  return account;
end;
$$;

-- Los nuevos registros creados desde esta aplicación llevan metadata app=recetario.
create or replace function public.handle_new_recetario_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_role text;
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

  insert into public.recetario_accounts (id, display_name, email, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1),
      'Familiar'
    ),
    new.email,
    chosen_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_recetario on auth.users;
drop trigger if exists on_auth_user_created_recetario_account on auth.users;
create trigger on_auth_user_created_recetario_account
after insert on auth.users
for each row execute function public.handle_new_recetario_account();

-- Funciones familiares: solo cuentas activas del Recetario.
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

  if exists (select 1 from public.recipe_family_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una familia.';
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

  if exists (select 1 from public.recipe_family_members where user_id = auth.uid()) then
    raise exception 'Ya perteneces a una familia.';
  end if;

  select id into target_family_id
  from public.recipe_families
  where upper(invite_code) = upper(trim(family_code));

  if target_family_id is null then
    raise exception 'El código familiar no es válido.';
  end if;

  insert into public.recipe_family_members (family_id, user_id, role)
  values (target_family_id, auth.uid(), 'member');

  return target_family_id;
end;
$$;

create or replace function public.admin_list_recetario_accounts()
returns table (
  id uuid,
  display_name text,
  email text,
  role text,
  is_active boolean,
  created_at timestamptz,
  family_name text,
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
    account.email,
    account.role,
    account.is_active,
    account.created_at,
    family.name as family_name,
    count(recipe.id)::bigint as recipe_count
  from public.recetario_accounts account
  left join public.recipe_family_members membership on membership.user_id = account.id
  left join public.recipe_families family on family.id = membership.family_id
  left join public.recipes recipe on recipe.owner_id = account.id
  group by account.id, account.display_name, account.email, account.role,
           account.is_active, account.created_at, family.name
  order by case when account.role = 'admin' then 0 else 1 end,
           account.created_at asc;
end;
$$;

create or replace function public.admin_set_recetario_account_active(target_user_id uuid, target_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_recetario_admin() then
    raise exception 'No tienes permisos de administrador.';
  end if;

  if target_user_id = auth.uid() and not target_active then
    raise exception 'No puedes desactivar tu propia cuenta administradora.';
  end if;

  if target_active
     and not exists (
       select 1 from public.recetario_accounts
       where id = target_user_id and is_active
     )
     and (select count(*) from public.recetario_accounts where is_active) >= 10 then
    raise exception 'Ya hay 10 cuentas activas.';
  end if;

  update public.recetario_accounts
  set is_active = target_active,
      updated_at = now()
  where id = target_user_id;
end;
$$;

alter table public.recetario_accounts enable row level security;

drop policy if exists "Recetario account visibility" on public.recetario_accounts;
create policy "Recetario account visibility"
on public.recetario_accounts for select to authenticated
using (
  id = auth.uid()
  or public.is_recetario_admin()
  or public.shares_recipe_family(id)
);

drop policy if exists "Users update own recetario name" on public.recetario_accounts;
create policy "Users update own recetario name"
on public.recetario_accounts for update to authenticated
using (id = auth.uid() and public.is_recetario_active())
with check (id = auth.uid());

-- Familias: miembros activos ven su grupo; el administrador puede supervisar.
drop policy if exists "Members read their recipe family" on public.recipe_families;
create policy "Members read their recipe family"
on public.recipe_families for select to authenticated
using (
  public.is_recetario_admin()
  or (public.is_recetario_active() and public.is_recipe_family_member(id))
);

drop policy if exists "Members read recipe family members" on public.recipe_family_members;
create policy "Members read recipe family members"
on public.recipe_family_members for select to authenticated
using (
  public.is_recetario_admin()
  or (public.is_recetario_active() and public.is_recipe_family_member(family_id))
);

-- Recetas: el administrador puede ver todo; solo el autor modifica o elimina.
drop policy if exists "Accessible recipes are readable" on public.recipes;
create policy "Accessible recipes are readable"
on public.recipes for select to authenticated
using (
  public.is_recetario_admin()
  or (
    public.is_recetario_active()
    and (
      owner_id = auth.uid()
      or visibility = 'public'
      or (visibility = 'family' and public.is_recipe_family_member(family_id))
    )
  )
);

drop policy if exists "Owners create accessible recipes" on public.recipes;
create policy "Owners create accessible recipes"
on public.recipes for insert to authenticated
with check (
  public.is_recetario_active()
  and owner_id = auth.uid()
  and (
    visibility in ('private', 'public')
    or (visibility = 'family' and public.is_recipe_family_member(family_id))
  )
);

drop policy if exists "Owners update their recipes" on public.recipes;
create policy "Owners update their recipes"
on public.recipes for update to authenticated
using (public.is_recetario_active() and owner_id = auth.uid())
with check (
  public.is_recetario_active()
  and owner_id = auth.uid()
  and (
    visibility in ('private', 'public')
    or (visibility = 'family' and public.is_recipe_family_member(family_id))
  )
);

drop policy if exists "Owners delete their recipes" on public.recipes;
create policy "Owners delete their recipes"
on public.recipes for delete to authenticated
using (public.is_recetario_active() and owner_id = auth.uid());

drop policy if exists "Accessible ingredients are readable" on public.recipe_ingredients;
create policy "Accessible ingredients are readable"
on public.recipe_ingredients for select to authenticated
using (exists (
  select 1
  from public.recipes recipe
  where recipe.id = recipe_id
    and (
      public.is_recetario_admin()
      or (
        public.is_recetario_active()
        and (
          recipe.owner_id = auth.uid()
          or recipe.visibility = 'public'
          or (recipe.visibility = 'family' and public.is_recipe_family_member(recipe.family_id))
        )
      )
    )
));

drop policy if exists "Accessible steps are readable" on public.recipe_steps;
create policy "Accessible steps are readable"
on public.recipe_steps for select to authenticated
using (exists (
  select 1
  from public.recipes recipe
  where recipe.id = recipe_id
    and (
      public.is_recetario_admin()
      or (
        public.is_recetario_active()
        and (
          recipe.owner_id = auth.uid()
          or recipe.visibility = 'public'
          or (recipe.visibility = 'family' and public.is_recipe_family_member(recipe.family_id))
        )
      )
    )
));

create or replace function public.can_read_recipe_image(target_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_recetario_admin() or exists (
    select 1
    from public.recipes recipe
    where recipe.cover_image_path = target_path
      and public.is_recetario_active()
      and (
        recipe.owner_id = auth.uid()
        or recipe.visibility = 'public'
        or (recipe.visibility = 'family' and public.is_recipe_family_member(recipe.family_id))
      )
  );
$$;

-- Nadie desde el navegador puede elevar su rol ni activar su propia cuenta mediante PATCH.
revoke all on public.recetario_accounts from anon;
revoke insert, delete, update on public.recetario_accounts from authenticated;
grant select on public.recetario_accounts to authenticated;
grant update(display_name) on public.recetario_accounts to authenticated;

grant execute on function public.ensure_recetario_account(text) to authenticated;
grant execute on function public.is_recetario_admin() to authenticated;
grant execute on function public.is_recetario_active(uuid) to authenticated;
grant execute on function public.shares_recipe_family(uuid) to authenticated;
grant execute on function public.admin_list_recetario_accounts() to authenticated;
grant execute on function public.admin_set_recetario_account_active(uuid, boolean) to authenticated;
grant execute on function public.create_recipe_family(text) to authenticated;
grant execute on function public.join_recipe_family(text) to authenticated;
grant execute on function public.can_read_recipe_image(text) to authenticated;

notify pgrst, 'reload schema';
