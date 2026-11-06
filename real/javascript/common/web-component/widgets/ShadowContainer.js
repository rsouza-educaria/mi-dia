/**
 * Capsula Shadow DOM vacia. Sirve para aislar el contenido que se le inserte
 * (via la propiedad `content`) de los estilos del light DOM de la pagina, y
 * viceversa. No tiene estructura ni logica propia: es solo el shadow root.
 */
class ShadowContainer extends WidgetBase {
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
    }

    get componentCssName() {
        return 'internal-layout.css';
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.setProperty('display', 'block');
    }

    /**
     * Shadow root de la capsula. Permite insertar/consultar elementos desde
     * fuera sin que los estilos del light DOM interfieran:
     *   miContenedor.content.appendChild(elemento);
     *   miContenedor.content.querySelector('...');
     * @returns {ShadowRoot}
     */
    get content() {
        return this.shadow;
    }
}

if (!customElements.get('shadow-container')) customElements.define('shadow-container', ShadowContainer);
