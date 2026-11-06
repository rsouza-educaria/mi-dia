/**
 * Grupo de iconos seleccionables, cada uno un <wc-icon> (de la opcion solo se toma el
 * icono, su tamano y su forma; los colores los pone el componente segun el estado:
 * desmarcado = fondo blanco, borde claro e icono primary; marcado = fondo primary e
 * icono blanco).
 * Seleccion unica por defecto; con el atributo `multiple` permite varios.
 * En modo unico el icono marcado no se puede deseleccionar (siempre queda uno);
 * en modo `multiple` cada icono se marca y desmarca libremente.
 *
 * Cada opcion es un <input type="checkbox"> nativo oculto + un <wc-icon>: el teclado
 * (Tab + Espacio), el foco y el marcado vienen del navegador. En modo unico el
 * componente desmarca los demas al marcar uno.
 *
 * @fires change - Al marcar o desmarcar un icono por interaccion del usuario.
 */
class WCIconGroup extends WCBaseElement {
    static formAssociated = true;

    /**
     * Unicas propiedades de una opcion que se trasladan al <wc-icon>. Los colores NO se
     * pueden configurar por opcion: los decide el componente segun el estado (marcado,
     * desmarcado, disabled).
     * @private
     */
    static ICON_PROPS = ['name', 'size', 'shape'];

    constructor() {
        super();
        this._internals = this.attachInternals();

        /**
         * @private
         * @type {Array<{value: string|number, label?: string, name: string, size?: string, shape?: string}>}
         */
        this._options = [];

        /**
         * @private @type {string[]} Valores marcados. En modo unico solo cuenta el
         * primero (ver _selectedValues); no se recorta aqui para que el orden en que
         * llegan `value` y `multiple` via configure() no pierda valores.
         */
        this._selected = [];

        /** @private @type {Object.<string, HTMLElement>} */
        this._els = {};
    }

    static get observedAttributes() {
        return ['disabled', 'readonly', 'required', 'multiple', 'aria-invalid', 'aria-describedby'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;

        // Al pasar a modo unico se conserva solo el primer icono marcado
        if (name === 'multiple' && newVal === null && this._selected.length > 1) {
            this._selected = this._selected.slice(0, 1);
        }

        // Sin DOM aun, _sync solo actualiza valor/validez del formulario (p.ej. required)
        this._sync();
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this._els.group) this._render();
    }

    // =========================================================================
    // API PUBLICA
    // =========================================================================

    /**
     * Iconos a renderizar. Cada opcion lleva `value`, el icono del catalogo de `wc-icon`
     * (`name`) y, opcionalmente, su `size` y `shape`. Cualquier otra clave se ignora
     * (sin colores por opcion). `label` es el texto accesible del icono (title y
     * aria-label); si falta se usa `value`.
     * @param {Array<{value: string|number, label?: string, name: string, size?: string, shape?: string}>} opts
     */
    get options() { return this._options; }
    set options(opts) {
        this._options = Array.isArray(opts) ? opts : [];
        this._render();
    }

    /**
     * Valor seleccionado. Modo unico: string ('' si no hay nada marcado).
     * Modo multiple: array de strings ([] si no hay nada marcado).
     * @returns {string|string[]}
     */
    get value() {
        const selected = this._selectedValues();
        return this.multiple ? selected : (selected[0] || '');
    }

    /**
     * @param {string|number|Array<string|number>|null} val
     */
    set value(val) {
        const list = Array.isArray(val) ? val : (val === null || val === undefined || val === '' ? [] : [val]);
        this._selected = list.map(v => String(v));
        this._sync();
    }

    get name() { return this.getAttribute('name'); }
    set name(val) { val ? this.setAttribute('name', val) : this.removeAttribute('name'); }

