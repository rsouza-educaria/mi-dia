/**
 * @fileoverview Loading.js
 * Overlay de carga reutilizable. Se instancia programáticamente via Loading.show(options, container).
 *
 * Tag:        wc-loading
 * Herencia:   WidgetBase
 * CSS:        loading.css
 *
 * Atributos:
 *   active   (Boolean) - Muestra u oculta el overlay.
 *   size     (String)  - 'sm' | 'md' | 'lg'. Aplica solo a type='alexia'.
 *   text     (String)  - Texto descriptivo visible bajo el icono.
 *   fixed    (Boolean) - Usa position:fixed (se aplica automáticamente cuando target=document.body).
 *
 * Propiedades JS (no atributos):
 *   icon     (String|Node|null) - Icono personalizado. null = usa type; '' = sin icono.
 *
 * API estática (patrón DynamicModal.Alert):
 *   Loading.show(options?, container?) - Muestra el overlay en `container` (default: document.body del
 *                                        window de más arriba, para funcionar bien también desde un iframe).
 *   Loading.hide(container?)           - Oculta el overlay de `container` sin destruirlo (mismo default).
 */
class Loading extends WidgetBase {

    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
        /** @type {string|Node|null} null = usa type; '' = sin icono; string/Node = personalizado */
        this._icon = null;
        /** @type {boolean} */
        this._initialized = false;
    }

    get componentCssName() { return 'loading.css'; }

    static get observedAttributes() {
        return [...super.observedAttributes, 'active', 'size', 'text', 'fixed'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue !== newValue && this._initialized) {
            this._render();
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this._buildStructure();
        this._render();
        this._initialized = true;
    }

    // =========================================================================
    // API PÚBLICA — INSTANCIA
    // =========================================================================

    /**
     * Muestra el overlay aplicando las opciones recibidas.
     * @param {Object} [options]
     * @param {'sm'|'md'|'lg'} [options.size]
     * @param {string} [options.text]
     * @param {string|Node|null} [options.icon]
     */
    show(options = {}) {
        if (options.size !== undefined) this.size = options.size;
        if (options.text !== undefined) this.text = options.text;
        if (options.icon !== undefined) this.icon = options.icon;
        this.active = true;
    }

    /** Oculta el overlay. El elemento permanece en el DOM para reutilización (Opción B). */
    hide() {
        this.active = false;
    }

    // =========================================================================
    // API PÚBLICA — ESTÁTICA (patrón DynamicModal.Alert)
    // =========================================================================

    /**
     * Muestra un overlay de carga en `container`. Reutiliza la instancia si ya existe.
     * @param {Object} [options] - Configuración: { size, text, icon }.
     * @param {Element} [container] - Dónde montarlo (requiere positioning context). Sin container,
     *   usa el `document.body` del documento de más arriba (ver _parentBody).
     * @returns {Loading} La instancia gestionada.
     */
    static show(options = {}, container) {
        const target = container || Loading._parentBody();

        const el = Loading._getOrCreateInstance(target);

        // Si el target no crea su propio positioning context, lo gestionamos temporalmente.
        Loading._ensureTargetPositioning(target, el);

        el.show(options);
        return el;
    }

    /**
     * Oculta el overlay de `container` sin destruirlo (Opción B — reutilizable). Mismo default que
     * show() cuando se omite.
     * @param {Element} [container]
     */
    static hide(container) {
        const target = container || Loading._parentBody();

        const el = Loading._findInstance(target);
        if (el) {
            el.hide();
            Loading._restoreTargetPositioning(target, el);
        }
    }

    /**
     * `document.body` del window de más arriba. Replica UI._getParentDOM() sin depender de UI.js:
     * Loading es un widget de base standalone (se usa aislado en la galería de biblioteca_wc, que no
     * carga UI.js), mientras que UI.js es orquestación de la app completa — no debe ser una dependencia
     * de un widget de base. Mismo resultado: resuelve el documento correcto también desde un iframe.
     * @private
     */
    static _parentBody() {
        return (window.top || window).document.body;
    }

    /**
    * Busca la instancia de Loading asociada al target.
     * @param {Element} target
    * @returns {Loading|null}
     * @private
     */
    static _findInstance(target) {
        const children = target.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.tagName === 'WC-LOADING' && child.hasAttribute('data-wc-loading-instance')) {
                return child;
            }
        }
        return null;
    }

    /**
     * Obtiene la instancia del target o la crea si no existe.
     * @param {Element} target
     * @returns {Loading}
     * @private
     */
    static _getOrCreateInstance(target) {
        let el = Loading._findInstance(target);
        if (!el) {
            el = document.createElement('wc-loading');
            el.setAttribute('data-wc-loading-instance', '');

            // position:fixed automático para overlay de página completa
            if (Loading._isFixedTarget(target)) {
                el.setAttribute('fixed', '');
            }

            target.appendChild(el);
        }
        return el;
    }

    /** @param {Element} target */
    static _isFixedTarget(target) {
        return target === document.body || target === document.documentElement;
    }

    /**
     * Garantiza el positioning context para overlays sobre targets estáticos.
     * @param {Element} target
      * @param {Loading} el
     * @private
     */
    static _ensureTargetPositioning(target, el) {
          if (Loading._isFixedTarget(target)) return;

        const computed = getComputedStyle(target);
        if (computed.position !== 'static') return;
        if (el._managedTargetPosition) return;

        el._managedTargetPosition = true;
        el._prevInlineTargetPosition = target.style.position || '';
        target.style.position = 'relative';
    }

    /**
     * Revierte el posicionamiento temporal aplicado en _ensureTargetPositioning.
     * @param {Element} target
    * @param {Loading} el
     * @private
     */
    static _restoreTargetPositioning(target, el) {
        if (!el._managedTargetPosition) return;

        const prev = el._prevInlineTargetPosition || '';
        if (prev) {
            target.style.position = prev;
        } else {
            target.style.removeProperty('position');
        }

        el._managedTargetPosition = false;
        el._prevInlineTargetPosition = '';
    }

    // =========================================================================
    // PROPIEDADES
    // =========================================================================

    /** Muestra u oculta el overlay. */
    get active() { return this.hasAttribute('active'); }
    set active(v) { v ? this.setAttribute('active', '') : this.removeAttribute('active'); }

    /** Tamaño: 'sm' | 'md' | 'lg'. */
    get size() { return this.getAttribute('size') || 'sm'; }
    set size(v) { v ? this.setAttribute('size', v) : this.removeAttribute('size'); }

    /** Texto descriptivo visible bajo el icono. Vacío = oculto. */
    get text() { return this.getAttribute('text') || ''; }
    set text(v) { v ? this.setAttribute('text', v) : this.removeAttribute('text'); }

    /** SVG/HTML string, Node DOM o wc-icon. null = usa type; '' = sin icono. Solo JS. */
    get icon() { return this._icon; }
    set icon(v) {
        this._icon = v ?? null;
        if (this._initialized) this._render();
    }

    // =========================================================================
    // LÓGICA INTERNA
    // =========================================================================

    _buildStructure() {
        if (this.shadow.querySelector('.overlay')) return;
        this.shadow.innerHTML = `
            <div class="overlay">
                <div class="content">
                    <span class="icon"></span>
                    <span class="text"></span>
                </div>
            </div>
        `;
    }

    _render() {
        const overlay = this.shadow.querySelector('.overlay');
        if (!overlay) return;

        overlay.classList.toggle('is-active', this.active);
        if (!this.active) return;

        const iconEl = overlay.querySelector('.icon');
        const textEl = overlay.querySelector('.text');

        if (iconEl) {
            iconEl.innerHTML = '';
            const custom = this._icon;
            if (custom instanceof Node) {
                // wc-icon y DOM nodes usan pulse en lugar de spin
                iconEl.classList.add('icon--pulse');
                iconEl.appendChild(custom);
            } else {
                iconEl.classList.remove('icon--pulse');
                if (typeof custom === 'string') {
                    // custom es API del caller: el caller es responsable de que el SVG/HTML sea seguro
                    iconEl.innerHTML = custom;
                } else {
                    iconEl.innerHTML = Loading._alexiaHtml(this.size);
                }
            }
        }

        if (textEl) {
            textEl.textContent = this.text;
            textEl.classList.toggle('has-text', !!this.text);
        }
    }

    // =========================================================================
    // HELPERS ESTÁTICOS
    // =========================================================================

    static _alexiaHtml(size = 'md') {
        return `<div class="alexia-loader alexia-loader--${size}">${'<span class="alexia-dot"></span>'.repeat(7)}</div>`;
    }
}

if (!customElements.get('wc-loading')) customElements.define('wc-loading', Loading);

window.Loading = Loading;
