# TipTap v3 - Dependencia para WCRichText

## Información

| Campo | Valor |
|-------|-------|
| **Librería** | TipTap Editor |
| **Versión** | 3.x |
| **Licencia** | MIT |
| **Documentación** | https://tiptap.dev/docs |
| **Tipo** | Editor de texto enriquecido (headless) |

## Arquitectura

TipTap es un editor "headless" - proporciona la funcionalidad del editor pero **no incluye UI**.
El componente `WCRichText` crea su propia toolbar y estilos.

### Paquetes utilizados

- `@tiptap/core` - Motor principal del editor
- `@tiptap/starter-kit` - Pack de extensiones comunes (bold, italic, headings, lists, etc.)

## Carga de la librería

La librería se carga dinámicamente desde CDN (esm.sh) para evitar necesidad de build tools.

**CDN utilizado**: https://esm.sh

```javascript
// Imports desde CDN
import { Editor } from 'https://esm.sh/@tiptap/core@3'
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@3'
```

## Cambiar a archivos locales (futuro)

Si en el futuro se desea tener los archivos 100% locales sin dependencia de CDN:

1. **Opción A - Bundle con npm**:
   ```bash
   npm install @tiptap/core@3 @tiptap/starter-kit@3
   # Usar bundler (esbuild, rollup, webpack) para crear bundle único
   ```

2. **Opción B - Descargar bundles pre-construidos**:
   - Modificar `tiptap-loader.js` para importar desde archivos locales
   - Los archivos deben ser ES modules compatibles

## Extensiones incluidas en StarterKit v3

| Extensión | Descripción |
|-----------|-------------|
| Bold | Texto en negrita |
| Italic | Texto en cursiva |
| Strike | Texto tachado |
| Code | Código inline |
| Heading | Títulos H1-H6 |
| BulletList | Listas con viñetas |
| OrderedList | Listas numeradas |
| Blockquote | Citas |
| CodeBlock | Bloques de código |
| HorizontalRule | Línea horizontal |
| HardBreak | Salto de línea |
| History | Undo/Redo |

## Notas

- La carga desde CDN requiere conexión a internet
- esm.sh cachea los módulos de forma eficiente
- Compatible con todos los navegadores modernos (ES2020+)
