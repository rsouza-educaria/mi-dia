/**
 * TipTap Loader - Centraliza la carga de TipTap v3
 *
 * Usa un bundle local generado con esbuild que incluye todos los módulos
 * de TipTap y sus dependencias (prosemirror, etc.) en un único archivo ESM.
 * No requiere conexión a internet.
 *
 * Para regenerar el bundle (tiptap-bundle.js):
 *   cd C:\Temp\tiptap-bundle (o cualquier directorio temporal)
 *   npm init -y
 *   npm install @tiptap/core@3 @tiptap/starter-kit@3 @tiptap/extension-image@3
 *               @tiptap/extension-text-style@3 @tiptap/extension-font-family@3
 *               @tiptap/extension-color@3 @tiptap/extension-highlight@3
 *               @tiptap/extension-text-align@3 @tiptap/extension-link@3
 *               @tiptap/extension-table@3 @tiptap/extension-table-row@3
 *               @tiptap/extension-table-cell@3 @tiptap/extension-table-header@3
 *               esbuild
 *
 *   Crear entry.js con este contenido exacto (los nombres deben coincidir con
 *   los que usa loadTipTap() más abajo):
 *     export { Editor, Node, Extension } from '@tiptap/core';
 *     export { default as StarterKit } from '@tiptap/starter-kit';
 *     export { default as Image } from '@tiptap/extension-image';
 *     export { default as TextStyle } from '@tiptap/extension-text-style';
 *     export { default as FontFamily } from '@tiptap/extension-font-family';
 *     export { default as Color } from '@tiptap/extension-color';
 *     export { default as Highlight } from '@tiptap/extension-highlight';
 *     export { default as TextAlign } from '@tiptap/extension-text-align';
 *     export { default as Link } from '@tiptap/extension-link';
 *     export { default as Table } from '@tiptap/extension-table';
 *     export { default as TableRow } from '@tiptap/extension-table-row';
 *     export { default as TableCell } from '@tiptap/extension-table-cell';
 *     export { default as TableHeader } from '@tiptap/extension-table-header';
 *
 *   node_modules\.bin\esbuild entry.js --bundle --format=esm --outfile=tiptap-bundle.js --platform=browser --minify
 *   (copiar tiptap-bundle.js a esta carpeta, y volver a poner esta cabecera de
 *   documentación al principio del fichero generado — esbuild no la conserva)
 *
 * IMPORTANTE — `Node` y `Extension`: no son extensiones de TipTap, son las
 * clases base de @tiptap/core para crear nodos y extensiones propios
 * (`Node.create({...})` / `Extension.create({...})`). Las usa WCRichText.js
 * (código NUESTRO, no de TipTap):
 *   - `Node`      → StyleBlock, para conservar el <style> de cualquier HTML
 *                   pegado o insertado (no solo plantillas de email).
 *   - `Extension` → EmailHtmlAttributes, que declara en el schema los atributos
 *                   (class/id/style/align/valign/width/height/bgcolor) que
 *                   ProseMirror descartaría, para respetar plantillas HTML
 *                   externas.
 * Si esta cabecera y el `export{}` del bundle alguna vez no coinciden, es que
 * se regeneró el bundle sin seguir esta receta: faltan por volver a añadir.
 *
 * @version 3.x
 * @see https://tiptap.dev/docs
 */

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const TIPTAP_VERSION = '3';

// Ruta al bundle local (relativa a este archivo)
const BUNDLE_URL = new URL('./tiptap-bundle.js', import.meta.url).href;
// Fallback: algunos entornos desplegados corren un minificado propio (AjaxMin,
// paso de Jenkins) sobre TODO .js que no termine ya en .min.js, sin distinguir
// este bundle vendored de codigo propio — lo renombra a tiptap-bundle.min.js
// y BORRA el original. Mismo caso ya cubierto para este propio loader desde
// WCRichText.js::_importTipTapLoader() (tiptap-loader.js -> tiptap-loader.min.js);
// aqui hace falta el mismo fallback porque este archivo es el que referencia
// tiptap-bundle.js por nombre fijo, y sin esto el import() de mas abajo
// devuelve 404 en esos entornos aunque el loader mismo sí haya cargado bien.
const BUNDLE_URL_MIN = new URL('./tiptap-bundle.min.js', import.meta.url).href;

// ============================================================================
// LOADER
// ============================================================================

