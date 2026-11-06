/**
 * Clase Base para los Web Components del ecosistema.
 * Centraliza la carga de estilos dinámicos y la ejecución segura de callbacks.
 */

const cssPathGlobal = new URL('../../../../Estilo/propio/web-component', import.meta.url).href;
const cssVersionGlobal = new URL(import.meta.url).searchParams.get('v');
class WidgetBase extends HTMLElement {
    /**
     * Escapa un valor para poder interpolarlo de forma segura en innerHTML
     * (texto y valores de atributo entre comillas dobles). Previene XSS.
     * Misma implementacion que WCBaseElement.escapeHtml (jerarquias separadas).
     * @param {any} value - Valor a escapar (se convierte a string; null/undefined -> '').
     * @returns {string}
     */
    static escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    constructor() {
        super();

        /** @private @type {string|null} Ruta base para el archivo CSS */
        this._cssPath = cssPathGlobal;

        /** @private @type {string} Versión del CSS para control de caché */
        this._cssVersion = cssVersionGlobal;

        /** @private @type {string[]} Lista de archivos CSS adicionales a cargar */
        this._extraCss = [];

        /** @private @type {string} Texto CSS adicional a inyectar inline en el Shadow DOM */
        this._extraStyle = '';

        /** @private @type {Window|null} Contexto del llamador para ejecución de callbacks */
        this._callerContext = null;

        /** @private @type {boolean} Flag para evitar cargas de estilos redundantes */
        this._styleLoadPending = false;
    }

    /** @returns {string[]} Lista de atributos observados. */
    static get observedAttributes() {
        return ['extra-css', 'extra-style'];
    }

    /**
     * Detecta cambios en los atributos observados y actualiza las propiedades correspondientes.
     * @param {string} name - Nombre del atributo que cambió.
     * @param {string|null} oldValue - Valor anterior.
     * @param {string|null} newValue - Nuevo valor.
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            if (name === 'extra-css') this.extraCss = newValue;
            if (name === 'extra-style') this.extraStyle = newValue;
        }
    }

    /**
     * Cuando el componente se conecta al DOM, lo ocultamos por defecto y solicitamos la carga de estilos.
     */
    connectedCallback() {
        this.style.setProperty('visibility', 'hidden', 'important');
        this.style.setProperty('opacity', '0', 'important');
        this.style.setProperty('transition', 'opacity 0.2s ease-in-out', 'important');
        this.requestStyleLoad();

        this.setAttribute("wc-educaria", "");
    }

    disconnectedCallback() { }

    /**
     * Hook de tracking.
     * Intercepta cualquier CustomEvent antes de despacharlo y lo notifica al bus
     * de tracking si esta cargado. El dispatch normal no se interrumpe jamas.
     * Se pasa 'this' como segundo argumento porque composedPath() estaria vacio
     * aqui (el evento aun no se ha despachado); el bus reconstruye la ruta desde
     * el elemento.
     * @param {Event} event
     * @returns {boolean}
     */
    dispatchEvent(event) {
        if (event instanceof CustomEvent && window.AlexiaTracking) {
            window.AlexiaTracking.handleCustomEvent(event, this);
        }
        return super.dispatchEvent(event);
    }

    // =========================================================================
    // GETTERS / SETTERS
    // =========================================================================

    //get cssPath() { return this._cssPath; }
    //set cssPath(val) {
    //    if (this._cssPath === val) return;
    //    this._cssPath = val;
    //    if (val) this.setAttribute('css-path', val);
    //    this.requestStyleLoad();
    //}

    //get cssVersion() { return this._cssVersion || '1.0'; }
    //set cssVersion(val) {
    //    if (this._cssVersion === val) return;
    //    this._cssVersion = val || '1.0';
    //    if (val) this.setAttribute('css-version', val);
    //    this.requestStyleLoad();
    //}

    get callerContext() { return this._callerContext; }
    set callerContext(context) { this._callerContext = context; }

    get extraCss() { return this._extraCss; }
    set extraCss(val) {
        // Limpiamos del Shadow DOM los links anteriores
        if (this._extraCss && this._extraCss.length > 0) {
            const root = this.shadowRoot || this;
            this._extraCss.forEach(cssName => {
                const hrefBase = this._resolveCssHref(cssName);
                const existing = root.querySelector(`link[href^="${hrefBase}"]`);
                if (existing) existing.remove();
            });
        }

        if (typeof val === 'string') {
            this._extraCss = val.split(',').map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(val)) {
            this._extraCss = val;
        } else {
            this._extraCss = [];
        }

        this.requestStyleLoad();
    }

    /**
     * Limpia explícitamente todos los CSS adicionales del Shadow DOM.
     */
    clearExtraCss() {
        this.extraCss = [];
    }

