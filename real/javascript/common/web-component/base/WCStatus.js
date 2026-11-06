class WCStatus extends WCBaseElement {
    constructor() {
        super();
        // Trabajamos en el Light DOM para heredar de internal-layout.css
        this._onClose = null;
        this._items = [];
    }

    static get observedAttributes() {
        return ['status', 'text', 'text-align', 'variant', 'closable'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal) {
            this._render();
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this._render();
    }

    // ===========================================
    // API PÚBLICA
    // ===========================================

    /**
     * Obtiene el texto mostrado en el badge.
     * @returns {string|null}
     */
    get text() {
        return this.getAttribute('text');
    }

    /**
     * Establece el texto del badge.
     * @param {string} val
     */
    set text(val) {
        if (val != null) this.setAttribute('text', val);
        else this.removeAttribute('text');
    }

    /**
     * Obtiene el estado/tipo del badge (afecta la clase CSS).
     * @returns {string|null} Valores típicos: 'success', 'error', 'warning', 'info', 'default', 'primary'
     */
    get status() {
        return this.getAttribute('status');
    }

    /**
     * Establece el estado/tipo del badge.
     * @param {string} val - Clase de estado CSS a aplicar.
     */
    set status(val) {
        // 🐛 FIX: Antes ponía '' siempre, ahora pasa el valor real
        if (val != null) this.setAttribute('status', val);
        else this.removeAttribute('status');
    }

    /**
     * Obtiene la alineación del texto dentro del badge.
     * @returns {string} 'left' | 'center' | 'right' — defecto 'center'
     */
    get textAlign() {
        return this.getAttribute('text-align') || 'center';
    }

    /**
     * Establece la alineación horizontal del texto del badge.
     * @param {string} val - 'left' | 'center' | 'right'
     */
    set textAlign(val) {
        if (val != null) this.setAttribute('text-align', val);
        else this.removeAttribute('text-align');
    }

    get multiline() {
        return this.hasAttribute('multiline');
    }

    set multiline(val) {
        if (val) this.setAttribute('multiline', '');
        else this.removeAttribute('multiline');
    }

    /**
     * Familia visual del badge: 'solid' (fondo de color) u 'outline' (fondo
     * blanco, mismo texto/borde). Default 'solid' si no se especifica.
     * @returns {'solid'|'outline'}
     */
    get variant() {
        return this.getAttribute('variant') || 'solid';
    }

    /**
     * @param {'solid'|'outline'} val
     */
    set variant(val) {
        if (val != null) this.setAttribute('variant', val);
        else this.removeAttribute('variant');
    }

    /**
     * Muestra una "x" a la derecha del texto para cerrar el badge.
     * @returns {boolean}
     */
    get closable() {
        return this.hasAttribute('closable');
    }

    set closable(val) {
        if (val) this.setAttribute('closable', '');
        else this.removeAttribute('closable');
    }

    /**
     * Callback que se ejecuta al pulsar la "x". Recibe el propio badge.
     * Si devuelve false, el badge no se cierra.
     * @returns {Function|null}
     */
    get onClose() {
        return this._onClose;
    }

    /**
     * @param {Function|null} fn - (badge: WCStatus) => boolean|void
     */
    set onClose(fn) {
        this._onClose = typeof fn === 'function' ? fn : null;
    }

    /**
     * Cierra el badge: ejecuta onClose, emite 'status-close' (cancelable) y,
     * si nadie lo cancela, lo quita del DOM.
     */
    close() {
        if (this._onClose && this._onClose(this) === false) return;

        const evt = new CustomEvent('status-close', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: { text: this.text, status: this.status }
        });
        if (!this.dispatchEvent(evt)) return;

        this.remove();
    }

    /**
     * Varias etiquetas en un mismo wc-status, una al lado de otra y bajando de línea cuando no caben (como las
     * opciones de wc-pill-group). Con items se ignoran text/status/variant/closable del propio componente.
     * Cada item: { text, status?, variant?, closable?, onClose?, onClick? }.
     *  - onClose(item): al pulsar su "x"; si devuelve false no se quita.
     *  - onClick(item): al pulsar la etiqueta (no su "x"); la etiqueta se marca como clicable.
     * @returns {Array<Object>}
     */
    get items() {
        return this._items;
    }

    /**
     * @param {Array<Object>|null} val
     */
    set items(val) {
        this._items = Array.isArray(val) ? val : [];
        if (this.isConnected) this._render();
    }

    /**
     * Quita la etiqueta de items que está en index: ejecuta su onClose, emite 'status-close' (cancelable, con
     * el item en detail) y, si nadie lo cancela, la quita y repinta.
     * @param {number} index
     */
    closeItem(index) {
        const item = this._items[index];
        if (!item) return;
        if (typeof item.onClose === 'function' && item.onClose(item) === false) return;

        const evt = new CustomEvent('status-close', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: { text: item.text, status: item.status, item, index }
        });
        if (!this.dispatchEvent(evt)) return;

        this._items = this._items.filter((_, i) => i !== index);
        this._render();
    }

    /**
     * Getter combinado que devuelve el objeto completo de estado.
     * @returns {{text: string|null, status: string|null}}
     */
    get value() {
        return {
            text: this.text,
            status: this.status
        };
    }

    /**
     * Setter flexible: acepta string (solo texto) u objeto {text, status}.
     * @param {string|{text?: string, status?: string}} val
     */
    set value(val) {
        if (typeof val === 'object' && val !== null) {
            if (val.text !== undefined) this.text = val.text;
            if (val.status !== undefined) this.status = val.status;
        } else {
            this.text = val || '';
        }
    }

    // ===========================================
    // RENDERIZADO
    // ===========================================

    _render() {
        if (this._items.length > 0) {
            this._renderItems();
            return;
        }

        this.innerHTML = this._badgeHtml({
            text: this.text,
            status: this.status,
            variant: this.variant,
            closable: this.closable,
            textAlign: this.textAlign
        });

        this._bindClose(this.querySelector('wc-button.status-close'), () => this.close());
    }

    _renderItems() {
        this.innerHTML = `<span class="status-group">${this._items.map(item => this._badgeHtml(item)).join('')}</span>`;

        this.querySelectorAll('.status-group > .status-badge').forEach((badge, index) => {
            const item = this._items[index];
            if (typeof item.onClick === 'function') badge.addEventListener('click', () => item.onClick(item));
            this._bindClose(badge.querySelector('wc-button.status-close'), () => this.closeItem(index));
        });
    }

    /**
     * HTML de una etiqueta. Con onClick lleva la clase "clickable".
     * @private
     */
    _badgeHtml({ text, status, variant, closable, textAlign, onClick }) {
        const esc = WCBaseElement.escapeHtml;
        const alignClass = (textAlign === 'left' || textAlign === 'right') ? ` status-align-${textAlign}` : '';
        const outlineClass = variant === 'outline' ? ' status-outline' : '';
        const closableClass = closable ? ' status-closable' : '';
        const clickableClass = typeof onClick === 'function' ? ' clickable' : '';
        const closeBtn = closable
            ? '<wc-button class="status-close cerrar" variant="ghost" size="xs" shape="pill" aria-label="Cerrar"></wc-button>'
            : '';

        return `<span class="status-badge status-${esc(status || 'default')}${outlineClass}${alignClass}${closableClass}${clickableClass}"><span class="status-text">${esc(text)}</span>${closeBtn}</span>`;
    }

    /**
     * La "x" no propaga su clic: el de la etiqueta (onClick) solo llega al pulsar el cuerpo.
     * @private
     */
    _bindClose(btn, cerrar) {
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cerrar();
        });
    }
}

if (!customElements.get('wc-status')) customElements.define('wc-status', WCStatus);