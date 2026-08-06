# Recetario de Javi

Aplicación web responsive para guardar recetas propias, buscarlas por varios ingredientes y compartirlas dentro de un grupo familiar privado.

## Versión actual

**0.3.0 · 07/08/2026**

## Incluido

- Catálogo inicial con recetas de ejemplo y fichas completas.
- Buscador que admite varios ingredientes separados por comas, `+` o punto y coma.
- Filtros, ordenación, favoritos y estadísticas.
- Alta, edición y borrado de recetas.
- Guardado local sin cuenta y sincronización con Supabase al iniciar sesión.
- Subida privada de fotografías.
- Página independiente de acceso, registro y perfil.
- Familias privadas mediante código de invitación.
- Recetas configurables como privadas o compartidas con la familia.
- Exportación JSON escondida en el menú secundario de escritorio.
- Diseño responsive, accesible y preparado como PWA.

## Supabase

Ejecutar los scripts en este orden:

1. `supabase/001_recetas.sql`
2. `supabase/002_familias.sql`

El segundo script añade perfiles, familias, miembros, códigos de invitación, visibilidad familiar y nuevas políticas RLS. Las recetas familiares pueden leerlas todos los miembros, pero solo puede editarlas o eliminarlas la persona que las creó.

## Futuro OCR + IA

Flujo previsto:

1. Subir o fotografiar una página de un libro.
2. Extraer texto con OCR.
3. Convertirlo a una estructura de receta.
4. Mostrar una revisión editable.
5. Guardar la receta y su imagen en Supabase.
