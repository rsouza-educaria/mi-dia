// ===========================================================================
// ButtonBar - Botonera generica con gestion de overflow y submenu
// ===========================================================================
// Widget que unifica un numero ilimitado de wc-button, muestra solo los que
// caben en el espacio disponible y agrupa el resto en un boton de overflow
// "...". Cada boton puede incluir un submenu de nivel profundo via children[].
// ===========================================================================

const _WCBB_ICONS = {
    more:        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,
    back:        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevron:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg>`,
    chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>`
};

class ButtonBar extends WidgetBase {

    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });

        /** @private @type {Array<Object>} Configuracion de botones */
        this._buttons = [];

        /** @private @type {Array<{el:HTMLElement, btn:HTMLElement, config:Object, idx:number}>} */
        this._renderedBtns = [];

        /** @private @type {Array<Object>} Items que no caben en la barra */
        this._overflowItems = [];

        /** @private @type {boolean} */
        this._popoverOpen = false;

        /** @private @type {string|number|null} 'overflow' o indice del boton submenu */
        this._popoverSource = null;

        /** @private @type {HTMLElement|null} */
        this._activeTrigger = null;

        /** @private @type {boolean} Soporte de la API nativa Popover (top layer) */
        this._hasPopoverApi = false;

        /** @private @type {ResizeObserver|null} */
        this._resizeObserver = null;

        /** @private @type {IntersectionObserver|null} */
        this._visibilityObserver = null;

        /** @private @type {number|null} Handle del rAF del ciclo de overflow */
        this._overflowRaf = null;

        /** @private @type {number} Ancho natural (todos visibles) medido en el ultimo overflow */
        this._naturalWidth = 0;

        /**
         * @private @type {boolean} Hay medidas validas de la ultima medicion completa (ancho de cada boton,
         * del "...", gap y ancho del contenido): un cambio de ancho de la barra se resuelve con ellas, sin
         * volver a medir el DOM (ver _applyOverflowCached).
         */
        this._cacheValida = false;

        /** @private @type {number} Ancho del contenido con todos los botones visibles a la vista (incluye separadores y gaps) */
        this._anchoContenido = 0;

        /** @private @type {number|null} Ancho del boton "..." (null = aun no medido) */
        this._moreBtnWidth = null;

        /** @private @type {number} Gap usado en el reparto de botones cuando hay desbordamiento */
        this._gapOverflow = 4;

        /** @private @type {boolean} Estado aplicado: hay botones en el "..." */
        this._desborda = false;

        /** @private @type {number} Estado aplicado: indice (entre los visibles) del primer boton que va al "..." */
        this._firstHiddenIdx = -1;

        /** @private @type {number|null} Ultimo ancho de la barra recibido del ResizeObserver */
        this._anchoBarra = null;

        /** @private @type {number|null} rAF pendiente del recalculo tras un cambio de tamaño */
        this._rafResize = null;

        /** @private @type {boolean} La barra esta en el viewport (IntersectionObserver) */
        this._enViewport = true;

        /** @private @type {boolean} */
        this._structureReady = false;

        /** @private @type {Object} Configuracion del boton de overflow */
        this._moreButton = {};

        /** @private @type {string} Alineacion de los botones: 'left' | 'right' */
        this._align = 'left';

        /** @private @type {boolean} Muestra el icono de dropdown en botones con children */
        this._dropdown = true;

        /** @private @type {string|null} Separacion entre botones (override de --wcbb-gap) */
        this._gap = null;

        /** @private @type {boolean} Modo "adherido": botones pegados sin gap (estilo input-group) */
        this._attached = false;

        /** @private @type {string} Orientacion: 'horizontal' | 'vertical' */
        this._orientation = 'horizontal';

        /** @private @type {boolean} Si true, no agrupa botones en el menu '...' */
        this._noCollapse = false;

        /** @private @type {boolean} Si true, los botones pasan a siguiente linea en lugar de agruparse */
        this._wrap = false;

        /** @private */
        this._els = {};

        this._handleDocumentClick = this._handleDocumentClick.bind(this);
        this._handleScrollResize  = this._handleScrollResize.bind(this);
    }

    // =========================================================================
    // WIDGETBASE
    // =========================================================================

    get componentCssName() {
        return 'button-bar.css';
    }

    static get observedAttributes() {
        return [...super.observedAttributes];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback(name, oldValue, newValue);
    }

    // =========================================================================
    // API PUBLICA
    // =========================================================================

    /**
     * Array de configuracion de botones.
     * Cada item acepta las mismas propiedades que wc-button (label, icon, variant,
     * size, disabled, url, callback, callerContext) mas el campo opcional:
     *   children: [{label, icon, url, callback, ...}, ...]
     * Los items con children abren un submenu en lugar de ejecutar callback/url.
     * @returns {Array<Object>}
     */
    get buttons() { return this._buttons; }
    set buttons(val) {
        this._buttons = Array.isArray(val) ? val : [];
        if (this._structureReady) this._renderButtons();
    }

    /**
     * Configuracion del boton de overflow "...".
     * Acepta: variant, size, icon, label, tooltip, textOut.
     * Cualquier propiedad omitida usa el valor por defecto.
     * @returns {Object}
     */
    get moreButton() { return this._moreButton; }
    set moreButton(val) {
        this._moreButton = val && typeof val === 'object' ? val : {};
        if (this._structureReady) this._applyMoreButtonConfig();
    }

    /**
     * Si true, muestra siempre todos los botones visibles y oculta el menu "...".
     * Util para selectores compactos (p.ej. idiomas) donde el overflow no tiene sentido.
     * @returns {boolean}
     */
    get noCollapse() { return this._noCollapse; }
    set noCollapse(val) {
        this._noCollapse = !!val;
        if (this._structureReady) this._applyOverflow();
    }

    /**
     * Alineacion horizontal de los botones dentro de la barra.
     * 'left' (por defecto) o 'right'.
     * @returns {string}
     */
    get align() { return this._align; }
    set align(val) {
        this._align = val;
        if (this._els.bar) {
            this._els.bar.classList.toggle('wcbb-align-end', val === 'right');
        }
    }

    /**
     * Controla si se muestra el icono de dropdown (chevron) en los botones con children.
     * Actua como valor por defecto global; cada boton puede sobreescribirlo con
     * su propiedad dropdown individual.
     * true  → muestra el chevron (comportamiento por defecto)
     * false → no muestra el chevron en ningun boton
     * @returns {boolean}
     */
    get dropdown() { return this._dropdown; }
    set dropdown(val) {
        this._dropdown = val !== false;
        if (this._structureReady) this._renderButtons();
    }

    /**
     * Separacion entre botones. Sobreescribe la variable CSS --wcbb-gap.
     * Acepta numero (se interpreta como px) o string CSS ('0.5rem', '8px', '0').
     * @returns {string|null}
     */
    get gap() { return this._gap; }
    set gap(val) {
        this._gap = (val === null || val === undefined) ? null
                  : (typeof val === 'number' ? `${val}px` : String(val));
        if (this._gap === null) {
            this.style.removeProperty('--wcbb-gap');
        } else {
            this.style.setProperty('--wcbb-gap', this._gap);
        }
    }

    /**
     * Modo "adherido": los botones se pegan entre si y al contenedor con bordes
     * compartidos y esquinas internas cuadradas (estilo input-group). Pensado para
     * botoneras adosadas a un input. Fuerza gap 0 y altura completa.
     * @returns {boolean}
     */
    get attached() { return this._attached; }
    set attached(val) {
        this._attached = val === true || val === 'true';
        if (this._els.bar) {
            this._els.bar.classList.toggle('wcbb-attached', this._attached);
        }
    }

    /**
     * Orientacion de la barra de botones: 'horizontal' (por defecto) o 'vertical'.
     * En vertical, los botones se apilan en columna y el overflow aparece abajo.
     * @returns {string}
     */
    get orientation() { return this._orientation || 'horizontal'; }
    set orientation(val) {
        const validOrientation = val === 'vertical' ? 'vertical' : 'horizontal';
        this._orientation = validOrientation;
        if (this._els.bar) {
            this._els.bar.classList.toggle('wcbb-vertical', validOrientation === 'vertical');
            this._els.bar.classList.toggle('wcbb-horizontal', validOrientation === 'horizontal');
        }
    }

    /**
     * Si true, los botones que no caben pasan a la siguiente linea (flex-wrap)
     * en lugar de agruparse en el menu "...". Util cuando se prefiere ver todos
     * los botones en pantalla aunque ocupen mas de una fila.
     * @returns {boolean}
     */
    get wrap() { return this._wrap; }
    set wrap(val) {
        this._wrap = val === true || val === 'true' || this.hasAttribute('wrap');
        if (this._els.bar) {
            this._els.bar.classList.toggle('wcbb-wrap', this._wrap);
        }
        if (this._structureReady) this._applyOverflow();
    }

    // =========================================================================
    // CICLO DE VIDA
    // =========================================================================

    connectedCallback() {
        super.connectedCallback();
        if (this.hasAttribute('no-collapse')) this._noCollapse = true;
        if (this.hasAttribute('wrap')) this._wrap = true;
        if (!this._structureReady) {
            this._renderStructure();
            this._structureReady = true;
        } else if (this._resizeObserver && this._els.bar) {
            this._resizeObserver.observe(this._els.bar);
            this._renderedBtns.forEach(({ el }) => this._resizeObserver.observe(el));
        }
        if (this._buttons.length > 0) this._renderButtons();
    }

    disconnectedCallback() {
        // Al desconectar, el navegador saca el popover del top layer: si no se cierra
        // el estado interno, _popoverOpen quedaria true y el primer clic tras un
        // re-render/move (DynamicForm mueve nodos) no abriria el menu.
        this._closePopover();
        document.removeEventListener('click', this._handleDocumentClick);
        window.removeEventListener('scroll', this._handleScrollResize, true);
        window.removeEventListener('resize', this._handleScrollResize);
        if (this._resizeObserver)     this._resizeObserver.disconnect();
        if (this._visibilityObserver) this._visibilityObserver.disconnect();
        if (this._overflowRaf)        cancelAnimationFrame(this._overflowRaf);
        if (this._rafResize)          cancelAnimationFrame(this._rafResize);
        this._rafResize = null;
    }

    onStylesLoaded() {
        // El CSS de wc-button llega via cadena de @import anidada
        // (button-bar.css -> internal-layout.css -> button.css), que puede
        // aplicarse despues del onload del <link>. Usamos un ciclo de
        // estabilizacion que recalcula hasta que el ancho de los botones deja
        // de cambiar, en vez de medir una sola vez (medicion prematura = mal overflow).
        this._scheduleStableOverflow();

        // Las fuentes tambien afectan al ancho del label; recalcular al cargarse.
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => this._scheduleStableOverflow());
        }
    }

    /**
     * Devuelve el elemento wc-button asociado al id indicado en la config del boton.
     * @param {string|number} id - Valor del campo `id` del boton en el array `buttons`.
     * @returns {HTMLElement|null} El wc-button, o null si no se encuentra.
     */
    getButton(id) {
        const entry = this._renderedBtns.find(({ config }) => config.id == id);
        return entry ? entry.btn : null;
    }

    /**
     * Muestra u oculta el boton con el id indicado.
     * Los botones ocultos no participan en el calculo de overflow ni aparecen en el popover "...".
     * @param {string|number} id - Valor del campo `id` del boton en el array `buttons`.
     * @param {boolean} visible - true para mostrar, false para ocultar.
     */
    setButtonVisible(id, visible) {
        const entry = this._renderedBtns.find(({ config }) => config.id == id);
        if (!entry) return;
        entry.visible = !!visible;
        this._applyOverflow();
    }

    // =========================================================================
    // ESTRUCTURA SHADOW DOM
    // =========================================================================

    /**
     * Crea la estructura base del shadow DOM: barra + boton overflow + popover.
     * @private
     */
    _renderStructure() {
        const links = Array.from(this.shadow.querySelectorAll('link[rel="stylesheet"]'));
        this.shadow.innerHTML = '';
        links.forEach(l => this.shadow.appendChild(l));

        // Barra principal (flex)
        const bar = document.createElement('div');
        bar.className = 'wcbb-bar';

        // Spacer para alineacion derecha: ocupa el espacio libre antes de los botones
        // cuando align='right', sin romper el algoritmo de overflow (que necesita flex-start)
        const spacer = document.createElement('div');
        spacer.className = 'wcbb-spacer';
        bar.appendChild(spacer);

        // Boton de overflow "..."
        const moreBtn = document.createElement('wc-button');
        moreBtn.className = 'wcbb-more-btn';
        moreBtn.style.display = 'none';

        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._popoverOpen && this._popoverSource === 'overflow') {
                this._closePopover();
            } else {
                this._openPopover(this._overflowItems, moreBtn, 'overflow');
            }
        });

        bar.appendChild(moreBtn);

        // Popover compartido (overflow y submenu)
        const popover = document.createElement('div');
        popover.className = 'wcbb-popover';

        // TOP LAYER: el popover debe pintarse por encima de TODO el documento.
        // Un z-index alto NO basta: solo compite dentro del contexto de apilamiento
        // del ancestro mas cercano, asi que cualquier ancestro con transform, filter,
        // opacity<1, contain, isolation:isolate o position+z-index atrapa el popover y
        // los elementos posteriores de la pagina lo tapan. La API nativa Popover lo
        // promueve al top layer, inmune a contextos de apilamiento y a recortes por
        // overflow. Modo 'manual': el cierre por clic fuera y la navegacion por niveles
        // los gestiona el propio componente (el modo 'auto' cerraria el popover al
        // entrar en un submenu).
        this._hasPopoverApi = typeof popover.showPopover === 'function';
        if (this._hasPopoverApi) {
            // El UA lo mantiene oculto ([popover]:not(:popover-open){display:none})
            // hasta showPopover(); no se togglea display por JS.
            popover.setAttribute('popover', 'manual');
        } else {
            popover.style.display = 'none';
        }

        this.shadow.appendChild(bar);
        this.shadow.appendChild(popover);

        this._els = { bar, spacer, moreBtn, popover, groupSpacer: null };
        this._applyMoreButtonConfig();
        if (this._align === 'right') bar.classList.add('wcbb-align-end');
        if (this._attached)         bar.classList.add('wcbb-attached');
        if (this._wrap)             bar.classList.add('wcbb-wrap');
        if (this._orientation === 'vertical') {
            bar.classList.add('wcbb-vertical');
        } else {
            bar.classList.add('wcbb-horizontal');
        }

        // ResizeObserver: recalcula overflow cuando cambia el ancho del bar. Observa tambien cada boton
        // (_renderButtons) para saber cuando deja de valer la cache de anchos.
        this._resizeObserver = new ResizeObserver((entries) => this._onResize(entries));
        this._resizeObserver.observe(bar);

        // IntersectionObserver: recalcula al entrar el bar en el viewport (p.ej.
        // un panel que estaba oculto y se muestra). Con la cache valida basta el
        // calculo rapido; si no, el ciclo de estabilizacion, por si el CSS/fuentes
        // no estaban aplicados mientras estaba oculto.
        this._visibilityObserver = new IntersectionObserver((entries) => {
            this._enViewport = entries[0].isIntersecting;
            if (!this._enViewport) return;

            if (this._cacheValida && this._anchoBarra !== null) {
                this._applyOverflowCached(this._anchoBarra);
            } else {
                this._scheduleStableOverflow();
            }
        });
        this._visibilityObserver.observe(bar);
    }

    // =========================================================================
    // CONFIGURACION DEL BOTON DE OVERFLOW
    // =========================================================================

    /**
     * Aplica la configuracion de this._moreButton al elemento wc-button de overflow.
     * Se llama al crear la estructura y cada vez que cambia la propiedad moreButton.
     * @private
     */
    _applyMoreButtonConfig() {
        const { moreBtn } = this._els;
        if (!moreBtn) return;
        const cfg = this._moreButton || {};

        const btnCfg = {
            variant: cfg.variant,
            shape: cfg.shape,
            size: cfg.size || '',
            label: cfg.label, 
            textOut: cfg.textOut,
            icon:    cfg.icon    || _WCBB_ICONS.more
        };
        moreBtn.configure(btnCfg);
        // Sin texto no debe quedar label="undefined": button-bar.css estrecha el «…» text-out sin label.
        if (!cfg.label) moreBtn.removeAttribute('label');

        const defaultTooltip = typeof Traduccion !== 'undefined' && Traduccion.MAS
            ? Traduccion.MAS
            : 'Más';
        moreBtn.setAttribute('title',
            cfg.tooltip !== undefined ? cfg.tooltip : defaultTooltip);
    }

    // =========================================================================
    // RENDERIZADO DE BOTONES
    // =========================================================================

    /**
     * Crea los elementos wc-button a partir de this._buttons y los inserta en la barra.
     * @private
     */
    _renderButtons() {
        if (!this._els.bar) return;
        const { bar, moreBtn } = this._els;

        // Limpiar botones y spacer de grupo anteriores
        this._renderedBtns.forEach(({ el }) => {
            if (this._resizeObserver) this._resizeObserver.unobserve(el);
            el.remove();
        });
        this._renderedBtns = [];
        this._cacheValida = false;
        if (this._els.groupSpacer) {
            this._els.groupSpacer.remove();
            this._els.groupSpacer = null;
        }
        this._closePopover();

        // Detectar indice del primer boton con group:'right' (para insertar spacer)
        const firstRightIdx = this._buttons.findIndex(c => c.group === 'right');

        this._buttons.forEach((config, idx) => {
            // Insertar spacer ANTES del primer boton 'right' (si existe y hay botones antes)
            if (idx === firstRightIdx && firstRightIdx > 0) {
                const groupSpacer = document.createElement('div');
                groupSpacer.className = 'wcbb-spacer wcbb-group-spacer';
                bar.insertBefore(groupSpacer, moreBtn);
                this._els.groupSpacer = groupSpacer;
            }

            const wrap = document.createElement('div');
            wrap.className = 'wcbb-btn-wrap';
            if (config.fullWidth) wrap.classList.add('wcbb-btn-wrap--full');

            const btn = document.createElement('wc-button');

            // Separar propiedades de control de las propiedades del boton
            const { children, url, callback, callerContext: _cc, dropdown: btnDropdown, separator, visible: _vis, group: _grp, ...btnAttrs } = config;
            if (config.id != null) wrap.dataset.btnId = config.id;
            const isVisible = config.visible !== false;
            if (!isVisible) wrap.style.display = 'none';

            const hasChildren = Array.isArray(children) && children.length > 0;

            // Resolucion de dropdown: boton > bar > true
            const showDropdown = btnDropdown !== undefined ? btnDropdown !== false : this._dropdown;

            if (hasChildren) {
                // Con submenu: el clic abre el popover en lugar de llamar al callback.
                // Si showDropdown=true y el boton no tiene icono propio, el chevron-down
                // va dentro del boton a la derecha del texto (iconPos: 'right').
                // Si ya tiene icono propio (wc-button solo admite uno), se usa caret externo.
                if (showDropdown) {
                    if (!btnAttrs.icon) {
                        btn.configure({ ...btnAttrs, icon: _WCBB_ICONS.chevronDown, iconPos: 'right' });
                    } else {
                        btn.configure(btnAttrs);
                        const caretEl = document.createElement('span');
                        caretEl.className = 'wcbb-caret';
                        caretEl.innerHTML = _WCBB_ICONS.chevronDown;
                        caretEl.setAttribute('aria-hidden', 'true');
                        wrap.appendChild(caretEl);
                    }
                } else {
                    btn.configure(btnAttrs);
                }

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this._popoverOpen && this._popoverSource === idx) {
                        this._closePopover();
                    } else {
                        this._openPopover(children, wrap, idx);
                    }
                });

                wrap.appendChild(btn);
            } else {
                // Boton normal: callback o navegacion
                btn.configure(btnAttrs);
                if (callback || url) {
                    this.addClickButton(btn, url, callback);
                }
                wrap.appendChild(btn);
            }

            bar.insertBefore(wrap, moreBtn);
            this._renderedBtns.push({ el: wrap, btn, config, idx, visible: isVisible, ancho: null });
            if (this._resizeObserver) this._resizeObserver.observe(wrap);

            // Insertar separador si el boton lo indica
            if (separator) {
                const sep = document.createElement('div');
                sep.className = 'wcbb-separator';
                bar.insertBefore(sep, moreBtn);
            }
        });

        this._scheduleStableOverflow();
    }

    /**
     * Recalcula el overflow repetidamente (un rAF por frame) hasta que el ancho
     * natural de los botones se estabiliza dos frames seguidos, o se agota el
     * numero de intentos. Necesario porque el CSS de wc-button (cadena de @import)
     * y las fuentes pueden aplicarse despues del primer render: una medicion unica
     * mediria botones sin estilar y calcularia mal el boton "...".
     * @private
     */
    _scheduleStableOverflow() {
        if (this._overflowRaf) cancelAnimationFrame(this._overflowRaf);

        let attempts = 0;
        let lastWidth = -1;
        let stable = 0;

        const tick = () => {
            this._overflowRaf = null;
            this._applyOverflow();

            const w = this._naturalWidth;
            if (w > 0 && w === lastWidth) {
                stable++;
            } else {
                stable = 0;
                lastWidth = w;
            }

            // Continua hasta 2 frames estables o ~0.5s (30 frames) de intentos
            if (stable < 2 && attempts++ < 30) {
                this._overflowRaf = requestAnimationFrame(tick);
            }
        };

        this._overflowRaf = requestAnimationFrame(tick);
    }

    // =========================================================================
    // LOGICA DE OVERFLOW
    // =========================================================================

    /**
     * Calcula que botones caben en la barra y cuales van al menu overflow, midiendo el DOM.
     * Algoritmo de dos pasos para manejar correctamente el espacio del boton "...".
     * Deja en cache las medidas (ancho de cada boton, del "...", gap y del contenido) para que los
     * cambios de ancho posteriores de la barra se resuelvan sin medir (_applyOverflowCached).
     * @private
     */
    _applyOverflow() {
        this._cacheValida = false;
        if (!this._els.bar || this._renderedBtns.length === 0) { this._naturalWidth = 0; return; }
        const { bar, moreBtn, groupSpacer } = this._els;

        // En modo vertical, noCollapse o wrap, mostrar todos sin menu '...'
        if (this.orientation === 'vertical' || this._noCollapse || this._wrap) {
            this._renderedBtns.forEach(({ el, visible }) => { el.style.display = visible ? '' : 'none'; });
            moreBtn.style.display = 'none';
            if (groupSpacer) groupSpacer.style.display = '';
            this._overflowItems = [];
            return;
        }

        const barWidth = bar.offsetWidth;
        if (barWidth === 0) { this._naturalWidth = 0; return; }

        // Paso 1: restaurar solo los botones con visible=true; ocultar "..." y mostrar spacer
        this._renderedBtns.forEach(({ el, visible }) => { el.style.display = visible ? '' : 'none'; });
        moreBtn.style.display = 'none';
        if (groupSpacer) groupSpacer.style.display = '';

        const visibleBtns = this._renderedBtns.filter(({ visible }) => visible);
        if (visibleBtns.length === 0) { this._naturalWidth = 0; this._overflowItems = []; return; }

        // Sentinel de estabilidad: ancho natural con los botones actualmente visibles.
        let natural = 0;
        for (const rb of visibleBtns) {
            rb.ancho = rb.el.offsetWidth;
            natural += rb.ancho;
        }
        this._naturalWidth = natural;

        // Ancho con todos los botones a la vista, en la variable --wcbb-full-width del host. Un contenedor que se
        // ajusta al contenido (la zona de botones de tree-list) la usa para darle hueco hasta ese ancho aunque ahora
        // haya botones en el "...": si no, la barra solo mediria lo que cabe y no volveria a crecer al ensancharse.
        // Los spacers (alineacion derecha, grupos) no ocupan ancho pero si un gap, como cualquier hijo de la barra.
        const gapReal = parseFloat(getComputedStyle(bar).columnGap) || 0;
        const mostrados = [...bar.children].filter(c => c !== moreBtn && getComputedStyle(c).display !== 'none');
        const fullWidth = Math.ceil(natural + gapReal * Math.max(0, mostrados.length - 1));

        // Ancho que ocupa el contenido hasta el ultimo boton visible (separadores incluidos; los spacers crecen
        // con flex y su minimo es 0): es lo que se compara con el ancho de la barra para saber si todo cabe.
        const lastEl = visibleBtns[visibleBtns.length - 1].el;
        let contenido = 0;
        for (const c of mostrados) {
            if (!c.classList.contains('wcbb-spacer')) contenido += c.offsetWidth;
            if (c === lastEl) break;
            contenido += gapReal;
        }
        this._anchoContenido = contenido;

        // Paso 2: comprobar si el ultimo boton visible se sale
        const barRight = bar.getBoundingClientRect().right;
        const desborda = lastEl.getBoundingClientRect().right > barRight + 0.5;

        if (fullWidth !== this._fullWidth) {
            this._fullWidth = fullWidth;
            this.style.setProperty('--wcbb-full-width', `${fullWidth}px`);
        }

        if (!desborda) {
            this._overflowItems = [];
            this._guardarEstadoOverflow(false, visibleBtns.length);
            return;
        }

        // Paso 3: hay desbordamiento; ocultar spacer (grupos no aplican), mostrar "..."
        if (groupSpacer) groupSpacer.style.display = 'none';
        moreBtn.style.display = '';
        this._moreBtnWidth = moreBtn.offsetWidth || 40;
        this._gapOverflow = parseFloat(getComputedStyle(bar).columnGap) || 4;

        const firstHiddenIdx = this._calcularPrimerOculto(visibleBtns, barWidth);

        // Paso 4: aplicar overflow solo sobre los visibles (los hidden ya estan a none)
        for (let i = 0; i < visibleBtns.length; i++) {
            visibleBtns[i].el.style.display = i >= firstHiddenIdx ? 'none' : '';
        }

        this._overflowItems = visibleBtns.slice(firstHiddenIdx).map(({ config }) => config);
        this._guardarEstadoOverflow(true, firstHiddenIdx);

        if (this._popoverOpen && this._popoverSource === 'overflow') {
            this._renderPopoverContent(this._overflowItems, null);
        }
    }

    /**
     * Indice (entre los visibles) del primer boton que no cabe junto al "...", con los anchos en cache.
     * @private
     */
    _calcularPrimerOculto(visibleBtns, barWidth) {
        let used = 0;
        for (let i = 0; i < visibleBtns.length; i++) {
            used += visibleBtns[i].ancho;
            if (used + (i + 1) * this._gapOverflow + this._moreBtnWidth > barWidth) return i;
        }
        return visibleBtns.length;
    }

    /** @private */
    _guardarEstadoOverflow(desborda, firstHiddenIdx) {
        this._desborda = desborda;
        this._firstHiddenIdx = firstHiddenIdx;
        this._cacheValida = true;
    }

    /**
     * Mismo resultado que _applyOverflow para un ancho de barra nuevo, pero con las medidas en cache: no lee el
     * DOM y solo escribe si cambia que botones caben. Es lo que permite que muchas barras sigan un cambio de ancho
     * continuo (p.ej. la animacion de un panel) sin forzar un layout de la pagina por barra y frame.
     * @param {number} barWidth - Ancho de la barra (border-box).
     * @private
     */
    _applyOverflowCached(barWidth) {
        if (!this._cacheValida || !barWidth) { this._applyOverflow(); return; }

        const visibleBtns = this._renderedBtns.filter(({ visible }) => visible);
        const desborda = this._anchoContenido > barWidth + 0.5;

        // El ancho del "..." solo se conoce si ya se mostro alguna vez: si no, hay que medirlo.
        if (desborda && this._moreBtnWidth === null) { this._applyOverflow(); return; }

        const firstHiddenIdx = desborda ? this._calcularPrimerOculto(visibleBtns, barWidth) : visibleBtns.length;
        if (desborda === this._desborda && firstHiddenIdx === this._firstHiddenIdx) return;

        const { moreBtn, groupSpacer } = this._els;
        if (groupSpacer) groupSpacer.style.display = desborda ? 'none' : '';
        moreBtn.style.display = desborda ? '' : 'none';
        for (let i = 0; i < visibleBtns.length; i++) {
            visibleBtns[i].el.style.display = i >= firstHiddenIdx ? 'none' : '';
        }

        this._overflowItems = visibleBtns.slice(firstHiddenIdx).map(({ config }) => config);
        this._guardarEstadoOverflow(desborda, firstHiddenIdx);

        if (this._popoverOpen && this._popoverSource === 'overflow') {
            this._renderPopoverContent(this._overflowItems, null);
        }
    }

    /**
     * ResizeObserver de la barra y de cada boton. Un cambio de ancho de la barra se resuelve con la cache; si cambia
     * el de un boton visible (label, loading, badge... cambiados desde fuera) la cache deja de valer y se vuelve a
     * medir. Los botones que oculta el propio overflow informan ancho 0 y se ignoran. Se agrupa en un rAF por barra.
     * @private
     */
    _onResize(entries) {
        for (const entry of entries) {
            const box = entry.borderBoxSize && entry.borderBoxSize[0];
            const ancho = box ? box.inlineSize : entry.target.getBoundingClientRect().width;

            if (entry.target === this._els.bar) {
                this._anchoBarra = ancho;
                continue;
            }

            const rb = this._renderedBtns.find(({ el }) => el === entry.target);
            if (rb && rb.ancho !== null && ancho > 0 && Math.abs(ancho - rb.ancho) >= 1) this._cacheValida = false;
        }

        if (this._rafResize) return;
        this._rafResize = requestAnimationFrame(() => {
            this._rafResize = null;
            if (!this._enViewport) return;
            if (this._cacheValida && this._anchoBarra !== null) this._applyOverflowCached(this._anchoBarra);
            else this._applyOverflow();
        });
    }

    // =========================================================================
    // POPOVER (overflow y submenu)
    // =========================================================================

    /**
     * Abre el popover con los items dados anclado al elemento trigger.
     * @param {Array<Object>} items - Items a mostrar.
     * @param {HTMLElement} triggerEl - Elemento de referencia para posicionar.
     * @param {string|number} source - Identificador del origen ('overflow' o indice).
     * @private
     */
    _openPopover(items, triggerEl, source) {
        this._closePopover();

        this._popoverOpen = true;
        this._popoverSource = source;
        this._activeTrigger = triggerEl;

        const { popover } = this._els;
        this._renderPopoverContent(items, null);
        this._showPopoverEl();
        popover.style.visibility = 'hidden';

        requestAnimationFrame(() => {
            const rect = triggerEl.getBoundingClientRect();
            this._positionPopover(rect);
            popover.style.visibility = '';
        });

        document.removeEventListener('click', this._handleDocumentClick);
        // Guard isConnected: si el componente se elimina en este mismo tick, el listener
        // se añadiría DESPUÉS de disconnectedCallback y quedaría huérfano.
        setTimeout(() => {
            if (this.isConnected) document.addEventListener('click', this._handleDocumentClick);
        }, 0);

        window.addEventListener('scroll', this._handleScrollResize, true);
        window.addEventListener('resize', this._handleScrollResize);
    }

    /**
     * Muestra el elemento popover. Con soporte de la API nativa lo promueve al top
     * layer (por encima de cualquier contexto de apilamiento); si no, cae al
     * position:fixed + z-index de siempre.
     * @private
     */
    _showPopoverEl() {
        const { popover } = this._els;
        if (!popover) return;
        if (this._hasPopoverApi) {
            // showPopover() lanza si el elemento no esta conectado o ya esta abierto
            if (this.isConnected && !popover.matches(':popover-open')) popover.showPopover();
        } else {
            popover.style.display = '';
        }
    }

    /**
     * Oculta el elemento popover (contrapartida de _showPopoverEl).
     * @private
     */
    _hidePopoverEl() {
        const { popover } = this._els;
        if (!popover) return;
        if (this._hasPopoverApi) {
            // hidePopover() lanza si el popover no esta abierto
            if (popover.matches(':popover-open')) popover.hidePopover();
        } else {
            popover.style.display = 'none';
        }
    }

    /**
     * Rellena el popover con los items del nivel actual.
     * Si back !== null, muestra un boton de volver al nivel anterior.
     * @param {Array<Object>} items
     * @param {{items:Array, trigger:HTMLElement}|null} back
     * @private
     */
    _renderPopoverContent(items, back) {
        const { popover } = this._els;
        popover.innerHTML = '';

        if (back) {
            const row = document.createElement('div');
            row.className = 'wcbb-popover-row';

            const backBtn = document.createElement('wc-button');
            backBtn.configure({
                variant: 'ghost',
                fullWidth: true,
                labelAlign: 'left',
                icon: _WCBB_ICONS.back,
                label: back.trail.filter(Boolean).join(' › ') || 'Volver'
            });

            row.addEventListener('click', (e) => {
                e.stopPropagation();
                this._renderPopoverContent(back.items, back.parentBack);
                requestAnimationFrame(() => {
                    if (this._activeTrigger) {
                        this._positionPopover(this._activeTrigger.getBoundingClientRect());
                    }
                });
            });

            row.appendChild(backBtn);
            popover.appendChild(row);

            const sep = document.createElement('div');
            sep.className = 'wcbb-popover-sep';
            popover.appendChild(sep);
        }

        items.forEach(original => {
            // El controlador puede haber cambiado el boton vivo de la barra (getButton + asignacion): el item
            // toma su variante, badge y active actuales, no los de la config con la que se creo.
            const vivo = this._renderedBtns.find(e => e.config === original)?.btn;
            const config = vivo
                ? { ...original, variant: vivo.getAttribute('variant') || original.variant, badge: vivo.badge, active: vivo.active ?? original.active }
                : original;
            const hasChildren = Array.isArray(config.children) && config.children.length > 0;

            const row = document.createElement('div');
            row.className = 'wcbb-popover-row';
            if (config.disabled) row.classList.add('is-disabled');

            const btn = document.createElement('wc-button');
            // Partir de la config COMPLETA del boton (mantiene badge, colores
            // personalizados, class, size, tooltip, etc.) y sobreescribir solo
            // lo necesario para el aspecto de item de lista (variant/alineacion).
            // children/callback/url/dropdown/separator/visible no son propiedades
            // de wc-button: configure() las ignora sin efecto.
            const btnCfg = {
                ...config,
                // Activo (config.active): conserva la variante que tiene en la barra, mismo color.
                variant: config.active ? config.variant : 'ghost',
                // Relleno dentro del menú: esquinas como las del popover, no de pastilla.
                shape: config.active ? 'rounded' : config.shape,
                labelAlign: hasChildren ? 'spread' : 'left',
                label: config.label || config.tooltip || config.title || '',
                tooltip: '',
                title: '',
                textOut: false,
                disabled: !!config.disabled
            };

            if (hasChildren && !config.icon) {
                // Sin icono propio: chevron-right dentro del boton a la derecha
                btnCfg.icon = _WCBB_ICONS.chevron;
                btnCfg.iconPos = 'right';
                btn.configure(btnCfg);
            } else {
                btn.configure(btnCfg);
                // Con icono propio + children: chevron externo (wc-button solo admite un icono)
                if (hasChildren) {
                    const chv = document.createElement('span');
                    chv.className = 'wcbb-popover-chevron';
                    chv.innerHTML = _WCBB_ICONS.chevron;
                    chv.setAttribute('aria-hidden', 'true');
                    row.appendChild(chv);
                }
            }

            if (config.active !== undefined) btn.setAttribute('aria-pressed', String(!!config.active));
            if (config.title) row.setAttribute('title', config.title);
            row.insertBefore(btn, row.firstChild);

            if (!config.disabled) {
                if (hasChildren) {
                    row.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const _trail = back ? [...back.trail, config.label || ''] : [config.label || ''];
                        this._renderPopoverContent(config.children, { items, trail: _trail, parentBack: back });
                        requestAnimationFrame(() => {
                            if (this._activeTrigger) {
                                this._positionPopover(this._activeTrigger.getBoundingClientRect());
                            }
                        });
                    });
                } else {
                    row.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._closePopover();
                        if (config.callback) {
                            this.safeExecute(config.callback);
                        } else if (config.url) {
                            if (this._callerContext && !this._callerContext.closed) {
                                this._callerContext.location.href = config.url;
                            } else {
                                window.location.href = config.url;
                            }
                        }
                    });
                }
            }

            popover.appendChild(row);
        });
    }

    /**
     * Posiciona el popover relativo al viewport, ajustando si se sale de pantalla.
     * @param {DOMRect} rect - Bounding rect del trigger.
     * @private
     */
    _positionPopover(rect) {
        const { popover } = this._els;
        const pH = popover.offsetHeight;
        const pW = popover.offsetWidth;
        // Area util sin las barras de scroll de la pagina (innerWidth/innerHeight las incluyen y el popover
        // quedaba en parte debajo de ellas, fuera del panel)
        const vH = document.documentElement.clientHeight || window.innerHeight;
        const vW = document.documentElement.clientWidth || window.innerWidth;
        const GAP = 4;
        const MARGIN = 8;

        // Vertical: preferir abajo, si no cabe abrir arriba
        let top = rect.bottom + GAP;
        if (top + pH > vH - MARGIN) {
            top = Math.max(MARGIN, rect.top - pH - GAP);
        }

        // Horizontal: alinear con el borde izquierdo del trigger, corregir si sale
        let left = rect.left;
        if (left + pW > vW - MARGIN) {
            left = Math.max(MARGIN, vW - pW - MARGIN);
        }

        popover.style.top  = `${top}px`;
        popover.style.left = `${left}px`;
    }

    /**
     * Cierra el popover y limpia el estado.
     * @private
     */
    _closePopover() {
        if (!this._popoverOpen) return;
        this._popoverOpen = false;
        this._popoverSource = null;
        this._activeTrigger = null;

        const { popover } = this._els;
        if (popover) {
            this._hidePopoverEl();
            popover.innerHTML = '';
        }

        document.removeEventListener('click', this._handleDocumentClick);
        window.removeEventListener('scroll', this._handleScrollResize, true);
        window.removeEventListener('resize', this._handleScrollResize);
    }

    /**
     * Cierra el popover si el clic fue fuera del componente.
     * @param {MouseEvent} e
     * @private
     */
    _handleDocumentClick(e) {
        if (!e.composedPath().includes(this)) {
            this._closePopover();
        }
    }

    /**
     * Cierra el popover cuando el usuario hace scroll o redimensiona la ventana.
     * Se ignora el scroll que ocurre dentro del propio popover (overflow-y: auto).
     * @param {Event} e
     * @private
     */
    _handleScrollResize(e) {
        if (e.type === 'scroll' && e.composedPath().includes(this._els.popover)) return;
        this._closePopover();
    }
}

if (!customElements.get('button-bar')) customElements.define('button-bar', ButtonBar);