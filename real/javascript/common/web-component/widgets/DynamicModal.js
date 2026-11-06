/**
 * @fileoverview DynamicModal.js
 * Componente modal generico y reutilizable para alertas, confirmaciones, prompts y modales personalizadas.
 * 
 * Estructura:
 * - Header (Shadow DOM): Titulo + boton cerrar (configurable)
 * - Body: Slot (Light DOM) para contenido del caller (create()/uso manual);
 *         contenido generado internamente (Shadow DOM) para los helpers
 *         estaticos alert/confirm/prompt, que no dependen del caller
 * - Footer (Shadow DOM): Botonera configurable
 * 
 * @example
 * // Modal personalizada
 * const modal = document.createElement('dynamic-modal');
 * modal.title = 'Mi Modal';
 * modal.buttons = [
 *     { label: 'Cancelar', variant: 'default', action: 'cancel' },
 *     { label: 'Aceptar', variant: 'primary', action: 'ok' }
 * ];
 * modal.innerHTML = '<p>Contenido de la modal</p>';
 * document.body.appendChild(modal);
 * modal.open();
 * 
 * // Metodos estaticos
 * await DynamicModal.alert('Mensaje de alerta');
 * const confirmed = await DynamicModal.confirm('Estas seguro?');
 * const value = await DynamicModal.prompt('Introduce un valor:', 'valor por defecto');
 */

class DynamicModal extends WidgetBase {
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
        
        this._isOpen = false;
        this._buttons = [];
        this._icon = null;
        this._resolvePromise = null;
        this._rejectPromise = null;
        this._initialized = false;

        // Reubicacion de la modal (escapar de iframes)
        this._activeDoc = null;   // documento donde vive la modal mientras esta abierta
        this._lockedBody = null;  // body cuyo scroll bloqueamos

        this._destroyOnClose = false; // se activa en create()

        // Accesibilidad: elemento que tenia el foco antes de abrir (para restaurarlo al cerrar)
        this._previousFocus = null;

        // WidgetBase mantiene visibility:hidden hasta que el CSS carga de forma
        // asincrona (ver onStylesLoaded); un elemento invisible no puede recibir
        // foco, asi que el foco inicial se pospone si aun no ha cargado.
        this._stylesReady = false;
        this._pendingFocus = null;

