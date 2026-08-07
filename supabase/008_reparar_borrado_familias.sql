-- Recetario de Javi · reparación puntual del borrado de familias
-- Ejecutar una sola vez después de las migraciones anteriores.
-- Es idempotente: no borra ni modifica familias durante la instalación.

create or replace function public.delete_recipe_family(target_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select owner_id
  into target_owner
  from public.recipe_families
  where id = target_family_id;

  if target_owner is null then
    raise exception 'No se encontró la familia.';
  end if;

  if not public.is_recetario_admin() and target_owner <> auth.uid() then
    raise exception 'Solo quien creó la familia puede eliminarla.';
  end if;

  -- Antes del borrado, las recetas compartidas con el grupo pasan a privadas.
  -- Esto evita conflictos con la restricción de visibility/family_id.
  update public.recipes
  set visibility = 'private',
      family_id = null,
      is_public = false
  where family_id = target_family_id;

  delete from public.recipe_families
  where id = target_family_id;
end;
$$;

revoke all on function public.delete_recipe_family(uuid) from public;
grant execute on function public.delete_recipe_family(uuid) to authenticated;

-- Obliga a PostgREST a volver a leer las funciones inmediatamente.
notify pgrst, 'reload schema';

-- Comprobación visual para el SQL Editor.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'delete_recipe_family';
