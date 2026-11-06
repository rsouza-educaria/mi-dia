class TreeList extends WidgetBase {
    /**
     * Icono por defecto de cada estado vacío, usado cuando el consumidor no fija `noDataIcon`/
     * `noResultsIcon` explícitamente (ver esos getters). colorBg debe ir envuelto en `var(...)` —
     * WCIcon lo asigna tal cual a `box.style.backgroundColor`, y un nombre de variable CSS suelto
     * (sin `var()`) es un valor inválido para esa propiedad: el navegador lo descarta en silencio,
     * sin error visible (la causa real de que "no aplique" el color de fondo).
     */
    static DEFAULT_NO_DATA = { name: 'sin_datos', shape: 'circle', iconColor: 'var(--color-grey-600)', colorBg: 'var(--color-grey-300)', borderColor: 'transparent' };
    static DEFAULT_SIN_RESULTADOS = { name: 'sin_resultados', shape: 'circle', iconColor: 'var(--color-grey-600)', colorBg: 'var(--color-grey-300)', borderColor: 'transparent' };

    /**
     * Normaliza el valor recibido por `noDataIcon`/`noResultsIcon` al formato interno que espera
     * `_renderEmptyState`: string = nombre del catálogo wc-icon, objeto (con `name` o `svg`) tal
     * cual, cualquier otra cosa (incluido `null`) = opt-out explícito (sin ícono). Compartida por
     * ambas propiedades para no duplicar esta regla si en el futuro se agrega un tercer estado
     * vacío con ícono configurable.
     * @private
     */
    static _normalizeEmptyIconConfig(val) {
        if (typeof val === 'string') return { name: val };
        if (typeof val === 'object' && val !== null) return val;
        return null;
    }

    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });

        this._rawData = [];
        this._nodeMap = new Map();
        this._nodeElCache = new Map();
        this._expandedIds = new Set();
        this._selectedIds = new Set();
        this._indeterminateIds = new Set();
        this._currentSearch = '';
        this._preSearchExpandedIds = null;
        this._matchedIds = new Set();

        // Debounce del buscador (evita filtrar en cada pulsacion)
        this._searchDebounceTimer = null;

        // Paginacion por scroll infinito (nodos raiz)
        this._renderedRootCount = 50; // se sobreescribe con pageSize en cada set data / filter
        this._io = null;              // IntersectionObserver del centinela

        this._handleDocumentClick = this._handleDocumentClick.bind(this);
        this._handleTreeKeydown = this._handleTreeKeydown.bind(this);

        // Accesibilidad: id del treeitem actualmente tabulable (roving tabindex)
        this._focusedId = null;

        // Drag & drop (Fase 3): _pendingDrag existe entre el pointerdown y el umbral de
        // movimiento superado (todavia podria ser un simple click/tap); _dragState solo existe
        // durante un arrastre YA confirmado. Nunca coexisten los dos a la vez.
        this._pendingDrag = null;
        this._dragState = null;

        // Icono de cada estado vacío, independiente entre sí: undefined = sin customizar (el
        // getter cae al DEFAULT_* correspondiente); null = opt-out explícito (sin ícono, ver
        // _renderEmptyState); objeto/string = personalizado. undefined y null se distinguen a
        // propósito, no colapsar.
        this._noDataIconConfig = undefined;
        this._noResultsIconConfig = undefined;

        this.icons = {
            chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
            chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
            more: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`,
            dragHandle: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"></circle><circle cx="9" cy="12" r="1.5"></circle><circle cx="9" cy="18" r="1.5"></circle><circle cx="15" cy="6" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="15" cy="18" r="1.5"></circle></svg>`
        };
    }

    get componentCssName() { return 'tree-list.css'; }

    static get observedAttributes() {
        // noDataIcon/noResultsIcon son solo-JS (como canDrop): su valor puede ser un objeto ({svg}
        // o {name, colorBg, ...}), que no tiene una representacion razonable como atributo HTML.
        return [...super.observedAttributes, 'searchable', 'show-select-all', 'height', 'max-height', 'borderless', 'empty-text', 'buttons-on-focus', 'page-size', 'disable-pagination', 'sortable', 'sortable-scope', 'drag-anywhere'];
    }

    connectedCallback() {
        super.connectedCallback();

        if (this.hasAttribute('height')) {
            this.style.height = this.getAttribute('height');
        }

        if (this.hasAttribute('max-height')) {
            this.style.maxHeight = this.getAttribute('max-height');
        }

        if (!this._isInitialized) {
            this._renderSkeleton();
            this._renderTree();
            this._syncDOMSelection();
            this._isInitialized = true;
        } else if (!this.disablePagination) {
            // Reconexion (p.ej. right-sidebar navigate/goBack): disconnectedCallback desconecto el
            // IntersectionObserver del centinela; sin re-observarlo la paginacion queda muerta.
            this._updateSentinel();
        }

        document.addEventListener('click', this._handleDocumentClick);
    }

    disconnectedCallback() {
        document.removeEventListener('click', this._handleDocumentClick);
        clearTimeout(this._searchDebounceTimer);
        this._io?.disconnect();
        // Un arrastre en marcha (o a punto de confirmarse) deja listeners en document: si el
        // tree-list se desconecta a mitad de gesto (p.ej. cerrado en un right-sidebar), hay que
        // limpiarlos para no dejarlos huerfanos escuchando indefinidamente.
        this._cancelPendingDrag();
        this._teardownActiveDrag();
        if (super.disconnectedCallback) super.disconnectedCallback();
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (super.attributeChangedCallback) super.attributeChangedCallback(name, oldVal, newVal);
        if (oldVal === newVal) return;

        if (['searchable', 'show-select-all', 'sortable', 'sortable-scope', 'drag-anywhere'].includes(name)) {
            if (this._els?.root) {
                this._renderSkeleton();
                this._renderTree();
                this._syncDOMSelection();
            }
        }

        if (name === 'height') {
            this.style.height = newVal;
        }

        if (name === 'max-height') {
            this.style.maxHeight = newVal;
        }
    }

    // ==========================================
    // API PÚBLICA — GETTERS / SETTERS
    // ==========================================

    get multiselect() { return this.hasAttribute('multiselect'); }
    set multiselect(val) {
        if (val) this.setAttribute('multiselect', val);
        else this.removeAttribute('multiselect');
    }

    get searchable() { return this.hasAttribute('searchable'); }
    set searchable(val) {
        if (val) this.setAttribute('searchable', val);
        else this.removeAttribute('searchable');
    }

    get showSelectAll() { return this.hasAttribute('show-select-all'); }
    set showSelectAll(val) {
        if (val) this.setAttribute('show-select-all', '');
        else this.removeAttribute('show-select-all');
    }

    get defaultSelectable() { return this.getAttribute('default-selectable'); }
    set defaultSelectable(val) {
        if (val) this.setAttribute('default-selectable', val);
        else this.removeAttribute('default-selectable');
    }

    // Default a nivel de componente: oculta la flecha en todos los nodos que no digan lo
    // contrario. node.hideExpander (explicito true/false) siempre manda sobre este default.
    get hideExpander() { return this.hasAttribute('hide-expander'); }
    set hideExpander(val) {
        if (val) this.setAttribute('hide-expander', '');
        else this.removeAttribute('hide-expander');
    }

    // Al expandir un nodo, colapsa automaticamente sus demas hermanos (mismo _parentId) — ver
    // _toggleExpand. No afecta a ancestros/descendientes, solo a nodos del mismo nivel.
    get accordion() { return this.hasAttribute('accordion'); }
    set accordion(val) {
        if (val) this.setAttribute('accordion', '');
        else this.removeAttribute('accordion');
    }

    get height() { return this.getAttribute('height'); }
    set height(val) {
        if (val) this.setAttribute('height', val);
        else this.removeAttribute('height');
    }

    get maxHeight() { return this.getAttribute('max-height'); }
    set maxHeight(val) {
        if (val) this.setAttribute('max-height', val);
        else this.removeAttribute('max-height');
    }

    get nodeHeight() { return this.getAttribute('node-height'); }
    set nodeHeight(val) {
        if (val) this.setAttribute('node-height', val);
        else this.removeAttribute('node-height');
    }

    get borderless() { return this.hasAttribute('borderless'); }
    set borderless(val) {
        if (val) this.setAttribute('borderless', val);
        else this.removeAttribute('borderless');
    }

    get emptyText() { return this.getAttribute('empty-text') || Traduccion.NO_HAY_DATOS_A_MOSTRAR; }
    set emptyText(val) {
        if (val) this.setAttribute('empty-text', val);
        else this.removeAttribute('empty-text');
    }

    // Icono del estado "sin data" (tree.data vacío). Ver TreeList._normalizeEmptyIconConfig.
    get noDataIcon() { return this._noDataIconConfig === undefined ? TreeList.DEFAULT_NO_DATA : this._noDataIconConfig; }
    set noDataIcon(val) { this._noDataIconConfig = TreeList._normalizeEmptyIconConfig(val); }

    // Icono del estado "búsqueda sin coincidencias". Independiente de noDataIcon — cada uno se
    // customiza y cae a su propio default por separado.
    get noResultsIcon() { return this._noResultsIconConfig === undefined ? TreeList.DEFAULT_SIN_RESULTADOS : this._noResultsIconConfig; }
    set noResultsIcon(val) { this._noResultsIconConfig = TreeList._normalizeEmptyIconConfig(val); }

    get buttonsOnFocus() { return this.hasAttribute('buttons-on-focus'); }
    set buttonsOnFocus(val) {
        if (val) this.setAttribute('buttons-on-focus', '');
        else this.removeAttribute('buttons-on-focus');
    }

    get pageSize() {
        const raw = parseInt(this.getAttribute('page-size'), 10);
        return Number.isFinite(raw) && raw > 0 ? raw : 50;
    }
    set pageSize(val) {
        if (val == null) this.removeAttribute('page-size');
        else this.setAttribute('page-size', String(val));
    }

    get disablePagination() { return this.hasAttribute('disable-pagination'); }
    set disablePagination(val) {
        if (val) this.setAttribute('disable-pagination', '');
        else this.removeAttribute('disable-pagination');
    }

    // Drag & drop (Fase 3)
    get sortable() { return this.hasAttribute('sortable'); }
    set sortable(val) {
        if (val) this.setAttribute('sortable', '');
        else this.removeAttribute('sortable');
    }

    // 'tree' (por defecto): el arrastre puede cambiar de grupo (a otro padre o a la raiz).
    // 'siblings': solo reordena dentro del mismo padre que el nodo arrastrado.
    get sortableScope() { return this.getAttribute('sortable-scope') || 'tree'; }
    set sortableScope(val) {
        if (val) this.setAttribute('sortable-scope', val);
        else this.removeAttribute('sortable-scope');
    }

    // Por defecto solo se arrastra desde el asa dedicada; con este atributo, desde toda la fila.
    get dragAnywhere() { return this.hasAttribute('drag-anywhere'); }
    set dragAnywhere(val) {
        if (val) this.setAttribute('drag-anywhere', '');
        else this.removeAttribute('drag-anywhere');
    }

    // Con este atributo, la raiz solo admite nodos declarados como contenedor (con `children`,
    // aunque este vacio) — un item suelto (sin `children`) nunca puede acabar como nodo de nivel
    // raiz, ni arrastrandolo ahi, ni desindentandolo (Ctrl+flecha izquierda) fuera de su grupo
    // hasta el nivel superior, ni con moveNode() (regla ESTRUCTURAL, como acceptsDrop). Reordenar
    // un nodo que YA esta en la raiz entre sus hermanos sigue funcionando igual.
    get rootContainersOnly() { return this.hasAttribute('root-containers-only'); }
    set rootContainersOnly(val) {
        if (val) this.setAttribute('root-containers-only', '');
        else this.removeAttribute('root-containers-only');
    }

    /**
     * Callback de veto para el arrastre interactivo: `({node, targetNode, position,
     * targetParentId}) => boolean`. Devolver `false` rechaza ese destino concreto (se ve como
     * "no permitido" mientras se arrastra). No se llama desde moveNode()/getStructure() (API
     * directa: se asume que el consumidor ya decidio), solo durante el arrastre con puntero.
     * @type {Function|null}
     */
    get canDrop() { return this._canDrop || null; }
    set canDrop(fn) { this._canDrop = typeof fn === 'function' ? fn : null; }

    get data() { return this._rawData; }
    set data(jsonArray) {
        this._rawData = Array.isArray(jsonArray) ? jsonArray : [];
        this._renderedRootCount = this.pageSize;
        this._indexData();
        this._renderTree();
    }

    /**
     * Actualiza los datos de un nodo existente y re-renderiza solo esa fila (sin recrear el
     * resto del arbol). Pensado para reflejar cambios producidos fuera del tree-list (p.ej. una
     * accion realizada desde una mini ficha abierta al hacer click en la fila) sin necesidad de
     * volver a pedir todo el listado al servidor. Funciona igual si el tree-list esta desconectado
     * del documento (p.ej. aparcado en el historial de un right-sidebar tras un navigate()).
     * @param {string|number} id - Identificador del nodo (node.id).
     * @param {Object} patch - Propiedades a fusionar sobre el nodo (title, subtitle, rightTitle,
     *   rightSubtitle, image, icon, buttons, rowClass, onClick, data, searchFields, content, ...).
     * @returns {boolean} true si el nodo existia y se actualizo; false si no se encontro el id.
     */
    updateNode(id, patch) {
        const node = this._nodeMap.get(id);
        if (!node) return false;

        Object.assign(node, patch);

        // Si el patch le quita los children/content, el nodo deja de ser expandible: ya no tiene
        // sentido conservarlo marcado como "expandido" (si mas tarde se le vuelven a añadir hijos,
        // arrancaria expandido sin que el usuario lo pidiera).
        if (!this._nodeIsExpandable(node)) {
            this._expandedIds.delete(id);
        }
        // El patch puede haber añadido o quitado los unicos children/content de SU grupo de
        // hermanos (no del arbol completo): resincronizamos solo ese contenedor, que refleja al
        // instante via CSS a todas las filas hermanas ya renderizadas, sin recrearlas.
        const parentNode = node._parentId != null ? this._nodeMap.get(node._parentId) : null;
        const siblingGroup = parentNode ? parentNode.children : this._rawData;
        const groupContainer = parentNode
            ? this._nodeElById(parentNode.id)?.querySelector(':scope > .wctl-children-container')
            : this._els.root;
        this._syncGroupExpandableClass(groupContainer, siblingGroup);

        const oldEl = this._nodeElById(id);
        if (!oldEl) return true; // Dato ya actualizado; se pintara correctamente en el proximo render.

        this._recreateOwnRow(node, oldEl);
        this._applyRoving();
        return true;
    }

    /**
     * Crea la fila nueva de `node` (via _createNodeElement) y le traslada los hijos/content YA
     * renderizados de `oldEl`, sin perder su estado (p.ej. un dynamic-form anidado con datos ya
     * escritos), preservandolos solo si el nodo SIGUE teniendo children/content tras el cambio
     * (si los perdio, no hay nada valido que conservar). Sustituye `oldEl` por la fila nueva en
     * el DOM.
     *
     * Compartido por updateNode() (cambia datos de un nodo) y por el movimiento drag & drop
     * (Fase 2: un padre puede pasar de hoja a expandible, o al reves, al entrar/salir su ultimo
     * hijo de otro grupo).
     * @param {Object} node
     * @param {HTMLElement} oldEl
     * @returns {HTMLElement} la fila nueva, ya insertada en el DOM en el lugar de oldEl.
     * @private
     */
    _recreateOwnRow(node, oldEl) {
        const newEl = this._createNodeElement(node);

        if (this._nodeHasChildren(node)) {
            const oldChildren = oldEl.querySelector(':scope > .wctl-children-container');
            const newChildren = newEl.querySelector(':scope > .wctl-children-container');
            if (oldChildren && newChildren && oldChildren.childNodes.length) {
                newChildren.append(...oldChildren.childNodes);
            }
        }

        if (this._nodeHasContent(node)) {
            const oldContent = oldEl.querySelector(':scope > .wctl-content-panel');
            const newContent = newEl.querySelector(':scope > .wctl-content-panel');
            if (oldContent && newContent && oldContent.childNodes.length) {
                newContent.append(...oldContent.childNodes);
            }
        }

        oldEl.replaceWith(newEl);
        return newEl;
    }

    /**
     * Devuelve el <button-bar> ya renderizado de la fila de un nodo, para que el llamador pueda usar
     * su API pública (p.ej. `getButton(id)`) y modificar UN botón concreto sobre el elemento vivo, sin
     * pasar por `updateNode({buttons: [...]})` (que recrea la fila entera: imagen, título, todos los
     * botones y el placeholder de contenido).
     * @param {string|number} id - Identificador del nodo (node.id).
     * @returns {HTMLElement|null} El elemento <button-bar>, o null si el nodo no existe, no tiene
     *   botones o su fila todavía no se ha renderizado.
     */
    getButtonsNode(id) {
        const nodeEl = this._nodeElById(id);
        return nodeEl?.querySelector(':scope > .wctl-row .wctl-btn-bar > button-bar') || null;
    }

    get value() { return Array.from(this._selectedIds); }
    set value(idsArray) {
        if (!Array.isArray(idsArray)) return;
        this._selectedIds.clear();
        this._indeterminateIds.clear();

        let idsToApply = idsArray;

        if (!this.multiselect) {
            // Buscamos de forma preventiva el primer ID que sea un nodo hoja válido
            const validId = idsArray.find(id => {
                const node = this._nodeMap.get(id);
                return node && (!node.children || node.children.length === 0);
            });
            idsToApply = validId ? [validId] : [];
        }

        idsToApply.forEach(id => this._selectedIds.add(id));

        if (this.multiselect) this._recalculateBottomUp();
        this._syncDOMSelection();
    }

    // ==========================================
    // MOTOR DE DATOS E INDEXACIÓN
    // ==========================================

    _indexData() {
        this._nodeMap.clear();
        this._expandedIds.clear();
        this._selectedIds.clear();

        let autoIdCounter = 0;

        const traverse = (nodes, parentId = null, level = 0) => {
            nodes.forEach(node => {
                if (node.id == null || node.id === '') {
                    node.id = `wctl-auto-id-${autoIdCounter++}`;
                }
                node._parentId = parentId;
                node._level = level;
                this._nodeMap.set(node.id, node);

                if (node.content && node.children?.length) {
                    console.warn(`[TreeList] Aviso: El nodo ${node.id} define 'content' y 'children' a la vez (son excluyentes). Prevalece 'content'; se ignoran los 'children'.`);
                }

                if (node.expanded) this._expandedIds.add(node.id);
                if (node.selected) {
                    if (!this.multiselect) {
                        const isParent = this._nodeHasChildren(node) || this._nodeHasContent(node);
                        if (isParent) {
                            console.warn(`[TreeList] Aviso: El nodo padre ${node.id} está marcado como 'selected', pero en Single Select solo se permiten hojas. Ignorado.`);
                        } else if (this._selectedIds.size >= 1) {
                            console.warn(`[TreeList] Aviso: Múltiples nodos hoja marcados como 'selected'. Ignorando el nodo ${node.id}.`);
                        } else {
                            this._selectedIds.add(node.id);
                        }
                    } else {
                        this._selectedIds.add(node.id);
                    }
                }

                if (this._nodeHasChildren(node)) traverse(node.children, node.id, level + 1);
            });
        };

        traverse(this._rawData);

        if (this.multiselect) {
            this._recalculateBottomUp();
        }
    }

    /**
     * Sincroniza en `containerEl` (la raíz del árbol o el `.wctl-children-container` de un padre
     * concreto) si ALGUNO de sus hermanos directos (`nodes`) es expandible, mediante una clase
     * (`has-expandable`) leída por CSS. La granularidad es por grupo de hermanos, no por árbol
     * completo: los hijos de un nodo pueden ser todos hojas (sin reservar hueco de flecha) aunque
     * el nivel raíz sí tenga nodos expandibles, y viceversa. Al ser CSS, un solo cambio de clase
     * actualiza al instante todas las filas de ese grupo ya renderizadas, sin recrearlas.
     * @param {HTMLElement|null} containerEl
     * @param {Object[]} nodes - Hermanos directos (this._rawData, o node.children de un padre).
     * @private
     */
    _syncGroupExpandableClass(containerEl, nodes) {
        if (!containerEl) return;
        const hasExpandable = (nodes || []).some(n => this._nodeHasChildren(n) || this._nodeHasContent(n));
        containerEl.classList.toggle('has-expandable', hasExpandable);
    }

    // ==========================================
    // DRAG & DROP — MOTOR DE DATOS (Fase 1)
    //
    // Operaciones estructurales puras sobre _rawData/_nodeMap: no tocan el DOM ni disparan
    // eventos (eso lo hace la interaccion de arrastre, Fase 3, y la reubicacion en pantalla,
    // Fase 2). moveNode() es tambien el camino usado para deshacer un movimiento de arrastre
    // si el consumidor rechaza el cambio (p.ej. el guardado en servidor falla).
    // ==========================================

    /**
     * Array de hermanos directos de un padre (o la raiz si parentId es null/undefined).
     * @param {string|number|null} parentId
     * @returns {Object[]|null} null si el padre no existe o no puede tener children (tiene
     *   'content', que es excluyente). Si el padre existe y no tenia children (nodo hoja),
     *   se le crea el array vacio (pasa a ser expandible en cuanto reciba el primer hijo).
     * @private
     */
    _findSiblingArray(parentId) {
        if (parentId == null) return this._rawData;
        const parent = this._nodeMap.get(parentId);
        if (!parent) return null;
        if (this._nodeHasContent(parent)) return null;
        if (!Array.isArray(parent.children)) parent.children = [];
        return parent.children;
    }

    /**
     * true si `maybeDescendantId` es el propio `ancestorId` o esta dentro de su subarbol.
     * Se usa para impedir mover un nodo dentro de si mismo o de uno de sus descendientes (ciclo).
     * @private
     */
    _isSameOrDescendant(ancestorId, maybeDescendantId) {
        if (ancestorId === maybeDescendantId) return true;
        let current = this._nodeMap.get(maybeDescendantId);
        while (current && current._parentId != null) {
            if (current._parentId === ancestorId) return true;
            current = this._nodeMap.get(current._parentId);
        }
        return false;
    }

    /**
     * true si el nodo declara `children` EXPLICITAMENTE (aunque el array este vacio — p.ej. una
     * carpeta que todavia no tiene elementos dentro), a diferencia de `_nodeHasChildren`, que
     * exige ADEMAS que el array tenga al menos un elemento. El consumidor ya expreso su intencion
     * de "esto es un contenedor" con solo poner la clave `children` (aunque sea `[]`); que este
     * vacio en este momento no lo convierte en ambiguo. Excluyente con `content`, igual criterio
     * que `_nodeHasChildren`.
     * @private
     */
    _nodeIsDeclaredContainer(node) {
        return !node?.content && Array.isArray(node?.children);
    }

    /**
     * Si un nodo puede recibir hijos por drop (arrastre, `Ctrl+flecha` para indentar, o
     * `moveNode()`). Default INTELIGENTE: un nodo declarado como contenedor (`_nodeIsDeclaredContainer`
     * — tiene `children`, aunque este vacio) acepta por defecto; un nodo sin `children` en
     * absoluto (ambiguo: ¿hoja, o carpeta que aun no se ha cargado?) no acepta por defecto —
     * soltar algo dentro no deberia convertirlo en padre sin que el consumidor lo pida
     * explicitamente. `node.acceptsDrop` (`true`/`false` explicito) manda siempre sobre este
     * default, en ambos sentidos.
     * @private
     */
    _nodeAcceptsDrop(node) {
        if (node.acceptsDrop === true) return true;
        if (node.acceptsDrop === false) return false;
        return this._nodeIsDeclaredContainer(node);
    }

    /**
     * Valida si `node` puede ENTRAR en `targetParentId` como un padre nuevo (solo tiene sentido
     * llamarla cuando el movimiento realmente cambia de padre — no para un reordenar dentro del
     * mismo grupo que el nodo ya tiene, que siempre es valido). Reglas ESTRUCTURALES compartidas
     * por `_applyMove` (API directa) y la validacion del arrastre interactivo
     * (`_isValidDropTarget`/`_handleKeyboardMove`):
     * - No puede ser el propio nodo ni un descendiente suyo (ciclo).
     * - Si el destino NO es la raiz: debe existir, no tener `content`, y admitir drop
     *   (`_nodeAcceptsDrop`).
     * - Si el destino ES la raiz: solo se rechaza si `rootContainersOnly` esta activo Y `node` no
     *   es el mismo un contenedor declarado (`_nodeIsDeclaredContainer`) — con ese atributo, la
     *   raiz pasa a admitir solo grupos; un item suelto nunca puede acabar en el nivel superior.
     * @private
     */
    _canNodeEnterParent(node, targetParentId) {
        if (targetParentId != null) {
            if (this._isSameOrDescendant(node.id, targetParentId)) return false;
            const targetParentNode = this._nodeMap.get(targetParentId);
            if (!targetParentNode || this._nodeHasContent(targetParentNode) || !this._nodeAcceptsDrop(targetParentNode)) return false;
        } else if (this.rootContainersOnly && !this._nodeIsDeclaredContainer(node)) {
            return false;
        }
        return true;
    }

    /**
     * Aplica `delta` a `_level` de un nodo y, en cascada, a todo su subarbol (sus descendientes
     * no cambian de padre directo, solo de profundidad, al haberse movido un antepasado suyo).
     * @private
     */
    _reindexSubtree(node, delta) {
        if (!delta) return;
        node._level += delta;
        if (node.children?.length) {
            node.children.forEach(child => this._reindexSubtree(child, delta));
        }
    }

    /**
     * Mueve un nodo a un nuevo padre/indice: lo saca de su grupo de hermanos actual y lo inserta
     * en el grupo e indice destino, recalculando `_parentId`/`_level` de todo su subarbol y (en
     * multiselect) la cascada de seleccion. Operacion pura sobre datos: no toca el DOM.
     * @param {string|number} id - Nodo a mover.
     * @param {string|number|null} targetParentId - Padre destino (null = raiz).
     * @param {number} [targetIndex] - Indice FINAL dentro del grupo destino, ya sin el nodo
     *   movido (mismo criterio que Array.splice). Si se omite, va al final del grupo.
     * @returns {{node: Object, from: {parentId: *, index: number}, to: {parentId: *, index: number}}|null}
     *   null si el movimiento no era valido (nodo inexistente, ciclo, destino sin children
     *   validos, o el destino no acepta drop — ver `_nodeAcceptsDrop`).
     * @private
     */
    _applyMove(id, targetParentId, targetIndex) {
        const node = this._nodeMap.get(id);
        if (!node) return null;

        const sourceParentId = node._parentId ?? null;
        const changingParent = targetParentId !== sourceParentId;

        // _canNodeEnterParent (ciclos, content, acceptsDrop, rootContainersOnly) SOLO aplica al
        // ENTRAR en un padre nuevo — un simple reordenar dentro del mismo padre no es una entrada
        // nueva, ese padre (o la raiz) ya tiene este hijo legitimamente. Se comprueba ANTES de
        // tocar _findSiblingArray (que crearia children=[] en el destino como efecto secundario
        // si no se filtrara aqui).
        if (changingParent && !this._canNodeEnterParent(node, targetParentId)) return null;

        const targetSiblings = this._findSiblingArray(targetParentId);
        if (!targetSiblings) return null; // defensivo; no deberia darse tras la validacion anterior

        const targetParentNode = targetParentId != null ? this._nodeMap.get(targetParentId) : null;

        const sourceSiblings = this._findSiblingArray(sourceParentId);
        const sourceIndex = sourceSiblings.indexOf(node);
        if (sourceIndex === -1) return null;

        // Sacamos el nodo de su posicion actual (misma referencia, no se clona).
        sourceSiblings.splice(sourceIndex, 1);

        // El indice destino se calcula sobre el array YA sin el nodo (igual que Array.splice).
        const clampedIndex = Math.max(0, Math.min(targetIndex ?? targetSiblings.length, targetSiblings.length));
        targetSiblings.splice(clampedIndex, 0, node);

        const newLevel = targetParentNode ? targetParentNode._level + 1 : 0;
        const levelDelta = newLevel - node._level;
        node._parentId = targetParentId;
        this._reindexSubtree(node, levelDelta);

        // El grupo origen puede haberse quedado sin nodos expandibles (se fue su unico hijo con
        // children/content) y el destino puede haber ganado su primer expandible (o su primer
        // hijo, si antes era hoja): reflejarlo en el DOM (has-expandable) es responsabilidad de
        // la Fase 2, que es quien conoce los contenedores DOM de cada grupo.

        if (this.multiselect) this._recalculateBottomUp();

        return {
            node,
            from: { parentId: sourceParentId, index: sourceIndex },
            to: { parentId: targetParentId, index: clampedIndex }
        };
    }

    /**
     * Mueve un nodo a una nueva posicion del arbol (cambia de padre y/o de indice dentro de su
     * grupo de hermanos). Pensado tanto para uso directo (reordenar por codigo) como para
     * deshacer un movimiento de arrastre si el consumidor lo rechaza (p.ej. tras un guardado
     * fallido en servidor): en ese caso se llama con el `from` recibido en el evento `node-moved`.
     *
     * No dispara eventos ni toca el DOM (esta version es solo el motor de datos, Fase 1); el
     * arrastre interactivo (Fase 3) llama a este mismo metodo internamente.
     * @param {string|number} id - Identificador del nodo a mover.
     * @param {{parentId?: string|number|null, index?: number}} [target] - `parentId` omitido o
     *   `null` = mover a la raiz. `index` omitido = mover al final del grupo destino.
     * @returns {boolean} true si el movimiento se aplico; false si no era valido (nodo
     *   inexistente, ciclo, destino invalido por tener `content` o `acceptsDrop === false`).
     */
    moveNode(id, { parentId = null, index } = {}) {
        const result = this._applyMove(id, parentId, index);
        if (!result) return false;
        this._relocateNodeInDOM(result);
        return true;
    }

    /**
     * Devuelve la estructura completa y actual del arbol (tras los movimientos aplicados), en
     * forma de lista plana: cada nodo con el id de su padre (null en raiz) y su indice dentro de
     * su grupo de hermanos. Pensado para persistir de golpe el orden completo (p.ej. un
     * bulk-update por id en servidor) tras una sesion de arrastres, en vez de guardar cada
     * movimiento por separado.
     * @returns {{id: *, parentId: *, index: number}[]}
     */
    getStructure() {
        const result = [];
        const traverse = (nodes, parentId) => {
            nodes.forEach((node, index) => {
                result.push({ id: node.id, parentId, index });
                if (this._nodeHasChildren(node)) traverse(node.children, node.id);
            });
        };
        traverse(this._rawData, null);
        return result;
    }

    // ==========================================
    // DRAG & DROP — REUBICACION EN DOM (Fase 2)
    //
    // Refleja en pantalla un movimiento ya aplicado a los datos por _applyMove, SIN recrear el
    // resto del arbol (se perderia el scroll, la busqueda activa, y el estado de contenido ya
    // desplegado, p.ej. un dynamic-form anidado) — misma filosofia que updateNode/getButtonsNode.
    // ==========================================

    /**
     * Contenedor DOM ya materializado (mostrando su contenido) para un padre concreto, o null si
     * ese grupo no esta actualmente renderizado (padre no encontrado en el DOM, o colapsado y
     * nunca desplegado). La raiz (parentId null) siempre esta materializada.
     * @param {string|number|null} parentId
     * @returns {HTMLElement|null}
     * @private
     */
    _materializedContainer(parentId) {
        if (parentId == null) return this._els.root;
        const parentEl = this._nodeElById(parentId);
        if (!parentEl) return null;
        const container = parentEl.querySelector(':scope > .wctl-children-container');
        if (!container) return null;
        // Expandido ahora, o ya se desplego alguna vez antes (colapsado pero con contenido
        // preservado, igual que hace _toggleExpand al colapsar: no vacia el contenedor).
        return (this._expandedIds.has(parentId) || container.children.length > 0) ? container : null;
    }

    /**
     * Inserta `nodeEl` en `container` en la posicion correspondiente a `to.index` dentro del
     * array de datos de ese grupo, localizando el primer hermano POSTERIOR que ya este
     * renderizado en ese contenedor (los hermanos anteriores no importan: insertBefore no los
     * mueve). Si ningun hermano posterior esta renderizado (fin de grupo, o resto sin paginar
     * todavia), se inserta al final — antes del centinela de paginacion si es la raiz.
     * @private
     */
    _insertAtSiblingIndex(container, nodeEl, node, to) {
        nodeEl.remove();

        const siblings = to.parentId != null ? this._nodeMap.get(to.parentId)?.children : this._rawData;
        let beforeEl = null;
        if (siblings) {
            for (let i = to.index + 1; i < siblings.length; i++) {
                const candidate = this._nodeElCache.get(String(siblings[i].id));
                if (candidate?.parentElement === container) { beforeEl = candidate; break; }
            }
        }
        if (!beforeEl && container === this._els.root) {
            beforeEl = container.querySelector(':scope > .wctl-load-sentinel');
        }

        container.insertBefore(nodeEl, beforeEl); // insertBefore(el, null) === appendChild
    }

    /**
     * Tras un movimiento (que ya cambio `_level` en cascada sobre los DATOS, ver
     * _reindexSubtree), refleja el nuevo `_level` en las filas YA renderizadas de ese subarbol:
     * indentacion visual (`.wctl-indent`) y `aria-level`. Los descendientes que aun no se hayan
     * desplegado (lazy) se renderizaran ya con el `_level` correcto la primera vez que toque, no
     * hace falta tocarlos aqui.
     * @param {HTMLElement} nodeEl
     * @param {Object} node
     * @private
     */
    _reindentRenderedSubtree(nodeEl, node) {
        const row = nodeEl.querySelector(':scope > .wctl-row');
        const indent = row?.querySelector(':scope > .wctl-indent');
        if (indent) indent.style.width = `${node._level * 1.5}rem`;
        if (row) row.setAttribute('aria-level', String((node._level || 0) + 1));

        if (!node.children?.length) return;
        const childrenContainer = nodeEl.querySelector(':scope > .wctl-children-container');
        if (!childrenContainer) return;

        // Se recorre por dato (node.children), no por _nodeMap: dataset.id siempre es string y
        // evita el desajuste de tipos si el consumidor uso ids numericos.
        Array.from(childrenContainer.children).forEach(childEl => {
            const childNode = node.children.find(c => String(c.id) === childEl.dataset.id);
            if (childNode) this._reindentRenderedSubtree(childEl, childNode);
        });
    }

    /**
     * Refresca la fila PROPIA de un nodo (chevron/placeholder, checkbox...) sin tocar sus hijos
     * ya renderizados ni su content ya desplegado — misma tecnica que ya usa updateNode() via
     * _recreateOwnRow(). Se usa cuando un movimiento cambia si un nodo tiene o no children (entra
     * o sale su ultimo/primer hijo), lo que puede alterar su condicion de expandible (aparicion o
     * desaparicion del chevron real). No hace nada si el nodo no existe o no esta renderizado.
     * @param {string|number} id
     * @private
     */
    _refreshNodeOwnRow(id) {
        const node = this._nodeMap.get(id);
        const oldEl = this._nodeElById(id);
        if (!node || !oldEl) return;

        // Si dejo de ser expandible (se quedo sin children ni content), no tiene sentido seguir
        // marcandolo como expandido — mismo criterio que updateNode().
        if (!this._nodeIsExpandable(node)) this._expandedIds.delete(id);

        this._recreateOwnRow(node, oldEl);
    }

    /**
     * Refleja en el DOM (sin recrear el resto del arbol) un movimiento ya aplicado a los datos
     * por _applyMove: reubica la fila del nodo (y reindenta su subarbol ya renderizado) en su
     * nuevo contenedor y posicion, refresca la fila propia de los padres origen/destino si su
     * condicion de expandible cambio, y sincroniza has-expandable, seleccion y roving tabindex.
     *
     * Si el destino todavia no esta "materializado" en el DOM (padre colapsado que nunca se
     * desplego, o mas alla de lo paginado/filtrado), la fila simplemente se retira del DOM: los
     * datos ya estan correctos y se renderizara con su `_level` nuevo la primera vez que su
     * contenedor se despliegue. Con busqueda activa se reubica igual (el nodo arrastrado ya
     * estaba visible, luego ya coincidia con `_matchedIds`, y `_materializedContainer`/
     * `_insertAtSiblingIndex` solo miran lo que YA esta renderizado, que bajo busqueda ya esta
     * acotado a los matches) — solo se pierde por el camino el caso raro de un nodo cuyo match
     * era heredado de un ancestro distinto al nuevo padre; se corrige solo al repetir la busqueda.
     * @param {{node: Object, from: {parentId: *, index: number}, to: {parentId: *, index: number}}} result
     * @private
     */
    _relocateNodeInDOM(result) {
        if (!this._els?.root) return; // aun no conectado/renderizado; los datos ya quedan correctos
        const { node, from, to } = result;

        let nodeEl = this._nodeElById(node.id);

        const destContainer = this._materializedContainer(to.parentId);

        if (!destContainer) {
            if (nodeEl) { nodeEl.remove(); this._nodeElCache.delete(String(node.id)); }
        } else {
            if (!nodeEl) {
                // Nunca se habia renderizado (venia de un grupo colapsado/no materializado):
                // se crea ahora, ya con los datos y el _level correctos.
                nodeEl = this._createNodeElement(node);
                if (this._expandedIds.has(node.id)) this._renderExpandedPart(node, nodeEl);
            }
            this._insertAtSiblingIndex(destContainer, nodeEl, node, to);
            this._reindentRenderedSubtree(nodeEl, node);

            // Entra en la raiz desde otro grupo: cuenta como una fila mas ya renderizada, para
            // que la paginacion por scroll (_renderedRootCount) no pierda la cuenta.
            if (to.parentId == null && from.parentId != null) this._renderedRootCount++;
        }

        // Los padres origen/destino solo se refrescan cuando SU PROPIA condicion de expandible
        // acaba de cambiar de verdad (perdieron su ultimo hijo, o ganaron el primero) — no en cada
        // movimiento: _refreshNodeOwnRow recrea la fila entera del padre (via _recreateOwnRow), y
        // hacerlo en un simple reordenar entre hermanos existentes destruiria sin necesidad estado
        // en vivo de su propia fila (p.ej. un badge puesto con getButtonsNode sobre su button-bar,
        // que no vive en node.buttons y por tanto no se preserva al recrear).
        if (from.parentId != null) {
            const fromParent = this._nodeMap.get(from.parentId);
            if (fromParent && !fromParent.children?.length) this._refreshNodeOwnRow(from.parentId);
        }
        if (to.parentId != null && to.parentId !== from.parentId) {
            const toParent = this._nodeMap.get(to.parentId);
            if (toParent && toParent.children?.length === 1) this._refreshNodeOwnRow(to.parentId);
        }

        // has-expandable de cada grupo, releyendo los contenedores (pueden haberse recreado arriba).
        const sourceContainer = this._materializedContainer(from.parentId);
        if (sourceContainer) {
            this._syncGroupExpandableClass(sourceContainer, from.parentId != null ? this._nodeMap.get(from.parentId)?.children : this._rawData);
        }
        const finalDestContainer = this._materializedContainer(to.parentId);
        if (finalDestContainer) {
            this._syncGroupExpandableClass(finalDestContainer, to.parentId != null ? this._nodeMap.get(to.parentId)?.children : this._rawData);
        }

        if (this._els.root === sourceContainer || this._els.root === finalDestContainer) this._updateSentinel();

        this._syncDOMSelection();
        this._applyRoving();
    }

    // ==========================================
    // DRAG & DROP — INTERACCION CON PUNTERO (Fase 3)
    //
    // Pointer Events (no HTML5 Drag&Drop nativo): funciona igual con raton/tactil/lapiz, sin las
    // limitaciones de dataTransfer dentro de Shadow DOM ni el problema de que el DnD nativo no
    // funciona en tactil. _pendingDrag (entre pointerdown y el umbral superado, todavia podria
    // ser un click/tap normal) y _dragState (arrastre ya confirmado) nunca coexisten.
    //
    // Nota sobre arboles anidados (un tree-list sortable dentro del `content` de otro): NO hace
    // falta ninguna guarda especial. El asa/fila con el listener de pointerdown vive dentro de
    // `.wctl-row`, que es HERMANO de `.wctl-content-panel` (no ancestro) — un pointerdown que
    // nace dentro del content anidado nunca burbujea a traves de la fila de fuera, porque el
    // burbujeo solo recorre ancestros. Cada instancia, ademas, filtra sus propios listeners
    // globales de document por pointerId, asi que dos tree-list arrastrando a la vez (algo que
    // no puede pasar con un solo puntero) tampoco se pisarian.
    // ==========================================

    /** @private */
    _nodeIsDraggable(node) {
        return this.sortable && node?.sortable !== false;
    }

    /** @private */
    _effectiveHideExpander(node) {
        return node.hideExpander === false ? false : (node.hideExpander === true || this.hideExpander);
    }

    /**
     * Alcance efectivo del arrastre PARA EL NODO QUE SE ARRASTRA: 'tree' permite cambiar de grupo
     * (a otro padre o a la raiz); 'siblings' solo reordena dentro del mismo padre actual. Combina
     * tres niveles, en este orden:
     * 1. El alcance de componente (`sortable-scope`) en 'siblings' ya lo fija para TODOS los
     *    nodos, sin excepcion.
     * 2. `node.sortableScope` ('tree'/'siblings') explicito en el propio nodo manda si el
     *    componente no lo ha fijado ya.
     * 3. Sin nada explicito, default INTELIGENTE: un nodo declarado como contenedor
     *    (`_nodeIsDeclaredContainer` — tiene `children`, aunque este vacio, p.ej. una carpeta sin
     *    elementos todavia) no se anida por defecto dentro de otro grupo -> 'siblings'. Un nodo
     *    sin `children` en absoluto hereda 'tree' (libre de moverse entre grupos), que es el
     *    comportamiento que de verdad se usa al mover items sueltos entre carpetas/categorias.
     * Solo aplica al arrastre interactivo (puntero y teclado) — `moveNode()` programatico no lo
     * consulta, mismo criterio que el resto de restricciones de interaccion (`sortable`,
     * `hideExpander`).
     * @private
     */
    _effectiveSortableScope(node) {
        if (this.sortableScope === 'siblings') return 'siblings';
        if (node.sortableScope === 'siblings') return 'siblings';
        if (node.sortableScope === 'tree') return 'tree';
        return this._nodeIsDeclaredContainer(node) ? 'siblings' : 'tree';
    }

    /**
     * Inicio de un posible arrastre (pointerdown en el asa, o en la fila con drag-anywhere). No
     * arranca el arrastre todavia: solo registra la posicion de partida y espera a ver si el
     * gesto supera el umbral de movimiento (o, en tactil con drag-anywhere, una pulsacion
     * mantenida) antes de confirmarlo — mientras tanto, un click/tap normal (checkbox, boton,
     * expander, onClick de fila) sigue funcionando sin interferencias.
     * @private
     */
    _onDragPointerDown(e, node, rowEl, handleEl, viaRow) {
        if (e.button != null && e.button !== 0) return; // solo boton principal del raton
        if (viaRow && e.target.closest('.wctl-node-checkbox, .wctl-expander, .wctl-btn-bar, .wctl-drag-handle')) return;
        if (this._dragState || this._pendingDrag) return; // ya hay un arrastre en marcha/pendiente

        const nodeEl = rowEl.closest('.wctl-node');
        const pending = {
            pointerId: e.pointerId,
            node, nodeEl, rowEl, handleEl, viaRow,
            startX: e.clientX, startY: e.clientY,
            pointerType: e.pointerType,
            longPressTimer: null
        };
        pending._move = (ev) => this._onDragPointerMovePending(ev);
        pending._up = (ev) => this._onDragPointerUpPending(ev);
        this._pendingDrag = pending;

        document.addEventListener('pointermove', pending._move);
        document.addEventListener('pointerup', pending._up);
        document.addEventListener('pointercancel', pending._up);

        // Tactil + fila completa (drag-anywhere): pulsacion mantenida en vez de umbral de
        // movimiento. NO se hace preventDefault ni se toca touch-action en la fila (eso
        // bloquearia el scroll nativo de toda la lista): si el dedo se mueve antes de que salte
        // el timer, se entiende como intencion de scroll y se cancela el arrastre pendiente.
        if (viaRow && e.pointerType === 'touch') {
            pending.longPressTimer = setTimeout(() => this._promoteToActiveDrag(pending, e), 400);
        }
    }

    /** @private */
    _onDragPointerMovePending(ev) {
        const pending = this._pendingDrag;
        if (!pending || ev.pointerId !== pending.pointerId) return;

        const dist = Math.hypot(ev.clientX - pending.startX, ev.clientY - pending.startY);

        if (pending.longPressTimer) {
            // Con pulsacion mantenida pendiente, un movimiento claro es intencion de scroll, no
            // de arrastre: se cancela y se deja que el navegador haga scroll con normalidad.
            if (dist > 10) this._cancelPendingDrag();
            return;
        }

        const threshold = pending.pointerType === 'touch' ? 8 : 5;
        if (dist >= threshold) this._promoteToActiveDrag(pending, ev);
    }

    /** @private */
    _onDragPointerUpPending(ev) {
        const pending = this._pendingDrag;
        if (!pending || ev.pointerId !== pending.pointerId) return;
        this._cancelPendingDrag(); // se solto antes de superar el umbral: fue un click/tap normal
    }

    /** @private */
    _cancelPendingDrag() {
        const pending = this._pendingDrag;
        if (!pending) return;
        clearTimeout(pending.longPressTimer);
        document.removeEventListener('pointermove', pending._move);
        document.removeEventListener('pointerup', pending._up);
        document.removeEventListener('pointercancel', pending._up);
        this._pendingDrag = null;
    }

    /**
     * Confirma el arrastre: crea el estado activo, captura el puntero, muestra el fantasma y
     * dispara `drag-started`. A partir de aqui, mover el puntero recalcula el objetivo de
     * destino en cada frame y soltar aplica (o descarta) el movimiento.
     * @private
     */
    _promoteToActiveDrag(pending, ev) {
        if (this._dragState) return; // ya promovido (p.ej. el timer disparo justo al soltar)
        this._cancelPendingDrag();

        const node = pending.node;
        if (!this._nodeIsDraggable(node)) return; // guarda defensiva; no deberia llegar aqui

        const capturedEl = pending.handleEl || pending.rowEl;
        try { capturedEl.setPointerCapture(pending.pointerId); } catch (err) { /* pointerType/navegador sin soporte: seguimos sin capture */ }

        this._dragState = {
            pointerId: pending.pointerId,
            node,
            nodeEl: pending.nodeEl,
            rowEl: pending.rowEl,
            capturedEl,
            sourceParentId: node._parentId ?? null,
            currentTarget: null,
            autoExpandTimer: null,
            autoExpandNodeId: null,
            scrollRAF: null,
            scrollSpeed: 0
        };

        pending.nodeEl.classList.add('is-dragging');
        this._els.root.classList.add('wctl-dnd-active');
        this._showDragGhost(node.title || '');
        this._positionDragGhost(ev.clientX, ev.clientY);

        this._dragState._move = (e2) => this._onDragPointerMove(e2);
        this._dragState._up = (e2) => this._onDragPointerEnd(e2);
        this._dragState._esc = (e2) => { if (e2.key === 'Escape') this._cancelActiveDrag(); };
        document.addEventListener('pointermove', this._dragState._move);
        document.addEventListener('pointerup', this._dragState._up);
        document.addEventListener('pointercancel', this._dragState._up);
        document.addEventListener('keydown', this._dragState._esc);

        // Evita que el pointerup que confirma el arrastre dispare ademas un click nativo sobre la
        // fila (seleccion no deseada) justo al empezar a mover el raton/dedo.
        this._suppressNextClick();

        this.dispatchEvent(new CustomEvent('drag-started', {
            bubbles: true, composed: true,
            detail: { node, from: { parentId: this._dragState.sourceParentId } }
        }));
    }

    /** @private */
    _suppressNextClick() {
        const suppress = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        document.addEventListener('click', suppress, { capture: true, once: true });
        setTimeout(() => document.removeEventListener('click', suppress, { capture: true }), 500);
    }

    /**
     * Resuelve, a partir de un punto de pantalla, sobre que fila se esta arrastrando ahora y en
     * que posicion relativa (before/after/inside), sin validar todavia si ese destino es valido
     * (eso lo hace _isValidDropTarget). Usa `this.shadow.elementFromPoint` (no
     * `document.elementFromPoint`) para no salirse del arbol de ESTE tree-list ni colarse en uno
     * anidado (un `<tree-list>` anidado es, para este metodo, una caja opaca).
     * @returns {{targetNode: Object, targetId: string, rowEl: HTMLElement, nodeEl: HTMLElement, position: string}|null}
     * @private
     */
    _computeDropTarget(clientX, clientY) {
        if (!this._dragState) return null;

        const hit = this.shadow.elementFromPoint(clientX, clientY);
        const rowEl = hit?.closest?.('.wctl-row');
        if (!rowEl || !this._els.root.contains(rowEl)) return null;

        const nodeEl = rowEl.closest('.wctl-node');
        const targetId = nodeEl?.dataset.id;
        const targetNode = targetId != null ? this._resolveNodeByDatasetId(targetId) : null;
        if (!targetNode) return null;

        const draggedNode = this._dragState.node;
        if (targetId === String(draggedNode.id)) return null; // sobre si mismo
        if (this._isSameOrDescendant(draggedNode.id, targetNode.id)) return null; // sobre su propio subarbol

        // Alcance efectivo DEL NODO ARRASTRADO (no solo el del componente): por defecto, un grupo
        // (nodo con hijos) no puede cambiar de padre — solo reordenarse entre sus hermanos
        // actuales — para no anidarse dentro de otro grupo sin que el consumidor lo pida.
        const effectiveScope = this._effectiveSortableScope(draggedNode);

        if (effectiveScope === 'siblings' && (targetNode._parentId ?? null) !== this._dragState.sourceParentId) {
            return null; // solo se permite reordenar dentro del mismo grupo que el nodo arrastrado
        }

        const rect = rowEl.getBoundingClientRect();
        const relY = rect.height ? (clientY - rect.top) / rect.height : 0.5;
        const canAcceptInside = effectiveScope !== 'siblings'
            && this._nodeAcceptsDrop(targetNode)
            && !this._nodeHasContent(targetNode);

        const position = (canAcceptInside && relY > 0.25 && relY < 0.75) ? 'inside' : (relY <= 0.5 ? 'before' : 'after');

        return { targetNode, targetId, rowEl, nodeEl, position };
    }

    /**
     * Busca en `_nodeMap` un nodo a partir de un `dataset.id` (siempre string): primero tal cual,
     * y si no hay match prueba su forma numerica (los ids del consumidor pueden ser numeros).
     * @private
     */
    _resolveNodeByDatasetId(datasetId) {
        if (this._nodeMap.has(datasetId)) return this._nodeMap.get(datasetId);
        const asNum = Number(datasetId);
        return Number.isNaN(asNum) ? null : (this._nodeMap.get(asNum) || null);
    }

    /**
     * Valida un destino ya calculado por _computeDropTarget: reglas estructurales (mismas que
     * _applyMove, via `_canNodeEnterParent` — sin ciclos, sin `content`, `acceptsDrop` y
     * `rootContainersOnly` en el padre resultante) mas el veto opcional del consumidor
     * (`canDrop`). Solo se usa durante el arrastre interactivo; la API directa (`moveNode`) no
     * llama a `canDrop` porque asume que el consumidor ya decidio.
     * @private
     */
    _isValidDropTarget(info) {
        if (!info) return false;
        const { targetNode, position } = info;
        const draggedNode = this._dragState.node;

        const targetParentId = position === 'inside' ? targetNode.id : (targetNode._parentId ?? null);
        const sourceParentId = draggedNode._parentId ?? null;

        if (targetParentId !== sourceParentId && !this._canNodeEnterParent(draggedNode, targetParentId)) return false;

        if (typeof this.canDrop === 'function') {
            const allowed = this.safeExecute(this.canDrop, { node: draggedNode, targetNode, position, targetParentId });
            if (allowed === false) return false;
        }

        return true;
    }

    /** @private */
    _onDragPointerMove(e) {
        const state = this._dragState;
        if (!state || e.pointerId !== state.pointerId) return;
        e.preventDefault?.();

        this._positionDragGhost(e.clientX, e.clientY);

        const info = this._computeDropTarget(e.clientX, e.clientY);
        const valid = info ? this._isValidDropTarget(info) : false;
        this._updateDropIndicator(info, valid);
        this._scheduleAutoExpand(info);
        this._runAutoScroll(e.clientY);
    }

    /**
     * Pinta (o quita) el indicador visual de destino sobre la fila bajo el puntero: una clase por
     * fila (`wctl-drop-before` / `wctl-drop-after` / `wctl-drop-inside` / `wctl-drop-invalid`), sin
     * overlay flotante — al ser una clase sobre la propia fila (ya en flujo normal), no hay
     * problemas de contexto de apilamiento que resolver (a diferencia del fantasma, que si
     * necesita top layer por moverse libremente sobre toda la pantalla).
     * @private
     */
    _updateDropIndicator(info, valid) {
        const state = this._dragState;
        if (state.currentTarget?.rowEl) {
            state.currentTarget.rowEl.classList.remove('wctl-drop-before', 'wctl-drop-after', 'wctl-drop-inside', 'wctl-drop-invalid');
        }
        if (!info) { state.currentTarget = null; return; }

        const cls = !valid ? 'wctl-drop-invalid' : `wctl-drop-${info.position}`;
        info.rowEl.classList.add(cls);
        state.currentTarget = { ...info, valid };
    }

    /**
     * Si se mantiene el puntero ~700ms sobre la zona 'inside' de un padre colapsado, lo despliega
     * solo (para que el usuario vea donde va a caer sin tener que soltar y volver a arrastrar).
     * Respeta hideExpander (ni el componente ni el propio nodo permiten que el usuario fuerce su
     * apertura, y el arrastre es interaccion de usuario).
     * @private
     */
    _scheduleAutoExpand(info) {
        const state = this._dragState;
        const targetId = info?.position === 'inside' ? info.targetNode.id : null;

        if (state.autoExpandNodeId === targetId) return; // mismo objetivo: no reiniciar el timer
        clearTimeout(state.autoExpandTimer);
        state.autoExpandNodeId = targetId;
        state.autoExpandTimer = null;
        if (targetId == null) return;

        const targetNode = info.targetNode;
        if (this._expandedIds.has(targetId) || this._effectiveHideExpander(targetNode) || !this._nodeIsExpandable(targetNode)) return;

        state.autoExpandTimer = setTimeout(() => {
            if (this._dragState?.autoExpandNodeId === targetId) this.expandNode(targetId);
        }, 700);
    }

    /**
     * Autoscroll continuo de `.wctl-tree-root` mientras el puntero esta cerca de su borde
     * superior/inferior durante un arrastre. Aprovecha que el scroll dispara el mismo
     * IntersectionObserver de la paginacion (_setupScrollObserver): si hay mas paginas por
     * cargar, se cargan solas al arrastrar cerca del fondo, igual que con scroll manual.
     * @private
     */
    _runAutoScroll(clientY) {
        const state = this._dragState;
        const root = this._els.root;
        const rect = root.getBoundingClientRect();
        const margin = 40;

        let speed = 0;
        if (clientY < rect.top + margin) speed = -(Math.ceil((rect.top + margin - clientY) / 4) + 2);
        else if (clientY > rect.bottom - margin) speed = Math.ceil((clientY - (rect.bottom - margin)) / 4) + 2;

        state.scrollSpeed = speed;
        if (speed !== 0 && !state.scrollRAF) {
            const step = () => {
                const s = this._dragState;
                if (!s || s.scrollSpeed === 0) { if (s) s.scrollRAF = null; return; }
                root.scrollTop += s.scrollSpeed;
                s.scrollRAF = requestAnimationFrame(step);
            };
            state.scrollRAF = requestAnimationFrame(step);
        } else if (speed === 0 && state.scrollRAF) {
            cancelAnimationFrame(state.scrollRAF);
            state.scrollRAF = null;
        }
    }

    /** @private */
    _onDragPointerEnd(e) {
        const state = this._dragState;
        if (!state || e.pointerId !== state.pointerId) return;

        const info = state.currentTarget?.valid ? state.currentTarget : null;
        const node = state.node;
        this._teardownActiveDrag();

        if (info) this._performDrop(node, info);
        else this.dispatchEvent(new CustomEvent('drag-ended', { bubbles: true, composed: true, detail: { node, moved: false } }));
    }

    /** @private */
    _cancelActiveDrag() {
        const state = this._dragState;
        if (!state) return;
        const node = state.node;
        this._teardownActiveDrag();
        this.dispatchEvent(new CustomEvent('drag-ended', { bubbles: true, composed: true, detail: { node, moved: false } }));
    }

    /**
     * Limpieza de un arrastre activo (listeners de document, captura de puntero, timers,
     * fantasma, clases visuales) sin disparar ningun evento — los eventos los disparan los
     * metodos que llaman a esta limpieza (_onDragPointerEnd/_cancelActiveDrag/disconnectedCallback),
     * cada uno segun corresponda.
     * @private
     */
    _teardownActiveDrag() {
        const state = this._dragState;
        if (!state) return;

        clearTimeout(state.autoExpandTimer);
        if (state.scrollRAF) cancelAnimationFrame(state.scrollRAF);
        document.removeEventListener('pointermove', state._move);
        document.removeEventListener('pointerup', state._up);
        document.removeEventListener('pointercancel', state._up);
        document.removeEventListener('keydown', state._esc);
        try { state.capturedEl?.releasePointerCapture(state.pointerId); } catch (err) { /* ya liberado o sin soporte */ }

        state.nodeEl?.classList.remove('is-dragging');
        this._els?.root?.classList.remove('wctl-dnd-active');
        state.currentTarget?.rowEl?.classList.remove('wctl-drop-before', 'wctl-drop-after', 'wctl-drop-inside', 'wctl-drop-invalid');
        this._hideDragGhost();

        this._dragState = null;
    }

    /** @private */
    _showDragGhost(label) {
        const ghost = this._els?.dragGhost;
        if (!ghost) return;
        ghost.textContent = label;
        if (typeof ghost.showPopover === 'function') {
            if (this.isConnected && !ghost.matches(':popover-open')) ghost.showPopover();
        } else {
            ghost.style.display = '';
        }
    }

    /** @private */
    _hideDragGhost() {
        const ghost = this._els?.dragGhost;
        if (!ghost) return;
        if (typeof ghost.hidePopover === 'function') {
            try { if (ghost.matches(':popover-open')) ghost.hidePopover(); } catch (err) { /* ya cerrado */ }
        } else {
            ghost.style.display = 'none';
        }
    }

    /** @private */
    _positionDragGhost(clientX, clientY) {
        const ghost = this._els?.dragGhost;
        if (!ghost) return;
        ghost.style.left = `${clientX}px`;
        ghost.style.top = `${clientY}px`;
    }

    /**
     * Aplica el movimiento (via _applyMove, la misma logica que usa moveNode) y dispara los
     * eventos correspondientes con toda la informacion para que el consumidor decida que hacer
     * (guardar en BD, repintar algo, revertir con moveNode(id, from) si el guardado falla...).
     * @private
     */
    _performDrop(node, info) {
        const { targetNode, position } = info;
        let targetParentId, targetIndex;

        if (position === 'inside') {
            targetParentId = targetNode.id;
            // Al final, como en el movimiento por teclado (ArrowRight); sin contar el nodo si ya era hijo suyo
            targetIndex = (targetNode.children || []).filter(n => n !== node).length;
        } else {
            targetParentId = targetNode._parentId ?? null;
            const siblings = targetParentId != null ? this._nodeMap.get(targetParentId)?.children : this._rawData;
            // _applyMove espera el indice FINAL, ya sin el nodo arrastrado (ver su doc). Si el
            // destino es el MISMO grupo que el origen, ese array todavia contiene el nodo
            // arrastrado en este momento (no se ha movido nada aun): hay que descartarlo antes de
            // calcular la posicion de targetNode, o un reordenar hacia atras (el arrastrado estaba
            // ANTES del objetivo) queda desplazado una posicion de mas.
            const siblingsWithoutDragged = siblings ? siblings.filter(n => n !== node) : [];
            const targetPos = siblingsWithoutDragged.indexOf(targetNode);
            targetIndex = position === 'before' ? targetPos : targetPos + 1;
        }

        const result = this._applyMove(node.id, targetParentId, targetIndex);

        this.dispatchEvent(new CustomEvent('drag-ended', {
            bubbles: true, composed: true,
            detail: { node, moved: !!result }
        }));

        if (!result) return;

        this._relocateNodeInDOM(result);
        this._maybeExpandDropTarget(position, targetNode);
        this._dispatchNodeMoved(node, result, position, targetNode, 'pointer');
    }

    /**
     * Al caer/moverse 'inside' un padre recien desplegable (o que ya lo estaba por otro motivo),
     * se muestra el resultado sin que el usuario tenga que desplegarlo el mismo — salvo que
     * hideExpander se lo reserve explicitamente al consumidor. Comun al arrastre con puntero y al
     * movimiento por teclado (Fase 4).
     * @private
     */
    _maybeExpandDropTarget(position, targetNode) {
        if (position === 'inside' && !this._expandedIds.has(targetNode.id) && !this._effectiveHideExpander(targetNode)) {
            this.expandNode(targetNode.id);
        }
    }

    /**
     * Construye y dispara `node-moved` con toda la informacion que necesita el consumidor
     * (guardar en BD, repintar algo, revertir con moveNode(id, from) si el guardado falla...), y
     * anuncia el movimiento por aria-live. Comun al arrastre con puntero (Fase 3) y al movimiento
     * por teclado (Fase 4): mismo evento, mismo anuncio, solo cambia `origin`.
     * @param {Object} node
     * @param {{from: {parentId:*, index:number}, to: {parentId:*, index:number}}} result
     * @param {string} position - 'before' | 'after' | 'inside'
     * @param {Object} referenceNode - El nodo objetivo (fila sobre la que se solto/actuo).
     * @param {string} origin - 'pointer' | 'keyboard'
     * @private
     */
    _dispatchNodeMoved(node, result, position, referenceNode, origin) {
        const changedParent = result.from.parentId !== result.to.parentId;
        const toParentNode = result.to.parentId != null ? this._nodeMap.get(result.to.parentId) : null;
        const toSiblingIds = (result.to.parentId != null ? toParentNode?.children : this._rawData)?.map(n => n.id) || [];
        const fromParentNode = result.from.parentId != null ? this._nodeMap.get(result.from.parentId) : null;
        const previousSiblingIds = changedParent
            ? ((result.from.parentId != null ? fromParentNode?.children : this._rawData)?.map(n => n.id) || [])
            : toSiblingIds; // mismo padre: es el mismo grupo, ya reordenado

        this._announce(this._buildMoveAnnouncement(node, position, referenceNode));

        this.dispatchEvent(new CustomEvent('node-moved', {
            bubbles: true, composed: true,
            detail: {
                node, nodeId: node.id,
                from: { parentId: result.from.parentId, index: result.from.index },
                to: { parentId: result.to.parentId, index: result.to.index },
                position,
                referenceNodeId: referenceNode.id,
                changedParent,
                siblingIds: toSiblingIds,
                previousSiblingIds,
                origin
            }
        }));
    }

    // ==========================================
    // ACCESIBILIDAD: TECLADO PARA MOVER (Ctrl+flecha, Fase 4) Y ANUNCIOS ARIA-LIVE
    //
    // Ctrl+Arriba/Abajo reordena entre hermanos; Ctrl+Derecha/Izquierda indenta/desindenta
    // (cambia de grupo, equivalente a "meterse dentro" del hermano anterior o "salir" al nivel
    // del padre). Reutiliza _applyMove/_relocateNodeInDOM (mismo motor que el arrastre con
    // puntero) y respeta las mismas reglas (canDrop, sortable-scope), construyendo un contexto
    // {targetNode, position, targetParentId} equivalente al de un drop de puntero para que el
    // veto del consumidor sea consistente en ambos caminos.
    // ==========================================

    /**
     * Mueve un nodo por teclado. Devuelve true si se aplico algun movimiento (para que el
     * llamador haga preventDefault), false si no habia nada que hacer: no sortable, ya esta en el
     * extremo del grupo (Arriba/Abajo), no hay hermano anterior al que indentarse (Derecha), ya
     * esta en la raiz (Izquierda), sortable-scope="siblings" bloquea el cambio de grupo
     * (Derecha/Izquierda), o `canDrop` rechaza el destino.
     * @param {string} key - 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
     * @param {string} nodeId
     * @returns {boolean}
     * @private
     */
    _handleKeyboardMove(key, nodeId) {
        if (this._dragState || this._pendingDrag) return false; // no mezclar con un arrastre en marcha
        const node = this._resolveNodeByDatasetId(nodeId);
        if (!node || !this._nodeIsDraggable(node)) return false;

        const parentId = node._parentId ?? null;
        const siblings = parentId != null ? this._nodeMap.get(parentId)?.children : this._rawData;
        if (!siblings) return false;
        const currentIndex = siblings.indexOf(node);
        if (currentIndex === -1) return false;

        let targetParentId, targetIndex, targetNode, position;

        if (key === 'ArrowUp' || key === 'ArrowDown') {
            const swapWith = key === 'ArrowUp' ? siblings[currentIndex - 1] : siblings[currentIndex + 1];
            if (!swapWith) return false; // ya esta en el extremo del grupo
            targetParentId = parentId;
            targetIndex = key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
            targetNode = swapWith;
            position = key === 'ArrowUp' ? 'before' : 'after';
        } else if (key === 'ArrowRight') {
            if (this._effectiveSortableScope(node) === 'siblings') return false; // no permite cambiar de grupo
            const prevSibling = siblings[currentIndex - 1];
            if (!prevSibling) return false; // no hay hermano anterior al que "meterse dentro"
            if (this._nodeHasContent(prevSibling) || !this._nodeAcceptsDrop(prevSibling)) return false;
            targetParentId = prevSibling.id;
            targetIndex = prevSibling.children?.length || 0; // ultimo hijo
            targetNode = prevSibling;
            position = 'inside';
        } else { // ArrowLeft
            if (this._effectiveSortableScope(node) === 'siblings') return false;
            if (parentId == null) return false; // ya esta en la raiz, no se puede desindentar mas
            const parentNode = this._nodeMap.get(parentId);
            const grandParentId = parentNode._parentId ?? null;
            // Desindentar SIEMPRE cambia de padre (sube a grandParentId): valida contra el mismo
            // veto que el resto de caminos (content/acceptsDrop del abuelo, y rootContainersOnly
            // si el abuelo es la raiz — asi un item nunca "se escapa" a nivel superior por teclado).
            if (!this._canNodeEnterParent(node, grandParentId)) return false;
            const grandSiblings = grandParentId != null ? this._nodeMap.get(grandParentId)?.children : this._rawData;
            const parentIndex = grandSiblings ? grandSiblings.indexOf(parentNode) : -1;
            if (parentIndex === -1) return false;
            targetParentId = grandParentId;
            targetIndex = parentIndex + 1;
            targetNode = parentNode;
            position = 'after';
        }

        if (typeof this.canDrop === 'function') {
            const allowed = this.safeExecute(this.canDrop, { node, targetNode, position, targetParentId });
            if (allowed === false) return false;
        }

        const result = this._applyMove(node.id, targetParentId, targetIndex);
        if (!result) return false;

        this._relocateNodeInDOM(result);
        this._maybeExpandDropTarget(position, targetNode);

        const focusEl = this._nodeElById(node.id)?.querySelector(':scope > .wctl-row');
        if (focusEl) this._focusRow(focusEl);

        this._dispatchNodeMoved(node, result, position, targetNode, 'keyboard');
        return true;
    }

    /** @private */
    _buildMoveAnnouncement(node, position, referenceNode) {
        const title = node.title || '';
        const refTitle = referenceNode?.title || '';
        if (position === 'inside') return Traduccion.MOVIDO_DENTRO_DE.replace('{0}', title).replace('{1}', refTitle);
        if (position === 'before') return Traduccion.MOVIDO_ANTES_DE.replace('{0}', title).replace('{1}', refTitle);
        return Traduccion.MOVIDO_DESPUES_DE.replace('{0}', title).replace('{1}', refTitle);
    }

    /**
     * Anuncia un mensaje por aria-live (region 'polite', igual criterio que los avisos
     * informativos de WCBanner). No hace nada si sortable esta desactivado (la region no existe).
     * @private
     */
    _announce(message) {
        const region = this._els?.liveRegion;
        if (!region) return;
        region.textContent = '';
        // Vaciar y reescribir en el siguiente tick para que el lector de pantalla note el cambio
        // aunque el mensaje sea igual al del anuncio anterior (mismo patron que el setTimeout(0)
        // que ya usa ButtonBar para re-adjuntar su listener tras open).
        setTimeout(() => { region.textContent = message; }, 0);
    }

    // ==========================================
    // CONTENIDO PERSONALIZADO DE NODO (content)
    // ==========================================

    /** @private */
    _nodeHasContent(node) {
        return !!node?.content;
    }

    /**
     * Un nodo tiene hijos "efectivos" solo si no define content (excluyentes).
     * @private
     */
    _nodeHasChildren(node) {
        return !node?.content && node?.children?.length > 0;
    }

    /** @private */
    _nodeIsExpandable(node) {
        return this._nodeHasChildren(node) || this._nodeHasContent(node);
    }

    /**
     * Renderiza la parte desplegada de un nodo ya marcado como expandido:
     * su contenido personalizado (content) o sus hijos (children).
     * @param {Object} node
     * @param {HTMLElement} nodeEl - El .wctl-node del nodo.
     * @private
     */
    _renderExpandedPart(node, nodeEl) {
        if (this._nodeHasContent(node)) {
            this._renderContent(node, nodeEl);
        } else {
            this._renderChildren(node.id, nodeEl);
        }
    }

    /**
     * Resuelve y pinta node.content dentro de su panel (lazy, una sola vez).
     * Admite HTMLElement directo, función factory (node) => HTMLElement|string,
     * o un string de HTML de confianza (no input de usuario).
     * @param {Object} node
     * @param {HTMLElement} nodeEl - El .wctl-node del nodo.
     * @private
     */
    _renderContent(node, nodeEl) {
        const panel = nodeEl.querySelector(':scope > .wctl-content-panel');
        if (!panel || panel.childNodes.length > 0) return;

        let result = node.content;
        if (typeof result === 'function') {
            result = this.safeExecute(result, node);
        }

        if (result instanceof HTMLElement) {
            panel.appendChild(result);
        } else if (typeof result === 'string') {
            panel.innerHTML = result;
        }
    }

    /**
     * Devuelve el elemento vivo del contenido personalizado (node.content) de un nodo.
     * Al ser lazy, solo existe una vez que el nodo se ha desplegado al menos una vez.
     * @param {string|number} id
     * @returns {HTMLElement|null} null si el nodo no tiene content o aun no se ha desplegado.
     */
    getContentElement(id) {
        const nodeEl = this._nodeElById(id);
        const panel = nodeEl?.querySelector(':scope > .wctl-content-panel');
        return panel?.firstElementChild || null;
    }

    // ==========================================
    // BÚSQUEDA / FILTRADO
    // ==========================================

    /**
     * Filtra el árbol por texto, ignorando tildes y mayúsculas.
     * @param {string} text
     */
    filter(text) {
        this._currentSearch = this._normalizeText(text);
        this._renderedRootCount = this.pageSize;

        if (!this._currentSearch) {
            if (this._preSearchExpandedIds) {
                this._expandedIds = new Set(this._preSearchExpandedIds);
                this._preSearchExpandedIds = null;
            }
            this._matchedIds.clear();
            this._renderTree();
            this._syncDOMSelection();
            return;
        }

        if (!this._preSearchExpandedIds) {
            this._preSearchExpandedIds = new Set(this._expandedIds);
        }

        this._matchedIds.clear();
        const forceExpand = new Set();

        const searchNode = (node, inheritedMatch = false) => {
            let nodeMatches = false;

            const rightTitleText = typeof node.rightTitle === 'object' ? node.rightTitle?.text : node.rightTitle;
            const rightSubtitleText = typeof node.rightSubtitle === 'object' ? node.rightSubtitle?.text : node.rightSubtitle;

            if (node.title && this._normalizeText(node.title).includes(this._currentSearch)) nodeMatches = true;
            if (!nodeMatches && node.subtitle && this._normalizeText(node.subtitle).includes(this._currentSearch)) nodeMatches = true;
            if (!nodeMatches && rightTitleText && this._normalizeText(rightTitleText).includes(this._currentSearch)) nodeMatches = true;
            if (!nodeMatches && rightSubtitleText && this._normalizeText(rightSubtitleText).includes(this._currentSearch)) nodeMatches = true;

            if (!nodeMatches && node.searchFields && node.data) {
                nodeMatches = node.searchFields.some(field => {
                    const val = node.data[field];
                    return val && this._normalizeText(val).includes(this._currentSearch);
                });
            }

            const effectiveMatch = nodeMatches || inheritedMatch;
            let childMatches = false;

            if (this._nodeHasChildren(node)) {
                node.children.forEach(child => {
                    if (searchNode(child, effectiveMatch)) childMatches = true;
                });
            }

            if (effectiveMatch || childMatches) {
                this._matchedIds.add(node.id);
                if (childMatches) forceExpand.add(node.id);
                return true;
            }
            return false;
        };

        this._rawData.forEach(root => searchNode(root, false));
        forceExpand.forEach(id => this._expandedIds.add(id));

        this._renderTree();
        this._syncDOMSelection();
    }

    /** @private */
    _normalizeText(text) {
        if (text == null) return '';
        return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    // ==========================================
    // RENDERIZADO
    // ==========================================

    _renderSkeleton() {
        const isSearchable = this.hasAttribute('searchable');
        const showSelectAll = this.hasAttribute('show-select-all') && this.multiselect;

        this.shadow.innerHTML = `
            <div class="wctl-wrapper">
                ${isSearchable || showSelectAll ? `
                    <div class="wctl-header">
                        ${showSelectAll ? `<wc-checkbox class="wctl-select-all" label="${Traduccion.SELECCIONAR_TODOS}"></wc-checkbox>` : ''}
                        ${isSearchable ? `
                            <div class="wctl-search-box">
                                <wc-input type="text" class="wctl-search-input" clearable placeholder="${Traduccion.BUSCAR}..."></wc-input>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                <div class="wctl-tree-root" role="tree"></div>
            </div>
        `;

        this._els = {
            root: this.shadow.querySelector('.wctl-tree-root'),
            searchInput: this.shadow.querySelector('.wctl-search-input'),
            selectAll: this.shadow.querySelector('.wctl-select-all'),
            dragGhost: null,
            liveRegion: null
        };

        // Accesibilidad: el arbol permite seleccion multiple cuando multiselect esta activo
        if (this.multiselect) this._els.root.setAttribute('aria-multiselectable', 'true');
        // Navegacion por teclado (los eventos de las filas burbujean hasta la raiz del arbol)
        this._els.root.addEventListener('keydown', this._handleTreeKeydown);

        this._els.searchInput?.addEventListener('input', e => {
            const value = e.target.value;
            clearTimeout(this._searchDebounceTimer);
            this._searchDebounceTimer = setTimeout(() => this._onSearchInput(value), 200);
        });
        this._els.selectAll?.addEventListener('change', e => this._handleSelectAll(e.target.checked));

        // Drag & drop (Fase 3): fantasma flotante que sigue al puntero durante el arrastre.
        // TOP LAYER (popover nativo) por el mismo motivo que el popover de button-bar: un
        // position:fixed + z-index normal NO basta si el tree-list vive dentro de un contenedor
        // con transform/contain/opacity<1 (p.ej. un modal o un right-sidebar), que lo recortaria
        // o lo dejaria tapado por contenido posterior de la pagina.
        if (this.sortable) {
            const ghost = document.createElement('div');
            ghost.className = 'wctl-drag-ghost';
            if (typeof ghost.showPopover === 'function') {
                ghost.setAttribute('popover', 'manual');
            } else {
                ghost.style.display = 'none';
            }
            this.shadow.appendChild(ghost);
            this._els.dragGhost = ghost;

            // Drag & drop (Fase 4): region aria-live para anunciar cada movimiento (por puntero o
            // por teclado) a lectores de pantalla. 'polite' porque no es un error ni algo urgente
            // (mismo criterio que los avisos informativos de WCBanner).
            const liveRegion = document.createElement('div');
            liveRegion.className = 'wctl-sr-only';
            liveRegion.setAttribute('role', 'status');
            liveRegion.setAttribute('aria-live', 'polite');
            this.shadow.appendChild(liveRegion);
            this._els.liveRegion = liveRegion;
        }
    }

    /**
     * Handler del buscador (ya con debounce aplicado).
     * En modo remoto con carga incompleta delega la busqueda al consumidor (Fase 3);
     * en el resto de casos filtra en local.
     * @param {string} value
     * @private
     */
    _onSearchInput(value) {
        this.filter(value);
    }

    _renderTree() {
        if (!this._els?.root) return;
        this._nodeElCache.clear();
        this._els.root.innerHTML = '';
        // Alineacion del expander a nivel RAIZ: solo mira los hermanos directos (_rawData), no
        // el arbol completo (los nietos pueden ser todos hojas aunque la raiz tenga expandibles).
        this._syncGroupExpandableClass(this._els.root, this._rawData);

        if (!this._rawData?.length) {
            this._renderEmptyState(this.emptyText, this.noDataIcon);
            return;
        }

        if (this._currentSearch && this._matchedIds.size === 0) {
            this._renderEmptyState(Traduccion.NO_SE_HAN_ENCONTRADO_RESULTADOS, this.noResultsIcon);
            return;
        }

        const roots = this._renderableRoots();
        const count = this.disablePagination ? roots.length : Math.min(this._renderedRootCount, roots.length);

        for (let i = 0; i < count; i++) {
            const nodeEl = this._createNodeElement(roots[i]);
            this._els.root.appendChild(nodeEl);
            if (this._expandedIds.has(roots[i].id)) this._renderExpandedPart(roots[i], nodeEl);
        }

        // Accesibilidad: fijar que treeitem es tabulable (roving tabindex)
        this._applyRoving();

        if (!this.disablePagination) this._updateSentinel();
    }

    /** @private */
    _renderEmptyState(message, iconConfig) {
        const wrapper = document.createElement('div');
        wrapper.className = 'wctl-empty-state';

        // Prioridad de renderizado de iconos:
        // 1. Si tiene propiedad 'svg' -> renderizar ESE markup tal cual (string de confianza del
        // consumidor, igual criterio que node.content de HTML de confianza) — no una referencia por
        // nombre al catalogo interno this.icons (eso limitaba 'svg' a los pocos iconos ya cableados
        // en el propio TreeList, nunca a un SVG realmente traido por el consumidor).
        if (iconConfig?.svg) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'wctl-empty-icon';
            iconSpan.innerHTML = iconConfig.svg;
            wrapper.appendChild(iconSpan);
        }
        // 2. Si tiene propiedad 'name' -> renderizar wc-icon personalizado
        else if (iconConfig?.name) {
            const iconEl = document.createElement('wc-icon');
            iconEl.className = 'wctl-empty-icon';
            
            iconEl.setAttribute('name', iconConfig.name);
            if (iconConfig.size) iconEl.setAttribute('size', iconConfig.size);
            if (iconConfig.shape) iconEl.setAttribute('shape', iconConfig.shape);
            if (iconConfig.colorBg) iconEl.setAttribute('color-bg', iconConfig.colorBg);
            if (iconConfig.borderColor) iconEl.setAttribute('border-color', iconConfig.borderColor);
            if (iconConfig.iconColor) iconEl.setAttribute('icon-color', iconConfig.iconColor);

            wrapper.appendChild(iconEl);
        }

        // Agregar texto
        const textEl = document.createElement('span');
        textEl.className = 'wctl-empty-text';
        textEl.textContent = message;
        wrapper.appendChild(textEl);

        this._els.root.innerHTML = '';
        this._els.root.appendChild(wrapper);
    }

    // ==========================================
    // PAGINACIÓN POR SCROLL INFINITO
    // ==========================================

    /**
     * Nodos raiz que deben renderizarse (todos o solo los que coinciden con la busqueda).
     * @returns {Object[]}
     * @private
     */
    _renderableRoots() {
        if (this._currentSearch) {
            return this._rawData.filter(n => this._matchedIds.has(n.id));
        }
        return this._rawData;
    }

    /** @private */
    _hasMoreToShow() {
        return this._renderedRootCount < this._renderableRoots().length;
    }

    /**
     * Crea y appenda nodos raiz del rango [fromIdx, toIdx) justo antes del centinela.
     * @private
     */
    _appendRootBatch(roots, fromIdx, toIdx) {
        const sentinel = this._els.root.querySelector('.wctl-load-sentinel');
        for (let i = fromIdx; i < toIdx && i < roots.length; i++) {
            const nodeEl = this._createNodeElement(roots[i]);
            if (sentinel) {
                this._els.root.insertBefore(nodeEl, sentinel);
            } else {
                this._els.root.appendChild(nodeEl);
            }
            if (this._expandedIds.has(roots[i].id)) this._renderExpandedPart(roots[i], nodeEl);
        }
        this._applyRoving();
    }

    /**
     * Carga el siguiente lote de nodos raiz al scrollear hasta el centinela.
     * @private
     */
    _loadNextPage() {
        const roots = this._renderableRoots();
        const from = this._renderedRootCount;
        if (from >= roots.length) return;
        this._renderedRootCount += this.pageSize;
        this._appendRootBatch(roots, from, this._renderedRootCount);
        this._updateSentinel();
    }

    /**
     * Crea el IntersectionObserver que vigila el centinela.
     * @private
     */
    _setupScrollObserver() {
        if (this._io) this._io.disconnect();
        this._io = new IntersectionObserver(entries => {
            if (entries[0]?.isIntersecting) this._loadNextPage();
        }, { root: this._els.root, rootMargin: '100px' });
    }

    /**
     * Añade o quita el elemento centinela y conecta/desconecta el observer segun si quedan nodos por mostrar.
     * @private
     */
    _updateSentinel() {
        let sentinel = this._els.root.querySelector('.wctl-load-sentinel');

        if (this._hasMoreToShow()) {
            if (!sentinel) {
                sentinel = document.createElement('div');
                sentinel.className = 'wctl-load-sentinel';
                this._els.root.appendChild(sentinel);
            }
            if (!this._io) this._setupScrollObserver();
            this._io.disconnect();
            this._io.observe(sentinel);
        } else {
            sentinel?.remove();
            this._io?.disconnect();
        }
    }

    /**
     * Crea el elemento DOM de un nodo.
     * @param {Object} node
     * @returns {HTMLElement}
     * @private
     */
    _createNodeElement(node) {
        const hasChildren = this._nodeHasChildren(node);
        const hasContent = this._nodeHasContent(node);
        const isExpandableNode = hasChildren || hasContent;
        // hideExpander: oculta visualmente la flecha e impide que el USUARIO despliegue/pliegue el
        // nodo por interaccion (click, teclado). El span sigue existiendo en el DOM (oculto via CSS)
        // para que expandNode()/collapseNode() sigan funcionando programaticamente.
        // node.hideExpander explicito (true/false) manda; si no se especifica, se usa el default
        // del componente (atributo hide-expander), igual que default-selectable con selectable.
        const hideExpander = node.hideExpander === false
            ? false
            : (node.hideExpander === true || this.hideExpander);

        // Calculamos si la fila puede seleccionarse.
        // En single select, si tiene hijos o content, anulamos cualquier directiva que lo haga seleccionable.
        let isSelectable = node.selectable === true || this.hasAttribute('default-selectable');
        if (!this.multiselect && isExpandableNode) {
            isSelectable = false;
        }

        const showCheckbox = isSelectable && this.multiselect;
        const isExpanded = this._expandedIds.has(node.id);
        const nodeHeight = node.nodeHeight || this.nodeHeight || '60px';
        // Drag & drop (Fase 3): node.sortable === false excluye ese nodo del arrastre por el
        // usuario aunque el componente lo tenga activado (mismo criterio que hideExpander: solo
        // bloquea la INTERACCION del usuario, moveNode() programatico no se ve afectado).
        const isDraggable = this.sortable && node.sortable !== false;

        const div = document.createElement('div');
        div.className = 'wctl-node';
        div.dataset.id = node.id;
        this._nodeElCache.set(String(node.id), div);

        const esc = WidgetBase.escapeHtml;
        div.innerHTML = `
            <div class="wctl-row ${esc(node.rowClass || '')} ${!this.multiselect && isSelectable ? 'is-single-selectable' : ''}" style="height: ${esc(nodeHeight)};">
                ${this.sortable ? `<div class="wctl-drag-gutter">${isDraggable ? `<span class="wctl-drag-handle" aria-hidden="true" tabindex="-1">${this.icons.dragHandle}</span>` : ''}</div>` : ''}
                <div class="wctl-indent" style="width: ${node._level * 1.5}rem"></div>

                <div class="wctl-zone-left ${isExpandableNode || showCheckbox ? '' : 'is-hidden'}">
                    ${isExpandableNode
                        ? `<span class="wctl-expander ${hideExpander ? 'is-hidden' : ''}" ${this._expanderTitleAttr(isExpanded)}>${isExpanded ? this.icons.chevronDown : this.icons.chevronRight}</span>`
                        : `<span class="wctl-expander is-placeholder"></span>`}
                    ${showCheckbox ? `<wc-checkbox class="wctl-node-checkbox"></wc-checkbox>` : ''}
                </div>

                <div class="wctl-zone-center">
                    ${node.image ? `<wc-image shape="circle" object-fit="cover" readonly style="max-width: calc(${esc(nodeHeight)} - 10px); width: calc(${esc(nodeHeight)} - 10px);"></wc-image>` : node.icon ? `<wc-icon class="wctl-custom-icon"></wc-icon>` : ''}
                    <div class="wctl-info">
                        <span class="wctl-title" title="${esc(node.title || '')}">${esc(node.title || '')}</span>
                        ${node.subtitle ? `<span class="wctl-subtitle" title="${esc(node.subtitle)}">${esc(node.subtitle)}</span>` : ''}
                    </div>
                </div>

                <div class="wctl-zone-right"></div>
            </div>
            <div class="wctl-children-container" style="display: ${isExpanded && hasChildren ? 'block' : 'none'}"></div>
            <div class="wctl-content-panel" style="display: ${isExpanded && hasContent ? 'block' : 'none'}"></div>
        `;

        const rowEl = div.querySelector('.wctl-row');

        // Accesibilidad: el .wctl-row es el treeitem focusable (roving tabindex se aplica en _applyRoving)
        rowEl.setAttribute('role', 'treeitem');
        rowEl.setAttribute('aria-level', String((node._level || 0) + 1));
        rowEl.setAttribute('tabindex', '-1');
        // node.borderColor: color del borde izquierdo de la fila (ver tree-list.css, --wctl-row-border-color)
        if (node.borderColor) {
            rowEl.classList.add('has-border-color');
            rowEl.style.setProperty('--wctl-row-border-color', String(node.borderColor));
        }
        if (isExpandableNode) rowEl.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        if (this.multiselect) {
            if (showCheckbox) rowEl.setAttribute('aria-checked', this._selectedIds.has(node.id) ? 'true' : 'false');
        } else if (isSelectable) {
            rowEl.setAttribute('aria-selected', this._selectedIds.has(node.id) ? 'true' : 'false');
        }
        // El contenedor de hijos es un grupo dentro del treeitem (el panel de content no es un grupo del árbol)
        const childGroup = div.querySelector(':scope > .wctl-children-container');
        if (childGroup) childGroup.setAttribute('role', 'group');

        // Modo Multiselect: Lógica de Checkboxes
        if (showCheckbox) {
            const checkbox = div.querySelector('.wctl-node-checkbox');
            checkbox.checked = this._selectedIds.has(node.id);
            checkbox.indeterminate = this._indeterminateIds.has(node.id);
            // node.disabled: el checkbox se ve con su estado (node.selected) pero el usuario no puede cambiarlo.
            if (node.disabled) {
                checkbox.disabled = true;
                rowEl.setAttribute('aria-disabled', 'true');
            }
            checkbox.addEventListener('change', e => this._handleMultiSelection(node.id, e.target.checked));
        }

        // Modo Single Select: Lógica de Fila Completa (ya filtrada si tiene hijos)
        if (!this.multiselect && isSelectable) {
            rowEl.addEventListener('click', (e) => {
                if (e.target.closest('.wctl-drag-gutter') || e.target.closest('.wctl-zone-left') || e.target.closest('.wctl-zone-right')) return;
                this._handleSingleSelection(node.id);
            });
        }

        // Drag & drop (Fase 3): por defecto se arrastra solo desde el asa dedicada; con
        // drag-anywhere, desde toda la fila (con guarda para no interceptar sus propios controles).
        if (isDraggable) {
            const handleEl = div.querySelector('.wctl-drag-handle');
            const dragSourceEl = this.dragAnywhere ? rowEl : handleEl;
            dragSourceEl.addEventListener('pointerdown', e => this._onDragPointerDown(e, node, rowEl, handleEl, this.dragAnywhere));
        }

        // Imagen
        if (node.image) {
            Object.assign(div.querySelector('wc-image'), node.image);
        }

        // Icono (wc-icon): string = nombre catálogo, objeto = config completa
        if (node.icon) {
            const iconEl = div.querySelector('.wctl-custom-icon');
            if (iconEl) {
                iconEl.size = 'lg';
                iconEl.borderColor = "var(--rf-color-border)";
                iconEl.shape = 'circle';
                if (typeof node.icon === 'string') {
                    iconEl.name = node.icon;
                    iconEl.colorBg = 'var(--color-grey-50)';
                } else {
                    iconEl.configure(node.icon);
                    if (!node.icon.colorBg) iconEl.colorBg = 'var(--color-grey-50)';
                }
            }
        }

        // Expander (el listener de click no se adjunta si hideExpander: el span sigue en el DOM,
        // oculto via CSS, para que expandNode()/collapseNode() sigan funcionando por codigo)
        if (isExpandableNode && !hideExpander) {
            const expander = div.querySelector('.wctl-expander');
            const childrenContainer = div.querySelector('.wctl-children-container');
            expander.addEventListener('click', e => {
                e.stopPropagation();
                this._handleDocumentClick(e);
                this._toggleExpand(node.id, expander, childrenContainer);
            });
        }

        // Clic en zona central
        if (node.onClick) {
            const centerZone = div.querySelector('.wctl-zone-center');
            centerZone.classList.add('is-clickable');
            centerZone.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('row-click', { detail: node, bubbles: true, composed: true }));
                this.safeExecute(node.onClick, node);
            });
        }

        const zoneRight = div.querySelector('.wctl-zone-right');

        if (node.rightTitle || node.rightSubtitle) {
            const infoEl = document.createElement('div');
            infoEl.className = 'wctl-right-info';
            if (node.rightTitle) {
                infoEl.appendChild(this._createRightZoneEl(node.rightTitle, 'wctl-right-title'));
            }
            if (node.rightSubtitle) {
                infoEl.appendChild(this._createRightZoneEl(node.rightSubtitle, 'wctl-right-subtitle'));
            }
            zoneRight.appendChild(infoEl);
        }

        if (node.buttons?.length) {
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'wctl-btn-bar';
            zoneRight.appendChild(actionsContainer);

            const bar = document.createElement('button-bar');
            bar.align = "right";
            if (this.callerContext) bar.callerContext = this.callerContext;
            bar.moreButton = { variant: 'white', ...node.moreButton };
            // Por defecto, botones pill de tamano md (solo icono = circulo).
            // Lo que el consumidor indique en el boton manda.
            bar.buttons = node.buttons.map(btnConfig => ({
                variant: 'white',
                ...btnConfig,
                shape: btnConfig.shape ?? 'pill',
                size: btnConfig.size ?? 'md',
                callbackArgs: [node],
            }));
            actionsContainer.appendChild(bar);
        }

        return div;
    }

    /**
     * Crea el elemento de un item de la zona derecha (rightTitle/rightSubtitle): string = texto
     * simple truncado con ellipsis (comportamiento previo); objeto = badge `<wc-status>` con esas
     * propiedades (`Object.assign`), mismo patron que `node.icon` (string vs objeto de config).
     * @param {string|Object} value
     * @param {string} className
     * @returns {HTMLElement}
     * @private
     */
    _createRightZoneEl(value, className) {
        if (value && typeof value === 'object') {
            const status = document.createElement('wc-status');
            status.className = 'wctl-right-status';
            Object.assign(status, value);
            return status;
        }
        const span = document.createElement('span');
        span.className = className;
        span.textContent = String(value);
        span.title = String(value);
        return span;
    }

    /**
     * Inyecta los nodos hijos en el DOM cuando el padre se expande (Lazy Loading).
     * @param {string} parentId
     * @param {HTMLElement} parentDOMElement
     * @private
     */
    _renderChildren(parentId, parentDOMElement) {
        const parentNode = this._nodeMap.get(parentId);
        const childrenContainer = parentDOMElement.querySelector(':scope > .wctl-children-container');

        // Alineacion del expander a nivel de ESTE grupo de hermanos (los hijos de parentNode), no
        // del arbol completo: puede que aqui abajo ninguno tenga a su vez hijos propios.
        this._syncGroupExpandableClass(childrenContainer, parentNode.children);

        if (childrenContainer.children.length > 0) return;

        parentNode.children.forEach(child => {
            if (this._currentSearch && !this._matchedIds.has(child.id)) return;
            const childEl = this._createNodeElement(child);
            childrenContainer.appendChild(childEl);
            if (this._expandedIds.has(child.id)) this._renderExpandedPart(child, childEl);
        });
    }

    // ==========================================
    // EXPAND / COLLAPSE
    // ==========================================

    // Tooltip de la flecha ("Abrir" / "Cerrar").
    // Sin la traduccion en Traduccion no se pone tooltip, no hay texto de reserva.
    _expanderTitle(isExpanded) {
        return (isExpanded ? Traduccion.CERRAR : Traduccion.ABRIR) || '';
    }

    _expanderTitleAttr(isExpanded) {
        const title = this._expanderTitle(isExpanded);
        return title ? `title="${WidgetBase.escapeHtml(title)}"` : '';
    }

    _setExpanderTitle(expanderEl, isExpanded) {
        const title = this._expanderTitle(isExpanded);
        if (title) expanderEl.setAttribute('title', title);
        else expanderEl.removeAttribute('title');
    }

    _toggleExpand(nodeId, expanderEl, childrenContainer) {
        const node = this._nodeMap.get(nodeId);
        const nodeEl = childrenContainer.parentElement;
        const contentPanel = nodeEl?.querySelector(':scope > .wctl-content-panel');
        const targetContainer = this._nodeHasContent(node) ? contentPanel : childrenContainer;
        const isExpanded = this._expandedIds.has(nodeId);

        if (isExpanded) {
            this._expandedIds.delete(nodeId);
            expanderEl.innerHTML = this.icons.chevronRight;
            this._setExpanderTitle(expanderEl, false);
            if (targetContainer) targetContainer.style.display = 'none';
        } else {
            if (this.accordion) {
                // Colapsa los demas hermanos (mismo _parentId) antes de expandir este — copia del Set
                // porque collapseNode() lo muta mientras se recorre.
                Array.from(this._expandedIds).forEach(otherId => {
                    if (otherId === nodeId) return;
                    const otherNode = this._nodeMap.get(otherId);
                    if (otherNode && otherNode._parentId === node?._parentId) this.collapseNode(otherId);
                });
            }
            this._expandedIds.add(nodeId);
            expanderEl.innerHTML = this.icons.chevronDown;
            this._setExpanderTitle(expanderEl, true);
            if (targetContainer) targetContainer.style.display = 'block';
            this._renderExpandedPart(node, nodeEl);
        }

        // Accesibilidad: reflejar el estado en aria-expanded del treeitem
        const row = nodeEl?.querySelector(':scope > .wctl-row');
        if (row && row.hasAttribute('aria-expanded')) {
            row.setAttribute('aria-expanded', this._expandedIds.has(nodeId) ? 'true' : 'false');
        }
        // El conjunto de filas visibles cambio: re-aplicar roving tabindex
        this._applyRoving();
    }

    // ==========================================
    // LÓGICAS DE SELECCIÓN
    // ==========================================

    _handleSingleSelection(nodeId) {
        if (this._selectedIds.has(nodeId)) {
            this._selectedIds.clear();
        } else {
            this._selectedIds.clear();
            this._selectedIds.add(nodeId);
        }

        this._syncDOMSelection();
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    _handleMultiSelection(nodeId, isChecked) {
        if (!this.multiselect) return;

        const node = this._nodeMap.get(nodeId);
        this._propagateSelectionDown(node, isChecked);
        this._propagateSelectionUp(node._parentId);
        this._syncDOMSelection();
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    _propagateSelectionDown(node, isChecked) {
        if (!this.multiselect) return;
        if (this._currentSearch && !this._matchedIds.has(node.id)) return;

        // Un nodo disabled conserva su estado: ni el usuario ni la cascada (ni Seleccionar todos) lo cambian.
        if (!node.disabled) {
            if (isChecked) {
                this._selectedIds.add(node.id);
                this._indeterminateIds.delete(node.id);
            } else {
                this._selectedIds.delete(node.id);
                this._indeterminateIds.delete(node.id);
            }
        }

        node.children?.forEach(child => this._propagateSelectionDown(child, isChecked));
    }

    _propagateSelectionUp(parentId) {
        if (!this.multiselect || !parentId) return;

        const parent = this._nodeMap.get(parentId);

        // Un padre disabled no recalcula su estado desde los hijos, pero el recalculo sigue hacia arriba.
        if (parent.disabled) {
            this._propagateSelectionUp(parent._parentId);
            return;
        }

        let allChecked = true, someChecked = false;

        parent.children.forEach(child => {
            if (this._selectedIds.has(child.id)) someChecked = true;
            else allChecked = false;
            if (this._indeterminateIds.has(child.id)) someChecked = true;
        });

        if (allChecked) {
            this._selectedIds.add(parentId);
            this._indeterminateIds.delete(parentId);
        } else if (someChecked) {
            this._selectedIds.delete(parentId);
            this._indeterminateIds.add(parentId);
        } else {
            this._selectedIds.delete(parentId);
            this._indeterminateIds.delete(parentId);
        }

        this._propagateSelectionUp(parent._parentId);
    }

    // ==========================================
    // SINCRONIZACIÓN DOM / VISTA
    // ==========================================

    _syncDOMSelection() {
        this._els.root.querySelectorAll('.wctl-node').forEach(nodeEl => {
            const id = nodeEl.dataset.id;
            const isSelected = this._selectedIds.has(id);
            const row = nodeEl.querySelector(':scope > .wctl-row');

            if (this.multiselect) {
                const checkbox = row.querySelector('.wctl-node-checkbox');
                if (checkbox) {
                    checkbox.checked = isSelected;
                    checkbox.indeterminate = this._indeterminateIds.has(id);
                    // aria-checked: mixed cuando es indeterminado
                    row.setAttribute('aria-checked', this._indeterminateIds.has(id) ? 'mixed' : (isSelected ? 'true' : 'false'));
                }
                row.classList.remove('is-selected');
            } else {
                if (isSelected) {
                    row.classList.add('is-selected');
                } else {
                    row.classList.remove('is-selected');
                }
                if (row.hasAttribute('aria-selected')) {
                    row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                }
            }
        });

        if (this.multiselect) this._syncGlobalCheckbox();
    }

    _syncGlobalCheckbox() {
        if (!this._els.selectAll || !this.multiselect) return;

        let allChecked = true, someChecked = false, hasVisibleNodes = false;

        if (this._currentSearch) {
            this._matchedIds.forEach(id => {
                if (this._nodeMap.get(id)?.disabled) return;
                hasVisibleNodes = true;
                if (this._selectedIds.has(id)) someChecked = true;
                else allChecked = false;
            });
        } else {
            this._rawData.forEach(rootNode => {
                if (rootNode.disabled) return;
                hasVisibleNodes = true;
                if (this._selectedIds.has(rootNode.id)) someChecked = true;
                else allChecked = false;
                if (this._indeterminateIds.has(rootNode.id)) someChecked = true;
            });
        }

        if (!hasVisibleNodes) allChecked = false;

        this._els.selectAll.checked = allChecked;
        this._els.selectAll.indeterminate = someChecked && !allChecked;
        this._els.selectAll.setAttribute('label', allChecked ? Traduccion.DESELECCIONAR_TODOS : Traduccion.SELECCIONAR_TODOS);
    }

    _handleSelectAll(isChecked) {
        if (!this.multiselect) return;
        this._rawData.forEach(root => this._propagateSelectionDown(root, isChecked));
        this._recalculateBottomUp();
        this._syncDOMSelection();
    }

    _recalculateBottomUp() {
        if (!this.multiselect) return;
        const allNodes = Array.from(this._nodeMap.values()).sort((a, b) => b._level - a._level);
        allNodes.forEach(node => {
            if (!node.children?.length || node.disabled) return;
            let allChecked = true, someChecked = false;
            node.children.forEach(child => {
                if (this._selectedIds.has(child.id)) someChecked = true;
                else allChecked = false;
                if (this._indeterminateIds.has(child.id)) someChecked = true;
            });
            if (allChecked) {
                this._selectedIds.add(node.id);
                this._indeterminateIds.delete(node.id);
            } else if (someChecked) {
                this._selectedIds.delete(node.id);
                this._indeterminateIds.add(node.id);
            } else {
                this._selectedIds.delete(node.id);
                this._indeterminateIds.delete(node.id);
            }
        });
    }

    _handleDocumentClick(e) {
        const path = e.composedPath();
        const clickedInsideRow = path.find(el => el.classList?.contains('wctl-zone-right'));

        if (!clickedInsideRow) {
            this.shadow.querySelectorAll('.wctl-row[style*="z-index"]').forEach(row => {
                row.style.zIndex = '';
            });
        }
    }

    // ==========================================
    // ACCESIBILIDAD: NAVEGACION POR TECLADO (patron tree de APG)
    // ==========================================

    /**
     * Filas (treeitems) actualmente visibles, en orden vertical.
     * @returns {HTMLElement[]}
     * @private
     */
    _visibleRows() {
        if (!this._els?.root) return [];
        return [...this._els.root.querySelectorAll('.wctl-row')].filter(r => r.offsetParent !== null);
    }

    /** @private */
    _nodeElById(nodeId) {
        if (!this._els?.root) return null;
        const cached = this._nodeElCache.get(String(nodeId));
        if (cached && this._els.root.contains(cached)) return cached;
        // Fallback: busqueda DOM (el nodo puede haberse recreado tras un re-render)
        const found = [...this._els.root.querySelectorAll('.wctl-node')].find(n => n.dataset.id === String(nodeId)) || null;
        if (found) this._nodeElCache.set(String(nodeId), found);
        return found;
    }

    /**
     * Aplica el roving tabindex: solo un treeitem es tabulable (tabindex=0), el resto -1.
     * @private
     */
    _applyRoving() {
        const rows = this._visibleRows();
        if (!rows.length) return;

        let focusRow = this._focusedId
            ? rows.find(r => r.closest('.wctl-node')?.dataset.id === String(this._focusedId))
            : null;

        if (!focusRow) {
            focusRow = rows[0];
            this._focusedId = focusRow.closest('.wctl-node')?.dataset.id || null;
        }

        rows.forEach(r => r.setAttribute('tabindex', r === focusRow ? '0' : '-1'));
    }

    /**
     * Mueve el foco (y el roving tabindex) a la fila indicada.
     * @param {HTMLElement} row
     * @private
     */
    _focusRow(row) {
        if (!row) return;
        this._focusedId = row.closest('.wctl-node')?.dataset.id || null;
        this._visibleRows().forEach(r => r.setAttribute('tabindex', r === row ? '0' : '-1'));
        row.focus();
    }

    /**
     * Expande un nodo programáticamente (equivalente a hacer clic en su chevron). No hace nada si
     * el nodo no existe, no es expandible (sin `children`/`content`) o ya está expandido. Si el nodo
     * tiene `content`, dispara su render lazy la primera vez. Funciona igual con `node.hideExpander`
     * (que solo bloquea la interacción del usuario, no el control programático).
     * @param {string|number} nodeId
     * @returns {boolean} true si se expandió; false si no había nada que hacer.
     */
    expandNode(nodeId) {
        if (this._expandedIds.has(nodeId)) return false;
        const nodeEl = this._nodeElById(nodeId);
        const expander = nodeEl?.querySelector(':scope > .wctl-row .wctl-expander');
        const container = nodeEl?.querySelector(':scope > .wctl-children-container');
        if (!expander || !container) return false;
        this._toggleExpand(nodeId, expander, container);
        return true;
    }

    /**
     * Colapsa un nodo programáticamente (equivalente a hacer clic en su chevron). No hace nada si
     * el nodo no existe o ya está colapsado. El contenido ya renderizado se conserva oculto (no se
     * pierde su estado, p.ej. un `dynamic-form` anidado) para cuando se vuelva a expandir. Funciona
     * igual con `node.hideExpander` (que solo bloquea la interacción del usuario, no el control
     * programático).
     * @param {string|number} nodeId
     * @returns {boolean} true si se colapsó; false si no había nada que hacer.
     */
    collapseNode(nodeId) {
        if (!this._expandedIds.has(nodeId)) return false;
        const nodeEl = this._nodeElById(nodeId);
        const expander = nodeEl?.querySelector(':scope > .wctl-row .wctl-expander');
        const container = nodeEl?.querySelector(':scope > .wctl-children-container');
        if (!expander || !container) return false;
        this._toggleExpand(nodeId, expander, container);
        return true;
    }

    /**
     * Activa (selecciona/deselecciona) la fila desde teclado.
     * Single: selecciona si es seleccionable; si es un padre no seleccionable, alterna expansion.
     * Multi: alterna el checkbox del nodo.
     * @private
     */
    _activateRow(nodeId) {
        const node = this._nodeMap.get(String(nodeId));
        const isExpandableNode = this._nodeIsExpandable(node);

        if (this.multiselect) {
            const checkbox = this._nodeElById(nodeId)?.querySelector(':scope > .wctl-row .wctl-node-checkbox');
            if (checkbox && !checkbox.disabled) {
                const newVal = !checkbox.checked;
                checkbox.checked = newVal;
                this._handleMultiSelection(nodeId, newVal);
            }
            return;
        }

        // Single select
        const isSelectable = (node?.selectable === true || this.hasAttribute('default-selectable')) && !isExpandableNode;
        if (isSelectable) {
            this._handleSingleSelection(nodeId);
        } else if (isExpandableNode && !node?.hideExpander) {
            // Padre/content no seleccionable: Enter/Espacio alterna la expansion
            if (this._expandedIds.has(nodeId)) this.collapseNode(nodeId);
            else this.expandNode(nodeId);
        }
    }

    /**
     * Navegacion por teclado del arbol (APG tree).
     * @param {KeyboardEvent} e
     * @private
     */
    _handleTreeKeydown(e) {
        // Ctrl/Cmd+flecha: mover el nodo (Fase 4), no navegar el foco. Se comprueba ANTES de la
        // navegacion normal porque comparte las mismas teclas (ArrowUp/Down/Left/Right).
        if ((e.ctrlKey || e.metaKey) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const currentRow = e.target.closest && e.target.closest('.wctl-row');
            const nodeId = currentRow?.closest('.wctl-node')?.dataset.id;
            if (nodeId != null && this._handleKeyboardMove(e.key, nodeId)) e.preventDefault();
            return;
        }

        const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' '];
        if (!navKeys.includes(e.key)) return;

        const currentRow = e.target.closest && e.target.closest('.wctl-row');
        if (!currentRow) return;

        const rows = this._visibleRows();
        const idx = rows.indexOf(currentRow);
        if (idx < 0) return;

        const nodeEl = currentRow.closest('.wctl-node');
        const nodeId = nodeEl?.dataset.id;
        const node = this._nodeMap.get(String(nodeId));
        const isExpandableNode = this._nodeIsExpandable(node);
        const isExpanded = this._expandedIds.has(nodeId);

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this._focusRow(rows[Math.min(idx + 1, rows.length - 1)]);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this._focusRow(rows[Math.max(idx - 1, 0)]);
                break;
            case 'Home':
                e.preventDefault();
                this._focusRow(rows[0]);
                break;
            case 'End':
                e.preventDefault();
                this._focusRow(rows[rows.length - 1]);
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (isExpandableNode && !isExpanded && !node?.hideExpander) {
                    this.expandNode(nodeId);
                } else if (isExpandableNode && isExpanded) {
                    // Mover a la primera fila hija (la siguiente visible) — navegacion, no toggle:
                    // funciona igual con hideExpander (el contenido ya desplegado sigue siendo accesible)
                    const after = this._visibleRows();
                    this._focusRow(after[after.indexOf(currentRow) + 1]);
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (isExpandableNode && isExpanded && !node?.hideExpander) {
                    this.collapseNode(nodeId);
                } else if (node?._parentId) {
                    const parentEl = this._nodeElById(node._parentId);
                    const parentRow = parentEl?.querySelector(':scope > .wctl-row');
                    if (parentRow) this._focusRow(parentRow);
                }
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                this._activateRow(nodeId);
                break;
        }
    }
}

if (!customElements.get('tree-list')) customElements.define('tree-list', TreeList);