        // Bind de metodos
        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._handleBackdropClick = this._handleBackdropClick.bind(this);
        this._handleOutsideClick = this._handleOutsideClick.bind(this);
        this._handleGuardStart = this._handleGuardStart.bind(this);
        this._handleGuardEnd = this._handleGuardEnd.bind(this);
    }

    // =========================================================================
    // CSS
    // =========================================================================

    get componentCssName() {
        return 'dynamic-modal.css';
    }

    // =========================================================================
    // ATRIBUTOS OBSERVADOS
    // =========================================================================

    static get observedAttributes() {
        return [...super.observedAttributes, 'title', 'show-close', 'close-on-backdrop', 'close-on-escape', 'size', 'open',
            'backdrop', 'lock-scroll', 'trap-focus', 'anchor-side', 'close-on-outside-click',
            'size-x', 'size-y', 'pos-x', 'pos-y'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        super.attributeChangedCallback(name, oldVal, newVal);
        if (oldVal === newVal) return;
        
        switch (name) {
            case 'title':
                this._updateTitle();
                break;
            case 'show-close':
                this._updateCloseButton();
                break;
            case 'open':
                if (newVal !== null) {
                    this.open();
                } else {
                    this.close();
                }
                break;
            case 'size-x':
            case 'size-y':
            case 'pos-x':
            case 'pos-y':
                this._marcarColocacion();
                if (this._isOpen) this._aplicarCaja();
                break;
        }
    }

    // =========================================================================
    // PROPIEDADES
    // =========================================================================

    get title() { return this.getAttribute('title') || ''; }
    set title(val) { val ? this.setAttribute('title', val) : this.removeAttribute('title'); }

    get showClose() { return this.getAttribute('show-close') !== 'false'; }
    set showClose(val) { this.setAttribute('show-close', val ? 'true' : 'false'); }

    get closeOnBackdrop() { return this.getAttribute('close-on-backdrop') !== 'false'; }
    set closeOnBackdrop(val) { this.setAttribute('close-on-backdrop', val ? 'true' : 'false'); }

    get closeOnEscape() { return this.getAttribute('close-on-escape') !== 'false'; }
    set closeOnEscape(val) { this.setAttribute('close-on-escape', val ? 'true' : 'false'); }

    get size() { return this.getAttribute('size') || 'md'; }
    set size(val) { val ? this.setAttribute('size', val) : this.removeAttribute('size'); }

    /**
     * Fondo a pantalla completa. Por defecto true, como siempre.
     *
     * Con false el fondo se vuelve transparente y deja pasar los clics: la pagina de detras
     * sigue viendose y usandose. Es lo que convierte la modal en un panel flotante en vez de
     * un dialogo que interrumpe.
     */
    get backdrop() { return this.getAttribute('backdrop') !== 'false'; }
    set backdrop(val) { this.setAttribute('backdrop', val ? 'true' : 'false'); }

    /**
     * Cerrar al pinchar fuera. Por defecto false: es la unica de las nuevas que anade
     * comportamiento en vez de quitarlo, asi que hay que pedirla.
     *
     * closeOnBackdrop no vale para esto cuando no hay fondo: una modal anclada lo tiene
     * transparente y sin recibir clics, justo para que la pagina se siga usando. Aqui se
     * escucha el raton en el documento.
     */
    get closeOnOutsideClick() { return this.getAttribute('close-on-outside-click') === 'true'; }
    set closeOnOutsideClick(val) { this.setAttribute('close-on-outside-click', val ? 'true' : 'false'); }

    /** Bloquear el scroll de la pagina mientras esta abierta. Por defecto true. */
    get lockScroll() { return this.getAttribute('lock-scroll') !== 'false'; }
    set lockScroll(val) { this.setAttribute('lock-scroll', val ? 'true' : 'false'); }

    /**
     * Atrapar el tabulador dentro de la modal. Por defecto true.
     *
     * Correcto en un dialogo, que exige atencion; incorrecto en un panel anclado, del que
     * el usuario tiene que poder salir con Tab hacia la pagina.
     */
    get trapFocus() { return this.getAttribute('trap-focus') !== 'false'; }
    set trapFocus(val) { this.setAttribute('trap-focus', val ? 'true' : 'false'); }

    /**
     * Elemento junto al que colocarse. Sin el, la modal sale centrada como siempre.
     * Es una propiedad de JS, no un atributo: guarda una referencia al elemento.
     */
    get anchor() { return this._anchor || null; }
    set anchor(el) {
        this._anchor = el || null;
        if (el) { this.setAttribute('placement', 'anchor'); }
        else { this.removeAttribute('placement'); }
        if (this._isOpen) this._positionToAnchor();
    }

    /** Lado preferido respecto al ancla: 'left' | 'right' | 'auto' (por defecto). */
    get anchorSide() { return this.getAttribute('anchor-side') || 'auto'; }
    set anchorSide(val) { val ? this.setAttribute('anchor-side', val) : this.removeAttribute('anchor-side'); }

    /**
     * Documento destino donde se monta la modal al abrirse.
     * - 'top' (default): sube por la cadena de iframes hasta el documento mas
     *   alto accesible (mismo origen) y usa su body. Necesario porque el :host
     *   es position:fixed y, dentro de un iframe, quedaria confinado a el.
     * - 'local': se queda en el documento que la instancia (body del iframe).
     */
    /**
     * Ancho a medida. Opcional: sin el manda la clase de size, como siempre.
     * Admite numero (px), longitud CSS ('420px', '50vw', '30rem') o porcentaje del viewport.
     */
    get sizeX() { return this.getAttribute('size-x'); }
    set sizeX(val) { this._ponerMedida('size-x', val); }

    /** Alto a medida. Mismas unidades que sizeX. */
    get sizeY() { return this.getAttribute('size-y'); }
    set sizeY(val) { this._ponerMedida('size-y', val); }

    /**
     * Posicion horizontal. Opcional: sin ella la modal sigue centrada.
     * Admite numero (px desde el borde izquierdo), longitud CSS, palabra clave
     * ('left' | 'center' | 'right') o porcentaje DEL HUECO LIBRE, como background-position:
     * 0% pegada a la izquierda, 50% centrada, 100% pegada a la derecha.
     */
    get posX() { return this.getAttribute('pos-x'); }
    set posX(val) { this._ponerMedida('pos-x', val); }

    /** Posicion vertical. Igual que posX, con 'top' | 'center' | 'bottom'. */
    get posY() { return this.getAttribute('pos-y'); }
    set posY(val) { this._ponerMedida('pos-y', val); }

    _ponerMedida(attr, val) {
        if (val === null || val === undefined || val === '') this.removeAttribute(attr);
        else this.setAttribute(attr, String(val));
    }

    get bodyTarget() { return this.getAttribute('body-target') || 'top'; }
    set bodyTarget(val) { val ? this.setAttribute('body-target', val) : this.removeAttribute('body-target'); }

    get destroyOnClose() { return this._destroyOnClose; }
    set destroyOnClose(val) { this._destroyOnClose = !!val; }

    get isOpen() { return this._isOpen; }

    get buttons() { return this._buttons; }
    set buttons(val) {
        this._buttons = Array.isArray(val) ? val : [];
        this._renderButtons();
    }

    get icon() { return this._icon; }
    set icon(val) {
        this._icon = val || null;
        this._updateIcon();
    }

    // =========================================================================
    // CICLO DE VIDA
    // =========================================================================

    connectedCallback() {
        super.connectedCallback();
        this._render();
    }

    disconnectedCallback() {
        this._removeEventListeners();
    }

    // =========================================================================
    // RENDERIZADO
    // =========================================================================

    _render() {
        if (this._initialized) return;
        
        const T = window.Traduccion || {};
        
        this.shadow.innerHTML = `
            <div class="modal-backdrop" part="backdrop">
                <div class="modal-content" part="content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                    <div class="modal-focus-guard" tabindex="0" style="position:absolute;width:1px;height:1px;overflow:hidden;"></div>
                    <div class="modal-header" part="header">
                        <wc-icon class="modal-header-icon hidden"></wc-icon>
                        <span class="modal-title" id="modal-title"></span>
                        <button type="button" class="modal-close" aria-label="${T.CERRAR || 'Cerrar'}">&times;</button>
                    </div>
                    <div class="modal-body" part="body">
                        <div class="modal-generated-content"></div>
                        <slot></slot>
                    </div>
                    <div class="modal-footer" part="footer">
                        <div class="footer-left"></div>
                        <div class="footer-right"></div>
                    </div>
                    <div class="modal-focus-guard" tabindex="0" style="position:absolute;width:1px;height:1px;overflow:hidden;"></div>
                </div>
            </div>
        `;

        // Referencias
        const guards = this.shadow.querySelectorAll('.modal-focus-guard');
        this._els = {
            backdrop: this.shadow.querySelector('.modal-backdrop'),
            content: this.shadow.querySelector('.modal-content'),
            header: this.shadow.querySelector('.modal-header'),
            headerIcon: this.shadow.querySelector('.modal-header-icon'),
            title: this.shadow.querySelector('.modal-title'),
            closeBtn: this.shadow.querySelector('.modal-close'),
            body: this.shadow.querySelector('.modal-body'),
            generatedContent: this.shadow.querySelector('.modal-generated-content'),
            footer: this.shadow.querySelector('.modal-footer'),
            footerLeft: this.shadow.querySelector('.footer-left'),
            footerRight: this.shadow.querySelector('.footer-right'),
            guardStart: guards[0],
            guardEnd: guards[1]
        };

        // Actualizar estado inicial
        this._updateTitle();
        this._updateCloseButton();
        this._updateIcon();
        this._renderButtons();
        this._renderGeneratedContent();
        
        // Event listeners
        this._els.closeBtn.addEventListener('click', () => this.close('close'));
        
        this._initialized = true;
    }

    _updateTitle() {
        if (this._els?.title) {
            this._els.title.textContent = this.title;
            // Ocultar header si no hay titulo ni boton cerrar
            const showHeader = this.title || this.showClose;
            this._els.header.classList.toggle('hidden', !showHeader);
        }
    }

    _updateCloseButton() {
        if (this._els?.closeBtn) {
            this._els.closeBtn.classList.toggle('hidden', !this.showClose);
        }
    }

    _updateIcon() {
        const iconEl = this._els?.headerIcon;
        if (!iconEl) return;
        if (!this._icon) {
            iconEl.classList.add('hidden');
            return;
        }

        iconEl.size = 'lg';
        iconEl.borderColor = '#d1d5db';

        if (typeof this._icon === 'string') {
            iconEl.name = this._icon;
        } else if (typeof this._icon === 'object') {
            iconEl.configure(this._icon);
        }
        iconEl.classList.remove('hidden');
    }

    /**
     * Establece el contenido generado internamente (Shadow DOM) para los
     * helpers estaticos (alert/confirm/prompt). No usar para contenido del
     * caller: eso va por el slot (create()/uso manual con innerHTML/appendChild).
     * @param {HTMLElement|null} node
     */
    _setGeneratedContent(node) {
        this._generatedContentNode = node || null;
        this._renderGeneratedContent();
    }

    _renderGeneratedContent() {
        const container = this._els?.generatedContent;
        if (!container) return;
        container.innerHTML = '';
        if (this._generatedContentNode) container.appendChild(this._generatedContentNode);
    }

    _renderButtons() {
        if (!this._els?.footerLeft || !this._els?.footerRight) return;

        this._els.footerLeft.innerHTML = '';
        this._els.footerRight.innerHTML = '';

        if (!this._buttons.length) {
            this._els.footer.classList.add('hidden');
            return;
        }

        this._els.footer.classList.remove('hidden');
        let hasLeftBtn = false;

        this._buttons.forEach(btnConfig => {
            const btn = document.createElement('wc-button');
            
            // Extraer propiedades especiales que no van al configure
            const { position, action, onClick, ...configProps } = btnConfig;
            
            // Configurar boton usando el metodo configure de WCBaseElement
            btn.configure(configProps);

            // Handler de click
            btn.addEventListener('click', async () => {
                // Si hay onClick, ejecutarlo. Si retorna false, no cerrar la modal
                if (typeof onClick === 'function') {
                    const result = await onClick(this, action);
                    if (result === false) return; // Prevenir cierre si retorna false
                }
                
                if (action) {
                    this.close(action);
                }
            });

            // Posicion
            if (position === 'left') {
                hasLeftBtn = true;
                this._els.footerLeft.appendChild(btn);
            } else {
                this._els.footerRight.appendChild(btn);
            }
        });

        this._els.footer.classList.toggle('has-left-btn', hasLeftBtn);
    }

    // =========================================================================
    // REUBICACION (escapar de iframes)
    // =========================================================================

    /**
     * Resuelve el contenedor donde debe montarse la modal.
     * Prioridad: contenedor explicito (create({ appendTo })) > body-target.
     * @returns {HTMLElement}
     */
    _resolveContainer() {
        if (this.bodyTarget === 'local') return (this.ownerDocument || document).body;
        return window.top.document.body;
    }

    /**
     * Mueve la modal al contenedor resuelto si todavia no esta en el.
     * Funciona para cualquier via de creacion (HTML, JS manual, helpers).
     */
    _relocate() {
        const target = this._resolveContainer();
        if (target && this.parentNode !== target) {
            target.appendChild(this);
        }
    }

    // =========================================================================
    // METODOS PUBLICOS
    // =========================================================================

    /** Ventanas cuyo scroll o redimension mueven al ancla respecto a la modal. */
    _getAnchorWindows() {
        try {
            const anchorWin = (this._anchor && this._anchor.ownerDocument
                && this._anchor.ownerDocument.defaultView) || window;
            const modalWin = (this.ownerDocument && this.ownerDocument.defaultView) || window;
            return modalWin && modalWin !== anchorWin ? [anchorWin, modalWin] : [anchorWin];
        } catch (e) { return [window]; }
    }

    /**
     * Cuanto hay que desplazar las coordenadas del ancla para llevarlas al documento donde
     * se ha montado la modal.
     *
     * Por defecto la modal escapa de los iframes (bodyTarget "top"), asi que un ancla que
     * viva dentro de uno da coordenadas de otra ventana. Se sube iframe a iframe sumando
     * donde empieza cada uno.
     */
    _getAnchorOffset(anchor) {
        const offset = { x: 0, y: 0 };
        try {
            const anchorWin = (anchor.ownerDocument && anchor.ownerDocument.defaultView) || window;
            const modalWin = (this.ownerDocument && this.ownerDocument.defaultView) || window;
            if (anchorWin === modalWin) return offset;
            let win = anchorWin;
            let hops = 0;
            while (win && win !== modalWin && win.frameElement && hops++ < 10) {
                const frameRect = win.frameElement.getBoundingClientRect();
                offset.x += frameRect.left;
                offset.y += frameRect.top;
                win = win.parent;
            }
        } catch (e) { /* cross-origin: sin desfase */ }
        return offset;
    }

    /**
     * Coloca el contenido junto al ancla, sin salirse de la ventana.
     * No hace nada si no hay ancla: ahi manda el centrado de siempre.
     */
    _positionToAnchor() {
        const anchor = this._anchor;
        const content = this._els && this._els.content;
        if (!anchor || !content || !anchor.getBoundingClientRect) return;
        // Sin la hoja de estilos aplicada la caja no tiene todavia ni su ancho ni su
        // alto: colocarla ahora la dejaria donde no va. Ya lo repite onStylesLoaded.
        if (!this._stylesReady) return;

        const GAP = 12;
        const MARGIN = 8;
        const anchorRect = anchor.getBoundingClientRect();
        const offset = this._getAnchorOffset(anchor);
        const box = {
            left: anchorRect.left + offset.x, right: anchorRect.right + offset.x,
            top: anchorRect.top + offset.y, bottom: anchorRect.bottom + offset.y
        };

        const modalWin = (this.ownerDocument && this.ownerDocument.defaultView) || window;
        const vw = modalWin.innerWidth || modalWin.document.documentElement.clientWidth;
        const vh = modalWin.innerHeight || modalWin.document.documentElement.clientHeight;
        const width = content.offsetWidth || 0;
        const height = content.offsetHeight || 0;

        let side = this.anchorSide;
        if (side !== 'left' && side !== 'right') {
            const fitsRight = box.right + GAP + width <= vw;
            const fitsLeft = box.left - GAP - width >= 0;
            side = fitsRight ? 'right'
                : (fitsLeft ? 'left'
                    : (vw - box.right >= box.left ? 'right' : 'left'));
        }

        let left = side === 'right' ? box.right + GAP : box.left - GAP - width;
        left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));
        let top = box.top;
        if (height && top + height > vh - MARGIN) top = vh - height - MARGIN;
        top = Math.max(MARGIN, top);

        content.style.left = left + 'px';
        content.style.top = top + 'px';
    }

    /**
     * Si hay posicion a medida y no hay ancla, la modal deja de centrarse sola.
     * Solo la posicion cambia el modo: pedir unicamente un tamanyo NO descoloca nada,
     * porque el ancho y el alto en linea conviven con el centrado por flex.
     */
    _marcarColocacion() {
        if (this._anchor) return;                       // el ancla manda, ver _positionToAnchor

        var hayPos = this.getAttribute('pos-x') !== null || this.getAttribute('pos-y') !== null;
        if (hayPos) this.setAttribute('placement', 'manual');
        else if (this.getAttribute('placement') === 'manual') this.removeAttribute('placement');
    }

    /**
     * Traduce un valor a pixeles contra una referencia (el viewport, o el hueco libre).
     * Devuelve null si no hay nada que interpretar, para distinguir 'no lo pidio' de 0.
     */
    _resolverMedida(valor, referencia) {
        if (valor === null || valor === undefined || valor === '') return null;

        var v = String(valor).trim().toLowerCase();

        // Palabras clave de posicion: los tres sitios de siempre.
        if (v === 'left' || v === 'top' || v === 'start') return 0;
        if (v === 'center' || v === 'centro') return referencia * 0.5;
        if (v === 'right' || v === 'bottom' || v === 'end') return referencia;

        if (v.slice(-1) === '%') {
            var pct = parseFloat(v);
            return isNaN(pct) ? null : referencia * (pct / 100);
        }

        // Unidades que dependen de la ventana: se resuelven aqui porque hace falta el numero
        // en px para poder encajar la caja dentro de la pantalla.
        var win = (this.ownerDocument && this.ownerDocument.defaultView) || window;
        var num = parseFloat(v);
        if (isNaN(num)) return null;

        if (v.indexOf('vw') > -1) return win.innerWidth * (num / 100);
        if (v.indexOf('vh') > -1) return win.innerHeight * (num / 100);
        if (v.indexOf('rem') > -1 || v.indexOf('em') > -1) {
            var raiz = parseFloat(win.getComputedStyle(this.ownerDocument.documentElement).fontSize) || 16;
            return num * raiz;
        }

        return num;                                     // px, con o sin la unidad escrita
    }

    /**
     * Aplica el tamanyo y la posicion a medida. Todo opcional y todo independiente.
     *
     * Cuando solo llega una de las dos medidas, se completa la otra con un criterio que no
     * deforma la modal:
     *
     *   solo sizeX  -> el alto se saca de la proporcion que la modal tenia por si misma
     *   solo sizeY  -> idem con el ancho
     *   solo posX   -> el eje que falta se queda centrado
     *   solo posY   -> idem
     *
     * Lo proporcional se mide ANTES de tocar nada, asi que la referencia es la caja real que
     * habria tenido con su clase de size. Luego se recorta a la pantalla, porque una modal
     * fuera de cuadro no se puede ni cerrar.
     */
    _aplicarCaja() {
        var content = this._els && this._els.content;
        if (!content) return;

        var sx = this.getAttribute('size-x');
        var sy = this.getAttribute('size-y');
        var px = this.getAttribute('pos-x');
        var py = this.getAttribute('pos-y');

        if (sx === null && sy === null && px === null && py === null) {
            this._limpiarCaja();
            return;
        }

        // Sin la hoja aplicada la caja no mide lo que medira: mismo motivo que en el ancla.
        if (!this._stylesReady) return;

        var MARGEN = 8;
        var win = (this.ownerDocument && this.ownerDocument.defaultView) || window;
        var vw = win.innerWidth || win.document.documentElement.clientWidth;
        var vh = win.innerHeight || win.document.documentElement.clientHeight;

        // La caja tal y como es antes de que la toquemos.
        var naturalW = content.offsetWidth || 0;
        var naturalH = content.offsetHeight || 0;
        var proporcion = (naturalW > 0 && naturalH > 0) ? (naturalH / naturalW) : null;

        var ancho = this._resolverMedida(sx, vw);
        var alto = this._resolverMedida(sy, vh);

        // Completar la medida que falte sin deformar, pero sin ahogar el contenido: si la
        // proporcion sale MENOR que lo que la caja media por si misma, se respeta lo suyo.
        // Estrechar una modal no puede dejarla sin alto, que es lo que pasaba al pedir solo
        // un ancho pequenyo: 380 sobre una caja de 480x160 daba 126px y no cabia ni el texto.
        if (ancho !== null && alto === null && proporcion) alto = Math.max(ancho * proporcion, naturalH);
        else if (alto !== null && ancho === null && proporcion) ancho = Math.max(alto / proporcion, naturalW);

        if (ancho !== null) {
            ancho = Math.max(0, Math.min(ancho, vw - MARGEN * 2));
            content.style.width = ancho + 'px';
            content.style.maxWidth = 'none';            // la clase de size trae su propio tope
        }
        if (alto !== null) {
            alto = Math.max(0, Math.min(alto, vh - MARGEN * 2));
            content.style.height = alto + 'px';
            content.style.maxHeight = 'none';
        }

        // Con ancla el sitio lo decide _positionToAnchor, que manda sobre pos-x / pos-y. Pero si
        // acabamos de cambiarle el tamanyo hay que recalcularlo: lo habia medido con el ancho
        // anterior, y en un resize su listener corre ANTES que este.
        if (this._anchor) {
            if (ancho !== null || alto !== null) this._positionToAnchor();
            return;
        }

        // Posicion. Si no se pidio, aqui no se toca nada: la modal sigue centrada por flex.
        if (px === null && py === null) return;

        // Medidas finales, ya con el tamanyo puesto.
        var w = content.offsetWidth || naturalW;
        var h = content.offsetHeight || naturalH;

        // El hueco libre es la referencia de los porcentajes: 50% centra, igual que en
        // background-position. Es lo que hace que 'center' y '50%' signifiquen lo mismo.
        var huecoX = Math.max(0, vw - w);
        var huecoY = Math.max(0, vh - h);

        var left = this._resolverMedida(px, huecoX);
        var top = this._resolverMedida(py, huecoY);

        if (left === null) left = huecoX / 2;           // falta un eje: se queda centrado
        if (top === null) top = huecoY / 2;

        left = Math.max(MARGEN, Math.min(left, vw - w - MARGEN));
        top = Math.max(MARGEN, Math.min(top, vh - h - MARGEN));

        content.style.left = left + 'px';
        content.style.top = top + 'px';
    }

    /** Si se pidio alguna de las cuatro medidas. */
    _tieneCajaAMedida() {
        return this.getAttribute('size-x') !== null
            || this.getAttribute('size-y') !== null
            || this.getAttribute('pos-x') !== null
            || this.getAttribute('pos-y') !== null;
    }

    /** Devuelve .modal-content a lo que diga el CSS. */
    _limpiarCaja() {
        var content = this._els && this._els.content;
        if (!content) return;

        content.style.width = '';
        content.style.height = '';
        content.style.maxWidth = '';
        content.style.maxHeight = '';
        if (!this._anchor) {
            content.style.left = '';
            content.style.top = '';
        }
    }

    /**
     * Abre la modal
     * @returns {Promise} Promesa que se resuelve cuando la modal se cierra
     */
    open() {
        if (this._isOpen) return Promise.resolve();

        // Accesibilidad: guardar el elemento con foco para restaurarlo al cerrar.
        // Se captura antes de reubicar la modal (sigue en el documento original).
        this._previousFocus = this._getDeepActiveElement(this.ownerDocument || document);

        // Montar la modal en el body correcto antes de mostrarla.
        // Por defecto escapa de iframes (documento mas alto); con
        // body-target="local" se queda en el documento que la instancia.
        this._relocate();

        this._isOpen = true;
        this.setAttribute('open', '');

        // Documento donde vive la modal una vez reubicada
        this._activeDoc = this.ownerDocument || document;

        // Prevenir scroll del body donde se muestra la modal. Un panel anclado no debe
        // hacerlo: la pagina de detras se sigue usando.
        if (this.lockScroll) {
            this._lockedBody = this._activeDoc.body;
            if (this._lockedBody) this._lockedBody.style.overflow = 'hidden';
        }

        // Event listeners
        this._addEventListeners();

        // Con ancla, el sitio se calcula cuando ya se puede medir el contenido.
        if (this._anchor) {
            this._positionToAnchor();
            this._reposition = () => { if (this._isOpen) this._positionToAnchor(); };
            // Segunda pasada: la hoja de estilos del widget puede llegar despues de la
            // primera medida, y entonces el ancho con el que se coloco ya no es el suyo.
            setTimeout(this._reposition, 0);
            this._anchorWindows = this._getAnchorWindows();
            this._anchorWindows.forEach((win) => {
                try {
                    win.addEventListener('resize', this._reposition);
                    win.addEventListener('scroll', this._reposition, true);
                } catch (e) { /* noop */ }
            });
        }

        // Tamanyo y posicion a medida. Si no se pidio ninguno de los cuatro, no toca nada.
        this._marcarColocacion();
        this._aplicarCaja();

        if (this._tieneCajaAMedida()) {
            var ventana = (this.ownerDocument && this.ownerDocument.defaultView) || window;
            this._recolocarCaja = () => { if (this._isOpen) this._aplicarCaja(); };
            try { ventana.addEventListener('resize', this._recolocarCaja); } catch (e) { /* noop */ }
            this._ventanaCaja = ventana;
        }

        // Focus en el primer input o boton (contenido generado en shadow, o slot en light DOM)
        this._focusInitialElement();

        // Dispatch event
        this.dispatchEvent(new CustomEvent('modal-open', { bubbles: true, composed: true }));

        // Retornar promesa
        return new Promise((resolve, reject) => {
            this._resolvePromise = resolve;
            this._rejectPromise = reject;
        });
    }

    /**
     * Cierra la modal
     * @param {string} action - Accion que provoco el cierre ('ok', 'cancel', 'close', etc.)
     */
    close(action = 'close') {
        if (!this._isOpen) return;

        this._isOpen = false;
        this.removeAttribute('open');

        // Restaurar scroll del body que bloqueamos al abrir
        if (this._lockedBody) {
            this._lockedBody.style.overflow = '';
            this._lockedBody = null;
        }

        if (this._anchorWindows && this._reposition) {
            this._anchorWindows.forEach((win) => {
                try {
                    win.removeEventListener('resize', this._reposition);
                    win.removeEventListener('scroll', this._reposition, true);
                } catch (e) { /* noop */ }
            });
            this._anchorWindows = null;
            this._reposition = null;
        }

        if (this._ventanaCaja && this._recolocarCaja) {
            try { this._ventanaCaja.removeEventListener('resize', this._recolocarCaja); } catch (e) { /* noop */ }
            this._ventanaCaja = null;
            this._recolocarCaja = null;
        }

        // La caja a medida se suelta al cerrar: si la modal se reutiliza con otra
        // configuracion, no debe arrastrar el tamanyo de la vez anterior.
        this._limpiarCaja();

        // Remover event listeners
        this._removeEventListeners();

        // Resolver promesa
        if (this._resolvePromise) {
            this._resolvePromise(action);
            this._resolvePromise = null;
            this._rejectPromise = null;
        }

        // Accesibilidad: devolver el foco al elemento que abrio la modal
        if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
            try {
                this._previousFocus.focus();
            } catch (e) {
                // El elemento pudo eliminarse del DOM mientras la modal estaba abierta
            }
        }
        this._previousFocus = null;

        // Dispatch event
        this.dispatchEvent(new CustomEvent('modal-close', {
            bubbles: true,
            composed: true,
            detail: { action }
        }));

        // Auto-destruir si esta configurado (excepto si viene de destroy() para evitar recursion)
        if (this._destroyOnClose && action !== 'destroy') {
            this.remove();
        }
    }

    /**
     * Destruye la modal y la elimina del DOM
     */
    destroy() {
        this.close('destroy');
        this.remove();
    }

    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================

    _addEventListeners() {
        const doc = this._activeDoc || this.ownerDocument || document;
        doc.addEventListener('keydown', this._handleKeyDown);
        this._els?.backdrop?.addEventListener('click', this._handleBackdropClick);
        // Focus trap: los guards capturan el Tab que intenta salir de la modal
        // La trampa de tabulador es de dialogo: un panel anclado tiene que dejar salir.
        if (this.trapFocus) {
            this._els?.guardStart?.addEventListener('focus', this._handleGuardStart);
            this._els?.guardEnd?.addEventListener('focus', this._handleGuardEnd);
        }
        if (this.closeOnOutsideClick) {
            // En captura y sobre mousedown: asi se entera aunque el clic lo pare algo por
            // el camino, y antes de que la pagina reaccione al gesto.
            this._outsideDocs = this._docsDelGesto();
            this._outsideDocs.forEach((d) => {
                try { d.addEventListener('mousedown', this._handleOutsideClick, true); }
                catch (e) { /* noop */ }
            });
        }
    }

    _removeEventListeners() {
        const doc = this._activeDoc || this.ownerDocument || document;
        doc.removeEventListener('keydown', this._handleKeyDown);
        if (this._els?.backdrop) {
            this._els.backdrop.removeEventListener('click', this._handleBackdropClick);
        }
        this._els?.guardStart?.removeEventListener('focus', this._handleGuardStart);
        this._els?.guardEnd?.removeEventListener('focus', this._handleGuardEnd);
        (this._outsideDocs || []).forEach((d) => {
            try { d.removeEventListener('mousedown', this._handleOutsideClick, true); }
            catch (e) { /* noop */ }
        });
        this._outsideDocs = null;
    }

    _handleKeyDown(e) {
        if (e.key === 'Escape' && this.closeOnEscape) {
            e.preventDefault();
            this.close('escape');
        }
    }

    /**
     * Documentos por los que puede llegar el gesto: el de la modal y, si el ancla vive en
     * otro (la pagina dentro de un iframe), tambien el suyo. Sin el segundo, pinchar en la
     * pagina no cerraria nada.
     */
    _docsDelGesto() {
        const docs = [];
        try {
            const propio = this.ownerDocument || document;
            docs.push(propio);
            const delAncla = this._anchor && this._anchor.ownerDocument;
            if (delAncla && delAncla !== propio) docs.push(delAncla);
        } catch (e) { return [document]; }
        return docs.length ? docs : [document];
    }

    /**
     * Cierra si el gesto ha caido fuera. Quedan fuera de esa cuenta:
     * - la propia modal, con su contenido;
     * - el elemento que la abrio, o volver a pulsarlo la cerraria y la reabriria;
     * - cualquier otra modal, para que un aviso encima no se lleve por delante la de abajo.
     */
    _handleOutsideClick(e) {
        if (!this._isOpen || !e) return;
        const destino = e.target;
        if (!destino) return;
        try {
            // Ojo con contains(): devuelve true cuando el nodo es el propio host, y el
            // host cubre la ventana entera. Sin esta distincion, cualquier clic fuera
            // contaba como si fuera dentro de la modal.
            if (destino !== this && this.contains(destino)) return;
            if (this._anchor && this._anchor.contains && this._anchor.contains(destino)) return;
            if (destino.closest && destino.closest('dynamic-modal')) return;
        } catch (eDom) { return; }
        this.close('outside');
    }

    _handleBackdropClick(e) {
        if (e.target === this._els.backdrop && this.closeOnBackdrop) {
            this.close('backdrop');
        }
    }

    // =========================================================================
    // ACCESIBILIDAD: FOCUS TRAP
    // =========================================================================

    /**
     * El guard inicial recibe foco al hacer Shift+Tab desde el primer elemento:
     * se redirige el foco al ultimo elemento focusable de la modal (ciclo).
     */
    _handleGuardStart() {
        this._focusLast();
    }

    /**
     * El guard final recibe foco al hacer Tab desde el ultimo elemento:
     * se redirige el foco al primer elemento focusable de la modal (ciclo).
     */
    _handleGuardEnd() {
        this._focusFirst();
    }

    /**
     * Devuelve los elementos focusables de la modal en orden de tabulacion:
     * boton cerrar (header, shadow) -> contenido generado (shadow, alert/confirm/prompt)
     * o contenido del slot (light DOM, create()/uso manual) -> botones del footer (shadow).
     * Excluye los guards (que viven en el shadow y no se seleccionan desde light DOM).
     * @returns {HTMLElement[]}
     */
    _getFocusableElements() {
        const els = [];

        // 1. Boton cerrar del header (shadow)
        if (this.showClose && this._els?.closeBtn && !this._els.closeBtn.classList.contains('hidden')) {
            els.push(this._els.closeBtn);
        }

        const selector = 'a[href], button:not([disabled]), input:not([disabled]), ' +
            'textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), ' +
            'wc-input, wc-select, wc-textarea, wc-checkbox, wc-radio-group, ' +
            'wc-datepicker, wc-range, wc-rich-text, wc-image, wc-button';

        // 2a. Contenido generado internamente (shadow) - alert/confirm/prompt
        if (this._els?.generatedContent) {
            els.push(...this._els.generatedContent.querySelectorAll(selector));
        }

        // 2b. Contenido proyectado en el slot (light DOM) en orden de aparicion - create()/uso manual
        els.push(...this.querySelectorAll(selector));

        // 3. Botones del footer (shadow)
        if (this._els?.footer) {
            els.push(...this._els.footer.querySelectorAll('wc-button, button:not([disabled])'));
        }

        return els.filter(el => el.getAttribute('aria-hidden') !== 'true');
    }

    _focusFirst() {
        const focusables = this._getFocusableElements();
        if (focusables.length) focusables[0].focus();
    }

    _focusLast() {
        const focusables = this._getFocusableElements();
        if (focusables.length) focusables[focusables.length - 1].focus();
    }

    /**
     * Obtiene el elemento realmente enfocado atravesando shadow roots anidados.
     * @param {Document} doc - Documento donde empezar la busqueda
     * @returns {HTMLElement|null}
     */
    _getDeepActiveElement(doc = document) {
        let active = doc.activeElement;
        while (active && active.shadowRoot && active.shadowRoot.activeElement) {
            active = active.shadowRoot.activeElement;
        }
        return active;
    }

    /**
     * Enfoca el primer input/textarea/select (contenido generado en shadow, o
     * slot en light DOM) o, en su defecto, el primer boton del footer.
     * Se pospone hasta que el CSS haya cargado (ver onStylesLoaded): mientras
     * WidgetBase mantiene visibility:hidden en el host, nada dentro puede
     * recibir foco.
     */
    _focusInitialElement() {
        const applyFocus = () => {
            const inputSelector = 'input, textarea, select, wc-input, wc-select, wc-textarea';
            const focusable = this._els?.generatedContent?.querySelector(inputSelector)
                || this.querySelector(inputSelector);
            if (focusable) {
                focusable.focus();
            } else {
                const firstBtn = this._els?.footerRight?.querySelector('wc-button');
                if (firstBtn) firstBtn.focus();
            }
        };

        if (this._stylesReady) {
            requestAnimationFrame(applyFocus);
        } else {
            this._pendingFocus = applyFocus;
        }
    }

    /**
     * Hook invocado por WidgetBase.loadLocalStyles() cuando el CSS ha terminado
     * de cargar y el host deja de estar oculto (visibility:hidden).
     */
    onStylesLoaded() {
        this._stylesReady = true;
        // Primer momento en que la caja mide lo que de verdad mide.
        if (this._isOpen && this._anchor) {
            requestAnimationFrame(() => this._positionToAnchor());
        }
        if (this._isOpen && this._tieneCajaAMedida()) {
            requestAnimationFrame(() => this._aplicarCaja());
        }
        if (this._pendingFocus && this._isOpen) {
            const fn = this._pendingFocus;
            this._pendingFocus = null;
            requestAnimationFrame(fn);
        } else {
            this._pendingFocus = null;
        }
    }

    // =========================================================================
    // METODOS ESTATICOS (HELPERS)
    // =========================================================================

    /**
     * Muestra una alerta
     * @param {string} message - Mensaje a mostrar
     * @param {Object} options - Opciones adicionales
     * @returns {Promise<string>} Promesa que se resuelve cuando se cierra
     */
    static alert(message, options = {}) {
        const T = window.Traduccion || {};

        const modal = document.createElement('dynamic-modal');
        if (options.id) modal.id = options.id;
        modal.title = options.title || T.AVISO || 'Aviso';
        modal.size = options.size || 'auto';
        modal.showClose = options.showClose !== false;
        // El mensaje se escapa por defecto; allowHtml: true permite HTML construido por el caller (bajo su responsabilidad)
        const messageEl = document.createElement('p');
        messageEl.className = 'modal-message';
        messageEl.innerHTML = options.allowHtml ? message : WidgetBase.escapeHtml(message);
        modal._setGeneratedContent(messageEl);
        modal.buttons = [
            {
                label: options.okText || T.ACEPTAR || 'Aceptar',
                variant: 'primary',
                action: 'ok'
            }
        ];

        modal._resolveContainer().appendChild(modal);

        return modal.open().then(action => {
            modal.destroy();
            return action;
        });
    }

    /**
     * Muestra una confirmacion
     * @param {string} message - Mensaje a mostrar
     * @param {Object} options - Opciones adicionales
     * @returns {Promise<boolean>} true si confirma, false si cancela
     */
    static confirm(message, options = {}) {
        const T = window.Traduccion || {};

        const modal = document.createElement('dynamic-modal');
        if (options.id) modal.id = options.id;
        modal.title = options.title || T.CONFIRMAR || 'Confirmar';
        modal.size = options.size || 'auto';
        modal.showClose = options.showClose !== false;
        // El mensaje se escapa por defecto; allowHtml: true permite HTML construido por el caller (bajo su responsabilidad)
        const messageEl = document.createElement('p');
        messageEl.className = 'modal-message';
        messageEl.innerHTML = options.allowHtml ? message : WidgetBase.escapeHtml(message);
        modal._setGeneratedContent(messageEl);
        modal.buttons = [
            {
                label: options.okText || T.ACEPTAR || 'Aceptar',
                variant: 'primary',
                action: 'ok'
            },
            {
                label: options.cancelText || T.CANCELAR || 'Cancelar',
                variant: 'secondary',
                action: 'cancel'
            }
        ];

        modal._resolveContainer().appendChild(modal);

        return modal.open().then(action => {
            modal.destroy();
            return action === 'ok';
        });
    }

    /**
     * Muestra un prompt para introducir un valor
     * @param {string} message - Mensaje/etiqueta
     * @param {string} defaultValue - Valor por defecto
     * @param {Object} options - Opciones adicionales
     * @returns {Promise<string|null>} Valor introducido o null si cancela
     */
    static prompt(message, defaultValue = '', options = {}) {
        const T = window.Traduccion || {};

        const modal = document.createElement('dynamic-modal');
        if (options.id) modal.id = options.id;
        modal.title = options.title || '';
        modal.size = options.size || 'auto';
        modal.showClose = options.showClose !== false;

        // Crear contenido con wc-input (contenido generado internamente, no del caller)
        const container = document.createElement('div');
        container.className = 'modal-prompt-wrapper';

        const label = document.createElement('label');
        label.className = 'modal-prompt-label';
        label.innerHTML = options.allowHtml ? message : WidgetBase.escapeHtml(message);
        container.appendChild(label);

        const input = document.createElement('wc-input');
        input.type = options.type || 'text';
        input.value = defaultValue;
        input.placeholder = options.placeholder || '';
        if (options.required) input.required = true;

        container.appendChild(input);
        modal._setGeneratedContent(container);

        // Funcion de validacion para required
        const validateAndClose = () => {
            if (options.required && !input.value.trim()) {
                input.setAttribute('error', '');
                input.focus();
                return false;
            }
            return true;
        };
        
        // Capturar Enter en el input
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (validateAndClose()) {
                    modal.close('ok');
                }
            }
        });
        
        // Limpiar error al escribir
        input.addEventListener('input', () => {
            input.removeAttribute('error');
        });
        
        modal.buttons = [
            { 
                label: options.okText || T.ACEPTAR || 'Aceptar', 
                variant: 'primary', 
                action: 'ok',
                onClick: () => validateAndClose()
            },
            {
                label: options.cancelText || T.CANCELAR || 'Cancelar',
                variant: 'secondary',
                action: 'cancel'
            }
        ];
        
        modal._resolveContainer().appendChild(modal);

        return modal.open().then(action => {
            const value = action === 'ok' ? input.value : null;
            modal.destroy();
            return value;
        });
    }

    /**
     * Crea y muestra una modal personalizada
     * @param {Object} config - Configuracion de la modal
     * @returns {DynamicModal} Instancia de la modal
     */
    static create(config = {}) {
        const modal = document.createElement('dynamic-modal');

        if (config.id) modal.id = config.id;
        if (config.title) modal.title = config.title;
        if (config.icon) modal.icon = config.icon;
        if (config.size) modal.size = config.size;
        if (config.showClose !== undefined) modal.showClose = config.showClose;
        if (config.closeOnBackdrop !== undefined) modal.closeOnBackdrop = config.closeOnBackdrop;
        if (config.closeOnEscape !== undefined) modal.closeOnEscape = config.closeOnEscape;
        if (config.closeOnOutsideClick !== undefined) modal.closeOnOutsideClick = config.closeOnOutsideClick;
        if (config.bodyTarget) modal.bodyTarget = config.bodyTarget;
        if (config.backdrop !== undefined) modal.backdrop = config.backdrop;
        if (config.lockScroll !== undefined) modal.lockScroll = config.lockScroll;
        if (config.trapFocus !== undefined) modal.trapFocus = config.trapFocus;
        if (config.anchorSide) modal.anchorSide = config.anchorSide;
        if (config.sizeX !== undefined) modal.sizeX = config.sizeX;
        if (config.sizeY !== undefined) modal.sizeY = config.sizeY;
        if (config.posX !== undefined) modal.posX = config.posX;
        if (config.posY !== undefined) modal.posY = config.posY;
        // El ancla va DESPUES del resto: su setter ya coloca si la modal esta abierta.
        if (config.anchor) modal.anchor = config.anchor;
        modal.destroyOnClose = config.destroyOnClose !== false; // default true
        if (config.buttons) modal.buttons = config.buttons;
        
        if (config.content) {
            if (typeof config.content === 'string') {
                modal.innerHTML = config.content;
            } else if (config.content instanceof HTMLElement) {
                modal.appendChild(config.content);
            }
        }
        
        const container = config.appendTo instanceof HTMLElement
            ? config.appendTo
            : modal._resolveContainer();
        container.appendChild(modal);

        if (config.autoOpen !== false) {
            modal.open();
        }
        
        return modal;
    }
}

// Registrar el componente
if (!customElements.get('dynamic-modal')) customElements.define('dynamic-modal', DynamicModal);

// Exportar para uso global
window.DynamicModal = DynamicModal;
