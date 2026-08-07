# Changelog

## 0.5.0 — 07/08/2026

- Guardado reforzado: antes de insertar se valida que la sesión pertenece a una cuenta activa del Recetario.
- Una receta no se considera guardada hasta volver a verificarla en Supabase junto a sus ingredientes y pasos.
- Los errores de guardado se muestran dentro del formulario y no se pierden los datos escritos.
- Nuevo popup de confirmación tras guardar, indicando si la receta es privada o familiar.
- El popup de confirmación permite cambiar mediante un check si la receta se comparte con la familia.
- El formulario de receta ya no se cierra al pulsar accidentalmente fuera de la ventana.
- Selector de emojis con grupos para platos, carnes, pescado, verduras, desayuno, postres, frutas y bebidas.
- Pantalla de acceso más compacta y centrada en escritorio.
- Protección temprana del catálogo para que no se renderice sin una sesión válida.
- Hotfix Supabase: añadida `supabase/005_permisos_recetas.sql` para conceder a `authenticated` los permisos SQL necesarios sobre recetas, ingredientes y pasos, manteniendo el filtrado RLS.

## 0.4.0 — 07/08/2026

- Recetario privado: sin sesión no se muestra el catálogo.
- Cuentas del recetario aisladas de otros proyectos del mismo Supabase.
- Máximo de 10 cuentas activas.
- Cuenta administradora y nueva pantalla privada `admin.html`.
- El administrador puede consultar cuentas, familias y número de recetas.
- Activación y desactivación de cuentas desde administración.
- El administrador puede consultar todas las recetas; solo su autor puede modificarlas o eliminarlas.
- Corregidas las pestañas de iniciar sesión y crear cuenta.
- Añadida la migración `supabase/004_cuentas_admin.sql`.

## 0.3.0 — 07/08/2026

- Encabezado simplificado: nunca aparecen simultáneamente Acceder y Cerrar sesión.
- El acceso dirige ahora a una página independiente de cuenta y registro.
- Exportación movida a un menú secundario visible únicamente en escritorio.
- Eliminado del encabezado el confuso botón de recetas locales.
- Nueva página `cuenta.html` con inicio de sesión, registro, perfil y cierre de sesión.
- Creación de familias privadas y acceso mediante código de invitación.
- Listado de familiares dentro de la cuenta.
- Las recetas pueden guardarse como privadas o compartidas con la familia.
- Los familiares pueden consultar las recetas compartidas, pero solo el autor puede modificarlas.
- Migración de recetas locales explicada y ubicada dentro de Mi cuenta.
- Añadida la migración `supabase/002_familias.sql` con tablas, funciones y políticas RLS.

## 0.2.0 — 07/08/2026

- Búsqueda simultánea por varios ingredientes.
- Inicio de sesión y sincronización con Supabase.
- Alta, edición y borrado en la base de datos.
- Subida de fotografías al bucket privado `recipe-images`.
- Migración de recetas locales.

## 0.1.0 — 06/08/2026

- Primera versión usable del recetario.
- Catálogo inicial con seis recetas de ejemplo.
- Filtros, favoritos, fichas completas y guardado local.
