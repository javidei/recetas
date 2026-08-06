# Changelog

## 0.2.0 — 07/08/2026

- Búsqueda simultánea por varios ingredientes separados por comas, `+` o punto y coma.
- Los filtros rápidos ahora acumulan ingredientes en vez de sustituir la búsqueda anterior.
- Etiquetas visuales para retirar ingredientes concretos de la búsqueda.
- Integración real con Supabase Auth y las tablas del esquema inicial.
- Lectura, alta, edición y borrado de recetas privadas en Supabase.
- Sincronización de ingredientes y pasos relacionados.
- Subida de fotografías al bucket privado `recipe-images`.
- URLs firmadas temporales para visualizar imágenes privadas.
- Migración voluntaria de recetas locales a Supabase.
- Modo `localStorage` conservado como respaldo sin sesión.
- Nueva interfaz de acceso, cierre de sesión y estado de sincronización.
- Actualización de la PWA y de la caché a la versión 0.2.0.

## 0.1.0 — 06/08/2026

- Primera versión usable del recetario.
- Catálogo inicial con seis recetas de ejemplo.
- Búsqueda por ingredientes, nombre, categoría y etiquetas.
- Filtros, ordenación, favoritos y estadísticas.
- Fichas completas con tiempos, raciones, dificultad, ingredientes, pasos y notas.
- Formulario para crear, editar y eliminar recetas propias en el navegador.
- Exportación JSON.
- Diseño responsive y accesible.
- PWA y funcionamiento offline básico.
- Esquema inicial de Supabase con RLS y almacenamiento de fotografías.
- Preparación funcional para integrar OCR e IA en versiones futuras.
