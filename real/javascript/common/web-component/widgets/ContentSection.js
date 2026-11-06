// Mismos 5 estados que wc-status (WCStatus.js) — sus colores viven en .status-success/.status-error/
// .status-warning/.status-info/.status-default de internal-layout.css, que este componente ya importa
// (content-section.css -> @import "internal-layout.css"), así que no hace falta CSS nuevo para ellos.
const BADGE_COLORES_SEMANTICOS = ['success', 'error', 'warning', 'info', 'default'];

class ContentSection extends WidgetBase {
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
        this._initialized = false;
        this._banner = null;
        this._icon = null;
        this.resources = {
            icons: {
                chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
            }
        };
    }

    get componentCssName() {
        return 'content-section.css';
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'label', 'badge', 'badge-color', 'collapsable', 'collapsed', 'borderless', 'header-divider', 'divider-style'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue !== newValue) {
            if (['label', 'badge', 'badge-color', 'collapsable', 'collapsed', 'borderless', 'header-divider', 'divider-style'].includes(name)) {
                this._render();
            }
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this._render();
    }

    // =========================================================================
    // GETTERS Y SETTERS
    // =========================================================================
    get label() { return this.getAttribute('label'); }
    set label(val) { val ? this.setAttribute('label', val) : this.removeAttribute('label'); }

    // Contador/etiqueta corta junto al label del header (p.ej. "1"). Sólo se pinta si hay label.
    get badge() { return this.getAttribute('badge'); }
    set badge(val) { (val !== null && val !== undefined && val !== '') ? this.setAttribute('badge', val) : this.removeAttribute('badge'); }

    // 'success' | 'error' | 'warning' | 'info' | 'default' (reutiliza los colores de wc-status), o
    // cualquier otro valor de color CSS válido (hex, rgb(...), nombre) para un color hardcodeado.
    // Sin valor: gris neutro (estilo base de .header-badge).
    get badgeColor() { return this.getAttribute('badge-color'); }
    set badgeColor(val) { val ? this.setAttribute('badge-color', val) : this.removeAttribute('badge-color'); }

    get collapsable() { return this.hasAttribute('collapsable'); }
    set collapsable(val) { val ? this.setAttribute('collapsable', '') : this.removeAttribute('collapsable'); }

    get collapsed() { return this.hasAttribute('collapsed'); }
    set collapsed(val) { val ? this.setAttribute('collapsed', '') : this.removeAttribute('collapsed'); }

    get borderless() { return this.hasAttribute('borderless'); }
    set borderless(val) { val ? this.setAttribute('borderless', '') : this.removeAttribute('borderless'); }

    get headerDivider() { return this.hasAttribute('header-divider'); }
    set headerDivider(val) { val ? this.setAttribute('header-divider', '') : this.removeAttribute('header-divider'); }

    // Estilo del divisor de cabecera. Valores: 'line' (defecto) | 'dot'.
    // Solo tiene efecto cuando headerDivider es true.
    get dividerStyle() { return this.getAttribute('divider-style') || 'line'; }
    set dividerStyle(val) { val && val !== 'line' ? this.setAttribute('divider-style', val) : this.removeAttribute('divider-style'); }

    get banner() { return this._banner; }
    set banner(val) {
        this._banner = val;
        this._updateBanner();
    }

    // Icono a la izquierda del label del header (mismo contrato que DynamicModal.icon):
    // string = nombre del icono de wc-icon (registrado o clase de icon-catalog.css), u objeto
    // de propiedades de wc-icon ({ name, size, shape, colorBg, iconColor, borderColor... }).
    get icon() { return this._icon; }
    set icon(val) {
        this._icon = val || null;
        this._updateIcon();
    }

    // =========================================================================
    // LÓGICA DE RENDERIZADO
    // =========================================================================
    _render() {
        if (!this._initialized) {
            this.shadow.innerHTML = `
                <div class="form-section">
                    <div class="section-header" style="display: none;">
                        <span class="collapse-icon">${this.resources.icons.chevronDown}</span>
                        <wc-icon class="header-icon hidden"></wc-icon>
                        <span class="header-text"></span>
                        <span class="header-badge" hidden></span>
                    </div>
                    <wc-banner class="section-banner" hidden></wc-banner>
                    <div class="section-grid">
                        <slot></slot>
                    </div>
                </div>
            `;

            // Evento de colapsar
            this.shadow.querySelector('.section-header').addEventListener('click', (e) => {
                e.preventDefault();
                if (this.collapsable) {
                    this.collapsed = !this.collapsed;
                }
            });
            this._initialized = true;
            // El setter puede haber corrido antes de existir la plantilla (dynamic-form asigna
            // las propiedades antes de insertar el elemento).
            this._updateIcon();
        }

        const container = this.shadow.querySelector('.form-section');
        const header = this.shadow.querySelector('.section-header');
        const headerText = this.shadow.querySelector('.header-text');
        const headerBadge = this.shadow.querySelector('.header-badge');
        const collapseIcon = this.shadow.querySelector('.collapse-icon');

        // Aplicar estilos segun atributos
        this.borderless ? container.classList.add('section-borderless') : container.classList.remove('section-borderless');
        this.headerDivider ? container.classList.add('has-divider') : container.classList.remove('has-divider');
        this.dividerStyle === 'dot' ? container.classList.add('divider-dot') : container.classList.remove('divider-dot');

        if (this.collapsable) {
            container.classList.add('is-collapsable');
            collapseIcon.style.display = '';
        } else {
            container.classList.remove('is-collapsable');
            collapseIcon.style.display = 'none';
        }

        this.collapsed ? container.classList.add('is-collapsed') : container.classList.remove('is-collapsed');

        if (this.label) {
            header.style.display = '';
            headerText.textContent = this.label;
        } else {
            header.style.display = 'none';
        }

        if (this.badge) {
            headerBadge.textContent = this.badge;
            headerBadge.hidden = false;

            BADGE_COLORES_SEMANTICOS.forEach(c => headerBadge.classList.remove(`status-${c}`));
            headerBadge.style.backgroundColor = '';

            const color = this.badgeColor;
            if (color && BADGE_COLORES_SEMANTICOS.includes(color)) {
                headerBadge.classList.add(`status-${color}`);
            } else if (color) {
                // Color hardcodeado (hex, rgb(...), nombre CSS...): sólo el fondo, el texto/borde de
                // .header-badge ya son neutros y funcionan razonablemente sobre tonos claros.
                headerBadge.style.backgroundColor = color;
            }
        } else {
            headerBadge.hidden = true;
        }
    }

    _updateIcon() {
        const iconEl = this.shadow.querySelector('.header-icon');
        if (!iconEl) return;
        if (!this._icon) {
            iconEl.classList.add('hidden');
            return;
        }

        iconEl.size = 'sm';
        iconEl.shape = 'circle';
        iconEl.borderColor = '#d1d5db';

        if (typeof this._icon === 'string') {
            iconEl.name = this._icon;
        } else if (typeof this._icon === 'object') {
            iconEl.configure(this._icon);
        }
        iconEl.classList.remove('hidden');
    }

    _updateBanner() {
        const el = this.shadow.querySelector('.section-banner');
        if (!el) return;

        const val = this._banner;
        if (!val || (typeof val === 'object' && !val.message)) {
            el.setAttribute('hidden', '');
            return;
        }

        if (typeof val === 'string') {
            el.value = { message: val, type: 'info', dismissible: true };
        } else {
            el.value = { type: 'info', dismissible: true, ...val };
        }
        el.removeAttribute('hidden');
    }
}

if (!customElements.get('content-section')) customElements.define('content-section', ContentSection);