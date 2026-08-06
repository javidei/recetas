# Recetario de Javi

Aplicación web responsive para guardar recetas propias y encontrarlas por nombre, categoría o combinando varios ingredientes.

## Versión actual

**0.2.0 · 07/08/2026**

## Incluido

- Recetas de ejemplo con ficha completa.
- Buscador por nombre, descripción, etiquetas y varios ingredientes simultáneos.
- Búsqueda combinada con comas o `+`, mostrando solo recetas que contengan todos los términos.
- Filtros por categoría y ordenación.
- Favoritos y exportación a JSON.
- Alta, edición y borrado de recetas propias.
- Acceso mediante Supabase Auth.
- Persistencia privada en Supabase con políticas RLS.
- Subida de fotografías JPG, PNG y WEBP al bucket privado `recipe-images`.
- Migración de las recetas guardadas previamente en `localStorage`.
- Modo local de respaldo cuando no hay una sesión iniciada.
- Diseño responsive, accesible y preparado como PWA.
- Base preparada para incorporar OCR e IA en una fase posterior.

## Configuración pública

`recetario-config.js` contiene únicamente la URL de Supabase y la clave publicable. Estas credenciales están diseñadas para ejecutarse en el navegador y quedan limitadas por las políticas RLS de `supabase/001_recetas.sql`.

Nunca se debe añadir al repositorio la clave `service_role`.

## Persistencia

Con una sesión iniciada, las recetas, ingredientes, pasos y fotografías se guardan en Supabase. Sin sesión, las recetas continúan guardándose en `localStorage` para que la web siga siendo usable.

Al iniciar sesión aparece una acción para migrar las recetas locales existentes a la base de datos.

## Futuro OCR + IA

Flujo previsto:

1. Subir o fotografiar una página de un libro.
2. Extraer texto con OCR.
3. Convertirlo a una estructura de receta.
4. Mostrar una revisión editable.
5. Guardar la receta y su imagen en Supabase.

Una opción gratuita razonable será usar OCR en el navegador con Tesseract.js y un parser local por reglas. Una IA con cuota gratuita puede utilizarse como mejora opcional para estructurar textos más complejos.
