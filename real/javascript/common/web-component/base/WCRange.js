class WCRange extends WCBaseElement {
    static formAssociated = true;

    constructor() {
        super();
        this._internals = this.attachInternals();
        this._els = {};
        this._isDragging = false;
        // Propiedades internas como fuente de verdad (patrón Shoelace/Lit)
        this._value = null;  // null = no inicializado
        this._min = 0;
        this._max = 100;
        this._step = 1;
    }

    static get observedAttributes() {
        return [
            'min', 'max', 'value', 'step', 'disabled', 'name', 'id',
            'show-marker', 'marker-position', 'marker-format', 'marker-visible'
        ];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;
        
        // Sincronizar atributos a propiedades internas
        if (name === 'min' && newVal !== null) {
            this._min = parseFloat(newVal) || 0;
        } else if (name === 'max' && newVal !== null) {
            this._max = parseFloat(newVal) || 100;
        } else if (name === 'step' && newVal !== null) {
            this._step = parseFloat(newVal) || 1;
        } else if (name === 'value' && newVal !== null) {
            this._value = parseFloat(newVal);
        }
        
        if (!this._els.input) return;
        if (name === 'id' && newVal === null) return;
        this._syncToNative();
        this._updateMarker();
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this._els.input) {
            this._render();
        }
    }

    disconnectedCallback() {
        if (this._els.input) {
            this._els.input.removeEventListener('input', this._onInput);
            this._els.input.removeEventListener('change', this._onChange);
            this._els.input.removeEventListener('mousedown', this._onMouseDown);
            this._els.input.removeEventListener('mouseup', this._onMouseUp);
        }
    }
    
    
    get min() { return this._min; }
    set min(val) { 
        this._min = parseFloat(val) || 0;
        this.setAttribute('min', this._min);
        if (this._els.input) this._syncToNative();
    }

    get max() { return this._max; }
    set max(val) { 
        this._max = parseFloat(val) || 100;
        this.setAttribute('max', this._max);
        if (this._els.input) this._syncToNative();
    }

    get value() { 
        // Si no hay valor inicializado, usar min
        return this._value !== null ? this._value : this._min;
    }
    set value(val) {
        this._value = parseFloat(val);
        if (isNaN(this._value)) this._value = this._min;
        this.setAttribute('value', this._value);
        
        if (this._els.input) {
            this._els.input.value = this._value;
            this._updateMarker();
        }
        this._internals.setFormValue(String(this._value));
        this._updateValidity();
    }

    get step() { return this._step; }
    set step(val) { 
        this._step = parseFloat(val) || 1;
        this.setAttribute('step', this._step);
        if (this._els.input) this._syncToNative();
    }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(val) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    get name() { return this.getAttribute('name') || ''; }
    set name(val) { this.setAttribute('name', val); }

    get showMarker() { return this.hasAttribute('show-marker'); }
    set showMarker(val) {
        if (val) this.setAttribute('show-marker', '');
        else this.removeAttribute('show-marker');
    }

    get markerPosition() { return this.getAttribute('marker-position') || 'top'; }
    set markerPosition(val) { this.setAttribute('marker-position', val); }

    get markerFormat() { return this.getAttribute('marker-format') || '{value}'; }
    set markerFormat(val) { this.setAttribute('marker-format', val); }

    get markerVisible() { return this.getAttribute('marker-visible') || 'always'; }
    set markerVisible(val) { this.setAttribute('marker-visible', val); }

    get validity() { return this._els.input?.validity; }
    get validationMessage() { return this._els.input?.validationMessage || ''; }

    checkValidity() { return this._els.input?.checkValidity() ?? true; }
    reportValidity() { return this._els.input?.reportValidity() ?? true; }

    _render() {
        const position = this.markerPosition;
        const visibleMode = this.markerVisible;

        // Crear estructura HTML SIN value - se asigna programáticamente después
        this.innerHTML = `
            <div class="wcr-wrapper wcr-marker-${position} wcr-marker-${visibleMode}">
                <span class="wcr-marker" style="display: none;"></span>
                <input 
                    type="range" 
                    class="wcr-native-input"
                    ${this.disabled ? 'disabled' : ''}
                >
            </div>
        `;

        this._els.wrapper = this.querySelector('.wcr-wrapper');
        this._els.input = this.querySelector('.wcr-native-input');
        this._els.marker = this.querySelector('.wcr-marker');

        if (this.hasAttribute('id')) {
            const id = this.getAttribute('id');
            this._els.input.id = id;
            this.removeAttribute('id');
        }

        if (this.hasAttribute('name')) {
            this._els.input.setAttribute('name', this.getAttribute('name'));
        }

        this._bindEvents();
        
        // CRÍTICO: Establecer min/max PRIMERO, luego value        
        this._syncToNative();
        
        this._updateMarker();
        this._internals.setFormValue(String(this.value));
        
        // Recalcular posición del marcador después del layout completo        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._updateMarker();
            });
        });
    }
    
    // Sincroniza propiedades internas al input nativo en el orden correcto
    _syncToNative() {
        const inp = this._els.input;
        if (!inp) return;
        
        // 1. Establecer min y max PRIMERO
        inp.min = this._min;
        inp.max = this._max;
        inp.step = this._step;
        inp.disabled = this.disabled;
        
        // 2. DESPUÉS establecer value (ya con min/max aplicados, no se clampea mal)
        const val = this._value !== null ? this._value : this._min;
        inp.value = val;
        
        this._updateValidity();
    }

    _bindEvents() {
        const inp = this._els.input;

        this._onInput = (e) => {
            e.stopPropagation();
            // Actualizar propiedad interna y atributo
            this._value = parseFloat(inp.value);
            this.setAttribute('value', this._value);
            this._internals.setFormValue(String(this._value));
            this._updateValidity();
            this._updateMarker();
            this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        };

        this._onChange = (e) => {
            e.stopPropagation();
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        };

        this._onMouseDown = () => {
            this._isDragging = true;
            if (this._els.wrapper) {
                this._els.wrapper.classList.add('wcr-dragging');
            }
        };

        this._onMouseUp = () => {
            this._isDragging = false;
            if (this._els.wrapper) {
                this._els.wrapper.classList.remove('wcr-dragging');
            }
        };

        inp.addEventListener('input', this._onInput);
        inp.addEventListener('change', this._onChange);
        inp.addEventListener('mousedown', this._onMouseDown);
        inp.addEventListener('mouseup', this._onMouseUp);
    }

    _updateValidity() {
        const inp = this._els.input;
        if (!inp) return;
        this._internals.setValidity(inp.validity, inp.validationMessage, inp);
    }

    _updateMarker() {
        if (!this._els.marker) return;

        const showMarker = this.showMarker;
        const position = this.markerPosition;
        const format = this.markerFormat;
        const value = this.value;
        const min = this.min;
        const max = this.max;

        if (!showMarker) {
            this._els.marker.style.display = 'none';
            return;
        }

        this._els.marker.style.display = 'block';

        const formattedValue = this._formatValue(value, format);
        this._els.marker.textContent = formattedValue;

        // Calcular porcentaje normalizado
        const percentage = ((value - min) / (max - min)) * 100;
        
        // Ajustar el porcentaje para compensar el ancho del thumb
        const thumbWidth = 18; // Debe coincidir con --wcr-thumb-size en CSS
        const trackWidth = this._els.input?.offsetWidth || 0;
        
        let adjustedPosition = percentage;
        if (trackWidth > 0) {
            // Compensar el desplazamiento del thumb en los extremos
            const offset = (thumbWidth / 2 / trackWidth) * 100;
            adjustedPosition = offset + (percentage * (100 - 2 * offset) / 100);
        }

        this._els.wrapper.className = `wcr-wrapper wcr-marker-${position} wcr-marker-${this.markerVisible}`;

        if (position === 'top' || position === 'bottom') {
            this._els.marker.style.left = `${adjustedPosition}%`;
            this._els.marker.style.top = '';
            this._els.marker.style.right = '';
        } else if (position === 'left' || position === 'right') {
            this._els.marker.style.top = '50%';
            this._els.marker.style.left = '';
            this._els.marker.style.right = '';
        }
    }

    _formatValue(value, format) {
        const locale = navigator.language || 'es-ES';

        let decimals = 0;
        const stepStr = String(this.step);
        if (stepStr.includes('.')) {
            decimals = stepStr.split('.')[1].length;
        }

        const formattedNumber = Number(value).toLocaleString(locale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });

        return format.replace('{value}', formattedNumber);
    }
}

if (!customElements.get('wc-range')) customElements.define('wc-range', WCRange);