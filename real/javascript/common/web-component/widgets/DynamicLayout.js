/**
 * @fileoverview DynamicLayout.js
 * Widget de layout dinámico en cuadrícula (CSS Grid).
 * Permite crear páginas, paneles y secciones de forma visual y declarativa.
 *
 * @tag dynamic-layout
 * @fires layout-rendered - Cuando el layout se ha renderizado con la configuración de celdas.
 * @fires layout-responsive-changed - Cuando el layout entra o sale del modo responsivo.
 */
class DynamicLayout extends WidgetBase {

    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });

        /** @private @type {Array<Object>} Configuración de celdas del grid */
        this._cells = [];

        /** @private @type {Array<{size?:string, min?:string, max?:string}>} Tamaño por fila */
        this._rowSizes = [];

        /** @private @type {Array<{size?:string, min?:string, max?:string}>} Tamaño por columna */
        this._colSizes = [];

        /** @private @type {boolean} Flag para evitar renders antes de conectar al DOM */
        this._initialized = false;

        /** @private @type {ResizeObserver|null} Observer para comportamiento responsivo */
        this._resizeObserver = null;

        /** @private @type {boolean} Estado actual del modo responsivo */
        this._isResponsive = false;

        /** @private @type {Map<string, Object>} Tamaños originales guardados al colapsar celdas */
        this._savedSizes = new Map();
    }

    /**
     * Nombre del archivo CSS principal del componente.
     */
    get componentCssName() {
        return 'dynamic-layout.css';
    }

    /**
     * Atributos HTML observados.
     */
    static get observedAttributes() {
        return [...super.observedAttributes, 'columns', 'rows', 'gap', 'responsive', 'responsive-breakpoint'];
    }

    /**
     * Callback cuando cambia un atributo observado.
     */
    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue === newValue) return;

        if (['columns', 'gap'].includes(name)) {
            this._updateGridVars();
        }
        if (name === 'responsive' || name === 'responsive-breakpoint') {
            this._setupResizeObserver();
        }
    }

    /**
     * Callback cuando el componente se añade al DOM.
     */
    connectedCallback() {
        super.connectedCallback();
        this._render();
        this._setupResizeObserver();
    }

    /**
     * Callback cuando el componente se elimina del DOM.
     */
    disconnectedCallback() {
        this._teardownResizeObserver();
    }

    // =========================================================================
    // GETTERS / SETTERS
    // =========================================================================

    /** @type {number} Número de columnas del grid (default: 3) */
    get columns() { return parseInt(this.getAttribute('columns') || '3'); }
    set columns(val) { this.setAttribute('columns', String(parseInt(val) || 3)); }

    /** @type {number} Número de filas para la cuadrícula por defecto (default: 3, 0 = auto) */
    get rows() { return parseInt(this.getAttribute('rows') || '0'); }
    set rows(val) { this.setAttribute('rows', String(parseInt(val) || 0)); }

    /** @type {string} Espacio entre celdas (default: '1rem') */
    get gap() { return this.getAttribute('gap') || '1rem'; }
    set gap(val) { this.setAttribute('gap', val || '1rem'); }

    /** @type {boolean} Habilita el comportamiento responsivo (default: true) */
    get responsive() {
        const attr = this.getAttribute('responsive');
        return attr === null || attr !== 'false';
    }
    set responsive(val) { this.setAttribute('responsive', String(val)); }

    /** @type {number} Ancho en px por debajo del cual activa el modo responsivo (default: 768) */
    get responsiveBreakpoint() { return parseInt(this.getAttribute('responsive-breakpoint') || '768'); }
    set responsiveBreakpoint(val) { this.setAttribute('responsive-breakpoint', String(parseInt(val) || 768)); }

    /**
     * Columnas reales del grid. `colSizes` manda cuando esta definido, porque genera
     * grid-template-columns explicito y deja sin efecto la variable --dl-columns del atributo
     * `columns` (que ademas vale 3 por defecto aunque nadie lo haya puesto).
     * @returns {number}
     * @private
     */
    _columnasReales() {
        return this._colSizes.length > 0 ? this._colSizes.length : this.columns;
    }

    /**
     * Tamaño de cada fila del grid. JS-only (no hay atributo HTML equivalente).
     * Genera grid-template-rows. Si un objeto tiene `size`, se usa como valor fijo;
     * si tiene `min`/`max`, se genera minmax(min, max). Un objeto vacío ´{}´ produce minmax(0, 1fr).
     * El host debe tener height explícito para que 1fr funcione.
     *
     * @example
     * layout.rowSizes = [
     *   { size: '56px' },   // header fijo
     *   {},                  // contenido flexible — minmax(0, 1fr)
     *   { size: '44px' }    // footer fijo
     * ];
     * @type {Array<{ size?: string, min?: string, max?: string }>}
     */
    get rowSizes() { return this._rowSizes.map(r => ({ ...r })); }
    set rowSizes(val) {
        this._rowSizes = Array.isArray(val) ? val.map(r => ({ ...r })) : [];
        this._updateGridVars();
    }

    /**
     * Tamaño de cada columna del grid. JS-only (no hay atributo HTML equivalente).
     * Genera grid-template-columns. Misma lógica que rowSizes.
     * Cuando se establece, reemplaza el repeat(N, 1fr) por defecto.
     * El número de columnas se infiere de colSizes.length.
     *
     * @example
     * layout.colSizes = [
     *   { min: '160px', max: '200px' },  // sidebar acotado
     *   {},                               // columnas flexibles
     *   {},
     *   {}
     * ];
     * @type {Array<{ size?: string, min?: string, max?: string }>}
     */
    get colSizes() { return this._colSizes.map(c => ({ ...c })); }
    set colSizes(val) {
        this._colSizes = Array.isArray(val) ? val.map(c => ({ ...c })) : [];
        this._updateGridVars();
    }
    /**
     * Configuración de celdas del layout.
     * Cada celda define su nombre (slot), cuántas columnas y filas ocupa, y si es sticky.
     *
     * @type {Array<{
     *   name: string,
     *   colSpan?: number,
     *   rowSpan?: number,
     *   sticky?: 'top'|'bottom'|'left'|'right'
     * }>}
     */
    get cells() { return this._cells.map(c => ({ ...c })); }
    set cells(val) {
        this._cells = Array.isArray(val) ? val.map(c => ({ ...c })) : [];
        this._renderCells();
    }

    // =========================================================================
    // API PÚBLICA
    // =========================================================================

    /**
     * Añade o actualiza una celda en el layout.
     * Si ya existe una celda con ese nombre, la actualiza en su posición actual.
     * Si es nueva, se puede indicar dónde insertarla con el parámetro `position`.
     *
     * @param {string} name - Nombre único de la celda (se usará como slot name).
     * @param {Object} config - Configuración de la celda.
     * @param {{ before?: string, after?: string }|null} [position] - Posición de inserción para celdas nuevas.
     *   - `{ before: 'otra-celda' }` → inserta justo antes de la celda indicada.
     *   - `{ after: 'otra-celda' }` → inserta justo después de la celda indicada.
     *   - Si no se indica (o la referencia no existe), se añade al final.
     */
    setCell(name, config, position = null) {
        const idx = this._cells.findIndex(c => c.name === name);
        if (idx >= 0) {
            // Celda existente → actualizar en su posición actual
            this._cells[idx] = { ...this._cells[idx], name, ...config };
        } else {
            // Celda nueva → insertar según position
            const newCell = { name, ...config };
            if (position?.before) {
                const refIdx = this._cells.findIndex(c => c.name === position.before);
                this._cells.splice(refIdx >= 0 ? refIdx : this._cells.length, 0, newCell);
            } else if (position?.after) {
                const refIdx = this._cells.findIndex(c => c.name === position.after);
                this._cells.splice(refIdx >= 0 ? refIdx + 1 : this._cells.length, 0, newCell);
            } else {
                this._cells.push(newCell);
            }
        }
        this._renderCells();
    }

    /**
     * Elimina una celda del layout.
     * @param {string} name - Nombre de la celda a eliminar.
     */
    removeCell(name) {
        this._cells = this._cells.filter(c => c.name !== name);
        this._renderCells();
    }

    /**
     * Devuelve el elemento hijo (Light DOM) asignado a una celda concreta.
     * Equivalente a `layout.querySelector('[slot="nombre"]')`.
     * @param {string} name - Nombre de la celda.
     * @returns {Element|null}
     */
    getCellContent(name) {
        return this.querySelector(`[slot="${name}"]`) ?? null;
    }

    /**
     * Colapsa la columna o fila de una celda (según su propiedad `collapsible`).
     * El track queda reducido a una franja de 28px (configurable vía --dl-collapse-handle)
     * que mantiene visible el botón de expansión.
     * @param {string} name - Nombre de la celda.
     */
    collapse(name) {
        this._setCollapsed(name, true);
    }

    /**
     * Expande una celda previamente colapsada, restaurando sus tamaños originales.
     * @param {string} name - Nombre de la celda.
     */
    expand(name) {
        this._setCollapsed(name, false);
    }

    /**
     * Alterna entre colapsar y expandir una celda.
     * @param {string} name - Nombre de la celda.
     */
    toggleCollapse(name) {
        const cellConfig = this._cells.find(c => c.name === name);
        if (!cellConfig?.collapsible) return;
        const axes = cellConfig.collapsible === 'both' ? ['column', 'row'] : [cellConfig.collapsible];
        const anyCollapsed = axes.some(a => this._savedSizes.has(`${name}:${a}`));
        this._setCollapsed(name, !anyCollapsed);
    }

    // =========================================================================
    // RENDERIZADO PRIVADO
    // =========================================================================

    /**
     * Renderiza la estructura base del Shadow DOM.
     * @private
     */
    _render() {
        // Preservar los links de CSS ya inyectados por WidgetBase
        const existingLinks = Array.from(this.shadow.querySelectorAll('link[rel="stylesheet"]'));
        this.shadow.innerHTML = '';
        existingLinks.forEach(link => this.shadow.appendChild(link));

        const grid = document.createElement('div');
        grid.className = 'dl-grid';
        this._applyGridVarsToEl(grid);
        this.shadow.appendChild(grid);

        this._initialized = true;

        // Si no hay celdas configuradas, crear la cuadrícula por defecto
        if (this._cells.length === 0) {
            this._createDefaultCells();
        } else {
            this._renderCells();
        }
    }

    /**
     * Crea la cuadrícula por defecto (columns x rows) cuando no hay configuración.
     * @private
     */
    _createDefaultCells() {
        const cols = this.columns;
        const numRows = (this.rows > 0) ? this.rows : 3;
        const defaultCells = [];
        for (let r = 1; r <= numRows; r++) {
            for (let c = 1; c <= cols; c++) {
                defaultCells.push({ name: `cell-${r}-${c}` });
            }
        }
        this._cells = defaultCells;
        this._renderCells();
    }

    /**
     * Resuelve la configuración de una celda (reservado para extensiones futuras).
     * @param {Object} cell - Configuración de la celda.
     * @returns {Object} Copia de la configuración.
     * @private
     */
    _resolveCell(cell) {
        return { ...cell };
    }

    /**
     * Renderiza todas las celdas en el grid del Shadow DOM.
     * Elimina las celdas existentes y las recrea desde `this._cells`.
     * @private
     */
    _renderCells() {
        if (!this._initialized) return;

        const grid = this.shadow.querySelector('.dl-grid');
        if (!grid) return;

        // Limpiar celdas anteriores
        grid.querySelectorAll('.dl-cell').forEach(el => el.remove());

        this._applyGridVarsToEl(grid);

        const positions = this._computeCellPositions();

        this._cells.forEach((cellConfig, idx) => {
            const resolved = this._resolveCell(cellConfig);

            const cellEl = document.createElement('div');
            cellEl.className = this._buildCellClass(resolved);
            cellEl.setAttribute('style', this._buildCellStyle(resolved));

            // Si la fila tiene tamaño fijo (size), guardar como var CSS para
            // que el modo responsivo (flex) también respete el alto
            const rowDef = this._rowSizes[positions[idx].row];
            if (rowDef?.size) {
                cellEl.style.setProperty('--dl-cell-fixed-h', rowDef.size);
            }

            cellEl.dataset.cellName = resolved.name;

            // Botón de colapso ANTES del slot para asegurar que esté encima en el painting order
            if (resolved.collapsible) {
                cellEl.appendChild(this._buildCollapseBtn(resolved));
            }

            const slot = document.createElement('slot');
            slot.name = resolved.name;
            cellEl.appendChild(slot);

            grid.appendChild(cellEl);
        });

        this.dispatchEvent(new CustomEvent('layout-rendered', {
            bubbles: true,
            composed: true,
            detail: { cells: this.cells }
        }));
    }

    /**
     * Construye la cadena de clases CSS para una celda según su configuración.
     * @param {Object} cell - Configuración resuelta de la celda.
     * @returns {string}
     * @private
     */
    _buildCellClass(cell) {
        const classes = ['dl-cell'];
        if (cell.sticky) classes.push(`dl-cell--sticky-${cell.sticky}`);
        if (cell.scroll) {
            const dir = (cell.scroll === true || cell.scroll === 'vertical') ? 'v'
                      : cell.scroll === 'horizontal' ? 'h'
                      : 'both';
            classes.push(`dl-cell--scroll-${dir}`);
        }
        return classes.join(' ');
    }

    /**
     * Construye el atributo style inline para una celda (posición en el grid).
     * @param {Object} cell - Configuración resuelta de la celda.
     * @param {number} idx - Índice de la celda (para el order responsivo por defecto).
     * @returns {string}
     * @private
     */
    _buildCellStyle(cell) {
        const colSpan = cell.colSpan ?? 1;
        const rowSpan = cell.rowSpan ?? 1;
        return [
            `grid-column: span ${colSpan}`,
            `grid-row: span ${rowSpan}`
        ].join('; ');
    }

    /**
     * Aplica las variables CSS del grid a un elemento contenedor.
     * @param {HTMLElement} el
     * @private
     */
    _applyGridVarsToEl(el) {
        el.style.setProperty('--dl-columns', this._colSizes.length > 0 ? this._colSizes.length : this.columns);
        el.style.setProperty('--dl-gap', this.gap);
        if (this._rowSizes.length > 0) {
            el.style.setProperty('grid-template-rows', this._buildSizesTemplate(this._rowSizes));
        } else {
            el.style.removeProperty('grid-template-rows');
        }
        if (this._colSizes.length > 0) {
            el.style.setProperty('grid-template-columns', this._buildSizesTemplate(this._colSizes));
        } else {
            el.style.removeProperty('grid-template-columns');
        }
    }

    /**
     * Convierte un array de objetos de tamaño en una cadena de tracks CSS.
     * - `{ size: '56px' }` → `'56px'`  (tamaño fijo)
     * - `{ min: 'X', max: 'Y' }` → `'minmax(X, Y)'`  (rango fijo, no flexible)
     * - `{ min: 'X' }` → `'minmax(X, 1fr)'`  (al menos X, crece con fr)
     * - `{ max: 'Y' }` → `'minmax(0, Y)'`  (hasta Y)
     * - `{}` → `'minmax(0, 1fr)'`  (totalmente flexible)
     *
     * Nota: CSS Grid no permite tracks "flexibles acotados" (que crezcan con fr
     * pero con un máximo fijo). `minmax(X, Y)` con valores fijos NO participa
     * en la distribución fr — se queda en el mínimo si hay tracks fr.
     * Para comportamiento flexible acotado, usar porcentajes: `{ min: '10%', max: '20%' }`.
     *
     * @param {Array<{ size?: string, min?: string, max?: string }>} sizes
     * @returns {string}
     * @private
     */
    _buildSizesTemplate(sizes) {
        return sizes.map(s => {
            if (s.size) return s.size;
            const min = s.min ?? '0';
            const max = s.max ?? '1fr';
            return `minmax(${min}, ${max})`;
        }).join(' ');
    }

    /**
     * Calcula la posición (fila y columna, 0-based) de cada celda simulando
     * el auto-placement de CSS Grid (row dense).
     * @returns {Array<{row: number, col: number}>}
     * @private
     */
    _computeCellPositions() {
        const colCount = this._colSizes.length > 0 ? this._colSizes.length : this.columns;
        const occupied = [];

        const isOccupied = (row, col) => occupied[row]?.has(col);

        const markOccupied = (startRow, startCol, rowSpan, colSpan) => {
            for (let r = startRow; r < startRow + rowSpan; r++) {
                if (!occupied[r]) occupied[r] = new Set();
                for (let c = startCol; c < startCol + colSpan; c++) {
                    occupied[r].add(c);
                }
            }
        };

        const fits = (row, col, rowSpan, colSpan) => {
            if (col + colSpan > colCount) return false;
            for (let r = row; r < row + rowSpan; r++) {
                for (let c = col; c < col + colSpan; c++) {
                    if (isOccupied(r, c)) return false;
                }
            }
            return true;
        };

        return this._cells.map(cell => {
            const colSpan = Math.min(cell.colSpan ?? 1, colCount);
            const rowSpan = cell.rowSpan ?? 1;
            let startRow = 0, startCol = 0, placed = false;
            while (!placed) {
                for (let col = 0; col <= colCount - colSpan; col++) {
                    if (fits(startRow, col, rowSpan, colSpan)) {
                        markOccupied(startRow, col, rowSpan, colSpan);
                        startCol = col;
                        placed = true;
                        break;
                    }
                }
                if (!placed) startRow++;
            }
            return { row: startRow, col: startCol };
        });
    }

    /**
     * Devuelve el SVG de un chevron apuntando en la dirección correcta
     * según el eje y el estado de colapso.
     * @param {'column'|'row'} axis
     * @param {boolean} isCollapsed
     * @returns {string} SVG crudo listo para el atributo icon de wc-button.
     * @private
     */
    _getChevronSvg(axis, isCollapsed) {
        // Partimos del chevronDown (∨). Rotaciones:
        //   column no colapsado → IZQUIERDA (‹) → rotate(-90deg)
        //   column colapsado    → DERECHA   (›) → rotate(90deg)
        //   row    no colapsado → ARRIBA    (∧) → rotate(180deg)
        //   row    colapsado    → ABAJO     (∨) → rotate(0deg)
        const deg = axis === 'column'
            ? (isCollapsed ? 180 : 0)
            : (isCollapsed ? -90 : 90);

        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${deg}deg);display:block"><line x1="21" y1="4" x2="21" y2="20"></line><line x1="16" y1="12" x2="3" y2="12"></line><polyline points="10 19 3 12 10 5"></polyline></svg>`;        
    }

    /**
     * Crea el contenedor con los botones wc-button de colapso para una celda.
     * Para collapsible:'both' crea un botón por eje de forma independiente.
     * @param {Object} cell - Configuración resuelta de la celda.
     * @returns {HTMLDivElement}
     * @private
     */
    _buildCollapseBtn(cell) {
        const container = document.createElement('div');
        container.className = 'dl-cell__collapse-btns';

        const axes = cell.collapsible === 'both' ? ['column', 'row'] : [cell.collapsible];
        for (const axis of axes) {
            const btn = document.createElement('wc-button');
            btn.setAttribute('variant', 'white');
            btn.setAttribute('shape', 'pill');
            btn.setAttribute('aria-expanded', 'true');
            btn.setAttribute('aria-label', 'Colapsar');
            btn.setAttribute('data-axis', axis);
            btn.icon = this._getChevronSvg(axis, false);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Leemos data-axis en el momento del click para respetar
                // el cambio dinámico al entrar/salir del modo responsivo
                const currentAxis = btn.dataset.axis;
                const key = `${cell.name}:${currentAxis}`;
                this._setCollapsed(cell.name, !this._savedSizes.has(key), currentAxis);
            });
            container.appendChild(btn);
        }
        return container;
    }

    /**
     * Colapsa o expande el track (columna/fila) de una celda.
     * Al colapsar, guarda los tamaños originales en `_savedSizes` y reduce el
     * track a una franja de 28px (CSS var --dl-collapse-handle) para que el
     * botón de expansión siga visible. Al expandir, restaura los originales.
     * @param {string} name - Nombre de la celda.
     * @param {boolean} shouldCollapse - true para colapsar, false para expandir.
     * @private
     */
    _setCollapsed(name, shouldCollapse, axisOverride = null) {
        const cellConfig = this._cells.find(c => c.name === name);
        if (!cellConfig?.collapsible) return;

        const cellAxis = cellConfig.collapsible;
        // Qué ejes procesar: si se pasa axisOverride solo ese, si no todos los del cell
        const axesToProcess = axisOverride
            ? [axisOverride]
            : (cellAxis === 'both' ? ['column', 'row'] : [cellAxis]);

        const positions = this._computeCellPositions();
        const idx = this._cells.findIndex(c => c.name === name);
        if (idx < 0) return;

        const pos = positions[idx];
        const colCount = this._colSizes.length > 0 ? this._colSizes.length : this.columns;
        const colSpan = Math.min(cellConfig.colSpan ?? 1, colCount);
        const rowSpan = cellConfig.rowSpan ?? 1;

        for (const axis of axesToProcess) {
            const key = `${name}:${axis}`;

            if (shouldCollapse) {
                if (this._savedSizes.has(key)) continue; // ya colapsado en este eje

                const saved = {};

                if (axis === 'column') {
                    // Inicializar _colSizes si no hay definición previa
                    if (this._colSizes.length === 0) {
                        this._colSizes = Array.from({ length: colCount }, () => ({}));
                    }
                    saved.colEntries = [];
                    for (let c = pos.col; c < pos.col + colSpan; c++) {
                        saved.colEntries.push({ idx: c, size: { ...this._colSizes[c] } });
                        // Primera columna del span: franja handle visible; resto: 0
                        this._colSizes[c] = (c === pos.col)
                            ? { size: 'var(--dl-collapse-handle, 28px)' }
                            : { size: '0' };
                    }
                }

                if (axis === 'row') {
                    // Guardar el valor actual de --dl-cell-fixed-h para poder restaurarlo
                    const cellElRow = this.shadow.querySelector(`[data-cell-name="${name}"]`);
                    saved.fixedH = cellElRow?.style.getPropertyValue('--dl-cell-fixed-h') || null;

                    // Actualizar --dl-cell-fixed-h directamente: en modo responsivo (flex)
                    // grid-template-rows no tiene efecto, pero este custom property sí.
                    // Usamos getComputedStyle para obtener el valor real de --dl-collapse-handle
                    // (o 28px por defecto) porque vars anidados en inline styles pueden no resolverse.
                    if (cellElRow) {
                        const handleSize = getComputedStyle(this).getPropertyValue('--dl-collapse-handle').trim() || '28px';
                        cellElRow.style.setProperty('--dl-cell-fixed-h', handleSize);
                    }

                    if (this._rowSizes.length > 0) {
                        saved.rowEntries = [];
                        for (let r = pos.row; r < pos.row + rowSpan; r++) {
                            saved.rowEntries.push({ idx: r, size: { ...this._rowSizes[r] } });
                            this._rowSizes[r] = (r === pos.row)
                                ? { size: 'var(--dl-collapse-handle, 28px)' }
                                : { size: '0' };
                        }
                    }
                }

                this._savedSizes.set(key, saved);

            } else {
                if (!this._savedSizes.has(key)) continue; // no estaba colapsado en este eje

                const saved = this._savedSizes.get(key);
                if (saved.colEntries) {
                    saved.colEntries.forEach(({ idx, size }) => { this._colSizes[idx] = size; });
                }
                if (saved.rowEntries) {
                    saved.rowEntries.forEach(({ idx, size }) => { this._rowSizes[idx] = size; });
                }
                // Restaurar --dl-cell-fixed-h en la celda
                if (axis === 'row') {
                    const cellElRow = this.shadow.querySelector(`[data-cell-name="${name}"]`);
                    if (cellElRow) {
                        if (saved.fixedH) {
                            cellElRow.style.setProperty('--dl-cell-fixed-h', saved.fixedH);
                        } else {
                            cellElRow.style.removeProperty('--dl-cell-fixed-h');
                        }
                    }
                }
                this._savedSizes.delete(key);
            }
        }

        this._updateGridVars();

        // Actualizar estado visual de la celda y de los botones
        const colCollapsed = this._savedSizes.has(`${name}:column`);
        const rowCollapsed = this._savedSizes.has(`${name}:row`);
        const anyCollapsed = colCollapsed || rowCollapsed;

        const cellEl = this.shadow.querySelector(`[data-cell-name="${name}"]`);
        if (cellEl) {
            cellEl.classList.toggle('dl-cell--col-collapsed', colCollapsed);
            cellEl.classList.toggle('dl-cell--row-collapsed', rowCollapsed);
            cellEl.classList.toggle('dl-cell--collapsed', anyCollapsed);

            for (const axis of axesToProcess) {
                const isAxisCollapsed = axis === 'column' ? colCollapsed : rowCollapsed;
                const btn = cellEl.querySelector(`wc-button[data-axis="${axis}"]`);
                if (btn) {
                    btn.setAttribute('aria-expanded', String(!isAxisCollapsed));
                    btn.setAttribute('aria-label', isAxisCollapsed ? 'Expandir' : 'Colapsar');
                    btn.icon = this._getChevronSvg(axis, isAxisCollapsed);
                }
            }
        }

        /**
         * @event layout-collapse-change
         * @property {string} detail.cellName - Nombre de la celda colapsada/expandida.
         * @property {boolean} detail.collapsed - true si está colapsada.
         * @property {string} detail.axis - 'column' | 'row' | 'both'
         */
        this.dispatchEvent(new CustomEvent('layout-collapse-change', {
            bubbles: true,
            composed: true,
            detail: { cellName: name, collapsed: anyCollapsed, axis: axisOverride ?? cellAxis }
        }));
    }

    /**
     * Actualiza las variables CSS del grid sin re-renderizar las celdas.
     * @private
     */
    _updateGridVars() {
        if (!this._initialized) return;
        const grid = this.shadow.querySelector('.dl-grid');
        if (grid) this._applyGridVarsToEl(grid);
    }

    // =========================================================================
    // RESPONSIVO
    // =========================================================================

    /**
     * Inicializa el ResizeObserver para detectar el modo responsivo.
     * @private
     */
    _setupResizeObserver() {
        this._teardownResizeObserver();
        if (!this.responsive) return;

        this._resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                // Con una sola columna el apilado responsivo es un no-op visual (las celdas ya
                // estan apiladas en vertical), pero NO es inocuo: .dl-grid--responsive lleva
                // "height: auto !important", que rompe cualquier cadena de alturas basada en
                // height:100% — el grid deja de ceñirse a su contenedor y crece con el contenido.
                // Si dentro hay algo que necesita recorte para scrollear (p.ej. un tree-list, que
                // ademas pagina por IntersectionObserver y sin scroll cargaria TODO de golpe), se
                // rompe en silencio. Un layout de 1 columna dentro de un panel estrecho (<768px)
                // es un caso muy comun, asi que se excluye del modo responsivo.
                const shouldBeResponsive = this._columnasReales() > 1
                    && width > 0 && width < this.responsiveBreakpoint;

                if (shouldBeResponsive !== this._isResponsive) {
                    this._isResponsive = shouldBeResponsive;
                    const grid = this.shadow.querySelector('.dl-grid');
                    if (grid) {
                        grid.classList.toggle('dl-grid--responsive', this._isResponsive);
                    }

                    // Adaptar los botones de colapso: en responsive, las celdas
                    // con collapsible:'column' pasan a colapsar la fila (y viceversa)
                    this._updateCollapseButtonsForResponsive();

                    /**
                     * @event layout-responsive-changed
                     * @property {boolean} detail.isResponsive - true si el layout está en modo responsivo.
                     * @property {number} detail.width - Ancho actual del componente en px.
                     */
                    this.dispatchEvent(new CustomEvent('layout-responsive-changed', {
                        bubbles: true,
                        composed: true,
                        detail: { isResponsive: this._isResponsive, width }
                    }));
                }
            }
        });

        this._resizeObserver.observe(this);
    }

    /**
     * Desconecta y limpia el ResizeObserver.
     * @private
     */
    _teardownResizeObserver() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
    }

    /**
     * Cuando el layout cambia entre modo normal y responsivo, actualiza los
     * botones de colapso de las celdas con collapsible:'column':
     * - En responsivo: el eje pasa a 'row' (ya no hay columnas).
     * - En normal: el eje vuelve a 'column'.
     * Si la celda estaba colapsada en el eje anterior, se expande primero.
     * @private
     */
    _updateCollapseButtonsForResponsive() {
        this._cells.forEach(cellConfig => {
            if (cellConfig.collapsible !== 'column') return;

            const newAxis = this._isResponsive ? 'row' : 'column';
            const oldAxis = this._isResponsive ? 'column' : 'row';

            // Si estaba colapsado en el eje que ya no aplica, expandirlo primero
            const oldKey = `${cellConfig.name}:${oldAxis}`;
            if (this._savedSizes.has(oldKey)) {
                this._setCollapsed(cellConfig.name, false, oldAxis);
            }

            // Actualizar el botón: cambiar data-axis e icono
            const cellEl = this.shadow.querySelector(`[data-cell-name="${cellConfig.name}"]`);
            if (!cellEl) return;
            const btn = cellEl.querySelector(`wc-button[data-axis="${oldAxis}"]`);
            if (btn) {
                btn.setAttribute('data-axis', newAxis);
                btn.icon = this._getChevronSvg(newAxis, false);
                btn.setAttribute('aria-expanded', 'true');
                btn.setAttribute('aria-label', 'Colapsar');
            }
        });
    }
}

if (!customElements.get('dynamic-layout')) customElements.define('dynamic-layout', DynamicLayout);