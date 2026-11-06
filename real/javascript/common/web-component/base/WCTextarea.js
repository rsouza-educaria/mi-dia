class WCTextarea extends WCBaseElement {
    static formAssociated = true;

    constructor() {
        super();
        this._internals = this.attachInternals();
        this._els = {};
    }

    static get observedAttributes() {
        return ['disabled', 'readonly', 'placeholder', 'value', 'maxlength', 'required', 'rows', 'id', 'name', 'aria-invalid', 'aria-describedby', 'aria-label'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal || !this._els.textarea) return;
        if (name === 'id' && newVal === null) return;

        this._syncAttributesToNative();
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this._els.textarea) {
            this._render();
        }
    }

    // =========================================================================
    // API PÚBLICA ESTÁNDAR
    // =========================================================================

    get value() { return this.getAttribute('value') || ''; }
    set value(val) {
        this.setAttribute('value', val);
        if (this._els.textarea && this._els.textarea.value !== val) {
            this._els.textarea.value = val;
        }
        this._internals.setFormValue(val);
        this._updateValidity();
    }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(val) { val ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    get readonly() { return this.hasAttribute('readonly'); }
    set readonly(val) { val ? this.setAttribute('readonly', '') : this.removeAttribute('readonly'); }
    get name() { return this.getAttribute('name'); }
    set name(val) { val ? this.setAttribute('name', val) : this.removeAttribute('name'); }

    get placeholder() { return this.getAttribute('placeholder'); }
    set placeholder(val) { val ? this.setAttribute('placeholder', val) : this.removeAttribute('placeholder'); }

    get maxLength() { return this.getAttribute('maxlength'); }
    set maxLength(val) { val ? this.setAttribute('maxlength', val) : this.removeAttribute('maxlength'); }

    get rows() { return this.getAttribute('rows'); }
    set rows(val) { val ? this.setAttribute('rows', val) : this.removeAttribute('rows'); }

    get required() { return this.hasAttribute('required'); }
    set required(val) { val ? this.setAttribute('required', '') : this.removeAttribute('required'); }

    // --- MÉTODOS DE VALIDACIÓN NATIVA ---
    checkValidity() {
        return this._internals.checkValidity();
    }

    reportValidity() {
        return this._internals.reportValidity();
    }

    /**
     * Delega el foco al textarea nativo interno. El host no tiene tabindex propio,
     * asi que focus() sobre el custom element por si solo no mueve el foco.
     * @param {FocusOptions} [options]
     */
    focus(options) {
        if (this._els.textarea) {
            this._els.textarea.focus(options);
        } else {
            super.focus(options);
        }
    }

    get validity() {
        return this._internals.validity;
    }

    get validationMessage() {
        return this._internals.validationMessage;
    }

    // =========================================================================
    // LÓGICA INTERNA
    // =========================================================================

    /**
     * Renderiza el textarea nativo dentro del shadow DOM y sincroniza los atributos iniciales.
     */
    _render() {
        this.insertAdjacentHTML('afterbegin', `
            <div class="wci-wrapper" style="width: 100%;">
                <textarea class="wci-native-textarea" style="width: 100%; resize: vertical;"></textarea>
            </div>
        `);

        this._els.textarea = this.querySelector('.wci-native-textarea');

        this._syncAttributesToNative();
        this._bindEvents();

        this._internals.setFormValue(this.value);
        this._updateValidity();
    }

    /**
     * Sincroniza los atributos del elemento personalizado con el textarea nativo.
     * @returns {void}
     */
    _syncAttributesToNative() {
        const ta = this._els.textarea;
        if (!ta) return; 

        if (this.hasAttribute('id')) {
            ta.id = this.getAttribute('id');
            this.removeAttribute('id'); // Evitamos IDs duplicados en el HTML
        }

        // Le pasamos el nombre para que el motor de Autofill del navegador sea feliz y no lance el warning
        if (this.hasAttribute('name')) {
            ta.setAttribute('name', this.getAttribute('name'));
        }

        ['placeholder', 'maxlength', 'required', 'rows', 'aria-invalid', 'aria-describedby', 'aria-label'].forEach(attr => {
            if (this.hasAttribute(attr)) ta.setAttribute(attr, this.getAttribute(attr));
            else ta.removeAttribute(attr);
        });

        ta.disabled = this.disabled;
        ta.readOnly = this.readonly;

        if (ta.value !== this.value) ta.value = this.value;
        this._updateValidity();
    }

    /**
     * Enlaza los eventos del textarea nativo para mantener sincronizado el valor y la validez del componente personalizado.
     */
    _bindEvents() {
        const ta = this._els.textarea;

        ta.addEventListener('input', (e) => {
            e.stopPropagation();
            this.setAttribute('value', ta.value);
            this._internals.setFormValue(ta.value);
            this._updateValidity();
            this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        });

        ta.addEventListener('change', (e) => {
            e.stopPropagation();
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        });
    }

    /**
     * Actualiza la validez del textarea nativo y la del componente personalizado.
     * @returns
     */
    _updateValidity() {
        const ta = this._els.textarea;
        if (!ta) return;
        this._internals.setValidity(ta.validity, ta.validationMessage, ta);
    }
}

if (!customElements.get('wc-textarea')) customElements.define('wc-textarea', WCTextarea);