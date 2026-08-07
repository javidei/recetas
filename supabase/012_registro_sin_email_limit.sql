-- El Recetario · v0.9.0
-- Amplía el máximo operativo de cuentas activas de 10 a 25.
-- El alta desde la Edge Function se confirma sin enviar emails, evitando el rate limit.

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

  if (select count(*) from public.recetario_accounts where is_active) >= 25 then
    raise exception 'El Recetario ya tiene el máximo de 25 cuentas activas.';
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

-- Comprobación visible al terminar.
select
  (select count(*) from public.recetario_accounts where is_active) as active_accounts,
  25 as max_active_accounts;

notify pgrst, 'reload schema';