    get multiple() { return this.hasAttribute('multiple'); }
    set multiple(val) { val ? this.setAttribute('multiple', '') : this.removeAttribute('multiple'); }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(val) { val ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    get readonly() { return this.hasAttribute('readonly'); }
    set readonly(val) { val ? this.setAttribute('readonly', '') : this.removeAttribute('readonly'); }

    get required() { return this.hasAttribute('required'); }
    set required(val) { val ? this.setAttribute('required', '') : this.removeAttribute('required'); }

    // --- VALIDACION NATIVA (Proxy) ---

    checkValidity() { return this._internals.checkValidity(); }
    reportValidity() { return this._internals.reportValidity(); }
    get validity() { return this._internals.validity; }
    get validationMessage() { return this._internals.validationMessage; }

    // =========================================================================
    // LOGICA INTERNA
    // =========================================================================

    /**
     * Valores marcados efectivos segun el modo.
     * @private
     * @returns {string[]}
     */
    _selectedValues() {
        return this.multiple ? [...this._selected] : this._selected.slice(0, 1);
    }

    /**
     * Crea el <wc-icon> de una opcion. Sin innerHTML con datos externos: las
     * propiedades viajan como atributos del elemento.
     * @private
     * @param {Object} opt
     * @returns {HTMLElement}
     */
    _createIcon(opt) {
        const icon = document.createElement('wc-icon');

        WCIconGroup.ICON_PROPS.forEach(prop => {
            const v = opt[prop];
            if (v !== undefined && v !== null && v !== '') icon.setAttribute(prop, String(v));
        });

        return icon;
    }

    /**
     * Construye las opciones.
     * @private
     */
    _render() {
        this.innerHTML = '';

        const group = document.createElement('div');
        group.className = 'wcig-group';
        group.setAttribute('role', 'group');

        this._options.forEach(opt => {
            const text = (opt.label !== undefined && opt.label !== null && opt.label !== '') ? String(opt.label) : String(opt.value);

            const option = document.createElement('label');
            option.className = 'wcig-option';
            option.title = text;

            // Sin name: el valor al <form> lo aporta el host via ElementInternals,
            // no los checkboxes internos (evita enviarlo duplicado)
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'wcig-input';
            input.value = String(opt.value);
            input.setAttribute('aria-label', text);

            option.appendChild(input);
            option.appendChild(this._createIcon(opt));
            group.appendChild(option);
        });

        group.addEventListener('change', (e) => this._onInputChange(e));

        this.appendChild(group);
        this._els = { group };

        this._sync();
    }

    /**
     * Refleja el estado (valor, disabled, aria) en los inputs y comunica valor y
     * validez al formulario.
     * @private
     */
    _sync() {
        const group = this._els.group;
        if (group) {
            const selected = this._selectedValues();
            const inactive = this.disabled || this.readonly;

            group.querySelectorAll('.wcig-input').forEach(input => {
                input.checked = selected.includes(input.value);
                input.disabled = inactive;
            });

            // Reenvio de aria-* que pone DynamicForm en el host al elemento con rol
            ['aria-invalid', 'aria-describedby'].forEach(attr => {
                const v = this.getAttribute(attr);
                v !== null ? group.setAttribute(attr, v) : group.removeAttribute(attr);
            });
            this.required ? group.setAttribute('aria-required', 'true') : group.removeAttribute('aria-required');
        }

        this._updateFormState();
    }

    /**
     * Gestiona el cambio de un checkbox interno.
     * @private
     * @param {Event} e
     */
    _onInputChange(e) {
        const input = e.target;
        if (!input.classList || !input.classList.contains('wcig-input')) return;
        e.stopPropagation(); // Se sustituye por el change del host

        const val = input.value;
        if (input.checked) {
            this._selected = this.multiple ? [...this._selectedValues().filter(v => v !== val), val] : [val];
        } else if (this.multiple) {
            this._selected = this._selectedValues().filter(v => v !== val);
        } else {
            // Modo unico: el icono marcado no se puede quitar. Se vuelve a marcar y no
            // hay cambio que notificar
            input.checked = true;
            return;
        }

        this._sync();
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    /**
     * Valor de formulario y validez (required = al menos un icono marcado).
     * @private
     */
    _updateFormState() {
        const selected = this._selectedValues();

        if (!selected.length) {
            this._internals.setFormValue(null);
        } else if (this.multiple) {
            const data = new FormData();
            selected.forEach(v => data.append(this.name || '', v));
            this._internals.setFormValue(data);
        } else {
            this._internals.setFormValue(selected[0]);
        }

        if (this.required && !selected.length) {
            const anchor = this._els.group ? this._els.group.querySelector('.wcig-input') : undefined;
            this._internals.setValidity({ valueMissing: true }, Traduccion.VALOR_OBLIGATORIO, anchor || undefined);
        } else {
            this._internals.setValidity({});
        }
    }
}

if (!customElements.get('wc-icon-group')) customElements.define('wc-icon-group', WCIconGroup);
