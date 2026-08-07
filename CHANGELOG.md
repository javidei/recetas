# Changelog

## 0.4.0 — 07/08/2026

- Corregidas las pestañas de inicio de sesión y registro: solo se muestra el formulario activo.
- El catálogo pasa a ser privado: sin una sesión válida se redirige a `cuenta.html` y no se muestran recetas.
- Eliminado el falso aviso permanente de reparación familiar.
- Cuentas del recetario aisladas en `recetario_accounts`, sin mezclar usuarios de otros proyectos del mismo Supabase.
- Máximo de 10 cuentas activas para el Recetario.
- Primera cuenta administradora con acceso a un panel privado.
- Nuevo `admin.html` para consultar cuentas, correo, familia, estado y número de recetas.
- El administrador puede desactivar y reactivar cuentas familiares.
- El administrador puede consultar todas las recetas mediante RLS, aunque solo el autor puede modificarlas.
- Nuevos registros identificados mediante metadata `app=recetario`.
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
