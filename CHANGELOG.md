# Changelog

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
