// ===========================================================================
// ContextMenu - Menu contextual reutilizable (boton derecho)
// ===========================================================================
// Widget que muestra un menu flotante en unas coordenadas (habitualmente las
// del evento "contextmenu") con items simples o con submenu (children[]).
//
// COMPARTE COMPORTAMIENTO Y ESQUEMA CON EL MENU DE <button-bar>:
//   - Panel unico promovido al TOP LAYER via la API nativa Popover (manual).
//   - Submenus en el mismo panel con navegacion in-place y miga de pan
//     (boton "volver"), no en paneles laterales.
//   - Los items son wc-button en variant ghost dentro de filas
//     .wcbb-popover-row, con el mismo look/UX que el popover de ButtonBar.
//   - Mismo esquema de item (children, callback, url, disabled, separator,
//     icon, variant...), de forma que un ContextMenu pueda integrarse en el
//     futuro como uno de los menus de un ButtonBar.
//
// API:
//   // Helper rapido: abre, espera la seleccion y devuelve el id elegido
//   const accion = await ContextMenu.openAt(x, y, [
//       { id: 'editar', label: 'Editar' },
//       { id: 'borrar', label: 'Eliminar', variant: 'danger', divider: true }
//   ]);
//
//   // Instanciado (reutilizable)
//   const menu = ContextMenu.create({ items: misItems });
//   menu.openAt(x, y);
//   menu.close();
//
// Item: { id, label, icon, iconClass, iconBackground, variant, disabled, divider,
//         separator, title, tooltip, url, callback, children[] }
//   - iconClass: clase del catalogo de acciones (icon-catalog.css) -> icono en
//     modo mascara (hereda el color del item). Recomendado.
//   - icon: SVG/emojis/clase CSS propia del icono.
//   - iconBackground: sprite antiguo del ERP (se usa como mascara, deprecado).
//   - variant: 'danger' se traduce a 'ghost-danger' (texto rojo sobre la fila).
//   - divider / separator: linea separadora antes del item.
// Eventos: 'context-menu-select' (detail.item / detail.id / detail.level) y
//          'context-menu-close'  (detail.reason)
// ===========================================================================

