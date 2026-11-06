class DynamicForm extends WidgetBase {
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });

        /** @private @type {Array<Object>} Referencias a los campos generados para acceso rápido */
        this._fieldRefs = [];

        /** @private @type {Array<Object>} Referencias a elementos de PRESENTACIÓN (secciones, tabs, etc.) */
        this._layoutRefs = [];

        /** @private @type {boolean} Marca si el formulario es de solo lectura */
        this._readonly = false;

        /** @private @type {Function|null} Función de validación externa */
        this._externalValidator = null;

        /** @private @type {Object|null} Header de cabecera del formulario */
        this._header = null;

        /** @private @type {string|Array|Object|null} Información del formulario */
        this._info = null;

        /** @private @type {string|null} Mensaje de error global por defecto */
        this._globalError = null;

        /** @private Accesibilidad: id unico de instancia para ids de mensajes de error (aria-describedby) */
        this._uid = (DynamicForm._uidCounter = (DynamicForm._uidCounter || 0) + 1);

        this.resources = {
            icons: {
                info: `<svg style="width: 16px; height: 16px; min-width: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
                chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
                mini_ficha: `<span class="mini-ficha"></span>`
            }
        };
    }

    get componentCssName() {
        return 'dynamic-form.css';
    }

    /**
     * Define los atributos que el componente observará para cambios.
     * @returns {string[]} Lista de atributos observados.
     */
    static get observedAttributes() {
        return [...super.observedAttributes, 'readonly'];
    }

    /**
     * Callback que se ejecuta cuando un atributo observado cambia.
     * @param {string} name - Nombre del atributo.
     * @param {string} oldValue - Valor anterior.
     * @param {string} newValue - Nuevo valor.
     */
    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (oldValue !== newValue) {
            if (name === 'readonly') { this.readonly = newValue; }
        }
    }

    /**
     * Obtiene si el formulario es readonly .
     * @returns {boolean}
     */
    get readonly() { return this._readonly; }

    /**
     * Establece la propiedad de solo lectura.
     * @param {boolean} val - Valor de solo lectura.
     */
    set readonly(val) {
        if (this._readonly === val) return;
        this._readonly = val;
        if (val) this.setAttribute('readonly', val);
        this._setReadonly();
    }

    /**
     * Asigna una función de validación externa personalizada.
     * @param {Function} fn - Función que recibe la data y devuelve un objeto de errores { campo: 'mensaje' }.
     */
    set validator(fn) {
        this._externalValidator = fn;
    }

    /**
     * Obtiene el header de cabecera del formulario.
     * @returns {Object|null}
     */
    get header() { return this._header; }

    /**
     * Establece el header de cabecera (título y descripción).
     * @param {Object} val - Objeto con propiedades {title, description}.
     */
    set header(val) {
        this._header = val;
        // Opcional: Si el formulario ya está renderizado, actualizamos visualmente al instante
        if (this.shadow.querySelector('form')) {
            this.setFormHeader(val?.title, val?.description);
        }
    }

    /**
    * Obtiene el info de cabecera del formulario.
    * @returns {Object|null}
    */
    get info() { return this._info; }

    /**
    * Establece la información del formulario.
    * @param {string|Array|Object|null} val - Mensaje(s) o configuración del aviso.
    */
    set info(val) {
        this._info = val;

        if (!this.shadow.querySelector('.form-info')) return;

        // Caso null/undefined: ocultar banner
        if (val == null) {
            this.setFormInfo(null);
            return;
        }

        // Caso simple: string o array = mensaje directo
        if (typeof val === 'string' || Array.isArray(val)) {
            this.setFormInfo(val);
            return;
        }

        // Caso objeto
        if (typeof val === 'object') {
            const {
                message,
                type = 'info',
                dismissible = true,
                sticky = false
            } = val;

            this.setFormInfo(message, type, dismissible, sticky);
        }
    }

    /**
     * Obtiene el mensaje de error global por defecto.
     * @returns {string|null}
     */
    get globalError() { return this._globalError; }

    /**
     * Establece el mensaje de error global por defecto.
     * @param {string|null} val
     */
    set globalError(val) { this._globalError = val; }

    /**
    * Si true, pinta un <hr> divisor entre cada campo al renderizar.
    * @param {boolean} val
    */
    get dividedFields() { return this._dividedFields; }
    set dividedFields(val) { this._dividedFields = !!val; }

    // =========================================================================
    // API PÚBLICA
    // =========================================================================

    /**
     * Renderiza el formulario basado en el esquema proporcionado.
     * @param {Array<Object>} schema - Array de configuración de campos.
     * Estructura de cada objeto: { id, name, type, label, required, options, columns, etc. }
     */
    render(schema) {
        const styles = this.shadow.querySelectorAll('link[rel="stylesheet"]');
        this.shadow.innerHTML = '';
        if (styles.length > 0) {
            this.shadow.prepend(...styles);
        }

        this._fieldRefs = [];
        this._layoutRefs = [];

        const form = document.createElement('form');
        form.setAttribute('novalidate', 'true');
        form.addEventListener('submit', (e) => e.preventDefault());

        // A. CONTENEDOR CABECERA
        const header = document.createElement('div');
        header.className = 'form-header hidden';
        form.appendChild(header);

        const formInfo = document.createElement('wc-banner');
        formInfo.className = 'form-info';
        formInfo.setAttribute('hidden', '');
        form.appendChild(formInfo);

        // B. CONTENEDOR ERROR GLOBAL
        const globalError = document.createElement('wc-banner');
        globalError.className = 'global-error';
        globalError.setAttribute('hidden', '');
        form.appendChild(globalError);

        if (!Array.isArray(schema)) {
            console.error('DynamicForm: Schema debe ser un array.');
            return;
        }

        this._applyRowGroups(schema);

        this._appendWithDividers(form, schema);

        this.shadow.appendChild(form);

        if (this.header && typeof this.header === 'object') {
            this.setFormHeader(this.header?.title, this.header?.description);
        }

        if (this.info) { this.info = this.info; }

        if (this._readonly) {
            this._setReadonly();
        }

        // Una vez que todo existe y tiene valor, lanzamos eventos en orden
        // Usamos setTimeout(0) para asegurar que el DOM está listo y pintado antes de la lógica
        setTimeout(() => {
            this._triggerChangeEvents();
        }, 0);
    }

    /**
     * Establece los valores de los campos del formulario.
     * @param {Object} data - Objeto llave-valor donde la llave corresponde al 'name' del campo.
     * @param {boolean} [emitEvents=true] - Si es true, dispara el evento 'change' en los campos modificados.
     */
    setValues(data, emitEvents = true) {
        if (!data || typeof data !== 'object') return;

        Object.keys(data).forEach(key => {
            const field = this._fieldRefs.find(f => f.name === key);
            if (!field) return;

            const value = data[key];

            if (field.type === 'multiselect' || field.type === 'select') {
                field.element.value = value;
            } else if (field.type === 'checkbox') {
                field.element.checked = !!value;
            } else if (field.type === 'radio' || field.type === 'pill-group' || field.type === 'color-group' || field.type === 'icon-group') {
                field.element.value = (value !== undefined && value !== null) ? value : '';
            } else if (field.type === 'image') {
                field.element.value = (value && typeof value === 'string') ? value : null;
            } else if (field.type === 'label') {
                field.element.textContent = (value !== undefined && value !== null) ? value : '';
            } else if (field.type === 'status') {
                field.element.value = value;
            } else if (field.type === 'file-upload') {
                // Para file-upload, si el valor es un array vacío o null/undefined, limpiar
                if (!value || (Array.isArray(value) && value.length === 0)) {
                    field.element.clear();
                } else if (Array.isArray(value)) {
                    field.element.setFiles(value);
                }
            } else {
                // Inputs estándar
                field.element.value = (value !== undefined && value !== null) ? value : '';
            }
        });

        if (emitEvents) {
            Object.keys(data).forEach(key => {
                const field = this._fieldRefs.find(f => f.name === key);
                if (field) {
                    if (field.type === 'radio') {
                        if (field.element.length > 0) field.element[0].dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    } else {
                        field.element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    }
                }
            });
        }
    }

    /**
     * Obtiene la referencia completa a un campo del formulario.
     * @param {string} fieldName - Nombre (name) o ID del campo.
     * @returns {Object|null} Objeto con { element, wrapper, type, name, id, readonly, required } o null si no existe.
     */
    getField(fieldName) {
        var ref = this._fieldRefs.find(f => f.name === fieldName || f.id === fieldName);
        if (!ref) {
            ref = this._layoutRefs.find(l => l.name === fieldName || l.id === fieldName);
        }
        return ref || null;
    }

    /**
     * Controla la visibilidad de un campo específico.
     * @param {string} fieldName - Nombre (name) o ID del campo.
     * @param {boolean} isVisible - True para mostrar, False para ocultar.
     */
    setFieldVisibility(fieldName, isVisible) {
        const ref = this.getField(fieldName);
        if (ref?.wrapper) {
            ref.wrapper.style.display = isVisible ? '' : 'none';
            this._refreshDividers(ref.wrapper.parentElement);
        }
    }

    /**
     * Reajusta la visibilidad de los <hr class="form-divider"> de un contenedor
     * tras ocultar o mostrar un campo, para evitar divisores huerfanos.
     * Reglas aplicadas:
     *   - Divisores antes del primer elemento visible: ocultos.
     *   - Divisores consecutivos en un hueco de elementos ocultos: solo el primero visible.
     *   - Divisores tras el ultimo elemento visible: ocultos.
     * @param {HTMLElement} container
     * @private
     */
    _refreshDividers(container) {
        if (!container) return;
        const children = Array.from(container.children);

        // Resetear todos los form-divider a visibles
        children.forEach(el => {
            if (el.tagName === 'HR' && el.classList.contains('form-divider')) {
                el.style.display = '';
            }
        });

        let hasSeenVisible = false;
        let divsInGap = [];

        for (const el of children) {
            const isHr = el.tagName === 'HR' && el.classList.contains('form-divider');
            const isVisible = el.style.display !== 'none';

            if (isHr) {
                divsInGap.push(el);
            } else if (isVisible) {
                if (!hasSeenVisible) {
                    // Sin elemento visible previo: ocultar divisores iniciales
                    divsInGap.forEach(hr => hr.style.display = 'none');
                } else if (divsInGap.length > 1) {
                    // Varios divisores consecutivos: conservar solo el primero
                    divsInGap.slice(1).forEach(hr => hr.style.display = 'none');
                }
                hasSeenVisible = true;
                divsInGap = [];
            }
        }

        // Divisores finales sin elemento visible posterior: ocultar
        divsInGap.forEach(hr => hr.style.display = 'none');
    }

    /**
     * Controla la visibilidad del icono de información (infoText) de un campo específico.
     * @param {string} fieldName - Nombre (name) o ID del campo.
     * @param {boolean} isVisible - True para mostrar, False para ocultar.
     */
    setFieldInfoVisibility(fieldName, isVisible) {
        const ref = this.getField(fieldName);
        if (ref?.wrapper) {
            const infoIcon = ref.wrapper.querySelector('.info-icon');
            if (infoIcon) {
                infoIcon.style.display = isVisible ? '' : 'none';
            }
        }
    }

    /**
     * Ejecuta la validación del formulario.
     * Incluye validación HTML5 nativa, validación de requerimientos de imágenes
     * y validación externa (si se configuró con `set validator`).
     * @returns {boolean} True si el formulario es válido, False en caso contrario.
     */
    validate() {
        let isValid = true;
        const currentData = this.getData();
        const fieldsWithInternalErrors = new Set();

        this._fieldRefs.forEach(ref => this._clearError(ref.wrapper));
        this.clearGlobalError();

        // 2. VALIDACIÓN HTML5
        const TRIM_TYPES = ['text', 'email', 'password', 'number', 'tel', 'url', 'search', 'textarea', 'rich-text', 'richtext'];

        this._fieldRefs.forEach(ref => {
            if (ref.wrapper.style.display === 'none') return;
            if (ref.readonly) return;

            const { element, wrapper, type } = ref;
            if (['label', 'status', 'hidden'].includes(ref.type)) return;

            // Trim previo: espacios en blanco no cuentan como valor
            if (TRIM_TYPES.includes(type) && typeof element.value === 'string') {
                element.value = element.value.trim();
            }

            let msg = '';
            let fieldFailed = false;

            if (type === 'file-upload') {
                const fileCount = element.files ? element.files.length : 0;
                if (ref.required && fileCount === 0) {
                    fieldFailed = true; msg = Traduccion.VALOR_OBLIGATORIO;
                }
            } else if (type === 'tree-list') {
                const val = element.value;
                const isEmpty = Array.isArray(val) ? val.length === 0 : (!val || val === '');
                if (ref.required && isEmpty) {
                    fieldFailed = true; msg = Traduccion.VALOR_OBLIGATORIO;
                }
            } else {
                if (!element.checkValidity()) {
                    fieldFailed = true;
                    // Intentamos sacar el error nativo, y si es valueMissing, ponemos el de tu traducción
                    msg = element.validationMessage;
                    if (element.validity && element.validity.valueMissing) {
                        msg = Traduccion.VALOR_OBLIGATORIO;
                    }
                    if (element.validity && element.validity.typeMismatch && type === 'email') {
                        msg = Traduccion.INGRESA_EMAIL_VALIDO;
                    }
                }
            }

            if (fieldFailed) {
                isValid = false;
                this._setError(wrapper, msg);
                fieldsWithInternalErrors.add(ref.name);
            }
        });

        // Validación Externa
        if (typeof this._externalValidator === 'function') {
            const externalErrors = this._externalValidator(currentData);
            // En caso de que sea un error genérico y no de 1 campo en concreto usamos un return false directamente
            if (externalErrors === false) {
                isValid = false;
            }
            else if (externalErrors && typeof externalErrors === 'object') {
                Object.keys(externalErrors).forEach(fieldName => {
                    if (fieldsWithInternalErrors.has(fieldName)) return;

                    const errorMsg = externalErrors[fieldName];
                    const fieldRef = this._fieldRefs.find(f => f.name === fieldName);

                    if (fieldRef && errorMsg) {
                        isValid = false;
                        this._setError(fieldRef.wrapper, errorMsg);
                    }
                });
            }
        }

        if (!isValid && this.globalError) {
            this.setGlobalError(this.globalError);
        }

        return isValid;
    }

    /**
     * Recolecta y devuelve los datos actuales del formulario.
     * @returns {Object} Objeto con los valores (radio, checkbox, text, base64 images).
     */
    getData() {
        const data = {};
        this._fieldRefs.forEach(ref => {
            if (ref.type === 'label') return;
            const name = ref.name;
            if (ref.type === 'multiselect' || ref.type === 'select') {
                data[name] = ref.element.value;
            } else if (ref.type === 'radio' || ref.type === 'pill-group' || ref.type === 'color-group' || ref.type === 'icon-group') {
                // pill-group / color-group / icon-group multiple devuelven array ([] vacio es truthy y se conserva)
                data[name] = ref.element.value || null;
            } else if (ref.type === 'checkbox') {
                data[name] = ref.element.checked;
            } else if (ref.type === 'tree-list') {
                data[name] = ref.element.value;
            } else if (ref.type === 'image') {
                data[name] = ref.element.value || null;
            } else if (ref.type === 'file-upload') {
                data[name] = ref.element.files || [];
            } else {
                data[name] = ref.element.value;
            }
        });       
        return data;
    }

    /**
     * Reinicia el formulario a su estado inicial (vacío).
     * Limpia valores, errores de validación y restaura placeholders.
     */
    clean() {
        this.clearGlobalError();

        // FASE 1: RESTAURAR ESTADO (Sin eventos)
        this._fieldRefs.forEach(ref => {
            const { element, wrapper, type, defaultValue } = ref;

            // Limpiar errores visuales
            this._clearError(wrapper);

            // Calcular valor de restauración
            const resetVal = defaultValue !== undefined ? defaultValue : '';

            switch (type) {
                case 'select':
                case 'multiselect':
                    element.value = resetVal || null;
                    break;

                case 'checkbox':
                    element.checked = !!resetVal;
                    break;

                case 'radio':
                case 'pill-group':
                case 'color-group':
                case 'icon-group':
                    element.value = resetVal;
                    break;

                case 'image':
                    element.value = resetVal || null;
                    break;

                case 'label':
                    element.textContent = resetVal;
                    break;

                case 'status':
                    // Status es solo visual, no se limpia
                    break;

                case 'file-upload':
                    if (typeof element.clear === 'function') element.clear();
                    break;

                case 'tree-list':
                    element.value = Array.isArray(resetVal) ? resetVal : [];
                    break;

                case 'range':
                    element.value = resetVal !== '' ? resetVal : (element.min || 0);
                    break;

                case 'date':
                case 'datetime-local':
                case 'time':
                case 'month':
                    element.value = resetVal;
                    // Fallback para datepicker
                    if (element._els?.input) element._els.input.value = resetVal;
                    break;

                case 'textarea':
                    element.value = resetVal;
                    // Fallback: actualizar directamente el textarea nativo interno
                    if (element._els?.textarea) element._els.textarea.value = resetVal;
                    break;

                case 'rich-text':
                case 'richtext':
                    element.value = resetVal;
                    break;

                case 'text':
                case 'email':
                case 'password':
                case 'number':
                case 'tel':
                case 'url':
                case 'search':
                case 'hidden':
                default:
                    // Inputs estándar (wc-input)
                    element.value = resetVal;
                    // Fallback: actualizar directamente el input nativo interno
                    if (element._els?.input) element._els.input.value = resetVal;
                    break;
            }
        });

        // Ahora que todos los campos están "limpios" y en su sitio, 
        // ejecutamos las lógicas de dependencias.
        this._triggerChangeEvents();
    }

    // --- MÉTODOS DE CONTROL VISUAL (HEADER Y ERROR) ---

    /**
     * Muestra un mensaje de error global en la parte superior del formulario.
     * @param {string} msg - Mensaje de error a mostrar.
     */
    setGlobalError(msg) {
        const el = this.shadow.querySelector('.global-error');
        if (el) {
            // Un mensaje vacío/undefined no debe dejar el banner visible sin contenido:
            // se sustituye por un texto genérico para que el usuario siempre reciba feedback.
            const texto = (msg && String(msg).trim()) ? msg : Traduccion.SE_HA_PRODUCIDO_UN_ERROR_EN_EL_PROCESO;
            el.value = { message: texto, type: 'error', dismissible: false };
            el.removeAttribute('hidden');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * Oculta el mensaje de error global.
     */
    clearGlobalError() {
        const el = this.shadow.querySelector('.global-error');
        if (el) el.setAttribute('hidden', '');
    }

    /**
     * Actualiza el título y descripción visual del formulario.
     * @param {string} title - Título del formulario.
     * @param {string} description - Descripción o subtítulo.
     */
    setFormHeader(title, description) {
        const el = this.shadow.querySelector('.form-header');
        if (el) {
            const esc = WidgetBase.escapeHtml;
            let html = '';
            if (title) html += `<h3>${esc(title)}</h3>`;
            if (description) html += `<p>${esc(description)}</p>`;

            el.innerHTML = html;

            if (!title && !description) {
                el.classList.add('hidden');
            } else {
                el.classList.remove('hidden');
            }
        }
    }

    /**
    * Actualiza información visual del formulario.
    * @param {string|Array} message - Mensaje(s) del formulario.
    * @param {'info'|'warning'|'error'|'success'} type - Tipo de alerta (color).
    * @param {boolean} dismissible - Si el usuario puede cerrarla.
    * @param {boolean} sticky - Si el formInfo debe volverse sticky.
    */
    setFormInfo(message, type = 'info', dismissible = true, sticky = false) {
        const el = this.shadow.querySelector('.form-info');
        if (!el) return;
        
        // Si no hay mensaje, ocultar
        if (!message || (Array.isArray(message) && message.length === 0)) {
            el.setAttribute('hidden', '');
            return;
        }
        
        // Configurar wc-banner usando value para evitar múltiples renders
        el.value = { message, type, dismissible, sticky };
        el.removeAttribute('hidden');
    }

    /**
     * Desplaza suavemente la vista hasta el campo especificado por su ID.
     * @param {string} id - ID del campo al que desplazarse (ej: '#campo1', 'textoarea#campo1').
     */
    goToElement(id) {
        const element = this.shadow.querySelector(id);
        if (!element) return;

        // Cancelar timeout anterior si existe para evitar múltiples timers activos
        if (element._highlightTimer) {
            clearTimeout(element._highlightTimer);
            element.classList.remove('field-highlight');
        }

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('field-highlight');
        element.focus({ preventScroll: true });

        // Guardar referencia del timer para poder cancelarlo
        element._highlightTimer = setTimeout(() => {
            element.classList.remove('field-highlight');
            element._highlightTimer = null;
        }, 3000);
    }

    // =========================================================================
    // LÓGICA PRIVADA
    // =========================================================================

    /**
     * Crea un nodo de campo (wrapper, label e input) basado en la configuración.
     * @private
     * @param {Object} config - Configuración del campo individual.
     * @returns {HTMLElement} El elemento wrapper completo del campo.
     */
    _createField(config) {
        const wrapper = document.createElement('div');
        wrapper.className = `form-group type-${config.type}`;
        if (config.id) wrapper.setAttribute('data-field-id', config.id);

        const colSpan = config.columns ? config.columns : 12;
        wrapper.classList.add(`col-${colSpan}`);

        if (config.newRow) {
            wrapper.style.setProperty('grid-column', `1 / span ${colSpan}`, 'important');
        }

        if (config.rows) {
            wrapper.style.setProperty('grid-row', `span ${config.rows}`, 'important');
        }

        if (config.readonly) wrapper.classList.add('is-readonly');
        if (config.visible === false) wrapper.style.display = 'none';

        if (config.type === 'section') {
            const sectionEl = this._createSection(config);
            wrapper.appendChild(sectionEl);

            // Registramos el elemento en el DOM Virtual de Layout
            this._layoutRefs.push({
                id: config.id,
                name: config.name || config.id,
                type: config.type,
                element: sectionEl,
                wrapper: wrapper
            });
            
            return wrapper;
        }

        if (config.type === 'tabs') {
            // Banner para tabs: va ANTES del elemento tabs
            if (config.banner) {
                const bannerEl = document.createElement('wc-banner');
                if (typeof config.banner === 'string') {
                    bannerEl.value = { message: config.banner, type: 'info', dismissible: true };
                } else {
                    bannerEl.value = { type: 'info', dismissible: true, ...config.banner };
                }
                wrapper.appendChild(bannerEl);
            }
            const tabEl = this._createTabs(config);
            wrapper.appendChild(tabEl);

            // Registramos el elemento en el DOM Virtual de Layout
            this._layoutRefs.push({
                id: config.id,
                name: config.name || config.id,
                type: config.type,
                element: tabEl,
                wrapper: wrapper
            });

            return wrapper;
        }

        if (config.type === 'button-bar') {
            let barContainer = wrapper;

            if (config.label) {
                const labelBlock = document.createElement('div');
                labelBlock.className = 'label-block';
                if (config.hiddenLabel) labelBlock.style.display = 'none';

                const labelEl = document.createElement('label');
                labelEl.className = 'field-label';
                const textSpan = document.createElement('span');
                textSpan.textContent = config.label;
                labelEl.appendChild(textSpan);
                if (config.infoText) labelEl.appendChild(this._createInfoIcon(config.infoText));
                labelBlock.appendChild(labelEl);

                if (config.labelPosition === 'side') {
                    // Layout horizontal: label-block + control-area en la misma fila
                    wrapper.classList.add('label-inline');
                    if (config.labelWidth) wrapper.style.setProperty('--label-width', config.labelWidth);
                    wrapper.appendChild(labelBlock);

                    const controlArea = document.createElement('div');
                    controlArea.className = 'control-area';
                    wrapper.appendChild(controlArea);
                    barContainer = controlArea;

                    // subLabel en side: fila completa debajo del par label+control
                    if (config.subLabel) {
                        const subLabelEl = document.createElement('span');
                        subLabelEl.className = 'field-sublabel';
                        subLabelEl.textContent = config.subLabel;
                        wrapper.appendChild(subLabelEl);
                    }
                } else {
                    // Layout vertical (top): subLabel dentro del label-block
                    if (config.subLabel) {
                        const subLabelEl = document.createElement('span');
                        subLabelEl.className = 'field-sublabel';
                        subLabelEl.textContent = config.subLabel;
                        labelBlock.appendChild(subLabelEl);
                    }
                    wrapper.appendChild(labelBlock);
                }
            }

            const barEl = this._createButtonBar(config);
            barContainer.appendChild(barEl);

            // Registramos el elemento en el DOM Virtual de Layout
            this._layoutRefs.push({
                id: config.id,
                name: config.name || config.id,
                type: config.type,
                element: barEl,
                wrapper: wrapper
            });

            return wrapper;
        }

        const fieldName = config.name || config.id;

        // --- 1. CÁLCULO DEL VALOR INICIAL ---
        const val = config.value;
        const isValidValue = val !== undefined && val !== null && val !== '';

        let initialValue = isValidValue ? val : (config.defaultValue !== undefined ? config.defaultValue : '');

        // Ajuste defensivo: Checkbox necesita booleano false, no string vacío
        if (config.type === 'checkbox' && initialValue === '') initialValue = false;

        if (!['checkbox', 'hidden', 'label'].includes(config.type)) {
            const labelBlock = document.createElement('div');
            labelBlock.className = 'label-block';
            if (config.hiddenLabel) labelBlock.style.display = 'none';

            const label = document.createElement('label');
            label.className = 'field-label';

            if (config.label) {
                label.setAttribute('for', config.id);
                const textSpan = document.createElement('span');
                textSpan.textContent = config.label;
                label.appendChild(textSpan);

                if (config.required && !config.readonly) {
                    const reqSpan = document.createElement('span');
                    reqSpan.className = 'req';
                    reqSpan.textContent = '*';
                    label.appendChild(reqSpan);
                }
                if (config.infoText) {
                    label.appendChild(this._createInfoIcon(config.infoText));
                }
            } else {
                label.innerHTML = '&nbsp;';
                label.style.pointerEvents = 'none';
            }
            labelBlock.appendChild(label);

            // subLabel en layout top: va dentro del label-block, entre label y control
            if (config.subLabel && config.labelPosition !== 'side') {
                const subLabelEl = document.createElement('span');
                subLabelEl.className = 'field-sublabel';
                subLabelEl.textContent = config.subLabel;
                labelBlock.appendChild(subLabelEl);
            }

            wrapper.appendChild(labelBlock);
        }

        // En layout 'side', crea .control-area separado del label-block
        let controlContainer = wrapper;
        if (config.labelPosition === 'side' && !['checkbox', 'hidden', 'label'].includes(config.type)) {
            wrapper.classList.add('label-inline');
            if (config.labelWidth) wrapper.style.setProperty('--label-width', config.labelWidth);
            const controlArea = document.createElement('div');
            controlArea.className = 'control-area';
            wrapper.appendChild(controlArea);
            controlContainer = controlArea;

            // subLabel en layout side: ancho completo debajo de la fila label+control
            if (config.subLabel) {
                const subLabelEl = document.createElement('span');
                subLabelEl.className = 'field-sublabel';
                subLabelEl.textContent = config.subLabel;
                wrapper.appendChild(subLabelEl);
            }
        }

        // --- BANNER INFORMATIVO (para campos, va despues del label) ---
        if (config.banner) {
            const bannerEl = document.createElement('wc-banner');
            if (typeof config.banner === 'string') {
                bannerEl.value = { message: config.banner, type: 'info', dismissible: true };
            } else {
                bannerEl.value = { type: 'info', dismissible: true, ...config.banner };
            }
            controlContainer.appendChild(bannerEl);
        }

        let inputEl = null;

        switch (config.type) {
            case 'tree-list':
                // Instanciamos tu Web Component
                inputEl = document.createElement('tree-list');
                if (this.callerContext) inputEl.callerContext = this.callerContext; // Para que tenga el mismo contexto de llamada y pueda usar recursos compartidos

                // Le pasamos la configuración
                Object.assign(inputEl, {
                    cssPath: this.cssPath, // Para que pueda cargar estilos si los necesita
                    cssVersion: this.cssVersion,
                    data: config.data || [],           // El JSON del árbol
                    searchable: !!config.searchable,
                    showSelectAll: !!config.showSelectAll,
                    borderless: !!config.borderless,
                    multiselect: !!config.multiselect,
                    defaultSelectable: !!config.defaultSelectable,
                    buttonsOnFocus: !!config.buttonsOnFocus,
                    disablePagination: !!config.disablePagination,
                    hideExpander: !!config.hideExpander, // Default para todos los nodos; node.hideExpander (true/false) lo sobreescribe por fila
                    sortable: !!config.sortable, // Drag & drop: arrastrar filas para reordenar/cambiar de grupo
                    dragAnywhere: !!config.dragAnywhere // Arrastrar desde toda la fila en vez de solo el asa
                });

                // height explicito (px): fuerza flex-basis:auto dentro de TreeList para que la altura
                // mande sobre el flex:1 del host y el scroll interno funcione. Sin height, no se fija
                // ningun limite: la lista crece tanto como necesite (sin scroll, sin paginacion util).
                if (config.height) inputEl.height = config.height;
                // Tope de altura (no fuerza flex-basis como height): la lista crece hasta este límite
                // y recién ahí activa su scroll interno, sin cambiar el comportamiento de height.
                if (config.maxHeight) inputEl.maxHeight = config.maxHeight;

                // Estos tienen su propio default sensato dentro de TreeList (nodeHeight='54px',
                // emptyText='No existen datos', pageSize=50, sortableScope='tree', canDrop=null) —
                // solo se sobreescriben si el schema los especifica explícitamente, para no pisar
                // ese default con '' / undefined.
                if (config.nodeHeight) inputEl.nodeHeight = config.nodeHeight;
                if (config.emptyText) inputEl.emptyText = config.emptyText;
                if (config.pageSize) inputEl.pageSize = config.pageSize;
                if (config.sortableScope) inputEl.sortableScope = config.sortableScope;
                if (typeof config.canDrop === 'function') inputEl.canDrop = config.canDrop;
                if (config.noDataIcon !== undefined) inputEl.noDataIcon = config.noDataIcon;
                if (config.noResultsIcon !== undefined) inputEl.noResultsIcon = config.noResultsIcon;

                // Si viene con un valor inicial (array de IDs seleccionados)
                if (initialValue && Array.isArray(initialValue)) {
                    inputEl.value = initialValue;
                }

                controlContainer.appendChild(inputEl);
                break;

            case 'image':
                // INSTANCIA DEL NUEVO COMPONENTE
                inputEl = document.createElement('wc-image');
                inputEl.configure({
                    ...config,
                    value: initialValue || null,
                });

                if (config.maxWidth) {
                    inputEl.style.maxWidth = config.maxWidth;
                    wrapper.style.alignItems = 'center';
                }

                // Gestión de errores interna del componente
                inputEl.addEventListener('error', (e) => {
                    this._setError(wrapper, e.detail.message);
                });

                controlContainer.appendChild(inputEl);
                break;

            case 'select':
            case 'multiselect':
                // 1. Instanciar componente
                inputEl = document.createElement('wc-select');
                inputEl.configure({
                    multiple: config.type === 'multiselect',
                    ...config,
                    options: config.options || [],
                    value: initialValue || null,
                });

                // 5. Añadir al DOM
                controlContainer.appendChild(inputEl);
                break;

            case 'textarea':
                inputEl = document.createElement('wc-textarea');
                inputEl.configure({
                    ...config,
                    value: initialValue || '',
                    rows: config.textareaRows || config.rows || 3,
                    placeholder: config.placeholder || '',
                    maxLength: config.maxLength || null
                });

                if (config.readonly) {
                    inputEl.disabled = true;
                }

                controlContainer.appendChild(inputEl);
                break;

            case 'rich-text':
            case 'richtext':
                inputEl = document.createElement('wc-rich-text');
                inputEl.configure({
                    ...config,
                    name: fieldName,
                    value: initialValue || ''
                });

                if (config.readonly) {
                    inputEl.readonly = true;
                }

                controlContainer.appendChild(inputEl);
                break;

            case 'checkbox':
                inputEl = document.createElement('wc-checkbox');
                inputEl.configure({
                    ...config,
                    name: fieldName,
                    checked: !!initialValue
                });

                const cbWrap = document.createElement('div');
                cbWrap.className = 'checkbox-wrapper';
                cbWrap.appendChild(inputEl);

                if (config.required && !config.readonly) {
                    const reqSpan = document.createElement('span');
                    reqSpan.className = 'req';
                    reqSpan.textContent = '*';
                    cbWrap.appendChild(reqSpan);
                }
                if (config.infoText) {
                    cbWrap.appendChild(this._createInfoIcon(config.infoText));
                }
                controlContainer.appendChild(cbWrap);

                if (config.subLabel) {
                    const subLabelEl = document.createElement('span');
                    subLabelEl.className = 'field-sublabel';
                    subLabelEl.textContent = config.subLabel;
                    controlContainer.appendChild(subLabelEl);
                }
                break;

            case 'radio':
                inputEl = document.createElement('wc-radio-group');
                inputEl.configure({
                    ...config,
                    name: fieldName,
                    options: config.options || [],
                    value: initialValue !== undefined ? initialValue : ''
                });

                controlContainer.appendChild(inputEl);
                break;

            case 'pill-group':
                inputEl = document.createElement('wc-pill-group');
                inputEl.configure({
                    ...config,
                    name: fieldName,
                    options: config.options || [],
                    value: initialValue !== undefined ? initialValue : ''
                });

                controlContainer.appendChild(inputEl);
                break;

            case 'color-group':
                inputEl = document.createElement('wc-color-group');
                inputEl.configure({
                    ...config,
                    name: fieldName,
                    options: config.options || [],
                    value: initialValue !== undefined ? initialValue : ''
                });

                controlContainer.appendChild(inputEl);
                break;

            case 'icon-group':
                inputEl = document.createElement('wc-icon-group');
                inputEl.configure({
                    ...config,
                    name: fieldName,
                    options: config.options || [],
                    value: initialValue !== undefined ? initialValue : ''
                });

                controlContainer.appendChild(inputEl);
                break;

            case 'label':
                inputEl = document.createElement('label');
                inputEl.className = 'static-label';
                inputEl.textContent = initialValue;
                controlContainer.appendChild(inputEl);
                break;

            case 'status':
                inputEl = document.createElement('wc-status');
                inputEl.configure({
                    ...config,
                    text: initialValue || '',
                    status: config.status || 'default',
                    value: initialValue !== undefined ? initialValue : ''
                });

                controlContainer.appendChild(inputEl);
                break;

            case 'file-upload':
                inputEl = document.createElement('wc-file-upload');               

                // Configurar via atributos (WidgetBase no tiene configure())
                if (config.uploadUrl) inputEl.setAttribute('upload-url', config.uploadUrl);
                if (config.uploadContext) inputEl.setAttribute('upload-context', config.uploadContext);
                if (config.variant) inputEl.setAttribute('variant', config.variant);
                if (config.buttonSize) inputEl.setAttribute('button-size', config.buttonSize);
                if (config.showFilesHeader !== undefined) inputEl.setAttribute('show-files-header', config.showFilesHeader ? 'true' : 'false');
                if (config.maxFiles) inputEl.setAttribute('max-files', config.maxFiles);
                if (config.maxSize) inputEl.setAttribute('max-size', config.maxSize);
                if (config.accept !== undefined) inputEl.setAttribute('accept', config.accept);
                if (config.acceptLabel !== undefined) inputEl.setAttribute('accept-label', config.acceptLabel);
                if (config.multiple !== false) inputEl.setAttribute('multiple', '');
                if (config.required) inputEl.setAttribute('required', '');
                if (fieldName) inputEl.setAttribute('name', fieldName);
                if (config.readonly) inputEl.setAttribute('readonly', '');
                if (config.disabled) inputEl.setAttribute('disabled', '');
                if (config.showDownload) inputEl.setAttribute('show-download', '');
                if (config.showPreview) inputEl.setAttribute('show-preview', '');

                controlContainer.appendChild(inputEl);
                break;

            case 'date':
            case 'datetime-local':
            case 'time':
            case 'month':
                inputEl = document.createElement('wc-datepicker');
                inputEl.configure({
                    ...config,
                    name: fieldName,
                    value: initialValue !== undefined ? initialValue : '',
                });

                if (config.readonly) {
                    inputEl.disabled = true;
                }

                controlContainer.appendChild(inputEl);
                break;

            case 'range':
                inputEl = document.createElement('wc-range');
                inputEl.configure({
                    ...config,
                    name: fieldName,
                    value: initialValue !== undefined ? initialValue : (config.min || 0),
                });

                if (config.readonly) {
                    inputEl.disabled = true;
                }

                controlContainer.appendChild(inputEl);
                break;

            default: // Text, password, number, email...
                inputEl = document.createElement('wc-input');
                inputEl.configure({
                    ...config,
                    name: fieldName,
                    type: config.type || 'text',
                    value: initialValue || '',
                });

                // Si tiene readonly, no queremos que tenga validación cruzada extraña
                if (config.readonly) {
                    inputEl.disabled = true;
                }

                controlContainer.appendChild(inputEl);

                break;
        }

        // 4. APLICAR ATRIBUTOS COMUNES
        if (!config.readonly && inputEl) {
            // Limpia el error rojo cuando el usuario interactúa
            inputEl.addEventListener('change', () => this._clearError(wrapper));

            // Textareas e inputs nativos reaccionan mejor al 'input' para limpiar en tiempo real
            if (['text', 'email', 'number', 'password', 'textarea'].includes(config.type)) {
                inputEl.addEventListener('input', () => this._clearError(wrapper));
            }
        }

        // 5. GESTION DE BOTONES DE ACCION (UNIVERSAL)
        if (config.buttons && Array.isArray(config.buttons) && config.buttons.length > 0) {
            const componentToWrap = controlContainer.lastElementChild;

            if (componentToWrap) {
                const group = document.createElement('div');
                group.className = 'input-group';

                // buttonsPosition: 'start' coloca los botones antes del input
                //                  'end'   (default) los coloca despues
                const btns = this._createActionButtons(config.buttons, this._readonly || config.readonly);

                if (config.buttonsPosition === 'start') {
                    btns.classList.add('is-start');
                    group.appendChild(btns);
                    group.appendChild(componentToWrap);
                } else {
                    group.appendChild(componentToWrap);
                    group.appendChild(btns);
                }

                controlContainer.appendChild(group);
            }
        }

        // 6. EVENTOS ONCHANGE
        if (config.onChange) {
            inputEl.addEventListener('change', (e) => {
                const eventDetail = {
                    event: e,
                    name: fieldName,
                    value: (config.type === 'checkbox') ? inputEl.checked : inputEl.value,
                    form: this
                };
                if (typeof config.onChange === 'function') {
                    config.onChange(eventDetail);
                } else if (typeof config.onChange === 'string' && typeof window[config.onChange] === 'function') {
                    window[config.onChange](eventDetail);
                }
            });
        }

        // 7. EVENTO ONCREATED (solo select creatable)
        if (config.onCreated && ['select', 'multiselect'].includes(config.type)) {
            inputEl.addEventListener('option:create', (e) => {
                const eventDetail = {
                    event: e,
                    name: fieldName,
                    value: e.detail.value,
                    label: e.detail.label,
                    form: this
                };
                if (typeof config.onCreated === 'function') {
                    config.onCreated(eventDetail);
                } else if (typeof config.onCreated === 'string' && typeof window[config.onCreated] === 'function') {
                    window[config.onCreated](eventDetail);
                }
            });
        }

        // 7. MENSAJE DE ERROR
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-msg';
        // Accesibilidad: live region para que el lector anuncie el error al aparecer,
        // e id para enlazarlo con el campo via aria-describedby (en _setError)
        errorDiv.id = `df-err-${this._uid}-${config.id}`;
        errorDiv.setAttribute('role', 'alert');
        controlContainer.appendChild(errorDiv);

        this._fieldRefs.push({
            id: config.id,
            name: fieldName,
            type: config.type,
            element: inputEl,
            wrapper: wrapper,
            readonly: !!config.readonly,
            required: !!config.required,
            defaultValue: config.defaultValue
        });
        
        return wrapper;
    }

    /**
    * Crea un contenedor de sección delegando en el componente <content-section>
    * y renderiza sus hijos recursivamente en el Light DOM.
    * @private
    * @param {Object} config - Configuración de la sección.
    * @returns {HTMLElement} El elemento <content-section> instanciado.
    */
    _createSection(config) {
        // 1. Instanciamos el nuevo Web Component
        const section = document.createElement('content-section');
        if (this.callerContext) section.callerContext = this.callerContext; // Para que tenga el mismo contexto de llamada y pueda usar recursos compartidos

        // 3. Le pasamos los atributos de configuración
        if (config.label) section.setAttribute('label', config.label);
        if (config.icon) section.icon = config.icon;
        if (config.badge != null && config.badge !== '') section.badge = config.badge;
        if (config.badgeColor) section.badgeColor = config.badgeColor;
        if (config.borderless) section.setAttribute('borderless', '');
        if (config.collapsable && config.fields.length > 0) section.setAttribute('collapsable', '');
        if (config.collapsed) section.setAttribute('collapsed', '');
        if (config.banner) section.banner = config.banner;
        if (config.headerDivider) section.headerDivider = config.headerDivider;
        if (config.dividerStyle) section.dividerStyle = config.dividerStyle;

        // 4. Creamos los campos hijos y los inyectamos dentro (iran a parar al <slot>)
        if (config.fields && Array.isArray(config.fields)) {
            this._appendWithDividers(section, config.fields);
        }

        return section;
    }

    /**
     * Crea la botonera de accion adherida al input.
     * Usa button-bar en modo "attached" (botones pegados al input con bordes
     * compartidos, igual que el patron input-group clasico). El grupo ocupa como
     * maximo el 40% del input-group (definido en dynamic-form.css); al superarlo,
     * button-bar agrupa los botones sobrantes en el "...".
     * @param {Array}   buttonsConfig - Array de configuracion de botones
     * @param {boolean} [readOnly]    - Si el campo es readonly
     * @returns {HTMLElement}
     */
    _createActionButtons(buttonsConfig, readOnly) {
        const container = document.createElement('div');
        container.className = 'action-btn-group';

        const bar = document.createElement('button-bar');
        if (this.callerContext) bar.callerContext = this.callerContext;
        bar.attached = true;
        bar.buttons = buttonsConfig.map(btn => ({ shape: 'square', variant: readOnly ? 'light' : 'white', ...btn }));
        bar.moreButton = { size: 'md', shape: 'square', variant: readOnly ? 'light' : 'white' };

        container.appendChild(bar);
        return container;
    }

    /**
     * Crea un icono de información con tooltip.
     * @private
     * @param {string} text - Texto del tooltip.
     * @returns {HTMLElement} Elemento span con el icono.
     */
    _createInfoIcon(text) {
        const infoIcon = document.createElement('span');
        infoIcon.className = 'info-icon';
        infoIcon.setAttribute('title', text);
        infoIcon.setAttribute('tabindex', '0');
        infoIcon.innerHTML = this.resources.icons.info;
        return infoIcon;
    }

    /**
     * Recorre todos los campos y dispara manualmente el evento 'change'.
     * Útil para ejecutar lógicas de negocio (onChange) tras renderizar o limpiar.
     */
    _triggerChangeEvents() {
        this._fieldRefs.forEach(ref => {
            // Saltamos readonlies y tipos especiales que no suelen tener lógica de flujo
            if (!ref.readonly && !['hidden', 'image', 'label'].includes(ref.type)) {
                const element = ref.element;

                if (ref.type === 'radio') {
                    // En radios, disparamos desde el primero del grupo
                    if (element.length > 0) {
                        element[0].dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    }
                } else if (element instanceof HTMLElement) {
                    // Inputs normales, selects, checkboxes
                    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                }
            }
        });
    }

    /**
     * Establece el estado visual de error en un campo.
     * @private
     * @param {HTMLElement} wrapper - Contenedor del campo.
     * @param {string} msg - Mensaje de error.
     */
    _setError(wrapper, msg) {
        wrapper.classList.add('has-error');
        const div = wrapper.querySelector('.error-msg');
        if (div) div.textContent = msg;

        // Accesibilidad: marcar el campo invalido y describirlo con el mensaje
        const ref = this._fieldRefs.find(r => r.wrapper === wrapper);
        if (ref && ref.element) {
            ref.element.setAttribute('aria-invalid', 'true');
            if (div && div.id) ref.element.setAttribute('aria-describedby', div.id);
        }
    }

    /**
     * Actualiza el estado de solo lectura (readonly) de los campos del formulario.
     * @private
     */
    _setReadonly() {
        const readonly = this._readonly;
        this._fieldRefs.forEach(ref => {
            if (ref.wrapper.style.display === 'none' || ref.type === 'hidden' || ref.readonly) { return; }

            ref.wrapper.classList.toggle('is-readonly', readonly);

            const attribute = (ref.type === 'radio' || ref.type === 'checkbox') ? 'disabled' : 'readonly';
            ref.element.toggleAttribute(attribute, readonly);
        });
    }

    /**
     * Limpia el estado visual de error de un campo.
     * @private
     * @param {HTMLElement} wrapper - Contenedor del campo.
     */
    _clearError(wrapper) {
        wrapper.classList.remove('has-error');
        const div = wrapper.querySelector('.error-msg');
        if (div) div.textContent = '';

        // Accesibilidad: quitar marca de invalido y la descripcion
        const ref = this._fieldRefs.find(r => r.wrapper === wrapper);
        if (ref && ref.element) {
            ref.element.removeAttribute('aria-invalid');
            ref.element.removeAttribute('aria-describedby');
        }
    }

    /**
     * Aplica la lógica de grupos a los campos del esquema.
     * @private
     * @param {Array} schema - Esquema completo del formulario.
     */
    _applyRowGroups(schema) {
        const groups = {};

        // Recopilamos campos del grupo con sus columnas originales
        schema.forEach(f => {
            if (f.rowGroup && f.visible != false) {
                groups[f.rowGroup] ||= [];
                groups[f.rowGroup].push({
                    id: f.id,
                    columns: f.columns || 12
                });
            }
        });

        if (Object.keys(groups).length === 0) return;

        schema.forEach(field => {
            if (!field.rowGroup || !groups[field.rowGroup] || field.visible === false) return;

            const groupItems = groups[field.rowGroup];

            // Calcular total de columnas en el grupo
            const totalColumns = groupItems.reduce((sum, item) => sum + item.columns, 0);

            // Buscar este campo en el grupo
            const fieldInfo = groupItems.find(item => item.id === field.id);
            if (!fieldInfo) return;

            // Calcular proporción y aplicar sobre 12 columnas
            const proportion = fieldInfo.columns / totalColumns;
            field.columns = Math.max(1, Math.round(proportion * 12));

            // Marcar si es el primero del grupo
            field.newRow = groupItems[0].id === field.id;
        });
    }    

    /**
     * Crea un contenedor de pestañas delegando en el componente <dynamic-tab>
     * y renderiza sus campos hijos recursivamente.
     * @private
     * @param {Object} config - Configuración de las pestañas.
     * @param {Array<Object>} config.tabs - Array de pestañas con sus campos.
     * @param {string} [config.btnVariant] - Variante visual de los botones de pestaña.
     * @param {string} [config.btnShape] - Forma de los botones de pestaña.
     * @param {string} [config.mode='tabs'] - Modo de visualización ('tabs' o 'pills').
     * @returns {HTMLElement} El elemento <dynamic-tab> instanciado.
     */
    _createTabs(config) {
        const tabsEl = document.createElement('dynamic-tab');

        if (config.id) tabsEl.id = config.id;
        if (this.callerContext) tabsEl.callerContext = this.callerContext;
        if (config.btnVariant) tabsEl.btnVariant = config.btnVariant;
        if (config.btnShape) tabsEl.btnShape = config.btnShape;
        tabsEl.mode = config.mode || 'tabs';

        // Preparamos los datos de las pestanas
        const tabsData = config.tabs.map(tab => {
            const fields = tab.content || tab.fields || [];
            // Usamos un contenedor temporal para que _appendWithDividers
            // intercale los <hr> correctamente por fila
            const tempDiv = document.createElement('div');
            this._appendWithDividers(tempDiv, fields);
            return {
                ...tab,
                id: String(tab.id),
                content: Array.from(tempDiv.childNodes)
            };
        });

        // Al asignar esto, DynamicTab ejecutará su _renderPanels una sola vez
        tabsEl.tabs = tabsData;

        return tabsEl;
    }

    /**
     * Crea un componente button-bar a partir de la configuracion.
     * @private
     * @param {Object} config - Configuracion con buttons y opcionalmente moreButton.
     * @returns {HTMLElement}
     */
    _createButtonBar(config) {
        const barEl = document.createElement('button-bar');

        if (config.id) barEl.id = config.id;
        if (this.callerContext) barEl.callerContext = this.callerContext;
        // noCollapse ANTES de buttons: el primer _applyOverflow no debe meter "..."
        if (config.noCollapse) {
            barEl.noCollapse = true;
            barEl.setAttribute('no-collapse', '');
        }
        // wrap ANTES de buttons: el primer _applyOverflow debe respetar el modo wrap
        if (config.wrap) {
            barEl.wrap = true;
            barEl.setAttribute('wrap', '');
        }
        // align, gap y moreButton antes de buttons: el setter de buttons dispara
        //el primer render / overflow y debe hacerlo ya con la config final.
        if (config.align) barEl.align = config.align;
        if (config.gap != null) barEl.gap = config.gap;
        if (config.moreButton) barEl.moreButton = config.moreButton;
        barEl.buttons = Array.isArray(config.buttons) ? config.buttons : [];
        return barEl;
    }

    /**
     * Agrega los nodos de campo al contenedor e inserta un unico <hr> por fila visual.
     * El divisor se coloca despues del ultimo campo de la fila como hijo directo del
     * contenedor (grid), evitando el problema de multiples hr cuando varios campos
     * comparten fila y todos tienen divider:true.
     *
     * Regla de nueva fila:
     *  - El campo tiene config.newRow === true (asignado por _applyRowGroups o explicitamente)
     *  - La suma acumulada de columnas superaria 12
     *  Todos los tipos (section, tabs, button-bar, campos simples) usan su config.columns
     *  real (o 12 si no se especifica); ningun tipo fuerza fila propia de forma especial.
     *
     * Campos con visible:false:
     *  Los campos ocultos no participan en el calculo de filas visibles, pero si
     *  generan <hr> ocultos cuando su configuracion lo requiere (divider o dividedFields).
     *  Esto garantiza que al mostrarse con setFieldVisibility, _refreshDividers encuentre
     *  los elementos <hr> en el DOM y pueda gestionarlos correctamente.
     *
     * @private
     * @param {HTMLElement} container - Contenedor grid (form, section, panel de tab...)
     * @param {Array<Object>} schema - Array de configs ya procesados por _applyRowGroups si aplica
     */
    _appendWithDividers(container, schema) {
        // DocumentFragment: acumula todos los nodos en memoria y hace un unico
        // appendChild al final, evitando un reflow por cada campo insertado.
        const frag = document.createDocumentFragment();
        let rowCols = 0;
        let rowNeedsDivider = false;
        let hiddenDividerPending = false;

        schema.forEach(config => {
            const isVisible = config.visible !== false;
            const cols = config.columns || 12;

            if (isVisible) {
                // Campo visible: calculo normal de fila usando su anchura real (cols)
                const isNewRow = config.newRow || (rowCols > 0 && rowCols + cols > 12);
                if (isNewRow && rowCols > 0) {
                    if (rowNeedsDivider) frag.appendChild(this._createDivider());
                    rowCols = 0;
                    rowNeedsDivider = false;
                }
                rowCols += cols;
                if (config.divider ?? !!this._dividedFields) rowNeedsDivider = true;
                hiddenDividerPending = false;
            } else {
                // Campo oculto: insertar <hr> oculto si el campo oculto anterior lo requeria,
                // y anotar si este campo tambien necesitara divisor para el siguiente.
                if (hiddenDividerPending) {
                    const hr = this._createDivider();
                    hr.style.display = 'none';
                    frag.appendChild(hr);
                }
                hiddenDividerPending = !!(config.divider ?? !!this._dividedFields);
            }

            frag.appendChild(this._createField(config));
        });

        // Ultimo grupo de la fila
        if (rowNeedsDivider) frag.appendChild(this._createDivider());

        container.appendChild(frag);
    }

    /**
    * Crea un divisor horizontal entre campos del formulario.
    * @private
    * @returns {HTMLElement}
    */
    _createDivider() {
        const hr = document.createElement('hr');
        hr.className = 'form-divider';
        return hr;
    }

}

if (!customElements.get('dynamic-form')) customElements.define('dynamic-form', DynamicForm);