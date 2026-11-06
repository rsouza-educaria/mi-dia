class RightSidebar extends WidgetBase {
    constructor() {
        super();
        // Creamos el Shadow DOM en modo 'open' para permitir acceso externo si es necesario
        this.shadow = this.attachShadow({ mode: 'open' });

        /** @type {Array<Object>} Pila de historial (Snapshots del DOM) */
        this.historyStack = [];

        /** @type {Object} Callbacks activos de la vista actual */
        this.currentCallbacks = {};

        /** @type {boolean} Estado de apertura del panel */
        this._isOpen = false;

        // Propiedades internas para el fix de navegación y estilos

        /** @type {boolean} Si es false, expandir/contraer no se guarda en localStorage (ver setExpandPreference) */
        this._persistExpanded = true;

        /** @type {boolean} Estado de expansión (ancho) del panel */
        this._isExpanded = localStorage.getItem('rs_expanded') === 'true';

        /** @type {HTMLElement|string|null} Elemento o selector al que anclarse por la derecha */
        this._anchor = null;

        /** @type {Function|null} Handler de resize activo cuando el panel está abierto con anchor */
        this._resizeHandler = null;

        /** @type {HTMLElement|null} Elemento con foco antes de abrir, para restaurarlo al cerrar (accesibilidad) */
        this._previousFocus = null;

        /** @type {boolean} Flag para que _setupEventListeners sea idempotente (moves en DOM) */
        this._listenersAttached = false;

        this._currentHeaderConfig = null;
        this._currentActionsConfig = null;
        this._currentFooterConfig = null;
        this._currentExtraCss = [];

        this.resources = {
            icons: {
                panelExpand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="4" x2="21" y2="20"></line><line x1="16" y1="12" x2="3" y2="12"></line><polyline points="10 19 3 12 10 5"></polyline></svg>`,
                panelCollapse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="4" x2="21" y2="20"></line><line x1="3" y1="12" x2="16" y2="12"></line><polyline points="9 5 16 12 9 19"></polyline></svg>`
            }
        };
    }

    get componentCssName() {
        return 'right-sidebar.css';
    }

    get isOpen() { return this._isOpen; }

    /**
     * Desplazamiento fijo en px desde el borde derecho de la pantalla.
     * Útil cuando hay un elemento fijo (botonera, sidebar) pegado a la derecha.
     * @returns {number}
     */
    get offsetRight() {
        const val = parseInt(this.getAttribute('offset-right'), 10);
        return isNaN(val) ? 0 : val;
    }
    set offsetRight(v) {
        v ? this.setAttribute('offset-right', String(v)) : this.removeAttribute('offset-right');
    }

    /**
     * Elemento o selector CSS al que anclarse por la derecha.
     * El panel se abre hasta el borde izquierdo de ese elemento.
     * Si el elemento no existe al abrir, se ignora silenciosamente (fallback: offset-right o right: 0).
     * @type {HTMLElement|string|null}
     */
    get anchor() { return this._anchor; }
    set anchor(v) { this._anchor = v; }

    /**
     * Cuando está presente, muestra un overlay semitransparente a la izquierda del panel
     * mientras está abierto. Click en el backdrop no cierra el panel.
     * @type {boolean}
     */
    get backdrop() { return this.hasAttribute('backdrop'); }
    set backdrop(v) { v ? this.setAttribute('backdrop', '') : this.removeAttribute('backdrop'); }

    /**
     * Ciclo de vida: Se ejecuta cuando el elemento se inserta en el DOM.
     * Inicializa estructura, eventos y estilos.
     */
    connectedCallback() {
        super.connectedCallback();

        this._renderBaseStructure();
        this._setupEventListeners();
    }

    /**
     * Ciclo de vida: limpieza de listeners globales al salir del DOM.
     * Si el panel se elimina estando abierto, el listener de resize
     * registrado en window quedaria vivo (memory leak).
     */
    disconnectedCallback() {
        this._stopResizeTracking();
        if (super.disconnectedCallback) super.disconnectedCallback();
    }

    // =========================================================================
    // API PÚBLICA: VISIBILIDAD
    // =========================================================================

    /**
     * Despliega el panel lateral aplicando la clase CSS de animación.
     * Si ya está abierto, no hace nada.
     * @fires sidebar-opened
     */
    open() {
        if (this._isOpen) return;
        this._isOpen = true;

        // Accesibilidad: guardar el elemento con foco para restaurarlo al cerrar
        this._previousFocus = this._getDeepActiveElement(this.ownerDocument || document);

        const sidebar = this.shadow.querySelector('.sidebar');
        const backdrop = this.shadow.querySelector('.backdrop');
        const offset = this._resolveRightOffset();
        if (sidebar) sidebar.style.right = offset ? `${offset}px` : '';
        if (backdrop) backdrop.style.right = offset ? `${offset}px` : '';
        sidebar?.classList.add('open');
        backdrop?.classList.add('open');

        if (this._anchor) this._startResizeTracking();

        // Accesibilidad: mover el foco al panel una vez visible
        requestAnimationFrame(() => {
            if (!this._isOpen) return;
            this._focusFirstElement();
        });

        this.dispatchEvent(new CustomEvent('sidebar-opened', { bubbles: true, composed: true }));
    }

    /**
     * Cierra el panel lateral.
     * @fires sidebar-closed
     */
    close() {
        if (!this._isOpen) return;
        this._isOpen = false;

        const sidebar = this.shadow.querySelector('.sidebar');
        if (sidebar) {
            sidebar.style.right = '';
            sidebar.classList.remove('open');
        }
        const backdrop = this.shadow.querySelector('.backdrop');
        if (backdrop) {
            backdrop.style.right = '';
            backdrop.classList.remove('open');
        }

        this._stopResizeTracking();

        // Accesibilidad: devolver el foco al elemento que abrio el panel
        if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
            try {
                this._previousFocus.focus();
            } catch (e) {
                // El elemento pudo eliminarse del DOM mientras el panel estaba abierto
            }
        }
        this._previousFocus = null;

        this.dispatchEvent(new CustomEvent('sidebar-closed', { bubbles: true, composed: true }));
    }

    // =========================================================================
    // ACCESIBILIDAD: GESTION DEL FOCO
    // =========================================================================

    /**
     * Mueve el foco al primer elemento interactivo del panel (contenido proyectado
     * o, en su defecto, el boton cerrar del header).
     * @private
     */
    _focusFirstElement() {
        const selector = 'a[href], button:not([disabled]), input:not([disabled]), ' +
            'textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), ' +
            'wc-input, wc-select, wc-textarea, wc-checkbox, wc-radio-group, ' +
            'wc-datepicker, wc-range, wc-rich-text, wc-image, wc-button';

        // 1. Contenido proyectado (light DOM)
        const slotted = this.querySelector(selector);
        if (slotted) { slotted.focus(); return; }

        // 2. Fallback: boton cerrar del header (shadow)
        const closeBtn = this.shadow.querySelector('.close-btn');
        if (closeBtn) closeBtn.focus();
    }

    /**
     * Obtiene el elemento realmente enfocado atravesando shadow roots anidados.
     * @param {Document} doc - Documento donde empezar la busqueda
     * @returns {HTMLElement|null}
     * @private
     */
    _getDeepActiveElement(doc = document) {
        let active = doc.activeElement;
        while (active && active.shadowRoot && active.shadowRoot.activeElement) {
            active = active.shadowRoot.activeElement;
        }
        return active;
    }

    /**
     * Alterna o fuerza el ancho del panel. Los porcentajes están por css
     * @param {boolean|null} forceState - Si es true fuerza expandido, false contraído. Null alterna.
     */
    toggleWidth(forceState = null) {
        // Si no se pasa estado, invertimos el actual
        const desiredState = forceState !== null ? forceState : !this._isExpanded;

        // return si no hay cambio de estado
        if (desiredState === this._isExpanded) return;

        if (this._persistExpanded) localStorage.setItem('rs_expanded', desiredState);
        this._applyExpanded(desiredState);
    }

    /**
     * Fija el ancho con el que se abre el panel para el contexto que se va a cargar.
     * - forceExpanded false: preferencia común 'rs_expanded' (contraído si el usuario nunca lo expandió);
     *   expandir/contraer se guarda como siempre.
     * - forceExpanded true: se abre siempre expandido. El usuario puede contraerlo mientras está abierto, pero
     *   no se guarda: la siguiente apertura vuelve a ser expandida y la preferencia común no cambia.
     * @param {boolean} forceExpanded
     */
    setExpandPreference(forceExpanded = false) {
        this._persistExpanded = !forceExpanded;

        const state = forceExpanded || localStorage.getItem('rs_expanded') === 'true';

        this._applyExpanded(state);
    }

    /**
     * Aplica el estado de expansión (clase del sidebar e icono/tooltip del botón) sin guardarlo.
     * @param {boolean} state
     * @fires sidebar-expand
     * @fires sidebar-collapse
     * @private
     */
    _applyExpanded(state) {
        if (state === this._isExpanded) return;

        this._isExpanded = state;

        const sidebar = this.shadow.querySelector('.sidebar');
        const btn = this.shadow.querySelector('.expand-btn');

        // Usar toggle con segundo parámetro booleano
        sidebar?.classList.toggle('expanded', this._isExpanded);

        if (btn) {
            // Usar destructuring y operador ternario
            const [icon, tooltip] = this._isExpanded
                ? [this.resources.icons.panelCollapse, Traduccion.CONTRAER]
                : [this.resources.icons.panelExpand, Traduccion.EXPANDIR];

            btn.icon = icon;
            btn.title = tooltip;
        }

        if (this._isExpanded) {
            this.dispatchEvent(new CustomEvent('sidebar-expand',   { bubbles: true, composed: true }));
        } else {
            this.dispatchEvent(new CustomEvent('sidebar-collapse', { bubbles: true, composed: true }));
        }
    }

    // =========================================================================
    // API PÚBLICA: NAVEGACIÓN
    // =========================================================================

    /**
     * Carga un contexto inicial (Root).
     * Renderiza la vista configurada y ELIMINA cualquier historial previo.
     * @param {Object} config - Objeto de configuración de la vista.
     */
    loadContext(config) {
        this.historyStack = [];
        this._accentColor = null;
        this.currentCallbacks = {};
        this.innerHTML = '';
        this._updateView(config);
        this.currentCallbacks = { onBack: config.onBack || null };
        this._toggleBackButton();
    }

    /**
     * Navega a una nueva vista (Push).
     * Guarda el estado actual (DOM + Inputs) en la pila y renderiza la nueva vista.
     * Si el panel esta cerrado, delega en loadContext() — no tiene sentido hacer push de un estado vacio.
     * @param {Object} config - Objeto de configuracion de la nueva vista.
     */
    navigate(config) {
        if (!this._isOpen) {
            this.loadContext(config);
            return;
        }

        // Obtenemos el estado actual del header (Shadow DOM) para guardarlo
        const currentHeaderState = {
            title: this.shadow.querySelector('.title-text').textContent,
            subtitle: this.shadow.querySelector('.subtitle-text').textContent
        };

        // Clonamos la config del header y acciones para evitar referencias
        const headerSnapshot = this._cloneHeaderConfig(this._currentHeaderConfig);

        const actionsSnapshot = this._cloneActionsConfig(this._currentActionsConfig);

        // Guardamos el CSS extra actual antes de ir a la siguiente vista
        const footerSnapshot = this._cloneFooterConfig(this._currentFooterConfig);
        const extraCssSnapshot = [...this._currentExtraCss];

        this.historyStack.push({
            // Guardamos los nodos actuales en un fragmento de memoria.
            nodes: this._snapshotNodes(),
            callbacks: { ...this.currentCallbacks },
            headerState: currentHeaderState,
            headerConfig: headerSnapshot,
            actionsConfig: actionsSnapshot,
            footerConfig: footerSnapshot,
            extraCss: extraCssSnapshot,
            // Tracking: guardamos el estado del contexto anterior para restaurarlo en goBack().
            trackName: this.getAttribute('data-track-name') || null,
            trackActive: this.hasAttribute('data-track')
        });

        this.innerHTML = '';
        this._updateView(config);

        this.currentCallbacks = { onBack: config.onBack || null };
        this._toggleBackButton();
    }

    /**
     * Vuelve a la vista anterior (Pop).
     * Restaura el DOM y los valores de los inputs tal cual estaban.
     * @fires sidebar-nav-back
     */
    goBack() {
        if (this.historyStack.length === 0) return;

        const onBackAction = this.currentCallbacks.onBack;
        const prev = this.historyStack.pop();

        // 1. Restaurar nodos DOM (Light DOM)
        this.innerHTML = '';
        this.appendChild(prev.nodes);
        this.currentCallbacks = prev.callbacks;

        // 2. Restaurar textos y botones del Header (Shadow DOM)
        if (prev.headerConfig) {
            this._upsertHeader(prev.headerConfig);
        } else if (prev.headerState) {
            this._updateTitleTexts(prev.headerState.title, prev.headerState.subtitle);
        }

        // 3. Restaurar estado visual y datos
        this._upsertActions(prev.actionsConfig);
        this._upsertFooter(prev.footerConfig);
        const restoredCss = prev.extraCss || [];
        this.extraCss = restoredCss;
        this._currentExtraCss = [...restoredCss];

        // 4. Restaurar trackName del contexto anterior.
        if (prev.trackActive && prev.trackName) {
            this.setAttribute('data-track', '');
            this.setAttribute('data-track-name', prev.trackName);
        } else {
            this.removeAttribute('data-track');
            this.removeAttribute('data-track-name');
        }
        this._toggleBackButton();
        this._syncShadowVisibility();
        this._restoreFormState(); // Recupera los valores escritos por el usuario

        this.safeExecute(onBackAction);
        this.dispatchEvent(new CustomEvent('sidebar-nav-back', { bubbles: true, composed: true }));
    }

    /**
     * Indica si el panel puede volver a una vista anterior (hay historial).
     * @returns {boolean} True si existe al menos una vista en la pila a la que regresar.
     */
    canGoBack() {
        return this.historyStack.length > 0;
    }

    // =========================================================================
    // API PÚBLICA: REFRESCO PARCIAL
    // =========================================================================

    /**
     * Actualiza únicamente la cabecera.
     * @param {Object} data - Configuración del header.
     */
    refreshHeader(data) { this._upsertHeader(data); }

    /**
     * Actualiza únicamente el cuerpo central.
     * @param {string|Node} data - Contenido HTML string o Nodo DOM.
     */
    refreshBody(data) { this._upsertBody(data); }

    /**
     * Actualiza únicamente el pie de página.
     * @param {Object} data - Configuración del footer.
     */
    refreshFooter(data) { this._upsertFooter(data); }

    /**
     * Actualiza únicamente la barra de acciones superior.
     * @param {Object} data - Configuración de las acciones.
     */
    refreshActions(data) { this._upsertActions(data); }

    // =========================================================================
    // API PÚBLICA: LOADING
    // =========================================================================

    /** Selector de cada zona que showLoading()/hideLoading() pueden cubrir. */
    static ZONAS_LOADING = { panel: '.sidebar', body: '.body-area', footer: '.footer-area', actions: '.actions-area' };

    /**
     * Muestra un Loading sobre una zona del panel — encapsula el shadow DOM interno para que el
     * caller no tenga que conocer sus clases (.sidebar/.body-area/.footer-area/.actions-area).
     * @param {'panel'|'body'|'footer'|'actions'} [zone='panel']
     * @param {Object} [options] - Ver Loading.show.
     */
    showLoading(zone, options) {
        const target = this.shadow.querySelector(RightSidebar.ZONAS_LOADING[zone] || RightSidebar.ZONAS_LOADING.panel);
        if (target) Loading.show(options, target);
    }

    /** Oculta el Loading mostrado por showLoading() — usar la misma `zone`. */
    hideLoading(zone) {
        const target = this.shadow.querySelector(RightSidebar.ZONAS_LOADING[zone] || RightSidebar.ZONAS_LOADING.panel);
        if (target) Loading.hide(target);
    }

    // =========================================================================
    // LÓGICA PRIVADA: RENDERIZADO (UPSERT)
    // =========================================================================

    /**
     * Orquestador que actualiza todas las secciones según la configuración.
     * @param {Object} config - Configuración completa de la vista.
     * @private
     */
    _updateView(config) {
        const newCss = config.extraCss !== undefined ? config.extraCss : this.extraCss;
        this.extraCss = newCss;
        this._currentExtraCss = Array.isArray(this.extraCss) ? [...this.extraCss] : [this.extraCss];

        this._upsertHeader(config.header);
        this._upsertActions(config.actions);
        this._upsertBody(config.body || config.bodyHTML);
        this._upsertFooter(config.footer);
    }

    /**
     * Renderiza o actualiza la cabecera. Oculta el área si no hay datos.
     * @param {Object} config 
     * @private
     */
    _upsertHeader(config) {
        // Guardamos copia de la config actual
        this._currentHeaderConfig = this._cloneHeaderConfig(config);

        const shadowHeader = this.shadow.querySelector('.header-area');
        this._removeSlotElement('header-addon');

        // Limpiamos botones previos del Shadow DOM
        const addonContainer = this.shadow.querySelector('.header-left-addon');
        if (addonContainer) {
            const oldBtns = addonContainer.querySelectorAll('.header-ext-btn, .header-icon-style');
            oldBtns.forEach(btn => btn.remove());
        }
        // Ocultar línea de acento hasta que se cree un icono
        const accentLine = this.shadow.querySelector('.header-accent-line');
        if (accentLine) accentLine.classList.remove('visible');

        const hasContent = config && (config.title || config.navBtn || config.icon);

        if (!hasContent) {
            if (shadowHeader) shadowHeader.style.display = 'none';
            return;
        }

        if (shadowHeader) shadowHeader.style.display = '';

        // La caja de icono solo se crea en el nivel raiz (no reaparece al avanzar en el historial)
        const tieneIconoPropio = config.icon && this.historyStack.length === 0;
        if (tieneIconoPropio) {
            this._createIcon(config.icon);
        } else if (this.historyStack.length > 0 && this._accentColor && accentLine) {
            // En un paso con historial: mantener la barra con el color del origen
            accentLine.style.setProperty('--rs-accent-color', this._accentColor);
            accentLine.classList.add('visible');
        }
        if (config.navBtn) {
            // El navBtn usa el circulo siempre que exista contexto de color
            // (icono propio de este nivel, o heredado de un nivel anterior)
            this._createNavButton(config.navBtn, !!this._accentColor);
        }

        // Actualizamos los textos directamente en el Shadow DOM
        this._updateTitleTexts(config.title, config.subtitle);
    }

    /**
     * Actualiza los textos del título y subtítulo en el Shadow DOM.
     * @private
     */
    _updateTitleTexts(title, subtitle) {
        const titleEl = this.shadow.querySelector('.title-text');
        const subEl = this.shadow.querySelector('.subtitle-text');

        if (titleEl) titleEl.textContent = title || '';

        if (subEl) {
            subEl.textContent = subtitle || '';
            // Si no hay subtítulo, lo ocultamos para mantener el layout limpio
            subEl.style.display = subtitle ? 'block' : 'none';
        }
    }

    /** * Gestiona la renderización y actualización de la barra de acciones superiores.
     * Delega la lógica de responsive y overflow a WidgetBase.
     * @param {Object} config - Configuración que incluye el array de botones.
     * @private
     */
    _upsertActions(config) {
        // 1. Guardamos la config para el historial de navegación
        this._currentActionsConfig = this._cloneActionsConfig(config);

        // 2. Apuntamos al contenedor maestro del Shadow DOM
        const wrapper = this.shadow.querySelector('.actions-area');
        if (!wrapper) return;

        // 3. Limpiamos lo que hubiera antes
        wrapper.innerHTML = '';

        // 4. Si no hay configuración o botones, lo ocultamos y salimos
        if (!config?.buttons?.length) {
            wrapper.style.display = 'none';
            return;
        }

        // 5. Si hay botones, lo mostramos
        wrapper.style.display = '';

        const bar = document.createElement('button-bar');
        bar.gap = "0.1rem";
        bar.dropdown = false;
        if (this.callerContext) bar.callerContext = this.callerContext;
        bar.buttons = config.buttons.map(btn => btn.textOut !== undefined ? btn : { ...btn, textOut: true });
        bar.moreButton = { textOut: true, label: Traduccion.MAS, ...(config.moreButton || {}) };
        wrapper.appendChild(bar);
    }

    /**
     * Renderiza el cuerpo principal. Admite string HTML o Nodos.
     * @param {string|Node} data 
     * @private
     */
    _upsertBody(data) {
        const shadowBody = this.shadow.querySelector('.body-area');
        let div = this._getOrCreateContainer('body');

        if (!data) {
            div.remove();
            if (shadowBody) shadowBody.style.display = 'none';
            return;
        }

        if (shadowBody) {
            shadowBody.scrollTop = 0;
            shadowBody.style.display = '';
        }
        const content = data.content || data;
        div.innerHTML = '';

        // content es API de contenido HTML deliberado: el caller es responsable
        // de que el HTML sea seguro (nunca pasar aqui texto de usuario sin escapar)
        if (typeof content === 'string') div.innerHTML = content;
        else div.appendChild(content);
    }

    /**
     * Renderiza el footer con botones en el Shadow DOM.
     * @param {Object} config 
     * @private
     */
    _upsertFooter(config) {
        // 1. Guardamos la config para el historial
        this._currentFooterConfig = this._cloneFooterConfig(config);

        // 2. Apuntamos al Shadow DOM directamente
        const container = this.shadow.querySelector('.footer-area');
        if (!container) return;

        // 3. Limpiamos contenido anterior
        container.innerHTML = '';

        // 4. Si no hay botones, lo ocultamos y salimos
        if (!config?.buttons?.length) {
            container.style.display = 'none';
            return;
        }

        // 5. Si hay botones, mostramos el contenedor y los creamos
        container.style.display = '';

        const bar = document.createElement('button-bar');
        if (this.callerContext) bar.callerContext = this.callerContext;
        bar.buttons = config.buttons;
        // Si hay botones con group, no aplicar align='right' automático
        const hasGroup = config.buttons?.some(b => b.group);
        bar.align = config.align ?? (hasGroup ? 'left' : 'right');
        bar.moreButton = { size: "md", ...(config.moreButton || {}) };
        container.appendChild(bar);
    }

    /**
     * Sincroniza la visibilidad de los contenedores del Shadow DOM.
     * Oculta Header/Footer/Actions si no tienen contenido en el Light DOM.
     * @private
     */
    _syncShadowVisibility() {
        const bodySlot = this.querySelector('[slot="body"]');
        const shadowBody = this.shadow.querySelector('.body-area');
        if (shadowBody) shadowBody.style.display = bodySlot ? '' : 'none';
    }

    // =========================================================================
    // UTILIDADES INTERNAS (HELPERS)
    // =========================================================================

    // Método auxiliar para evitar referencias circulares/mutables en historial
    _cloneHeaderConfig(config) {
        if (!config) return null;
        const clone = { ...config };
        if (clone.navBtn) clone.navBtn = { ...clone.navBtn };
        if (clone.icon && typeof clone.icon === 'object') clone.icon = { ...clone.icon };
        return clone;
    }

    _cloneActionsConfig(config) {
        if (!config) return null;
        const clone = { ...config };
        if (clone.buttons) clone.buttons = [...clone.buttons]; // Clon superficial del array
        return clone;
    }

    _cloneFooterConfig(config) {
        if (!config) return null;
        const clone = { ...config };
        if (clone.buttons) clone.buttons = [...clone.buttons];
        return clone;
    }

    /**
     * Captura el estado actual del Light DOM en un DocumentFragment.
     * Guarda los valores de los inputs en memoria antes de moverlos.
     * @returns {DocumentFragment}
     * @private
     */
    _snapshotNodes() {
        // 1. Guardar estado de inputs en propiedades JS para persistencia
        this.querySelectorAll('input, textarea, select').forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') {
                el._savedChecked = el.checked;
            } else {
                el._savedValue = el.value;
            }
        });

        // 2. Mover nodos al fragmento
        const f = document.createDocumentFragment();
        while (this.firstChild) f.appendChild(this.firstChild);
        return f;
    }

    /**
     * Restaura los valores de los inputs desde la memoria.
     * Corrige el comportamiento del navegador de resetear valores al reconectar nodos.
     * @private
     */
    _restoreFormState() {
        this.querySelectorAll('input, textarea, select').forEach(el => {
            if (typeof el._savedValue !== 'undefined') {
                el.value = el._savedValue;
                delete el._savedValue;
            }
            if (typeof el._savedChecked !== 'undefined') {
                el.checked = el._savedChecked;
                delete el._savedChecked;
            }
        });
    }

    /**
     * Genera el HTML estructural inicial dentro del Shadow DOM.
     * Idempotente: si la estructura ya existe (reconexion al DOM tras un move),
     * no la reconstruye — conserva los <link> CSS cargados (evita FOUC) y no
     * duplica los event listeners de _setupEventListeners.
     * @private
     */
    _renderBaseStructure() {
        if (this.shadow.querySelector('.sidebar')) return;

        const expandedClass = this._isExpanded ? ' expanded' : '';
        this.shadow.innerHTML = `
            <div class="backdrop" aria-hidden="true"></div>
            <div class="sidebar${expandedClass}" role="dialog" aria-labelledby="rs-title">
                <header class="header-area">
                    <wc-button variant="white" class="back-btn volver"></wc-button>

                    <div class="header-left-addon"><slot name="header-addon"></slot></div>
                    <div class="header-accent-line"></div>

                    <div class="title-container">
                        <span class="title-text" id="rs-title"></span>
                        <span class="subtitle-text"></span>
                    </div>

                    <wc-button variant="soft-transparent" shape="pill" class="expand-btn"></wc-button>

                    <wc-button variant="white" class="close-btn cerrar"></wc-button>
                </header>
                <div class="actions-area"></div>
                <div class="body-area"><slot name="body"></slot></div>
                <footer class="footer-area"></footer>
            </div>
        `;

        // Todo lo que depende de Traduccion o de SVGs se asigna por JS,
        // nunca interpolado en el template (evita undefined y corrupción de SVG)
        const backBtn = this.shadow.querySelector('.back-btn');
        const expandBtn = this.shadow.querySelector('.expand-btn');
        const closeBtn = this.shadow.querySelector('.close-btn');

        // El icono llega por la clase 'volver' del catalogo (icon-catalog.css),
        // no por SVG inline: asignar .icon aqui desactivaria la mascara.
        backBtn.setAttribute('title', Traduccion.VOLVER);

        expandBtn.icon = this._isExpanded
            ? this.resources.icons.panelCollapse
            : this.resources.icons.panelExpand;

        expandBtn.setAttribute('title', this._isExpanded ? Traduccion.CONTRAER : Traduccion.EXPANDIR);

        closeBtn.setAttribute('title', Traduccion.CERRAR);
    }

    _setupEventListeners() {
        // Idempotente: el flag evita duplicar listeners si connectedCallback
        // se dispara mas de una vez (move en el DOM).
        if (this._listenersAttached) return;
        this._listenersAttached = true;
        this.shadow.querySelector('.close-btn')?.addEventListener('click', () => this.close());
        this.shadow.querySelector('.back-btn')?.addEventListener('click', () => this.goBack());
        this.shadow.querySelector('.expand-btn')?.addEventListener('click', () => this.toggleWidth());
    }

    /**
     * Busca o crea un contenedor DIV con el atributo slot asignado.
     * @param {string} slotName 
     * @returns {HTMLElement}
     * @private
     */
    _getOrCreateContainer(slotName) {
        let el = this.querySelector(`[slot="${slotName}"]`);
        if (!el) {
            el = document.createElement('div');
            el.slot = slotName;
            this.appendChild(el);
        }
        return el;
    }

    /**
     * Elimina del DOM el elemento asignado a un slot específico.
     * @param {string} slotName 
     * @private
     */
    _removeSlotElement(slotName) {
        const el = this.querySelector(`[slot="${slotName}"]`);
        if (el) el.remove();
    }

    /**
     * Crea un botón de navegación externo en la cabecera (icono + tooltip).
     * @param {{ text, url, callback }} param0
     * @private
     */
    _createNavButton({ text, url, callback }, tieneIcono = false) {
        // Buscamos el contenedor interno del Shadow DOM
        const container = this.shadow.querySelector('.header-left-addon');
        if (!container) return;

        const b = document.createElement('wc-button');
        if (tieneIcono) {
            // Junto a un icono: circulo transparente hasta el hover, igual al expand-btn.
            // soft-transparent (no soft-white): sin fondo ni borde en reposo, y no depende
            // de una regla compartida que otro trabajo pueda cambiar.
            b.variant = "soft-transparent";
            b.shape = "pill";
        } else {
            // Solo (sin icono al lado): igual al boton cerrar
            b.variant = "white";
        }
        // 'header-ext-btn' estila el boton; 'pagina_completa' es el icono del catalogo
        b.className = 'header-ext-btn pagina_completa';

        // El texto pasa a ser el tooltip (al pasar el ratón)
        if (text) {
            b.setAttribute('title', text);
        }
        this.addClickButton(b, url, callback);
        container.appendChild(b);
    }

    /**
     * Crea un icono decorativo en la cabecera usando wc-icon.
     * @param {string|Object} iconConfig - Nombre del catálogo (string) o config completa {name, svg, size, shape, colorBg, iconColor, borderColor, iconOriginal}.
     * @private
     */
    _createIcon(iconConfig) {
        const container = this.shadow.querySelector('.header-left-addon');
        if (!container) return;

        const icon = document.createElement('wc-icon');
        icon.className = 'header-icon-style';

        // Defaults aplicados siempre; el objeto los sobreescribe donde lleguen valores
        icon.size = 'lg';
        icon.borderColor = iconConfig.borderColor || iconConfig.iconColor || '#d1d5db';

        let accentColor = '#222';
        if (typeof iconConfig === 'string') {
            icon.name = iconConfig;
        } else if (iconConfig && typeof iconConfig === 'object') {
            if (iconConfig.iconColor) accentColor = iconConfig.iconColor;
            icon.configure(iconConfig);
        }
        // Persistimos el color para poder mantener la barra en los pasos con historial
        this._accentColor = accentColor;

        container.appendChild(icon);

        // Mostrar línea de acento con el color del icono
        const accentLine = this.shadow.querySelector('.header-accent-line');
        if (accentLine) {
            accentLine.style.setProperty('--rs-accent-color', accentColor);
            accentLine.classList.add('visible');
        }
    }

    /**
     * Muestra u oculta el botón "Atrás" según el historial.
     * @private
     */
    _toggleBackButton() {
        const hasHistory = this.historyStack.length > 0;
        const backBtn = this.shadow.querySelector('.back-btn');
        if (backBtn) backBtn.style.display = hasHistory ? 'block' : 'none';
    }

    // =========================================================================
    // POSICIONAMIENTO LATERAL (anchor + offset-right)
    // =========================================================================

    /**
     * Calcula el valor de `right` en px que debe tener el panel al abrirse.
     * Prioridad: anchor (si resuelve) → offsetRight → 0.
     * @returns {number}
     * @private
     */
    _resolveRightOffset() {
        const extra = this.offsetRight;

        if (this._anchor) {
            const el = typeof this._anchor === 'string'
                ? document.querySelector(this._anchor)
                : this._anchor;

            if (el) {
                return el.offsetWidth + extra;
            }
        }

        return extra;
    }

    /**
     * Registra un listener de resize para reposicionar el panel cuando el
     * anchor cambia de posición (p.ej. en pantallas responsivas).
     * Solo se activa cuando hay anchor y el panel está abierto.
     * @private
     */
    _startResizeTracking() {
        this._resizeHandler = () => {
            if (!this._isOpen) return;
            const sidebar = this.shadow.querySelector('.sidebar');
            if (!sidebar) return;
            const offset = this._resolveRightOffset();
            sidebar.style.right = offset ? `${offset}px` : '0';
            const backdrop = this.shadow.querySelector('.backdrop');
            if (backdrop) backdrop.style.right = offset ? `${offset}px` : '0';
        };
        window.addEventListener('resize', this._resizeHandler);
    }

    /**
     * Elimina el listener de resize registrado por _startResizeTracking.
     * @private
     */
    _stopResizeTracking() {
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
    }
}

if (!customElements.get('right-sidebar')) customElements.define('right-sidebar', RightSidebar);