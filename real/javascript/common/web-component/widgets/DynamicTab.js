/**
 * DynamicTab - Componente simple para crear pestañas con contenido dinámico
 * Similar a ContentSection pero para tabs. Cada tab tiene su propio slot.
 */
class DynamicTab extends WidgetBase {
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
        this._initialized = false;
        this._tabs = [];
        this._activeTab = null;

        // Accesibilidad: id unico de instancia para ligar tabs<->paneles (aria-controls/labelledby)
        this._uid = (DynamicTab._uidCounter = (DynamicTab._uidCounter || 0) + 1);

        this._handleTabKeydown = this._handleTabKeydown.bind(this);
    }

    get componentCssName() {
        return 'dynamic-tab.css';
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'btn-variant', 'btn-shape', 'mode'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue !== newValue && ['btn-variant', 'btn-shape', 'mode'].includes(name)) {
            this._updateButtons();
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this._render();
    }

    // =========================================================================
    // GETTERS Y SETTERS
    // =========================================================================

    get tabs() { return this._tabs; }
    set tabs(val) {
        this._tabs = Array.isArray(val) ? val.map(t => ({ ...t, id: String(t.id) })) : [];
        this._render();
    }

    get btnVariant() { return this.getAttribute('btn-variant') || 'primary'; }
    set btnVariant(val) { val ? this.setAttribute('btn-variant', val) : this.removeAttribute('btn-variant'); }

    get btnShape() { return this.getAttribute('btn-shape') || ''; }
    set btnShape(val) { val ? this.setAttribute('btn-shape', val) : this.removeAttribute('btn-shape'); }

    get mode() { return this.getAttribute('mode') || 'tabs'; }
    set mode(val) { val ? this.setAttribute('mode', val) : this.removeAttribute('mode'); }

    // =========================================================================
    // API PÚBLICA
    // =========================================================================

    /**
     * Activa la pestaña indicada y notifica el cambio.
     * @param {string} tabId - Id de la pestaña a activar.
     * @fires tab-changed - Solo si la pestaña activa realmente cambia. detail: { tabId, previousTabId }
     */
    selectTab(tabId) {
        const previousTabId = this._activeTab;
        this._activeTab = tabId;
        this._updateTabsVisibility();
        this._updateButtons();

        if (previousTabId !== tabId) {
            this.dispatchEvent(new CustomEvent('tab-changed', {
                bubbles: true,
                composed: true,
                detail: { tabId, previousTabId }
            }));
        }
    }

    // =========================================================================
    // LÓGICA PRIVADA
    // =========================================================================

    _render() {
        if (!this._initialized) {
            this.shadow.innerHTML = `
                <div class="tabs-container">
                    <div class="tabs-header"></div>
                    <div class="tabs-body"></div>
                </div>
            `;
            // Navegacion por teclado de la tablist (los eventos de los botones burbujean al header)
            this.shadow.querySelector('.tabs-header').addEventListener('keydown', this._handleTabKeydown);
            this._initialized = true;
        }

        if (this._tabs.length === 0) return;

        const selectedTab = this._tabs.find(t => t.selected) || this._tabs[0];
        this._activeTab = selectedTab ? selectedTab.id : null;

        const header = this.shadow.querySelector('.tabs-header');
        header.className = `tabs-header tabs-header--${this.mode}`;

        this._renderButtons();
        this._renderPanels();

        // ARIA: aplicar roles tab/tabpanel. Se repite en rAF por si el <button>
        // interno de wc-button aun no estuviera renderizado.
        this._applyTabAria();
        requestAnimationFrame(() => this._applyTabAria());
    }

    _renderButtons() {
        const header = this.shadow.querySelector('.tabs-header');
        header.innerHTML = '';

        if (this.mode === 'tabs') {
            // Modo tabs: wc-button envuelto en un <div class="tab-wrap">
            // El wrap es quien recibe el indicador inferior via ::after en CSS,
            // mientras que wc-button recibe las variables --wcb-* que sí atraviesan
            // el shadow boundary por ser custom properties heredables.
            this._tabs.forEach(tab => {
                const isActive = tab.id === this._activeTab;

                const wrap = document.createElement('div');
                wrap.className = 'tab-wrap' + (isActive ? ' is-active' : '');
                wrap.dataset.tabId = tab.id;

                const btn = document.createElement('wc-button');
                btn.setAttribute('label', tab.label);
                btn.setAttribute('variant', isActive ? `ghost-${this.btnVariant}` : 'ghost-secondary');
                if (tab.tooltip) btn.setAttribute('title', tab.tooltip);
                btn.addEventListener('click', () => this.selectTab(tab.id));

                wrap.appendChild(btn);
                header.appendChild(wrap);
            });
        } else {
            // Modo buttons: comportamiento original con wc-button
            const buttonGroup = document.createElement('div');
            buttonGroup.className = 'button-group';

            this._tabs.forEach(tab => {
                const btn = document.createElement('wc-button');
                btn.setAttribute('label', tab.label);
                if (this.btnShape) btn.setAttribute('shape', this.btnShape);
                if (tab.tooltip) btn.setAttribute('title', tab.tooltip);
                const isActive = tab.id === this._activeTab;
                btn.setAttribute('variant', isActive ? this.btnVariant : `outline-${this.btnVariant}`);
                btn.addEventListener('click', () => this.selectTab(tab.id));
                buttonGroup.appendChild(btn);
            });

            header.appendChild(buttonGroup);
        }
    }

    //_renderPanels() {
    //    const body = this.shadow.querySelector('.tabs-body');
    //    body.innerHTML = '';

    //    this._tabs.forEach(tab => {
    //        const panel = document.createElement('div');
    //        panel.className = 'tab-panel';
    //        panel.dataset.tabId = tab.id;
    //        panel.style.display = tab.id === this._activeTab ? 'block' : 'none';

    //        const slot = document.createElement('slot');
    //        slot.name = `dts_${tab.id}`;            
    //        panel.appendChild(slot);
    //        body.appendChild(panel);

    //        const divSlot = document.createElement('div');
    //        divSlot.slot = `dts_${tab.id}`; 
    //        divSlot.className = "tab-content";
    //        if (tab.content) {
    //            if (Array.isArray(tab.content)) {
    //                tab.content.forEach(ct => divSlot.appendChild(ct));
    //            }
    //            else {
    //                divSlot.appendChild(tab.content);
    //            }
    //        }
    //        this.appendChild(divSlot);
    //    });
    //}

    _renderPanels() {
        const body = this.shadow.querySelector('.tabs-body');
        body.innerHTML = '';

        this._tabs.forEach(tab => {
            const slotName = `dts_${tab.id}`;

            // 1. SHADOW DOM: Creamos el panel que envuelve al slot
            const panel = document.createElement('div');
            panel.className = 'tab-panel';
            panel.dataset.tabId = tab.id;
            panel.style.display = tab.id === this._activeTab ? 'block' : 'none';

            const slot = document.createElement('slot');
            slot.name = slotName;
            panel.appendChild(slot);
            body.appendChild(panel);

            // 2. LIGHT DOM: Si el padre pasó "content" por JS, lo inyectamos en el slot
            // Pero primero chequeamos si ya existe (para no duplicar si se define por HTML)
            let container = this.querySelector(`[slot="${slotName}"]`);

            if (!container && tab.content) {
                container = document.createElement('div');
                container.slot = slotName;
                container.className = 'tab-content';

                // Inyectamos el contenido (ya sea array de nodos o nodo único)
                const elements = Array.isArray(tab.content) ? tab.content : [tab.content];
                elements.forEach(el => container.appendChild(el));

                this.appendChild(container);
            }
        });
    }

    _updateTabsVisibility() {
        const panels = this.shadow.querySelectorAll('.tab-panel');
        panels.forEach(panel => {
            panel.style.display = panel.dataset.tabId === this._activeTab ? 'block' : 'none';
        });
    }

    _updateButtons() {
        if (this.mode === 'tabs') {
            const wraps = this.shadow.querySelectorAll('.tabs-header .tab-wrap');
            wraps.forEach(wrap => {
                const isActive = wrap.dataset.tabId === this._activeTab;
                wrap.classList.toggle('is-active', isActive);
                const btn = wrap.querySelector('wc-button');
                if (btn) {
                    btn.setAttribute('variant', isActive ? `ghost-${this.btnVariant}` : 'ghost-secondary');
                }
            });
        } else {
            const buttons = this.shadow.querySelectorAll('.tabs-header wc-button');
            buttons.forEach((btn, index) => {
                const tab = this._tabs[index];
                if (tab) {
                    const isActive = tab.id === this._activeTab;
                    btn.setAttribute('variant', isActive ? this.btnVariant : `outline-${this.btnVariant}`);
                }
            });
        }

        // Refrescar aria-selected y roving tabindex tras el cambio de pestaña activa
        this._applyTabAria();
    }

    // =========================================================================
    // ACCESIBILIDAD: ROLES TAB/TABPANEL Y NAVEGACION POR TECLADO
    // =========================================================================

    /**
     * Devuelve los botones de pestana con su tabId asociado, sea cual sea el modo.
     * @returns {Array<{host: HTMLElement, tabId: string}>}
     * @private
     */
    _getTabButtons() {
        if (this.mode === 'tabs') {
            return [...this.shadow.querySelectorAll('.tabs-header .tab-wrap')].map(wrap => ({
                host: wrap.querySelector('wc-button'),
                tabId: wrap.dataset.tabId
            }));
        }
        const btns = [...this.shadow.querySelectorAll('.tabs-header .button-group wc-button')];
        return btns.map((host, i) => ({ host, tabId: this._tabs[i] ? this._tabs[i].id : null }));
    }

    /**
     * Aplica el patron ARIA de pestanas (tablist/tab/tabpanel) sobre los elementos
     * ya renderizados. Los roles tab/tabindex se ponen en el <button> nativo interno
     * de wc-button (que es el elemento realmente focusable). Idempotente.
     * @private
     */
    _applyTabAria() {
        const header = this.shadow.querySelector('.tabs-header');
        if (!header) return;
        header.setAttribute('role', 'tablist');

        this._getTabButtons().forEach(({ host, tabId }) => {
            if (!host || tabId == null) return;
            const inner = host.querySelector('button') || host;
            const isActive = tabId === this._activeTab;
            inner.setAttribute('role', 'tab');
            inner.id = `dt-tab-${this._uid}-${tabId}`;
            inner.setAttribute('aria-selected', isActive ? 'true' : 'false');
            inner.setAttribute('aria-controls', `dt-panel-${this._uid}-${tabId}`);
            // Roving tabindex: solo la pestana activa es tabulable
            inner.setAttribute('tabindex', isActive ? '0' : '-1');
        });

        this.shadow.querySelectorAll('.tab-panel').forEach(panel => {
            const tabId = panel.dataset.tabId;
            panel.setAttribute('role', 'tabpanel');
            panel.id = `dt-panel-${this._uid}-${tabId}`;
            panel.setAttribute('aria-labelledby', `dt-tab-${this._uid}-${tabId}`);
            panel.setAttribute('tabindex', '0');
        });
    }

    /**
     * Navegacion por teclado de la tablist (APG): flechas mueven y activan la pestana
     * (activacion automatica), Home/End van a la primera/ultima.
     * @param {KeyboardEvent} e
     * @private
     */
    _handleTabKeydown(e) {
        const navKeys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (!navKeys.includes(e.key)) return;

        const ids = this._tabs.map(t => t.id);
        if (!ids.length) return;

        e.preventDefault();
        let idx = ids.indexOf(this._activeTab);
        if (idx < 0) idx = 0;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                idx = (idx + 1) % ids.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                idx = (idx - 1 + ids.length) % ids.length;
                break;
            case 'Home':
                idx = 0;
                break;
            case 'End':
                idx = ids.length - 1;
                break;
        }

        const newId = ids[idx];
        this.selectTab(newId);
        this._focusTab(newId);
    }

    /**
     * Mueve el foco al <button> de la pestana indicada.
     * @param {string} tabId
     * @private
     */
    _focusTab(tabId) {
        const entry = this._getTabButtons().find(t => t.tabId === tabId);
        if (entry && entry.host) {
            const inner = entry.host.querySelector('button') || entry.host;
            inner.focus();
        }
    }
}

if (!customElements.get('dynamic-tab')) customElements.define('dynamic-tab', DynamicTab);