/**
 * @fileoverview ActionResult - Widget para mostrar resultados de operaciones
 * 
 * Muestra el estado de transacciones/ejecuciones (guardado, eliminación, etc.) con:
 * - Icono (predefinido por variante o personalizado)
 * - Título
 * - Subtítulo
 * - Detalles adicionales
 * - Botones de acción opcionales
 * 
 * @example
 * <action-result
 *     variant="success"
 *     heading="Datos guardados"
 *     subtitle="Los cambios se han guardado correctamente">
 * </action-result>
 */
class ActionResult extends WidgetBase {
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
        this._buttons = [];
        this._initialized = false;

        // Mapeo de variantes a iconos del catálogo wc-icon
        // Los que existen en el catálogo se referencian por nombre
        // Los que no existen usan SVG inline con fill (estilo del proyecto)
        this.iconCatalog = {
            // Usamos caracteres Unicode como en impresión para consistencia visual
            // success: 'realizar',    // Cambiado a ✓
            // error: 'cancelar'       // Cambiado a ✕
        };

        // Caracteres Unicode para variantes principales (estilo impresión)
        this.iconChars = {
            success: '✓',
            error: '✕'
        };

        // SVGs inline para variantes que no tienen icono en el catálogo
        // Estilo consistente: viewBox 24x24, fill="currentColor"
        this.iconsSvg = {
            empty: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" fill="none" stroke="currentColor" stroke-width="1.5"/>
                <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" fill="none" stroke="currentColor" stroke-width="1.5"/>
            </svg>`,
            warning: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L1 21h22L12 2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                <path d="M12 9v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <circle cx="12" cy="17" r="1" fill="currentColor"/>
            </svg>`,
            info: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
                <path d="M12 16v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <circle cx="12" cy="8" r="1" fill="currentColor"/>
            </svg>`
        };
    }

    // =========================================================================
    // CONFIGURACIÓN DEL COMPONENTE
    // =========================================================================

    get componentCssName() {
        return 'action-result.css';
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'variant', 'heading', 'subtitle', 'details', 'size', 'centered', 'icon-animated', 'icon', 'hide-icon'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue !== newValue && this._initialized) {
            this._render();
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this._render();
        this._initialized = true;
    }

    // =========================================================================
    // GETTERS Y SETTERS
    // =========================================================================

    /** @type {'empty'|'error'|'success'|'warning'|'info'} */
    get variant() { return this.getAttribute('variant') || 'info'; }
    set variant(val) { val ? this.setAttribute('variant', val) : this.removeAttribute('variant'); }

    /**
     * Título principal. Atributo y propiedad: `heading` (NUNCA `title` — es un
     * atributo global de HTML que el navegador interpreta como tooltip nativo en
     * cualquier elemento, y pintaría un tooltip sobre todo el componente).
     */
    get heading() { return this.getAttribute('heading') || ''; }
    set heading(val) { val ? this.setAttribute('heading', val) : this.removeAttribute('heading'); }

    get subtitle() { return this.getAttribute('subtitle') || ''; }
    set subtitle(val) { val ? this.setAttribute('subtitle', val) : this.removeAttribute('subtitle'); }

    get details() { return this.getAttribute('details') || ''; }
    set details(val) { val ? this.setAttribute('details', val) : this.removeAttribute('details'); }

    /** @type {'sm'|'md'|'lg'} */
    get size() { return this.getAttribute('size') || 'md'; }
    set size(val) { val ? this.setAttribute('size', val) : this.removeAttribute('size'); }

    get centered() { return !this.hasAttribute('centered') || this.getAttribute('centered') !== 'false'; }
    set centered(val) { val ? this.removeAttribute('centered') : this.setAttribute('centered', 'false'); }

    get iconAnimated() { return this.hasAttribute('icon-animated'); }
    set iconAnimated(val) { val ? this.setAttribute('icon-animated', '') : this.removeAttribute('icon-animated'); }

    /** Oculta el icono, independientemente de heading/subtitle (que ya se pintan cada uno segun si
     *  tienen valor, sin depender el uno del otro ni del icono). */
    get hideIcon() { return this.hasAttribute('hide-icon'); }
    set hideIcon(val) { val ? this.setAttribute('hide-icon', '') : this.removeAttribute('hide-icon'); }

    /** 
     * Icono personalizado. Puede ser:
     * - String: nombre del catálogo wc-icon o 'empty'|'error'|'success'|'warning'|'info' para usar predefinidos
     * - Object: { name?, svg?, size?, colorBg?, iconColor? }
     * - null: usa el icono predefinido de la variante
     */
    get icon() { 
        const attr = this.getAttribute('icon');
        return this._iconObj || attr;
    }
    set icon(val) {
        if (typeof val === 'object' && val !== null) {
            this._iconObj = val;
            this.removeAttribute('icon');
        } else {
            this._iconObj = null;
            val ? this.setAttribute('icon', val) : this.removeAttribute('icon');
        }
        if (this._initialized) this._render();
    }

    /**
     * Array de botones de acción.
     * Cada botón: { text, icon?, variant?, callback }
     * @type {Array<{text: string, icon?: string, variant?: string, callback: Function}>}
     */
    get buttons() { return this._buttons; }
    set buttons(val) {
        this._buttons = Array.isArray(val) ? val : [];
        if (this._initialized) this._render();
    }

    /**
     * Array de items de detalle estructurados (estilo impresión).
     * Cada item: { label, value }
     * @type {Array<{label: string, value: string}>}
     */
    get detailItems() { return this._detailItems || []; }
    set detailItems(val) {
        this._detailItems = Array.isArray(val) ? val : [];
        if (this._initialized) this._render();
    }

    /**
     * Elemento adicional entre los detalles y los botones (ej. un wc-banner de
     * seguimiento con un enlace). Se monta tal cual, sin envolver ni interpretar:
     * el caller construye el nodo completo (contenido, estilos, listeners).
     * @type {HTMLElement|null}
     */
    get notice() { return this._notice || null; }
    set notice(val) {
        this._notice = val instanceof HTMLElement ? val : null;
        if (this._initialized) this._render();
    }

    // =========================================================================
    // RENDERIZADO
    // =========================================================================

    _render() {
        const container = document.createElement('div');
        container.className = `ar-container ar-variant-${this.variant} ar-size-${this.size}`;
        if (this.centered) container.classList.add('ar-centered');
        if (this.iconAnimated) container.classList.add('ar-icon-animated');

        // Header (icono + título + subtítulo) - estructura igual a impresionPanel
        // Los tres son independientes entre si: cada uno se pinta solo si tiene motivo propio
        // (icono si no se pidio hideIcon, titulo si hay heading, subtitulo si hay subtitle) — no hace
        // falta tener los tres, ni que la ausencia de uno condicione a otro. El <div class="ar-header">
        // en si solo se agrega al DOM si termino con algo adentro: si hideIcon esta activo Y no hay
        // heading NI subtitle, no queda nada que encabezar y se omite entero (evita un div vacio con
        // su propio margin-bottom ocupando espacio sin mostrar nada).
        const header = document.createElement('div');
        header.className = 'ar-header';

        // Icono
        if (!this.hideIcon) {
            const iconEl = this._renderIcon();
            if (iconEl) header.appendChild(iconEl);
        }

        // Título
        if (this.heading) {
            const headingEl = document.createElement('h2');
            headingEl.className = 'ar-heading';
            headingEl.textContent = this.heading;
            header.appendChild(headingEl);
        }

        // Subtítulo
        if (this.subtitle) {
            const subtitleEl = document.createElement('p');
            subtitleEl.className = 'ar-subtitle';
            subtitleEl.textContent = this.subtitle;
            header.appendChild(subtitleEl);
        }

        if (header.children.length > 0) container.appendChild(header);

        // Items de detalle estructurados (estilo impresión)
        if (this._detailItems?.length > 0) {
            const stackEl = this._renderDetailStack();
            container.appendChild(stackEl);
        }

        // Detalles (texto simple)
        if (this.details) {
            const detailsEl = document.createElement('p');
            detailsEl.className = 'ar-details';
            detailsEl.textContent = this.details;
            container.appendChild(detailsEl);
        }

        // Notice (elemento libre, ej. wc-banner)
        if (this._notice) {
            const noticeEl = document.createElement('div');
            noticeEl.className = 'ar-notice';
            noticeEl.appendChild(this._notice);
            container.appendChild(noticeEl);
        }

        // Botones
        if (this._buttons.length > 0) {
            const actionsEl = this._renderActions();
            container.appendChild(actionsEl);
        }

        // Reemplazar contenido sin quitar los <link> de CSS
        const old = this.shadow.querySelector('.ar-container');
        if (old) {
            this.shadow.replaceChild(container, old);
        } else {
            this.shadow.appendChild(container);
        }
    }

    /**
     * Renderiza el stack de items de detalle (etiqueta + valor).
     * @returns {HTMLElement}
     * @private
     */
    _renderDetailStack() {
        const stack = document.createElement('div');
        stack.className = 'ar-detail-stack';

        this._detailItems.forEach((item, idx) => {
            // Item
            const itemEl = document.createElement('div');
            itemEl.className = 'ar-detail-item';

            const labelEl = document.createElement('span');
            labelEl.className = 'ar-detail-label';
            labelEl.textContent = item.label || '';

            const valueEl = document.createElement('span');
            valueEl.className = 'ar-detail-value';
            valueEl.textContent = item.value || '';

            itemEl.appendChild(labelEl);
            itemEl.appendChild(valueEl);
            stack.appendChild(itemEl);

            // Divider (excepto en el último)
            if (idx < this._detailItems.length - 1) {
                const divider = document.createElement('div');
                divider.className = 'ar-detail-divider';
                stack.appendChild(divider);
            }
        });

        return stack;
    }

    /**
     * Renderiza el icono según la configuración.
     * @returns {HTMLElement|null}
     * @private
     */
    _renderIcon() {
        const wrapper = document.createElement('div');
        wrapper.className = 'ar-icon';

        const iconValue = this.icon;

        // Si es un objeto con configuración completa
        if (typeof iconValue === 'object' && iconValue !== null) {
            if (iconValue.svg) {
                // SVG inline personalizado
                wrapper.innerHTML = iconValue.svg;
            } else if (iconValue.name) {
                // Usar wc-icon
                const wcIcon = document.createElement('wc-icon');
                wcIcon.setAttribute('name', iconValue.name);
                if (iconValue.size) wcIcon.setAttribute('size', iconValue.size);
                if (iconValue.colorBg) wcIcon.setAttribute('color-bg', iconValue.colorBg);
                if (iconValue.iconColor) wcIcon.setAttribute('icon-color', iconValue.iconColor);
                wrapper.appendChild(wcIcon);
            }
            return wrapper;
        }

        // Si es string: usar wc-icon con el nombre directamente
        if (typeof iconValue === 'string') {
            const wcIcon = document.createElement('wc-icon');
            wcIcon.setAttribute('name', iconValue);
            wcIcon.setAttribute('size', this._getIconSizeForWcIcon());
            wrapper.appendChild(wcIcon);
            return wrapper;
        }

        // Sin icono personalizado: usar el predefinido de la variante
        
        // Primero verificar si hay carácter Unicode (estilo impresión)
        if (this.iconChars[this.variant]) {
            wrapper.textContent = this.iconChars[this.variant];
            return wrapper;
        }

        // Luego verificar si existe en el catálogo de wc-icon
        if (this.iconCatalog[this.variant]) {
            const wcIcon = document.createElement('wc-icon');
            wcIcon.setAttribute('name', this.iconCatalog[this.variant]);
            wcIcon.setAttribute('size', this._getIconSizeForWcIcon());
            wrapper.appendChild(wcIcon);
            return wrapper;
        }

        // Si no está en el catálogo, usar SVG inline
        if (this.iconsSvg[this.variant]) {
            wrapper.innerHTML = this.iconsSvg[this.variant];
            return wrapper;
        }

        return null;
    }

    /**
     * Mapea el size del ActionResult al size de wc-icon.
     * @returns {string}
     * @private
     */
    _getIconSizeForWcIcon() {
        const sizeMap = { sm: 'lg', md: 'xl', lg: '2xl' };
        return sizeMap[this.size] || 'xl';
    }

    /**
     * Renderiza los botones de acción.
     * @returns {HTMLElement}
     * @private
     */
    _renderActions() {
        const actionsEl = document.createElement('div');
        actionsEl.className = 'ar-actions';

        this._buttons.forEach((btn, idx) => {
            const button = document.createElement('wc-button');
            if (btn.text) button.setAttribute('label', btn.text);
            if (btn.icon) button.setAttribute('icon', btn.icon);
            if (btn.variant) button.setAttribute('variant', btn.variant);
            
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof btn.callback === 'function') {
                    this.safeExecute(btn.callback, e);
                }
            });

            actionsEl.appendChild(button);
        });

        return actionsEl;
    }
}

if (!customElements.get('action-result')) customElements.define('action-result', ActionResult);