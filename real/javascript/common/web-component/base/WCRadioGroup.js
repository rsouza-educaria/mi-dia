class WCRadioGroup extends WCBaseElement {
    static formAssociated = true;

    constructor() {
        super();
        this._internals = this.attachInternals();

        /** @private @type {Array<Object>} Opciones del grupo [{label, value}] */
        this._options = [];
    }

    static get observedAttributes() {
        return ['disabled', 'readonly', 'value', 'required', 'name', 'orientation'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;
        this._syncAttributesToNative();
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this.querySelector('.radio-group')) {
            this._render();
        }
    }

    // =========================================================================
    // API PÚBLICA ESTÁNDAR
    // =========================================================================

    /**
     * Array de opciones a renderizar.
     * @param {Array<{label: string, value: string|number}>} opts
     */
    get options() { return this._options; }
    set options(opts) {
        this._options = Array.isArray(opts) ? opts : [];
        this._render(); // Si cambian las opciones, re-renderizamos los inputs
    }

    get value() { return this.getAttribute('value') || ''; }
    set value(val) {
        this.setAttribute('value', val);
        this._internals.setFormValue(val);
        this._syncValueToNative();
        this._updateValidity();
    }

    get name() { return this.getAttribute('name') || `wc-radio-${Math.random().toString(36).substr(2, 9)}`; }
    set name(val) { val ? this.setAttribute('name', val) : this.removeAttribute('name'); }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(val) { val ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    get readonly() { return this.hasAttribute('readonly'); }
    set readonly(val) { val ? this.setAttribute('readonly', '') : this.removeAttribute('readonly'); }

    get required() { return this.hasAttribute('required'); }
    set required(val) { val ? this.setAttribute('required', '') : this.removeAttribute('required'); }

    /**
     * Orientacion del grupo: 'horizontal' (por defecto) o 'vertical'.
     * @returns {string}
     */
    get orientation() { return this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal'; }
    set orientation(val) {
        val === 'vertical' ? this.setAttribute('orientation', 'vertical') : this.removeAttribute('orientation');
    }

    // =========================================================================
    // LÓGICA INTERNA
    // =========================================================================

    /**
     * Renderiza los radio buttons según las opciones actuales. Cada radio tendrá el mismo 'name' para que se comporten como un grupo.
     */
    _render() {
        this.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'radio-group';

        const groupName = this.name;

        this._options.forEach(opt => {
            const label = document.createElement('label');
            label.className = 'radio-option';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = groupName; // Vital para que se excluyan entre sí
            radio.value = opt.value;

            label.appendChild(radio);
            label.appendChild(document.createTextNode(` ${opt.label}`));

            container.appendChild(label);
        });

        this.appendChild(container);

        this._syncAttributesToNative();
        this._syncValueToNative();
        this._bindEvents();

        this._internals.setFormValue(this.value);
        this._updateValidity();
    }

    /**
     * Sincroniza los atributos del componente con los inputs nativos internos para que el navegador los reconozca correctamente (disabled, readonly, required, etc.)
     * @returns
     */
    _syncAttributesToNative() {
        const radios = this.querySelectorAll('input[type="radio"]');
        if (!radios.length) return;

        // En radio buttons, aplicar readonly suele significar deshabilitarlos nativamente 
        // para que no se puedan clicar, pero mantenemos tu clase CSS para el estilo
        const isDisabled = this.disabled || this.readonly;

        if (this.readonly) this.setAttribute('readonly', ''); // Para el CSS internal-layout

        radios.forEach(radio => {
            radio.disabled = isDisabled;
            // Para la validación HTML5, basta con que el primer radio tenga el required
            radio.required = this.required;
        });

        this._updateValidity();
    }

    /**
     * Sincroniza el valor del componente con los inputs nativos internos, marcando el radio correspondiente como checked.
     */
    _syncValueToNative() {
        const radios = this.querySelectorAll('input[type="radio"]');
        radios.forEach(r => {
            r.checked = (r.value === String(this.value));
        });
    }

    /**
     * Enlaza los eventos de los inputs nativos internos para mantener la sincronización y emitir eventos personalizados.
     * @returns
     */
    _bindEvents() {
        const container = this.querySelector('.radio-group');
        if (!container) return;

        // Escuchamos el evento change a nivel de contenedor (Delegación de eventos)
        container.addEventListener('change', (e) => {
            if (e.target.type === 'radio') {
                e.stopPropagation(); // Paramos el evento nativo del input interno
                this.setAttribute('value', e.target.value);
                this._internals.setFormValue(e.target.value);
                this._updateValidity();

                // Disparamos nuestro propio evento limpio hacia arriba
                this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }
        });
    }

    // --- MÉTODOS DE VALIDACIÓN NATIVA (Proxy) ---

    /**
     * Actualiza la validez del grupo de radio buttons.
     * @returns
     */
    _updateValidity() {
        const firstRadio = this.querySelector('input[type="radio"]');
        if (!firstRadio) return;

        // El navegador valida el grupo entero solo mirando si el primer elemento cumple (si es required y alguno está marcado)
        this._internals.setValidity(firstRadio.validity, firstRadio.validationMessage, firstRadio);
    }

    /**
     * Verifica la validez del grupo de radio buttons.
     * @returns
     */
    checkValidity() { return this._internals.checkValidity(); }

    /**
     * Informa sobre la validez del grupo de radio buttons.
     * @returns
     */
    reportValidity() { return this._internals.reportValidity(); }

    /**
     * Objeto de validez del grupo de radio buttons, reflejando el estado de validación del primer input interno.
     */
    get validity() { return this._internals.validity; }

    /**
     * Mensaje de validación del grupo de radio buttons.
     */
    get validationMessage() { return this._internals.validationMessage; }
}

if (!customElements.get('wc-radio-group')) customElements.define('wc-radio-group', WCRadioGroup);