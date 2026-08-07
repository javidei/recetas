-- El Recetario · 014 · importación de recetas desde fotografía con IA
-- Ejecutar una sola vez después de 013_visibilidad_crear_familia.sql.
-- La función de IA queda DESACTIVADA por defecto y solo el administrador puede activarla.

insert into public.recetario_settings (setting_key, setting_value)
values ('ai_recipe_photo_enabled', 'false'::jsonb)
on conflict (setting_key) do nothing;

-- Cambia la firma de la función para devolver también el estado del módulo IA.
drop function if exists public.get_recetario_ui_settings();

create function public.get_recetario_ui_settings()
returns table (
  family_creation_visible_to_members boolean,
  ai_recipe_photo_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (
        select (setting_value #>> '{}')::boolean
        from public.recetario_settings
        where setting_key = 'family_creation_visible_to_members'
      ),
      true
    ) as family_creation_visible_to_members,
    coalesce(
      (
        select (setting_value #>> '{}')::boolean
        from public.recetario_settings
        where setting_key = 'ai_recipe_photo_enabled'
      ),
      false
    ) as ai_recipe_photo_enabled;
$$;

create or replace function public.admin_set_ai_recipe_photo_enabled(target_enabled boolean)
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
    'ai_recipe_photo_enabled',
    to_jsonb(coalesce(target_enabled, false)),
    now(),
    auth.uid()
  )
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  return coalesce(target_enabled, false);
end;
$$;

grant execute on function public.get_recetario_ui_settings() to authenticated;
grant execute on function public.admin_set_ai_recipe_photo_enabled(boolean) to authenticated;

notify pgrst, 'reload schema';

select * from public.get_recetario_ui_settings();
