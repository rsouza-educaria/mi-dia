// =============================================================================
// PDFJS - Motor PDF local
// Los archivos deben estar en: javascript/common/web-component/external/documentviewer/
//   - pdf.min.js
//   - pdf.worker.min.js
// Para actualizar la version: reemplazar los archivos en esa carpeta.
// Permite override desde window._DV_PDFJS_BASE para uso en contextos especiales.
// =============================================================================
let _DV_PDFJS_BASE = window._DV_PDFJS_BASE;
if (!_DV_PDFJS_BASE) {
    try {
        // Funciona tanto en widgets/DocumentViewer.js como en min/components.min.js.
        const scriptUrl = new URL(import.meta.url);
        _DV_PDFJS_BASE = new URL('../external/documentviewer/', scriptUrl).href;
    } catch (_e) {
        // Fallback: ruta absoluta desde la raíz del servidor
        _DV_PDFJS_BASE = '/javascript/common/web-component/external/documentviewer/';
    }
}
let _dvPdfjsLibCache = null;
const _DV_MIN_SCALE = 0.05;
const _DV_XML_PRETTY_MAX_CHARS = 250000;
const _DV_XML_FAST_INITIAL_LINES = 500;
const _DV_XML_FAST_LINES_PER_BATCH = 400;
const _DV_XML_FAST_SCROLL_THRESHOLD_PX = 300;
const _DV_PDF_INITIAL_PAGES = 8;
const _DV_PDF_PAGES_PER_BATCH = 6;
const _DV_PDF_SCROLL_THRESHOLD_PX = 400;

function _dvSanitizeArrayPrototypeRemove() {
    // pdf.js falla si detecta propiedades enumerables heredadas en Array.prototype.
    // Mantenemos remove disponible si existe, pero evitamos que salga en for...in.
    try {
        const desc = Object.getOwnPropertyDescriptor(Array.prototype, 'remove');
        if (!desc || desc.enumerable !== true || desc.configurable !== true) return;

        if (Object.prototype.hasOwnProperty.call(desc, 'value')) {
            Object.defineProperty(Array.prototype, 'remove', {
                value: desc.value,
                writable: desc.writable,
                configurable: desc.configurable,
                enumerable: false
            });
            return;
        }

        Object.defineProperty(Array.prototype, 'remove', {
            get: desc.get,
            set: desc.set,
            configurable: desc.configurable,
            enumerable: false
        });
    } catch (_) {
        // no-op
    }
}

// =============================================================================
// RENDERERS
// Interfaz de cada renderer:
//   render(binary, bytes, contentEl, viewer) -> void | Promise<void>
//   getToolbarButtons()                      -> string[]   (ids de los botones visibles)
//   getInfoText(viewer)                      -> string     (texto de la barra de info)
//   onZoomChange(viewer)                     -> void | Promise<void>   (opcional)
// Para registrar un tipo nuevo: DocumentViewer.registerRenderer('tipo', renderer)
// =============================================================================

const _DV_RENDERERS = {};

// -----------------------------------------------------------------------------
// Renderer: imagen
// -----------------------------------------------------------------------------
_DV_RENDERERS.image = {
    render(binary, _bytes, contentEl, viewer) {
        const mimeType = DocumentViewer._detectImageMimeType(binary);

        const img = document.createElement('img');
        img.src = 'data:' + mimeType + ';base64,' + viewer.base64;
        img.draggable = false;
        img.style.cssText = 'display:block;user-select:none;pointer-events:none;-webkit-user-drag:none;margin:0 auto;';
        img.addEventListener('dragstart', e => e.preventDefault());
        img.onerror = () => viewer._showError(
            viewer._tr('FORMATO_IMAGEN_NO_SOPORTADO', 'Formato de imagen no soportado por el navegador: {0}')
                .replace('{0}', mimeType)
        );

        const wrapper = document.createElement('div');
        wrapper.className = 'dv-image-wrapper';
        wrapper.appendChild(img);

        contentEl.innerHTML = '';
        contentEl.classList.add('is-draggable');
        contentEl.appendChild(wrapper);

        const applyTransform = () => {
            DocumentViewer._autoFitImageScale(viewer, img, contentEl);
            DocumentViewer._applyImageTransform(viewer);
            viewer._updateInfo(this.getInfoText(viewer));
        };
        if (img.complete) {
            applyTransform();
        } else {
            img.addEventListener('load', applyTransform, { once: true });
        }

        viewer._activeRenderer = this;
    },

    getToolbarButtons() { return ['dv-zoom-out', 'dv-zoom-in', 'dv-rotate-left', 'dv-rotate-right']; },

    getInfoText(viewer) {
        const binary = atob(viewer.base64);
        const mimeType = DocumentViewer._detectImageMimeType(binary);
        const tImage = viewer._tr('IMAGEN', 'Imagen');
        const tZoom = viewer._tr('ZOOM', 'Zoom');
        const tRotation = viewer._tr('ROTACION', 'Rotación');
        return tImage + ' (' + mimeType + ') \u2022 ' +
            tZoom + ': ' + Math.round(viewer._scale * 100) + '% \u2022 ' +
            tRotation + ': ' + viewer._rotation + '\u00B0';
    },

    onZoomChange(viewer) {
        DocumentViewer._applyImageTransform(viewer);
        viewer._updateInfo(this.getInfoText(viewer));
    },

    onRotateChange(viewer) {
        DocumentViewer._applyImageTransform(viewer);
        viewer._updateInfo(this.getInfoText(viewer));
    }
};

// -----------------------------------------------------------------------------
// Renderer: XML
// -----------------------------------------------------------------------------
_DV_RENDERERS.xml = {
    async render(binary, _bytes, contentEl, viewer) {
        viewer._xmlFastMode = binary.length > _DV_XML_PRETTY_MAX_CHARS;

        // Permite que el estado de carga se pinte antes de procesar XML muy grande.
        if (viewer._xmlFastMode) {
            await DocumentViewer._yieldToUi();
        }

        let text = binary;
        if (!viewer._xmlFastMode) {
            try {
                const doc = new DOMParser().parseFromString(binary, 'text/xml');
                if (!doc.querySelector('parsererror')) {
                    text = DocumentViewer._formatXml(binary);
                }
            } catch (_) { /* mostrar sin formato */ }
        }

        const pre = document.createElement('pre');
        pre.className = viewer._xmlFastMode ? 'dv-text-content dv-text-content--fast' : 'dv-text-content';
        pre.textContent = '';

        contentEl.innerHTML = '';
        contentEl.classList.remove('is-draggable');
        contentEl.appendChild(pre);

        if (viewer._xmlFastMode) {
            DocumentViewer._setupLazyXmlLoad(contentEl, pre, text, viewer, viewer._renderToken);
        } else {
            pre.textContent = text;
        }

        viewer._activeRenderer = this;
        viewer._rawContent = text;
    },

    getToolbarButtons() { return ['dv-copy']; },
    getInfoText(viewer) {
        const tDocument = viewer._tr('DOCUMENTO', 'Documento');
        return 'XML \u2022 ' + tDocument;
    }
};

