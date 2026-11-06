class WCButton extends WCBaseElement {
    constructor() {
        super();
    }

    /**
     * Atributos HTML observados. Cualquier cambio dispara attributeChangedCallback → _render().
     * Las propiedades JS puras (callback, callerContext) no se incluyen aquí.
     * @returns {string[]}
     */
    static get observedAttributes() {
        return [
            'variant', 'size', 'shape', 'appearance',
            'label', 'icon', 'icon-pos', 'title',
            'type', 'class',
            'disabled', 'full-width', 'text-out',
            'label-align', 'min-width',
            'aria-label', 'aria-pressed', 'aria-expanded',
            'loading', 'loading-style', 'badge', 'badge-color', 'badge-icon',
            'color-bg', 'icon-color', 'text-color', 'border-color',
        ];
    }

    /**
     * Callback ejecutado cuando cambia un atributo observado.
     * @param {string} name - Nombre del atributo.
     * @param {string} oldVal - Valor anterior.
     * @param {string} newVal - Nuevo valor.
     */
    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;
        // Los ARIA se reflejan en el <button> interno sin re-render completo
        // (evita reconstruir el boton en cada cambio de estado de toolbar, etc.)
        if (name === 'aria-label' || name === 'aria-pressed' || name === 'aria-expanded') {
            this._syncAria();
            return;
        }
        // Colores personalizados: solo actualizar inline styles, sin re-render
        if (name === 'color-bg' || name === 'icon-color' || name === 'text-color' || name === 'border-color') {
            this._applyCustomColors();
            return;
        }
        this._render();
    }

    /**
     * Callback ejecutado cuando el componente se añade al DOM.
     */
    connectedCallback() {
        super.connectedCallback();
        this._render();
    }

    /**
     * Texto visible del botón.
     * @returns {string}
     */
    get label() { return this.getAttribute('label') || ''; }
    set label(v) { this.setAttribute('label', v); }

    /**
     * Ícono del botón. Acepta SVG crudo, clases CSS ('fa fa-save') o emoji.
     * @returns {string}
     */
    get icon() { return this.getAttribute('icon') || ''; }
    set icon(v) { v ? this.setAttribute('icon', v) : this.removeAttribute('icon'); }

    /**
     * Posición del ícono respecto al label. Valores: 'left' | 'right' | 'bottom' | 'top'.
     * @returns {string}
     */
    get iconPos() { return this.getAttribute('icon-pos') || 'left'; }
    set iconPos(v) { v ? this.setAttribute('icon-pos', v) : this.removeAttribute('icon-pos'); }

    get textOut() {
        return this.hasAttribute('text-out');
    }

    set textOut(v) {
        v ? this.setAttribute('text-out', '') : this.removeAttribute('text-out');
    }

    /**
     * Variante de color. Mapea a clase CSS 'wcb-variant-{valor}'.
     * Valores típicos: 'primary' | 'secondary' | 'danger' | 'light' | 'ghost'.
     * @returns {string}
     */
    get variant() { return this.getAttribute('variant') || 'light'; }
    set variant(v) { this.setAttribute('variant', v); }

    /**
     * Tamaño del botón. Mapea a clase CSS 'wcb-size-{valor}'.
     * Valores típicos: 'xs' | 'sm' | 'md' | 'lg' | 'xl'.
     * @returns {string}
     */
    get size() { return this.getAttribute('size') || 'md'; }
    set size(v) { this.setAttribute('size', v); }

    /**
     * Forma del botón. Mapea a clase CSS 'wcb-shape-{valor}'.
     * Valores típicos: 'rounded' | 'pill'.
     * @returns {string}
     */
    get shape() { return this.getAttribute('shape') || ''; }
    set shape(v) { v ? this.setAttribute('shape', v) : this.removeAttribute('shape'); }

    /**
     * Variante de apariencia complementaria (ej: 'stacked').
     * @returns {string}
     */
    get appearance() { return this.getAttribute('appearance') || ''; }
    set appearance(v) { v ? this.setAttribute('appearance', v) : this.removeAttribute('appearance'); }

    /**
     * Clases CSS extra añadidas al <button> interno.
     * También activa el modo máscara (wcb-has-mask) si no hay icon explícito.
     * @returns {string}
     */
    get extraClass() { return this.getAttribute('class') || ''; }
    set extraClass(v) { this.setAttribute('class', v); }

    /**
     * Si es true, el botón ocupa el 100% del ancho del contenedor.
     * Booleano puro: su presencia como atributo equivale a true.
     * @returns {boolean}
     */
    get fullWidth() { return this.hasAttribute('full-width'); }
    set fullWidth(v) { v ? this.setAttribute('full-width', '') : this.removeAttribute('full-width'); }

    /**
     * Deshabilita el botón visual y funcionalmente.
     * Booleano puro: su presencia como atributo equivale a true.
     * @returns {boolean}
     */
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    /**
     * Tipo nativo del <button> interno. Valores: 'button' | 'submit' | 'reset'.
     * @returns {string}
     */
    get type() { return this.getAttribute('type') || 'button'; }
    set type(v) { this.setAttribute('type', v); }

    /**
     * Alineacion horizontal del contenido del boton.
     * Util cuando el boton tiene mas ancho que su contenido (ej: full-width).
     * Valores: 'left' | 'center' | 'right'. Default: 'center'.
     * @returns {string}
     */
    get labelAlign() { return this.getAttribute('label-align') || 'center'; }
    set labelAlign(v) { v && v !== 'center' ? this.setAttribute('label-align', v) : this.removeAttribute('label-align'); }

    /**
     * Ancho minimo del boton. Acepta cualquier valor CSS valido (ej: '40px', '3rem', '100%').
     * Util para igualar el ancho de varios botones independientemente de su contenido.
     * @returns {string}
     */
    get minWidth() { return this.getAttribute('min-width') || ''; }
    set minWidth(v) { v ? this.setAttribute('min-width', v) : this.removeAttribute('min-width'); }

    /** Activa el estado de carga. Booleano: presencia = true. */
    get loading() { return this.hasAttribute('loading'); }
    set loading(v) { v ? this.setAttribute('loading', '') : this.removeAttribute('loading'); }

    /** Estilo del indicador de carga: 'spinner' (defecto) | 'pulse'. */
    get loadingStyle() { return this.getAttribute('loading-style') || 'spinner'; }
    set loadingStyle(v) { v ? this.setAttribute('loading-style', v) : this.removeAttribute('loading-style'); }

    /**
     * Badge de novedades. null = sin badge.
     * Valores: '' | 'dot' → punto; 'pulse' → punto pulsante; número → píldora con número.
     */
    get badge() { return this.getAttribute('badge'); }
    set badge(v) {
        if (v === null || v === undefined || v === false) this.removeAttribute('badge');
        else this.setAttribute('badge', v === true ? '' : String(v));
    }

    /** Color del badge: '' | 'red' | 'danger' (defecto rojo) | 'yellow' | 'warning' | 'green' | 'success'. */
    get badgeColor() { return this.getAttribute('badge-color') || ''; }
    set badgeColor(v) { v ? this.setAttribute('badge-color', v) : this.removeAttribute('badge-color'); }

    /**
     * Icono del catálogo (icon-catalog.css) dentro del badge: en vez del punto o el número pinta un círculo con el
     * icono. Solo se ve si además hay badge.
     */
    get badgeIcon() { return this.getAttribute('badge-icon') || ''; }
    set badgeIcon(v) { v ? this.setAttribute('badge-icon', v) : this.removeAttribute('badge-icon'); }

    /**
     * Esquina del badge: 'top' (defecto, superior derecha) | 'bottom' (inferior derecha).
     * Lo resuelve el CSS sobre el atributo del host: cambiarlo no re-renderiza el botón.
     */
    get badgePosition() { return this.getAttribute('badge-position') === 'bottom' ? 'bottom' : 'top'; }
    set badgePosition(v) { v === 'bottom' ? this.setAttribute('badge-position', 'bottom') : this.removeAttribute('badge-position'); }

    /** Color de fondo personalizado. Sobreescribe el background y border-color de la variante activa. */
    get colorBg() { return this.getAttribute('color-bg'); }
    set colorBg(v) { v ? this.setAttribute('color-bg', v) : this.removeAttribute('color-bg'); }

    /** Color de borde personalizado. Si no se indica, usa color-bg como borde (comportamiento por defecto). */
    get borderColor() { return this.getAttribute('border-color'); }
    set borderColor(v) { v ? this.setAttribute('border-color', v) : this.removeAttribute('border-color'); }

    /** Color del icono personalizado. Sobreescribe el color del pseudo-elemento ::before de .wcb-mask-icon. */
    get iconColor() { return this.getAttribute('icon-color'); }
    set iconColor(v) { v ? this.setAttribute('icon-color', v) : this.removeAttribute('icon-color'); }

    /** Color del texto del label. Independiente del fondo y del icono. */
    get textColor() { return this.getAttribute('text-color'); }
    set textColor(v) { v ? this.setAttribute('text-color', v) : this.removeAttribute('text-color'); }

    /** Muestra el SVG con sus colores originales en lugar de aplicar máscara monocroma. */
    get iconOriginal() { return this.hasAttribute('icon-original'); }
    set iconOriginal(v) { v ? this.setAttribute('icon-original', '') : this.removeAttribute('icon-original'); }

    // ===========================================
    // RENDERIZADO
    // ===========================================

    /**
     * Re-renderiza el contenido interno del componente.
     * Llamado automáticamente desde connectedCallback y attributeChangedCallback.
     * @private
     */
    _render() {
        const { variant, size, shape, icon, label, disabled, type, extraClass, fullWidth, title, labelAlign, minWidth } = this;
        const iconPos = this.iconPos;
        const textOut = this.hasAttribute('text-out');
        const loading = this.loading;
        const loadingStyle = this.loadingStyle;
        const badgeAttr = this.getAttribute('badge');
        const badgeColorAttr = this.getAttribute('badge-color') || '';
        const badgeIconAttr = this.getAttribute('badge-icon') || '';

        this.toggleAttribute('full-width', fullWidth);

        const isMaskIcon = !icon && extraClass;
        const isDisabled = disabled || loading;
        // Solo icono (sin texto ni text-out): con shape pill pasa a ser un circulo (ver button.css 14h)
        const isIconOnly = !textOut && !(label && label !== 'undefined') && !!(icon || isMaskIcon || (loading && loadingStyle !== 'pulse'));

        const classes = [
            'wcb-btn',
            `wcb-variant-${variant}`,
            `wcb-size-${size}`,
            textOut ? '' : `wcb-dir-${iconPos}`,
            shape ? `wcb-shape-${shape}` : '',
            isDisabled ? 'is-disabled' : '',
            isMaskIcon ? 'wcb-has-mask' : '',
            isIconOnly ? 'wcb-icon-only' : '',
            labelAlign !== 'center' ? `wcb-align-${labelAlign}` : '',
            loading && loadingStyle !== 'pulse' ? 'wcb-loading-spinner' : '',
            loading && loadingStyle === 'pulse' ? 'wcb-loading-pulse' : '',
            extraClass,
        ].filter(Boolean).join(' ');

        const esc = WCBaseElement.escapeHtml;

        const spinnerHtml = '<span class="wcb-spinner" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="42 14"/></svg></span>';

        const badgeHtml = badgeAttr !== null ? (() => {
            const isDot = badgeAttr === '' || badgeAttr === 'dot';
            const isPulse = badgeAttr === 'pulse';
            const isNum = !isDot && !isPulse && !isNaN(Number(badgeAttr)) && Number(badgeAttr) > 0;
            const cls = isNum ? 'wcb-badge wcb-badge-num' : (isPulse ? 'wcb-badge wcb-badge-pulse' : 'wcb-badge wcb-badge-dot');
            const isWarning = badgeColorAttr === 'yellow' || badgeColorAttr === 'warning';
            const color = isWarning ? 'var(--wcb-color-warning)'
                        : badgeColorAttr === 'green'  || badgeColorAttr === 'success' ? 'var(--wcb-color-success)'
                        : 'var(--wcb-color-danger)';
            // Número o icono en blanco; sobre warning, oscuro (el amarillo pide texto oscuro)
            const style = `--wcb-badge-color:${color}${isWarning ? ';--wcb-badge-fg:var(--alert-text-warning)' : ''}`;
            // Con icono: círculo con el wc-icon, sea cual sea el valor de badge
            if (badgeIconAttr) {
                return `<span class="wcb-badge wcb-badge-icon" aria-hidden="true" style="${style}"><wc-icon name="${esc(badgeIconAttr)}" size="xs"></wc-icon></span>`;
            }
            return `<span class="${cls}" aria-hidden="true" style="${style}">${isNum ? esc(badgeAttr) : ''}</span>`;
        })() : '';

        const showSpinner = loading && loadingStyle !== 'pulse';

        // Con text-out: icono (SVG, máscara o spinner) siempre en .wcb-icon-frame;
        // el badge también se coloca dentro del frame para que quede en su esquina.
        const iconHtml = textOut
            ? `<span class="wcb-icon-frame" aria-hidden="true">${showSpinner ? spinnerHtml : (icon ? this._resolveIcon(icon) : '<span class="wcb-mask-icon"></span>')}${badgeHtml}</span>`
            : (showSpinner
                ? `<span class="wcb-icon" aria-hidden="true">${spinnerHtml}</span>`
                : isMaskIcon
                    ? '<span class="wcb-mask-icon"></span>'
                    : icon ? `<span class="wcb-icon" aria-hidden="true">${this._resolveIcon(icon)}</span>` : '');

        this.innerHTML = `
        <button class="${esc(classes)}" type="${esc(type)}" ${title ? `title="${esc(title)}"` : ''} ${isDisabled ? 'disabled' : ''} ${minWidth ? `style="min-width:${esc(minWidth)}"` : ''}>
            ${iconHtml}
            ${label && label !== 'undefined' ? `<span class="wcb-label">${esc(label)}</span>` : ''}
            ${textOut ? '' : badgeHtml}
        </button>
        `;

        // Accesibilidad: reflejar atributos ARIA en el <button> interno (el focusable)
        this._syncAria();
        // Colores personalizados: re-aplicar tras reconstrucción del DOM
        this._applyCustomColors();
    }

    /**
     * Refleja los atributos ARIA del host en el <button> interno, que es el
     * elemento realmente focusable que anuncia el lector de pantalla.
     * Si el boton es de solo icono (sin label) y tiene title, este se usa
     * como aria-label por defecto para que tenga nombre accesible.
     * @private
     */
    _syncAria() {
        const btn = this.querySelector('button');
        if (!btn) return;

        const esc = WCBaseElement.escapeHtml;
        const explicitLabel = this.getAttribute('aria-label');
        const fallbackLabel = (!this.label && this.title) ? this.title : '';
        let label = explicitLabel || fallbackLabel;

        // Añadir el número del badge al nombre accesible cuando es numérico
        const badgeAttr = this.getAttribute('badge');
        if (badgeAttr !== null) {
            const isDot = badgeAttr === '' || badgeAttr === 'dot';
            const isPulse = badgeAttr === 'pulse';
            const isNum = !isDot && !isPulse && !isNaN(Number(badgeAttr)) && Number(badgeAttr) > 0;
            if (isNum && !this.hasAttribute('badge-icon')) {
                const base = label || this.label;
                label = base ? `${base} (${badgeAttr})` : badgeAttr;
            }
        }

        if (label) btn.setAttribute('aria-label', esc(label));
        else btn.removeAttribute('aria-label');

        ['aria-pressed', 'aria-expanded'].forEach(a => {
            const v = this.getAttribute(a);
            if (v === null) btn.removeAttribute(a);
            else btn.setAttribute(a, v);
        });

        if (this.loading) btn.setAttribute('aria-busy', 'true');
        else btn.removeAttribute('aria-busy');
    }

    /**
     * Aplica los colores personalizados (color-bg, border-color, icon-color, text-color) como inline styles.
     * Se llama tras cada _render() y al cambiar dichos atributos.
     * @private
     */
    _applyCustomColors() {
        const btn = this.querySelector('.wcb-btn');
        if (!btn) return;

        const textOut = this.hasAttribute('text-out');
        const colorBg = this.getAttribute('color-bg');
        // border-color explícito tiene prioridad; si no se indica, el borde sigue a color-bg
        const borderColor = this.getAttribute('border-color') || colorBg;

        // color-bg: en text-out el visual es .wcb-icon-frame, no .wcb-btn (que es transparente)
        if (textOut) {
            const iconFrame = btn.querySelector('.wcb-icon-frame');
            if (iconFrame) {
                iconFrame.style.background = colorBg || '';
                iconFrame.style.borderColor = borderColor || '';
            }
            btn.style.background = '';
            btn.style.borderColor = '';
        } else {
            btn.style.background = colorBg || '';
            btn.style.borderColor = borderColor || '';
        }

        // icon-color: variable CSS consumida por .wcb-mask-icon::before, .wcb-icon y .wcb-icon-frame
        const iconColor = this.getAttribute('icon-color');
        if (iconColor) {
            btn.style.setProperty('--wcb-custom-icon-color', iconColor);
        } else {
            btn.style.removeProperty('--wcb-custom-icon-color');
        }

        // text-color: solo sobre el span de texto, independiente del icono
        const textColor = this.getAttribute('text-color');
        const labelEl = btn.querySelector('.wcb-label');
        if (labelEl) {
            labelEl.style.color = textColor || '';
        }
    }

    /**
     * Resuelve el formato del ícono y devuelve el HTML correspondiente.
     * SVG crudo → inserción directa | Clases CSS → <i> | Emoji/texto → <span>.
     * @private
     * @param {string} icon - Valor del atributo icon.
     * @returns {string} HTML del ícono listo para insertar.
     */
    _resolveIcon(icon) {
        // SVG crudo: solo de fuentes de confianza (iconos internos del proyecto)
        if (icon.trim().startsWith('<')) return icon;
        const esc = WCBaseElement.escapeHtml;
        if (icon.includes(' ')) return `<i class="${esc(icon)}"></i>`;
        return `<span>${esc(icon)}</span>`;
    }
}

if (!customElements.get('wc-button')) customElements.define('wc-button', WCButton);