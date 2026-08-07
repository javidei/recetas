# Recetario de Javi

Aplicación web responsive y privada para guardar recetas propias, buscarlas por varios ingredientes y compartirlas dentro de uno o varios grupos familiares.

## Versión actual

**0.7.0 · 07/08/2026**

## Incluido

- Catálogo con fichas completas de recetas.
- Buscador que admite varios ingredientes separados por comas, `+` o punto y coma.
- Filtros, ordenación, favoritos y estadísticas.
- Alta, edición y borrado de recetas con verificación posterior en Supabase.
- Autor visible en tarjetas y detalles de cada receta.
- Fecha de última actualización en tarjeta; creación y modificaciones en detalle.
- Comentarios en recetas con respuestas anidadas.
- Popup de confirmación de guardado con control de visibilidad familiar.
- Acceso obligatorio: sin sesión no se muestra el catálogo.
- Inicio de sesión por correo electrónico o nombre de usuario.
- Perfil con nombre visible, usuario único y foto propia.
- La foto de perfil se recorta al centro y se reduce a 512×512 antes de subirla.
- Familias privadas mediante código de invitación.
- Máximo de 3 familias por usuario normal; el administrador general no tiene ese límite.
- Quien crea una familia puede eliminarla; el administrador general puede eliminar cualquiera.
- Al eliminar una familia, sus recetas compartidas pasan a privadas antes de borrar el grupo.
- Al compartir una receta se elige exactamente en qué familia será visible.
- Máximo de 10 cuentas activas del recetario.
- Panel de administrador para supervisar cuentas, todas sus familias y número de recetas.
- El administrador puede renombrar o eliminar familias y activar/desactivar cuentas.
- El administrador puede consultar todas las recetas; únicamente el autor puede editarlas o borrarlas.
- Iconos de administración con inicial de respaldo cuando una foto no carga.
- Selector de iconos de comida y bebida por categorías.
- Exportación JSON escondida en el menú secundario de escritorio.
- Footer anclado al final de la ventana incluso en páginas con poco contenido.
- Diseño responsive y PWA.

## Supabase

Scripts aplicados al proyecto, en este orden:

1. `supabase/001_recetas.sql`
2. `supabase/002_familias.sql`
3. `supabase/003_reparar_familias.sql`
4. `supabase/004_cuentas_admin.sql`
5. `supabase/005_permisos_recetas.sql`
6. `supabase/006_perfiles_multifamilia.sql`
7. `supabase/007_familias_comentarios.sql`

El script 006 añade `username`, avatar privado y familias múltiples. El 007 añade el límite de tres familias para cuentas normales, borrado seguro de grupos y la estructura de comentarios anidados.

### Acceso por nombre de usuario

Se utiliza el mismo enfoque que en Book Affinity, pero con una función separada para no interferir con aquel proyecto:

- Función: `supabase/functions/recetario-username-login/index.ts`
- Configuración: `supabase/config.toml`
- Nombre de la Edge Function: `recetario-username-login`

La función debe desplegarse en el mismo proyecto de Supabase. `verify_jwt` está desactivado únicamente para esta función porque se utiliza antes de iniciar sesión; la contraseña se valida finalmente contra Supabase Auth.

## Futuro OCR + IA

Flujo previsto:

1. Subir o fotografiar una página de un libro.
2. Extraer texto con OCR.
3. Convertirlo a una estructura de receta.
4. Mostrar una revisión editable.
5. Guardar la receta y su imagen en Supabase.
