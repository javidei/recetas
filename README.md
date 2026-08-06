# Recetario de Javi

Aplicación web responsive para guardar recetas propias y encontrarlas por nombre, categoría o ingredientes.

## Versión actual

**0.1.0 · 06/08/2026**

## Incluido

- Recetas de ejemplo con ficha completa.
- Buscador por nombre, descripción, etiquetas e ingredientes.
- Filtros por categoría y ordenación.
- Favoritos.
- Alta, edición y borrado de recetas propias en `localStorage`.
- Exportación de recetas propias a JSON.
- Diseño responsive, accesible y preparado como PWA.
- Script SQL inicial para Supabase y bucket privado de imágenes.
- Base preparada para incorporar OCR e IA en una fase posterior.

## Persistencia

La versión 0.1.0 guarda las recetas creadas por el usuario únicamente en el navegador. El archivo `supabase/001_recetas.sql` prepara las tablas, políticas RLS y almacenamiento de imágenes para migrar después a la base de datos existente.

## Futuro OCR + IA

Flujo previsto:

1. Subir o fotografiar una página de un libro.
2. Extraer texto con OCR.
3. Convertirlo a una estructura de receta.
4. Mostrar una revisión editable.
5. Guardar la receta y su imagen en Supabase.

Una opción gratuita razonable será usar OCR en el navegador con Tesseract.js y una función gratuita o con cuota para estructurar el texto. También puede incorporarse un parser local por reglas como respaldo.
