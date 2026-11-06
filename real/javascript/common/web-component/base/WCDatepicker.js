/**
 * Selector de fecha / hora con calendario propio.
 * Soporta 'date', 'datetime-local', 'time' y 'month' con el mismo formato de value
 * que produce el input nativo (YYYY-MM-DD, YYYY-MM-DDTHH:mm, HH:mm, YYYY-MM).
 *
 * El <input type="..."> nativo sigue en el DOM (oculto) y es el UNICO responsable de
 * required/min/max y de exponer validity/validationMessage. El calendario y el campo
 * de texto visible solo escriben en el valor y delegan la validacion en el nativo.
 *
 * @fires input  - Cada vez que cambia el valor (tecleando o desde el calendario).
 * @fires change - Al confirmar un valor (seleccion, blur o Enter en el campo).
 */
class WCDatepicker extends WCBaseElement {
    static formAssociated = true;
    static _seq = 0;
    // Dias de la semana admitidos en disabled-dates / enabled-dates (valor de getDay())
    static _WEEKDAYS = new Map([['sun', 0], ['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6]]);

    constructor() {
        super();
        this._internals = this.attachInternals();
        this._els = {};
        this._uid = `wcd-${++WCDatepicker._seq}`;

        this.icons = {
            calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
            clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
            prev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>`,
            next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
            prevYear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>`,
            nextYear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>`,
            close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
        };

        // Dias marcados (fecha -> etiqueta) y reglas de bloqueo / habilitacion. Se mantienen
        // sincronizados con los atributos marked-dates / disabled-dates / enabled-dates
        this._marked = new Map();
        this._disabled = this._normalizeRules(null);
        this._enabled = this._normalizeRules(null);

        // Estado interno
        this._isOpen = false;
        this._act = null;               // dia (o mes) activo del grid: { y, m (0-11), d }
        this._view = null;              // vista del calendario: null (la base) | 'days' | 'months' | 'years'
        this._lastChangeValue = '';     // ultimo valor confirmado (para emitir 'change' solo si cambia)
        this._textDirty = false;        // el usuario ha editado el campo de texto sin confirmar
        this._skipTextSync = false;     // evita reescribir el texto mientras se teclea
        this._suppressOpen = false;     // el foco programatico no abre el panel
        this._reflecting = false;       // evita reentrada al reflejar propiedades en atributos
        this._hasPopoverApi = false;
        this._mql = null;
        this._focusOutTimer = null;
        this._fmt = null;

        // Handlers que se registran en document/window: referencia fija para poder quitarlos
        this._onDocPointerDown = this._onDocPointerDown.bind(this);
        this._onScrollResize = this._onScrollResize.bind(this);
        this._onMediaChange = this._onMediaChange.bind(this);
    }

    static get observedAttributes() {
        return ['type', 'disabled', 'readonly', 'value', 'required', 'id', 'name', 'min', 'max', 'marked-dates', 'disabled-dates', 'enabled-dates', 'inline', 'hide-today', 'hide-clear', 'aria-invalid', 'aria-describedby', 'aria-label'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;

        // Los dias marcados/deshabilitados/habilitados se leen aunque el componente aun no este renderizado
        if (name === 'marked-dates' || name === 'disabled-dates' || name === 'enabled-dates') {
            if (this._reflecting) return;
            this._readDatesAttr(name);
            this._refreshPanel();
            return;
        }

        if (!this._els.input) return;
        if (name === 'id' && newVal === null) return;

        // type e inline cambian la estructura: se reconstruye la parte visual
        if (name === 'type' || name === 'inline') {
            this._rebuild();
            return;
        }
        this._syncAttributesToNative();
    }

    connectedCallback() {
        super.connectedCallback();
        this._watchMedia();
        if (!this._els.input) {
            this._render();
        }
    }

    disconnectedCallback() {
        // Al desconectar el navegador saca el panel del top layer: se cierra el estado
        // interno y se quitan los listeners globales (tambien en un simple "move")
        this._closePanel();
        this._removeGlobalListeners();
        if (this._mql) this._mql.removeEventListener('change', this._onMediaChange);
        clearTimeout(this._focusOutTimer);
    }

    // =========================================================================
    // API PUBLICA ESTANDAR
    // =========================================================================

    // Soportamos 'date', 'datetime-local', 'time', 'month'
    get type() { return this.getAttribute('type') || 'date'; }
    set type(val) { this.setAttribute('type', val); }

    get value() { return this.getAttribute('value') || ''; }
    set value(val) {
        val = (val === null || val === undefined) ? '' : String(val);
        this.setAttribute('value', val);
        if (this._els.input && this._els.input.value !== val) {
            this._els.input.value = val;
        }
        this._internals.setFormValue(val);
        this._updateValidity();
        // Un cambio programatico no es un cambio del usuario: no debe emitir 'change' despues
        this._lastChangeValue = val;
        this._syncText();
        this._syncTimeInput();
        this._refreshPanel();
    }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(val) { val ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    get readonly() { return this.hasAttribute('readonly'); }
    set readonly(val) { val ? this.setAttribute('readonly', '') : this.removeAttribute('readonly'); }

    get name() { return this.getAttribute('name'); }
    set name(val) { val ? this.setAttribute('name', val) : this.removeAttribute('name'); }

    get required() { return this.hasAttribute('required'); }
    set required(val) { val ? this.setAttribute('required', '') : this.removeAttribute('required'); }

    get min() { return this.getAttribute('min'); }
    set min(val) { val ? this.setAttribute('min', val) : this.removeAttribute('min'); }

    get max() { return this.getAttribute('max'); }
    set max(val) { val ? this.setAttribute('max', val) : this.removeAttribute('max'); }

    /**
     * Dias marcados: objeto { 'YYYY-MM-DD': 'Etiqueta' } (en type="month": 'YYYY-MM').
     * Admite tambien un string JSON. Se refleja en el atributo marked-dates.
     */
    get markedDates() { return Object.fromEntries(this._marked); }
    set markedDates(val) {
        this._marked = this._normalizeMarked(val);
        this._reflectDates('marked-dates', this._marked.size ? JSON.stringify(Object.fromEntries(this._marked)) : null);
        this._refreshPanel();
    }

    /**
     * Reglas de dias NO seleccionables. Array que mezcla entradas de tres tipos:
     *  - un dia: '2026-08-30'  (en type="month": '2026-08')
     *  - un dia de la semana: 'mon' 'tue' 'wed' 'thu' 'fri' 'sat' 'sun'
     *  - un rango inclusive: { from: '2021-01-01', to: '2022-05-01' } (from o to opcionales)
     * Admite tambien un string JSON. Se refleja en el atributo disabled-dates.
     */
    get disabledDates() { return JSON.parse(JSON.stringify(this._disabled.entries)); }
    set disabledDates(val) {
        this._disabled = this._normalizeRules(val);
        this._reflectDates('disabled-dates', this._disabled.entries.length ? JSON.stringify(this._disabled.entries) : null);
        this._refreshPanel();
    }

    /**
     * Reglas de dias SELECCIONABLES, con la misma sintaxis que disabledDates. Si hay alguna,
     * todo lo que no coincida queda deshabilitado. Se combina con disabledDates (deshabilitar
     * gana sobre habilitar) y con min/max. Un array vacio equivale a no tener restriccion.
     * Se refleja en el atributo enabled-dates.
     */
    get enabledDates() { return JSON.parse(JSON.stringify(this._enabled.entries)); }
    set enabledDates(val) {
        this._enabled = this._normalizeRules(val);
        this._reflectDates('enabled-dates', this._enabled.entries.length ? JSON.stringify(this._enabled.entries) : null);
        this._refreshPanel();
    }

    /**
     * Modo empotrado: el calendario (o el selector de hora) se muestra siempre visible
     * en el flujo de la pagina, sin campo de texto ni desplegable. Por defecto false.
     */
    get inline() { return this.hasAttribute('inline'); }
    set inline(val) { val ? this.setAttribute('inline', '') : this.removeAttribute('inline'); }

    /** Oculta el boton "Hoy" del pie del calendario. Por defecto false. */
    get hideToday() { return this.hasAttribute('hide-today'); }
    set hideToday(val) { val ? this.setAttribute('hide-today', '') : this.removeAttribute('hide-today'); }

    /** Oculta el boton "Limpiar" del pie del calendario. Por defecto false. */
    get hideClear() { return this.hasAttribute('hide-clear'); }
    set hideClear(val) { val ? this.setAttribute('hide-clear', '') : this.removeAttribute('hide-clear'); }

    /**
     * Delega el foco en el elemento realmente focusable: el campo de texto visible o,
     * en modo inline, el dia activo del calendario (o el selector de hora). El host no
     * tiene tabindex propio, asi que focus() sobre el custom element no mueve el foco.
     * @param {FocusOptions} [options]
     */
    focus(options) {
        if (!this._els.input) {
            super.focus(options);
            return;
        }
        if (this._els.text) {
            // El foco programatico (goToElement, trap de modal...) no debe abrir el panel
            this._suppressOpen = true;
            this._els.text.focus(options);
            this._suppressOpen = false;
        } else {
            this._focusActiveCell();
        }
    }

    // =========================================================================
    // LOGICA INTERNA
    // =========================================================================

    /**
     * Modo efectivo (un type desconocido cae a 'date').
     * @returns {string}
     */
    _mode() {
        const t = this.type;
        return (t === 'date' || t === 'datetime-local' || t === 'time' || t === 'month') ? t : 'date';
    }

    /**
     * Renderiza el componente, creando la estructura interna y sincronizando atributos.
     * @param {string} [prevId] - id del campo anterior (al reconstruir tras cambiar type/inline).
     */
    _render(prevId = '') {
        const esc = WCBaseElement.escapeHtml;
        const T = Traduccion;
        const mode = this._mode();
        const inline = this.inline;
        const panelId = `${this._uid}-panel`;
        const isTime = mode === 'time';
        const hasCal = !isTime;
        const hasTime = mode === 'datetime-local';
        // type="time" no tiene calendario: el panel son dos columnas (horas y minutos)
        const panelLabel = isTime ? T.HORA : T.CALENDARIO;
        const toggleLabel = isTime ? T.HORA : T.ABRIR_CALENDARIO;

        const textHtml = inline ? '' : `
            <input type="text" class="wcd-text" autocomplete="off" spellcheck="false" inputmode="numeric"
                   role="combobox" aria-haspopup="dialog" aria-expanded="false" aria-controls="${panelId}"
                   placeholder="${esc(this._placeholder(mode))}">
            <span class="wcd-toggle" role="button" tabindex="-1" aria-label="${esc(toggleLabel)}">${isTime ? this.icons.clock : this.icons.calendar}</span>`;

        const navBtn = (act, label, icon) => `<button type="button" class="wcd-nav-btn" data-act="${act}" aria-label="${esc(label)}">${icon}</button>`;
        // Los cuatro botones existen siempre; _refreshNav() oculta los de mes y cambia el
        // icono de los de ano segun la vista (dias / meses / anos). El titulo cambia de vista.
        const navHtml = !hasCal ? '' : `
            <div class="wcd-nav">
                ${navBtn('prev-year', T.ANIO_ANTERIOR, '')}
                ${navBtn('prev-month', T.MES_ANTERIOR, this.icons.prev)}
                <button type="button" class="wcd-nav-title" data-act="switch-view" id="${panelId}-title" aria-live="polite"></button>
                ${navBtn('next-month', T.MES_SIGUIENTE, this.icons.next)}
                ${navBtn('next-year', T.ANIO_SIGUIENTE, '')}
            </div>
            <div class="wcd-grid-host"></div>`;

        const timeHtml = !hasTime ? '' : `
            <div class="wcd-time-row">
                <label class="wcd-time-label" for="${panelId}-time">${esc(T.HORA)}</label>
                <input type="time" class="wcd-time" id="${panelId}-time">
            </div>`;

        // Columnas de hora (00-23) y minuto (00-59): una opcion = un boton. Se crean una sola vez
        // y _refreshTimeCols() solo cambia su estado (asi no se pierden el scroll ni el foco)
        const pad2 = (n) => String(n).padStart(2, '0');
        const opts = (col, n) => Array.from({ length: n }, (_, i) =>
            `<button type="button" class="wcd-opt" role="option" tabindex="-1" aria-selected="false" data-tcol="${col}" data-tval="${pad2(i)}">${pad2(i)}</button>`).join('');
        const colsHtml = !isTime ? '' : `
            <div class="wcd-cols">
                <div class="wcd-col-wrap">
                    <div class="wcd-col-title">${esc(T.HORA)}</div>
                    <div class="wcd-col" role="listbox" aria-label="${esc(T.HORA)}" data-tcol="h">${opts('h', 24)}</div>
                </div>
                <div class="wcd-col-wrap">
                    <div class="wcd-col-title">${esc(T.MINUTOS)}</div>
                    <div class="wcd-col" role="listbox" aria-label="${esc(T.MINUTOS)}" data-tcol="m">${opts('m', 60)}</div>
                </div>
            </div>`;

        const todayBtn = hasCal ? `<button type="button" class="wcd-foot-btn" data-act="today">${esc(T.HOY)}</button>` : '';

        // El input nativo se oculta con estilo inline: dynamic-form.css da width:100% a
        // todos los inputs y una clase perderia contra esa regla
        this.insertAdjacentHTML('afterbegin', `
            <div class="wcd-wrapper">
                ${textHtml}
                <input type="${esc(mode)}" class="wcd-native-input" tabindex="-1" aria-hidden="true"
                       style="position:absolute;left:0;bottom:0;opacity:0;pointer-events:none;width:1px;height:1px;margin:0;padding:0;border:0;">
                <div class="wcd-panel${inline ? ' is-inline' : ''}" id="${panelId}" role="${inline ? 'group' : 'dialog'}" aria-label="${esc(panelLabel)}">
                    <div class="wcd-mobile-head">
                        <span class="wcd-mobile-title">${esc(panelLabel)}</span>
                        <button type="button" class="wcd-close" data-act="close" aria-label="${esc(T.CERRAR)}">${this.icons.close}</button>
                    </div>
                    <div class="wcd-body">
                        ${navHtml}
                        ${timeHtml}
                        ${colsHtml}
                        <div class="wcd-foot">
                            ${todayBtn}
                            <button type="button" class="wcd-foot-btn" data-act="clear">${esc(T.LIMPIAR)}</button>
                        </div>
                    </div>
                </div>
            </div>
        `);

        this._els.wrapper = this.querySelector('.wcd-wrapper');
        this._els.text = this.querySelector('.wcd-text');
        this._els.toggle = this.querySelector('.wcd-toggle');
        this._els.input = this.querySelector('.wcd-native-input');
        this._els.panel = this.querySelector('.wcd-panel');
        this._els.title = this.querySelector('.wcd-nav-title');
        this._els.gridHost = this.querySelector('.wcd-grid-host');
        this._els.time = this.querySelector('.wcd-time');
        const colH = this.querySelector('.wcd-col[data-tcol="h"]');
        this._els.cols = colH ? { h: colH, m: this.querySelector('.wcd-col[data-tcol="m"]') } : null;

        if (prevId) (this._els.text || this._els.input).id = prevId;

        // TOP LAYER: el panel se pinta por encima de todo el documento sin depender del
        // contexto de apilamiento de los ancestros. Modo manual: el cierre por clic fuera
        // lo gestiona el componente. Sin la API, fallback a position:fixed + z-index.
        if (!inline) {
            const panel = this._els.panel;
            this._hasPopoverApi = typeof panel.showPopover === 'function';
            if (this._hasPopoverApi) panel.setAttribute('popover', 'manual');
            else panel.style.display = 'none';
        }

        this._lastChangeValue = this.value;
        this._initActive();
        this._applyInputMode();

        this._syncAttributesToNative();
        this._bindEvents();
        // En inline el panel ya esta visible: las columnas arrancan centradas en la hora elegida
        if (isTime && inline) this._refreshPanel({ scroll: true });

        this._internals.setFormValue(this.value);
        this._updateValidity();
    }

    /**
     * Reconstruye la parte visual (cambio de type o de inline conservando el id).
     */
    _rebuild() {
        const holder = this._els.text || this._els.input;
        const prevId = holder ? holder.id : '';
        this._closePanel();
        this._removeGlobalListeners();
        if (this._els.wrapper) this._els.wrapper.remove();
        this._els = {};
        this._textDirty = false;
        this._view = null;
        this._render(prevId);
    }

    /**
     * Sincroniza los atributos del componente con el elemento de entrada nativo.
     * @returns
     */
    _syncAttributesToNative() {
        const inp = this._els.input;
        if (!inp) return;

        // El id y los atributos ARIA van al elemento realmente focusable: el campo de
        // texto visible (en modo inline, que no tiene campo, el id se queda en el nativo)
        const holder = this._els.text || inp;

        if (this.hasAttribute('id')) {
            holder.id = this.getAttribute('id');
            this.removeAttribute('id'); // Movemos el ID para la accesibilidad del label
        }

        if (this.hasAttribute('name')) {
            inp.setAttribute('name', this.getAttribute('name'));
        }

        ['required', 'min', 'max'].forEach(attr => {
            if (this.hasAttribute(attr)) inp.setAttribute(attr, this.getAttribute(attr));
            else inp.removeAttribute(attr);
        });

        // aria-invalid / aria-describedby / aria-label los pone el consumidor en el host
        // (DynamicForm._setError): se reenvian al campo visible o, en inline, al panel
        const ariaTarget = this._els.text || this._els.panel;
        ['aria-invalid', 'aria-describedby', 'aria-label'].forEach(attr => {
            if (this.hasAttribute(attr)) ariaTarget.setAttribute(attr, this.getAttribute(attr));
            else ariaTarget.removeAttribute(attr);
        });
        // El panel inline conserva su nombre por defecto si el consumidor no pone aria-label
        if (!this._els.text && !this.hasAttribute('aria-label')) {
            this._els.panel.setAttribute('aria-label', this._mode() === 'time' ? Traduccion.HORA : Traduccion.CALENDARIO);
        }

        inp.disabled = this.disabled;
        inp.readOnly = this.readonly;

        if (this._els.text) {
            this._els.text.disabled = this.disabled;
            this._els.text.readOnly = this.readonly;
            if (this.required) this._els.text.setAttribute('aria-required', 'true');
            else this._els.text.removeAttribute('aria-required');
        }
        this._els.wrapper.classList.toggle('is-disabled', this.disabled);
        this._els.wrapper.classList.toggle('is-readonly', this.readonly);
        if (this.inline) this._els.panel.inert = this.disabled;
        if ((this.disabled || this.readonly) && this._isOpen) this._closePanel();

        // Pie del calendario: "Hoy" (no existe en type="time") y "Limpiar" se ocultan por separado;
        // sin ninguno de los dos, desaparece tambien la fila
        const todayBtn = this._els.panel.querySelector('[data-act="today"]');
        const clearBtn = this._els.panel.querySelector('[data-act="clear"]');
        if (todayBtn) todayBtn.hidden = this.hideToday;
        clearBtn.hidden = this.hideClear;
        this._els.panel.querySelector('.wcd-foot').hidden = (!todayBtn || todayBtn.hidden) && clearBtn.hidden;

        if (inp.value !== this.value) inp.value = this.value;
        if (!this._skipTextSync) this._syncText();
        this._syncTimeInput();
        this._updateValidity();
        this._refreshPanel();
    }

    /**
     * Enlaza los eventos internos para mantener la sincronizacion y emitir eventos personalizados.
     * Los listeners son sobre elementos propios (mueren con el nodo); los de document/window
     * se registran solo mientras el panel esta abierto (ver _openPanel).
     */
    _bindEvents() {
        const { wrapper, text, toggle, panel, time } = this._els;

        if (text) {
            text.addEventListener('input', (e) => this._onTextInput(e));
            text.addEventListener('change', (e) => { e.stopPropagation(); this._commitText(); });
            text.addEventListener('keydown', (e) => this._onTextKeydown(e));
            text.addEventListener('blur', () => this._commitText());
            // Se abre al hacer foco o clic en el campo visible
            text.addEventListener('focus', () => { if (!this._suppressOpen) this._openPanel(); });
            text.addEventListener('click', () => this._openPanel());

            // Sin quitarle el foco al campo (evita un blur que confirmaria el texto a medias)
            toggle.addEventListener('mousedown', (e) => e.preventDefault());
            toggle.addEventListener('click', () => {
                if (this._isOpen) {
                    this._closePanel();
                } else {
                    this.focus();
                    this._openPanel();
                }
            });
        }

        // Los botones del panel no roban el foco con el raton; el selector de hora si lo necesita
        panel.addEventListener('mousedown', (e) => {
            if (!e.target.closest('input')) e.preventDefault();
        });
        panel.addEventListener('click', (e) => this._onPanelClick(e));

        if (time) {
            time.addEventListener('input', (e) => { e.stopPropagation(); this._onTimeInput(); });
            time.addEventListener('change', (e) => { e.stopPropagation(); this._emitChange(); });
            time.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                this._emitChange();
                if (this._isOpen) this._closePanel({ restoreFocus: true });
            });
        }

        wrapper.addEventListener('keydown', (e) => this._onKeydown(e));
        wrapper.addEventListener('focusout', () => this._onFocusOut());
    }

    // --- FORMATO Y PARSEO ---

    _pad(n, len = 2) { return String(n).padStart(len, '0'); }

    /** Ultimo dia del mes (m en base 0). */
    _dim(y, m) {
        const t = new Date(0);
        t.setUTCFullYear(y, m + 1, 0);
        return t.getUTCDate();
    }

    /** Fecha UTC (m en base 0, admite desbordes de d/m). Evita problemas de horario de verano. */
    _utc(y, m, d) {
        const t = new Date(0);
        t.setUTCFullYear(y, m, d);
        return t;
    }

    _todayParts() {
        const n = new Date();
        return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
    }

    _validParts(p, mode) {
        if (mode === 'time') return p.h >= 0 && p.h < 24 && p.mi >= 0 && p.mi < 60;
        if (p.y < 1 || p.m < 1 || p.m > 12) return false;
        if (mode !== 'month' && (p.d < 1 || p.d > this._dim(p.y, p.m - 1))) return false;
        if (mode === 'datetime-local' && !(p.h >= 0 && p.h < 24 && p.mi >= 0 && p.mi < 60)) return false;
        return true;
    }

    /**
     * Interpreta un valor ISO del input nativo.
     * @returns {{y:number,m:number,d:number,h:number,mi:number}|null} m en base 1.
     */
    _parseIso(str, mode) {
        if (!str) return null;
        let r, p = null;
        if (mode === 'time') {
            r = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(str);
            if (r) p = { y: 0, m: 0, d: 0, h: +r[1], mi: +r[2] };
        } else if (mode === 'month') {
            r = /^(\d{4,})-(\d{2})$/.exec(str);
            if (r) p = { y: +r[1], m: +r[2], d: 1, h: 0, mi: 0 };
        } else if (mode === 'datetime-local') {
            r = /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(str);
            if (r) p = { y: +r[1], m: +r[2], d: +r[3], h: +r[4], mi: +r[5] };
        } else {
            r = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(str);
            if (r) p = { y: +r[1], m: +r[2], d: +r[3], h: 0, mi: 0 };
        }
        return (p && this._validParts(p, mode)) ? p : null;
    }

    /** Valor ISO (formato del input nativo) a partir de las partes. */
    _buildIso(p, mode) {
        const date = `${this._pad(p.y, 4)}-${this._pad(p.m)}-${this._pad(p.d)}`;
        const time = `${this._pad(p.h)}:${this._pad(p.mi)}`;
        if (mode === 'time') return time;
        if (mode === 'month') return `${this._pad(p.y, 4)}-${this._pad(p.m)}`;
        if (mode === 'datetime-local') return `${date}T${time}`;
        return date;
    }

    /** Texto visible (formato fijo dd/mm/aaaa) a partir de un valor ISO. */
    _toDisplay(iso, mode) {
        const p = this._parseIso(iso, mode);
        if (!p) return '';
        const time = `${this._pad(p.h)}:${this._pad(p.mi)}`;
        const date = `${this._pad(p.d)}/${this._pad(p.m)}/${this._pad(p.y, 4)}`;
        if (mode === 'time') return time;
        if (mode === 'month') return `${this._pad(p.m)}/${this._pad(p.y, 4)}`;
        if (mode === 'datetime-local') return `${date} ${time}`;
        return date;
    }

    _parseDatePart(s) {
        const r = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s) || /^(\d{2})(\d{2})(\d{4})$/.exec(s);
        return r ? { y: +r[3], m: +r[2], d: +r[1] } : null;
    }

    _parseTimePart(s) {
        const r = /^(\d{1,2})[:.](\d{2})$/.exec(s) || /^(\d{2})(\d{2})$/.exec(s);
        return r ? { h: +r[1], mi: +r[2] } : null;
    }

    /**
     * Interpreta el texto tecleado.
     * @returns {string|null} '' si esta vacio, el valor ISO si es completo y valido, null si no.
     */
    _parseText(text, mode) {
        const s = String(text || '').trim();
        if (!s) return '';
        let p = null;
        if (mode === 'time') {
            const t = this._parseTimePart(s);
            if (t) p = { y: 0, m: 0, d: 0, h: t.h, mi: t.mi };
        } else if (mode === 'month') {
            const r = /^(\d{1,2})[\/.\-](\d{4})$/.exec(s) || /^(\d{2})(\d{4})$/.exec(s);
            if (r) p = { y: +r[2], m: +r[1], d: 1, h: 0, mi: 0 };
        } else if (mode === 'datetime-local') {
            const r = /^(\S+)\s+(\S+)$/.exec(s);
            const d = r && this._parseDatePart(r[1]);
            const t = r && /[:.]/.test(r[2]) ? this._parseTimePart(r[2]) : null;
            if (d && t) p = { ...d, h: t.h, mi: t.mi };
        } else {
            const d = this._parseDatePart(s);
            if (d) p = { ...d, h: 0, mi: 0 };
        }
        return (p && this._validParts(p, mode)) ? this._buildIso(p, mode) : null;
    }

    _placeholder(mode) {
        const T = Traduccion;
        if (mode === 'time') return T.FORMATO_HORA;
        if (mode === 'month') return T.FORMATO_MES;
        if (mode === 'datetime-local') return T.FORMATO_FECHA_HORA;
        return T.FORMATO_FECHA;
    }

    /** Clave de calendario de un valor ISO: 'YYYY-MM-DD' (o 'YYYY-MM' en month). */
    _keyOf(iso, mode) {
        const p = this._parseIso(iso, mode);
        if (!p) return '';
        if (mode === 'month') return `${this._pad(p.y, 4)}-${this._pad(p.m)}`;
        return `${this._pad(p.y, 4)}-${this._pad(p.m)}-${this._pad(p.d)}`;
    }

    // --- DIAS MARCADOS Y DESHABILITADOS ---

    _coerceJson(val) {
        if (typeof val !== 'string') return val;
        try { return JSON.parse(val); } catch (e) { return null; }
    }

    _normalizeMarked(val) {
        const map = new Map();
        const obj = this._coerceJson(val);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            Object.keys(obj).forEach(k => map.set(String(k).trim(), obj[k] === null || obj[k] === undefined ? '' : String(obj[k])));
        }
        return map;
    }

    /**
     * Normaliza las reglas de disabled-dates / enabled-dates. Cada entrada del array es:
     *  - un dia 'YYYY-MM-DD' (en type="month": 'YYYY-MM')
     *  - un dia de la semana: 'mon' 'tue' 'wed' 'thu' 'fri' 'sat' 'sun'
     *  - un rango inclusive { from, to } (cualquiera de los dos puede omitirse = sin limite)
     * Lo que no encaja se ignora. Un array vacio equivale a no tener reglas.
     * @returns {{entries:Array, dates:Set, weekdays:Set, ranges:Array}}
     */
    _normalizeRules(val) {
        const rules = { entries: [], dates: new Set(), weekdays: new Set(), ranges: [] };
        const arr = this._coerceJson(val);
        if (!Array.isArray(arr)) return rules;

        arr.forEach(item => {
            if (typeof item === 'string') {
                const s = item.trim();
                if (!s) return;
                const wd = WCDatepicker._WEEKDAYS.get(s.toLowerCase());
                if (wd !== undefined) {
                    rules.weekdays.add(wd);
                    rules.entries.push(s.toLowerCase());
                } else {
                    rules.dates.add(s);
                    rules.entries.push(s);
                }
            } else if (item && typeof item === 'object' && !Array.isArray(item)) {
                const from = item.from ? String(item.from).trim() : '';
                const to = item.to ? String(item.to).trim() : '';
                if (!from && !to) return;
                const entry = {};
                if (from) entry.from = from;
                if (to) entry.to = to;
                rules.ranges.push({ from, to });
                rules.entries.push(entry);
            }
        });
        return rules;
    }

    _readDatesAttr(name) {
        const raw = this.getAttribute(name);
        if (name === 'marked-dates') this._marked = this._normalizeMarked(raw);
        else if (name === 'disabled-dates') this._disabled = this._normalizeRules(raw);
        else this._enabled = this._normalizeRules(raw);
    }

    _reflectDates(attr, value) {
        this._reflecting = true;
        if (value === null) this.removeAttribute(attr);
        else this.setAttribute(attr, value);
        this._reflecting = false;
    }

    /**
     * Un rango { from, to } contiene la clave. Compara por prefijo, de modo que un limite
     * 'YYYY-MM' abarca el mes entero.
     */
    _inRange(key, from, to) {
        if (from) {
            const n = Math.min(key.length, from.length);
            if (key.slice(0, n) < from.slice(0, n)) return false;
        }
        if (to) {
            const n = Math.min(key.length, to.length);
            if (key.slice(0, n) > to.slice(0, n)) return false;
        }
        return true;
    }

    /** La clave coincide con alguna regla (dia, dia de la semana o rango). */
    _matchesRules(rules, key) {
        if (rules.dates.has(key)) return true;
        // El dia de la semana solo tiene sentido con claves de dia completo
        if (rules.weekdays.size && key.length === 10
            && rules.weekdays.has(this._utc(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)).getUTCDay())) {
            return true;
        }
        return rules.ranges.some(r => this._inRange(key, r.from, r.to));
    }

    /**
     * Bloqueo por reglas: coincide con disabled-dates, o hay enabled-dates y no coincide con
     * ninguna. Deshabilitar gana sobre habilitar. No incluye min/max.
     */
    _isRuleBlocked(key) {
        if (this._matchesRules(this._disabled, key)) return true;
        return this._enabled.entries.length > 0 && !this._matchesRules(this._enabled, key);
    }

    /**
     * Un dia no es seleccionable si lo bloquean las reglas o esta fuera de min/max.
     * Es solo ayuda visual del calendario: la validez la sigue dando el input nativo.
     * @param {string} key - 'YYYY-MM-DD' (o 'YYYY-MM' en month).
     */
    _isBlocked(key) {
        return this._isRuleBlocked(key) || this._outOfBounds(key);
    }

    /**
     * La clave (dia, mes o ano) queda fuera de min/max. Es lo unico que bloquea las celdas de
     * navegacion (meses / anos en date y datetime-local): las reglas de dias no aplican a un
     * mes entero, porque casi siempre lo tendria parcialmente libre.
     */
    _outOfBounds(key) {
        const min = this.min, max = this.max;
        if (min && min.length >= key.length && key < min.slice(0, key.length)) return true;
        if (max && max.length >= key.length && key > max.slice(0, key.length)) return true;
        return false;
    }

    // --- SINCRONIZACION DEL VALOR ---

    _isInteractive() { return !this.disabled && !this.readonly; }

    /** Refleja el valor del nativo en el campo de texto visible. */
    _syncText() {
        const t = this._els.text;
        if (!t) return;
        t.value = this._toDisplay(this._els.input.value, this._mode());
    }

    /** Refleja la hora del valor en el selector de hora del panel. */
    _syncTimeInput() {
        const t = this._els.time;
        if (!t) return;
        // Solo existe en datetime-local: si el valor aun no tiene hora, se conserva la elegida
        const p = this._parseIso(this._els.input.value, this._mode());
        if (p) t.value = `${this._pad(p.h)}:${this._pad(p.mi)}`;
    }

    /**
     * Escribe un valor desde la UI (campo de texto, calendario u hora): lo pasa por el
     * input nativo (que lo sanea) y actualiza atributo, formulario y validez.
     * Emite 'input' solo si el valor cambia.
     * @param {string} next - Valor ISO o ''.
     * @param {{syncText:boolean}} opts - false mientras el usuario teclea (no reescribir el texto).
     */
    _setFromUi(next, { syncText }) {
        const inp = this._els.input;
        inp.value = next;
        const v = inp.value;
        const changed = v !== this.value;

        this._skipTextSync = !syncText;
        this.setAttribute('value', v);
        this._skipTextSync = false;
        this._internals.setFormValue(v);
        this._updateValidity();
        if (syncText) this._syncText();
        this._syncTimeInput();

        // El cambio de atributo ya ha redibujado el panel (attributeChangedCallback)
        if (changed) {
            this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }
    }

    /** Emite 'change' solo si el valor difiere del ultimo confirmado. */
    _emitChange() {
        if (this.value === this._lastChangeValue) return;
        this._lastChangeValue = this.value;
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    /** Un texto completo en una fecha deshabilitada se trata como invalido (se vacia). */
    _isTypedBlocked(iso, mode) {
        if (mode === 'time') return false;
        return this._isRuleBlocked(this._keyOf(iso, mode));
    }

    // --- CAMPO DE TEXTO ---

    _onTextInput(e) {
        e.stopPropagation();
        const mode = this._mode();
        this._textDirty = true;
        const parsed = this._parseText(this._els.text.value, mode);
        const valid = parsed && !this._isTypedBlocked(parsed, mode);

        // Mientras se teclea no se reescribe el texto (el cursor saltaria); como el nativo,
        // un texto incompleto equivale a valor vacio
        this._setFromUi(valid ? parsed : '', { syncText: false });
        if (valid) {
            this._syncActFromIso(parsed);
            this._refreshPanel();
        }
    }

    /**
     * Confirma lo tecleado: normaliza el texto o lo vacia si es invalido o esta en una
     * fecha deshabilitada, y emite 'change' si el valor cambio.
     */
    _commitText() {
        const { text } = this._els;
        if (!text || !this._textDirty) return;
        this._textDirty = false;

        const mode = this._mode();
        const parsed = this._parseText(text.value, mode);
        const valid = parsed && !this._isTypedBlocked(parsed, mode);
        this._setFromUi(valid ? parsed : '', { syncText: true });
        this._emitChange();
    }

    _onTextKeydown(e) {
        if (e.key === 'Enter') {
            this._commitText();
            if (this._isOpen) this._closePanel();
        } else if (e.key === 'Tab') {
            // Con el panel abierto por foco, Tab debe seguir al siguiente campo y no
            // meterse en el panel (el panel se alcanza con la flecha abajo)
            this._commitText();
            this._closePanel();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._openPanel();
            this._focusActiveCell();
        }
    }

    // --- PANEL: APERTURA, CIERRE Y POSICION ---

    _isMobile() {
        return (this._mql || window.matchMedia('(max-width: 640px)')).matches;
    }

    _watchMedia() {
        this._mql = window.matchMedia('(max-width: 640px)');
        this._mql.removeEventListener('change', this._onMediaChange);
        this._mql.addEventListener('change', this._onMediaChange);
    }

    _onMediaChange() {
        this._applyInputMode();
        if (this._isOpen) this._positionPanel();
    }

    /** En movil el panel sustituye al teclado: inputmode none evita el teclado virtual. */
    _applyInputMode() {
        if (!this._els.text) return;
        this._els.text.setAttribute('inputmode', this._isMobile() ? 'none' : 'numeric');
    }

    _openPanel() {
        const { panel, text } = this._els;
        if (this._isOpen || this.inline || !panel || !this._isInteractive()) return;

        this._isOpen = true;
        this._view = null;   // siempre se abre en la vista base (dias, o meses en type="month")
        this._initActive();
        text.setAttribute('aria-expanded', 'true');
        this._showPanelEl();
        this._syncTimeInput();
        this._refreshPanel({ scroll: true });
        this._positionPanel();

        document.removeEventListener('pointerdown', this._onDocPointerDown);
        // Guard isConnected: si el componente se elimina en este mismo tick, el listener
        // se anadiria DESPUES de disconnectedCallback y quedaria huerfano
        setTimeout(() => {
            if (this.isConnected && this._isOpen) document.addEventListener('pointerdown', this._onDocPointerDown);
        }, 0);
        window.addEventListener('scroll', this._onScrollResize, true);
        window.addEventListener('resize', this._onScrollResize);
    }

    /**
     * @param {{restoreFocus:boolean}} [opts] - Devuelve el foco al campo de texto.
     */
    _closePanel({ restoreFocus = false } = {}) {
        if (!this._isOpen) return;
        this._isOpen = false;
        this._hidePanelEl();
        this._removeGlobalListeners();
        if (this._els.text) {
            this._els.text.setAttribute('aria-expanded', 'false');
            if (restoreFocus) this.focus();
        }
    }

    _removeGlobalListeners() {
        document.removeEventListener('pointerdown', this._onDocPointerDown);
        window.removeEventListener('scroll', this._onScrollResize, true);
        window.removeEventListener('resize', this._onScrollResize);
    }

    /**
     * Muestra el panel. Con soporte de la API nativa lo promueve al top layer; si no, cae
     * al position:fixed + z-index (sin toggles de display con el atributo popover puesto).
     */
    _showPanelEl() {
        const { panel } = this._els;
        if (this._hasPopoverApi) {
            // showPopover() lanza si el elemento no esta conectado o ya esta abierto
            if (this.isConnected && !panel.matches(':popover-open')) panel.showPopover();
        } else {
            panel.style.display = '';
        }
    }

    _hidePanelEl() {
        const { panel } = this._els;
        if (!panel) return;
        if (this._hasPopoverApi) {
            // hidePopover() lanza si el popover no esta abierto
            if (panel.matches(':popover-open')) panel.hidePopover();
        } else {
            panel.style.display = 'none';
        }
    }

    /** Coloca el panel bajo el campo (o encima si no cabe). En movil lo gestiona el CSS. */
    _positionPanel() {
        const { panel, wrapper } = this._els;
        if (!panel || !this._isOpen) return;
        if (this._isMobile()) {
            panel.style.top = '';
            panel.style.left = '';
            return;
        }
        const r = wrapper.getBoundingClientRect();
        const pw = panel.offsetWidth, ph = panel.offsetHeight;
        const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;

        let top = r.bottom + 4;
        if (top + ph > vh - 8 && r.top - ph - 4 >= 8) top = r.top - ph - 4;
        top = Math.max(8, Math.min(top, vh - ph - 8));
        const left = Math.max(8, Math.min(r.left, vw - pw - 8));

        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
    }

    _onScrollResize(e) {
        // El scroll del propio panel (movil) no debe recolocarlo
        if (e && e.target && this._els.panel && e.target.nodeType === 1 && this._els.panel.contains(e.target)) return;
        this._positionPanel();
    }

    _onDocPointerDown(e) {
        if (!this._isOpen) return;
        if (e.composedPath().includes(this)) return;
        this._closePanel();
    }

    /** Cierra el panel si el foco sale del componente (p. ej. Shift+Tab). */
    _onFocusOut() {
        if (!this._isOpen) return;
        clearTimeout(this._focusOutTimer);
        // Diferido: al redibujar el grid el foco pasa un instante por el body
        this._focusOutTimer = setTimeout(() => {
            if (!this._isOpen || !this.isConnected) return;
            const active = this.getRootNode().activeElement;
            if (!active || !this.contains(active)) this._closePanel();
        }, 0);
    }

    // --- PANEL: CALENDARIO ---

    /** Fija el dia (o mes) activo a partir del valor o de hoy. */
    _initActive() {
        const mode = this._mode();
        if (mode === 'time') return;
        // En el primer render el nativo aun no esta sincronizado: se cae al atributo
        const iso = (this._els.input && this._els.input.value) || this.value;
        const p = this._parseIso(iso, mode);
        this._act = p ? { y: p.y, m: p.m - 1, d: p.d } : this._todayParts();
    }

    _syncActFromIso(iso) {
        const p = this._parseIso(iso, this._mode());
        if (p) this._act = { y: p.y, m: p.m - 1, d: p.d };
    }

    /** Primera letra en mayuscula (Intl devuelve "agosto de 2026"; capitalize de CSS pondria "De"). */
    _cap(s) { return s.charAt(0).toLocaleUpperCase() + s.slice(1); }

    _formatters() {
        if (this._fmt) return this._fmt;
        const make = (opts) => {
            const o = { ...opts, timeZone: 'UTC' };
            try { return new Intl.DateTimeFormat(navigator.language || 'es-ES', o); }
            catch (e) { return new Intl.DateTimeFormat('es-ES', o); }
        };
        this._fmt = {
            title: make({ month: 'long', year: 'numeric' }),
            month: make({ month: 'long' }),
            wdShort: make({ weekday: 'short' }),
            wdLong: make({ weekday: 'long' }),
            full: make({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        };
        return this._fmt;
    }

    /**
     * Redibuja el calendario y sincroniza el estado del pie. Solo actua si el panel esta
     * abierto o es inline.
     * @param {{focus:boolean, scroll:boolean}} [opts] - focus: mueve el foco al dia activo tras
     *   redibujar. scroll: (solo type="time") centra las columnas en la hora elegida.
     */
    _refreshPanel({ focus = false, scroll = false } = {}) {
        const { panel, gridHost } = this._els;
        if (!panel || !(this._isOpen || this.inline)) return;
        const mode = this._mode();
        if (mode === 'time') {
            this._refreshTimeCols({ scroll });
            if (focus) this._focusActiveCell();
            return;
        }

        const hadFocus = gridHost.contains(this.getRootNode().activeElement);
        this._renderCalendar();

        const todayBtn = panel.querySelector('[data-act="today"]');
        if (todayBtn) {
            const t = this._todayParts();
            const key = mode === 'month' ? `${this._pad(t.y, 4)}-${this._pad(t.m + 1)}` : `${this._pad(t.y, 4)}-${this._pad(t.m + 1)}-${this._pad(t.d)}`;
            todayBtn.disabled = this._isBlocked(key);
        }
        if (focus || hadFocus) this._focusActiveCell();
    }

    /** Vista base: dias, o meses en type="month" (alli el mes ES el valor). */
    _baseView() { return this._mode() === 'month' ? 'months' : 'days'; }

    /** Vista actual: la elegida con el titulo o, si no hay, la base. */
    _curView() { return this._view || this._baseView(); }

    /**
     * Pulsar el titulo sube un nivel: dias -> meses -> anos -> (vuelta a la base).
     * En type="month" la base ya son los meses, asi que es meses -> anos -> meses.
     */
    _switchView() {
        const v = this._curView();
        this._view = v === 'days' ? 'months' : (v === 'months' ? 'years' : null);
        this._refreshPanel();
    }

    /**
     * Elegir un mes o un ano en las vistas de navegacion (NO escribe el valor): solo mueve
     * el calendario. En type="month" los meses no pasan por aqui (esos si seleccionan).
     * @param {'month'|'year'} kind
     * @param {string} key - 'YYYY-MM' o 'YYYY'.
     */
    _navPick(kind, key) {
        if (this._outOfBounds(key)) return;
        const a = this._act || this._todayParts();
        if (kind === 'year') {
            const y = +key;
            if (y < 1 || y > 9999) return;
            this._act = { y, m: a.m, d: Math.min(a.d, this._dim(y, a.m)) };
            this._view = 'months';
        } else {
            const y = +key.slice(0, 4), m = +key.slice(5, 7) - 1;
            this._act = { y, m, d: Math.min(a.d, this._dim(y, m)) };
            this._view = null;
        }
        this._refreshPanel();
    }

    /**
     * Ajusta la cabecera a la vista: en dias hay cuatro botones (ano y mes); en meses y
     * anos solo los de ano (un paso de 1 ano en meses y de 12 en anos), con flecha simple.
     */
    _refreshNav(view) {
        const p = this._els.panel;
        const days = view === 'days';
        p.querySelector('[data-act="prev-month"]').hidden = !days;
        p.querySelector('[data-act="next-month"]').hidden = !days;
        p.querySelector('[data-act="prev-year"]').innerHTML = days ? this.icons.prevYear : this.icons.prev;
        p.querySelector('[data-act="next-year"]').innerHTML = days ? this.icons.nextYear : this.icons.next;
    }

    _renderCalendar() {
        const esc = WCBaseElement.escapeHtml;
        const mode = this._mode();
        const view = this._curView();
        const f = this._formatters();
        const act = this._act || this._todayParts();
        this._act = act;
        const selKey = this._keyOf(this._els.input.value, mode);
        const today = this._todayParts();
        const pad = (n) => this._pad(n);
        const todayMonth = `${this._pad(today.y, 4)}-${pad(today.m + 1)}`;
        const todayDay = `${todayMonth}-${pad(today.d)}`;
        // En date / datetime-local los meses y anos solo navegan; en type="month" los meses seleccionan
        const navOnly = mode !== 'month';

        // Celda generica (dia, mes o ano)
        const cell = ({ cls, key, label, text, active, selected, blocked, isToday, mark, nav }) => {
            const classes = [cls];
            if (isToday) classes.push('is-today');
            if (mark !== undefined) classes.push('is-marked');
            const aria = mark ? `${label}, ${mark}` : label;
            return `<button type="button" class="${classes.join(' ')}" role="gridcell" tabindex="${active ? 0 : -1}" data-key="${key}"${nav ? ` data-nav="${nav}"` : ''}`
                + ` aria-label="${esc(aria)}" aria-selected="${selected}"`
                + `${blocked ? ' aria-disabled="true"' : ''}${isToday ? ' aria-current="date"' : ''}`
                + `${mark ? ` title="${esc(mark)}"` : ''}>${esc(text)}</button>`;
        };
        const markOf = (key) => (this._marked.has(key) ? this._marked.get(key) : undefined);
        const grid3x4 = (cells) => {
            let h = `<div class="wcd-grid is-months" role="grid" aria-labelledby="${this._uid}-panel-title">`;
            for (let r = 0; r < 4; r++) h += `<div class="wcd-row" role="row">${cells.slice(r * 3, r * 3 + 3).join('')}</div>`;
            return h + '</div>';
        };

        let html = '';
        if (view === 'years') {
            // Paginas de 12 anos (3 x 4); las flechas de la cabecera saltan de pagina
            const start = Math.floor(act.y / 12) * 12;
            this._els.title.textContent = `${start} - ${start + 11}`;
            const cells = [];
            for (let i = 0; i < 12; i++) {
                const y = start + i;
                const key = this._pad(y, 4);
                cells.push(cell({
                    cls: 'wcd-month', key, label: String(y), text: String(y), active: y === act.y,
                    selected: selKey.slice(0, 4) === key && selKey !== '', blocked: y < 1 || y > 9999 || this._outOfBounds(key),
                    isToday: y === today.y, nav: 'year'
                }));
            }
            html = grid3x4(cells);
        } else if (view === 'months') {
            this._els.title.textContent = String(act.y);
            const cells = [];
            for (let m = 0; m < 12; m++) {
                const key = `${this._pad(act.y, 4)}-${pad(m + 1)}`;
                const name = this._cap(f.month.format(this._utc(act.y, m, 1)));
                cells.push(cell({
                    cls: 'wcd-month', key, label: `${name} ${act.y}`, text: name, active: m === act.m,
                    selected: navOnly ? (selKey.slice(0, 7) === key && selKey !== '') : key === selKey,
                    blocked: navOnly ? this._outOfBounds(key) : this._isBlocked(key),
                    isToday: key === todayMonth, mark: navOnly ? undefined : markOf(key), nav: navOnly ? 'month' : undefined
                }));
            }
            html = grid3x4(cells);
        } else {
            this._els.title.textContent = this._cap(f.title.format(this._utc(act.y, act.m, 1)));
            html += `<div class="wcd-grid" role="grid" aria-labelledby="${this._uid}-panel-title"><div class="wcd-row" role="row">`;
            for (let i = 0; i < 7; i++) {
                // 2024-01-01 fue lunes: la semana empieza en lunes
                const dt = this._utc(2024, 0, 1 + i);
                html += `<div class="wcd-weekday" role="columnheader" aria-label="${esc(f.wdLong.format(dt))}">${esc(f.wdShort.format(dt))}</div>`;
            }
            html += '</div>';

            const lead = (this._utc(act.y, act.m, 1).getUTCDay() + 6) % 7;
            for (let i = 0; i < 42; i++) {
                if (i % 7 === 0) html += '<div class="wcd-row" role="row">';
                const dt = this._utc(act.y, act.m, 1 - lead + i);
                const y = dt.getUTCFullYear(), m = dt.getUTCMonth(), d = dt.getUTCDate();
                const key = `${this._pad(y, 4)}-${pad(m + 1)}-${pad(d)}`;
                const outside = m !== act.m;
                html += cell({
                    cls: outside ? 'wcd-day is-outside' : 'wcd-day', key, label: f.full.format(dt), text: String(d),
                    active: !outside && d === act.d, selected: key === selKey, blocked: this._isBlocked(key),
                    isToday: key === todayDay, mark: markOf(key)
                });
                if (i % 7 === 6) html += '</div>';
            }
            html += '</div>';
        }
        this._els.gridHost.innerHTML = html;
        this._refreshNav(view);
    }

    _focusActiveCell() {
        if (this._mode() === 'time') {
            const opt = this._els.cols && this._els.cols.h.querySelector('[tabindex="0"]');
            if (opt) opt.focus({ preventScroll: true });
            return;
        }
        const el = this._els.gridHost && this._els.gridHost.querySelector('[tabindex="0"]');
        if (el) el.focus();
    }

    /**
     * Mueve el dia (o mes) activo y redibuja.
     * @param {'day'|'month'|'year'} unit
     * @param {number} n
     * @param {{focus:boolean}} [opts]
     */
    _shift(unit, n, { focus = false } = {}) {
        const a = this._act || this._todayParts();
        let { y, m, d } = a;
        if (unit === 'day') {
            const t = this._utc(y, m, d + n);
            y = t.getUTCFullYear(); m = t.getUTCMonth(); d = t.getUTCDate();
        } else {
            const total = y * 12 + m + (unit === 'year' ? n * 12 : n);
            y = Math.floor(total / 12);
            m = total - y * 12;
            d = Math.min(d, this._dim(y, m));
        }
        if (y < 1 || y > 9999) return;
        this._act = { y, m, d };
        this._refreshPanel({ focus });
    }

    // --- PANEL: INTERACCION ---

    _onPanelClick(e) {
        const btn = e.target.closest('button');
        if (!btn || !this._els.panel.contains(btn)) return;

        const act = btn.dataset.act;
        if (act) {
            // En la vista de anos las flechas de ano saltan una pagina de 12
            const yearStep = this._curView() === 'years' ? 12 : 1;
            if (act === 'prev-year') this._shift('year', -yearStep);
            else if (act === 'next-year') this._shift('year', yearStep);
            else if (act === 'prev-month') this._shift('month', -1);
            else if (act === 'next-month') this._shift('month', 1);
            else if (act === 'switch-view') this._switchView();
            else if (act === 'today') this._pickToday();
            else if (act === 'clear') this._clearValue();
            else if (act === 'close') this._closePanel({ restoreFocus: true });
            return;
        }
        // Meses y anos de las vistas de navegacion: solo mueven el calendario
        if (btn.dataset.nav) {
            this._navPick(btn.dataset.nav, btn.dataset.key);
            return;
        }
        // Hora o minuto de las columnas (type="time")
        if (btn.dataset.tcol) {
            this._pickTime(btn.dataset.tcol, btn.dataset.tval);
            return;
        }
        if (btn.dataset.key) this._pickCell(btn.dataset.key);
    }

    /**
     * Selecciona un dia (o un mes). En datetime-local conserva la hora del selector
     * (00:00 si aun no se ha elegido) y deja el panel abierto para poder ajustarla.
     * @param {string} key - 'YYYY-MM-DD' (o 'YYYY-MM' en month).
     */
    _pickCell(key) {
        if (!this._isInteractive() || this._isBlocked(key)) return;
        const mode = this._mode();

        let next = key;
        if (mode === 'datetime-local') {
            const time = this._els.time.value || '00:00';
            this._els.time.value = time;
            next = `${key}T${time}`;
        }
        this._setFromUi(next, { syncText: true });
        this._syncActFromIso(this._els.input.value);
        this._emitChange();

        if (mode !== 'datetime-local' && !this.inline) this._closePanel({ restoreFocus: true });
        else this._refreshPanel();
    }

    _pickToday() {
        const t = this._todayParts();
        const mode = this._mode();
        this._pickCell(mode === 'month'
            ? `${this._pad(t.y, 4)}-${this._pad(t.m + 1)}`
            : `${this._pad(t.y, 4)}-${this._pad(t.m + 1)}-${this._pad(t.d)}`);
    }

    _clearValue() {
        if (!this._isInteractive()) return;
        this._setFromUi('', { syncText: true });
        if (this._els.time) this._els.time.value = '';
        this._emitChange();
        if (!this.inline) this._closePanel({ restoreFocus: true });
    }

    /** Hora de datetime-local: solo cambia un valor que ya tiene fecha. */
    _onTimeInput() {
        if (!this._isInteractive()) return;
        const t = this._els.time.value;
        if (!t) return;
        const key = this._keyOf(this._els.input.value, this._mode());
        if (key) this._setFromUi(`${key}T${t}`, { syncText: true });
    }

    // --- PANEL: COLUMNAS DE HORA (type="time") ---

    /** Minutos desde las 00:00 de un limite min/max ('HH:mm' o 'HH:mm:ss'), o null si no hay o no vale. */
    _timeBound(str) {
        const r = /^(\d{2}):(\d{2})/.exec(str || '');
        return r ? (+r[1]) * 60 + (+r[2]) : null;
    }

    /**
     * Una hora (con mm = null, la hora entera) queda fuera de min/max. Es solo ayuda visual:
     * la validez la da el input nativo. Un rango que cruza la medianoche (min > max) no se aplica.
     */
    _timeBlocked(hh, mm) {
        const mn = this._timeBound(this.min), mx = this._timeBound(this.max);
        if (mn !== null && mx !== null && mn > mx) return false;
        const start = hh * 60 + (mm === null ? 0 : mm);
        const end = hh * 60 + (mm === null ? 59 : mm);
        return (mn !== null && end < mn) || (mx !== null && start > mx);
    }

    /**
     * Sincroniza las columnas con el valor: opcion elegida, opciones fuera de min/max y la unica
     * opcion con tabindex 0 de cada columna (roving). No recrea botones: se conservan scroll y foco.
     * @param {{scroll:boolean}} [opts] - Centra cada columna en su opcion elegida (al abrir).
     */
    _refreshTimeCols({ scroll = false } = {}) {
        const cols = this._els.cols;
        if (!cols) return;
        const p = this._parseIso(this._els.input.value, 'time');
        const sel = { h: p ? this._pad(p.h) : '', m: p ? this._pad(p.mi) : '' };
        // Sin hora elegida, los minutos se evaluan como si la hora fuese 00 (lo que se escribira al pulsarlos)
        const effHour = p ? p.h : 0;

        ['h', 'm'].forEach(c => {
            const col = cols[c];
            let active = null;
            Array.from(col.children).forEach(o => {
                const v = o.dataset.tval;
                const selected = v === sel[c];
                const blocked = c === 'h' ? this._timeBlocked(+v, null) : this._timeBlocked(effHour, +v);
                o.setAttribute('aria-selected', selected);
                if (blocked) o.setAttribute('aria-disabled', 'true');
                else o.removeAttribute('aria-disabled');
                o.tabIndex = -1;
                if (selected) active = o;
            });
            const target = active || col.firstElementChild;
            target.tabIndex = 0;
            if (scroll) col.scrollTop = active ? Math.max(0, active.offsetTop - (col.clientHeight - active.offsetHeight) / 2) : 0;
        });
    }

    /**
     * Elige hora o minuto. Lo que falta se toma del valor actual o, si no hay, 00. Elegir la hora
     * deja el panel abierto (falta el minuto); elegir el minuto lo cierra.
     * @param {'h'|'m'} col
     * @param {string} val - '00'..'23' o '00'..'59'.
     */
    _pickTime(col, val) {
        if (!this._isInteractive()) return;
        const p = this._parseIso(this._els.input.value, 'time');
        let hh = p ? p.h : 0, mm = p ? p.mi : 0;
        if (col === 'h') hh = +val; else mm = +val;
        if (this._timeBlocked(hh, col === 'h' ? null : mm)) return;

        if (col === 'h') {
            // El minuto que ya habia puede quedar fuera de min/max con la hora nueva: se acerca al limite
            const mn = this._timeBound(this.min), mx = this._timeBound(this.max);
            if (!(mn !== null && mx !== null && mn > mx)) {
                let t = hh * 60 + mm;
                if (mn !== null && t < mn) t = mn;
                if (mx !== null && t > mx) t = mx;
                hh = Math.floor(t / 60);
                mm = t % 60;
            }
        }
        this._setFromUi(`${this._pad(hh)}:${this._pad(mm)}`, { syncText: true });
        this._emitChange();
        if (col === 'm' && !this.inline) this._closePanel({ restoreFocus: true });
    }

    /** Teclado de las columnas: arriba/abajo, Inicio/Fin, RePag/AvPag y izquierda/derecha entre columnas. */
    _onTimeKeydown(e) {
        const opt = e.target.closest('.wcd-opt');
        if (!opt || !this._els.cols) return;
        const col = opt.dataset.tcol;
        const list = Array.from(this._els.cols[col].children);
        const i = list.indexOf(opt);
        let target = null;

        switch (e.key) {
            case 'ArrowUp': target = list[Math.max(0, i - 1)]; break;
            case 'ArrowDown': target = list[Math.min(list.length - 1, i + 1)]; break;
            case 'PageUp': target = list[Math.max(0, i - 6)]; break;
            case 'PageDown': target = list[Math.min(list.length - 1, i + 6)]; break;
            case 'Home': target = list[0]; break;
            case 'End': target = list[list.length - 1]; break;
            case 'ArrowRight': if (col === 'h') target = this._els.cols.m.querySelector('[tabindex="0"]'); break;
            case 'ArrowLeft': if (col === 'm') target = this._els.cols.h.querySelector('[tabindex="0"]'); break;
            default: return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (!target) return;

        const c = target.dataset.tcol;
        const column = this._els.cols[c];
        Array.from(column.children).forEach(o => { o.tabIndex = -1; });
        target.tabIndex = 0;
        target.focus({ preventScroll: true });
        // Mantener la opcion visible sin mover el resto de la pagina
        if (target.offsetTop < column.scrollTop) column.scrollTop = target.offsetTop;
        else if (target.offsetTop + target.offsetHeight > column.scrollTop + column.clientHeight) {
            column.scrollTop = target.offsetTop + target.offsetHeight - column.clientHeight;
        }
    }

    _onKeydown(e) {
        // Escape cierra el panel (y no debe cerrar tambien el modal/sidebar que lo contiene)
        if (e.key === 'Escape' && this._isOpen) {
            e.preventDefault();
            e.stopPropagation();
            this._closePanel({ restoreFocus: true });
            return;
        }
        if (!e.target.closest) return;
        if (e.target.closest('.wcd-day, .wcd-month')) this._onGridKeydown(e);
        else if (e.target.closest('.wcd-opt')) this._onTimeKeydown(e);
    }

    /**
     * Teclado del grid segun la vista (patron WAI-ARIA Date Picker). Dias: flechas, Inicio/Fin
     * y RePag/AvPag. Meses (3 por fila): flechas +-1 / +-3, RePag/AvPag +-1 ano. Anos (3 por
     * fila, paginas de 12): flechas +-1 / +-3, RePag/AvPag +-12.
     */
    _onGridKeydown(e) {
        const view = this._curView();
        const a = this._act || this._todayParts();
        const opts = { focus: true };
        let handled = true;

        if (view === 'days') {
            const wd = (this._utc(a.y, a.m, a.d).getUTCDay() + 6) % 7;
            switch (e.key) {
                case 'ArrowLeft': this._shift('day', -1, opts); break;
                case 'ArrowRight': this._shift('day', 1, opts); break;
                case 'ArrowUp': this._shift('day', -7, opts); break;
                case 'ArrowDown': this._shift('day', 7, opts); break;
                case 'PageUp': this._shift(e.shiftKey ? 'year' : 'month', -1, opts); break;
                case 'PageDown': this._shift(e.shiftKey ? 'year' : 'month', 1, opts); break;
                case 'Home': this._shift('day', -wd, opts); break;
                case 'End': this._shift('day', 6 - wd, opts); break;
                default: handled = false;
            }
        } else if (view === 'months') {
            switch (e.key) {
                case 'ArrowLeft': this._shift('month', -1, opts); break;
                case 'ArrowRight': this._shift('month', 1, opts); break;
                case 'ArrowUp': this._shift('month', -3, opts); break;
                case 'ArrowDown': this._shift('month', 3, opts); break;
                case 'PageUp': this._shift('year', -1, opts); break;
                case 'PageDown': this._shift('year', 1, opts); break;
                case 'Home': this._shift('month', -(a.m % 3), opts); break;
                case 'End': this._shift('month', 2 - (a.m % 3), opts); break;
                default: handled = false;
            }
        } else {
            const idx = a.y - Math.floor(a.y / 12) * 12;
            switch (e.key) {
                case 'ArrowLeft': this._shift('year', -1, opts); break;
                case 'ArrowRight': this._shift('year', 1, opts); break;
                case 'ArrowUp': this._shift('year', -3, opts); break;
                case 'ArrowDown': this._shift('year', 3, opts); break;
                case 'PageUp': this._shift('year', -12, opts); break;
                case 'PageDown': this._shift('year', 12, opts); break;
                case 'Home': this._shift('year', -(idx % 3), opts); break;
                case 'End': this._shift('year', 2 - (idx % 3), opts); break;
                default: handled = false;
            }
        }
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    // --- METODOS DE VALIDACION NATIVA (Proxy) ---
    /**
     * Actualiza la validez del campo de entrada nativo. El anchor es el elemento visible
     * (campo de texto o, en inline, el panel) para que reportValidity() apunte a algo que se ve.
     * @returns
     */
    _updateValidity() {
        const inp = this._els.input;
        if (!inp) return;
        this._internals.setValidity(inp.validity, inp.validationMessage, this._els.text || this._els.panel || inp);
    }

    /**
     * Verifica la validez del campo de entrada nativo.
     * @returns
     */
    checkValidity() { return this._internals.checkValidity(); }

    /**
     * Informa sobre la validez del campo de entrada nativo.
     * @returns
     */
    reportValidity() { return this._internals.reportValidity(); }

    /**
     * Devuelve un objeto ValidityState que representa el estado de validez del campo.
     */
    get validity() { return this._internals.validity; }

    /**
     * Devuelve el mensaje de validacion del campo de entrada nativo.
     */
    get validationMessage() { return this._internals.validationMessage; }
}

if (!customElements.get('wc-datepicker')) customElements.define('wc-datepicker', WCDatepicker);
