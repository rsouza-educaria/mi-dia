/**
 * Grupo de opciones seleccionables con forma de pildora.
 * Seleccion unica por defecto; con el atributo `multiple` permite varias.
 * En ambos modos se puede deseleccionar (pulsar la pildora marcada la desmarca).
 *
 * Cada pildora es un <input type="checkbox"> nativo oculto + su texto: el teclado
 * (Tab + Espacio), el foco y el desmarcado vienen del navegador. En modo unico el
 * componente desmarca las demas al marcar una.
 *
 * @fires change - Al marcar o desmarcar una opcion por interaccion del usuario.
 */
class WCPillGroup extends WCBaseElement {
    static formAssociated = true;

    constructor() {
        super();
        this._internals = this.attachInternals();

        /** @private @type {Array<{label: string, value: string|number}>} */
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
        return ['disabled', 'readonly', 'required', 'multiple', 'orientation', 'aria-invalid', 'aria-describedby'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;

        // Al pasar a modo unico se conserva solo la primera opcion marcada
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
     * Opciones a renderizar.
     * @param {Array<{label: string, value: string|number}>} opts
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

    /**
     * Impide que el usuario deje el grupo sin ninguna opcion marcada: pulsar la unica
     * marcada no la desmarca. Solo restringe la interaccion; asignar `value` por codigo
     * (incluido vacio) se respeta, y no marca nada por si sola si el grupo empieza vacio.
     * @returns {boolean}
     */
    get alwaysSelected() { return this.hasAttribute('always-selected'); }
    set alwaysSelected(val) { val ? this.setAttribute('always-selected', '') : this.removeAttribute('always-selected'); }

    /**
     * Orientacion del grupo: 'horizontal' (por defecto) o 'vertical'.
     * @returns {string}
     */
    get orientation() { return this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal'; }
    set orientation(val) {
        val === 'vertical' ? this.setAttribute('orientation', 'vertical') : this.removeAttribute('orientation');
    }

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
     * Construye las pildoras. Texto via textContent (sin innerHTML con datos externos).
     * @private
     */
    _render() {
        this.innerHTML = '';

        const group = document.createElement('div');
        group.className = 'wcpg-group';
        group.setAttribute('role', 'group');

        this._options.forEach(opt => {
            const option = document.createElement('label');
            option.className = 'wcpg-option';

            // Sin name: el valor al <form> lo aporta el host via ElementInternals,
            // no los checkboxes internos (evita enviarlo duplicado)
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'wcpg-input';
            input.value = String(opt.value);

            const label = document.createElement('span');
            label.className = 'wcpg-label';
            label.textContent = opt.label;

            option.appendChild(input);
            option.appendChild(label);
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

            group.querySelectorAll('.wcpg-input').forEach(input => {
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
        if (!input.classList || !input.classList.contains('wcpg-input')) return;
        e.stopPropagation(); // Se sustituye por el change del host

        const val = input.value;
        if (input.checked) {
            this._selected = this.multiple ? [...this._selectedValues().filter(v => v !== val), val] : [val];
        } else {
            const restantes = this._selectedValues().filter(v => v !== val);
            if (this.alwaysSelected && !restantes.length) {
                // Era la unica marcada: se vuelve a marcar y no hay cambio que notificar
                input.checked = true;
                return;
            }
            this._selected = restantes;
        }

        this._sync();
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    /**
     * Valor de formulario y validez (required = al menos una opcion marcada).
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
            const anchor = this._els.group ? this._els.group.querySelector('.wcpg-input') : undefined;
            this._internals.setValidity({ valueMissing: true }, Traduccion.VALOR_OBLIGATORIO, anchor || undefined);
        } else {
            this._internals.setValidity({});
        }
    }
}

if (!customElements.get('wc-pill-group')) customElements.define('wc-pill-group', WCPillGroup);
