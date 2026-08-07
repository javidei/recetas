-- Recetario de Javi · corrección de permisos de escritura
-- Ejecutar una sola vez después de 004_cuentas_admin.sql.
-- No modifica datos ni políticas RLS: únicamente concede al rol authenticated
-- los permisos SQL necesarios para que las políticas RLS puedan aplicarse.

-- Tablas principales del recetario.
grant select, insert, update, delete on table public.recipes to authenticated;
grant select, insert, update, delete on table public.recipe_ingredients to authenticated;
grant select, insert, update, delete on table public.recipe_steps to authenticated;

-- La aplicación consulta familias desde el navegador; las altas/bajas sensibles
-- siguen protegidas por RLS y por las funciones RPC ya creadas.
grant select on table public.recipe_families to authenticated;
grant select on table public.recipe_family_members to authenticated;

-- Las columnas identity de ingredientes y pasos utilizan secuencias internas.
-- Se conceden únicamente las secuencias pertenecientes al Recetario.
do $$
begin
  if to_regclass('public.recipe_ingredients_id_seq') is not null then
    execute 'grant usage, select on sequence public.recipe_ingredients_id_seq to authenticated';
  end if;

  if to_regclass('public.recipe_steps_id_seq') is not null then
    execute 'grant usage, select on sequence public.recipe_steps_id_seq to authenticated';
  end if;
end;
$$;

-- Comprobación rápida de los permisos efectivos tras ejecutar la migración.
-- Debe devolver true en las cuatro columnas de recipes.
select
  has_table_privilege('authenticated', 'public.recipes', 'SELECT') as recipes_select,
  has_table_privilege('authenticated', 'public.recipes', 'INSERT') as recipes_insert,
  has_table_privilege('authenticated', 'public.recipes', 'UPDATE') as recipes_update,
  has_table_privilege('authenticated', 'public.recipes', 'DELETE') as recipes_delete;

notify pgrst, 'reload schema';