const _CM_ICONS = {
    back:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevron: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg>`
};

class ContextMenu extends WidgetBase {

    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });

        /** @private @type {Array<Object>} Items del menu */
        this._items = [];

        /** @private @type {Object} Opciones de comportamiento */
        this._options = {
            minWidth: 180,
            maxWidth: 320,
            bodyTarget: 'local',
            closeOnScroll: true,
            closeOnEscape: true,
            closeOnClickOutside: true,
            destroyOnClose: false
        };

        /** @private @type {boolean} */
        this._isOpen = false;

        /** @private @type {Function|null} Resolver del Promise del helper estatico openAt */
        this._resolver = null;

        /** @private @type {{x:number, y:number}|null} Ultimas coordenadas (para recolocar al cargar el CSS) */
        this._openCoords = null;

        /** @private @type {boolean} Soporte de la API nativa Popover (top layer) */
        this._hasPopoverApi = false;

        /** @private @type {Object} Referencias del shadow DOM */
        this._els = {};

        /** @private @type {{items:Array, trail:Array<string>, parentBack:Object|null}|null}
         *  Nivel de submenu abierto (navegacion in-place con miga de pan, igual que ButtonBar). */
        this._nav = null;

        /** @private @type {number} Indice del item enfocado en el nivel actual */
        this._focusIndex = 0;

        this._onDocumentClick = this._onDocumentClick.bind(this);
        this._onScrollResize = this._onScrollResize.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
    }

    get componentCssName() {
        return 'context-menu.css';
    }

    static get observedAttributes() {
        return [...super.observedAttributes];
    }

    connectedCallback() {
        super.connectedCallback();
        this._ensureStructure();
    }

    disconnectedCallback() {
        this.close('disconnect');
    }

    /**
     * Reposiciona el menu cuando acaba de cargar el CSS (antes de cargarlo no
     * se puede medir bien porque todavia no tiene position: fixed).
     */
    onStylesLoaded() {
        if (this._isOpen && this._openCoords) {
            this._position();
        }
    }

    // =========================================================================
    // PROPIEDADES
    // =========================================================================

    get items() { return this._items; }
    set items(val) {
        this._items = Array.isArray(val) ? val : [];
        if (this._isOpen) { this._renderCurrent(); this._reposition(); }
    }

    get minWidth() { return this._options.minWidth; }
    set minWidth(val) { this._options.minWidth = val; this._applySizing(); }

    get maxWidth() { return this._options.maxWidth; }
    set maxWidth(val) { this._options.maxWidth = val; this._applySizing(); }

    get bodyTarget() { return this._options.bodyTarget; }
    set bodyTarget(val) { this._options.bodyTarget = (val === 'top') ? 'top' : 'local'; }

    get closeOnScroll() { return this._options.closeOnScroll; }
    set closeOnScroll(val) { this._options.closeOnScroll = val !== false; }

    get closeOnEscape() { return this._options.closeOnEscape; }
    set closeOnEscape(val) { this._options.closeOnEscape = val !== false; }

    get closeOnClickOutside() { return this._options.closeOnClickOutside; }
    set closeOnClickOutside(val) { this._options.closeOnClickOutside = val !== false; }

    get destroyOnClose() { return this._options.destroyOnClose; }
    set destroyOnClose(val) { this._options.destroyOnClose = val === true; }

    get isOpen() { return this._isOpen; }

    /**
     * Aplica una configuracion al menu (items, anchos, comportamiento...).
     * @param {Object} config
     * @returns {ContextMenu}
     */
    configure(config) {
        if (!config) { return this; }

        if (config.items != null) { this.items = config.items; }
        if (config.minWidth != null) { this.minWidth = config.minWidth; }
        if (config.maxWidth != null) { this.maxWidth = config.maxWidth; }
        if (config.bodyTarget != null) { this.bodyTarget = config.bodyTarget; }
        if (config.closeOnScroll != null) { this.closeOnScroll = config.closeOnScroll; }
        if (config.closeOnEscape != null) { this.closeOnEscape = config.closeOnEscape; }
        if (config.closeOnClickOutside != null) { this.closeOnClickOutside = config.closeOnClickOutside; }
        if (config.destroyOnClose != null) { this.destroyOnClose = config.destroyOnClose; }

        return this;
    }

    // =========================================================================
    // API PUBLICA
    // =========================================================================

    /**
     * Abre el menu en las coordenadas indicadas (relativas a la ventana).
     * @param {number} x
     * @param {number} y
     * @returns {ContextMenu}
     */
    openAt(x, y) {
        this._mount();
        this._ensureStructure();

        this._isOpen = true;
        this._openCoords = { x: x, y: y };
        this._nav = null;
        this._focusIndex = 0;

        this._renderCurrent();
        this._applySizing();
        this._showPopoverEl();

        const popover = this._els.popover;
        popover.style.visibility = 'hidden';
        requestAnimationFrame(() => {
            if (!this._isOpen) { return; }
            this._position();
            popover.style.visibility = '';
        });

        this._addListeners();
        this._focusRow(0);

        return this;
    }

    /**
     * Cierra el menu y todos los submenus abiertos.
     * @param {string} reason
     */
    close(reason = 'close') {
        if (!this._isOpen) { return; }

        this._isOpen = false;
        this._openCoords = null;
        this._nav = null;
        this._removeListeners();

        const popover = this._els.popover;
        if (popover) {
            this._hidePopoverEl();
            popover.innerHTML = '';
        }

        this.dispatchEvent(new CustomEvent('context-menu-close', {
            detail: { reason: reason },
            bubbles: true,
            composed: true
        }));

        if (ContextMenu._activeMenu === this) { ContextMenu._activeMenu = null; }

        const resolve = this._resolver;
        this._resolver = null;

        if (this._options.destroyOnClose) { this.remove(); }

        if (resolve) { resolve(null); }
    }

    /**
     * Crea un menu contextual (no lo abre).
     * @param {Object} config
     * @returns {ContextMenu}
     */
    static create(config) {
        const menu = document.createElement('context-menu');
        menu.configure(config || {});
        return menu;
    }

    /**
     * Helper: crea, abre y devuelve un Promise que resuelve con el id del item
     * elegido (o null si se ha cerrado sin elegir).
     * @param {number} x
     * @param {number} y
     * @param {Array<Object>} items
     * @param {Object} [config]
     * @returns {Promise<any>}
     */
    static openAt(x, y, items, config) {
        // Cierra el menu abierto por el helper estatico antes de abrir el nuevo.
        if (ContextMenu._activeMenu) {
            try { ContextMenu._activeMenu.close("reopen"); } catch (e) { /* noop */ }
        }

        const menu = ContextMenu.create(Object.assign({}, config || {}, {
            items: items,
            destroyOnClose: true
        }));

        ContextMenu._activeMenu = menu;

        return new Promise(resolve => {
            menu._resolver = resolve;
            menu.openAt(x, y);
        });
    }

    // =========================================================================
    // ESTRUCTURA SHADOW DOM
    // =========================================================================

    /**
     * Crea el panel popover (una sola vez) y lo promueve al top layer.
     * El panel es position:fixed (ver context-menu.css) y se reutiliza para
     * todos los niveles (navegacion in-place, como ButtonBar).
     * @private
     */
    _ensureStructure() {
        if (this._els.popover) { return; }

        const popover = document.createElement('div');
        popover.className = 'wcbb-popover';
        popover.setAttribute('role', 'menu');
        popover.setAttribute('tabindex', '-1');

        this._hasPopoverApi = typeof popover.showPopover === 'function';
        if (this._hasPopoverApi) {
            popover.setAttribute('popover', 'manual');
        } else {
            popover.style.display = 'none';
        }

        this.shadow.appendChild(popover);
        this._els = { popover: popover };
    }

    /**
     * Muestra el popover. Con soporte de la API nativa lo promueve al top layer
     * (por encima de cualquier contexto de apilamiento); si no, usa position:fixed.
     * @private
     */
    _showPopoverEl() {
        const popover = this._els.popover;
        if (!popover) { return; }
        if (this._hasPopoverApi) {
            if (this.isConnected && !popover.matches(':popover-open')) { popover.showPopover(); }
        } else {
            popover.style.display = '';
        }
    }

    /**
     * Oculta el popover (contrapartida de _showPopoverEl).
     * @private
     */
    _hidePopoverEl() {
        const popover = this._els.popover;
        if (!popover) { return; }
        if (this._hasPopoverApi) {
            if (popover.matches(':popover-open')) { popover.hidePopover(); }
        } else {
            popover.style.display = 'none';
        }
    }

    /**
     * Aplica los anchos configurables al panel.
     * @private
     */
    _applySizing() {
        const popover = this._els.popover;
        if (!popover) { return; }
        popover.style.minWidth = this._options.minWidth + 'px';
        popover.style.maxWidth = this._options.maxWidth + 'px';
    }

    // =========================================================================
    // RENDER DEL MENU (mismo patron que ButtonBar._renderPopoverContent)
    // =========================================================================

    /**
     * Rellena el panel con el nivel actual. Si hay submenu abierto, muestra
     * primero el boton "volver" con la miga de pan.
     * @private
     */
    _renderCurrent() {
        const popover = this._els.popover;
        if (!popover) { return; }

        popover.innerHTML = '';

        if (this._nav) {
            this._renderBackRow(this._nav);
            const sep = document.createElement('div');
            sep.className = 'wcbb-popover-sep';
            popover.appendChild(sep);
        }

        const items = this._nav ? this._nav.items : this._items;
        let hasPrev = this._nav != null;

        (items || []).forEach(config => {
            if (!config || config.hidden || config.visible === false) { return; }

            if ((config.divider || config.separator) && hasPrev) {
                const sep = document.createElement('div');
                sep.className = 'wcbb-popover-sep';
                popover.appendChild(sep);
            }

            popover.appendChild(this._createItemRow(config));
            hasPrev = true;
        });
    }

    /**
     * Crea la fila "volver" con la miga de pan (misma estructura que ButtonBar).
     * @private
     */
    _renderBackRow(back) {
        const row = document.createElement('div');
        row.className = 'wcbb-popover-row wcbb-popover-back';
        row.setAttribute('role', 'menuitem');

        const backBtn = document.createElement('wc-button');
        backBtn.configure({
            variant: 'ghost',
            fullWidth: true,
            labelAlign: 'left',
            icon: _CM_ICONS.back,
            label: back.trail.filter(Boolean).join(' › ') || 'Volver'
        });

        row._cmActivate = () => this._goBack();
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            this._goBack();
        });

        row.appendChild(backBtn);
        this._els.popover.appendChild(row);
    }

    /**
     * Crea la fila de un item (wc-button ghost + chevron, como ButtonBar).
     * @private
     * @param {Object} config
     * @returns {HTMLElement}
     */
    _createItemRow(config) {
        const hasChildren = Array.isArray(config.children) && config.children.length > 0;

        const row = document.createElement('div');
        row.className = 'wcbb-popover-row';
        if (config.disabled) { row.classList.add('is-disabled'); }
        row.setAttribute('role', 'menuitem');
        if (config.disabled) { row.setAttribute('aria-disabled', 'true'); }
        if (config.title) { row.setAttribute('title', config.title); }

        const btn = document.createElement('wc-button');

        // Partimos de la config del item (compatible wc-button) menos las claves
        // propias del menu, y sobreescribimos solo el aspecto de item de lista.
        const {
            children, callback, url, id, visible, hidden, divider, separator, dropdown,
            danger, iconClass, iconBackground, iconPosition, iconPositionHover,
            tooltip, title, label, variant, disabled, textOut, class: _cls, ...btnAttrs
        } = config;

        const hasMaskIcon = !!(iconClass || iconBackground);
        const hasIcon = !!(config.icon || hasMaskIcon);

        const btnCfg = {
            ...btnAttrs,
            variant: this._mapVariant(config),
            label: label || tooltip || title || '',
            labelAlign: hasChildren ? 'spread' : 'left',
            tooltip: '',
            title: '',
            textOut: textOut || false,
            disabled: !!disabled
        };

        // Chevron: si no tiene icono propio, va dentro del boton a la derecha;
        // si ya tiene icono (incluida mascara por clase), chevron externo.
        if (hasChildren && !hasIcon) {
            btnCfg.icon = _CM_ICONS.chevron;
            btnCfg.iconPos = 'right';
        }

        btn.configure(btnCfg);

        if (hasMaskIcon) {
            // Modo mascara: la clase del catalogo activa wcb-has-mask en el boton.
            if (iconClass) { btn.setAttribute('class', String(iconClass)); }
            if (iconBackground) {
                btn.setAttribute('class', ((iconClass ? iconClass + ' ' : '') + 'cm-ibg').trim());
                btn.style.setProperty('--wci-icon-url', iconBackground);
            }
        } else if (hasChildren) {
            const chv = document.createElement('span');
            chv.className = 'wcbb-popover-chevron';
            chv.innerHTML = _CM_ICONS.chevron;
            chv.setAttribute('aria-hidden', 'true');
            row.appendChild(chv);
        }

        row._cmConfig = config;
        row._cmActivate = () => this._activate(config, hasChildren);

        if (!config.disabled) {
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                this._activate(config, hasChildren);
            });
        }

        row.insertBefore(btn, row.firstChild);
        return row;
    }

    /**
     * Traduce la variante del item al aspecto de fila de menu.
     * 'danger' -> 'ghost-danger' (texto rojo, fondo transparente).
     * @private
     */
    _mapVariant(config) {
        if (config.variant === 'danger' || config.danger === true) { return 'ghost-danger'; }
        return config.variant || 'ghost';
    }

    // =========================================================================
    // NAVEGACION (in-place con miga de pan, igual que ButtonBar)
    // =========================================================================

    /**
     * Abre el submenu de un item en el mismo panel.
     * @private
     */
    _openChildren(config) {
        const label = config.label || config.tooltip || config.title || '';
        const trail = this._nav ? [...this._nav.trail, label] : [label];
        this._nav = { items: config.children, trail: trail, parentBack: this._nav };

        this._renderCurrent();
        this._reposition();
        this._focusRow(0);
    }

    /**
     * Vuelve al nivel anterior (o al menu raiz).
     * @private
     */
    _goBack() {
        if (!this._nav) { return; }
        this._nav = this._nav.parentBack || null;

        this._renderCurrent();
        this._reposition();
        this._focusRow(0);
    }

    /**
     * Ejecuta la accion de un item (o abre su submenu si es un item padre).
     * @private
     */
    _activate(config, hasChildren) {
        if (config.disabled) { return; }

        if (hasChildren) { this._openChildren(config); return; }

        const resolve = this._resolver;
        this._resolver = null;

        const level = this._nav ? this._nav.trail.length : 0;

        this.dispatchEvent(new CustomEvent('context-menu-select', {
            detail: { id: config.id, item: config, level: level },
            bubbles: true,
            composed: true
        }));

        this.safeExecute(config.callback, config);

        if (config.url) {
            const win = (this._callerContext && !this._callerContext.closed)
                ? this._callerContext
                : (this.ownerDocument.defaultView || window);
            win.location.href = config.url;
        }

        this.close('select');

        if (resolve) { resolve((config.id !== undefined) ? config.id : config); }
    }

    // =========================================================================
    // POSICIONAMIENTO
    // =========================================================================

    /**
     * Coloca el panel en las coordenadas de apertura, volteando si no cabe.
     * @private
     */
    _position() {
        const popover = this._els.popover;
        if (!popover || !this._openCoords) { return; }

        const win = this.ownerDocument.defaultView || window;
        const MARGIN = 8;
        const x = this._openCoords.x;
        const y = this._openCoords.y;

        popover.style.left = '0px';
        popover.style.top = '0px';

        const w = popover.offsetWidth;
        const h = popover.offsetHeight;

        let left = x;
        let top = y;

        if (left + w > win.innerWidth - MARGIN) { left = x - w; }
        if (top + h > win.innerHeight - MARGIN) { top = y - h; }
        if (left < MARGIN) { left = MARGIN; }
        if (top < MARGIN) { top = MARGIN; }

        popover.style.left = left + 'px';
        popover.style.top = top + 'px';
    }

    /**
     * Recoloca el panel tras un cambio de nivel (mide ya el contenido nuevo).
     * @private
     */
    _reposition() {
        if (!this._openCoords) { return; }
        requestAnimationFrame(() => {
            if (this._isOpen) { this._position(); }
        });
    }

    // =========================================================================
    // MONTAJE Y LISTENERS
    // =========================================================================

    /** @private */
    _mount() {
        const target = this._resolveContainer();
        if (this.parentNode !== target) { target.appendChild(this); }
    }

    /** @private */
    _resolveContainer() {
        if (this._options.bodyTarget === 'top') {
            try {
                if (window.top && window.top.document && window.top.document.body) {
                    return window.top.document.body;
                }
            } catch (e) { /* cross-origin */ }
        }
        return document.body;
    }

    /** @private */
    _addListeners() {
        if (this._listenersAdded) { return; }
        this._listenersAdded = true;

        const doc = this.ownerDocument || document;
        const win = doc.defaultView || window;

        // El click de cierre se registra en el siguiente tick para no capturar
        // el mismo click que abrio el menu.
        setTimeout(() => {
            if (this._isOpen && this.isConnected) {
                doc.addEventListener('click', this._onDocumentClick, true);
            }
        }, 0);
        doc.addEventListener('keydown', this._onKeyDown, true);

        if (this._options.closeOnScroll) {
            win.addEventListener('scroll', this._onScrollResize, true);
            win.addEventListener('resize', this._onScrollResize);
        }
    }

    /** @private */
    _removeListeners() {
        if (!this._listenersAdded) { return; }
        this._listenersAdded = false;

        const doc = this.ownerDocument || document;
        const win = doc.defaultView || window;

        doc.removeEventListener('click', this._onDocumentClick, true);
        doc.removeEventListener('keydown', this._onKeyDown, true);

        win.removeEventListener('scroll', this._onScrollResize, true);
        win.removeEventListener('resize', this._onScrollResize);
    }

    /**
     * Cierra el menu si el click ha sido fuera del componente.
     * @private
     */
    _onDocumentClick(e) {
        if (!this._options.closeOnClickOutside) { return; }
        if (e.composedPath && e.composedPath().includes(this)) { return; }
        this.close('outside');
    }

    /**
     * Cierra el menu al hacer scroll (fuera del propio menu) o al redimensionar.
     * @private
     */
    _onScrollResize(e) {
        if (e && e.type === 'scroll' && e.composedPath) {
            if (e.composedPath().includes(this)) { return; }
        }
        this.close('scroll');
    }

    /**
     * Navegacion por teclado dentro del nivel abierto.
     * @private
     */
    _onKeyDown(e) {
        if (!this._isOpen) { return; }

        const key = e.key;

        if (key === 'Escape' && this._options.closeOnEscape) {
            if (this._nav) { this._goBack(); } else { this.close('escape'); }
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        const rows = this._getFocusableRows();
        if (rows.length === 0) { return; }

        let idx = (typeof this._focusIndex === 'number') ? this._focusIndex : 0;
        if (idx < 0 || idx >= rows.length) { idx = 0; }

        if (key === 'ArrowDown') {
            idx = (idx + 1) % rows.length;
        } else if (key === 'ArrowUp') {
            idx = (idx - 1 + rows.length) % rows.length;
        } else if (key === 'Home') {
            idx = 0;
        } else if (key === 'End') {
            idx = rows.length - 1;
        } else if (key === 'Enter' || key === ' ') {
            const row = rows[idx];
            if (row && row._cmActivate) { row._cmActivate(); }
            e.preventDefault();
            e.stopPropagation();
            return;
        } else if (key === 'ArrowRight') {
            const row = rows[idx];
            if (row && row._cmConfig && Array.isArray(row._cmConfig.children) && row._cmConfig.children.length > 0) {
                this._openChildren(row._cmConfig);
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        } else if (key === 'ArrowLeft') {
            if (this._nav) { this._goBack(); e.preventDefault(); e.stopPropagation(); }
            return;
        } else {
            return;
        }

        this._focusRow(idx);
        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * Filas enfocables del nivel actual (incluye la fila "volver").
     * @private
     */
    _getFocusableRows() {
        const popover = this._els.popover;
        if (!popover) { return []; }
        return Array.prototype.slice.call(popover.querySelectorAll('.wcbb-popover-row:not(.is-disabled)'));
    }

    /**
     * Pone el foco en el boton interno del wc-button de una fila.
     * @private
     */
    _focusRow(idx) {
        const rows = this._getFocusableRows();
        const row = rows[idx];
        if (!row) { return; }

        const inner = row.querySelector('.wcb-btn') || row.querySelector('wc-button');
        if (inner) { inner.focus({ preventScroll: true }); }
        this._focusIndex = idx;
    }
}

if (!customElements.get('context-menu')) { customElements.define('context-menu', ContextMenu); }
window.ContextMenu = ContextMenu;
