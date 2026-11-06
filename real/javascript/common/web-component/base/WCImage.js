class WCImage extends WCBaseElement {
    // 1. FUNDAMENTAL: Indicamos al navegador que es un elemento de formulario real
    static formAssociated = true;

    /**
     * Constructor del componente WCImage.
     * Inicializa el estado interno, API de formulario, iconos y textos por defecto.
     */
    constructor() {
        super();

        // 2. Adjuntamos los internals para comunicarnos con el formulario padre
        this._internals = this.attachInternals();

        /**
         * Valor de la imagen actual (Base64, URL o nulo).
         * @private
         * @type {string|null}
         */
        this._value = null;

        /**
         * Caché de elementos del DOM para acceso rápido.
         * @private
         * @type {Object<string, HTMLElement>}
         */
        this._els = {};

        /**
         * Recursos de iconos SVG y HTML utilizados en el componente.
         * @type {Object<string, string>}
         */
        this.icons = {
            close: '&#10005;',
            fileImage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`
        };

        /**
         * Textos por defecto del componente.
         * @type {Object<string, string|Function>}
         */
        this.texts = {
            placeholder: typeof Traduccion !== 'undefined' ? Traduccion.MODIFICAR_FOTO : 'Modificar foto',
            removeTitle: typeof Traduccion !== 'undefined' ? Traduccion.ELIMINAR : 'Eliminar',
            errorSize: (max) => typeof Traduccion !== 'undefined' ? Traduccion["TAMAÑO_MAXIMO_DE_ARCHIVO_{0}"].replace('{0}', max) : `El tamaño máximo permitido es ${max}KB`,
            errorType: typeof Traduccion !== 'undefined' ? Traduccion.FORMATO_INCORRECTO : 'Formato de archivo incorrecto',
            validationRequired: typeof Traduccion !== 'undefined' ? Traduccion.VALOR_OBLIGATORIO : 'Este campo es obligatorio'
        };
    }

    /**
     * Atributos observados por el Web Component.
     * Cuando estos atributos cambian, se dispara attributeChangedCallback.
     * @static
     * @returns {string[]} Array de nombres de atributos observados
     */
    static get observedAttributes() {
        return ['placeholder', 'disabled', 'readonly', 'default-image', 'shape', 'name', 'value', 'required', 'badge', 'badge-color', 'badge-icon'];
    }

    /**
     * Callback invocado cuando un atributo observado cambia.
     * @param {string} name - Nombre del atributo que cambió
     * @param {string} oldVal - Valor anterior del atributo
     * @param {string} newVal - Nuevo valor del atributo
     */
    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;
        if (!this._els.wrapper) return;

        // El badge se repinta solo: no hace falta volver a cargar la imagen.
        if (name === 'badge' || name === 'badge-color' || name === 'badge-icon') this._renderBadge();
        else this._render();
    }

    /**
     * Callback invocado cuando el elemento se conecta al DOM.
     * Renderiza el componente inicial y sincroniza el estado del formulario.
     */
    connectedCallback() {
        super.connectedCallback();
        this._render();
        this._syncFormState();
    }

    // ===========================================
    // API PÚBLICA
    // ===========================================

    /**
     * Obtiene el nombre del campo para el envío de formularios.
     * @returns {string|null}
     */
    get name() { return this.getAttribute('name'); }

    /**
     * Establece el nombre del campo para el envío de formularios.
     * @param {string} val
     */
    set name(val) { val ? this.setAttribute('name', val) : this.removeAttribute('name'); }

    /**
     * Obtiene el valor de la imagen actual (generalmente en base64 o URL).
     * @returns {string|null} Cadena base64 de la imagen o null si no hay imagen
     */
    get value() { return this._value; }

    /**
     * Establece el valor de la imagen y actualiza la vista previa.
     * @param {string|null} val - Cadena base64/URL de la imagen o null para limpiar
     */
    set value(val) {
        if (!val) {
            this._clearImage();
        } else {
            this._value = val;
            if (this._els.preview) this._updatePreview(val);
            this._syncFormState();
        }
    }

    /**
     * Indica si la selección de una imagen es obligatoria.
     * @returns {boolean}
     */
    get required() { return this.hasAttribute('required'); }

    /**
     * Activa o desactiva la obligatoriedad del campo.
     * @param {boolean} val
     */
    set required(val) {
        if (val) this.setAttribute('required', '');
        else this.removeAttribute('required');
        this._syncFormState();
    }

    /**
     * Obtiene el texto del placeholder.
     * @returns {string|null}
     */
    get placeholder() { return this.getAttribute('placeholder'); }

    /**
     * Establece el texto del placeholder.
     * @param {string} val
     */
    set placeholder(val) {
        if (val != null) this.setAttribute('placeholder', val);
        else this.removeAttribute('placeholder');
    }

    /**
     * Indica si el componente está deshabilitado.
     * @returns {boolean}
     */
    get disabled() { return this.hasAttribute('disabled'); }

    /**
     * Activa o desactiva el estado disabled.
     * @param {boolean} val
     */
    set disabled(val) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    /**
     * Indica si el componente es de solo lectura.
     * @returns {boolean}
     */
    get readonly() { return this.hasAttribute('readonly'); }

    /**
     * Activa o desactiva el modo de solo lectura.
     * @param {boolean} val
     */
    set readonly(val) {
        if (val) this.setAttribute('readonly', '');
        else this.removeAttribute('readonly');
    }

    /**
     * Obtiene la URL de la imagen por defecto.
     * @returns {string|null}
     */
    get defaultImage() { return this.getAttribute('default-image'); }

    /**
     * Establece la imagen por defecto cuando no hay valor.
     * @param {string} val - URL o base64 de la imagen por defecto
     */
    set defaultImage(val) {
        if (val != null) this.setAttribute('default-image', val);
        else this.removeAttribute('default-image');
    }

    /**
     * Obtiene la forma del contenedor de imagen.
     * @returns {string|null} Valores típicos: 'circle', 'square', 'rounded'
     */
    get shape() { return this.getAttribute('shape'); }

    /**
     * Establece la forma del contenedor.
     * @param {string} val
     */
    set shape(val) {
        if (val != null) this.setAttribute('shape', val);
        else this.removeAttribute('shape');
    }

    /**
     * Obtiene los tipos de archivo aceptados.
     * @returns {string|null} Ej: 'image/png, image/jpeg'
     */
    get accept() { return this.getAttribute('accept'); }

    /**
     * Establece los tipos de archivo aceptados.
     * @param {string} val - MIME types separados por comas
     */
    set accept(val) {
        if (val != null) this.setAttribute('accept', val);
        else this.removeAttribute('accept');
    }

    /**
     * Obtiene el tamaño máximo permitido en KB.
     * @returns {string|null}
     */
    get maxSize() { return this.getAttribute('max-size'); }

    /**
     * Establece el tamaño máximo de archivo en KB.
     * @param {string|number} val - Tamaño en KB
     */
    set maxSize(val) {
        if (val != null) this.setAttribute('max-size', val);
        else this.removeAttribute('max-size');
    }

    /**
     * Obtiene el valor de object-fit de la imagen.
     * @returns {string|null} Valores CSS: 'fill', 'contain', 'cover', etc.
     */
    get objectFit() { return this.getAttribute('object-fit'); }

    /**
     * Establece cómo se ajusta la imagen al contenedor.
     * @param {string} val - Valor CSS de object-fit
     */
    set objectFit(val) {
        if (val != null) this.setAttribute('object-fit', val);
        else this.removeAttribute('object-fit');
    }

    /**
     * Obtiene la posición del objeto dentro del contenedor.
     * @returns {string|null} Valores CSS: 'center', 'top', '50% 20%', etc.
     */
    get objectPosition() { return this.getAttribute('object-position'); }

    /**
     * Establece la posición de la imagen dentro del contenedor.
     * @param {string} val - Valor CSS de object-position
     */
    set objectPosition(val) {
        if (val != null) this.setAttribute('object-position', val);
        else this.removeAttribute('object-position');
    }

    /**
     * Indica si se muestra un indicador de carga (wc-loading) mientras la imagen
     * (URL remota, etc.) termina de descargar. Por defecto activo.
     * @returns {boolean}
     */
    get showLoading() { return this.getAttribute('show-loading') !== 'false'; }

    /**
     * Activa o desactiva el indicador de carga.
     * @param {boolean} val
     */
    set showLoading(val) {
        if (val === false || val === 'false') this.setAttribute('show-loading', 'false');
        else this.removeAttribute('show-loading');
    }

    /**
     * Badge de aviso: punto en la esquina superior derecha (o círculo con icono si hay badgeIcon). null = sin badge.
     * @returns {string|null} 'dot'
     */
    get badge() { return this.getAttribute('badge'); }

    /**
     * @param {string|boolean|null} v - 'dot' o true para mostrar el punto; null/false para quitarlo.
     */
    set badge(v) {
        if (v === null || v === undefined || v === false) this.removeAttribute('badge');
        else this.setAttribute('badge', 'dot');
    }

    /** Color del punto: '' | 'red' | 'danger' (defecto rojo) | 'yellow' | 'warning' | 'green' | 'success'. */
    get badgeColor() { return this.getAttribute('badge-color') || ''; }
    set badgeColor(v) { v ? this.setAttribute('badge-color', v) : this.removeAttribute('badge-color'); }

    /**
     * Icono del catálogo (icon-catalog.css) dentro del badge. Con icono el badge es un círculo más grande en vez
     * del punto. Solo se ve si además hay badge.
     */
    get badgeIcon() { return this.getAttribute('badge-icon') || ''; }
    set badgeIcon(v) { v ? this.setAttribute('badge-icon', v) : this.removeAttribute('badge-icon'); }

    /**
     * Esquina del badge (punto o círculo con icono): 'top' (defecto, superior derecha) | 'bottom' (inferior derecha).
     * Lo resuelve el CSS sobre el atributo del host: no repinta el badge.
     */
    get badgePosition() { return this.getAttribute('badge-position') === 'bottom' ? 'bottom' : 'top'; }
    set badgePosition(v) { v === 'bottom' ? this.setAttribute('badge-position', 'bottom') : this.removeAttribute('badge-position'); }

    // --- MÉTODOS DE VALIDACIÓN NATIVA (API FACE) ---

    /**
     * Verifica la validez del componente ejecutando las reglas de validación nativas.
     * @returns {boolean} True si el componente es válido.
     */
    checkValidity() { return this._internals.checkValidity(); }

    /**
     * Verifica la validez del componente y, si es inválido, dispara el comportamiento nativo del navegador (como mostrar un globo de error).
     * @returns {boolean} True si el componente es válido.
     */
    reportValidity() { return this._internals.reportValidity(); }

    /**
     * Obtiene el estado de validez actual del componente.
     * @returns {ValidityState} Objeto con los estados de validación nativos.
     */
    get validity() { return this._internals.validity; }

    /**
     * Obtiene el mensaje de error de validación actual.
     * @returns {string} Mensaje de error, o cadena vacía si es válido.
     */
    get validationMessage() { return this._internals.validationMessage; }

    // ===========================================
    // LÓGICA INTERNA
    // ===========================================

    /**
     * Sincroniza el valor y el estado de validación con el navegador.
     * @private
     */
    _syncFormState() {
        // Guardia vital de seguridad para evitar errores de ciclo de vida
        if (!this._els || !this._els.preview) return;

        // 1. Sincronizamos el valor real (base64) para el FormData nativo
        this._internals.setFormValue(this._value);

        // 2. Evaluamos la obligatoriedad (si es required y el valor es nulo/vacío)
        if (this.required && !this._value) {
            this._internals.setValidity({ valueMissing: true }, this.texts.validationRequired, this._els.preview);
        } else {
            this._internals.setValidity({}); // Limpiamos errores si está correcto
        }
    }

    /**
     * Renderiza completamente el componente en el DOM.
     * Crea la estructura HTML con el input file, área de preview y placeholder.
     * @private
     */
    _render() {
        const placeholder = this.getAttribute('placeholder') || this.texts.placeholder;
        const isDisabled = this.hasAttribute('disabled');
        const isReadonly = this.hasAttribute('readonly');
        const accept = this.getAttribute('accept') || 'image/png, image/jpeg, image/jpg, image/webp';

        const esc = WCBaseElement.escapeHtml;
        // Accesibilidad: el area de preview es un boton (abre el selector de archivo).
        // Solo es interactiva si no esta readonly/disabled.
        const interactive = !isDisabled && !isReadonly;
        const previewA11y = interactive
            ? ` role="button" tabindex="0" aria-label="${esc(placeholder)}"`
            : ' tabindex="-1"';
        this.innerHTML = `
            <div class="image-upload-wrapper">
                <input type="file" style="display:none;" accept="${esc(accept)}" ${isDisabled || isReadonly ? 'disabled' : ''}>
                <div class="image-preview-area ${isReadonly ? 'disabled' : ''}"${previewA11y}>
                    <div class="upload-placeholder">
                        ${this.icons.fileImage}
                        <span>${esc(placeholder)}</span>
                    </div>
                </div>
            </div>
        `;

        this._els = {
            wrapper: this.querySelector('.image-upload-wrapper'),
            input: this.querySelector('input[type="file"]'),
            preview: this.querySelector('.image-preview-area')
        };

        const initialVal = this._value;
        const defaultImg = this.getAttribute('default-image');

        if (initialVal) {
            this._updatePreview(initialVal);
        } else if (defaultImg) {
            this._updatePreview(defaultImg, true);
        }

        if (!isDisabled && !isReadonly) {
            this._bindEvents();
        }

        this._renderBadge();
    }

    /**
     * Pinta (o quita) el badge (punto, o círculo con icono si hay badgeIcon). Va en el wrapper y no en el área de preview, que tiene overflow:hidden y
     * lo recortaría al ser circular. Es decorativo: el texto del aviso, si lo hay, va en el title del componente.
     * @private
     */
    _renderBadge() {
        const wrapper = this._els.wrapper;
        if (!wrapper) return;

        const actual = wrapper.querySelector(':scope > .image-badge');
        if (actual) actual.remove();

        if (!this.hasAttribute('badge')) return;

        const color = this.badgeColor;
        const varColor = color === 'yellow' || color === 'warning' ? 'var(--rf-color-warning)'
                       : color === 'green' || color === 'success' ? 'var(--rf-color-success)'
                       : 'var(--rf-color-error)';

        const badge = document.createElement('span');
        badge.className = 'image-badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.style.setProperty('--image-badge-color', varColor);
        if (varColor === 'var(--rf-color-warning)') badge.style.setProperty('--image-badge-icon-color', 'var(--alert-text-warning)');

        const icono = this.badgeIcon;
        if (icono) {
            badge.classList.add('has-icon');
            const wcIcon = document.createElement('wc-icon');
            wcIcon.setAttribute('name', icono);
            wcIcon.setAttribute('size', 'xs');
            badge.appendChild(wcIcon);
        }

        wrapper.appendChild(badge);
    }

    /**
     * Vincula todos los event listeners necesarios al componente.
     * Incluye eventos de clic, teclado (accesibilidad) y cambio de archivo con validaciones.
     * @private
     */
    _bindEvents() {
        this._els.preview.addEventListener('click', (e) => {
            if (e.target.closest('.remove-image-btn')) return;
            this._els.input.click();
        });

        this._els.preview.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._els.input.click();
            }
        });

        /**
         * Maneja el evento de cambio del input file.
         * Realiza validaciones de tamaño y tipo antes de cargar la imagen.
         * Detiene la propagación del evento para evitar interferencias con formularios padre.
         *
         * @param {Event} e - Evento de cambio del input
         */
        this._els.input.addEventListener('change', (e) => {
            // 1. CRUCIAL: Detenemos el evento nativo para evitar que DynamicForm
            e.stopPropagation();

            const file = e.target.files[0];
            if (!file) return;

            // 2. Validación de tamaño
            const maxSizeKB = this.getAttribute('max-size');
            if (maxSizeKB && file.size > maxSizeKB * 1024) {
                this._dispatchError(this.texts.errorSize(maxSizeKB));
                this._els.input.value = '';
                return;
            }

        // 3. Validación de tipo
            const acceptAttr = this.getAttribute('accept');
            if (acceptAttr) {
                const isValidType = this._validateFileType(file, acceptAttr);
                if (!isValidType) {
                    this._dispatchError(this.texts.errorType);
                    this._els.input.value = '';
                    return;
                }
            }

            // 4. Lectura y carga exitosa
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                const base64 = readerEvent.target.result;
                this._value = base64;
                this._updatePreview(base64);
                this._syncFormState(); // Sincronizamos el nuevo valor con el formulario nativo

                // 5. Disparamos evento change limpio y válido
                this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Valida si el archivo coincide con el atributo accept.
     * Soporta tres formatos:
     * - Extensiones: .pdf, .jpg, etc.
     * - MIME types exactos: image/png, application/pdf, etc.
     * - Wildcards: image/*, video/*, etc.
     * 
     * @private
     * @param {File} file - Objeto File a validar
     * @param {string} acceptString - Cadena del atributo accept con tipos permitidos separados por comas
     * @returns {boolean} true si el archivo es válido, false en caso contrario
     */
    _validateFileType(file, acceptString) {
        if (!acceptString) return true;

        const allowedTypes = acceptString.split(',').map(t => t.trim().toLowerCase());
        const fileName = file.name.toLowerCase();
        const fileType = file.type.toLowerCase();

        return allowedTypes.some(type => {
            // Caso A: Extensión (ej: .jpg)
            if (type.startsWith('.')) {
                return fileName.endsWith(type);
            }
            // Caso B: Wildcard (ej: image/*)
            if (type.endsWith('/*')) {
                const mainType = type.replace('/*', '');
                return fileType.startsWith(mainType + '/');
            }
            // Caso C: MimeType exacto (ej: image/jpeg)
            return fileType === type;
        });
    }

    /**
     * Actualiza el preview detectando inteligentemente el tipo de fuente.
     * Soporta: Byte[] (propiedad JS), Rutas (con extensión/punto) y Base64.
     * @private
     */
    _updatePreview(src, isDefault = false) {
        if (!this._els.preview) return;

        this._els.preview.innerHTML = '';
        const isReadonly = this.hasAttribute('readonly');

        let finalSrc = null;

        if (src) {
            // -----------------------------------------------------------------
            // 1. BINARIO (Byte Array / Buffer) -> Propiedad JS directa
            // -----------------------------------------------------------------
            if (src instanceof Uint8Array || src instanceof ArrayBuffer || Array.isArray(src)) {
                try {
                    // Convertimos a Uint8Array
                    const buffer = Array.isArray(src) ? new Uint8Array(src) : new Uint8Array(src);

                    // Transformación segura a Base64 (evitando URL.createObjectURL por restricciones CSP)
                    let binary = '';
                    const len = buffer.byteLength;
                    // Usamos un bucle clásico en lugar de String.fromCharCode.apply para evitar 
                    // errores de "Maximum call stack size exceeded" con imágenes grandes.
                    for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(buffer[i]);
                    }
                    const base64String = window.btoa(binary);

                    // Generamos el data URI (El navegador inferirá si es PNG o JPG por las cabeceras del base64 interno)
                    finalSrc = `data:image/jpeg;base64,${base64String}`;

                } catch (e) {
                    console.warn('WCImage: Error leyendo binario y convirtiendo a Base64', e);
                }
            }
            // -----------------------------------------------------------------
            // 2. STRING (URL vs Base64)
            // -----------------------------------------------------------------
            else if (typeof src === 'string') {
                const trimmed = src.trim();

                // A. Si ya tiene cabecera data:, perfecto.
                if (trimmed.startsWith('data:')) {
                    finalSrc = trimmed;
                }
                // B. HEURÍSTICA PARA RUTA / URL:
                // Si tiene un punto "." (ej: foto.png, style.css) O empieza por / o http
                // (Los Base64 crudos NO tienen puntos)
                else if (
                    trimmed.includes('.') ||
                    trimmed.startsWith('/') ||
                    trimmed.startsWith('http') ||
                    /[\s?#]/.test(trimmed)
                ) {
                    finalSrc = trimmed;
                }
                // C. Si no es nada de lo anterior, asumimos Base64 Crudo
                else {
                    finalSrc = `data:image/jpeg;base64,${trimmed}`;
                }
            }
        }

        // Si no logramos obtener una fuente válida, salimos
        if (!finalSrc) return;

        // --- RENDERIZADO VISUAL ---
        if (!isReadonly && !isDefault) {
            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-image-btn';
            removeBtn.innerHTML = this.icons.close;
            removeBtn.title = this.texts.removeTitle;
            // Accesibilidad: boton operable por teclado con etiqueta
            removeBtn.setAttribute('role', 'button');
            removeBtn.setAttribute('tabindex', '0');
            removeBtn.setAttribute('aria-label', this.texts.removeTitle);
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._clearImage();
            });
            removeBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    this._clearImage();
                }
            });
            this._els.preview.appendChild(removeBtn);
        }

        const img = document.createElement('img');
        // Accesibilidad: texto alternativo (atributo alt explicito o fallback generico)
        img.alt = this.getAttribute('alt') || this.texts.placeholder;
        img.style.objectFit = this.getAttribute('object-fit') || "fill";

        const objPosition = this.getAttribute('object-position');
        if (objPosition) {
            img.style.objectPosition = objPosition; // Permitimos valores exactos de CSS como "center top", "left", "50% 20%", etc.
        }

        // Indicador de carga propio mientras el navegador descarga/decodifica la imagen (p.ej. URL remota).
        // Se retira en 'load' o cuando el fallo es definitivo (tras el fallback JPG/PNG de abajo).
        let loadingEl = null;
        if (this.showLoading) {
            loadingEl = document.createElement('div');
            loadingEl.className = 'image-loading-overlay';
            loadingEl.innerHTML = '<span class="image-spinner"></span>';
            this._els.preview.appendChild(loadingEl);
        }
        const hideLoading = () => {
            if (loadingEl) { loadingEl.remove(); loadingEl = null; }
        };

        // Fallback: Si asumimos que era JPG base64 y falla, probamos PNG automáticamente
        const isJpegGuess = typeof src === 'string' && finalSrc.startsWith('data:image/jpeg');
        img.addEventListener('load', hideLoading, { once: true });
        img.addEventListener('error', () => {
            // Evitar bucle infinito: solo reintentamos una vez con PNG
            if (isJpegGuess && img.src.includes('image/jpeg')) {
                img.src = `data:image/png;base64,${src}`;
                return;
            }
            hideLoading();
        });
        img.src = finalSrc;

        this._els.preview.classList.add('has-image');
        this._els.preview.appendChild(img);

        if (!isReadonly) {
            const overlay = document.createElement('div');
            overlay.className = 'image-edit-overlay';
            const txt = this.getAttribute('placeholder') || this.texts.placeholder;
            overlay.innerHTML = `${this.icons.fileImage}<span>${WCBaseElement.escapeHtml(txt)}</span>`;
            this._els.preview.appendChild(overlay);
        }
    }

    /**
     * Limpia la imagen actual del componente.
     * Restaura la imagen por defecto si existe, o muestra el placeholder.
     * Dispara un evento 'change' para notificar el cambio.
     * 
     * @private
     */
    _clearImage() {
        this._value = null;
        if (!this._els.input) return;

        const defaultImg = this.getAttribute('default-image');
        if (defaultImg) {
            this._updatePreview(defaultImg, true);
        } else {
            this._els.preview.classList.remove('has-image');
            const placeholder = this.getAttribute('placeholder') || this.texts.placeholder;
            this._els.preview.innerHTML = `
                <div class="upload-placeholder">
                    ${this.icons.fileImage}
                    <span>${WCBaseElement.escapeHtml(placeholder)}</span>
                </div>
            `;
        }

        this._syncFormState(); // Notificamos al formulario que el valor ha desaparecido
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    /**
     * Dispara un evento de error personalizado que puede ser capturado por componentes padre.
     * Útil para integración con formularios dinámicos que manejan validación.
     * 
     * @private
     * @param {string|Function} msg - Mensaje de error o función que retorna el mensaje
     */
    _dispatchError(msg) {
        const message = typeof msg === 'function' ? msg() : msg;
        this.dispatchEvent(new CustomEvent('image-error', {
            detail: { message: message },
            bubbles: true,
            composed: true
        }));
    }
}

if (!customElements.get('wc-image')) customElements.define('wc-image', WCImage);