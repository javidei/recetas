-- Recetario de Javi · permisos para login mediante nombre de usuario
-- Ejecutar una sola vez después de las migraciones anteriores.
-- No modifica usuarios, contraseñas, familias ni recetas.

-- Las nuevas Secret Keys de Supabase trabajan con el rol service_role.
-- BYPASSRLS evita las políticas RLS, pero el rol sigue necesitando el permiso
-- SQL correspondiente sobre la tabla para poder consultarla vía Data API.
grant usage on schema public to service_role;
grant select on table public.recetario_accounts to service_role;

-- Aseguramos también el acceso de lectura a las columnas utilizadas por la
-- Edge Function de inicio de sesión.
grant select (id, username, username_normalized, is_active, email)
on table public.recetario_accounts
to service_role;

-- Fuerza a PostgREST a refrescar los permisos y el esquema publicado.
notify pgrst, 'reload schema';

-- Comprobación: ambas columnas deberían devolver true.
select
  has_table_privilege('service_role', 'public.recetario_accounts', 'SELECT') as service_role_can_select,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recetario_accounts'
      and column_name = 'username_normalized'
  ) as username_normalized_exists;
