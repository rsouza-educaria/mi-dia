class WCSelect extends WCBaseElement {
    // 1. FUNDAMENTAL: Indicamos al navegador que es un elemento de formulario real
    static formAssociated = true;

    /** Píxeles de desplazamiento del ratón a partir de los cuales un clic se considera arrastre. */
    static UMBRAL_ARRASTRE_PX = 3;

    /**
     * Altura mínima utilizable del dropdown (buscador y opción y media). Si el lado
     * elegido no admite ni esta altura se permite el desbordamiento, ya que un
     * desplegable de altura residual no resultaría utilizable.
     */
    static ALTURA_MINIMA_DROPDOWN_PX = 96;

    /**
     * Constructor del componente.
     * Inicializa el estado interno y bindea métodos necesarios.
     */
    constructor() {
        super();

        // 2. Adjuntamos los internals para comunicarnos con el formulario padre
        this._internals = this.attachInternals();

        /**
         * Array de opciones disponibles.
         * @private
         * @type {Array<{value: string, label: string}>}
         */
        this._options = [];

        /** Caché del array aplanado de opciones hoja. Se invalida al cambiar _options. @private */
        this._flatOptionsCache = null;

        /** Timer para el debounce del filtrado por teclado. @private */
        this._filterDebounceTimer = null;

        /**
         * Conjunto de valores seleccionados.
         * @private
         * @type {Set<string>}
         */
        this._selectedValues = new Set();

        /**
         * Estado de apertura del dropdown.
         * @private
         * @type {boolean}
         */
        this._isOpen = false;

        /**
         * Caché de referencias a elementos del DOM.
         * @private
         * @type {Object<string, HTMLElement>}
         */
        this._els = {};

        /**
         * Callback opcional para renderizar el contenido HTML de cada opción en el dropdown.
         * Recibe el objeto opción ({label, value, ...}) y debe devolver un string HTML.
         * @type {Function|null}
         */
        this._renderOption = null;

        /**
         * Callback opcional para renderizar el texto/HTML de la opción seleccionada en el trigger.
         * Recibe el objeto opción ({label, value, ...}) y debe devolver un string HTML.
         * @type {Function|null}
         */
        this._renderSelected = null;

        /**
         * Iconos SVG utilizados en el componente.
         * @readonly
         */
        this.icons = {
            arrow: `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>`,
            close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
            plus:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
        };

        /**
         * Textos e internacionalización
         */
        this.texts = {
            placeholder: typeof Traduccion !== 'undefined' ? Traduccion.SELECCIONAR : 'Seleccionar',
            search: typeof Traduccion !== 'undefined' ? Traduccion.BUSCAR + "..." : 'Buscar...',
            noresults: typeof Traduccion !== 'undefined' ? Traduccion.NO_SE_HAN_ENCONTRADO_RESULTADOS : 'No se han encontrado resultados',
            validationRequired: typeof Traduccion !== 'undefined' ? Traduccion.VALOR_OBLIGATORIO : 'Valor obligatorio'
        };

        // Set de índices de grupos colapsados (índice en this._options)
        this._collapsedGroups = new Set();

        // Accesibilidad: id unico de instancia (para aria-controls / ids de opcion)
        this._uid = (WCSelect._uidCounter = (WCSelect._uidCounter || 0) + 1);

        // Accesibilidad: indice de la opcion resaltada por teclado (aria-activedescendant).
        // -1 = ninguna resaltada (estado tras abrir con raton o filtrar).
        this._activeIndex = -1;

        // Arrastre en curso para leer una etiqueta más larga que el control
        // ({x, scroll, movido}) e indicador para descartar el 'click' que el navegador
        // lanza al soltar. Ver _bindDesplazamientoTexto().
        this._arrastreTexto = null;
        this._ignorarClickTrasArrastre = false;

        // Reposicionamiento del dropdown abierto: identificador del requestAnimationFrame
        // pendiente y ancestros que recortan, cacheados mientras permanece abierto.
        this._reposicionPendiente = null;
        this._ancestrosRecorte = null;

        // Altura máxima solicitada por el consumidor (maxDropdownHeight) o definida en
        // el CSS. Se lee una vez por apertura, antes de aplicar el recorte propio.
        this._techoDropdown = null;

        // Colapso de etiquetas (collapse-tags): observador del ancho del control y ultimo
        // ancho medido. El ancho es lo unico que cambia cuantas etiquetas caben; guardarlo
        // corta la realimentacion, porque colapsar cambia el alto y despierta al observador.
        this._observadorAnchoTags = null;
        this._anchoTagsMedido = null;

        // Bindeo para mantener el contexto 'this' en el listener global
        this._handleDocumentClick = this._handleDocumentClick.bind(this);
        this._handleScrollResize  = this._handleScrollResize.bind(this);
        this._handleKeyNav        = this._handleKeyNav.bind(this);
        this._handleTextDragMove  = this._handleTextDragMove.bind(this);
        this._handleTextDragEnd   = this._handleTextDragEnd.bind(this);
    }

    /**
     * Lista de atributos que el componente observa para cambios.
     * @returns {string[]}
     */
    static get observedAttributes() {
        return ['multiple', 'searchable', 'creatable', 'maxlength', 'placeholder', 'disabled', 'readonly', 'required', 'name', 'value', 'max-dropdown-height', 'hide-clear', 'collapse-tags', 'aria-invalid', 'aria-describedby'];
    }

    /**
     * Callback ejecutado cuando cambia un atributo observado.
     * @param {string} name - Nombre del atributo.
     * @param {string} oldVal - Valor anterior.
     * @param {string} newVal - Nuevo valor.
     */
    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;

        // Si cambian atributos visuales y el componente ya está renderizado, actualizamos la vista completa
        if (['placeholder', 'disabled', 'readonly', 'multiple', 'creatable', 'hide-clear', 'maxlength'].includes(name) && this.querySelector('.wcs-wrapper')) {
            this._renderFull();
        }

        if (name === 'value') {
            this.value = newVal;
        }

        if (name === 'max-dropdown-height' && this._els && this._els.dropdown) {
            this._els.dropdown.style.maxHeight = newVal || '';
        }

        // No cambia el esqueleto del control, solo como se resume la seleccion: no hace
        // falta _renderFull(), basta reapuntar el observador y repintar el display.
        if (name === 'collapse-tags' && this._els && this._els.display) {
            this._sincronizarObservadorTags();
            this._updateDisplay();
        }

        // Accesibilidad: reenviar aria-invalid/aria-describedby al wrapper (que es el combobox focusable)
        if ((name === 'aria-invalid' || name === 'aria-describedby') && this._els && this._els.wrapper) {
            if (newVal === null) this._els.wrapper.removeAttribute(name);
            else this._els.wrapper.setAttribute(name, newVal);
        }
    }

    /**
     * Callback ejecutado cuando el componente se añade al DOM.
     */
    connectedCallback() {
        super.connectedCallback();
        this._renderFull();
        this._syncFormState();
        // Calcular una sola vez si hay ancestro con overflow que recorte el dropdown
        this._fixedDropdown = this._hasClippingAncestor();
    }

    /**
     * Callback ejecutado cuando el componente se elimina del DOM.
     * Importante para limpiar listeners globales y evitar memory leaks.
     */
    disconnectedCallback() {
        document.removeEventListener('click', this._handleDocumentClick);
        document.removeEventListener('mousemove', this._handleTextDragMove);
        document.removeEventListener('mouseup', this._handleTextDragEnd);
        window.removeEventListener('scroll', this._handleScrollResize, true);
        window.removeEventListener('resize', this._handleScrollResize);
        if (this._reposicionPendiente) cancelAnimationFrame(this._reposicionPendiente);
        if (this._observadorAnchoTags) {
            this._observadorAnchoTags.disconnect();
            this._observadorAnchoTags = null;
        }
    }

    // ===========================================
    // API PÚBLICA (Getters y Setters)
    // ===========================================

    /**
     * Obtiene el nombre del campo para formularios.
     * @return {string|null}
     */
    get name() { return this.getAttribute('name'); }

    /**
     * Establece el nombre del campo para formularios. Si se asigna un valor falsy, se elimina el atributo.
     * @param {string|null} val
     */
    set name(val) { val ? this.setAttribute('name', val) : this.removeAttribute('name'); }

    /**
     * Obtiene el valor actual.
     * @returns {string|string[]} Retorna un Array si es 'multiple', o un string si es simple.
     */
    get value() {
        const isMultiple = this.hasAttribute('multiple');
        if (isMultiple) {
            return Array.from(this._selectedValues);
        }
        return this._selectedValues.size > 0 ? this._selectedValues.values().next().value : '';
    }

    /**
    * Obtiene los objetos completos de las opciones seleccionadas, incluyendo todos sus metadatos extra.
    * Mantiene la compatibilidad arquitectónica aislando la lógica de negocio de la lógica del DOM.
    * * @returns {Object|Object[]|null} Retorna un Array de objetos si el atributo es 'multiple', 
    * un objeto único si es selección simple, o null/[] si no hay selección.
    */
    get selectedData() {
        const isMultiple = this.hasAttribute('multiple');
        // Retorno temprano preventivo si no hay nada seleccionado
        if (this._selectedValues.size === 0) {
            return isMultiple ? [] : null;
        }

        // Filtramos el array de opciones original buscando coincidencias O(N)
        // Convertimos opt.value a String de forma segura para la comparación estricta
        const selectedObjects = this._flatOptions().filter(opt =>
            this._selectedValues.has(String(opt.value))
        );

        // Devolvemos la estructura de datos correspondiente según el modo del componente
        return isMultiple ? selectedObjects : selectedObjects[0];
    }

    /**
     * Establece el valor del componente.
     * @param {string|string[]|null} val - Valor único o array de valores. Null limpia la selección.
     */
    set value(val) {
        // creatable: si el valor no existe en opciones, lo agrega como opción nueva
        if (this.hasAttribute('creatable') && val !== null && val !== undefined && val !== '') {
            const strVal = String(Array.isArray(val) ? val[0] : val);
            if (strVal && !this._flatOptions().find(o => String(o.value) === strVal)) {
                this._options.push({ value: strVal, label: strVal });
                this._flatOptionsCache = null;
                this._renderOptions();
            }
        }
        this._selectedValues.clear();
        if (val !== null && val !== undefined && val !== '') {
            const isMultiple = this.hasAttribute('multiple');
            if (isMultiple) {
                const arr = Array.isArray(val) ? val : val.split(",");
                arr.forEach(v => this._selectedValues.add(String(v)));
            } else {
                const v = Array.isArray(val) ? val[0] : val;
                this._selectedValues.add(String(v));
            }
        }
        this._updateDisplay();
        this._updateDropdownSelection();
        this._syncFormState(); // Sincronizamos con el navegador        
    }

    /**
     * Establece las opciones del dropdown.
     * @param {Array<{value: string, label: string}>} data - Array de objetos opción.
     */
    set options(data) {
        this._options = Array.isArray(data) ? data : [];
        this._flatOptionsCache = null;
        this._renderOptions();
    }

    /**
     * Obtiene las opciones actuales.
     * @returns {Array<{value: string, label: string}>}
     */
    get options() { return this._options; }

    /**
     * Asigna un callback para personalizar el renderizado de cada opción en el dropdown.
     * @param {Function|null} fn - Recibe el objeto opción y devuelve un string HTML.
     */
    get renderOption() { return this._renderOption; }
    set renderOption(fn) {
        this._renderOption = typeof fn === 'function' ? fn : null;
        this._renderOptions();
    }

    /**
     * Asigna un callback para personalizar el valor mostrado en el trigger (select cerrado).
     * @param {Function|null} fn - Recibe el objeto opción y devuelve un string HTML.
     */
    get renderSelected() { return this._renderSelected; }
    set renderSelected(fn) {
        this._renderSelected = typeof fn === 'function' ? fn : null;
        this._updateDisplay();
    }

    /**
     * Indica si el select permite selección múltiple.
     * @returns {boolean}
     */
    get multiple() { return this.hasAttribute('multiple'); }

    /**
     * Activa o desactiva el modo de selección múltiple.
     * @param {boolean} val
     */
    set multiple(val) {
        if (val) this.setAttribute('multiple', '');
        else this.removeAttribute('multiple');
    }

    /**
     * Indica si el select tiene buscador.
     * @returns {boolean}
     */
    get searchable() { return this.hasAttribute('searchable'); }

    /**
     * Activa o desactiva el buscador del dropdown.
     * @param {boolean} val
     */
    set searchable(val) {
        if (val) this.setAttribute('searchable', '');
        else this.removeAttribute('searchable');
    }

    /**
     * Indica si el select es un combobox editable que acepta valores libres (texto no presente en las opciones).
     * Cuando está activo, permite escribir texto directamente y lo agrega como nueva opción al confirmar.
     * @returns {boolean}
     */
    get creatable() { return this.hasAttribute('creatable'); }

    /**
     * Activa o desactiva el modo creatable.
     * @param {boolean} val
     */
    set creatable(val) {
        if (val) this.setAttribute('creatable', '');
        else this.removeAttribute('creatable');
    }

    /**
     * Maximo de caracteres del valor libre que se crea en modo creatable.
     * Se aplica como maxlength nativo del input del dropdown, que es el UNICO origen del valor
     * creado (tanto el clic en "+ [texto]" como Enter leen addOption.dataset.addValue, que se
     * rellena desde ese input) -> el navegador impide teclear o pegar de mas y no hace falta
     * validar despues. Solo tiene efecto con creatable: sin el, el valor sale siempre de la
     * lista de opciones y topar el buscador no aportaria nada.
     * @returns {string|null}
     */
    get maxLength() { return this.getAttribute('maxlength'); }

    /**
     * Establece el maximo de caracteres del valor libre. Null/0 lo elimina.
     * @param {number|string} val
     */
    set maxLength(val) {
        if (val) this.setAttribute('maxlength', val);
        else this.removeAttribute('maxlength');
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
     * Indica si el select está deshabilitado.
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
     * Indica si el select es de solo lectura.
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
     * Indica si el select es requerido.
     * @returns {boolean}
     */
    get required() { return this.hasAttribute('required'); }

    /**
     * Activa o desactiva el estado requerido.
     * @param {boolean} val
     */
    set required(val) {
        if (val) this.setAttribute('required', '');
        else this.removeAttribute('required');
        this._syncFormState(); // Si cambia el required dinámicamente, re-evaluamos validez
    }

    /**
     * Obtiene la altura máxima del dropdown.
     * @returns {string|null} Valor CSS (ej: '400px', '60vh') o null si usa el defecto.
     */
    get maxDropdownHeight() { return this.getAttribute('max-dropdown-height'); }

    /**
     * Establece la altura máxima del dropdown. Acepta cualquier valor CSS válido.
     * Si no se especifica, se usará el valor por defecto de 250px definido en CSS.
     * @param {string|null} val - Ej: '400px', '60vh', null para restaurar.
     */
    set maxDropdownHeight(val) {
        if (val) this.setAttribute('max-dropdown-height', val);
        else this.removeAttribute('max-dropdown-height');
    }

    /**
     * Obtiene la anchura máxima del dropdown.
     * @returns {string|null} Valor CSS (ej: '500px', '80vw') o null si usa el defecto (ancho del trigger).
     */

    /**
     * Indica si la "X" de limpiar seleccion (modo single) esta oculta.
     * No afecta a la "X" de cada tag en modo multiple.
     * @returns {boolean}
     */
    get hideClear() { return this.hasAttribute('hide-clear'); }

    /**
     * Oculta o muestra la "X" de limpiar seleccion (modo single).
     * @param {boolean} val
     */
    set hideClear(val) {
        if (val) this.setAttribute('hide-clear', '');
        else this.removeAttribute('hide-clear');
    }

    /**
     * Indica si las etiquetas que no caben en el ancho del control se ocultan tras un
     * contador "+N" (solo modo multiple).
     *
     * ACTIVADO POR DEFECTO: no es un atributo booleano al uso (ahi la ausencia significa
     * "no"), sino un opt-OUT explicito. Solo el valor literal "false" lo desactiva; sin
     * atributo, o con cualquier otro valor, el colapso esta puesto.
     * @returns {boolean}
     */
    get collapseTags() {
        return (this.getAttribute('collapse-tags') || '').toLowerCase() !== 'false';
    }

    /**
     * Activa o desactiva el colapso de etiquetas. Desactivarlo devuelve al comportamiento
     * de flujo libre: las etiquetas caen en varias lineas y el control crece hacia abajo.
     * Activarlo quita el atributo, porque el defecto ya es "activado".
     * @param {boolean} val
     */
    set collapseTags(val) {
        if (val) this.removeAttribute('collapse-tags');
        else this.setAttribute('collapse-tags', 'false');
    }

    // --- MÉTODOS DE VALIDACIÓN NATIVA ---

    /**
     * Verifica la validez del select.
     * @returns {boolean} Retorna true si el select es válido, false si no lo es.
     */
    checkValidity() { return this._internals.checkValidity(); }

    /**
     * Muestra los mensajes de error de validación si el select no es válido.
     * @returns {boolean} Retorna true si el select es válido, false si no lo es.
     */
    reportValidity() { return this._internals.reportValidity(); }

    /**
     * Delega el foco al wrapper interno. El host no tiene tabindex propio
     * (solo .wcs-wrapper lo tiene), asi que focus() sobre el custom element
     * por si solo no mueve el foco.
     * @param {FocusOptions} [options]
     */
    focus(options) {
        if (this._els.wrapper) {
            this._els.wrapper.focus(options);
        } else {
            super.focus(options);
        }
    }

    /**
     * Obtiene el mensaje de validación actual basado en el estado de validez.
     * @returns {string} Mensaje de validación si hay errores, o cadena vacía si es válido.
     */
    get validity() { return this._internals.validity; }

    /**
     * Obtiene el mensaje de validación actual basado en el estado de validez.
     * @returns {string} Mensaje de validación si hay errores, o cadena vacía si es válido.
     */
    get validationMessage() { return this._internals.validationMessage; }

    // ===========================================
    // RENDERIZADO
    // ===========================================

    /**
     * Renderiza la estructura HTML completa del componente.
     * @private
     */
    _renderFull() {
        const placeholder = this.getAttribute('placeholder') || this.texts.placeholder + '...';
        const isDisabled = this.hasAttribute('disabled');
        const isReadonly = this.hasAttribute('readonly');
        const isSearchable = this.hasAttribute('searchable');
        const isMultiple = this.hasAttribute('multiple');
        const isAutoalimentable = this.hasAttribute('creatable');
        // Solo en creatable: es el unico modo en el que lo tecleado se convierte en el valor.
        const maxLen = isAutoalimentable ? this.getAttribute('maxlength') : null;
        const maxLenAttr = maxLen ? ` maxlength="${WCBaseElement.escapeHtml(maxLen)}"` : '';

        // Accesibilidad: ids e textos para ARIA
        const listId = `wcs-list-${this._uid}`;
        const ariaLabel = this.getAttribute('label') || this.getAttribute('aria-label') || '';
        const labelAttr = ariaLabel ? ` aria-label="${WCBaseElement.escapeHtml(ariaLabel)}"` : '';
        const clearLabel = (typeof Traduccion !== 'undefined' && Traduccion.LIMPIAR) ? Traduccion.LIMPIAR : 'Limpiar';

        // Renderizado directo en Light DOM
        this.innerHTML = `
            <div class="wcs-wrapper" tabindex="${isDisabled || isReadonly ? '-1' : '0'}"
                 role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}"${labelAttr}>
                <div class="wcs-display">
                    <span class="wcs-placeholder">${WCBaseElement.escapeHtml(placeholder)}</span>
                </div>
                ${!isMultiple && !isReadonly && !isDisabled && !this.hideClear ? `<div class="wcs-clear" role="button" aria-label="${WCBaseElement.escapeHtml(clearLabel)}" style="display:none">${this.icons.close}</div>` : ''}
                 ${!isReadonly && !isDisabled ? `<div class="wcs-arrow" aria-hidden="true">${this.icons.arrow}</div>` : ''}

                <div class="wcs-dropdown">
                    ${(isSearchable || isAutoalimentable) ? `
                        <div class="wcs-search-box">
                            <input type="text" class="wcs-search-input" placeholder="${this.texts.search}" autocomplete="off"${maxLenAttr}
                                   role="searchbox" aria-label="${WCBaseElement.escapeHtml(this.texts.search)}" aria-controls="${listId}" aria-autocomplete="list">
                        </div>
                    ` : ''}
                    <div class="wcs-list" id="${listId}" role="listbox"${isMultiple ? ' aria-multiselectable="true"' : ''}${labelAttr}></div>
                    <div class="wcs-no-results" style="display:none">${this.texts.noresults}</div>
                    ${isAutoalimentable ? `<div class="wcs-add-option" style="display:none"></div>` : ''}
                </div>
            </div>
        `;

        // Cacheamos elementos para acceso rápido
        this._els = {
            wrapper: this.querySelector('.wcs-wrapper'),
            display: this.querySelector('.wcs-display'),
            dropdown: this.querySelector('.wcs-dropdown'),
            list: this.querySelector('.wcs-list'),
            searchInput: this.querySelector('.wcs-search-input'),
            addOption: this.querySelector('.wcs-add-option'),
            clearBtn: this.querySelector('.wcs-clear'),
            noResults: this.querySelector('.wcs-no-results')
        };

        // Aplicar altura personalizada del dropdown si se ha especificado
        if (this._els.dropdown && this.maxDropdownHeight) {
            this._els.dropdown.style.maxHeight = this.maxDropdownHeight;
        }

        // El wrapper anterior ya no existe: hay que reapuntar el observador antes de que
        // _updateDisplay() haga la primera medida.
        this._sincronizarObservadorTags();

        this._renderOptions();
        this._updateDisplay();

        if (!isDisabled && !isReadonly) {
            this._bindEvents();
        }
    }

    /**
     * Genera la lista de opciones HTML dentro del dropdown.
     * Delega en modo plano o agrupado según la estructura de opciones.
     * @private
     */
    _renderOptions() {
        if (!this._els.list) return;
        this._els.list.innerHTML = '';
        if (this._isGrouped()) {
            this._renderGroupedOptions();
        } else {
            this._renderFlatOptions();
        }
        this._applyOptionAria();
        this._updateDropdownSelection();
    }

    /**
     * Asigna roles e ids ARIA a las opciones y grupos ya renderizados.
     * Se ejecuta tras cada render para que aria-activedescendant pueda referenciar
     * cada opcion por id y los lectores de pantalla anuncien role="option"/"group".
     * @private
     */
    _applyOptionAria() {
        if (!this._els.list) return;

        // Cada opcion hoja: role="option" + id unico + aria-selected (lo refresca _updateDropdownSelection)
        this._els.list.querySelectorAll('.wcs-option').forEach((el, i) => {
            el.id = `wcs-opt-${this._uid}-${i}`;
            el.setAttribute('role', 'option');
            if (!el.hasAttribute('aria-selected')) el.setAttribute('aria-selected', 'false');
        });

        // Grupos y subgrupos: role="group" etiquetado por su cabecera
        this._els.list.querySelectorAll('.wcs-group, .wcs-subgroup').forEach((groupEl, i) => {
            const labelSpan = groupEl.querySelector(':scope > .wcs-group-header .wcs-group-label');
            if (labelSpan) {
                if (!labelSpan.id) labelSpan.id = `wcs-grouplbl-${this._uid}-${i}`;
                groupEl.setAttribute('role', 'group');
                groupEl.setAttribute('aria-labelledby', labelSpan.id);
            }
        });
    }

    /**
     * Devuelve true si alguna opción tiene hijos (modo agrupado).
     * @returns {boolean}
     * @private
     */
    _isGrouped() {
        return this._options.some(o => Array.isArray(o.children) && o.children.length > 0);
    }

    /**
     * Devuelve un array plano con todas las opciones seleccionables (sin cabeceras de grupo).
     * Funciona con hasta 2 niveles de anidamiento (grupo > subgrupo > hoja).
     * Útil para búsquedas de valor, selectedData y creatable.
     * @returns {Array}
     * @private
     */
    _flatOptions() {
        if (this._flatOptionsCache) return this._flatOptionsCache;
        const result = [];
        for (const opt of this._options) {
            if (Array.isArray(opt.children)) {
                for (const child of opt.children) {
                    if (Array.isArray(child.children)) {
                        for (const grandchild of child.children) result.push(grandchild);
                    } else {
                        result.push(child);
                    }
                }
            } else {
                result.push(opt);
            }
        }
        this._flatOptionsCache = result;
        return result;
    }

    /**
     * Devuelve todos los valores hoja (seleccionables) descendientes de una opción.
     * Funciona de forma recursiva para cubrir grupos anidados.
     * @param {Object} opt - Opción raíz desde la que buscar.
     * @returns {string[]}
     * @private
     */
    _getLeafValues(opt) {
        if (!Array.isArray(opt.children) || opt.children.length === 0) {
            return [String(opt.value)];
        }
        const result = [];
        for (const child of opt.children) {
            result.push(...this._getLeafValues(child));
        }
        return result;
    }

    /**
     * Renderiza opciones en modo plano (sin agrupaciones).
     * @private
     */
    _renderFlatOptions() {
        const isMultiple = this.hasAttribute('multiple');

        this._options.forEach(opt => {
            const el = document.createElement('div');
            el.className = 'wcs-option';
            el.dataset.value = opt.value;
            el.dataset.label = opt.label;

            if (opt.aditional) {
                for (const key in opt.aditional) {
                    // Seguridad: nunca permitir handlers inline (onclick, onload...)
                    if (/^on/i.test(key)) continue;
                    el.setAttribute(key, opt.aditional[key]);
                }
            }

            if (isMultiple) {
                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.className = 'wcs-checkbox';
                chk.tabIndex = -1;
                el.appendChild(chk);
                el.appendChild(document.createTextNode(opt.label));
            } else {
                if (this._renderOption) {
                    // _renderOption es API de render custom: debe devolver HTML seguro (responsabilidad del caller)
                    el.innerHTML = this._renderOption(opt);
                } else {
                    el.textContent = opt.label;
                }
            }

            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleOptionClick(opt.value);
            });

            this._els.list.appendChild(el);
        });
    }

    /**
     * Renderiza opciones en modo agrupado con cabeceras colapsables.
     *
     * Estructura de datos esperada:
     *   { label: 'Grupo', children: [{ label: 'Hijo', value: 'v' }, ...] }
     *
     * Las opciones sin 'children' en el nivel raíz se renderizan como opciones normales.
     *
     * Comportamiento:
     *   - Single: la cabecera de grupo NO es seleccionable; solo colapsa/expande.
     *   - Multi:  clic en la cabecera (fuera de la flecha) selecciona/deselecciona todos los hijos.
     *   - La flecha siempre colapsa/expande sin afectar a la selección.
     * @private
     */
    _renderGroupedOptions() {
        const isMultiple = this.hasAttribute('multiple');

        this._options.forEach((opt, idx) => {
            if (Array.isArray(opt.children)) {
                // --- Grupo con hijos ---
                const isCollapsed = this._collapsedGroups.has(idx);

                const group = document.createElement('div');
                group.className = 'wcs-group';
                group.dataset.groupIdx = idx;

                // Cabecera del grupo
                const header = document.createElement('div');
                header.className = 'wcs-group-header';
                header.dataset.groupIdx = idx;

                // Flecha de colapso/expansión
                const toggle = document.createElement('span');
                toggle.className = 'wcs-group-toggle' + (isCollapsed ? ' is-collapsed' : '');
                toggle.innerHTML = this.icons.arrow;
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._toggleGroupCollapse(idx);
                });
                header.appendChild(toggle);

                // En multiselect: checkbox de estado (pointer-events: none; gestionado por JS)
                if (isMultiple) {
                    const chk = document.createElement('input');
                    chk.type = 'checkbox';
                    chk.className = 'wcs-checkbox wcs-group-check';
                    chk.tabIndex = -1;
                    header.appendChild(chk);
                }

                const labelSpan = document.createElement('span');
                labelSpan.className = 'wcs-group-label';
                labelSpan.textContent = opt.label;
                header.appendChild(labelSpan);

                // Clic en cabecera: comportamiento según modo
                if (isMultiple) {
                    // Clic fuera de la flecha → seleccionar/deseleccionar descendientes visibles
                    header.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (toggle.contains(e.target)) return; // ya gestionado por toggle
                        this._handleGroupSelect(opt, group);
                    });
                } else {
                    // Single: toda la cabecera colapsa/expande
                    header.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._toggleGroupCollapse(idx);
                    });
                }

                group.appendChild(header);

                // Cuerpo del grupo (hijos directos o subgrupos)
                const body = document.createElement('div');
                body.className = 'wcs-group-body' + (isCollapsed ? ' is-collapsed' : '');
                body.dataset.groupIdx = idx;

                opt.children.forEach((child, subIdx) => {
                    if (Array.isArray(child.children) && child.children.length > 0) {
                        // --- SUBGRUPO (nivel 2) ---
                        const subKey = `${idx}_${subIdx}`;
                        const isSubCollapsed = this._collapsedGroups.has(subKey);

                        const subGroup = document.createElement('div');
                        subGroup.className = 'wcs-subgroup';
                        subGroup.dataset.subgroupKey = subKey;

                        const subHeader = document.createElement('div');
                        subHeader.className = 'wcs-group-header wcs-subgroup-header';
                        subHeader.dataset.subgroupKey = subKey;

                        const subToggle = document.createElement('span');
                        subToggle.className = 'wcs-group-toggle' + (isSubCollapsed ? ' is-collapsed' : '');
                        subToggle.innerHTML = this.icons.arrow;
                        subToggle.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this._toggleGroupCollapse(subKey);
                        });
                        subHeader.appendChild(subToggle);

                        if (isMultiple) {
                            const chk = document.createElement('input');
                            chk.type = 'checkbox';
                            chk.className = 'wcs-checkbox wcs-group-check';
                            chk.tabIndex = -1;
                            subHeader.appendChild(chk);
                        }

                        const subLabelSpan = document.createElement('span');
                        subLabelSpan.className = 'wcs-group-label';
                        subLabelSpan.textContent = child.label;
                        subHeader.appendChild(subLabelSpan);

                        if (isMultiple) {
                            subHeader.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (subToggle.contains(e.target)) return;
                                this._handleGroupSelect(child, subGroup);
                            });
                        } else {
                            subHeader.addEventListener('click', (e) => {
                                e.stopPropagation();
                                this._toggleGroupCollapse(subKey);
                            });
                        }

                        subGroup.appendChild(subHeader);

                        const subBody = document.createElement('div');
                        subBody.className = 'wcs-group-body' + (isSubCollapsed ? ' is-collapsed' : '');
                        subBody.dataset.subgroupKey = subKey;

                        child.children.forEach(grandchild => {
                            const el = document.createElement('div');
                            el.className = 'wcs-option wcs-option--child wcs-option--grandchild';
                            el.dataset.value = grandchild.value;
                            el.dataset.label = grandchild.label;
                            el.dataset.subgroupKey = subKey;

                            if (grandchild.aditional) {
                                for (const key in grandchild.aditional) {
                                    // Seguridad: nunca permitir handlers inline (onclick, onload...)
                                    if (/^on/i.test(key)) continue;
                                    el.setAttribute(key, grandchild.aditional[key]);
                                }
                            }

                            if (isMultiple) {
                                const chk = document.createElement('input');
                                chk.type = 'checkbox';
                                chk.className = 'wcs-checkbox';
                                chk.tabIndex = -1;
                                el.appendChild(chk);
                                el.appendChild(document.createTextNode(grandchild.label));
                            } else {
                                if (this._renderOption) {
                                    el.innerHTML = this._renderOption(grandchild);
                                } else {
                                    el.textContent = grandchild.label;
                                }
                            }

                            el.addEventListener('click', (e) => {
                                e.stopPropagation();
                                this._handleOptionClick(grandchild.value);
                            });

                            subBody.appendChild(el);
                        });

                        subGroup.appendChild(subBody);
                        body.appendChild(subGroup);

                    } else {
                        // --- HIJO HOJA (nivel 1) ---
                        const el = document.createElement('div');
                        el.className = 'wcs-option wcs-option--child';
                        el.dataset.value = child.value;
                        el.dataset.label = child.label;
                        el.dataset.groupIdx = idx;

                        if (child.aditional) {
                            for (const key in child.aditional) {
                                // Seguridad: nunca permitir handlers inline (onclick, onload...)
                                if (/^on/i.test(key)) continue;
                                el.setAttribute(key, child.aditional[key]);
                            }
                        }

                        if (isMultiple) {
                            const chk = document.createElement('input');
                            chk.type = 'checkbox';
                            chk.className = 'wcs-checkbox';
                            chk.tabIndex = -1;
                            el.appendChild(chk);
                            el.appendChild(document.createTextNode(child.label));
                        } else {
                            if (this._renderOption) {
                                el.innerHTML = this._renderOption(child);
                            } else {
                                el.textContent = child.label;
                            }
                        }

                        el.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this._handleOptionClick(child.value);
                        });

                        body.appendChild(el);
                    }
                });

                group.appendChild(body);
                this._els.list.appendChild(group);

            } else {
                // --- Opción raíz sin grupo (se renderiza como opción normal) ---
                const el = document.createElement('div');
                el.className = 'wcs-option';
                el.dataset.value = opt.value;
                el.dataset.label = opt.label;

                if (opt.aditional) {
                    for (const key in opt.aditional) {
                        // Seguridad: nunca permitir handlers inline (onclick, onload...)
                        if (/^on/i.test(key)) continue;
                        el.setAttribute(key, opt.aditional[key]);
                    }
                }

                if (isMultiple) {
                    const chk = document.createElement('input');
                    chk.type = 'checkbox';
                    chk.className = 'wcs-checkbox';
                    chk.tabIndex = -1;
                    el.appendChild(chk);
                    el.appendChild(document.createTextNode(opt.label));
                } else {
                    if (this._renderOption) {
                        el.innerHTML = this._renderOption(opt);
                    } else {
                        el.textContent = opt.label;
                    }
                }

                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._handleOptionClick(opt.value);
                });

                this._els.list.appendChild(el);
            }
        });
    }

    /**
     * Selecciona o deselecciona los descendientes visibles de un grupo (solo en modo múltiple).
     * Solo afecta a las opciones hoja que son visibles en ese momento (no ocultas por filtro ni colapso).
     * Esto permite usar el select-all de un grupo mientras se filtra para afectar solo al resultado.
     * @param {Object} groupOpt - Objeto de grupo con propiedad children.
     * @param {HTMLElement} containerEl - Elemento DOM del grupo/subgrupo para consultar visibilidad real.
     * @private
     */
    _handleGroupSelect(groupOpt, containerEl) {
        // Si hay búsqueda activa: solo las opciones que coinciden con el filtro,
        // es decir las que no tienen style.display='none' puesto por _filterGroupedOptions.
        // No usamos offsetHeight porque el grupo puede estar colapsado y nos daría 0
        // aunque el ítem coincida con la búsqueda.
        // Sin búsqueda: todos los descendientes hoja (el colapso es solo visual).
        const hasActiveSearch = !!(this._els.searchInput && this._normalize(this._els.searchInput.value));
        const childValues = (containerEl && hasActiveSearch)
            ? [...containerEl.querySelectorAll('.wcs-option')]
                .filter(el => el.style.display !== 'none')
                .map(el => String(el.dataset.value))
            : this._getLeafValues(groupOpt);

        const allSelected = childValues.length > 0 && childValues.every(v => this._selectedValues.has(v));

        if (allSelected) {
            childValues.forEach(v => this._selectedValues.delete(v));
        } else {
            childValues.forEach(v => this._selectedValues.add(v));
        }

        this._updateDisplay();
        this._updateDropdownSelection();
        this._syncFormState();
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    /**
     * Colapsa o expande un grupo (nivel 1) o subgrupo (nivel 2).
     * @param {number|string} key - Índice numérico para grupos raíz, o string "gIdx_sIdx" para subgrupos.
     * @private
     */
    _toggleGroupCollapse(key) {
        if (this._collapsedGroups.has(key)) {
            this._collapsedGroups.delete(key);
        } else {
            this._collapsedGroups.add(key);
        }
        const isNowCollapsed = this._collapsedGroups.has(key);

        // Los subgrupos usan data-subgroup-key; los grupos raíz usan data-group-idx
        const isSubgroup = String(key).includes('_');
        const body   = isSubgroup
            ? this._els.list.querySelector(`.wcs-group-body[data-subgroup-key="${key}"]`)
            : this._els.list.querySelector(`.wcs-group-body[data-group-idx="${key}"]`);
        const header = isSubgroup
            ? this._els.list.querySelector(`.wcs-group-header[data-subgroup-key="${key}"]`)
            : this._els.list.querySelector(`.wcs-group-header[data-group-idx="${key}"]`);

        if (body) body.classList.toggle('is-collapsed', isNowCollapsed);
        if (header) {
            const arrow = header.querySelector('.wcs-group-toggle');
            if (arrow) arrow.classList.toggle('is-collapsed', isNowCollapsed);
        }
    }

    /**
     * Actualiza el área de visualización (tags o texto).
     * @private
     */
    _updateDisplay() {
        if (!this._els.display) return;

        // Cambia el contenido: se vuelve al estado recortado y sin desplazamiento
        this._desactivarDesplazamientoTexto();

        const display = this._els.display;
        display.innerHTML = '';
        const values = Array.from(this._selectedValues);
        const isMultiple = this.hasAttribute('multiple');

        const esc = WCBaseElement.escapeHtml;
        if (values.length === 0) {
            const ph = this.getAttribute('placeholder') || this.texts.placeholder;
            display.innerHTML = `<span class="wcs-placeholder">${esc(ph)}</span>`;
            if (this._els.clearBtn) {
                this._els.clearBtn.style.display = 'none';
                this._els.clearBtn.classList.remove('is-visible');
            }
            this._reposicionarDropdownSiAbierto();
            return;
        }

        if (isMultiple) {
            const flatOpts = this._flatOptions();
            values.forEach(val => {
                const opt = flatOpts.find(o => String(o.value) === String(val));
                if (opt) {
                    const tag = document.createElement('span');
                    tag.className = 'wcs-tag';
                    tag.innerHTML = `
                        <span class="wcs-tag-text">${esc(opt.label)}</span>
                        <span class="wcs-tag-remove" data-val="${esc(val)}">${this.icons.close}</span>
                    `;
                    if (!this.hasAttribute('disabled') && !this.hasAttribute('readonly')) {
                        tag.querySelector('.wcs-tag-remove').addEventListener('click', (e) => {
                            e.stopPropagation();
                            this._handleOptionClick(val);
                        });
                    }
                    display.appendChild(tag);
                }
            });
            this._colapsarTagsSobrantes();
        } else {
            const val = values[0];
            const opt = this._flatOptions().find(o => String(o.value) === String(val));
            if (opt) {
                // _renderSelected es API de render custom: debe devolver HTML seguro (responsabilidad del caller)
                const inner = this._renderSelected ? this._renderSelected(opt) : esc(opt.label);
                display.innerHTML = `<span class="wcs-text">${inner}</span>`;
                if (this._els.clearBtn && !this.hasAttribute('required')) {
                    this._els.clearBtn.classList.add('is-visible');
                    this._els.clearBtn.style.display = 'none';
                }
            }
        }

        this._reposicionarDropdownSiAbierto();
    }

    /**
     * Recoloca el desplegable abierto despues de cambiar el contenido del display.
     *
     * Hace falta porque `_posicionarDropdown()` solo se dispara al abrir y desde
     * `_handleScrollResize` (scroll y resize DE VENTANA), y (de)seleccionar una opcion no
     * pasa por ninguno de los dos: cambia el numero de etiquetas y, con ellas, el alto del
     * control. En modo `fixed` eso deja las coordenadas calculadas con el alto viejo; en
     * modo `absolute` la posicion la mantiene el CSS, pero quedan obsoletos el recorte de
     * `max-height` al hueco disponible y la decision de volteo (`.flip-up`).
     *
     * Se aplaza un frame para medir con el alto ya aplicado por el navegador, y reutiliza
     * `_reposicionPendiente` (cancelado en `_closeDropdown` y en `disconnectedCallback`),
     * que ademas colapsa varios cambios seguidos en un solo recalculo.
     * @private
     */
    _reposicionarDropdownSiAbierto() {
        if (!this._isOpen || this._reposicionPendiente) return;

        this._reposicionPendiente = requestAnimationFrame(() => {
            this._reposicionPendiente = null;
            if (this._isOpen) this._posicionarDropdown();
        });
    }

    /**
     * Oculta las etiquetas que no caben en la primera linea del control y las resume en un
     * contador "+N" al final. Solo actua en modo multiple y con el atributo `collapse-tags`;
     * sin el, las etiquetas siguen fluyendo en varias lineas y el control crece hacia abajo.
     *
     * Se mide por posicion vertical (que etiquetas comparten linea con la primera) en vez de
     * forzar `flex-wrap: nowrap` sobre el display: `.wcs-tag` no lleva `flex-shrink: 0`, asi
     * que en `nowrap` las etiquetas se comprimirian entre si en lugar de desbordar y no
     * habria desbordamiento que medir.
     * @private
     */
    _colapsarTagsSobrantes() {
        const display = this._els.display;
        if (!display) return;

        const tags = Array.from(display.querySelectorAll('.wcs-tag:not(.wcs-tag--more)'));
        let contador = display.querySelector('.wcs-tag--more');

        if (!this.collapseTags || !this.hasAttribute('multiple') || !tags.length) {
            if (contador) contador.remove();
            return;
        }

        // Estado limpio antes de medir: por la via del observador de ancho las etiquetas no
        // se regeneran, y arrastrariamos el colapso calculado para el ancho anterior.
        tags.forEach(tag => { tag.style.display = ''; });

        if (!contador) {
            contador = document.createElement('span');
            contador.className = 'wcs-tag wcs-tag--more';
            // La seleccion real ya la expone el listbox del desplegable (role="option" +
            // aria-selected en cada opcion). Este contador es un resumen visual, no una
            // segunda fuente que el lector de pantalla deba anunciar.
            contador.setAttribute('aria-hidden', 'true');
        }
        contador.style.display = 'none';   // oculto mientras se mide: no debe ocupar sitio
        display.appendChild(contador);     // siempre el ultimo, aunque ya existiera

        // Borde inferior de la primera linea: una etiqueta que haya envuelto empieza por
        // debajo de el. Se compara contra el borde y no contra el `offsetTop` exacto porque
        // `align-items: center` centra cada etiqueta en su linea, y dos alturas distintas no
        // comparten `offsetTop` aun estando en la misma.
        const limite = tags[0].offsetTop + tags[0].offsetHeight;

        // Control aun sin maquetar (dentro de un contenedor oculto): todo mide 0 y cualquier
        // reparto seria falso. Se deja como esta; al hacerse visible, el observador de ancho
        // dispara el calculo bueno.
        if (!limite) return;

        const caben = tags.filter(tag => tag.offsetTop < limite).length;

        if (caben === tags.length) {
            contador.remove();
            return;
        }

        // El contador ocupa sitio y puede empujar a la ultima etiqueta visible, asi que se
        // comprueba y se retira una mas hasta que quepa todo. Siempre queda al menos una: si
        // esa sola no cabe, `.wcs-tag-text` ya la recorta con puntos suspensivos.
        let visibles = Math.max(1, caben);
        const pintar = () => {
            tags.forEach((tag, i) => { tag.style.display = i < visibles ? '' : 'none'; });
            const ocultas = tags.slice(visibles);
            contador.textContent = '+' + ocultas.length;
            contador.title = ocultas.map(tag => {
                const texto = tag.querySelector('.wcs-tag-text');
                return (texto ? texto.textContent : tag.textContent).trim();
            }).join(', ');
            contador.style.display = '';
        };

        pintar();
        while (visibles > 1 && contador.offsetTop >= limite) {
            visibles--;
            pintar();
        }
    }

    /**
     * Conecta o desconecta el observador de ancho segun `collapse-tags`. Hace falta uno
     * propio: el `resize` de ventana que el componente ya escucha no cubre los cambios de
     * ancho del CONTENEDOR (un panel lateral redimensionable, una columna en %), que son
     * justo los que cambian cuantas etiquetas caben.
     *
     * Se observa el wrapper y se compara contra el ultimo ancho medido porque colapsar
     * cambia el alto del control: sin esa guarda cada colapso despertaria al observador,
     * que volveria a colapsar.
     * @private
     */
    _sincronizarObservadorTags() {
        if (this._observadorAnchoTags) {
            this._observadorAnchoTags.disconnect();
            this._observadorAnchoTags = null;
        }

        const wrapper = this._els.wrapper;
        if (!wrapper || !this.collapseTags || !this.hasAttribute('multiple')) return;
        if (typeof ResizeObserver === 'undefined') return;

        this._anchoTagsMedido = wrapper.clientWidth;
        this._observadorAnchoTags = new ResizeObserver(() => {
            const ancho = wrapper.clientWidth;
            if (ancho === this._anchoTagsMedido) return;
            this._anchoTagsMedido = ancho;
            this._colapsarTagsSobrantes();
        });
        this._observadorAnchoTags.observe(wrapper);
    }

    /**
     * Marca visualmente las opciones seleccionadas en el dropdown.
     * En modo agrupado + múltiple, también actualiza el estado del checkbox
     * de cada cabecera de grupo (vacío / parcial / completo).
     * @private
     */
    _updateDropdownSelection() {
        if (!this._els.list) return;
        const isMultiple = this.hasAttribute('multiple');

        // Actualizar opciones hoja (seleccionables)
        this._els.list.querySelectorAll('.wcs-option').forEach(opt => {
            const val = String(opt.dataset.value);
            const isSelected = this._selectedValues.has(val);
            opt.classList.toggle('selected', isSelected);
            opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            if (isMultiple) {
                const chk = opt.querySelector('input.wcs-checkbox');
                if (chk) chk.checked = isSelected;
            }
        });

        // Actualizar cabeceras de grupo y subgrupo (solo en múltiple)
        if (this._isGrouped() && isMultiple) {
            // Grupos raíz (nivel 1): cuentan TODOS los descendientes hoja
            this._els.list.querySelectorAll('.wcs-group').forEach(groupEl => {
                const idx = parseInt(groupEl.dataset.groupIdx);
                const opt = this._options[idx];
                if (!opt || !Array.isArray(opt.children)) return;

                const leafValues    = this._getLeafValues(opt);
                const selectedCount = leafValues.filter(v => this._selectedValues.has(v)).length;
                const allSelected   = leafValues.length > 0 && selectedCount === leafValues.length;
                const someSelected  = selectedCount > 0 && !allSelected;

                // Solo la cabecera directa del grupo (no cabeceras de subgrupos dentro)
                const header = groupEl.querySelector(':scope > .wcs-group-header');
                if (header) {
                    header.classList.toggle('is-all-selected', allSelected);
                    header.classList.toggle('is-partial',      someSelected);
                    const chk = header.querySelector('.wcs-group-check');
                    if (chk) { chk.checked = allSelected; chk.indeterminate = someSelected; }
                }
            });

            // Subgrupos (nivel 2): cuentan sus propios hijos hoja
            this._els.list.querySelectorAll('.wcs-subgroup').forEach(subEl => {
                const subKey   = subEl.dataset.subgroupKey;
                const [gIdx, sIdx] = subKey.split('_').map(Number);
                const subOpt   = this._options[gIdx]?.children?.[sIdx];
                if (!subOpt || !Array.isArray(subOpt.children)) return;

                const leafValues    = this._getLeafValues(subOpt);
                const selectedCount = leafValues.filter(v => this._selectedValues.has(v)).length;
                const allSelected   = leafValues.length > 0 && selectedCount === leafValues.length;
                const someSelected  = selectedCount > 0 && !allSelected;

                const header = subEl.querySelector(':scope > .wcs-group-header');
                if (header) {
                    header.classList.toggle('is-all-selected', allSelected);
                    header.classList.toggle('is-partial',      someSelected);
                    const chk = header.querySelector('.wcs-group-check');
                    if (chk) { chk.checked = allSelected; chk.indeterminate = someSelected; }
                }
            });
        }
    }

    // ===========================================
    // LÓGICA DE EVENTOS Y FORMULARIOS
    // ===========================================

    /**
     * Sincroniza el valor y la validez con los internals del formulario nativo
     * @private
     */
    _syncFormState() {
        if (!this._els || !this._els.wrapper) return;

        // 1. Sincronizar Valor (SetFormValue)
        if (this.multiple) {
            // El estándar FACE pide que los select múltiples usen FormData para registrar sus N valores
            const fd = new FormData();
            this._selectedValues.forEach(v => fd.append(this.name || 'select', v));
            this._internals.setFormValue(fd);
        } else {
            const val = this._selectedValues.size > 0 ? this._selectedValues.values().next().value : null;
            this._internals.setFormValue(val);
        }

        // 2. Sincronizar Validez (SetValidity)
        if (this.required && this._selectedValues.size === 0) {
            // Le indicamos al navegador que este campo es requerido y está vacío
            this._internals.setValidity({ valueMissing: true }, this.texts.validationRequired, this._els.wrapper);
        } else {
            // Limpiamos los errores si todo está bien
            this._internals.setValidity({});
        }
    }

    /**
     * Gestiona el clic en una opción individual.
     * @param {string} val - Valor de la opción.
     * @private
     */
    _handleOptionClick(val) {
        val = String(val);
        const isMultiple = this.hasAttribute('multiple');

        if (isMultiple) {
            if (this._selectedValues.has(val)) this._selectedValues.delete(val);
            else this._selectedValues.add(val);
            // Mantener foco en buscador si existe
            if (this._els.searchInput) this._els.searchInput.focus();
        } else {
            this._selectedValues.clear();
            this._selectedValues.add(val);
            this._closeDropdown();
        }

        this._updateDisplay();
        this._updateDropdownSelection();
        this._syncFormState(); // Mantenemos el navegador informado del cambio
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    /**
     * Normaliza un string para búsquedas: minúsculas y sin tildes/diacríticos.
     * Permite buscar "pais" y encontrar "País".
     * @param {string} str
     * @returns {string}
     * @private
     */
    _normalize(str) {
        return String(str).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    /**
     * Filtra las opciones del dropdown según el término de búsqueda.
     * Delega en modo plano o agrupado según la estructura de opciones.
     * @param {string} term - Término ya normalizado (sin tildes, minúsculas).
     * @private
     */
    _filterOptions(term) {
        if (this._isGrouped()) {
            this._filterGroupedOptions(term);
        } else {
            this._filterFlatOptions(term);
        }
    }

    /**
     * Filtra opciones en modo plano.
     * @param {string} term - Término normalizado.
     * @private
     */
    _filterFlatOptions(term) {
        let hasResults = false;
        this._els.list.querySelectorAll('.wcs-option').forEach(opt => {
            const label = this._normalize(opt.dataset.label || '');
            const show  = label.includes(term);
            opt.style.display = show ? '' : 'none';
            if (show) hasResults = true;
        });
        if (this._els.noResults) this._els.noResults.style.display = hasResults ? 'none' : 'block';
    }

    /**
     * Filtra opciones en modo agrupado (hasta 2 niveles: grupo > subgrupo > hoja):
     * - Si el padre/subpadre coincide → muestra el grupo/subgrupo entero con todos sus descendientes.
     * - Si un hijo/nieto coincide → muestra la cadena de cabeceras hasta él.
     * - Con búsqueda activa → expande temporalmente los grupos con coincidencias.
     * - Al borrar la búsqueda → restaura el estado de colapso guardado.
     * @param {string} term - Término normalizado.
     * @private
     */
    _filterGroupedOptions(term) {
        let hasAnyResults = false;

        this._els.list.querySelectorAll('.wcs-group').forEach(groupEl => {
            const idx  = parseInt(groupEl.dataset.groupIdx);
            const opt  = this._options[idx];
            const body = groupEl.querySelector(':scope > .wcs-group-body');
            if (!opt || !body) return;

            const parentMatches = this._normalize(opt.label).includes(term);
            let visibleCount = 0;

            // --- Hijos hoja directos (nivel 1) ---
            body.querySelectorAll(':scope > .wcs-option').forEach(childEl => {
                const childLabel = this._normalize(childEl.dataset.label || '');
                const show = parentMatches || childLabel.includes(term);
                childEl.style.display = show ? '' : 'none';
                if (show) visibleCount++;
            });

            // --- Subgrupos (nivel 2) ---
            body.querySelectorAll(':scope > .wcs-subgroup').forEach(subEl => {
                const subKey = subEl.dataset.subgroupKey;
                const [gIdx, sIdx] = subKey.split('_').map(Number);
                const subOpt = this._options[gIdx]?.children?.[sIdx];
                if (!subOpt) return;

                const subParentMatches = parentMatches || this._normalize(subOpt.label).includes(term);
                let subVisibleCount = 0;

                const subBody = subEl.querySelector(':scope > .wcs-group-body');
                if (subBody) {
                    subBody.querySelectorAll('.wcs-option').forEach(leafEl => {
                        const leafLabel = this._normalize(leafEl.dataset.label || '');
                        const show = subParentMatches || leafLabel.includes(term);
                        leafEl.style.display = show ? '' : 'none';
                        if (show) subVisibleCount++;
                    });
                }

                const showSub = subParentMatches || subVisibleCount > 0;
                subEl.style.display = showSub ? '' : 'none';
                if (showSub) visibleCount++;

                // Colapso del subgrupo
                const isSubCollapsed = this._collapsedGroups.has(subKey);
                const subArrow = subEl.querySelector('.wcs-group-toggle');
                if (subBody) {
                    if (term) {
                        if (showSub) {
                            subBody.classList.remove('is-collapsed');
                            if (subArrow) subArrow.classList.remove('is-collapsed');
                        }
                    } else {
                        subBody.classList.toggle('is-collapsed', isSubCollapsed);
                        if (subArrow) subArrow.classList.toggle('is-collapsed', isSubCollapsed);
                    }
                }
            });

            const showGroup = parentMatches || visibleCount > 0;
            groupEl.style.display = showGroup ? '' : 'none';
            if (showGroup) hasAnyResults = true;

            // Colapso del grupo raíz
            const isCollapsed = this._collapsedGroups.has(idx);
            const arrow = groupEl.querySelector(':scope > .wcs-group-header .wcs-group-toggle');
            if (term) {
                if (showGroup) {
                    body.classList.remove('is-collapsed');
                    if (arrow) arrow.classList.remove('is-collapsed');
                }
            } else {
                body.classList.toggle('is-collapsed', isCollapsed);
                if (arrow) arrow.classList.toggle('is-collapsed', isCollapsed);
            }
        });

        // Opciones raíz sin grupo
        this._els.list.querySelectorAll('.wcs-option:not(.wcs-option--child)').forEach(opt => {
            const label = this._normalize(opt.dataset.label || '');
            const show  = label.includes(term);
            opt.style.display = show ? '' : 'none';
            if (show) hasAnyResults = true;
        });

        if (this._els.noResults) this._els.noResults.style.display = hasAnyResults ? 'none' : 'block';
    }

    /**
     * Vincula todos los eventos del DOM (click, input, focusout).
     * @private
     */
    _bindEvents() {
        // Evento Click en el Wrapper (Toggle)
        this._els.wrapper.addEventListener('click', (e) => {
            // Ignorar el clic con el que termina un arrastre para leer el texto recortado
            if (this._ignorarClickTrasArrastre) {
                this._ignorarClickTrasArrastre = false;
                return;
            }

            // Ignorar clic si es en botón limpiar
            if (this._els.clearBtn && this._els.clearBtn.contains(e.target)) return;

            // Ignorar clic si es dentro del dropdown (scrollbar, buscador)
            if (this._els.dropdown && this._els.dropdown.contains(e.target)) return;

            if (this._isOpen) this._closeDropdown();
            else this._openDropdown();
        });

        // Navegacion por teclado. El handler vive en el wrapper; los eventos del
        // buscador (que esta dentro del wrapper) burbujean hasta aqui, asi que un
        // unico listener cubre ambos casos (searchable y no searchable).
        this._els.wrapper.addEventListener('keydown', this._handleKeyNav);

        // Desplazamiento horizontal de la etiqueta seleccionada cuando no cabe en el control
        this._bindDesplazamientoTexto();

        // Evento Botón Limpiar
        if (this._els.clearBtn) {
            this._els.clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.value = null;
                this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            });
        }

        // Evento Buscador (Filtrado)
        if (this._els.searchInput) {
            this._els.searchInput.addEventListener('input', (e) => {
                const term        = this._normalize(e.target.value);
                const termTrimmed = e.target.value.trim();

                // Al cambiar el filtro, la opcion resaltada deja de ser valida
                this._clearActive();

                // Debounce: evita reflows en cada keystroke en listas grandes
                clearTimeout(this._filterDebounceTimer);
                this._filterDebounceTimer = setTimeout(() => {
                    this._filterOptions(term);

                    // creatable: mostrar "+ [texto]" si no hay coincidencia exacta
                    if (this.hasAttribute('creatable') && this._els.addOption) {
                        const exactMatch = termTrimmed && this._flatOptions().find(o => this._normalize(o.label) === this._normalize(termTrimmed));
                        if (termTrimmed && !exactMatch) {
                            this._els.addOption.innerHTML = `<span class="wcs-add-icon">${this.icons.plus}</span>${WCBaseElement.escapeHtml(termTrimmed)}`;
                            this._els.addOption.dataset.addValue = termTrimmed;
                            this._els.addOption.style.display = '';
                        } else {
                            this._els.addOption.style.display = 'none';
                        }
                    }
                }, 200);
            });

            // El dropdown se oculta con display:none, lo que fuerza al input a perder
            // el foco y dispara un 'change' nativo que burbujea hacia wc-select.
            // Esto causaría que cualquier listener externo de 'change' se ejecute dos
            // veces (una por este 'change' interno, otra por el dispatch explícito en
            // _handleOptionClick). Cortamos la propagación aquí para que el 'change'
            // interno del buscador nunca salga del componente.
            this._els.searchInput.addEventListener('change', (e) => e.stopPropagation());

            // El teclado (Enter, flechas, Escape...) lo gestiona _handleKeyNav en el
            // wrapper: los eventos del buscador burbujean hasta el. Asi evitamos un
            // doble manejo y centralizamos la navegacion.
        }

        // creatable: click en "+ [texto]" agrega y selecciona la nueva opción
        if (this.hasAttribute('creatable') && this._els.addOption) {
            this._els.addOption.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = this._els.addOption.dataset.addValue;
                if (!val) return;
                if (!this._options.find(o => o.label.toLowerCase() === val.toLowerCase())) {
                    this._options.push({ value: val, label: val });
                    this._flatOptionsCache = null;
                    this._renderOptions();
                }
                this._selectedValues.clear();
                this._selectedValues.add(val);
                this._updateDisplay();
                this._updateDropdownSelection();
                this._syncFormState();
                // Evento específico para opción creada (se dispara ANTES del change)
                this.dispatchEvent(new CustomEvent('option:create', {
                    bubbles: true,
                    composed: true,
                    detail: { value: val, label: val }
                }));
                this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                this._closeDropdown();
            });
        }

        /**
         * FIX SCROLLBAR: Usamos 'focusout' en lugar de 'blur'.
         * 'focusout' nos dice hacia dónde va el foco (e.relatedTarget).
         * Si hacemos clic en el scroll, relatedTarget es null, por lo que NO cerramos.
         */

        if (!this._hostEventsBound) {
            this.addEventListener('focusout', (e) => {
                if (e.relatedTarget && !this.contains(e.relatedTarget)) {
                    this._closeDropdown();
                }
            });
            this._hostEventsBound = true;
        }
    }

    /**
     * Permite leer una etiqueta más larga que el control sin que este cambie de ancho:
     * el texto se muestra recortado con puntos suspensivos y solo se vuelve desplazable
     * mientras el usuario lo arrastra con el ratón o usa la rueda horizontal
     * (shift + rueda). Ambos estados son excluyentes: en cuanto el contenedor es
     * desplazable el navegador deja de mostrar los puntos suspensivos. Solo aplica en
     * modo simple; en modo múltiple las etiquetas ya fluyen en varias líneas.
     * @private
     */
    _bindDesplazamientoTexto() {
        const display = this._els.display;
        if (!display || this.hasAttribute('multiple')) return;

        // Rueda horizontal (trackpad) o shift + rueda vertical
        display.addEventListener('wheel', (e) => {
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
            if (!delta || !this._activarDesplazamientoTexto()) return;
            e.preventDefault();
            display.scrollLeft += delta;
        }, { passive: false });

        display.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (this._els.clearBtn && this._els.clearBtn.contains(e.target)) return;
            if (!this._activarDesplazamientoTexto()) return;

            this._arrastreTexto = { x: e.clientX, scroll: display.scrollLeft, movido: false };
            document.addEventListener('mousemove', this._handleTextDragMove);
            document.addEventListener('mouseup', this._handleTextDragEnd);
        });

        // Al salir el ratón del control, volver al estado recortado
        this._els.wrapper.addEventListener('mouseleave', () => {
            if (this._arrastreTexto) return;
            this._desactivarDesplazamientoTexto();
        });
    }

    /**
     * Deja el texto a su ancho natural, sin puntos suspensivos, para poder desplazarlo.
     * @returns {boolean} true si el texto desborda y por tanto hay algo que desplazar.
     * @private
     */
    _activarDesplazamientoTexto() {
        const display = this._els.display;
        const texto   = display ? display.querySelector('.wcs-text') : null;
        if (!texto) return false;

        display.classList.add('is-scrolling');
        if (texto.offsetWidth <= display.clientWidth) {
            // Cabe íntegro: no hay nada que desplazar, se restablece el recorte
            display.classList.remove('is-scrolling');
            return false;
        }
        return true;
    }

    /**
     * Vuelve al estado recortado, con puntos suspensivos y sin desplazamiento.
     * @private
     */
    _desactivarDesplazamientoTexto() {
        const display = this._els.display;
        if (!display) return;
        display.classList.remove('is-scrolling', 'is-dragging');
        display.scrollLeft = 0;
    }

    /**
     * Arrastre en curso: desplaza el texto siguiendo al ratón.
     * @param {MouseEvent} e
     * @private
     */
    _handleTextDragMove(e) {
        if (!this._arrastreTexto) return;

        const dx = e.clientX - this._arrastreTexto.x;
        if (!this._arrastreTexto.movido && Math.abs(dx) < WCSelect.UMBRAL_ARRASTRE_PX) return;

        this._arrastreTexto.movido = true;
        this._els.display.classList.add('is-dragging');
        this._els.display.scrollLeft = this._arrastreTexto.scroll - dx;
    }

    /**
     * Fin del arrastre. Si hubo movimiento se mantiene el texto desplazado, porque el
     * usuario está leyendo el final, y se descarta el 'click' que el navegador lanza al
     * soltar para no abrir el desplegable.
     * @private
     */
    _handleTextDragEnd() {
        document.removeEventListener('mousemove', this._handleTextDragMove);
        document.removeEventListener('mouseup', this._handleTextDragEnd);

        const movido = !!(this._arrastreTexto && this._arrastreTexto.movido);
        this._arrastreTexto = null;

        if (this._els.display) this._els.display.classList.remove('is-dragging');
        if (movido) this._ignorarClickTrasArrastre = true;
        else this._desactivarDesplazamientoTexto();
    }

    /**
     * Detecta si hay algún ancestro con overflow hidden o clip que recortaría el dropdown.
     * En ese caso, el dropdown debe usar position:fixed para salir del contexto de recorte.
     * @returns {boolean}
     * @private
     */
    _hasClippingAncestor() {
        return this._buscarAncestrosDeRecorte(['hidden', 'clip']).length > 0;
    }

    /**
     * Devuelve los ancestros cuyo overflow recorta al componente. Con
     * ['hidden','clip'] se determina si el dropdown necesita position:fixed; añadiendo
     * ['auto','scroll'] se obtiene el área visible real del control, necesaria para
     * saber si sigue a la vista durante el scroll.
     * @param {string[]} tipos Valores de overflow que cuentan como recorte.
     * @returns {HTMLElement[]}
     * @private
     */
    _buscarAncestrosDeRecorte(tipos) {
        const res = [];
        let el = this.parentElement;
        while (el && el !== document.body) {
            const { overflow, overflowX, overflowY } = getComputedStyle(el);
            if ([overflow, overflowX, overflowY].some(v => tipos.includes(v))) {
                res.push(el);
            }
            el = el.parentElement;
        }
        return res;
    }

    /**
     * Comprueba si el control sigue a la vista: dentro del viewport y sin haber
     * salido del área de ningún ancestro que recorte o desplace. Es el criterio con
     * el que se cierra el dropdown durante el scroll (equivalente al middleware
     * `hide` de Floating UI); basta con que quede parcialmente visible.
     * @returns {boolean}
     * @private
     */
    _triggerALaVista() {
        if (!this._els.wrapper) return false;

        const rect  = this._els.wrapper.getBoundingClientRect();
        const cruza = (r) => rect.bottom > r.top && rect.top < r.bottom
                          && rect.right > r.left && rect.left < r.right;

        if (!cruza({ top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth })) return false;

        const ancestros = this._ancestrosRecorte || [];
        return ancestros.every(el => cruza(el.getBoundingClientRect()));
    }

    /**
     * Área en la que el dropdown puede mostrarse íntegro. En modo fixed es el
     * viewport, porque el dropdown escapa de cualquier recorte; en modo absolute hay
     * que descontar además los ancestros desplazables, que sí lo recortan.
     * @returns {{top: number, left: number, bottom: number, right: number}}
     * @private
     */
    _areaDisponible() {
        let area = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
        if (this._fixedDropdown) return area;

        (this._ancestrosRecorte || []).forEach(el => {
            const r = el.getBoundingClientRect();
            area = {
                top:    Math.max(area.top, r.top),
                left:   Math.max(area.left, r.left),
                bottom: Math.min(area.bottom, r.bottom),
                right:  Math.min(area.right, r.right)
            };
        });
        return area;
    }

    /**
     * Coloca el dropdown respecto al control: decide si se despliega hacia abajo
     * (por defecto) o hacia arriba (clase .flip-up) según el hueco disponible, y
     * limita su altura a ese hueco para que quede íntegro dentro del área visible
     * (equivalente al middleware `size` de Floating UI). Se invoca al abrir y en cada
     * scroll o resize, de modo que el dropdown acompaña al control en lugar de cerrarse.
     * @private
     */
    _posicionarDropdown() {
        const dropdown = this._els.dropdown;
        if (!dropdown || !this._els.wrapper) return;

        const MARGEN = 4;
        const rect   = this._els.wrapper.getBoundingClientRect();
        const area   = this._areaDisponible();

        // Límite solicitado por el consumidor (maxDropdownHeight) o definido en el CSS.
        // Se lee una sola vez por apertura, antes de aplicar el recorte propio.
        if (this._techoDropdown === null) {
            const techo = parseFloat(getComputedStyle(dropdown).maxHeight);
            this._techoDropdown = Number.isFinite(techo) ? techo : Infinity;
        }

        // Altura que requeriría el contenido, independiente del recorte ya aplicado: con
        // offsetHeight la decisión de volteo oscilaría entre reposicionamientos.
        const alto = Math.min(this._techoDropdown, dropdown.scrollHeight);

        // Solo se voltea si no cabe abajo, arriba hay más hueco y arriba cabe al menos la
        // altura mínima: hacerlo en un hueco menor dejaría la cabecera del desplegable
        // (buscador y primeras opciones) fuera del área visible.
        const huecoAbajo  = area.bottom - rect.bottom - MARGEN;
        const huecoArriba = rect.top - area.top - MARGEN;
        const voltear     = alto > huecoAbajo
                         && huecoArriba > huecoAbajo
                         && huecoArriba >= WCSelect.ALTURA_MINIMA_DROPDOWN_PX;

        dropdown.classList.toggle('flip-up', voltear);

        // Recorte al hueco del lado elegido, acotado por la altura mínima, por el límite
        // solicitado y por el área completa. El dropdown ya es desplazable (overflow-y: auto).
        const hueco    = voltear ? huecoArriba : huecoAbajo;
        const altoArea = area.bottom - area.top - 2 * MARGEN;
        const limite   = Math.min(
            Math.max(WCSelect.ALTURA_MINIMA_DROPDOWN_PX, Math.min(this._techoDropdown, hueco)),
            altoArea
        );
        dropdown.style.maxHeight = `${Math.round(limite)}px`;

        // En modo absolute el desplazamiento vertical lo resuelve el CSS mediante la
        // clase .flip-up; solo el modo fixed necesita coordenadas explícitas.
        if (!this._fixedDropdown) return;

        dropdown.style.position = 'fixed';
        dropdown.style.right    = 'auto';
        dropdown.style.width    = `${rect.width}px`;
        dropdown.style.zIndex   = '10000';

        // Objetivo en coordenadas de viewport. El desbordamiento, si se produce, se dirige
        // siempre hacia abajo: por arriba quedarían fuera el buscador y las primeras
        // opciones, y un position:fixed no puede traerse a la vista mediante scroll.
        const topVolteado = rect.top - MARGEN - limite;
        // Anclaje inferior cuando cabe íntegro arriba: mantiene el dropdown junto al
        // control aunque cambie la altura del contenido, por ejemplo al filtrar.
        const anclarAbajo = voltear && topVolteado >= area.top;

        const objetivoBottom = rect.top - MARGEN;
        const objetivoTop    = Math.min(
            Math.max(voltear ? topVolteado : rect.bottom + MARGEN, area.top),
            Math.max(area.top, area.bottom - limite)
        );

        dropdown.style.left = `${Math.round(rect.left)}px`;
        if (anclarAbajo) {
            dropdown.style.top    = 'auto';
            dropdown.style.bottom = `${Math.round(window.innerHeight - objetivoBottom)}px`;
        } else {
            dropdown.style.bottom = 'auto';
            dropdown.style.top    = `${Math.round(objetivoTop)}px`;
        }

        // Corrección del bloque contenedor: si algún ancestro tiene transform, filter o
        // will-change, un position:fixed se posiciona respecto a ese ancestro y no
        // respecto al viewport, caso de los paneles y modales animados, por lo que las
        // coordenadas de viewport escritas arriba quedan desplazadas. Se mide la posición
        // resultante y se compensa la desviación. No es acumulativo: cada llamada
        // reescribe el valor base antes de medir.
        const real    = dropdown.getBoundingClientRect();
        const desvioX = real.left - rect.left;
        const desvioY = anclarAbajo ? real.bottom - objetivoBottom : real.top - objetivoTop;

        if (Math.abs(desvioX) > 0.5) {
            dropdown.style.left = `${Math.round(rect.left - desvioX)}px`;
        }
        if (Math.abs(desvioY) > 0.5) {
            if (anclarAbajo) {
                dropdown.style.bottom = `${Math.round(window.innerHeight - objetivoBottom + desvioY)}px`;
            } else {
                dropdown.style.top = `${Math.round(objetivoTop - desvioY)}px`;
            }
        }
    }

    /**
     * Abre el dropdown, lo posiciona y activa los listeners globales.
     * @private
     */
    _openDropdown() {
        if (this._isOpen) return;
        this._isOpen = true;

        // Al abrir, el control vuelve al estado recortado
        this._desactivarDesplazamientoTexto();
        this._els.dropdown.classList.add('open');
        this._els.wrapper.setAttribute('aria-expanded', 'true');

        // Ancestros que limitan el área visible del control: se calculan una vez por
        // apertura y permiten detectar cuándo el control deja de estar a la vista.
        this._ancestrosRecorte = this._buscarAncestrosDeRecorte(['hidden', 'clip', 'auto', 'scroll']);

        // Coloca el dropdown (position:fixed si hay algún ancestro que recorte) y
        // determina si se abre hacia abajo o hacia arriba.
        this._posicionarDropdown();

        // Ya con el max-height definitivo, decidir por donde se muestra la lista.
        this._mostrarSeleccionAlAbrir();

        if (this._els.searchInput) {
            requestAnimationFrame(() => this._els.searchInput.focus());
        }

        // PREVENCIÓN DE MEMORY LEAKS: Eliminamos por seguridad antes de añadir
        document.removeEventListener('click', this._handleDocumentClick);
        // setTimeout 0 para evitar que el mismo clic que abre, sea detectado por el listener global.
        // Guard isConnected: si el componente se elimina en este mismo tick, el listener
        // se añadiría DESPUÉS de disconnectedCallback y quedaría huérfano.
        setTimeout(() => {
            if (this.isConnected) document.addEventListener('click', this._handleDocumentClick);
        }, 0);

        window.addEventListener('scroll', this._handleScrollResize, true);
        window.addEventListener('resize', this._handleScrollResize);
    }

    /**
     * Al abrir, deja a la vista la primera opcion seleccionada (como react-select o
     * Select2); si no hay ninguna, o si ya se ve sin desplazar, la lista queda al principio.
     *
     * Hace falta hacerlo explicitamente porque `.wcs-dropdown` es el contenedor desplazable
     * y NO se recrea entre aperturas: el buscador filtra alternando `display` sobre las
     * opciones existentes, sin reconstruir la lista. Sin esto, al reabrir conserva el scroll
     * de la vez anterior.
     *
     * Se calcula el `scrollTop` a mano en vez de usar `scrollIntoView()`, que desplazaria
     * tambien a los ancestros desplazables (la pagina, el panel lateral) y moveria el
     * control justo despues de haber posicionado el desplegable sobre el.
     * @private
     */
    _mostrarSeleccionAlAbrir() {
        const dropdown = this._els.dropdown;
        if (!dropdown) return;

        dropdown.scrollTop = 0;   // punto de partida conocido para las medidas de abajo
        if (!this._els.list) return;

        // Una opcion dentro de un grupo colapsado no se ve (display:none la deja sin
        // offsetParent) y desplazarse hasta ella no significaria nada.
        const seleccionadas = this._els.list.querySelectorAll('.wcs-option.selected');
        const primera = Array.from(seleccionadas).find(el => el.offsetParent !== null);
        if (!primera) return;

        // El buscador es sticky pegado al borde superior: si no se descuenta su alto,
        // tapa justo la opcion a la que nos acabamos de desplazar.
        const caja  = this._els.searchInput ? this._els.searchInput.closest('.wcs-search-box') : null;
        const techo = caja ? caja.offsetHeight : 0;

        // Diferencia de rects y no offsetTop: no depende de cual sea el offsetParent de la
        // opcion (grupos y subgrupos anidados). Con scrollTop ya a 0, esta es su posicion
        // dentro del area visible.
        const posicion = primera.getBoundingClientRect().top
                       - dropdown.getBoundingClientRect().top
                       - techo;

        // Solo se desplaza si no cabe entera en el hueco visible; si ya se ve, se respeta
        // el principio de la lista.
        if (posicion + primera.offsetHeight > dropdown.clientHeight - techo) {
            dropdown.scrollTop = posicion;
        }
    }

    /**
     * Cierra el dropdown y limpia el estado.
     * @private
     */
    _closeDropdown() {
        if (!this._isOpen) return;
        this._isOpen = false;
        this._els.dropdown.classList.remove('open');
        this._els.wrapper.setAttribute('aria-expanded', 'false');
        this._clearActive();

        // Restablecer position:fixed y el volteo si se habían aplicado
        this._els.dropdown.classList.remove('flip-up');
        this._els.dropdown.style.position = '';
        this._els.dropdown.style.top      = '';
        this._els.dropdown.style.bottom   = '';
        this._els.dropdown.style.left     = '';
        this._els.dropdown.style.right    = '';
        this._els.dropdown.style.width    = '';
        this._els.dropdown.style.zIndex   = '';

        // Devolver el max-height al valor del consumidor, o al del CSS si no se ha fijado
        this._els.dropdown.style.maxHeight = this.maxDropdownHeight || '';

        this._ancestrosRecorte = null;
        this._techoDropdown    = null;
        if (this._reposicionPendiente) {
            cancelAnimationFrame(this._reposicionPendiente);
            this._reposicionPendiente = null;
        }

        if (this._els.searchInput) {
            this._els.searchInput.value = '';
            this._els.searchInput.dispatchEvent(new Event('input'));
        }

        // creatable: ocultar opción de agregar al cerrar
        if (this._els.addOption) this._els.addOption.style.display = 'none';

        document.removeEventListener('click', this._handleDocumentClick);
        window.removeEventListener('scroll', this._handleScrollResize, true);
        window.removeEventListener('resize', this._handleScrollResize);
    }

    /**
     * Maneja clics en cualquier parte del documento para cerrar si es clic fuera.
     * @param {Event} e
     * @private
     */
    _handleDocumentClick(e) {
        if (!this._isOpen) return;
        if (!this.contains(e.target)) {
            this._closeDropdown();
        }
    }

    /**
     * Recoloca el dropdown abierto cuando el usuario hace scroll o redimensiona la
     * ventana, en lugar de cerrarlo, que es el criterio de react-select, Select2,
     * Bootstrap y las librerías basadas en Floating UI. Solo se cierra si el control ha
     * salido de la vista. Se ignora el scroll producido dentro del propio dropdown.
     * @param {Event} e
     * @private
     */
    _handleScrollResize(e) {
        if (!this._isOpen) return;

        // El scroll de la propia lista no mueve el control: no hay nada que recolocar. El
        // target de un evento scroll puede ser window o document, en el scroll de página,
        // y Node.contains() lanza excepción si no recibe un Node en lugar de devolver false.
        const destino = e.target;
        if (e.type === 'scroll' && destino instanceof Node
            && this._els.dropdown && this._els.dropdown.contains(destino)) return;

        // Un solo recálculo por frame: un gesto de scroll dispara decenas de eventos
        if (this._reposicionPendiente) return;
        this._reposicionPendiente = requestAnimationFrame(() => {
            this._reposicionPendiente = null;
            if (!this._isOpen) return;

            // Si el control ha salido de la vista, el dropdown quedaría sin ancla
            if (!this._triggerALaVista()) {
                this._closeDropdown();
                return;
            }

            this._posicionarDropdown();
        });
    }

    // ===========================================
    // ACCESIBILIDAD: NAVEGACION POR TECLADO
    // ===========================================

    /**
     * Gestiona la navegacion por teclado del combobox.
     * Vive en el wrapper; los eventos del buscador burbujean hasta aqui.
     * - Cerrado: ArrowDown/ArrowUp/Enter (y Espacio si no hay buscador) abren el dropdown.
     * - Abierto: flechas mueven el resaltado, Enter selecciona, Escape cierra,
     *   Home/End van al primero/ultimo, Tab cierra al salir.
     * @param {KeyboardEvent} e
     * @private
     */
    _handleKeyNav(e) {
        const key = e.key;
        const hasSearch = !!this._els.searchInput;

        // --- Dropdown cerrado: abrir con teclas de apertura ---
        if (!this._isOpen) {
            if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || (key === ' ' && !hasSearch)) {
                e.preventDefault();
                this._openDropdown();
                // Resaltar la primera opcion una vez renderizada/visible
                requestAnimationFrame(() => this._setActive(0));
            }
            return;
        }

        // --- Dropdown abierto ---
        switch (key) {
            case 'ArrowDown':
                e.preventDefault();
                this._moveActive(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this._moveActive(-1);
                break;
            case 'Home':
                e.preventDefault();
                this._setActive(0);
                break;
            case 'End':
                e.preventDefault();
                this._setActive(this._visibleOptions().length - 1);
                break;
            case 'Enter': {
                e.preventDefault();
                e.stopPropagation();
                const vis = this._visibleOptions();
                // Si hay opcion resaltada, esa; si no, la primera visible (compatibilidad con el buscador)
                const target = (this._activeIndex >= 0 ? vis[this._activeIndex] : vis[0]);
                if (target) {
                    this._handleOptionClick(target.dataset.value);
                } else if (this.hasAttribute('creatable') && this._els.addOption && this._els.addOption.style.display !== 'none') {
                    // No hay opciones y hay boton "+ [texto]" visible -> crear la nueva
                    this._els.addOption.click();
                }
                break;
            }
            case ' ':
                // Sin buscador, Espacio (de)selecciona la opcion resaltada (util en multiple)
                if (!hasSearch) {
                    e.preventDefault();
                    const target = this._visibleOptions()[this._activeIndex];
                    if (target) this._handleOptionClick(target.dataset.value);
                }
                break;
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                this._closeDropdown();
                this._els.wrapper.focus();
                break;
            case 'Tab':
                // Cerrar al tabular fuera (sin prevenir el Tab para no romper el orden de foco)
                this._closeDropdown();
                break;
        }
    }

    /**
     * Devuelve las opciones realmente visibles (no ocultas por filtro ni por grupo colapsado).
     * @returns {HTMLElement[]}
     * @private
     */
    _visibleOptions() {
        if (!this._els.list) return [];
        return [...this._els.list.querySelectorAll('.wcs-option')].filter(o => o.offsetHeight > 0);
    }

    /**
     * Mueve el resaltado delta posiciones (con wrap circular) entre las opciones visibles.
     * @param {number} delta - +1 abajo, -1 arriba.
     * @private
     */
    _moveActive(delta) {
        const vis = this._visibleOptions();
        if (!vis.length) return;
        let idx = this._activeIndex + delta;
        if (idx < 0) idx = vis.length - 1;
        if (idx >= vis.length) idx = 0;
        this._setActive(idx);
    }

    /**
     * Resalta la opcion visible en la posicion dada y actualiza aria-activedescendant.
     * @param {number} index - Indice dentro de la lista de opciones visibles.
     * @private
     */
    _setActive(index) {
        const vis = this._visibleOptions();
        if (!vis.length) { this._clearActive(); return; }

        index = Math.max(0, Math.min(index, vis.length - 1));

        // Limpiar resaltado anterior
        this._els.list.querySelectorAll('.wcs-option--active').forEach(o => o.classList.remove('wcs-option--active'));

        const el = vis[index];
        el.classList.add('wcs-option--active');
        this._activeIndex = index;

        // aria-activedescendant en el control con foco (buscador si existe, si no el wrapper)
        const host = this._els.searchInput || this._els.wrapper;
        if (host && el.id) host.setAttribute('aria-activedescendant', el.id);

        el.scrollIntoView({ block: 'nearest' });
    }

    /**
     * Elimina el resaltado de teclado y limpia aria-activedescendant.
     * @private
     */
    _clearActive() {
        this._activeIndex = -1;
        if (this._els.list) {
            this._els.list.querySelectorAll('.wcs-option--active').forEach(o => o.classList.remove('wcs-option--active'));
        }
        if (this._els.searchInput) this._els.searchInput.removeAttribute('aria-activedescendant');
        if (this._els.wrapper) this._els.wrapper.removeAttribute('aria-activedescendant');
    }
}

// Registro del Custom Element
if (!customElements.get('wc-select')) customElements.define('wc-select', WCSelect);