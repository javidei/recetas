# Recetario de Javi

Aplicación web responsive y privada para guardar recetas propias, buscarlas por varios ingredientes y compartirlas dentro de un grupo familiar.

## Versión actual

**0.4.0 · 07/08/2026**

## Incluido

- Catálogo con fichas completas de recetas.
- Buscador que admite varios ingredientes separados por comas, `+` o punto y coma.
- Filtros, ordenación, favoritos y estadísticas.
- Alta, edición y borrado de recetas.
- Acceso obligatorio: sin sesión no se muestra el catálogo.
- Sincronización con Supabase y subida privada de fotografías.
- Página independiente de inicio de sesión, registro y perfil.
- Familias privadas mediante código de invitación.
- Recetas configurables como privadas o compartidas con la familia.
- Máximo de 10 cuentas activas del recetario.
- Panel de administrador para supervisar y activar/desactivar cuentas.
- El administrador puede consultar todas las recetas; únicamente el autor puede editarlas o borrarlas.
- Exportación JSON escondida en el menú secundario de escritorio.
- Diseño responsive y PWA.

## Supabase

Scripts aplicados al proyecto:

1. `supabase/001_recetas.sql`
2. `supabase/002_familias.sql`
3. `supabase/003_reparar_familias.sql`
4. `supabase/004_cuentas_admin.sql`

La versión 0.4.0 utiliza `recetario_accounts` para aislar completamente las cuentas de esta aplicación de los perfiles utilizados por otros proyectos dentro del mismo Supabase. El script 004 debe ejecutarse una sola vez para activar el límite de cuentas y el panel de administración.

## Futuro OCR + IA

Flujo previsto:

1. Subir o fotografiar una página de un libro.
2. Extraer texto con OCR.
3. Convertirlo a una estructura de receta.
4. Mostrar una revisión editable.
5. Guardar la receta y su imagen en Supabase.
