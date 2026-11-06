class WCBaseElement extends HTMLElement {
    constructor() {
        super();
    }

    /**
     * Escapa un valor para poder interpolarlo de forma segura en innerHTML
     * (texto y valores de atributo entre comillas dobles). Previene XSS.
     * Uso en los _render(): const esc = WCBaseElement.escapeHtml;
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

    connectedCallback() {
        this.setAttribute("wc-educaria", "");
    }

    /**
     * Hook de tracking
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

    /**
     * Configura el componente de forma segura recibiendo un objeto de propiedades (JSON).
     * Mapea dinámicamente las claves del JSON a las propiedades públicas del componente.
     * @param {Object} config - Objeto con la configuración.
     */
    configure(config) {
        if (!config || typeof config !== 'object') return;

        Object.keys(config).forEach(key => {
            // --- Mapeo de la palabra reservada 'class' ---
            if (key === 'class') {
                this.setAttribute('class', config[key]);
                return; // Saltamos a la siguiente propiedad
            }

            // Ignorar privados y métodos
            if (!key.startsWith('_') && key in this && typeof this[key] !== 'function') {
                try {
                    // Seguridad defensiva 2: Intentar asignación
                    this[key] = config[key];
                } catch (error) {
                    // Si la propiedad es de solo lectura (como 'validationMessage' o 'validity')
                    // fallará silenciosamente sin romper la ejecución del componente.
                }
            }
        });
    }
}

window.WCBaseElement = WCBaseElement;