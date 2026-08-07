# Changelog

## 0.8.0 — 07/08/2026

- El popup de detalle de una receta ya no se cierra al pulsar accidentalmente fuera.
- Corregida la superposición visual del bloque de autor y fechas con las tarjetas de Nota, Preparación, Cocinado, Dificultad y Raciones.
- Botón «Cancelar respuesta» rediseñado para integrarse con la interfaz.
- La sección completa de comentarios puede plegarse y desplegarse.
- Los hilos con respuestas pueden plegarse de forma independiente.
- Añadidos likes a comentarios, con contador y estado personal.
- Añadido centro de notificaciones interno mediante campana y contador de pendientes.
- Se genera una notificación cuando otra persona comenta una receta propia.
- Se genera una notificación cuando otra persona responde a un comentario propio.
- Las notificaciones permiten abrir directamente la receta relacionada y marcarlas como leídas.
- Añadida `supabase/010_likes_notificaciones.sql` con tablas, triggers y políticas RLS para likes y notificaciones.

## 0.7.0 — 07/08/2026

- Máximo de 3 familias por cuenta normal; la cuenta administradora general queda exenta.
- El creador de una familia puede eliminar únicamente los grupos que ha creado.
- El administrador general puede eliminar cualquier familia.
- El borrado de una familia convierte antes en privadas las recetas que estaban compartidas con ese grupo.
- Corrección visual de avatares e iconos de familia en administración, con iniciales como respaldo si una imagen falla.
- Las tarjetas de receta muestran autor y fecha de última actualización.
- El detalle de receta muestra autor, fecha de creación y fecha de modificación cuando existe.
- Nueva sección de comentarios en recetas almacenadas en Supabase.
- Los comentarios permiten respuestas anidadas y nuevas respuestas sobre esas respuestas.
- El autor de un comentario puede eliminarlo; el administrador general también puede hacerlo.
- Añadida `supabase/007_familias_comentarios.sql` con límites, borrado seguro y estructura RLS de comentarios.

## 0.6.0 — 07/08/2026

- Footer anclado al final de la ventana mediante un layout común compatible con `100vh` y `100dvh`.
- Las cuentas pueden pertenecer a varias familias; se elimina la restricción de una única familia por usuario.
- Al compartir una receta se elige exactamente en qué familia será visible.
- El popup de guardado también permite escoger o cambiar la familia de destino.
- El administrador ve todas las familias asociadas a cada cuenta.
- Nueva sección de administración de familias con cambio de nombre desde `admin.html`.
- Perfil ampliado con nombre de usuario único y foto propia.
- Las fotos de perfil se recortan al centro y se reducen a 512×512 antes de almacenarse en el bucket privado `recipe-avatars`.
- Inicio de sesión mediante correo o nombre de usuario.
- Añadida la Edge Function independiente `recetario-username-login`, siguiendo el patrón de Book Affinity sin sobrescribir su función.
- Añadida `supabase/006_perfiles_multifamilia.sql` con columnas, permisos, almacenamiento, funciones y cambios de familias múltiples.

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
