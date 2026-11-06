class WCCheckbox extends WCBaseElement {
    // 1. FUNDAMENTAL: Indicamos al navegador que es un elemento de formulario real
    static formAssociated = true;

    constructor() {
        super();

        // 2. Adjuntamos los internals para comunicarnos con el formulario padre
        this._internals = this.attachInternals();

        /** @type {Object.<string, HTMLElement>} */
        this._els = {};

        /** 
         * @type {Object.<string, string>} Iconos SVG para los diferentes estados visuales
         */
        this.icons = {
            check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
            dash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
        };

        /**
         * @type {Object.<string, string>} Textos para mensajes personalizados.
         */
        this.texts = {
            validationRequired: typeof Traduccion !== 'undefined' ? Traduccion.VALOR_OBLIGATORIO : 'Valor obligatorio'
        };

        // Accesibilidad: id unico de instancia para ligar la etiqueta (aria-labelledby)
        this._uid = (WCCheckbox._uidCounter = (WCCheckbox._uidCounter || 0) + 1);
    }

    /**
     * Define los atributos que el componente observará para cambios.
     * @returns {string[]} Atributos observados. Hemos añadido name, value y required.
     * @static
     */
    static get observedAttributes() {
        return ['checked', 'indeterminate', 'disabled', 'readonly', 'label', 'switch', 'name', 'value', 'required', 'check-position'];
    }

    /**
     * Callback invocado cuando un atributo observado cambia.
     * Actualiza el DOM de forma eficiente según el atributo modificado.
     * @param {string} name - Nombre del atributo que cambió.
     * @param {string|null} oldVal - Valor anterior del atributo.
     * @param {string|null} newVal - Nuevo valor del atributo.
     */
    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;

        // Si ya está renderizado, actualizamos el DOM directamente por rendimiento
        if (this._els.wrapper) {
            if (name === 'label') {
                this._els.labelText.textContent = newVal || '';
                this._els.labelText.style.display = newVal ? '' : 'none';
            } else {
                this._updateState();
            }
        }
    }

    /**
     * Ciclo de vida: Se ejecuta cuando el elemento se inserta en el DOM.
     * Renderiza la estructura del componente si no existe.
     */
    connectedCallback() {
        super.connectedCallback();
        if (!this._els.wrapper) {
            this._render();
        }
    }

    // --- API PÚBLICA ---

    /**
     * Propiedad "name" para integrarse con formularios. Si se establece, el valor se enviará al formulario cuando esté chequeado.
     * @type {string|null}
     */
    get name() { return this.getAttribute('name'); }

    /**
     * Establece la propiedad "name" para integrarse con formularios. Si se establece, el valor se enviará al formulario cuando esté chequeado. Si se establece a null o vacío, se elimina el atributo.
     * @param {string|null} val - Nombre del campo para el formulario. Si es null o vacío, se eliminará el atributo.
     */
    set name(val) { val ? this.setAttribute('name', val) : this.removeAttribute('name'); }

    /**
     * Propiedad "value" que representa el valor que se enviará al formulario cuando el checkbox esté marcado. Por defecto es "on" para mantener compatibilidad con checkboxes tradicionales.
     * @type {string}
     */
    get value() { return this.getAttribute('value') || 'on'; } 

    /**
     * Establece el valor que se enviará al formulario cuando el checkbox esté marcado. Si no se establece, el valor por defecto es "on" para mantener compatibilidad con checkboxes tradicionales.
     * @param {string} val - Valor a enviar cuando el checkbox esté marcado.
     */
    set value(val) { this.setAttribute('value', val); }

    /**
     * Propiedad "required" que indica si el checkbox es obligatorio. Si es true, el formulario será inválido si no está marcado.
     * @type {boolean}
     */
    get required() { return this.hasAttribute('required'); }

    /**
     * Establece si el checkbox es obligatorio. Si se establece a true, el formulario será inválido si no está marcado.
     * @param {boolean} val - True para marcar como requerido, false para no serlo.
     */
    set required(val) { val ? this.setAttribute('required', '') : this.removeAttribute('required'); }

    /**
     * Obtiene el estado de selección del checkbox.
     * @returns {boolean} True si está marcado, false en caso contrario.
     */
    get checked() { return this.hasAttribute('checked'); }

    /**
     * Establece el estado de selección del checkbox.
     * @param {boolean} val - True para marcar, false para desmarcar.
     */
    set checked(val) {
        if (val) this.setAttribute('checked', '');
        else this.removeAttribute('checked');
    }

    /**
     * Obtiene el estado indeterminado del checkbox.
     * @returns {boolean} True si está en estado indeterminado.
     */
    get indeterminate() { return this.hasAttribute('indeterminate'); }

    /**
     * Establece el estado indeterminado del checkbox.
     * Útil para representar selección parcial en árboles o listas.
     * @param {boolean} val - True para activar estado indeterminado.
     */
    set indeterminate(val) {
        if (val) this.setAttribute('indeterminate', '');
        else this.removeAttribute('indeterminate');
    }

    /**
     * Obtiene el estado deshabilitado del checkbox.
     * @returns {boolean} True si está deshabilitado.
     */
    get disabled() { return this.hasAttribute('disabled'); }

    /**
     * Establece el estado deshabilitado del checkbox.
     * @param {boolean} val - True para deshabilitar la interacción.
     */
    set disabled(val) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    /**
     * Obtiene el estado de solo lectura del checkbox.
     * @returns {boolean} True si está en modo solo lectura.
     */
    get readonly() { return this.hasAttribute('readonly'); }

    /**
     * Establece el modo de solo lectura del checkbox.
     * Similar a disabled pero con diferente semántica visual.
     * @param {boolean} val - True para activar modo solo lectura.
     */
    set readonly(val) {
        if (val) this.setAttribute('readonly', '');
        else this.removeAttribute('readonly');
    }

    /**
     * Obtiene el texto de la etiqueta del checkbox.
     * @returns {string|null}
     */
    get label() { return this.getAttribute('label'); }

    /**
     * Establece el texto de la etiqueta del checkbox.
     * @param {string} val - Texto a mostrar junto al checkbox.
     */
    set label(val) {
        if (val != null) this.setAttribute('label', val);
        else this.removeAttribute('label');
    }

    /**
     * Obtiene si el checkbox se muestra en modo switch.
     * @returns {boolean}
     */
    get switch() { return this.hasAttribute('switch'); }

    /**
     * Establece el modo visual switch.
     * @param {boolean} val
     */
    set switch(val) {
        if (val) this.setAttribute('switch', '');
        else this.removeAttribute('switch');
    }

    /**
     * Obtiene la posición del control respecto al texto del label.
     * @returns {string|null} 'right' para colocar el checkbox/switch a la derecha del texto.
     */
    get checkPosition() { return this.getAttribute('check-position'); }

    /**
     * Establece la posición del control respecto al texto del label.
     * Con 'right' el checkbox/switch se alinea al extremo derecho y el texto queda a la izquierda.
     * @param {string|null} val - 'right' o null para comportamiento por defecto (izquierda).
     */
    set checkPosition(val) {
        if (val) this.setAttribute('check-position', val);
        else this.removeAttribute('check-position');
    }

    // --- MÉTODOS DE VALIDACIÓN NATIVA ---

    /**
     * Verifica la validez del checkbox.
     * @returns {boolean}
     */
    checkValidity() { return this._internals.checkValidity(); }

    /**
     * Informa sobre la validez del checkbox.
     * @returns {boolean}
     */
    reportValidity() { return this._internals.reportValidity(); }

    /**
     * Propiedad que devuelve el estado de validez del checkbox.
     * @returns {ValidityState}
     */
    get validity() { return this._internals.validity; }

    /**
     * Propiedad que devuelve el mensaje de validación personalizado si el checkbox es inválido.
     * @returns {string}
     */
    get validationMessage() { return this._internals.validationMessage; }

    // ==========================================
    // LÓGICA INTERNA
    // ==========================================

    /**
     * Renderiza la estructura HTML interna del componente.
     * Crea el wrapper, input nativo oculto, caja visual con iconos y etiqueta.
     * @private
     */
    _render() {
        const labelText = this.getAttribute('label') || '';
        const labelId = `wcc-label-${this._uid}`;

        this.innerHTML = `
            <label class="wcc-wrapper">
                <input type="checkbox" class="wcc-hidden-input" tabindex="-1" aria-hidden="true">
                <div class="wcc-box" tabindex="0" role="checkbox"${labelText ? ` aria-labelledby="${labelId}"` : ''}>
                    <span class="wcc-icon wcc-icon-check" aria-hidden="true">${this.icons.check}</span>
                    <span class="wcc-icon wcc-icon-dash" aria-hidden="true">${this.icons.dash}</span>
                </div>
                <span class="wcc-label" id="${labelId}" style="display: ${labelText ? '' : 'none'}">${WCBaseElement.escapeHtml(labelText)}</span>
            </label>
        `;

        this._els = {
            wrapper: this.querySelector('.wcc-wrapper'),
            input: this.querySelector('.wcc-hidden-input'),
            box: this.querySelector('.wcc-box'),
            labelText: this.querySelector('.wcc-label')
        };

        this._updateState();
        this._bindEvents();
    }

    /**
     * Sincroniza el estado visual y comunica el valor y validez al formulario padre.
     * @private
     */
    _updateState() {
        if (!this._els || !this._els.input) return;

        const isChecked = this.checked;
        const isIndeterminate = this.indeterminate;
        const isDisabled = this.disabled || this.readonly;

        // Actualizamos input nativo invisible
        this._els.input.checked = isChecked;
        this._els.input.indeterminate = isIndeterminate;
        this._els.input.disabled = isDisabled;

        // Clases visuales
        this._els.wrapper.classList.toggle('is-checked', isChecked);
        this._els.wrapper.classList.toggle('is-indeterminate', isIndeterminate);
        this._els.wrapper.classList.toggle('is-disabled', isDisabled);
        this._els.wrapper.classList.toggle('is-readonly', this.readonly);
        this._els.wrapper.classList.toggle('is-switch', this.switch);
        this._els.wrapper.classList.toggle('check-end', this.checkPosition === 'right');

        // Accesibilidad: estado ARIA sincronizado en la caja (role="checkbox")
        if (this._els.box) {
            this._els.box.setAttribute('aria-checked', isIndeterminate ? 'mixed' : (isChecked ? 'true' : 'false'));
            this._els.box.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
            if (this.required) this._els.box.setAttribute('aria-required', 'true');
            else this._els.box.removeAttribute('aria-required');
            // No tabulable cuando esta deshabilitado
            this._els.box.setAttribute('tabindex', isDisabled ? '-1' : '0');
        }

        // --- Comunicación con el navegador ---
        // 1. Establecer el valor real del campo. Si está chequeado enviamos su value, si no, null.
        this._internals.setFormValue(isChecked ? this.value : null);

        // 2. Calcular la validación (Si es requerido y no está chequeado, es inválido)
        if (this.required && !isChecked) {
            this._internals.setValidity({ valueMissing: true }, this.texts.validationRequired, this._els.input);
        } else {
            this._internals.setValidity({}); // Válido
        }
    }

    /**
     * Vincula los eventos de interacción del componente.
     * Gestiona clics y navegación por teclado (Espacio/Enter) para accesibilidad.
     * @private
     */
    _bindEvents() {
        this._els.wrapper.addEventListener('click', (e) => {
            e.preventDefault(); // Evitamos doble disparo del label
            if (this.disabled || this.readonly) return;

            // Al hacer clic, siempre limpiamos el estado indeterminado
            if (this.indeterminate) {
                this.indeterminate = false;
                this.checked = true;
            } else {
                this.checked = !this.checked;
            }

            // Disparamos evento estándar
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        });

        // Accesibilidad (Espacio para marcar/desmarcar)
        this._els.box.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                this._els.wrapper.click();
            }
        });
    }
}

if (!customElements.get('wc-checkbox')) customElements.define('wc-checkbox', WCCheckbox);