    get extraStyle() { return this._extraStyle; }
    set extraStyle(val) {
        const text = val || '';
        this._extraStyle = text;

        const root = this.shadowRoot || this;
        let styleEl = root.querySelector('style[data-extra-style]');

        if (!text) {
            if (styleEl) styleEl.remove();
            return;
        }

        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.setAttribute('data-extra-style', '');
            root.appendChild(styleEl);
        }
        styleEl.textContent = text;
    }

    /**
     * Limpia explícitamente el CSS adicional inline del Shadow DOM.
     */
    clearExtraStyle() {
        this.extraStyle = '';
    }

    /**
     * Propiedad abstracta que los componentes hijos deben sobrescribir.
     * Devuelve el nombre del archivo CSS. Ej: 'dynamic-form.css'
     */
    get componentCssName() {
        return '';
    }

    // =========================================================================
    // CARGA DE ESTILOS
    // =========================================================================

    /**
     * Resuelve la href final de un archivo CSS.
     * Si cssName ya es una URL absoluta o ruta relativa explícita
     * (empieza por http, /, ./ o ../) la usa tal cual.
     * En caso contrario la prefija con cssPath (comportamiento por defecto).
     * @param {string} cssName
     * @returns {string}
     * @private
     */
    _resolveCssHref(cssName) {
        if (/^(https?:)?\/\//.test(cssName)) return cssName;    // URL absoluta externa
        if (/^\//.test(cssName))             return cssName;    // ruta absoluta de dominio
        if (/^\.\.?\//.test(cssName))                           // ruta relativa (../ o ./)
            return new URL(cssName, this._cssPath + '/').href;  // resolver contra _cssPath, NO contra la página
        return `${this._cssPath}/${cssName}`;                   // nombre simple → comportamiento original
    }

    /**
     * Agrupa cambios síncronos y ejecuta la carga solo una vez por ciclo.
     */
    requestStyleLoad() {
        if (this._styleLoadPending) return;
        this._styleLoadPending = true;
        Promise.resolve().then(() => {
            this._styleLoadPending = false;
            this.loadLocalStyles();
        });
    }

    /**
     * Carga dinámicamente el CSS principal y los adicionales.
     * Espera a que todos carguen antes de hacer visible el componente.
     */
    async loadLocalStyles() {
        if (!this._cssPath) return;

        const root = this.shadowRoot || this;
        const filesToLoad = [];

        if (this.componentCssName) filesToLoad.push(this.componentCssName);
        if (this._extraCss.length > 0) filesToLoad.push(...this._extraCss);

        if (filesToLoad.length === 0) {
            this.style.removeProperty('visibility');
            this.style.setProperty('opacity', '1', 'important');
            return;
        }

        const loadPromises = filesToLoad.map(cssName => new Promise(resolve => {
            const hrefBase = this._resolveCssHref(cssName);
            const existing = root.querySelector(`link[href^="${hrefBase}"]`);
            if (existing) existing.remove();

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `${hrefBase}?v=${this._cssVersion}`;
            link.onload = () => resolve();
            link.onerror = () => {
                console.warn(`${this.tagName}: Falló la carga del CSS "${cssName}".`);
                resolve();
            };
            root.prepend(link);
        }));

        await Promise.all(loadPromises);

        this.style.removeProperty('visibility');
        this.style.setProperty('opacity', '1', 'important');

        if (typeof this.onStylesLoaded === 'function') {
            this.onStylesLoaded();
        }
    }

    // =========================================================================
    // EJECUCIÓN DE CALLBACKS
    // =========================================================================

    addClickButton(btn, url, callback, ...args) {
        if (callback || url) {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                if (callback)
                    this.safeExecute(callback, ...args);
                else
                    window.location.href = url;
            });
        }
    }

    /**
     * Ejecuta de forma segura un callback en el contexto adecuado.
     * Acepta una funcion (recomendado) o un string con una llamada simple a una
     * funcion que exista en el contexto: "miFuncion", "App.guardar" o
     * "miFuncion(1, 'texto')". El string se resuelve por nombre sobre
     * callerContext (o window) sin usar eval, lo que mantiene la compatibilidad
     * con paginas dentro de iframes (la funcion se busca en el window del
     * iframe asignado como callerContext) y con CSP sin 'unsafe-eval'.
     * NO se admite codigo JS arbitrario en el string.
     * @param {Function|string} callback - Funcion, o nombre/llamada de funcion del contexto.
     * @param {...any} args - Argumentos adicionales a pasar a la funcion.
     */
    safeExecute(callback, ...args) {
        if (!callback) return;
        try {
            const ctx = (this._callerContext && !this._callerContext.closed) ? this._callerContext : null;
            if (typeof callback === 'function') {
                return ctx ? callback.apply(ctx, args) : callback(...args);
            }
            if (typeof callback === 'string') {
                return this._executeNamedCallback(callback, ctx, args);
            }
        } catch (error) {
            console.error(`${this.tagName}: Error ejecutando callback`, error);
        }
    }

    /**
     * Resuelve y ejecuta un callback definido como string ("ruta.a.funcion" o
     * "ruta.a.funcion(args)") sobre el contexto indicado, sin eval.
     * Los argumentos dentro del string se parsean como DATOS (nunca codigo):
     * cadenas entre comillas simples o dobles (incluidas cadenas que contienen
     * JSON, p.ej. Fn('{"a":1}')), numeros, true/false/null/undefined y objetos
     * o arrays JSON. Si el string no lleva parentesis, se le pasan los args
     * recibidos por safeExecute. Ver _parseCallbackArgs.
     * @private
     * @param {string} code - Llamada simple a funcion del contexto.
     * @param {Window|null} ctx - Contexto de resolucion (callerContext o null).
     * @param {any[]} extraArgs - Argumentos de safeExecute.
     */
    _executeNamedCallback(code, ctx, extraArgs) {
        const clean = code.replace(/^javascript:\s*/i, '').replace(/;\s*$/, '').trim();
        const match = clean.match(/^([\w$]+(?:\.[\w$]+)*)\s*(?:\((.*)\))?$/s);
        if (!match) {
            console.error(`${this.tagName}: callback string no soportado. Solo se admite "funcion" o "ruta.funcion(literales)"; usa una funcion JS para logica compleja. Recibido:`, code);
            return;
        }

        let parsedArgs = extraArgs || [];
        if (match[2] !== undefined && match[2].trim() !== '') {
            parsedArgs = this._parseCallbackArgs(match[2]);
        }

        let target = ctx || window;
        let thisArg = target;
        for (const part of match[1].split('.')) {
            if (target === null || target === undefined) break;
            thisArg = target;
            target = target[part];
        }

        if (typeof target !== 'function') {
            console.error(`${this.tagName}: no existe la funcion "${match[1]}" en el contexto del callback (callerContext/window).`);
            return;
        }
        return target.apply(thisArg, parsedArgs);
    }

    /**
     * Parsea la lista de argumentos de un callback string en valores reales, sin eval.
     * Respeta las comillas (simples o dobles), por lo que admite cadenas que a su vez
     * contienen JSON (p.ej. Fn('{"a":1}')). Tipos: cadenas entrecomilladas, numeros,
     * true/false/null/undefined y objetos/arrays JSON. Lo no reconocido se deja como
     * cadena cruda. Nunca ejecuta codigo: solo produce datos.
     * @private
     * @param {string} argStr - Contenido entre los parentesis de la llamada.
     * @returns {any[]} Lista de argumentos parseados.
     */
    _parseCallbackArgs(argStr) {
        const args = [];
        const n = argStr.length;
        let i = 0;

        while (i < n) {
            // Saltar espacios en blanco y comas separadoras de nivel 0
            while (i < n && (/\s/.test(argStr[i]) || argStr[i] === ',')) i++;
            if (i >= n) break;

            const ch = argStr[i];

            if (ch === "'" || ch === '"') {
                // Cadena entrecomillada: el contenido se toma literal. Las comillas
                // del otro tipo (p.ej. las dobles de un JSON dentro de comillas
                // simples) se conservan. Soporta \\ como escape.
                const quote = ch;
                i++;
                let str = '';
                while (i < n) {
                    if (argStr[i] === '\\' && i + 1 < n) { str += argStr[i + 1]; i += 2; continue; }
                    if (argStr[i] === quote) { i++; break; }
                    str += argStr[i];
                    i++;
                }
                args.push(str);
            } else {
                // Token literal hasta la siguiente coma de nivel 0 (respeta {} y [])
                let token = '';
                let depth = 0;
                while (i < n) {
                    const c = argStr[i];
                    if (depth === 0 && c === ',') break;
                    if (c === '{' || c === '[') depth++;
                    else if (c === '}' || c === ']') depth--;
                    token += c;
                    i++;
                }
                token = token.trim();
                if (token === '') continue;
                if (token === 'true') args.push(true);
                else if (token === 'false') args.push(false);
                else if (token === 'null') args.push(null);
                else if (token === 'undefined') args.push(undefined);
                else if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)) args.push(Number(token));
                else {
                    // Objeto/array JSON u otro; si no parsea, se pasa como cadena cruda
                    try { args.push(JSON.parse(token)); }
                    catch (e) { args.push(token); }
                }
            }
        }
        return args;
    }
}

window.WidgetBase = WidgetBase;