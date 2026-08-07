-- El Recetario · 013 · visibilidad de la opción Crear familia
-- Ejecutar una sola vez después de 012_registro_sin_email_limit.sql.
-- No elimina ni modifica familias existentes.

create table if not exists public.recetario_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.recetario_settings (setting_key, setting_value)
values ('family_creation_visible_to_members', 'true'::jsonb)
on conflict (setting_key) do nothing;

alter table public.recetario_settings enable row level security;

-- La tabla no necesita exponerse directamente: la app usa funciones controladas.
revoke all on public.recetario_settings from anon, authenticated;

create or replace function public.get_recetario_ui_settings()
returns table (
  family_creation_visible_to_members boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (setting_value #>> '{}')::boolean
      from public.recetario_settings
      where setting_key = 'family_creation_visible_to_members'
    ),
    true
  );
$$;

create or replace function public.admin_set_family_creation_visibility(target_visible boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_recetario_admin() then
    raise exception 'No tienes permisos de administrador.';
  end if;

  insert into public.recetario_settings (setting_key, setting_value, updated_at, updated_by)
  values (
    'family_creation_visible_to_members',
    to_jsonb(coalesce(target_visible, false)),
    now(),
    auth.uid()
  )
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  return coalesce(target_visible, false);
end;
$$;

grant execute on function public.get_recetario_ui_settings() to authenticated;
grant execute on function public.admin_set_family_creation_visibility(boolean) to authenticated;

notify pgrst, 'reload schema';

select
  public.get_recetario_ui_settings() as family_creation_visible_to_members;
