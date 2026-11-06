class WCIcon extends WCBaseElement {
    constructor() {
        super();
    }

    static get observedAttributes() {
        return ['name', 'svg', 'text', 'initials', 'size', 'shape', 'color-bg', 'icon-color', 'border-color', 'icon-original'];
    }

    /**
     * Calcula las iniciales (modo avatar) a partir de un texto: 2+ palabras = 1a letra de las
     * 2 primeras palabras; 1 palabra = sus 2 primeras letras. Sin acentos; mayusculas/minusculas como vengan.
     * @param {string} text
     * @returns {string}
     */
    static getInitials(text) {
        const words = String(text || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim().split(' ').filter(Boolean);
        if (!words.length) return '';
        const chars = words.length > 1
            ? [words[0][0], words[1][0]]
            : Array.from(words[0]).slice(0, 2);
        return chars.join('');
    }

    static get svgCatalog() {
        if (!this._svgCatalog) {
            this._svgCatalog = Object.create(null);
        }

        return this._svgCatalog;
    }

    static registerIcon(name, svg) {
        if (!name || !svg) return;
        this.svgCatalog[String(name)] = String(svg);
    }

    static getRegisteredIcon(name) {
        if (!name) return '';
        return this.svgCatalog[String(name)] || '';
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;
        if (name === 'color-bg' || name === 'icon-color' || name === 'border-color') {
            this._applyCustomColors();
            return;
        }
        this._render();
    }

    connectedCallback() {
        super.connectedCallback();
        this._render();
    }

    get name() { return this.getAttribute('name') || ''; }
    set name(v) { v ? this.setAttribute('name', v) : this.removeAttribute('name'); }

    get size() { return this.getAttribute('size') || 'md'; }
    set size(v) { this.setAttribute('size', v); }

    get shape() { return this.getAttribute('shape') || 'rounded'; }
    set shape(v) { this.setAttribute('shape', v); }

    get colorBg() { return this.getAttribute('color-bg') || 'transparent'; }
    set colorBg(v) { this.setAttribute('color-bg', v); }

    get iconColor() { return this.getAttribute('icon-color') || '#285A92'; }
    set iconColor(v) { this.setAttribute('icon-color', v); }

    get borderColor() { return this.getAttribute('border-color') || 'transparent'; }
    set borderColor(v) { this.setAttribute('border-color', v); }

    get iconOriginal() { return this.hasAttribute('icon-original'); }
    set iconOriginal(v) { v ? this.setAttribute('icon-original', '') : this.removeAttribute('icon-original'); }

    get svg() { return this.getAttribute('svg') || ''; }
    set svg(v) { v ? this.setAttribute('svg', v) : this.removeAttribute('svg'); }

    get text() { return this.getAttribute('text') || ''; }
    set text(v) { v ? this.setAttribute('text', v) : this.removeAttribute('text'); }

    get initials() { return this.getAttribute('initials') || ''; }
    set initials(v) { v ? this.setAttribute('initials', v) : this.removeAttribute('initials'); }

    _render() {
        const { name, size, shape } = this;
        const esc = WCBaseElement.escapeHtml;

        const svg = this.svg || WCIcon.getRegisteredIcon(name);

        // Modo avatar: solo si no hay icono (name/svg). initials (hasta 3 caracteres, literales) manda sobre text.
        if (!this.svg && !name) {
            const literal = Array.from(this.initials.trim()).slice(0, 3).join('');
            const avatar = literal || WCIcon.getInitials(this.text);
            if (avatar) {
                const full = this.text.trim() || literal;
                this.innerHTML = `<span class="wci-box wci-has-initials wci-size-${esc(size)} wci-shape-${esc(shape)}" role="img" aria-label="${esc(full)}"><span class="wci-initials" aria-hidden="true">${esc(avatar)}</span></span>`;
                this._applyCustomColors();
                return;
            }
        }

        const glyphClass = (!svg && name) ? ` ${esc(name)}` : '';
        this.innerHTML = `<span class="wci-box wci-size-${esc(size)} wci-shape-${esc(shape)}"><span class="wci-glyph${glyphClass}" aria-hidden="true"></span></span>`;

        if (svg) {
            const glyph = this.querySelector('.wci-glyph');
            if (glyph) {
                const dataUrl = 'data:image/svg+xml,' + encodeURIComponent(svg);
                glyph.style.setProperty('--wci-icon-url', `url("${dataUrl}")`);
            }
        }

        this._applyCustomColors();
    }

    _applyCustomColors() {
        const box = this.querySelector('.wci-box');
        if (!box) return;

        const colorBg = this.getAttribute('color-bg');
        const iconColor = this.getAttribute('icon-color');
        const borderColor = this.getAttribute('border-color');

        box.style.backgroundColor = colorBg || '';
        box.style.borderColor = borderColor || '';

        if (iconColor) {
            box.style.setProperty('--wci-color', iconColor);
        } else {
            box.style.removeProperty('--wci-color');
        }
    }
}

WCIcon.registerIcon('registro-horario', `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M10 2.28571C9.44772 2.28571 9 1.838 9 1.28571V1C9 0.447716 9.44772 0 10 0H15C15.5523 0 16 0.447715 16 1V1.28571C16 1.838 15.5523 2.28571 15 2.28571H10ZM11.3333 13.8571C11.3333 14.4094 11.781 14.8571 12.3333 14.8571H12.6667C13.219 14.8571 13.6667 14.4094 13.6667 13.8571V9C13.6667 8.44771 13.219 8 12.6667 8H12.3333C11.781 8 11.3333 8.44772 11.3333 9V13.8571ZM8.43125 23.1857C7.15764 22.6429 6.04444 21.9048 5.09167 20.9714C4.13889 20.0381 3.38542 18.9476 2.83125 17.7C2.27708 16.4524 2 15.1238 2 13.7143C2 12.3048 2.27708 10.9762 2.83125 9.72857C3.38542 8.48095 4.13889 7.39048 5.09167 6.45714C6.04444 5.52381 7.15764 4.78571 8.43125 4.24286C9.70486 3.7 11.0611 3.42857 12.5 3.42857C13.7056 3.42857 14.8625 3.61905 15.9708 4C17.0792 4.38095 18.1194 4.93333 19.0917 5.65714L20.0252 4.74264C20.414 4.36179 21.036 4.36179 21.4248 4.74264L21.6291 4.94278C22.0294 5.33491 22.0294 5.97938 21.6291 6.3715L20.725 7.25714C21.4639 8.20952 22.0278 9.22857 22.4167 10.3143C22.8056 11.4 23 12.5333 23 13.7143C23 15.1238 22.7229 16.4524 22.1688 17.7C21.6146 18.9476 20.8611 20.0381 19.9083 20.9714C18.9556 21.9048 17.8424 22.6429 16.5688 23.1857C15.2951 23.7286 13.9389 24 12.5 24C11.0611 24 9.70486 23.7286 8.43125 23.1857ZM18.275 19.3714C19.8694 17.8095 20.6667 15.9238 20.6667 13.7143C20.6667 11.5048 19.8694 9.61905 18.275 8.05714C16.6806 6.49524 14.7556 5.71429 12.5 5.71429C10.2444 5.71429 8.31944 6.49524 6.725 8.05714C5.13056 9.61905 4.33333 11.5048 4.33333 13.7143C4.33333 15.9238 5.13056 17.8095 6.725 19.3714C8.31944 20.9333 10.2444 21.7143 12.5 21.7143C14.7556 21.7143 16.6806 20.9333 18.275 19.3714Z" fill="currentColor"/>
</svg>
`);

if (!customElements.get('wc-icon')) customElements.define('wc-icon', WCIcon);