let _Editor = null;
let _StarterKit = null;
let _Image = null;
let _TextStyle = null;
let _FontFamily = null;
let _Color = null;
let _Highlight = null;
let _TextAlign = null;
let _Link = null;
let _Table = null;
let _TableRow = null;
let _TableCell = null;
let _TableHeader = null;
let _Node = null;
let _Extension = null;
let _loadPromise = null;

/**
 * Importa el bundle con timeout defensivo: si el import() queda colgado
 * (bundle bloqueado por antivirus, red, etc.) rechaza en vez de colgar la
 * pagina indefinidamente. Extraido a parte para poder llamarlo dos veces
 * (BUNDLE_URL y su fallback BUNDLE_URL_MIN) sin duplicar el timeout.
 */
function _importarBundleConTimeout(url) {
    const TIMEOUT_MS = 15000;
    const importPromise = import(/* webpackIgnore: true */ url);
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout cargando TipTap (>${TIMEOUT_MS}ms)`)), TIMEOUT_MS)
    );
    return Promise.race([importPromise, timeoutPromise]);
}

/**
 * Carga TipTap de forma asíncrona.
 * Utiliza caché para evitar múltiples cargas.
 *
 * @returns {Promise<{Editor, StarterKit, Image, TextStyle, FontFamily, Color, Highlight, TextAlign, Link, Table, TableRow, TableCell, TableHeader, Node, Extension}>}
 */
export async function loadTipTap() {
    // Si ya está cargado, devolver desde caché
    if (_Editor && _StarterKit && _Image && _TextStyle && _FontFamily && _Color && _Highlight && _TextAlign && _Link && _Table && _Node && _Extension) {
        return {
            Editor: _Editor,
            StarterKit: _StarterKit,
            Image: _Image,
            TextStyle: _TextStyle,
            FontFamily: _FontFamily,
            Color: _Color,
            Highlight: _Highlight,
            TextAlign: _TextAlign,
            Link: _Link,
            Table: _Table,
            TableRow: _TableRow,
            TableCell: _TableCell,
            TableHeader: _TableHeader,
            Node: _Node,
            Extension: _Extension
        };
    }

    // Si hay una carga en progreso, esperar a que termine
    if (_loadPromise) {
        return _loadPromise;
    }

    // Iniciar nueva carga desde bundle local
    _loadPromise = (async () => {
        try {
            // Intenta el bundle sin minificar y, si no esta publicado (404 —
            // ver BUNDLE_URL_MIN mas arriba), reintenta con la variante
            // .min.js antes de darse por vencido.
            let bundle;
            try {
                bundle = await _importarBundleConTimeout(BUNDLE_URL);
            } catch (e) {
                bundle = await _importarBundleConTimeout(BUNDLE_URL_MIN);
            }

            _Editor = bundle.Editor;
            _StarterKit = bundle.StarterKit;
            _Image = bundle.Image;
            _TextStyle = bundle.TextStyle;
            _FontFamily = bundle.FontFamily;
            _Color = bundle.Color;
            _Highlight = bundle.Highlight;
            _TextAlign = bundle.TextAlign;
            _Link = bundle.Link;
            _Table = bundle.Table;
            _TableRow = bundle.TableRow;
            _TableCell = bundle.TableCell;
            _TableHeader = bundle.TableHeader;
            _Node = bundle.Node;
            _Extension = bundle.Extension;

            console.log('[TipTap Loader] TipTap v3 cargado correctamente (bundle local)');

            return {
                Editor: _Editor,
                StarterKit: _StarterKit,
                Image: _Image,
                TextStyle: _TextStyle,
                FontFamily: _FontFamily,
                Color: _Color,
                Highlight: _Highlight,
                TextAlign: _TextAlign,
                Link: _Link,
                Table: _Table,
                TableRow: _TableRow,
                TableCell: _TableCell,
                TableHeader: _TableHeader,
                Node: _Node,
                Extension: _Extension
            };
        } catch (error) {
            console.error('[TipTap Loader] Error cargando TipTap:', error);
            _loadPromise = null; // Permitir reintentos
            throw new Error(`No se pudo cargar TipTap: ${error.message}`);
        }
    })();

    return _loadPromise;
}

/**
 * Verifica si TipTap ya está cargado.
 * @returns {boolean}
 */
export function isTipTapLoaded() {
    return _Editor !== null && _StarterKit !== null;
}

/**
 * Obtiene la versión de TipTap configurada.
 * @returns {string}
 */
export function getTipTapVersion() {
    return TIPTAP_VERSION;
}
