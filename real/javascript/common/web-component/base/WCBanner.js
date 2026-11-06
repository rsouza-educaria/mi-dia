/**
 * WCBanner - Componente de avisos/alertas
 * 
 * Muestra mensajes informativos, de advertencia, error o éxito.
 * Soporta múltiples mensajes, botón de cerrar y mensajes clickeables.
 * 
 * @example
 * // Uso básico. `message` no es atributo reflejado: se asigna siempre por JS.
 * const banner = document.createElement('wc-banner');
 * banner.type = 'info';
 * banner.message = 'Mensaje informativo';
 *
 * // Con múltiples mensajes
 * banner.message = ['Mensaje 1', 'Mensaje 2'];
 * banner.type = 'warning';
 * banner.dismissible = true;
 */
class WCBanner extends WCBaseElement {
    constructor() {
        super();
        this._message = null;
        this._onDismiss = null;
    }

    static get observedAttributes() {
        return ['type', 'dismissible', 'sticky', 'hidden'];
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
    // GETTERS / SETTERS
    // ===========================================

    /**
     * Tipo de banner: 'info' | 'warning' | 'error' | 'success' | 'news'
     * @returns {string}
     */
    get type() {
        return this.getAttribute('type') || 'info';
    }

    set type(val) {
        if (val) this.setAttribute('type', val);
        else this.removeAttribute('type');
    }

    /**
     * Si el banner puede cerrarse (true por defecto)
     * @returns {boolean}
     */
    get dismissible() {
        return this.getAttribute('dismissible') !== 'false';
    }

    set dismissible(val) {
        if (val === false) this.setAttribute('dismissible', 'false');
        else this.removeAttribute('dismissible');
    }

    /**
     * Si el banner es sticky (fijo al scroll)
     * @returns {boolean}
     */
    get sticky() {
        return this.hasAttribute('sticky');
    }

    set sticky(val) {
        if (val) this.setAttribute('sticky', '');
        else this.removeAttribute('sticky');
    }

    /**
     * Mensaje(s) a mostrar. Puede ser:
     * - String: "Mensaje simple"
     * - Array de strings: ["Mensaje 1", "Mensaje 2"]
     * - Array de objetos: [{ text: "Mensaje", class: "mi-clase", onClick: fn }]
     * - HTMLElement: se inserta directamente sin escapar (permite enlaces u otro
     *   markup a mitad de frase; el caller es responsable de su contenido/eventos)
     * @returns {string|Array|HTMLElement|null}
     */
    get message() {
        return this._message;
    }

    set message(val) {
        this._message = val;
        this._render();
    }

    /**
     * Callback cuando se cierra el banner
     * @param {Function} fn
     */
    set onDismiss(fn) {
        this._onDismiss = fn;
    }

    /**
     * Getter/setter combinado para configurar via objeto
     * @returns {{message, type, dismissible, sticky}}
     */
    get value() {
        return {
            message: this._message,
            type: this.type,
            dismissible: this.dismissible,
            sticky: this.sticky
        };
    }

    set value(val) {
        if (typeof val === 'string') {
            this.message = val;
        } else if (val && typeof val === 'object') {
            if (val.message !== undefined) this.message = val.message;
            if (val.type !== undefined) this.type = val.type;
            if (val.dismissible !== undefined) this.dismissible = val.dismissible;
            if (val.sticky !== undefined) this.sticky = val.sticky;
        }
    }

    // ===========================================
    // API PÚBLICA
    // ===========================================

    /**
     * Muestra el banner
     */
    show() {
        this.removeAttribute('hidden');
    }

    /**
     * Oculta el banner
     */
    hide() {
        this.setAttribute('hidden', '');
    }

    /**
     * Cierra el banner (lo oculta y dispara evento)
     */
    dismiss() {
        this.hide();
        
        // Callback
        if (typeof this._onDismiss === 'function') {
            this._onDismiss();
        }
        
        // Evento
        this.dispatchEvent(new CustomEvent('banner-dismissed', {
            bubbles: true,
            composed: true,
            detail: { type: this.type }
        }));
    }

    // ===========================================
    // RENDERIZADO
    // ===========================================

    _render() {
        const type = this.type;
        const sticky = this.sticky;
        const dismissible = this.dismissible;

        // Nodo HTML: se pinta directamente, sin pasar por _normalizeMessages/escape
        if (this._message instanceof HTMLElement) {
            this._renderNode(this._message, type, sticky, dismissible);
            return;
        }

        const messages = this._normalizeMessages(this._message);

        // Si no hay mensajes, no renderizar nada
        if (!messages || messages.length === 0) {
            this.innerHTML = '';
            return;
        }

        // Construir clases del contenedor
        const containerClasses = [
            'wcbn-container',
            `wcbn-${type}`,
            sticky ? 'is-sticky' : ''
        ].filter(Boolean).join(' ');

        // Construir contenido (textos escapados para prevenir XSS)
        const esc = WCBaseElement.escapeHtml;
        let contentHTML = '';

        if (messages.length === 1 && !messages[0].onClick) {
            // Mensaje simple
            contentHTML = `<span class="wcbn-message">${esc(messages[0].text)}</span>`;
        } else {
            // Lista de mensajes
            const listItems = messages.map((m, i) => {
                const classes = ['wcbn-item'];
                if (m.class) classes.push(...[].concat(m.class));
                if (m.onClick) classes.push('clickable');

                return `<li class="${esc(classes.join(' '))}" ${m.onClick ? `data-clickable="true" data-index="${i}"` : ''}>${esc(m.text)}</li>`;
            }).join('');

            contentHTML = `<ul>${listItems}</ul>`;
        }

        // Botón de cerrar
        const closeBtn = dismissible 
            ? `<wc-button class="wcbn-close cerrar" variant="ghost" size="xs" aria-label="Cerrar"></wc-button>`
            : '';

        // Accesibilidad: los avisos urgentes (error/warning) se anuncian de inmediato
        // (role="alert" = aria-live assertive); los informativos de forma cortes (role="status").
        const isUrgent = type === 'error' || type === 'warning';
        const liveAttrs = isUrgent ? 'role="alert"' : 'role="status" aria-live="polite"';

        // Renderizar
        this.innerHTML = `
            <div class="${containerClasses}" ${liveAttrs}>
                <div class="wcbn-content">${contentHTML}</div>
                ${closeBtn}
            </div>
        `;

        // Bind eventos
        this._bindEvents(messages);
    }

    /**
     * Renderiza un mensaje como HTMLElement: se monta directamente (sin escapar),
     * conservando sus propios listeners. El caller es responsable de su contenido.
     * @param {HTMLElement} node
     * @param {string} type
     * @param {boolean} sticky
     * @param {boolean} dismissible
     * @private
     */
    _renderNode(node, type, sticky, dismissible) {
        const containerClasses = [
            'wcbn-container',
            `wcbn-${type}`,
            sticky ? 'is-sticky' : ''
        ].filter(Boolean).join(' ');

        const isUrgent = type === 'error' || type === 'warning';

        const container = document.createElement('div');
        container.className = containerClasses;
        container.setAttribute('role', isUrgent ? 'alert' : 'status');
        if (!isUrgent) container.setAttribute('aria-live', 'polite');

        const content = document.createElement('div');
        content.className = 'wcbn-content';
        content.appendChild(node);
        container.appendChild(content);

        if (dismissible) {
            const closeBtn = document.createElement('wc-button');
            closeBtn.className = 'wcbn-close cerrar';
            closeBtn.setAttribute('variant', 'ghost');
            closeBtn.setAttribute('size', 'xs');
            closeBtn.setAttribute('aria-label', 'Cerrar');
            container.appendChild(closeBtn);
        }

        this.innerHTML = '';
        this.appendChild(container);
        this._bindEvents(null);
    }

    /**
     * Normaliza los mensajes a un array de objetos { text, class, onClick }
     * @private
     */
    _normalizeMessages(input) {
        if (!input) return null;
        
        // String simple
        if (typeof input === 'string') {
            return input.trim() ? [{ text: input }] : null;
        }
        
        // Array
        if (Array.isArray(input)) {
            const normalized = input
                .map(m => typeof m === 'string' ? { text: m } : m)
                .filter(m => m && m.text);
            return normalized.length > 0 ? normalized : null;
        }
        
        // Objeto único
        if (typeof input === 'object' && input.text) {
            return [input];
        }
        
        return null;
    }

    /**
     * Bindea eventos de click
     * @private
     */
    _bindEvents(messages) {
        // Botón cerrar
        const closeBtn = this.querySelector('.wcbn-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.dismiss();
            });
        }

        // Items clickeables (no aplica cuando el mensaje es un HTMLElement propio)
        if (!messages) return;
        const clickableItems = this.querySelectorAll('[data-clickable="true"]');
        clickableItems.forEach(item => {
            const msgConfig = messages[Number(item.dataset.index)];
            if (msgConfig && typeof msgConfig.onClick === 'function') {
                item.addEventListener('click', () => msgConfig.onClick(item));
            }
        });
    }
}

if (!customElements.get('wc-banner')) customElements.define('wc-banner', WCBanner);
