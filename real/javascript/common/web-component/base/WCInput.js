class WCInput extends WCBaseElement {
    static formAssociated = true; // Le decimos al navegador que esto es un elemento de formulario real

    constructor() {
        super();
        // 2. Adjuntamos los 'internals' nativos del navegador (nos da checkValidity, validationMessage, etc. automáticamente)
        this._internals = this.attachInternals();
        this._els = {};

        // Añadimos los SVGs estándar para la contraseña y el botón de borrar
        this.icons = {
            eyeOpen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
            eyeClosed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
            clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
        };
    }

    static get observedAttributes() {
        return ['type', 'disabled', 'readonly', 'placeholder', 'value', 'maxlength', 'pattern', 'required', 'id', 'name', 'min', 'max', 'toggle-password', 'clearable', 'aria-invalid', 'aria-describedby', 'aria-label'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal || !this._els.input) return;
        if (name === 'id' && newVal === null) return;
        this._syncAttributesToNative();
    }
    connectedCallback() {
        super.connectedCallback();
        if (!this._els.input) {
            this._render();
        }
    }

    // =========================================================================
    // API PÚBLICA ESTÁNDAR (Sincronizada con ElementInternals)
    // =========================================================================

    get type() { return this.getAttribute('type') || 'text'; }
    set type(val) { this.setAttribute('type', val); }

    get value() { return this.getAttribute('value') || ''; }
    set value(val) {
        this.setAttribute('value', val);
        if (this._els.input && this._els.input.value !== val) {
            this._els.input.value = val;
        }
        // Actualizamos el valor oficial del formulario para el navegador
        this._internals.setFormValue(val);
        this._updateValidity();
        this._updateClearBtnVisibility();
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

    get pattern() { return this.getAttribute('pattern'); }
    set pattern(val) { val ? this.setAttribute('pattern', val) : this.removeAttribute('pattern'); }

    get required() { return this.hasAttribute('required'); }
    set required(val) { val ? this.setAttribute('required', '') : this.removeAttribute('required'); }

    get min() { return this.getAttribute('min'); }
    set min(val) { val ? this.setAttribute('min', val) : this.removeAttribute('min'); }

    get max() { return this.getAttribute('max'); }
    set max(val) { val ? this.setAttribute('max', val) : this.removeAttribute('max'); }

    get togglePassword() { return this.hasAttribute('toggle-password'); }
    set togglePassword(val) { val ? this.setAttribute('toggle-password', '') : this.removeAttribute('toggle-password'); }

    get clearable() { return this.hasAttribute('clearable'); }
    set clearable(val) { val ? this.setAttribute('clearable', '') : this.removeAttribute('clearable'); }

    // --- MÉTODOS DE VALIDACIÓN NATIVA ---

    /**
     * Verifica la validez del campo de entrada.
     * @returns
     */
    checkValidity() {
        return this._internals.checkValidity();
    }

    /**
     * Informa sobre la validez del campo de entrada.
     * @returns
     */
    reportValidity() {
        return this._internals.reportValidity();
    }

    /**
     * Delega el foco al input nativo interno. El host no tiene tabindex propio
     * (el input interno es el elemento realmente focusable, ver _syncAttributesToNative),
     * asi que focus() sobre el custom element por si solo no mueve el foco.
     * @param {FocusOptions} [options]
     */
    focus(options) {
        if (this._els.input) {
            this._els.input.focus(options);
        } else {
            super.focus(options);
        }
    }

    /**
     * Devuelve un objeto ValidityState que representa el estado de validez del campo de entrada.
     */
    get validity() {
        return this._internals.validity;
    }

    /**
     * Devuelve un mensaje de error de validación si el campo de entrada no es válido, o una cadena vacía si es válido.
     */
    get validationMessage() {
        return this._internals.validationMessage;
    }

    // =========================================================================
    // LÓGICA INTERNA
    // =========================================================================

    /**
     * Renderiza el HTML interno del componente, incluyendo el input nativo y el botón de toggle para contraseñas si es necesario.
     */
    _render() {
        const showEyeBtn = this.type === 'password' && this.togglePassword;
        const showClearBtn = this.clearable;

        // Accesibilidad: etiquetas para los botones de solo icono
        const T = (typeof Traduccion !== 'undefined') ? Traduccion : {};
        const clearLabel = T.LIMPIAR || 'Limpiar';
        const showPwdLabel = T.MOSTRAR_CONTRASENA || 'Mostrar contraseña';

        this.insertAdjacentHTML('afterbegin', `
            <div class="wci-wrapper" style="position: relative; width: 100%; display: flex; align-items: center;">
                <input type="${this.type}" class="wci-native-input" style="width: 100%;">
                ${showClearBtn
                ? `<span class="wci-clear-btn" role="button" tabindex="0" aria-label="${WCBaseElement.escapeHtml(clearLabel)}" style="position: absolute; right: ${showEyeBtn ? '35px' : '10px'}; cursor: pointer; user-select: none; opacity: 0.5; transition: all 0.2s; display: none; align-items: center; color: var(--rf-color-text-sec);">${this.icons.clear}</span>`
                : ''
            }
                ${showEyeBtn
                ? `<span class="wci-eye-btn" role="button" tabindex="0" aria-pressed="false" aria-label="${WCBaseElement.escapeHtml(showPwdLabel)}" style="position: absolute; right: 10px; cursor: pointer; user-select: none; opacity: 0.5; transition: all 0.2s; display: flex; align-items: center; color: var(--rf-color-text-sec);">${this.icons.eyeOpen}</span>`
                : ''
            }
            </div>
        `);

        this._els.input = this.querySelector('.wci-native-input');
        this._els.eyeBtn = this.querySelector('.wci-eye-btn');
        this._els.clearBtn = this.querySelector('.wci-clear-btn');

        this._syncAttributesToNative();
        this._bindEvents();

        // Inicializamos el estado en el navegador
        this._internals.setFormValue(this.value);
        this._updateValidity();
        this._updateClearBtnVisibility();
    }

    /**
     * Sincroniza los atributos del componente con el input nativo interno para que el navegador los reconozca correctamente (id, name, placeholder, disabled, readonly, etc.)
     */
    _syncAttributesToNative() {
        const inp = this._els.input;

        if (this.hasAttribute('id')) {
            inp.id = this.getAttribute('id');
            this.removeAttribute('id'); // Evitamos IDs duplicados en el HTML
        }

        if (this.hasAttribute('name')) {
            inp.setAttribute('name', this.getAttribute('name'));
        }

        // Reenviamos al input nativo los atributos estandar y ARIA (el input interno
        // es el elemento realmente focusable que el lector de pantalla anuncia)
        ['placeholder', 'maxlength', 'pattern', 'required', 'min', 'max', 'aria-invalid', 'aria-describedby', 'aria-label'].forEach(attr => {
            if (this.hasAttribute(attr)) inp.setAttribute(attr, this.getAttribute(attr));
            else inp.removeAttribute(attr);
        });

        inp.disabled = this.disabled;
        inp.readOnly = this.readonly;

        if (inp.value !== this.value) inp.value = this.value;
        this._updateValidity();
        this._updateClearBtnVisibility();
    }

    /**
     * Enlaza los eventos del input nativo interno con el componente personalizado, propagando los cambios de valor y manejando la lógica del botón de toggle para contraseñas.
     */
    _bindEvents() {
        const inp = this._els.input;

        // Escuchamos al input nativo interno y propagamos el valor al componente estándar
        inp.addEventListener('input', (e) => {
            e.stopPropagation();
            this.setAttribute('value', inp.value);
            this._internals.setFormValue(inp.value);
            this._updateValidity();
            this._updateClearBtnVisibility();
            this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        });

        inp.addEventListener('change', (e) => {
            e.stopPropagation();
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        });

        // Lógica del botón de borrar (X)
        if (this._els.clearBtn) {
            const doClear = () => {
                this.value = '';
                this._els.input.value = '';
                this._internals.setFormValue('');
                this._updateValidity();
                this._updateClearBtnVisibility();
                this._els.input.focus();
                this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            };
            this._els.clearBtn.addEventListener('click', doClear);
            // Accesibilidad: operable por teclado (role="button")
            this._els.clearBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doClear(); }
            });
        }

        // Lógica visual del ojito
        if (this._els.eyeBtn) {
            const T = (typeof Traduccion !== 'undefined') ? Traduccion : {};
            const showPwdLabel = T.MOSTRAR_CONTRASENA || 'Mostrar contraseña';
            const hidePwdLabel = T.OCULTAR_CONTRASENA || 'Ocultar contraseña';

            const toggleEye = () => {
                if (inp.type === 'password') {
                    // Muestra el texto (ojo tachado)
                    inp.type = 'text';
                    this._els.eyeBtn.innerHTML = this.icons.eyeClosed;
                    this._els.eyeBtn.style.opacity = '1';
                    this._els.eyeBtn.style.color = 'var(--rf-color-primary)'; // Le damos el color azul corporativo al estar activo
                    this._els.eyeBtn.setAttribute('aria-pressed', 'true');
                    this._els.eyeBtn.setAttribute('aria-label', hidePwdLabel);
                } else {
                    // Oculta el texto (ojo normal)
                    inp.type = 'password';
                    this._els.eyeBtn.innerHTML = this.icons.eyeOpen;
                    this._els.eyeBtn.style.opacity = '0.5';
                    this._els.eyeBtn.style.color = 'var(--rf-color-text-sec)';
                    this._els.eyeBtn.setAttribute('aria-pressed', 'false');
                    this._els.eyeBtn.setAttribute('aria-label', showPwdLabel);
                }
            };
            this._els.eyeBtn.addEventListener('click', toggleEye);
            // Accesibilidad: operable por teclado (role="button")
            this._els.eyeBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEye(); }
            });
        }
    }

    /**
     * Sincroniza la validez del input interno con el API nativo del componente
     * @private
     */
    _updateValidity() {
        const inp = this._els.input;
        if (!inp) return;
        // Le pasamos el estado del input interno al navegador para que DynamicForm lo lea automáticamente
        this._internals.setValidity(inp.validity, inp.validationMessage, inp);
    }

    /**
     * Muestra u oculta el botón de borrar según si el input tiene contenido
     * @private
     */
    _updateClearBtnVisibility() {
        if (!this._els.clearBtn) return;
        const hasValue = this._els.input && this._els.input.value.length > 0;
        this._els.clearBtn.style.display = hasValue ? 'flex' : 'none';
    }
}

if (!customElements.get('wc-input')) customElements.define('wc-input', WCInput);