# El Recetario

Aplicación web responsive y privada para guardar recetas propias, buscarlas por varios ingredientes y compartirlas dentro de uno o varios grupos familiares.

## Versión actual

**0.10.0 · 07/08/2026**

## Incluido

- Catálogo con fichas completas de recetas.
- Buscador que admite varios ingredientes separados por comas, `+` o punto y coma.
- Filtros, ordenación, favoritos y estadísticas.
- Alta, edición y borrado de recetas con verificación posterior en Supabase.
- Autor visible en tarjetas y detalles de cada receta.
- Fecha de última actualización en tarjeta; creación y modificaciones en detalle.
- Comentarios en recetas con respuestas anidadas.
- Likes en comentarios y notificaciones internas.
- Recetas por defecto integradas en Supabase y comentables.
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
- Hasta 25 cuentas activas de El Recetario.
- Panel de administrador para supervisar cuentas, todas sus familias y número de recetas.
- El administrador puede renombrar o eliminar familias y activar/desactivar cuentas.
- El administrador decide si los usuarios normales pueden ver la opción `Crear familia`.
- El administrador puede activar o desactivar globalmente la importación de recetas con IA.
- Importación desde fotografía: Gemini extrae título, descripción, categoría, dificultad, raciones, tiempos, ingredientes, pasos y notas y rellena el formulario sin guardarlo automáticamente.
- Las fotos usadas para extracción se reducen en el navegador y no se guardan como portada de la receta.
- El administrador puede consultar todas las recetas; únicamente el autor puede editarlas o borrarlas.
- Selector de iconos de comida y bebida por categorías.
- Exportación JSON escondida en el menú secundario de escritorio.
- Footer anclado al final de la ventana incluso en páginas con poco contenido.
- Diseño responsive y PWA.

## Supabase

El proyecto utiliza las migraciones almacenadas en `supabase/`, aplicadas de forma incremental. Para la versión 0.10.0 la última es:

- `supabase/014_ia_recetas.sql`

### Acceso por nombre de usuario

La Edge Function `recetario-username-login` resuelve acceso y alta sin exponer claves administrativas en el frontend.

### Importación de recetas con IA

La IA utiliza una Edge Function separada:

- Función: `supabase/functions/recetario-recipe-ai/index.ts`
- Secret necesaria: `GEMINI_API_KEY`
- Secret opcional: `GEMINI_MODEL`
- Modelo por defecto: `gemini-2.5-flash-lite`

La clave de Gemini se configura únicamente como secret de Supabase y nunca se envía al navegador. La Edge Function comprueba que el usuario tenga sesión válida, que su cuenta esté activa y que el administrador haya activado la función antes de llamar a Gemini.

Flujo:

1. Abrir `Nueva receta`.
2. Elegir o hacer una foto de la receta.
3. La imagen se reduce en el navegador.
4. La Edge Function la envía a Gemini y solicita una respuesta JSON estructurada.
5. Se rellenan los campos del formulario.
6. El usuario revisa y corrige los datos.
7. La receta solo se guarda al pulsar expresamente `Guardar receta`.