// -----------------------------------------------------------------------------
// Renderer: JSON
// -----------------------------------------------------------------------------
_DV_RENDERERS.json = {
    render(binary, _bytes, contentEl, viewer) {
        let text;
        try {
            text = JSON.stringify(JSON.parse(binary), null, 2);
        } catch (e) {
            viewer._showError(
                viewer._tr('JSON_INVALIDO', 'JSON inválido: {0}').replace('{0}', e.message)
            );
            return;
        }

        const pre = document.createElement('pre');
        pre.className = 'dv-text-content';
        pre.textContent = text;

        contentEl.innerHTML = '';
        contentEl.classList.remove('is-draggable');
        contentEl.appendChild(pre);

        viewer._activeRenderer = this;
        viewer._rawContent = text;
    },

    getToolbarButtons() { return ['dv-copy']; },
    getInfoText(viewer) {
        const tDocument = viewer._tr('DOCUMENTO', 'Documento');
        return 'JSON \u2022 ' + tDocument;
    }
};

// -----------------------------------------------------------------------------
// Renderer: CSV
// -----------------------------------------------------------------------------
_DV_RENDERERS.csv = {
    render(binary, _bytes, contentEl, viewer) {
        const normalized = binary.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        const lines = normalized.split('\n').filter(Boolean);

        if (lines.length === 0) {
            viewer._showError(viewer._tr('CSV_VACIO_O_SIN_CONTENIDO', 'CSV vacío o sin contenido.'));
            return;
        }

        const sep = DocumentViewer._detectCsvSep(lines) || ',';
        const rows = lines.map(l => DocumentViewer._parseCsvRow(l, sep));

        const table = document.createElement('table');
        table.className = 'dv-table';

        // Cabecera
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        rows[0].forEach(cell => {
            const th = document.createElement('th');
            th.textContent = cell;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Cuerpo
        const tbody = document.createElement('tbody');
        for (let i = 1; i < rows.length; i++) {
            const tr = document.createElement('tr');
            rows[i].forEach(cell => {
                const td = document.createElement('td');
                td.textContent = cell;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);

        const wrapper = document.createElement('div');
        wrapper.className = 'dv-table-wrapper';
        wrapper.appendChild(table);

        contentEl.innerHTML = '';
        contentEl.classList.remove('is-draggable');
        contentEl.appendChild(wrapper);

        viewer._activeRenderer = this;
        viewer._rawContent = binary;
        viewer._csvMeta = { rows: rows.length - 1, cols: rows[0].length };
    },

    getToolbarButtons() { return ['dv-copy']; },

    getInfoText(viewer) {
        const m = viewer._csvMeta || {};
        const r = m.rows || 0;
        const c = m.cols || 0;
        const tRow = viewer._tr('FILA', 'fila');
        const tRows = viewer._tr('FILAS', 'filas');
        const tColumn = viewer._tr('COLUMNA', 'columna');
        const tColumns = viewer._tr('COLUMNAS', 'columnas');
        return 'CSV \u2022 ' + r + ' ' + (r !== 1 ? tRows : tRow) +
            ' \u2022 ' + c + ' ' + (c !== 1 ? tColumns : tColumn);
    }
};

// -----------------------------------------------------------------------------
// Renderer: PDF (requiere pdf.js local en javascript/common/web-component/external/documentviewer/)
// -----------------------------------------------------------------------------
_DV_RENDERERS.pdf = {
    async render(_binary, bytes, contentEl, viewer) {
        const lib = await DocumentViewer._getPdfJsLib();
        if (!lib) {
            viewer._showError(
                viewer._tr('NO_SE_PUDO_CARGAR_MOTOR_PDF', 'No se pudo cargar el motor PDF. ') +
                viewer._tr('VERIFIQUE_ARCHIVOS_PDFJS', 'Verifique que los archivos de pdf.js estén en javascript/common/web-component/external/documentviewer/')
            );
            return;
        }

        _dvSanitizeArrayPrototypeRemove();

        const loadingTask = lib.getDocument({
            data: bytes,
            disableFontFace: false,
            useSystemFonts: true
        });

        viewer._pdfDoc = await loadingTask.promise;
        await viewer._startPdfLazyRender();

        viewer._activeRenderer = this;
    },

    getToolbarButtons() { return ['dv-hand', 'dv-zoom-out', 'dv-zoom-in', 'dv-rotate-left', 'dv-rotate-right']; },

    getInfoText(viewer) {
        const n = viewer._pdfDoc ? viewer._pdfDoc.numPages : 0;
        const tPage = viewer._tr('PAGINA', 'página');
        const tPages = viewer._tr('PAGINAS', 'páginas');
        const tZoom = viewer._tr('ZOOM', 'Zoom');
        const tRotation = viewer._tr('ROTACION', 'Rotación');
        return 'PDF \u2022 ' + n + ' ' + (n !== 1 ? tPages : tPage) +
            ' \u2022 ' + tZoom + ': ' + Math.round(viewer._scale * 100) + '% \u2022 ' +
            tRotation + ': ' + viewer._rotation + '\u00B0';
    },

    async onZoomChange(viewer) {
        await viewer._rerenderPdfWithQueue();
        viewer._updateInfo(this.getInfoText(viewer));
    },

    async onRotateChange(viewer) {
        await viewer._rerenderPdfWithQueue();
        viewer._updateInfo(this.getInfoText(viewer));
    }
};

// -----------------------------------------------------------------------------
// Renderer: tipo desconocido
// -----------------------------------------------------------------------------
_DV_RENDERERS.unknown = {
    render(_binary, _bytes, _contentEl, viewer) {
        viewer._showError(viewer._tr('TIPO_DOCUMENTO_NO_RECONOCIDO_O_NO_SOPORTADO', 'Tipo de documento no reconocido o no soportado'));
    },
    getToolbarButtons() { return []; },
    getInfoText() { return ''; }
};


// =============================================================================
// DOCUMENTVIEWER
// Widget para visualizar documentos codificados en Base64.
//
// Tag:        document-viewer
// Herencia:   WidgetBase
// CSS:        document-viewer.css
//
// Propiedades (JS, NO reflejadas a atributo — ver mas abajo):
//   base64       (String)  - Contenido del documento en Base64. Deliberadamente
//                            NO se refleja como atributo HTML (a diferencia del
//                            resto de propiedades de este componente) para no
//                            dejar el contenido del documento expuesto en el
//                            DOM (herramientas de dev, extensiones, cualquier
//                            XSS ajeno, un posible session-replay/analytics
//                            basado en snapshots del DOM, etc.). Usar siempre
//                            `viewer.base64 = ...`, nunca `setAttribute`.
//
// Atributos:
//   type         (String)  - Tipo forzado: 'pdf'|'image'|'xml'|'json'|'csv'.
//                            Si se omite, se detecta automaticamente.
//   closable     (Boolean) - Muestra el boton de cierre.
//   hide-expand  (Boolean) - Oculta el boton de ampliar (p.ej. si el propio
//                            visor ya vive dentro de otra modal).
//   expanded     (Boolean) - Marca esta instancia como la vista ampliada:
//                            el boton pasa de "ampliar" a "reducir" y cierra
//                            la dynamic-modal contenedora. Lo gestiona el
//                            propio componente al abrir la modal; no se debe
//                            establecer manualmente.
//
// Eventos:
//   viewer-closed  - Se dispara al cerrar el visor. detail: { type }
//
// API estatica:
//   DocumentViewer.registerRenderer(type, renderer) - Registra un renderer.
//
// @fires viewer-closed - Al cerrar el visor. detail: { type }
// =============================================================================

class DocumentViewer extends WidgetBase {

    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });

        /** @private {string} Contenido del documento en Base64. NO se refleja a atributo (ver cabecera del fichero). */
        this._base64 = '';

        /** @private {number} Escala actual de zoom */
        this._scale = 1.0;

        /** @private {number} Rotacion actual en grados (0, 90, 180, 270) */
        this._rotation = 0;

        /** @private {string|null} Tipo de documento activo */
        this._documentType = null;

        /** @private {string|null} Contenido en texto para copiar al portapapeles */
        this._rawContent = null;

        /** @private {Object|null} Renderer activo */
        this._activeRenderer = null;

        /** @private {Object|null} Objeto pdfDoc de pdf.js */
        this._pdfDoc = null;

        /** @private {string|null} URL object del PDF nativo */
        this._pdfObjectUrl = null;

        /** @private {{rows:number, cols:number}|null} Metadatos del CSV activo */
        this._csvMeta = null;

        /** @private {boolean} Modo rápido para XML grandes (sin autoformato) */
        this._xmlFastMode = false;

        /** @private {number} Token para cancelar renders asincronos obsoletos */
        this._renderToken = 0;

        /** @private {boolean} Indica si la estructura del shadow ya fue construida */
        this._initialized = false;

        /** @private {boolean} Arrastrando con el raton */
        this._isDragging = false;

        /** @private {number} */
        this._dragLastX = 0;

        /** @private {number} */
        this._dragLastY = 0;

        /** @private {number|null} Timer del feedback de copiado */
        this._copyTimer = null;

        /** @private {Map<number, {textDivs:Array<HTMLElement>, textContentItemsStr:Array<string>, textLayerDiv:HTMLElement, annotationLayerDiv:HTMLElement}>} */
        this._pdfPageLayers = new Map();

        /** @private {Object|null} Link service minimo para AnnotationLayer */
        this._pdfLinkService = null;

        /** @private {boolean} Evita renders PDF concurrentes */
        this._pdfRenderInProgress = false;

        /** @private {boolean} Marca que hay un rerender PDF pendiente */
        this._pdfRenderQueued = false;

        /** @private {{nextPage:number,totalPages:number,scale:number,rotation:number,loading:boolean,done:boolean,onScroll?:Function}|null} Estado lazy de PDF */
        this._pdfLazyState = null;

        /** @private {number} Generacion para cancelar cargas lazy obsoletas */
        this._pdfLazyGeneration = 0;

        /** @private {boolean} Modo mano para arrastrar PDF */
        this._pdfHandMode = false;

        // Bind de handlers para drag scroll (necesario para poder removerlos)
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onPointerCancel = this._onPointerCancel.bind(this);
        this._onDragStart = (e) => e.preventDefault();
    }

    // =========================================================================
    // WIDGETBASE OVERRIDES
    // =========================================================================

    get componentCssName() {
        return 'document-viewer.css';
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'type', 'closable', 'hide-expand'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue === newValue || !this.isConnected) return;

        if (name === 'closable' || name === 'hide-expand') {
            // Refrescar visibilidad de cierre/ampliar con el estado actual
            if (this._activeRenderer) {
                this._showButtons(this._activeRenderer.getToolbarButtons());
            } else {
                this._showButtons([]);
            }
        } else if (name === 'type') {
            this.loadDocument();
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this._renderShell();
        this.loadDocument();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._copyTimer) {
            clearTimeout(this._copyTimer);
            this._copyTimer = null;
        }
        this._teardownPdfLazyScroll();
        this._revokePdfObjectUrl();
    }

    // =========================================================================
    // GETTERS / SETTERS
    // =========================================================================

    get base64() { return this._base64; }
    set base64(val) {
        this._base64 = val || '';
        // Deliberadamente NO se refleja a atributo (ver cabecera del fichero).
        if (this.isConnected) this.loadDocument();
    }

    get type() { return this.getAttribute('type') || null; }
    set type(val) { val ? this.setAttribute('type', val) : this.removeAttribute('type'); }

    get closable() { return this.hasAttribute('closable'); }
    set closable(val) { val ? this.setAttribute('closable', '') : this.removeAttribute('closable'); }

    get hideExpand() { return this.hasAttribute('hide-expand'); }
    set hideExpand(val) { val ? this.setAttribute('hide-expand', '') : this.removeAttribute('hide-expand'); }

    /** Indica si esta instancia es la vista ampliada (dentro de la dynamic-modal que ella misma abrió). */
    get expanded() { return this.hasAttribute('expanded'); }
    set expanded(val) { val ? this.setAttribute('expanded', '') : this.removeAttribute('expanded'); }

    // =========================================================================
    // API PUBLICA
    // =========================================================================

    /**
     * Registra un renderer personalizado para un tipo de documento.
     * @param {string} type - Clave del tipo (ej: 'txt', 'xlsx').
     * @param {Object} renderer - Objeto con render(), getToolbarButtons(), getInfoText().
     */
    static registerRenderer(type, renderer) {
        _DV_RENDERERS[type] = renderer;
    }

    // =========================================================================
    // CONSTRUCCION DEL SHADOW DOM
    // =========================================================================

    _renderShell() {
        if (this._initialized) return;

        // Viewer principal
        const viewer = document.createElement('div');
        viewer.className = 'dv-viewer';

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'dv-toolbar';
        toolbar.id = 'dv-toolbar';

        // Area de contenido con estado inicial de carga
        const contentEl = document.createElement('div');
        contentEl.className = 'dv-content';
        contentEl.id = 'dv-content';
        contentEl.tabIndex = 0;
        contentEl.appendChild(this._createLoadingNode());

        viewer.appendChild(toolbar);
        viewer.appendChild(contentEl);
        this.shadow.appendChild(viewer);

        this._buildToolbarButtons(toolbar);
        this._setupToolbarEvents();
        this._setupDragScroll(contentEl);

        this._initialized = true;
    }

    _buildToolbarButtons(toolbar) {
        const tHand = this._tr('DESPLAZAR', 'Desplazar');
        const tZoomOut = this._tr('ALEJAR', 'Alejar');
        const tZoomIn = this._tr('ACERCAR', 'Acercar');
        const tRotateLeft = this._tr('ROTAR_A_LA_IZQUIERDA', 'Rotar a la izquierda');
        const tRotateRight = this._tr('ROTAR_A_LA_DERECHA', 'Rotar a la derecha');
        const tCopy = this._tr('COPIAR', 'Copiar');
        const tExpand = this.expanded ? this._tr('REDUCIR', 'Reducir') : this._tr('AMPLIAR', 'Ampliar');
        const tClose = this._tr('CERRAR', 'Cerrar');

        const defs = [
            { id: 'dv-zoom-out', variant: 'secondary', size: 'sm', iconClass: 'alejar', ariaLabel: tZoomOut, tooltip: tZoomOut },
            { id: 'dv-zoom-in', variant: 'secondary', size: 'sm', iconClass: 'acercar', ariaLabel: tZoomIn, tooltip: tZoomIn },
            { id: 'dv-hand', variant: 'secondary', size: 'sm', iconClass: 'desplazar', ariaLabel: tHand, tooltip: tHand },
            { id: 'dv-rotate-left', variant: 'secondary', size: 'sm', iconClass: 'rotar_izquierda', ariaLabel: tRotateLeft, tooltip: tRotateLeft },
            { id: 'dv-rotate-right', variant: 'secondary', size: 'sm', iconClass: 'rotar_derecha', ariaLabel: tRotateRight, tooltip: tRotateRight },
            { id: 'dv-copy', variant: 'secondary', size: 'sm', iconClass: 'copiar', ariaLabel: tCopy, tooltip: tCopy },
            { id: 'dv-expand', variant: 'secondary', size: 'sm', iconClass: this.expanded ? 'reducir' : 'ampliar', ariaLabel: tExpand, tooltip: tExpand },
            { id: 'dv-close', variant: 'danger', size: 'sm', iconClass: 'cerrar', label: tClose },
        ];

        defs.forEach(({ id, variant, size, iconClass, label, ariaLabel, tooltip }) => {
            const btn = document.createElement('wc-button');
            btn.id = id;
            btn.setAttribute('variant', variant);
            btn.setAttribute('size', size);
            if (iconClass) btn.classList.add(iconClass);
            if (label) btn.setAttribute('label', label);
            if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
            if (tooltip) btn.setAttribute('title', tooltip);
            btn.style.display = 'none';
            toolbar.appendChild(btn);
        });

        const info = document.createElement('span');
        info.className = 'dv-toolbar-info';
        info.id = 'dv-info';
        toolbar.appendChild(info);
    }

    _setupToolbarEvents() {
        this.shadow.getElementById('dv-hand').addEventListener('click', () => {
            if (this._documentType !== 'pdf') return;
            this._pdfHandMode = !this._pdfHandMode;
            this._applyPdfInteractionMode();
            this._updatePdfHandButton();
        });

        this.shadow.getElementById('dv-zoom-out').addEventListener('click', () => {
            this._scale = Math.max(_DV_MIN_SCALE, parseFloat((this._scale - 0.2).toFixed(2)));
            this._rerenderZoomable();
        });

        this.shadow.getElementById('dv-zoom-in').addEventListener('click', () => {
            this._scale = Math.min(5.0, parseFloat((this._scale + 0.2).toFixed(2)));
            this._rerenderZoomable();
        });

        this.shadow.getElementById('dv-rotate-left').addEventListener('click', () => {
            this._rotation = (this._rotation + 270) % 360;
            this._rerenderRotatable();
        });

        this.shadow.getElementById('dv-rotate-right').addEventListener('click', () => {
            this._rotation = (this._rotation + 90) % 360;
            this._rerenderRotatable();
        });

        this.shadow.getElementById('dv-copy').addEventListener('click', () => {
            this._copyToClipboard();
        });

        this.shadow.getElementById('dv-expand').addEventListener('click', () => {
            if (this.expanded) {
                const modal = this.closest('dynamic-modal');
                if (modal) modal.close();
                return;
            }
            this._openExpandedModal();
        });

        this.shadow.getElementById('dv-close').addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('viewer-closed', {
                bubbles: true,
                composed: true,
                detail: { type: this._documentType }
            }));
            this.remove();
        });
    }

    // =========================================================================
    // AMPLIAR (modal a tamaño completo)
    // =========================================================================

    /**
     * Abre una copia del documento actual en una dynamic-modal a tamaño
     * completo. Se crea una instancia nueva de document-viewer (en vez de
     * reutilizar esta) porque reubicar un custom element ya conectado dispara
     * disconnectedCallback + connectedCallback, y este ultimo vuelve a llamar
     * a loadDocument() de todos modos.
     */
    async _openExpandedModal() {
        if (!this.base64) return;

        const ok = await DocumentViewer._ensureDynamicModal();
        if (!ok) return;

        const viewer = document.createElement('document-viewer');
        viewer.base64 = this.base64;
        if (this.type) viewer.setAttribute('type', this.type);
        viewer.setAttribute('expanded', '');
        viewer.style.width = '100%';
        viewer.style.height = '100%';

        DynamicModal.create({ size: 'full', content: viewer });
    }

    /**
     * Garantiza que dynamic-modal este definido. document-viewer se carga a
     * veces de forma independiente (sin el bundle components.min.js), asi que
     * si hace falta se importa DynamicModal.js desde el mismo directorio.
     * @returns {Promise<boolean>}
     */
    static async _ensureDynamicModal() {
        if (customElements.get('dynamic-modal')) return true;
        try {
            const scriptUrl = new URL(import.meta.url);
            const dynamicModalUrl = new URL('DynamicModal.js', scriptUrl).href;
            await import(dynamicModalUrl);
        } catch (_e) {
            // se comprueba el resultado a continuacion
        }
        return !!customElements.get('dynamic-modal');
    }

    // =========================================================================
    // CARGA Y DESPACHO DE DOCUMENTOS
    // =========================================================================

    async loadDocument() {
        const renderToken = ++this._renderToken;

        if (!this.base64) {
            this._showLoading();
            return;
        }

        this._showLoading();

        try {
            const binary = atob(this.base64);
            const docType = this.type || DocumentViewer._detectTypeFromBinary(binary);
            this._revokePdfObjectUrl();
            this._documentType = docType;
            this._scale = 1.0;
            this._rotation = 0;
            this._rawContent = null;
            this._csvMeta = null;
            this._xmlFastMode = false;
            this._pdfDoc = null;
            this._pdfRenderInProgress = false;
            this._pdfRenderQueued = false;
            this._pdfLazyState = null;
            this._pdfLazyGeneration++;
            this._teardownPdfLazyScroll();
            this._pdfPageLayers = new Map();
            this._pdfHandMode = false;
            this._activeRenderer = null;

            let bytes = null;
            if (docType === 'pdf' || docType === 'xml' || docType === 'json' || docType === 'csv') {
                bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            }

            let payload = binary;
            if (docType === 'xml' || docType === 'json' || docType === 'csv') {
                payload = DocumentViewer._decodeTextBytes(bytes, docType, binary);
            }

            const renderer = _DV_RENDERERS[docType] || _DV_RENDERERS.unknown;
            const contentEl = this.shadow.getElementById('dv-content');

            // Mostrar toolbar e info cuanto antes para evitar retraso visual
            // en documentos grandes (p.ej. XML de carga progresiva).
            this._showButtons(renderer.getToolbarButtons());
            this._updateInfo(typeof renderer.getInfoText === 'function' ? renderer.getInfoText(this) : '');

            await renderer.render(payload, bytes, contentEl, this);

            if (renderToken !== this._renderToken) return;

            if (this._activeRenderer) {
                this._showButtons(this._activeRenderer.getToolbarButtons());
                this._updateInfo(this._activeRenderer.getInfoText(this));
            }
        } catch (err) {
            // PDF protegido con contraseña (pdf.js): no se puede mostrar sin ella
            if (err && err.name === 'PasswordException') {
                this._showError(this._tr('ARCHIVO_NO_PREVISUALIZABLE'));
                return;
            }

            this._showError(this._tr('ERROR_AL_CARGAR_DOCUMENTO', 'Error al cargar el documento: {0}').replace('{0}', err.message));
        }
    }

    // =========================================================================
    // HELPERS DE ESTADO
    // =========================================================================

    _showLoading() {
        const contentEl = this.shadow.getElementById('dv-content');
        if (!contentEl) return;
        this._showButtons([]);
        this._updateInfo('');
        this._activeRenderer = null;
        contentEl.innerHTML = '';
        contentEl.classList.remove('is-draggable');
        contentEl.classList.remove('is-pdf-text-selectable');
        contentEl.appendChild(this._createLoadingNode());
    }

    _showError(message) {
        const contentEl = this.shadow.getElementById('dv-content');
        if (!contentEl) return;
        const err = document.createElement('div');
        err.className = 'dv-error';
        err.textContent = message;   // textContent: seguro contra XSS
        contentEl.innerHTML = '';
        contentEl.classList.remove('is-draggable');
        contentEl.classList.remove('is-pdf-text-selectable');
        contentEl.appendChild(err);
        this._activeRenderer = null;
        this._showButtons([]);
        this._updateInfo('');
    }

    _revokePdfObjectUrl() {
        if (!this._pdfObjectUrl) return;
        try {
            URL.revokeObjectURL(this._pdfObjectUrl);
        } catch (_) {
            // no-op
        }
        this._pdfObjectUrl = null;
    }

    _createLoadingNode() {
        const node = document.createElement('div');
        node.className = 'dv-loading';
        node.innerHTML = "<div class='dv-loading-spinner'></div><span>" + this._tr('CARGANDO', 'Cargando documento...') + "</span>";
        return node;
    }

    _showButtons(activeIds) {
        const all = ['dv-hand', 'dv-zoom-out', 'dv-zoom-in', 'dv-rotate-left', 'dv-rotate-right', 'dv-copy', 'dv-expand', 'dv-close'];
        const visible = [...activeIds];
        if (activeIds.length > 0 && !this.hideExpand) visible.push('dv-expand');
        if (this.closable) visible.push('dv-close');

        all.forEach(id => {
            const btn = this.shadow.getElementById(id);
            if (btn) btn.style.display = visible.includes(id) ? '' : 'none';
        });

        this._updatePdfHandButton();
    }

    _updateInfo(text) {
        const info = this.shadow.getElementById('dv-info');
        if (info) info.textContent = text;
    }

    _tr(key, fallback) {
        if (typeof window.Traduccion !== 'undefined' && window.Traduccion && window.Traduccion[key]) {
            return window.Traduccion[key];
        }
        return fallback;
    }

    // =========================================================================
    // ZOOM
    // =========================================================================

    _rerenderZoomable() {
        if (!this._activeRenderer || typeof this._activeRenderer.onZoomChange !== 'function') return;
        return this._activeRenderer.onZoomChange(this);
    }

    _rerenderRotatable() {
        if (!this._activeRenderer || typeof this._activeRenderer.onRotateChange !== 'function') return;
        return this._activeRenderer.onRotateChange(this);
    }

    async _rerenderPdfWithQueue() {
        const contentEl = this.shadow.getElementById('dv-content');
        if (!this._pdfDoc || !contentEl) return;

        if (this._pdfRenderInProgress) {
            this._pdfRenderQueued = true;
            return;
        }

        this._pdfRenderInProgress = true;
        try {
            do {
                this._pdfRenderQueued = false;
                await this._startPdfLazyRender();
            } while (this._pdfRenderQueued);
        } finally {
            this._pdfRenderInProgress = false;
        }
    }

    async _startPdfLazyRender() {
        const contentEl = this.shadow.getElementById('dv-content');
        if (!this._pdfDoc || !contentEl) return;

        this._pdfLazyGeneration++;
        const generation = this._pdfLazyGeneration;

        this._teardownPdfLazyScroll();
        contentEl.innerHTML = '';
        this._applyPdfInteractionMode(contentEl);
        this._pdfPageLayers = new Map();

        this._pdfLazyState = {
            nextPage: 1,
            totalPages: this._pdfDoc.numPages,
            scale: this._scale,
            rotation: this._rotation,
            loading: false,
            done: false,
            onScroll: null
        };

        await this._loadNextPdfBatch(_DV_PDF_INITIAL_PAGES, generation);
        this._attachPdfLazyScroll(generation);
    }

    async _loadNextPdfBatch(batchSize, generation) {
        const contentEl = this.shadow.getElementById('dv-content');
        const state = this._pdfLazyState;
        if (!contentEl || !state) return;
        if (state.loading || state.done) return;
        if (generation !== this._pdfLazyGeneration) return;

        state.loading = true;
        try {
            let rendered = 0;
            while (rendered < batchSize && state.nextPage <= state.totalPages) {
                if (generation !== this._pdfLazyGeneration) break;

                await DocumentViewer._renderPdfPage(this._pdfDoc, state.nextPage, contentEl, state.scale, state.rotation, this);
                state.nextPage++;
                rendered++;
            }

            if (state.nextPage > state.totalPages) {
                state.done = true;
                this._teardownPdfLazyScroll();
            }
        } finally {
            if (this._pdfLazyState) this._pdfLazyState.loading = false;
        }
    }

    _attachPdfLazyScroll(generation) {
        const contentEl = this.shadow.getElementById('dv-content');
        const state = this._pdfLazyState;
        if (!contentEl || !state) return;

        const onScroll = () => {
            if (!this._pdfLazyState || generation !== this._pdfLazyGeneration) {
                this._teardownPdfLazyScroll();
                return;
            }

            const nearBottom = (contentEl.scrollTop + contentEl.clientHeight) >= (contentEl.scrollHeight - _DV_PDF_SCROLL_THRESHOLD_PX);
            const nearRight = (contentEl.scrollLeft + contentEl.clientWidth) >= (contentEl.scrollWidth - _DV_PDF_SCROLL_THRESHOLD_PX);

            if (nearBottom || nearRight) {
                this._loadNextPdfBatch(_DV_PDF_PAGES_PER_BATCH, generation);
            }
        };

        state.onScroll = onScroll;
        contentEl.addEventListener('scroll', onScroll, { passive: true });

    }

    _teardownPdfLazyScroll() {
        const contentEl = this.shadow.getElementById('dv-content');
        const state = this._pdfLazyState;
        if (contentEl && state && state.onScroll) {
            contentEl.removeEventListener('scroll', state.onScroll);
        }
        if (state) state.onScroll = null;
    }

    // =========================================================================
    // COPIAR AL PORTAPAPELES
    // =========================================================================

    async _copyToClipboard() {
        if (!this._rawContent) return;

        const btn = this.shadow.getElementById('dv-copy');
        const tCopy = this._tr('COPIAR', 'Copiar');
        const tCopied = this._tr('COPIADO_AL_PORTAPAPELES', 'Copiado al portapapeles');

        const writeWithFallback = async (text) => {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(text);
                return;
            }

            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            if (!ok) throw new Error(this._tr('NO_SE_PUDO_COPIAR_AL_PORTAPAPELES', 'No se pudo copiar al portapapeles.'));
        };

        try {
            await writeWithFallback(this._rawContent);

            if (btn) {
                btn.setAttribute('variant', 'primary');
                btn.setAttribute('title', tCopied);
                if (this._copyTimer) clearTimeout(this._copyTimer);
                this._copyTimer = setTimeout(() => {
                    btn.setAttribute('variant', 'secondary');
                    btn.setAttribute('title', tCopy);
                    this._copyTimer = null;
                }, 1200);
            }
        } catch (_) {
            this._showError(this._tr('NO_SE_PUDO_COPIAR_AL_PORTAPAPELES', 'No se pudo copiar al portapapeles.'));
        }
    }

    // =========================================================================
    // DRAG SCROLL (modo mano)
    // =========================================================================

    _setupDragScroll(contentEl) {
        contentEl.addEventListener('pointerdown', () => {
            if (this._documentType === 'pdf' && typeof contentEl.focus === 'function') {
                contentEl.focus();
            }
        }, { capture: true });

        contentEl.addEventListener('pointerdown', this._onPointerDown);
        contentEl.addEventListener('pointermove', this._onPointerMove);
        contentEl.addEventListener('pointerup', this._onPointerUp);
        contentEl.addEventListener('pointercancel', this._onPointerCancel);
        contentEl.addEventListener('dragstart', this._onDragStart);
    }

    _onPointerDown(e) {
        if (!this._pdfHandMode && e.target && typeof e.target.closest === 'function' && (e.target.closest('.dv-pdf-text-layer') || e.target.closest('.dv-pdf-annotation-layer'))) return;
        if (e.button !== 0) return;
        const contentEl = this.shadow.getElementById('dv-content');
        if (!contentEl || !contentEl.classList.contains('is-draggable')) return;
        this._isDragging = true;
        this._dragLastX = e.clientX;
        this._dragLastY = e.clientY;
        contentEl.classList.add('is-dragging');
        contentEl.setPointerCapture(e.pointerId);
    }

    _onPointerMove(e) {
        if (!this._isDragging) return;
        e.preventDefault();
        const contentEl = this.shadow.getElementById('dv-content');
        const dx = e.clientX - this._dragLastX;
        const dy = e.clientY - this._dragLastY;
        contentEl.scrollLeft -= dx;
        contentEl.scrollTop -= dy;
        this._dragLastX = e.clientX;
        this._dragLastY = e.clientY;
    }

    _onPointerUp(e) {
        this._isDragging = false;
        const contentEl = this.shadow.getElementById('dv-content');
        contentEl.classList.remove('is-dragging');
        if (contentEl.hasPointerCapture(e.pointerId)) {
            contentEl.releasePointerCapture(e.pointerId);
        }
    }

    _onPointerCancel() {
        this._isDragging = false;
        const contentEl = this.shadow.getElementById('dv-content');
        if (contentEl) contentEl.classList.remove('is-dragging');
    }

    _applyPdfInteractionMode(contentEl = null) {
        const el = contentEl || this.shadow.getElementById('dv-content');
        if (!el) return;

        if (this._documentType !== 'pdf') {
            el.classList.remove('is-draggable');
            el.classList.remove('is-pdf-text-selectable');
            el.classList.remove('is-dragging');
            return;
        }

        if (this._pdfHandMode) {
            el.classList.add('is-draggable');
            el.classList.remove('is-pdf-text-selectable');
        } else {
            el.classList.remove('is-draggable');
            el.classList.add('is-pdf-text-selectable');
            el.classList.remove('is-dragging');
        }
    }

    _updatePdfHandButton() {
        const btn = this.shadow.getElementById('dv-hand');
        if (!btn) return;

        const enabled = this._documentType === 'pdf' && this._pdfHandMode;
        btn.setAttribute('variant', enabled ? 'primary' : 'secondary');
        btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }

    async _ensurePdfPageRendered(pageNum) {
        const contentEl = this.shadow.getElementById('dv-content');
        const state = this._pdfLazyState;
        if (!contentEl || !state || !this._pdfDoc) return;

        const exists = this.shadow.querySelector('.dv-page-wrapper[data-page-number="' + pageNum + '"]');
        if (exists) return;

        while (state.nextPage <= pageNum && !state.done) {
            await this._loadNextPdfBatch(_DV_PDF_PAGES_PER_BATCH, this._pdfLazyGeneration);
        }
    }

    _registerPdfPageLayer(pageNum, layerInfo) {
        if (!this._pdfPageLayers) this._pdfPageLayers = new Map();
        this._pdfPageLayers.set(pageNum, layerInfo);
    }

    _getPdfLinkService() {
        if (this._pdfLinkService) return this._pdfLinkService;

        this._pdfLinkService = {
            eventBus: null,

            addLinkAttributes(link, url, newWindow) {
                if (!link) return;
                link.href = url || '';
                link.rel = 'noopener noreferrer nofollow';
                if (newWindow) link.target = '_blank';
            },

            getDestinationHash(dest) {
                if (typeof dest === 'string') return '#' + encodeURIComponent(dest);
                return '#';
            },

            getAnchorUrl(hash) {
                return hash || '#';
            },

            executeNamedAction() {
                // Accion nombrada no implementada en este visor custom.
            },

            setHash() {
                // Parseo de hash opcional para futuras iteraciones.
            },

            goToDestination: async (dest) => {
                try {
                    let pageNum = null;

                    if (typeof dest === 'number') {
                        pageNum = dest + 1;
                    } else if (Array.isArray(dest) && typeof dest[0] === 'number') {
                        pageNum = dest[0] + 1;
                    } else if (typeof dest === 'string' && this._pdfDoc && typeof this._pdfDoc.getDestination === 'function') {
                        const explicitDest = await this._pdfDoc.getDestination(dest);
                        if (Array.isArray(explicitDest) && explicitDest[0] && this._pdfDoc.getPageIndex) {
                            pageNum = (await this._pdfDoc.getPageIndex(explicitDest[0])) + 1;
                        }
                    }

                    if (!pageNum) return;
                    await this._ensurePdfPageRendered(pageNum);
                    const pageEl = this.shadow.querySelector('.dv-page-wrapper[data-page-number="' + pageNum + '"]');
                    if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (_) {
                    // Fallo silencioso en enlaces internos no resolubles.
                }
            }
        };

        return this._pdfLinkService;
    }

    // =========================================================================
    // UTILIDADES ESTATICAS
    // =========================================================================

    /**
     * Detecta el tipo de documento a partir del contenido base64.
     * @param {string} base64
     * @returns {string}
     */
    static _detectType(base64) {
        try {
            const binary = atob(base64);
            return DocumentViewer._detectTypeFromBinary(binary);
        } catch (_) {
            return 'unknown';
        }
    }

    static _detectTypeFromBinary(binary) {
        try {
            if (binary.startsWith('%PDF')) return 'pdf';

            const mime = DocumentViewer._detectImageMimeType(binary);
            if (mime !== 'image/png-fallback') return 'image';

            const head = binary.substring(0, 512).trimStart();
            const headLow = head.toLowerCase();

            if (headLow.startsWith('<svg') ||
                (headLow.startsWith('<?xml') && headLow.includes('<svg'))) return 'image';
            if (headLow.startsWith('<?xml') || headLow.startsWith('<')) return 'xml';
            if (head.startsWith('{') || head.startsWith('[')) return 'json';

            const lines = binary.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
                .trim().split('\n').filter(Boolean);
            if (lines.length >= 2 && DocumentViewer._detectCsvSep(lines) !== null) return 'csv';

            return 'unknown';
        } catch (_) {
            return 'unknown';
        }
    }

    /**
     * Detecta el tipo MIME de una imagen a partir de sus bytes de cabecera.
     * @param {string} binary - String binario (resultado de atob).
     * @returns {string}
     */
    static _detectImageMimeType(binary) {
        const b = (i) => binary.charCodeAt(i);
        const len = binary.length;

        if (len >= 4 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47) return 'image/png';
        if (len >= 3 && b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF) return 'image/jpeg';
        if (len >= 3 && b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return 'image/gif';
        if (len >= 12 &&
            b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
            b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
        if (len >= 2 && b(0) === 0x42 && b(1) === 0x4D) return 'image/bmp';
        if (len >= 4 &&
            ((b(0) === 0x49 && b(1) === 0x49 && b(2) === 0x2A && b(3) === 0x00) ||
                (b(0) === 0x4D && b(1) === 0x4D && b(2) === 0x00 && b(3) === 0x2A))) return 'image/tiff';

        // ISO Base Media File Format: HEIC / HEIF / AVIF
        if (len >= 12 && b(4) === 0x66 && b(5) === 0x74 && b(6) === 0x79 && b(7) === 0x70) {
            const brand = binary.substring(8, 12).toLowerCase();
            if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heif'].includes(brand)) return 'image/heic';
            if (['avif', 'avis'].includes(brand)) return 'image/avif';
        }

        const head = binary.substring(0, 400).trimStart().toLowerCase();
        if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';

        return 'image/png-fallback';
    }

    /**
     * Detecta el separador de un archivo CSV (coma, punto y coma o tabulador).
     * @param {string[]} lines - Lineas del archivo.
     * @returns {string|null}
     */
    static _detectCsvSep(lines) {
        const candidates = [',', ';', '\t'];
        for (const sep of candidates) {
            const re = sep === '\t' ? /\t/g : new RegExp('\\' + sep, 'g');
            const c1 = (lines[0].match(re) || []).length;
            const c2 = (lines[1].match(re) || []).length;
            if (c1 > 0 && c2 > 0 && c1 === c2) return sep;
        }
        return null;
    }

    /**
     * Parsea una fila CSV respetando campos entrecomillados (RFC 4180 basico).
     * @param {string} line - Linea del CSV.
     * @param {string} sep  - Separador detectado.
     * @returns {string[]}
     */
    static _parseCsvRow(line, sep) {
        const cells = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (inQ) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (c === '"') { inQ = false; }
                else { cur += c; }
            } else if (c === '"') {
                inQ = true;
            } else if (c === sep) {
                cells.push(cur.trim());
                cur = '';
            } else {
                cur += c;
            }
        }
        cells.push(cur.trim());
        return cells;
    }

    /**
     * Formatea XML con indentacion.
     * @param {string} xml
     * @returns {string}
     */
    static _formatXml(xml) {
        const reg = /(>)(<)(\/*)/g;
        let formatted = xml.replace(reg, '$1\n$2$3');
        let pad = 0;
        return formatted.split('\n').map(node => {
            let indent;
            if (node.match(/^<\/\w/)) { indent = --pad; }
            else if (node.match(/^<\w[^>]*[\/]>$/)) { indent = pad; }
            else if (node.match(/^<\w[^>]*>(?!<\/\w)/)) { indent = pad++; }
            else { indent = pad; }
            return '  '.repeat(Math.max(0, indent)) + node;
        }).join('\n');
    }

    static _yieldToUi() {
        return new Promise((resolve) => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => resolve());
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    static _decodeTextBytes(bytes, docType, fallbackBinary) {
        if (!bytes || !bytes.length || typeof TextDecoder === 'undefined') return fallbackBinary;

        const candidates = [];

        // BOM detection
        if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
            candidates.push('utf-8');
        } else if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
            candidates.push('utf-16le');
        } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
            candidates.push('utf-16be');
        }

        // XML declaration encoding="..."
        if (docType === 'xml') {
            const probeLen = Math.min(bytes.length, 1024);
            let probe = '';
            for (let i = 0; i < probeLen; i++) probe += String.fromCharCode(bytes[i]);
            const m = probe.match(/<\?xml[^>]*encoding\s*=\s*['\"]([^'\"]+)['\"]/i);
            if (m && m[1]) {
                const enc = DocumentViewer._normalizeEncoding(m[1]);
                if (enc) candidates.push(enc);
            }
        }

        candidates.push('utf-8', 'windows-1252', 'iso-8859-1');

        let bestText = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const enc of candidates) {
            const text = DocumentViewer._tryDecode(bytes, enc);
            if (text == null) continue;
            const score = DocumentViewer._countReplacementChars(text);
            if (score < bestScore) {
                bestScore = score;
                bestText = text;
                if (score === 0) break;
            }
        }

        return bestText == null ? fallbackBinary : bestText;
    }

    static _tryDecode(bytes, encoding) {
        try {
            return new TextDecoder(encoding, { fatal: false }).decode(bytes);
        } catch (_) {
            return null;
        }
    }

    static _countReplacementChars(text) {
        let n = 0;
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 0xFFFD) n++;
        }
        return n;
    }

    static _normalizeEncoding(enc) {
        const e = String(enc || '').trim().toLowerCase();
        if (!e) return '';
        if (e === 'utf8') return 'utf-8';
        if (e === 'utf16') return 'utf-16';
        if (e === 'latin1') return 'iso-8859-1';
        if (e === 'cp1252') return 'windows-1252';
        return e;
    }

    static _setupLazyXmlLoad(contentEl, pre, text, viewer, token) {
        if (!contentEl || !pre) return;

        const lines = text.split(/\r\n|\r|\n/);
        let loaded = 0;
        const total = lines.length;
        const textNode = document.createTextNode('');
        pre.appendChild(textNode);

        const appendBatch = (count) => {
            if (!viewer || token !== viewer._renderToken || !pre.isConnected) return false;
            if (loaded >= total) return false;

            const next = Math.min(loaded + count, total);
            const chunk = lines.slice(loaded, next).join('\n');
            textNode.appendData((loaded > 0 ? '\n' : '') + chunk);
            loaded = next;
            return true;
        };

        appendBatch(_DV_XML_FAST_INITIAL_LINES);

        const onScroll = () => {
            if (!viewer || token !== viewer._renderToken || !contentEl.isConnected) {
                contentEl.removeEventListener('scroll', onScroll);
                return;
            }

            const nearBottom = (contentEl.scrollTop + contentEl.clientHeight) >= (contentEl.scrollHeight - _DV_XML_FAST_SCROLL_THRESHOLD_PX);
            if (!nearBottom) return;

            const hasMore = appendBatch(_DV_XML_FAST_LINES_PER_BATCH);
            if (!hasMore || loaded >= total) {
                contentEl.removeEventListener('scroll', onScroll);
            }
        };

        contentEl.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    static _autoFitImageScale(viewer, img, contentEl) {
        if (!viewer || !img || !contentEl) return;

        const natW = img.naturalWidth || img.width || 0;
        const natH = img.naturalHeight || img.height || 0;
        if (!natW || !natH) return;

        const styles = getComputedStyle(contentEl);
        const px = (v) => parseFloat(v) || 0;
        const innerW = Math.max(0, contentEl.clientWidth - px(styles.paddingLeft) - px(styles.paddingRight));
        const innerH = Math.max(0, contentEl.clientHeight - px(styles.paddingTop) - px(styles.paddingBottom));
        if (!innerW || !innerH) return;

        const fitScale = Math.min(innerW / natW, innerH / natH, 1);
        if (!Number.isFinite(fitScale) || fitScale <= 0) return;

        // Solo reduce escala cuando la imagen no cabe al 100%.
        viewer._scale = Math.max(_DV_MIN_SCALE, fitScale);
    }

    static _applyImageTransform(viewer) {
        const wrapper = viewer.shadow.querySelector('.dv-image-wrapper');
        const img = viewer.shadow.querySelector('.dv-image-wrapper img');
        if (!wrapper || !img) return;

        const natW = img.naturalWidth || img.width || 1;
        const natH = img.naturalHeight || img.height || 1;
        const isQuarterTurn = viewer._rotation % 180 !== 0;
        const boxW = (isQuarterTurn ? natH : natW) * viewer._scale;
        const boxH = (isQuarterTurn ? natW : natH) * viewer._scale;

        wrapper.style.width = Math.max(1, Math.round(boxW)) + 'px';
        wrapper.style.height = Math.max(1, Math.round(boxH)) + 'px';
        img.style.transformOrigin = 'center center';
        img.style.transform = 'translate(-50%, -50%) scale(' + viewer._scale + ') rotate(' + viewer._rotation + 'deg)';
        img.style.position = 'absolute';
        img.style.left = '50%';
        img.style.top = '50%';
    }

    /**
     * Carga pdf.js desde la ruta local (javascript/common/web-component/external/documentviewer/).
     * @returns {Promise<Object|null>}
     */
    static async _getPdfJsLib() {
        if (_dvPdfjsLibCache) return _dvPdfjsLibCache;
        try {
            _dvSanitizeArrayPrototypeRemove();
            const pdfUrl = _DV_PDFJS_BASE + 'pdf.min.js';
            const mod = await import(pdfUrl);
            const lib = mod && mod.default ? mod.default : mod;
            if (!lib) {
                return null;
            }
            if (typeof lib.getDocument !== 'function') {
                return null;
            }
            lib.GlobalWorkerOptions.workerSrc = _DV_PDFJS_BASE + 'pdf.worker.min.js';
            _dvPdfjsLibCache = lib;
            return lib;
        } catch (_e) {
            return null;
        }
    }

    /**
     * Renderiza todas las paginas de un PDF en canvas sobre el contenedor dado.
     * @param {Object} pdfDoc   - Objeto pdfDoc de pdf.js.
     * @param {HTMLElement} el  - Contenedor donde insertar las paginas.
     * @param {number} scale    - Escala de renderizado.
     */
    static async _renderPdfPages(pdfDoc, el, scale, rotation) {
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            await DocumentViewer._renderPdfPage(pdfDoc, pageNum, el, scale, rotation);
        }
    }

    static async _renderPdfPage(pdfDoc, pageNum, el, scale, rotation, viewer = null) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale, rotation });
        const lib = await DocumentViewer._getPdfJsLib();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const outputScale = window.devicePixelRatio || 1;
        const pixelWidth = Math.max(1, Math.round(viewport.width * outputScale));
        const pixelHeight = Math.max(1, Math.round(viewport.height * outputScale));
        const scaleX = pixelWidth / viewport.width;
        const scaleY = pixelHeight / viewport.height;

        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';

        await page.render({
            canvasContext: ctx,
            viewport,
            transform: outputScale !== 1 ? [scaleX, 0, 0, scaleY, 0, 0] : null
        }).promise;

        const wrapper = document.createElement('div');
        wrapper.className = 'dv-page-wrapper';
        wrapper.setAttribute('data-page-number', String(pageNum));
        wrapper.style.width = viewport.width + 'px';
        wrapper.style.height = viewport.height + 'px';
        wrapper.appendChild(canvas);

        const textLayer = document.createElement('div');
        textLayer.className = 'dv-pdf-text-layer textLayer';
        textLayer.style.setProperty('--scale-factor', String(viewport.scale));
        textLayer.style.setProperty('--total-scale-factor', String(viewport.scale));
        wrapper.appendChild(textLayer);

        const annotationLayer = document.createElement('div');
        annotationLayer.className = 'dv-pdf-annotation-layer annotationLayer';
        annotationLayer.style.setProperty('--scale-factor', String(viewport.scale));
        annotationLayer.style.setProperty('--total-scale-factor', String(viewport.scale));
        wrapper.appendChild(annotationLayer);

        const textContentSource = (typeof page.streamTextContent === 'function')
            ? page.streamTextContent({ includeMarkedContent: true })
            : await page.getTextContent();

        let textDivs = [];
        let textContentItemsStr = [];

        if (lib && typeof lib.TextLayer === 'function') {
            const textLayerBuilder = new lib.TextLayer({
                textContentSource,
                container: textLayer,
                viewport
            });
            await textLayerBuilder.render();
            textDivs = textLayerBuilder.textDivs || [];
            textContentItemsStr = textLayerBuilder.textContentItemsStr || [];
        } else if (lib && typeof lib.renderTextLayer === 'function') {
            const task = lib.renderTextLayer({
                textContentSource,
                container: textLayer,
                viewport
            });
            if (task && task.promise) await task.promise;
            textDivs = (task && task.textDivs) ? task.textDivs : [];
            textContentItemsStr = (task && task.textContentItemsStr) ? task.textContentItemsStr : [];
        }

        try {
            const annotations = await page.getAnnotations({ intent: 'display' });
            if (lib && typeof lib.AnnotationLayer === 'function') {
                const annotationViewport = (viewport && typeof viewport.clone === 'function')
                    ? viewport.clone({ dontFlip: true })
                    : viewport;

                const annotationLayerBuilder = new lib.AnnotationLayer({
                    div: annotationLayer,
                    page,
                    viewport: annotationViewport
                });

                await annotationLayerBuilder.render({
                    annotations,
                    imageResourcesPath: '',
                    renderForms: true,
                    linkService: viewer ? viewer._getPdfLinkService() : null,
                    annotationStorage: pdfDoc && pdfDoc.annotationStorage ? pdfDoc.annotationStorage : null,
                    enableScripting: false,
                    hasJSActions: false,
                    fieldObjects: null,
                    downloadManager: null
                });
            }
        } catch (_) {
            // Las anotaciones son complementarias; no deben bloquear el render.
        }

        if (viewer && typeof viewer._registerPdfPageLayer === 'function') {
            viewer._registerPdfPageLayer(pageNum, {
                textDivs,
                textContentItemsStr,
                textLayerDiv: textLayer,
                annotationLayerDiv: annotationLayer
            });

        }

        el.appendChild(wrapper);
    }
}

if (!customElements.get('document-viewer')) customElements.define('document-viewer', DocumentViewer);