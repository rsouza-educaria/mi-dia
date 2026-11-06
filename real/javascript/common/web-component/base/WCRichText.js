/**
 * WCRichText - Editor de texto enriquecido
 * 
 * Componente web que integra TipTap v3 como editor headless,
 * proporcionando una API propia para facilitar cambios futuros de librería.
 * 
 * @extends WCBaseElement
 * @example
 * <wc-rich-text name="contenido" placeholder="Escribe aquí..." required></wc-rich-text>
 *
 * `value` es una propiedad JS pura, NO reflejada a atributo HTML (a diferencia
 * del resto de propiedades): el HTML del editor puede ser de varios MB (con
 * imágenes base64 incrustadas) y reflejarlo dejaría ese contenido expuesto en
 * el DOM, además del coste de procesar esa mutación en observers externos.
 * Usar siempre `richText.value = ...`, nunca `setAttribute('value', ...)`.
 *
 * @fires input - Cada vez que cambia el contenido
 * @fires change - Al perder el foco después de modificar
 * @fires focus - Al recibir el foco
 * @fires blur - Al perder el foco
 */
class WCRichText extends WCBaseElement {
    static formAssociated = true;

    // Tamaño máximo (MB) por defecto del contenido, aplicado a toda instancia que no
    // fije explícitamente su propio 'max-size'. Protege frente a payloads que superen
    // el límite típico de request de ASP.NET (maxRequestLength, ~4 MB) por imágenes
    // base64 grandes incrustadas en el HTML. Override por instancia: atributo
    // max-size="X" (MB); max-size="0" desactiva el límite para esa instancia.
    static DEFAULT_MAX_SIZE_MB = 3.7;

    // Margen para agrupar el trabajo caro de sincronizacion (serializar el
    // documento, guardar el valor, validar tamaño). Ver _programarSincronizacion:
    // sin esto se pagaba en CADA pulsacion de tecla.
    static SYNC_DEBOUNCE_MS = 250;

    // =========================================================================
    // CSS DEL AREA EDITABLE (dentro del shadow root)
    // =========================================================================
    // SOLO lo imprescindible para que el editor funcione. Deliberadamente NO
    // lleva tipografia de contenido (p/h1-h6/listas/blockquote), ni bordes o
    // padding de celdas, ni anchos de tabla: el usuario sube plantillas HTML
    // hechas fuera, que traen su propio CSS, y cualquier regla nuestra aqui le
    // ganaria por especificidad (`.wcrt-editor p` (0,1,1) vence a `p` (0,0,1)
    // de la plantilla) y le desmontaria el diseño. Por el mismo motivo NO se
    // carga aqui internal-layout.css: su reset `:host *{box-sizing:border-box}`
    // descuadra los anchos de las tablas de email (se maquetan con content-box).
    // Los tokens (--wcrt-*, --rf-*, --font-family-base) NO hace falta cargarlos:
    // las custom properties se heredan a traves del shadow boundary desde el
    // light DOM. Va inline (no <link>) porque este fichero no puede asumir
    // `import.meta.url` para resolver la ruta del .css, y asi ademas no hay
    // carga asincrona ni parpadeo inicial.
    static EDITOR_SURFACE_CSS = `
        .wcrt-editor {
            box-sizing: border-box;
            padding: var(--wcrt-padding, 0.75rem 1rem);
            min-height: var(--wcrt-editor-min-height, 150px);
            outline: none;
            position: relative; /* ancla de los handles de resize */
            line-height: 1.6;
            color: var(--wcrt-text-color, #1f2937);
            /* Misma tipografia que aplicaba internal-layout.css via :host, pero
               en una sola linea y con respaldo si la pagina no carga fonts.css */
            font-family: var(--font-family-base, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
        }

        .wcrt-editor .tiptap { outline: none; min-height: inherit; }

        /* Un enlace nunca navega mientras se EDITA (solo desde la vista previa/
           HTML final) — hace muy dificil volver a seleccionar/editar el propio
           enlace. Pero en readonly/disabled no hay nada que editar (el editor
           pasa a ser una vista de lectura, sin toolbar salvo imprimir/preview),
           asi que ahi SI debe navegar, igual que en la preview — por eso el
           :host(.is-disabled)/:host(.is-readonly) de mas abajo lo reactiva. La
           imagen nunca lleva un <a> real aqui dentro (ver renderHTML/
           addNodeView de ResizableImage en _initEditor()): su equivalente esta
           en onImageClick (_initImageResizer), que hace window.open() a mano
           cuando this.disabled/this.readonly. */
        .wcrt-editor .tiptap a[href] { pointer-events: none; }
        :host(.is-disabled) .wcrt-editor .tiptap a[href],
        :host(.is-readonly) .wcrt-editor .tiptap a[href] {
            pointer-events: auto;
        }

        /* Ancla de destino (<a id="x"></a> vacia, nodo AnchorTarget): no ocupa
           espacio, asi que sin esto seria invisible e imposible de seleccionar o
           borrar. Se marca SOLO con CSS del editor — el HTML de salida no lleva
           nada añadido. */
        .wcrt-editor .tiptap a:empty::after {
            content: '⚓';
            font-size: 0.75em;
            opacity: 0.45;
            vertical-align: super;
            user-select: none;
        }
        .wcrt-editor .tiptap a:empty.ProseMirror-selectednode::after {
            opacity: 1;
            outline: 1px solid var(--wcrt-border-color-focus, #5298D1);
        }

        /* Placeholder */
        .wcrt-editor[data-placeholder]:empty::before,
        .wcrt-editor .tiptap.is-empty::before {
            content: attr(data-placeholder);
            color: var(--wcrt-text-muted, #6b7280);
            pointer-events: none;
            position: absolute;
            opacity: 0.6;
        }
        .wcrt-editor .tiptap p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            color: var(--wcrt-text-muted, #6b7280);
            float: left;
            height: 0;
            pointer-events: none;
            opacity: 0.6;
        }

        /* Estados (las clases las refleja _applyStates en el host del shadow) */
        :host(.is-disabled) .wcrt-editor { background: #f9fafb; }
        :host(.is-readonly) .wcrt-editor { background: transparent; cursor: default; }

        /* Imagenes: solo lo protector (que no desborde) y el feedback de
           seleccion. Nada de margenes ni border-radius: los pone la plantilla. */
        .wcrt-editor img { max-width: 100%; height: auto; }
        .wcrt-editor .wcrt-img-node.ProseMirror-selectednode {
            outline: 2px solid var(--wcrt-border-color-focus, #5298D1);
            outline-offset: 2px;
        }

        /* Cursor de mano solo cuando el click SI navega (disabled/readonly, ver
           onImageClick) — en editable seria enganoso, ahi el click selecciona. */
        :host(.is-disabled) .wcrt-img-node.wcrt-img-linked,
        :host(.is-readonly) .wcrt-img-node.wcrt-img-linked {
            cursor: pointer;
        }

        /* Handles de redimensionado (posicionados por JS) */
        .wcrt-editor .wcrt-resize-handle {
            position: absolute;
            background: var(--wcrt-border-color-focus, #5298D1);
            z-index: 10;
            pointer-events: all;
            border-radius: var(--radius-sm, 2px);
        }
        .wcrt-editor .wcrt-resize-right  { width: 8px;  height: 16px; cursor: ew-resize; }
        .wcrt-editor .wcrt-resize-bottom { width: 16px; height: 8px;  cursor: ns-resize; }
        .wcrt-editor .wcrt-resize-corner { width: 12px; height: 12px; cursor: nwse-resize; }
        .wcrt-editor .wcrt-resize-corner::before {
            content: '';
            position: absolute;
            right: 2px; bottom: 2px;
            width: 6px; height: 6px;
            border-right: 2px solid #fff;
            border-bottom: 2px solid #fff;
        }

        /* Auxiliares de edicion de tabla de ProseMirror (no son estilo de
           contenido: son la UI de seleccion/redimension de columnas) */
        .wcrt-editor .selectedCell::after {
            content: '';
            position: absolute;
            inset: 0;
            background: rgba(var(--rf-color-primary-rgb, 82, 152, 209), 0.15);
            pointer-events: none;
        }
        .wcrt-editor .column-resize-handle {
            position: absolute;
            right: -2px; top: 0; bottom: 0;
            width: 4px;
            background: var(--wcrt-border-color-focus, #5298D1);
            cursor: col-resize;
            pointer-events: all;
        }
        /* TipTap envuelve CADA <table> (a cualquier nivel de anidacion) en un
           div.tableWrapper (ver clase de NodeView en tiptap-bundle.js, siempre
           activa aunque resizable:false) para que una tabla ancha no reviente
           el layout del editor con overflow-x:auto. El problema: un div normal
           NO se ajusta a su contenido como una <table> — por defecto ocupa el
           100% del ancho disponible de su padre. Las plantillas de email usan
           tablas SIN width declarado unicamente para centrar una tabla hija
           con width fijo (ej. una tabla de 600px dentro de <center>); con el
           wrapper como div de bloque normal, esa tabla intermedia deja de
           "encogerse" a su contenido y la tabla hija con width fijo termina
           recortada dentro de un wrapper mas angosto que ella (visible solo
           hasta donde el wrapper se estira, el resto requiere scroll horizontal
           dentro de ESE nivel concreto de anidacion) en vez de determinar el
           ancho real, como pasaba en el HTML original fuera del editor.
           display:table hace que el wrapper vuelva a comportarse como tabla
           (se ajusta a su contenido, igual que el <table> antes de que TipTap
           lo envolviera); max-width evita que aun asi se salga del contenedor
           del editor cuando el contenido declarado es mas ancho que el
           espacio disponible. overflow-x:auto se mantiene por si, ya encogido
           al maximo, el editor sigue siendo mas angosto que el contenido:
           aporta scroll en vez de recorte silencioso. */
        .wcrt-editor .tableWrapper { overflow-x: auto; }

        /* display:table SOLO en wrappers ANIDADOS (dentro de otro .tableWrapper),
           no en el mas externo. Motivo: el wrapper mas externo casi siempre
           corresponde a una tabla con width:100% real (el fondo de la
           plantilla) — si tambien se encoge a su contenido, un hijo con
           width:100% contra un padre "auto/encogido" es un caso circular en
           CSS (ninguno de los dos tiene de donde partir) y el navegador termina
           encogiendo TAMBIEN al de afuera, dejando la plantilla angosta en vez
           de ocupar el editor completo. El de afuera esta bien dejandolo como
           bloque normal (llena el 100% del contenedor, que es justo lo que
           pedia su width:100%); son las tablas ANIDADAS (sin width propio,
           pensadas para encogerse al contenido de su hija con width fijo, ej.
           la de 600px) las que necesitan volver a comportarse como <table> en
           vez de <div> de bloque. */
        .wcrt-editor .tableWrapper .tableWrapper { display: table; max-width: 100%; }

        /* El nodo Center (ver _initEditor) preserva el tag <center> tal cual,
           pero el "centra tablas de bloque" del <center> es un quirk legado de
           los navegadores atado al elemento <table> real — NO se aplica a un
           <div> con display:table, aunque se vea/mida igual (que es justo lo
           que es .tableWrapper: un div decorado por TipTap, no un <table>).
           Por eso el <center> por si solo no alcanza aca adentro: se fuerza el
           centrado explicito, con margin:auto real (estandar, no depende de
           ningun quirk), solo para el .tableWrapper que sea HIJO DIRECTO de un
           <center> — asi no se centran tablas que no lo pedian originalmente.
           El <center> real se preserva igual en el HTML de salida (getHTML()),
           esta regla es solo de la vista en vivo del editor. */
        .wcrt-editor center > .tableWrapper { margin-left: auto; margin-right: auto; }
    `;

    // =========================================================================
    // FUENTES DISPONIBLES (web-safe, universales)
    // =========================================================================
    static FONTS = [
        // === SANS-SERIF ===
        { name: 'Arial', value: 'Arial, sans-serif' },
        { name: 'Arial Black', value: '"Arial Black", sans-serif' },
        { name: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
        { name: 'Tahoma', value: 'Tahoma, sans-serif' },
        { name: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
        { name: 'Verdana', value: 'Verdana, sans-serif' },
        { name: 'Impact', value: 'Impact, sans-serif' },
        
        // === SERIF ===
        { name: 'Georgia', value: 'Georgia, serif' },
        { name: 'Times New Roman', value: '"Times New Roman", Times, serif' },
        { name: 'Garamond', value: 'Garamond, serif' },
        { name: 'Palatino', value: '"Palatino Linotype", Palatino, serif' },
        
        // === MONOSPACE ===
        { name: 'Courier New', value: '"Courier New", Courier, monospace' },
        { name: 'Courier', value: 'Courier, monospace' },
        
        // === DISPLAY / DECORATIVAS ===
        { name: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
    ];

    // =========================================================================
    // TAMAÑOS DE FUENTE DISPONIBLES
    // =========================================================================
    static FONT_SIZES = [
        { name: '8', value: '8px' },
        { name: '9', value: '9px' },
        { name: '10', value: '10px' },
        { name: '11', value: '11px' },
        { name: '12', value: '12px' },
        { name: '14', value: '14px' },
        { name: '16', value: '16px' },
        { name: '18', value: '18px' },
        { name: '20', value: '20px' },
        { name: '24', value: '24px' },
        { name: '28', value: '28px' },
        { name: '32', value: '32px' },
        { name: '36', value: '36px' },
        { name: '48', value: '48px' },
        { name: '72', value: '72px' },
    ];

    // =========================================================================
    // CONFIGURACIÓN POR DEFECTO DE TOOLBAR
    // =========================================================================
    static DEFAULT_TOOLBAR = [
        'fontFamily', 'fontSize', 'headingStyle',
        '|',
        'bold', 'italic', 'underline', 'strike', 'codeBlock',
        '|',
        'textColor', 'bgColor',
        '|',
        'alignLeft', 'alignCenter', 'alignRight', 'alignJustify',
        '|',
        'bulletList', 'orderedList',
        '|',
        'blockquote', 'link', 'image',
        '|',
        'horizontalRule', 'clearFormat',
        '|',
        'undo', 'redo',
        '|',
        'sourceCode',
        '|',
        'print', 'preview',
        '|',
        'tableInsert', 'tableBorderToggle', '|', 'tableAddRowBefore', 'tableAddRowAfter', 'tableDeleteRow', '|', 'tableAddColBefore', 'tableAddColAfter', 'tableDeleteCol', '|', 'tableMergeCells', 'tableSplitCell', 'tableDelete'
    ];

    // Botones que solo se muestran cuando el cursor está dentro de una tabla
    static TABLE_CTX_BUTTONS = [
        'tableBorderToggle', 'tableAddRowBefore', 'tableAddRowAfter', 'tableDeleteRow',
        'tableAddColBefore', 'tableAddColAfter', 'tableDeleteCol',
        'tableMergeCells', 'tableSplitCell', 'tableDelete'
    ];

    // Mapeo de botones a comandos TipTap
    static COMMAND_MAP = {
        bold: (editor) => editor.chain().focus().toggleBold().run(),
        italic: (editor) => editor.chain().focus().toggleItalic().run(),
        underline: (editor) => editor.chain().focus().toggleUnderline?.().run() || false,
        strike: (editor) => editor.chain().focus().toggleStrike().run(),
        code: (editor) => editor.chain().focus().toggleCode().run(),
        codeBlock: (editor) => editor.chain().focus().toggleCodeBlock().run(),
        h1: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        h2: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        h3: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        h4: (editor) => editor.chain().focus().toggleHeading({ level: 4 }).run(),
        h5: (editor) => editor.chain().focus().toggleHeading({ level: 5 }).run(),
        h6: (editor) => editor.chain().focus().toggleHeading({ level: 6 }).run(),
        bulletList: (editor) => editor.chain().focus().toggleBulletList().run(),
        orderedList: (editor) => editor.chain().focus().toggleOrderedList().run(),
        blockquote: (editor) => editor.chain().focus().toggleBlockquote().run(),
        // Alinear: sobre una imagen seleccionada actua sobre su atributo propio
        // `align` (ver ResizableImage) — TextAlign (marca de texto) solo esta
        // configurada para heading/paragraph y no tiene ningun efecto sobre un
        // nodo de imagen. 'Justify' no aplica a una imagen (es un unico bloque,
        // no hay nada que justificar): se deja el comportamiento de texto tal
        // cual, sera un no-op inofensivo si hay una imagen seleccionada.
        alignLeft: (editor) => {
            const { node } = editor.state.selection;
            if (node?.type?.name === 'image') return editor.chain().focus().updateAttributes('image', { align: 'left' }).run();
            return editor.chain().focus().setTextAlign('left').run();
        },
        alignCenter: (editor) => {
            const { node } = editor.state.selection;
            if (node?.type?.name === 'image') return editor.chain().focus().updateAttributes('image', { align: 'center' }).run();
            return editor.chain().focus().setTextAlign('center').run();
        },
        alignRight: (editor) => {
            const { node } = editor.state.selection;
            if (node?.type?.name === 'image') return editor.chain().focus().updateAttributes('image', { align: 'right' }).run();
            return editor.chain().focus().setTextAlign('right').run();
        },
        alignJustify: (editor) => editor.chain().focus().setTextAlign('justify').run(),
        horizontalRule: (editor) => editor.chain().focus().setHorizontalRule().run(),
        clearFormat: (editor) => editor.chain().focus().clearNodes().unsetAllMarks().run(),
        undo: (editor) => editor.chain().focus().undo().run(),
        redo: (editor) => editor.chain().focus().redo().run(),
        // Tabla
        tableInsert: (editor) => {
            const result = editor.chain().focus()
                .insertTable({ rows: 2, cols: 2, withHeaderRow: false })
                .run();
            
            // Añadir bordes a las celdas en el modelo ProseMirror
            setTimeout(() => {
                const { state, view } = editor;
                const { tr } = state;
                const { $from } = state.selection;
                
                // Encontrar la tabla
                let tablePos = null;
                let tableNode = null;
                for (let depth = $from.depth; depth > 0; depth--) {
                    const node = $from.node(depth);
                    if (node.type.name === 'table') {
                        tablePos = $from.before(depth);
                        tableNode = node;
                        break;
                    }
                }
                
                if (tableNode) {
                    tableNode.descendants((node, pos) => {
                        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
                            const cellPos = tablePos + pos + 1;
                            tr.setNodeMarkup(cellPos, null, {
                                ...node.attrs,
                                style: 'border: 1px solid #d1d5db;'
                            });
                        }
                    });
                    view.dispatch(tr);
                }
            }, 0);
            
            return result;
        },
        tableAddRowBefore: (editor) => editor.chain().focus().addRowBefore().run(),
        tableAddRowAfter: (editor) => editor.chain().focus().addRowAfter().run(),
        tableDeleteRow: (editor) => editor.chain().focus().deleteRow().run(),
        tableAddColBefore: (editor) => editor.chain().focus().addColumnBefore().run(),
        tableAddColAfter: (editor) => editor.chain().focus().addColumnAfter().run(),
        tableDeleteCol: (editor) => editor.chain().focus().deleteColumn().run(),
        tableDelete: (editor) => editor.chain().focus().deleteTable().run(),
        tableMergeCells: (editor) => editor.chain().focus().mergeCells().run(),
        tableSplitCell: (editor) => editor.chain().focus().splitCell().run(),
        tableBorderToggle: (editor) => {
            const { state, view } = editor;
            const { tr } = state;
            const { $from } = state.selection;
            
            // Encontrar la tabla en el modelo
            let tablePos = null;
            let tableNode = null;
            for (let depth = $from.depth; depth > 0; depth--) {
                const node = $from.node(depth);
                if (node.type.name === 'table') {
                    tablePos = $from.before(depth);
                    tableNode = node;
                    break;
                }
            }
            
            if (!tableNode) {
                console.warn('[WCRichText] No se encontró tabla');
                return false;
            }
            
            // Verificar estado actual de la primera celda
            let hasBorder = true;
            tableNode.descendants((node) => {
                if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
                    const style = node.attrs.style || '';
                    if (style.includes('border') && style.includes('none')) {
                        hasBorder = false;
                    }
                    return false; // Solo necesitamos la primera
                }
            });
            
            // Modificar todas las celdas
            let offset = 0;
            tableNode.descendants((node, pos) => {
                if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
                    const cellPos = tablePos + pos + 1;
                    let currentStyle = node.attrs.style || '';
                    
                    // Limpiar estilos de borde existentes
                    currentStyle = currentStyle
                        .replace(/border[^;]*;?\s*/gi, '')
                        .replace(/border-collapse[^;]*;?\s*/gi, '')
                        .trim();
                    
                    // Añadir nuevo estilo de borde
                    const newBorder = hasBorder ? 'border: none;' : 'border: 1px solid #d1d5db;';
                    const newStyle = (currentStyle ? currentStyle + ' ' : '') + newBorder;
                    
                    tr.setNodeMarkup(cellPos + offset, null, {
                        ...node.attrs,
                        style: newStyle.trim()
                    });
                }
            });
            
            view.dispatch(tr);
            return true;
        },
        // image, sourceCode, textColor, bgColor, link se manejan de forma especial
    };

    // Mapeo para verificar estado activo
    static ACTIVE_MAP = {
        bold: (editor) => editor.isActive('bold'),
        italic: (editor) => editor.isActive('italic'),
        underline: (editor) => editor.isActive('underline'),
        strike: (editor) => editor.isActive('strike'),
        code: (editor) => editor.isActive('code'),
        codeBlock: (editor) => editor.isActive('codeBlock'),
        h1: (editor) => editor.isActive('heading', { level: 1 }),
        h2: (editor) => editor.isActive('heading', { level: 2 }),
        h3: (editor) => editor.isActive('heading', { level: 3 }),
        h4: (editor) => editor.isActive('heading', { level: 4 }),
        h5: (editor) => editor.isActive('heading', { level: 5 }),
        h6: (editor) => editor.isActive('heading', { level: 6 }),
        bulletList: (editor) => editor.isActive('bulletList'),
        orderedList: (editor) => editor.isActive('orderedList'),
        blockquote: (editor) => editor.isActive('blockquote'),
        alignLeft: (editor) => {
            const { node } = editor.state.selection;
            if (node?.type?.name === 'image') return node.attrs.align === 'left';
            return editor.isActive({ textAlign: 'left' });
        },
        alignCenter: (editor) => {
            const { node } = editor.state.selection;
            if (node?.type?.name === 'image') return node.attrs.align === 'center';
            return editor.isActive({ textAlign: 'center' });
        },
        alignRight: (editor) => {
            const { node } = editor.state.selection;
            if (node?.type?.name === 'image') return node.attrs.align === 'right';
            return editor.isActive({ textAlign: 'right' });
        },
        alignJustify: (editor) => editor.isActive({ textAlign: 'justify' }),
        link: (editor) => {
            // Las imagenes enlazan via su atributo 'href' propio, no la marca
            // 'link' (ver comentario en ResizableImage) — hay que comprobar las
            // dos formas para que el boton "Enlace" se muestre activo en ambas.
            const { node } = editor.state.selection;
            if (node?.type?.name === 'image') return !!node.attrs.href;
            return editor.isActive('link');
        },
        tableInsert: (editor) => editor.isActive('table'),
        tableBorderToggle: (editor) => {
            // Verificar si la tabla actual tiene bordes (mirando el modelo)
            const { $from } = editor.state.selection;
            
            for (let depth = $from.depth; depth > 0; depth--) {
                const node = $from.node(depth);
                if (node.type.name === 'table') {
                    let hasBorder = true;
                    node.descendants((cellNode) => {
                        if (cellNode.type.name === 'tableCell' || cellNode.type.name === 'tableHeader') {
                            const style = cellNode.attrs.style || '';
                            if (style.includes('border') && style.includes('none')) {
                                hasBorder = false;
                            }
                            return false;
                        }
                    });
                    return hasBorder;
                }
            }
            return false;
        },
    };

    // :root nunca matchea dentro de un shadow tree (representa el <html> del
    // DOCUMENTO real, fuera de su alcance) — asi que las custom properties que
    // una plantilla externa define en :root (habitual: paleta de colores via
    // var(--primary), etc.) se pierden en silencio en cuanto ese <style> se
    // pinta dentro de un shadow root propio: la regla no matchea nada, las
    // variables quedan sin valor y toda propiedad que dependa de var(--x) cae
    // a su valor inicial (colores/fondos desaparecen, el resto del layout no
    // se nota tanto porque no depende de variables). :host SI es visible desde
    // dentro del shadow root, y sus custom properties heredan igual al
    // contenido de la plantilla. Se usa SOLO para la superficie de
    // edicion/preview (ver StyleBlock.addNodeView y _previewContent) — el
    // :root original se conserva intacto en getHTML()/value (StyleBlock.
    // renderHTML), que es el HTML que de verdad se envia/imprime, siempre
    // fuera de cualquier shadow root.
    static _cssRootComoHost(css) {
        return (css || '').replace(/:root\b/gi, ':host');
    }

    constructor() {
        super();
        this._internals = this.attachInternals();
        this._els = {};
        this._editor = null;
        this._tiptapModules = null;
        this._toolbarConfig = null;
        this._customButtons = [];
        this._value = ''; // HTML actual cuando no hay editor vivo. NO se refleja a atributo (ver 'value' mas abajo)
        this._initialValue = '';
        this._lastValue = '';
        this._isInitialized = false;
        this._isSourceMode = false; // Toggle para ver código HTML
        this._pendingSetValue = null; // Valor registrado por set value() mientras el editor no estaba listo
        this._syncTimer = null; // Sincronizacion pesada pendiente (ver _programarSincronizacion)
        this._toolbarFrame = null; // Actualizacion de toolbar agrupada por frame
    }

    static get observedAttributes() {
        return ['disabled', 'readonly', 'placeholder', 'required', 'name', 'min-height', 'height', 'max-height', 'show-toolbar', 'toolbar-position', 'show-count', 'max-size'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal === newVal) return;

        // Altura: solo DOM, no necesita TipTap inicializado
        if (this._els.editorContainer && (name === 'height' || name === 'min-height' || name === 'max-height')) {
            this._handleAttributeChange(name, newVal);
            return;
        }

        if (this._isInitialized) {
            this._handleAttributeChange(name, newVal);
        }
    }

    async connectedCallback() {
        super.connectedCallback();
        // Tres estados posibles al conectar:
        //  - Sin wrapper: primer montaje -> render completo.
        //  - Wrapper presente pero editor destruido: el nodo estuvo desconectado
        //    el tiempo suficiente para que la destruccion diferida (ver
        //    disconnectedCallback) liberase TipTap, p.ej. RightSidebar.navigate()
        //    mantiene la vista fuera del DOM y goBack() la reinserta. Hay que
        //    re-montar el editor sobre el DOM; _render() reconstruye la estructura
        //    y restaura el contenido desde el atributo value (preservado en
        //    _destroyEditor). Sin esto el rich text queda visible pero bloqueado.
        //  - Wrapper y editor vivos: move sincrono (DynamicModal._relocate), nada que hacer.
        if (!this._els.wrapper || !this._editor) {
            await this._render();
        }
    }

    disconnectedCallback() {
        // Diferir la destruccion: mover el nodo en el DOM (appendChild a otro
        // contenedor, p.ej. DynamicModal._relocate) dispara disconnect+connect
        // sincronos. Si destruyeramos aqui, el wrapper sobreviviria pero el
        // editor TipTap no, dejando el componente roto. Solo destruimos si
        // sigue desconectado al terminar la tarea actual (eliminacion real).
        setTimeout(() => {
            if (!this.isConnected) this._destroyEditor();
        }, 0);
    }

    // =========================================================================
    // API PÚBLICA - Propiedades
    // =========================================================================

    // 'value' es una propiedad JS pura: deliberadamente NO se refleja a atributo
    // HTML (a diferencia del resto de propiedades de este componente), para no
    // dejar el HTML completo del editor (puede ser de varios MB, con imagenes
    // base64 incrustadas) expuesto en el DOM ni pagando el coste de mutaciones
    // enormes en cualquier observer externo (DevTools, extensiones, un posible
    // session-replay/analytics basado en snapshots del DOM, etc.) en cada
    // sincronizacion. Mismo patron que DocumentViewer.base64. Usar siempre
    // `richText.value = ...`, nunca `setAttribute('value', ...)`.
    get value() {
        if (this._editor) {
            return this._editor.isEmpty ? '' : this._editor.getHTML();
        }
        return this._value || '';
    }

    set value(html) {
        const normalized = html || '';
        this._value = normalized;
        if (this._editor) {
            // Editor listo: aplicar siempre (sin comparar getHTML(), que puede diferir
            // del original por normalización TipTap aunque el contenido sea equivalente)
            if (this._editor.getHTML() !== normalized) {
                this._editor.commands.setContent(normalized, false);
            }
        } else {
            // Editor aún cargando: registrar con flag explícito para que _render()
            // lo aplique al resolver — más fiable que depender de la comparación
            // de atributos (que falla si el valor coincide con _initialValue)
            this._pendingSetValue = normalized;
        }
        this._syncFormValue();
    }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(val) { val ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    get readonly() { return this.hasAttribute('readonly'); }
    set readonly(val) { val ? this.setAttribute('readonly', '') : this.removeAttribute('readonly'); }

    get required() { return this.hasAttribute('required'); }
    set required(val) { val ? this.setAttribute('required', '') : this.removeAttribute('required'); }

    /**
     * Tamaño máximo del contenido en MB (medido en bytes reales vía Blob, no caracteres).
     * Sin atributo -> WCRichText.DEFAULT_MAX_SIZE_MB (valor por defecto del componente).
     * max-size="0" -> sin límite (desactivado explícitamente para esa instancia).
     * Se valida como restricción nativa (ValidityState 'tooLong'), igual que 'required',
     * para que DynamicForm.validate() la detecte sin lógica adicional.
     */
    get maxSize() {
        if (!this.hasAttribute('max-size')) return WCRichText.DEFAULT_MAX_SIZE_MB;
        const val = parseFloat(this.getAttribute('max-size'));
        return isNaN(val) ? 0 : val;
    }
    set maxSize(val) { (val || val === 0) ? this.setAttribute('max-size', val) : this.removeAttribute('max-size'); }

    get name() { return this.getAttribute('name'); }
    set name(val) { val ? this.setAttribute('name', val) : this.removeAttribute('name'); }

    get placeholder() { return this.getAttribute('placeholder') || ''; }
    set placeholder(val) { val ? this.setAttribute('placeholder', val) : this.removeAttribute('placeholder'); }

    get minHeight() { return this.getAttribute('min-height') || '150px'; }
    set minHeight(val) { val ? this.setAttribute('min-height', val) : this.removeAttribute('min-height'); }

    get height() { return this.getAttribute('height'); }
    set height(val) { val ? this.setAttribute('height', val) : this.removeAttribute('height'); }

    get maxHeight() { return this.getAttribute('max-height'); }
    set maxHeight(val) { val ? this.setAttribute('max-height', val) : this.removeAttribute('max-height'); }

    get showToolbar() { return this.getAttribute('show-toolbar') !== 'false'; }
    set showToolbar(val) { this.setAttribute('show-toolbar', val ? 'true' : 'false'); }

    get toolbarPosition() { return this.getAttribute('toolbar-position') || 'top'; }
    set toolbarPosition(val) { val ? this.setAttribute('toolbar-position', val) : this.removeAttribute('toolbar-position'); }

    /**
     * Muestra contador de caracteres y/o palabras.
     * Valores: 'chars' | 'words' | 'both' | false
     */
    get showCount() { return this.getAttribute('show-count') || false; }
    set showCount(val) {
        if (val && val !== 'false') {
            this.setAttribute('show-count', val);
        } else {
            this.removeAttribute('show-count');
        }
        if (this._isInitialized) this._renderCountBar();
    }

    /**
     * Configuración de la toolbar
     * @param {Object} config - { buttons: string[], customButtons: Object[] }
     */
    get toolbarConfig() {
        return this._toolbarConfig || { buttons: WCRichText.DEFAULT_TOOLBAR, customButtons: [] };
    }

    set toolbarConfig(config) {
        this._toolbarConfig = config;
        if (config?.customButtons) {
            this._customButtons = config.customButtons;
        }
        if (this._isInitialized) {
            this._rebuildToolbar();
        }
    }

    // =========================================================================
    // API PÚBLICA - Métodos
    // =========================================================================

    /**
     * Obtiene el contenido como texto plano (sin HTML)
     * @returns {string}
     */
    getTextContent() {
        return this._editor ? this._editor.getText() : '';
    }

    /**
     * Limpia el contenido del editor
     */
    clear() {
        if (this._editor) {
            this._editor.commands.clearContent();
        }
        this.value = '';
    }

    /**
     * Da foco al editor
     */
    focus() {
        if (this._editor) {
            this._editor.commands.focus();
        }
    }

    /**
     * Inserta contenido HTML en la posición actual
     * @param {string} html - Contenido HTML a insertar
     */
    insertContent(html) {
        if (this._editor) {
            this._editor.commands.insertContent(html);
        }
    }

    /**
     * Acceso directo al editor TipTap (usar con precaución)
     * @returns {Editor|null}
     */
    getEditor() {
        return this._editor;
    }

    // --- Métodos de validación nativa ---
    checkValidity() { return this._internals.checkValidity(); }
    reportValidity() { return this._internals.reportValidity(); }
    get validity() { return this._internals.validity; }
    get validationMessage() { return this._internals.validationMessage; }

    // =========================================================================
    // LÓGICA INTERNA - Renderizado
    // =========================================================================

    async _render() {
        // Guardar valor inicial antes de renderizar
        this._initialValue = this._value || '';

        // Crear estructura HTML
        this.innerHTML = `
            <div class="wcrt-wrapper${this.toolbarPosition === 'bottom' ? ' toolbar-bottom' : ''}">
                <div class="wcrt-toolbar" style="${this.showToolbar ? '' : 'display: none;'}"></div>
                <div class="wcrt-editor-container"></div>
                <div class="wcrt-source-container" style="display: none;">
                    <textarea class="wcrt-source-textarea"></textarea>
                </div>
            </div>
        `;

        // Referencias a elementos
        this._els.wrapper = this.querySelector('.wcrt-wrapper');
        this._els.toolbar = this.querySelector('.wcrt-toolbar');
        this._els.editorContainer = this.querySelector('.wcrt-editor-container');
        this._els.sourceContainer = this.querySelector('.wcrt-source-container');
        this._els.sourceTextarea = this.querySelector('.wcrt-source-textarea');

        // Area editable en Shadow DOM: si el HTML pegado o insertado trae su
        // propio <style> (no solo plantillas de email — cualquier HTML con su
        // propio CSS), ese bloque se pinta (ver extension StyleBlock en
        // _initEditor()) dentro de este shadow root, donde se aplica de verdad
        // sin fugarse a la pagina real. La toolbar se queda en Light DOM.
        // Shadow propio en vez de <shadow-container>: ese widget carga siempre
        // internal-layout.css por contrato, y aqui eso es contraproducente
        // (impone box-sizing/tipografia a la plantilla del usuario y son ~1000
        // lineas de estilos de componentes base que aqui dentro no se usan).
        // Ver EDITOR_SURFACE_CSS para el detalle.
        this._els.editorShadow = document.createElement('div');
        this._els.editorShadow.className = 'wcrt-editor-shadow';
        this._els.editorContainer.appendChild(this._els.editorShadow);

        const editorShadowRoot = this._els.editorShadow.attachShadow({ mode: 'open' });
        const surfaceStyles = document.createElement('style');
        surfaceStyles.textContent = WCRichText.EDITOR_SURFACE_CSS;
        editorShadowRoot.appendChild(surfaceStyles);

        this._els.editor = document.createElement('div');
        this._els.editor.className = 'wcrt-editor';
        this._els.editor.dataset.placeholder = this.placeholder;
        editorShadowRoot.appendChild(this._els.editor);

        // Barra de contador (si está configurada)
        this._renderCountBar();

        // Aplicar propiedades de altura
        this._els.editorContainer.style.minHeight = this.minHeight;
        // Custom property (no min-height directo): .wcrt-editor vive dentro del
        // shadow root y necesita esto para heredar la altura mínima — ver comentario
        // junto a min-height en rich-text.css.
        this.style.setProperty('--wcrt-editor-min-height', this.minHeight);
        if (this.height) {
            this._els.editorContainer.style.height = this.height;
            this._els.editorContainer.style.overflowY = 'auto';
        }
        if (this.maxHeight) {
            this._els.editorContainer.style.maxHeight = this.maxHeight;
            this._els.editorContainer.style.overflowY = 'auto';
        }

        // Cargar TipTap e inicializar
        try {
            await this._initEditor();
            this._buildToolbar();
            this._applyStates();
            this._isInitialized = true;
            // Aplicar valor pendiente si set value() fue llamado mientras TipTap cargaba.
            // Se usa _pendingSetValue (flag explícito) en lugar de comparar atributos:
            // la guarda anterior "pendingValue !== _initialValue" fallaba silenciosamente
            // cuando ambos eran '' — el caso más común en Comunicado.aspx.
            // Fallback a this._value para cubrir asignaciones a la propiedad value
            // hechas antes de que el editor existiera (p.ej. desde configure()
            // con value inicial en el schema).
            const toApply = this._pendingSetValue !== null
                ? this._pendingSetValue
                : (this._value || '');
            if (toApply && this._editor) {
                this._editor.commands.setContent(toApply, false);
                this._syncFormValue();
            }
            this._pendingSetValue = null;
        } catch (error) {
            console.error('[WCRichText] Error inicializando editor:', error);
            this._renderFallback(error);
        }
    }

    _renderFallback(error) {
        // Fallback a textarea simple si TipTap falla
        const esc = WCBaseElement.escapeHtml;
        this.innerHTML = `
            <div class="wcrt-wrapper wcrt-fallback">
                <textarea
                    class="wcrt-fallback-textarea"
                    placeholder="${esc(this.placeholder)}"
                    ${this.disabled ? 'disabled' : ''}
                    ${this.readonly ? 'readonly' : ''}
                >${esc(this._initialValue)}</textarea>
                <small class="wcrt-error">Editor no disponible: ${esc(error.message)}</small>
            </div>
        `;
        
        const textarea = this.querySelector('textarea');
        if (textarea) {
            textarea.addEventListener('input', () => {
                this._value = textarea.value;
                this._syncFormValue();
            });
        }
    }

    /**
     * Limpia HTML pegado de Outlook/Gmail - Enfoque conservador
     * Solo elimina basura de Office, preserva el resto del HTML lo más intacto posible
     * @param {string} html - HTML del portapapeles
     * @returns {string} HTML limpio
     */
    _cleanPastedHTML(html) {
        let raw = html;

        // =====================================================================
        // PASO 1: Eliminar basura de Office/Outlook ANTES de parsear
        // =====================================================================

        // Bloques VML completos (v:shape, etc. - la imagen real está en el fallback)
        raw = raw.replace(/<!--\[if\s+gte\s+vml[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '');
        
        // Conservar contenido de bloques <!--[if !vml]-->
        raw = raw.replace(/<!--\[if\s+!vml\]-->([\s\S]*?)<!--\[endif\]-->/gi, '$1');
        
        // Eliminar otros comentarios condicionales de Office
        raw = raw.replace(/<!--\[if[^\]]*\][\s\S]*?<!\[endif\]-->/gi, '');
        raw = raw.replace(/<!--[\s\S]*?-->/g, '');

        // Tags de Office (o:p, v:shapetype, etc.)
        raw = raw.replace(/<o:[^>]*>[\s\S]*?<\/o:[^>]*>/gi, '');
        raw = raw.replace(/<v:[^>]*>[\s\S]*?<\/v:[^>]*>/gi, '');
        raw = raw.replace(/<!\[if[^\]]*\]>/gi, '');
        raw = raw.replace(/<!\[endif\]>/gi, '');

        // Eliminar propiedades mso-* de los estilos inline (en el string raw)
        raw = raw.replace(/mso-[^:;"']*:[^;}"']*;?/gi, '');

        // =====================================================================
        // PASO 2: Parsear y normalizar con DOM
        // =====================================================================

        const doc = new DOMParser().parseFromString(raw, 'text/html');

        // Normalizar bordes de tabla sin borde
        doc.body.querySelectorAll('table').forEach(table => {
            const borderAttr = table.getAttribute('border');
            const noBorder = !borderAttr || borderAttr === '0';
            
            if (noBorder) {
                // Tabla sin borde: añadir border:none a las celdas
                table.querySelectorAll('td, th').forEach(cell => {
                    const currentStyle = cell.getAttribute('style') || '';
                    if (!currentStyle.includes('border')) {
                        cell.setAttribute('style', currentStyle + (currentStyle ? '; ' : '') + 'border: none');
                    }
                });
            }
            
            // Limpiar atributos obsoletos de tabla
            table.removeAttribute('cellspacing');
            table.removeAttribute('cellpadding');
            table.removeAttribute('border');
            table.removeAttribute('width');

            // Quitar width de celdas para que no limiten el contenido
            table.querySelectorAll('td, th').forEach(cell => {
                cell.removeAttribute('width');
                const style = cell.getAttribute('style') || '';
                const newStyle = style.replace(/\bwidth\s*:[^;]+;?\s*/gi, '').trim().replace(/;$/, '');
                if (newStyle) {
                    cell.setAttribute('style', newStyle);
                } else if (style) {
                    cell.removeAttribute('style');
                }
            });
        });

        // Eliminar solo atributos problemáticos, preservar el resto
        doc.body.querySelectorAll('*').forEach(el => {
            el.removeAttribute('class');  // Clases de Office no nos sirven
            el.removeAttribute('lang');
            
            // Eliminar atributos con prefijos de Office
            const attrsToRemove = [];
            for (const attr of el.attributes) {
                if (attr.name.startsWith('o:') || 
                    attr.name.startsWith('v:') || 
                    attr.name.startsWith('w:')) {
                    attrsToRemove.push(attr.name);
                }
            }
            attrsToRemove.forEach(attr => el.removeAttribute(attr));
        });

        return doc.body.innerHTML;
    }

    /**
     * Carga el modulo tiptap-loader.js. Algunos entornos desplegados (ej. sandbox
     * CI de Chile) solo publican la version minificada con el mismo nombre de
     * archivo en la misma carpeta (tiptap-loader.min.js), sin el .js sin minificar
     * — si el import normal falla (404), reintenta con esa variante antes de fallar.
     */
    async _importTipTapLoader() {
        try {
            return await import('../external/richtext/tiptap-loader.js');
        } catch (e) {
            return await import('../external/richtext/tiptap-loader.min.js');
        }
    }

    async _initEditor() {
        // Cargar TipTap dinámicamente
        const { loadTipTap } = await this._importTipTapLoader();
        this._tiptapModules = await loadTipTap();

        const { Editor, StarterKit, Image, TextStyle, FontFamily, Color, Highlight, TextAlign, Link, Table, TableRow, TableCell, TableHeader, Node, Extension } = this._tiptapModules;

        // =====================================================================
        // EXTENSIONES PERSONALIZADAS PARA PRESERVAR ESTILOS AL PEGAR
        // =====================================================================

        // ProseMirror no guarda HTML: lo reconstruye desde su schema y descarta
        // TODO atributo que no este declarado. Las plantillas de email se
        // maquetan fuera con tablas + atributos (width/align/valign/bgcolor) y
        // clases; sin declararlos aqui, al pasar por el editor se perdian y el
        // CSS de la plantilla se quedaba sin nada a lo que apuntar (las reglas
        // por clase y las @media dejaban de matchear y el layout se desmontaba).
        // Se declaran como atributos "de paso": se leen del HTML tal cual y se
        // vuelven a escribir igual.
        // Nota: `class` y `style` los fusiona TipTap con lo que aporten otras
        // extensiones (mergeAttributes concatena clases y combina el style
        // propiedad a propiedad), asi que no pisa a TextAlign, Color, etc.
        // Depende de que tiptap-bundle.js exporte `Extension` (clase base de
        // @tiptap/core) — no viene exportada de fabrica, ver el parche
        // documentado en la cabecera de ese fichero y en tiptap-loader.js.
        const passthroughAttribute = (name) => ({
            default: null,
            parseHTML: element => element.getAttribute(name),
            renderHTML: attributes => attributes[name] ? { [name]: attributes[name] } : {},
        });
        const passthroughAttributes = (...names) =>
            Object.fromEntries(names.map(name => [name, passthroughAttribute(name)]));

        const EmailHtmlAttributes = Extension.create({
            name: 'emailHtmlAttributes',
            addGlobalAttributes() {
                return [
                    {
                        // Maquetacion por tablas: es donde vive el layout de una
                        // plantilla de email (y donde mas se notaba la perdida:
                        // tableRow no tenia NINGUN atributo propio). Fila/celda/
                        // cabecera NO tienen NodeView propio (renderizado estandar
                        // de ProseMirror), asi que un passthrough simple alcanza:
                        // se ve bien tanto en vivo como en getHTML().
                        types: ['tableRow', 'tableCell', 'tableHeader'],
                        attributes: passthroughAttributes(
                            'class', 'id', 'style', 'align', 'valign', 'width', 'height', 'bgcolor'
                        ),
                    },
                    {
                        // La TABLA es la excepcion: EmailTable (mas abajo, junto a
                        // Table.configure) declara width/height/style por su
                        // cuenta — necesitan tratamiento especial (plegarse en
                        // `style` en vez de quedar como atributos sueltos) para
                        // que el NodeView de la vista en vivo los respete. Aqui
                        // solo lo que NO necesita ese tratamiento especial.
                        types: ['table'],
                        attributes: passthroughAttributes('class', 'id', 'align', 'valign', 'bgcolor'),
                    },
                    {
                        types: [
                            'paragraph', 'heading', 'blockquote',
                            'bulletList', 'orderedList', 'listItem',
                            'codeBlock', 'horizontalRule',
                        ],
                        attributes: passthroughAttributes('class', 'id', 'style'),
                    },
                    {
                        types: ['link'],
                        attributes: passthroughAttributes('class', 'id', 'style'),
                    },
                    {
                        // La imagen ya gestiona style/width/height por su cuenta
                        // (ResizableImage), aqui solo lo que le falta.
                        types: ['image'],
                        attributes: passthroughAttributes('class', 'id'),
                    },
                ];
            },
        });

        // Nodo AnchorTarget: conserva las anclas de DESTINO de la navegacion
        // interna, es decir un <a id="x"></a> / <a name="x"></a> VACIO al que
        // apunta un enlace href="#x". Sin esto se perdian: un enlace es una
        // MARCA de ProseMirror y una marca necesita texto al que aplicarse —
        // en un ancla vacia no hay ninguno, asi que desaparecia y el enlace
        // quedaba apuntando a un destino inexistente.
        // Se modela como nodo atomico INLINE para que pueda convivir con el
        // texto dentro de un parrafo o una celda. Solo captura anclas VACIAS y
        // con id/name: una <a> con texto debe seguir siendo la marca link
        // normal (la marca link de TipTap exige href, asi que en la practica no
        // compiten; `priority` alta cubre el caso raro de ancla vacia CON href).
        // En el editor se marca visualmente con CSS (ver EDITOR_SURFACE_CSS,
        // regla `a:empty::after`), no con un atributo: asi el HTML de salida
        // sale limpio, exactamente como entro.
        const AnchorTarget = Node.create({
            name: 'anchorTarget',
            inline: true,
            group: 'inline',
            atom: true,
            priority: 1000,
            addAttributes() {
                return passthroughAttributes('id', 'name', 'href', 'class', 'style');
            },
            parseHTML() {
                return [
                    { tag: 'a[id]:empty' },
                    { tag: 'a[name]:empty' },
                ];
            },
            renderHTML({ HTMLAttributes }) {
                return ['a', HTMLAttributes];
            },
        });

        // Nodo StyleBlock (codigo propio, NO parte de TipTap/prosemirror): conserva
        // un <style> pegado o insertado (cualquier HTML con su propio CSS, incluidas
        // @media — plantillas de email es el caso mas habitual pero no el unico)
        // tal cual, en vez de que ProseMirror lo descarte (por defecto
        // ignora head/noscript/object/script/style/title). getHTML() lo reproduce
        // integro (renderHTML), sea cual sea el uso que se le de despues al HTML
        // resultante. Como el editor vive
        // dentro de un shadow root propio (ver _render()), TipTap puede pintarlo
        // como un <style> real y vivo sin que se fugue a la pagina: el shadow root
        // lo contiene. Es atomico (sin contenido editable); el propio <style> no
        // ocupa espacio visual (un <style> nunca se ve), asi que no hace falta un
        // nodeView con un placeholder propio — el addNodeView de mas abajo existe
        // por otro motivo (reescribir :root a :host, ver ese comentario), no para
        // dar apariencia al nodo.
        // Depende de que tiptap-bundle.js exporte `Node` (clase base de
        // @tiptap/core) — no viene exportada de fabrica, ver el parche documentado
        // en la cabecera de ese fichero y en tiptap-loader.js.
        const StyleBlock = Node.create({
            name: 'styleBlock',
            group: 'block',
            atom: true,
            addAttributes() {
                return {
                    css: {
                        default: '',
                        parseHTML: element => element.textContent || '',
                        renderHTML: () => ({}),
                    },
                };
            },
            parseHTML() {
                return [{ tag: 'style' }];
            },
            renderHTML({ node }) {
                return ['style', {}, node.attrs.css];
            },
            // Vista en vivo (dentro del shadow root del editor, ver _render()):
            // con :root reescrito a :host (ver WCRichText._cssRootComoHost) para
            // que las custom properties de la plantilla resuelvan de verdad aqui
            // dentro. renderHTML() de arriba sigue gobernando getHTML()/value
            // (y por tanto el HTML final) con el :root original intacto.
            addNodeView() {
                return ({ node }) => {
                    const dom = document.createElement('style');
                    dom.textContent = WCRichText._cssRootComoHost(node.attrs.css);
                    return {
                        dom,
                        update(updatedNode) {
                            if (updatedNode.type.name !== 'styleBlock') return false;
                            dom.textContent = WCRichText._cssRootComoHost(updatedNode.attrs.css);
                            return true;
                        },
                    };
                };
            },
        });

        // Extensión FontSize (existente) con soporte mejorado
        const FontSize = TextStyle.extend({
            addAttributes() {
                return {
                    ...this.parent?.(),
                    fontSize: {
                        default: null,
                        parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
                        renderHTML: attributes => {
                            if (!attributes.fontSize) {
                                return {};
                            }
                            return { style: `font-size: ${attributes.fontSize}` };
                        },
                    },
                };
            },
            addCommands() {
                return {
                    ...this.parent?.(),
                    setFontSize: fontSize => ({ chain }) => {
                        return chain().setMark('textStyle', { fontSize }).run();
                    },
                    unsetFontSize: () => ({ chain }) => {
                        return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
                    },
                };
            },
        });

        // Extensión Image con atributos de dimensión (sin nodeView personalizado)
        // Alineacion de imagen (izquierda/centro/derecha): comparten mapeo el
        // atributo `align` (renderHTML, salida final) y el nodeView (vista en
        // vivo), para que se vea igual editando que en el HTML exportado.
        // `display:block` + margen es lo que de verdad centra/alinea un
        // elemento de bloque (text-align no tiene efecto sobre el propio
        // elemento, solo sobre contenido inline DENTRO de el). Se escribe
        // ADEMAS el atributo align="..." (heredado del HTML clasico): varios
        // clientes de correo antiguos (Outlook de escritorio usa el motor de
        // renderizado de Word) lo respetan mejor que el CSS equivalente.
        const ESTILO_ALINEACION_IMAGEN = {
            center: 'display:block;margin-left:auto;margin-right:auto;',
            left: 'display:block;margin-left:0;margin-right:auto;',
            right: 'display:block;margin-left:auto;margin-right:0;',
        };

        // Combina el style propio de la imagen con el de alineacion SIEMPRE en
        // este orden (alineacion al final). Motivo: TipTap fusiona los
        // renderHTML de distintos atributos usando su propio mecanismo interno
        // (una fusion de estilos por Map/CSSOM) cuyo orden NO es el que uno
        // declara en addAttributes — comprobado en real: si la imagen ya trae
        // su propio `margin` (habitual en HTML de Word), esa fusion automatica
        // podia acabar escribiendo el `margin` original DESPUES de nuestro
        // `margin-left/right:auto`, y una propiedad abreviada (`margin`)
        // declarada despues de las largas siempre las resetea — el centrado
        // desaparecia en el HTML exportado (getHTML()) aunque se viera bien en
        // el editor (donde no pasaba: buildImg concatena el texto el mismo a
        // mano con el orden correcto). Por eso aqui NO se deja que `align`
        // aporte su propio `style` al mecanismo de fusion de TipTap (ver
        // renderHTML del atributo align, mas abajo) — se calcula el resultado
        // final a mano, con esta MISMA funcion, en los dos sitios: aqui y en
        // buildImg (nodeView), para que editor y exportacion sean identicos.
        const combinarEstiloAlineacionImagen = (estiloBase, align) => {
            const estiloAlineacion = align ? (ESTILO_ALINEACION_IMAGEN[align] || '') : '';
            if (!estiloAlineacion) return estiloBase || null;
            return `${estiloBase || ''};${estiloAlineacion}`.replace(/^;+|;+$/g, '').trim();
        };

        const ResizableImage = Image.extend({
            addAttributes() {
                return {
                    ...this.parent?.(),
                    // Alineacion. Al pegar desde Word (u otro HTML de email), la
                    // imagen suele venir DENTRO de un <p style="text-align:...">
                    // — pero un nodo de bloque (esta imagen) no puede vivir dentro
                    // del contenido de un parrafo (solo admite texto), asi que
                    // ProseMirror la saca fuera al parsear, perdiendo esa
                    // alineacion (queda un <p> vacio y una imagen suelta sin
                    // ningun rastro). Por eso hay que leerla del PADRE aqui, en el
                    // momento del parseo, antes de que se pierda ese contexto — y
                    // guardarla como atributo PROPIO de la imagen para que
                    // sobreviva y los botones de alinear puedan aplicarla/leerla
                    // (ver COMMAND_MAP.alignLeft/Center/Right y ACTIVE_MAP).
                    align: {
                        default: null,
                        parseHTML: el => {
                            // 1. La propia imagen: align="..." (formato clasico) o
                            //    ya trae el margin/float equivalente en su style.
                            const propio = (el.getAttribute('align') || '').toLowerCase();
                            if (['left', 'center', 'right'].includes(propio)) return propio;
                            const estiloPropio = el.getAttribute('style') || '';
                            if (/margin-left\s*:\s*auto/i.test(estiloPropio) && /margin-right\s*:\s*auto/i.test(estiloPropio)) return 'center';
                            if (/float\s*:\s*right/i.test(estiloPropio)) return 'right';
                            if (/float\s*:\s*left/i.test(estiloPropio)) return 'left';
                            // 2. Subir por los ancestros hasta el primer contenedor
                            //    de bloque (asi exporta Word: el <p align="center">
                            //    real casi nunca es el padre INMEDIATO, suele meter
                            //    de por medio un <span> con estilos mso-* — mirar
                            //    solo un nivel se queda corto). Se para en el
                            //    primer P/DIV/LI encontrado (tenga o no alineacion:
                            //    mas arriba ya no es "el envoltorio de esta imagen"),
                            //    y no cruza nunca el limite de una celda de tabla
                            //    (eso ya seria la alineacion de otra cosa).
                            let nodo = el.parentElement;
                            for (let saltos = 0; nodo && saltos < 6; saltos++, nodo = nodo.parentElement) {
                                if (/^(TABLE|TD|TH|BODY)$/.test(nodo.tagName)) break;
                                const alignNodo = (nodo.getAttribute('align') || '').toLowerCase();
                                if (['left', 'center', 'right'].includes(alignNodo)) return alignNodo;
                                const m = (nodo.getAttribute('style') || '').match(/text-align\s*:\s*(left|center|right)/i);
                                if (m) return m[1].toLowerCase();
                                if (/^(P|DIV|LI)$/.test(nodo.tagName)) break;
                            }
                            return null;
                        },
                        // OJO: NO aporta `style` aqui — ver el porque en el
                        // comentario de combinarEstiloAlineacionImagen. El style
                        // final (base + alineacion) se calcula a mano en el
                        // renderHTML del NODO (mas abajo), no en el de este
                        // atributo suelto.
                        renderHTML: attrs => attrs.align ? { align: attrs.align } : {},
                    },
                    // Hipervinculo en la imagen: NO se implementa con la marca 'link'
                    // (como en el texto) porque ProseMirror restringe addMark/setMark
                    // a nodos inline exclusivamente (comprobado en el propio
                    // tiptap-bundle.js: Transform.addMark descarta cualquier nodo con
                    // isInline=false, y esta imagen es un nodo de bloque) — con marca
                    // el enlace se "aplicaba" sin error pero nunca se guardaba. En su
                    // lugar, href es un atributo normal del nodo imagen: parseHTML lo
                    // recupera del <a> que envuelve el <img> si lo hay, y renderHTML
                    // (mas abajo) envuelve la salida en <a> cuando hay href. Se aplica
                    // via updateAttributes('image', {href}) en _insertLink(), igual
                    // que ya se hace con width/height/style al redimensionar.
                    href: {
                        default: null,
                        parseHTML: el => el.closest('a')?.getAttribute('href') || null,
                        renderHTML: () => ({}), // no se vuelca como atributo del <img>; lo gestiona renderHTML()
                    },
                    width: {
                        default: null,
                        parseHTML: el => {
                            // Primero buscar atributo width
                            const attrWidth = el.getAttribute('width');
                            if (attrWidth) return attrWidth;
                            
                            // Si no, buscar en style (soporta px, in, cm, em, pt, %)
                            const style = el.getAttribute('style') || '';
                            const match = style.match(/width\s*:\s*([\d.]+)\s*(px|in|cm|em|pt|%)?/i);
                            if (match) {
                                const value = parseFloat(match[1]);
                                const unit = (match[2] || 'px').toLowerCase();
                                // Convertir a px si es necesario
                                if (unit === 'in') return Math.round(value * 96);
                                if (unit === 'cm') return Math.round(value * 37.8);
                                if (unit === 'pt') return Math.round(value * 1.33);
                                if (unit === '%') return match[1] + '%';
                                return Math.round(value);
                            }
                            return null;
                        },
                        renderHTML: attrs => attrs.width ? { width: attrs.width } : {}
                    },
                    height: {
                        default: null,
                        parseHTML: el => {
                            // Primero buscar atributo height
                            const attrHeight = el.getAttribute('height');
                            if (attrHeight) return attrHeight;
                            
                            // Si no, buscar en style (soporta px, in, cm, em, pt, %)
                            const style = el.getAttribute('style') || '';
                            const match = style.match(/height\s*:\s*([\d.]+)\s*(px|in|cm|em|pt|%)?/i);
                            if (match) {
                                const value = parseFloat(match[1]);
                                const unit = (match[2] || 'px').toLowerCase();
                                // Convertir a px si es necesario
                                if (unit === 'in') return Math.round(value * 96);
                                if (unit === 'cm') return Math.round(value * 37.8);
                                if (unit === 'pt') return Math.round(value * 1.33);
                                if (unit === '%') return match[1] + '%';
                                return Math.round(value);
                            }
                            return null;
                        },
                        renderHTML: attrs => attrs.height ? { height: attrs.height } : {}
                    },
                    style: {
                        default: null,
                        parseHTML: el => {
                            // Limpiar width/height del style: ya los manejamos con atributos dedicados
                            let style = el.getAttribute('style') || '';
                            style = style.replace(/\bwidth\s*:[^;]+;?\s*/gi, '');
                            style = style.replace(/\bheight\s*:[^;]+;?\s*/gi, '');
                            style = style.trim().replace(/;$/, '');
                            return style || null;
                        },
                        renderHTML: attrs => attrs.style ? { style: attrs.style } : {}
                    }
                };
            },
            renderHTML({ HTMLAttributes, node }) {
                // Usado por getHTML()/serializacion (el HTML final, email, etc.) —
                // aqui SI hace falta un <a> real. La vista en vivo del editor NO
                // usa esto (ver addNodeView): un <a href> real con
                // contenteditable="false" (asi es como ProseMirror pinta un nodo
                // sin contenido editable, como esta imagen) el navegador lo trata
                // como un enlace normal de pagina y navega igual aunque se llame
                // preventDefault() en 'click' — comprobado en real, no basta con
                // interceptar el evento. Por eso el <a> en vivo no puede existir.
                const image = this.parent?.({ HTMLAttributes, node }) ?? ['img', HTMLAttributes];
                // Style final calculado a mano (no delegado en la fusion
                // automatica de TipTap entre atributos) — ver el porque en
                // combinarEstiloAlineacionImagen.
                if (node.attrs.align) {
                    const attrsImagen = image[1] || (image[1] = {});
                    const estilo = combinarEstiloAlineacionImagen(node.attrs.style, node.attrs.align);
                    if (estilo) attrsImagen.style = estilo;
                }
                if (!node.attrs.href) return image;
                return ['a', { href: node.attrs.href, target: '_blank', rel: 'noopener noreferrer' }, image];
            },
            // Vista en vivo dentro del editor: SIN <a> real (ver motivo arriba).
            // Un <span> contenteditable="false" con la imagen dentro — visualmente
            // identico, pero nada que el navegador pueda navegar, nunca, ni con
            // click ni doble click. El <a> real solo lo genera renderHTML(), para
            // el HTML de salida (ahi si navega con normalidad, ej. vista previa).
            addNodeView() {
                const buildImg = (n) => {
                    const img = document.createElement('img');
                    if (n.attrs.src) img.setAttribute('src', n.attrs.src);
                    if (n.attrs.alt) img.setAttribute('alt', n.attrs.alt);
                    if (n.attrs.title) img.setAttribute('title', n.attrs.title);
                    if (n.attrs.width) img.setAttribute('width', n.attrs.width);
                    if (n.attrs.height) img.setAttribute('height', n.attrs.height);
                    // Misma funcion que usa renderHTML() (exportacion) — ver
                    // combinarEstiloAlineacionImagen para el porque: editor y
                    // salida final deben calcular el style exactamente igual.
                    const estiloCombinado = combinarEstiloAlineacionImagen(n.attrs.style, n.attrs.align);
                    if (estiloCombinado) img.setAttribute('style', estiloCombinado);
                    return img;
                };

                return ({ node }) => {
                    const dom = document.createElement('span');
                    dom.className = 'wcrt-img-node';
                    dom.contentEditable = 'false';
                    dom.draggable = true;
                    // Marca (solo CSS, sin href real) si la imagen esta enlazada:
                    // el cursor de "mano" en disabled/readonly (ver
                    // EDITOR_SURFACE_CSS) usa esta clase, ya que no hay ningun
                    // <a> real aqui del que el navegador pueda deducirlo solo.
                    dom.classList.toggle('wcrt-img-linked', !!node.attrs.href);

                    let img = buildImg(node);
                    dom.appendChild(img);

                    return {
                        dom,
                        update(updatedNode) {
                            if (updatedNode.type.name !== 'image') return false;
                            const newImg = buildImg(updatedNode);
                            dom.replaceChild(newImg, img);
                            img = newImg;
                            dom.classList.toggle('wcrt-img-linked', !!updatedNode.attrs.href);
                            return true;
                        },
                    };
                };
            }
        });

        // NOTA: antes habia aqui tres extensiones (StyledTable/StyledTableCell/
        // StyledTableHeader) que solo servian para conservar style/class en
        // tabla y celdas. Ya no hacen falta para FILA/CELDA/CABECERA:
        // EmailHtmlAttributes (arriba) las cubre bien (align/valign/width/
        // height/bgcolor/id/class/style se comprobaron en un <td> real). El
        // toggle de bordes de tabla (COMMAND_MAP.tableBorderToggle) sigue
        // funcionando igual: escribe sobre el mismo atributo `style` de las
        // celdas, ahora declarado ahi.
        //
        // La TABLA es la excepcion, pero no por el motivo que parecia al
        // principio. Declarar width/height como atributos propios (como
        // passthroughAttribute) SI alcanza para que getHTML() los conserve
        // bien — comprobado con ed.state.doc.descendants(): attrs.width salia
        // "600"/"100%" perfecto, el parseo funciona. El problema es OTRO: la
        // vista EN VIVO del editor no la arma renderHTML/toDOM en absoluto —
        // la arma un NodeView propio de la extension Table (TableView, en
        // tiptap-bundle.js), que construye el <table> real a mano y SOLO copia
        // el atributo `style` (`t.attrs.style && (this.table.style.cssText =
        // t.attrs.style)`) — width/height/align/valign/bgcolor/class/id
        // declarados sueltos quedan totalmente invisibles mientras se edita,
        // por mas que el schema y el nodo los tengan bien. Y ese `style` que
        // lee el NodeView es el YA GUARDADO en el nodo (lo que devolvio
        // parseHTML), no el recalculado por renderHTML — plegar width/height
        // en el style SOLO en renderHTML no alcanza, hay que plegarlo en
        // parseHTML, para que quede adentro del string que el NodeView
        // realmente lee. Por eso width/height se pliegan aqui DENTRO del
        // propio `style` (no quedan como atributos width=/height= sueltos).
        const plegarEnStyle = (estiloBase, propiedad, valor) => {
            if (!valor) return estiloBase;
            const valorCss = /^\d+$/.test(valor) ? `${valor}px` : valor;
            const partes = estiloBase ? [estiloBase.replace(/;\s*$/, '')] : [];
            partes.push(`${propiedad}: ${valorCss}`);
            return partes.join('; ');
        };
        const EmailTable = Table.extend({
            addAttributes() {
                return {
                    ...this.parent?.(),
                    style: {
                        default: null,
                        parseHTML: element => {
                            let estilo = element.getAttribute('style');
                            estilo = plegarEnStyle(estilo, 'width', element.getAttribute('width'));
                            estilo = plegarEnStyle(estilo, 'height', element.getAttribute('height'));
                            return estilo;
                        },
                        renderHTML: attributes => attributes.style ? { style: attributes.style } : {},
                    },
                };
            },
        });

        // Celdas de tabla: TipTap las "moderniza" por su cuenta y eso rompe la
        // fidelidad del HTML de plantilla:
        //  - su atributo `align` NO se vuelve a escribir como align, lo traduce
        //    a `style="text-align: ..."` (helper interno de la extension Table).
        //  - escribe SIEMPRE colspan="1" rowspan="1", aunque el HTML original no
        //    los llevara.
        // Aqui se restaura el comportamiento de paso: align sale como align, y
        // colspan/rowspan solo cuando aportan algo (!= 1). El parseo no se toca,
        // asi que las tablas creadas desde la toolbar (y merge/split de celdas)
        // siguen funcionando igual: colspan/rowspan viven en el modelo, no en el
        // HTML de salida.
        const atributosDeCelda = (heredados) => ({
            ...heredados,
            align: passthroughAttribute('align'),
            colspan: {
                ...heredados.colspan,
                renderHTML: attributes => attributes.colspan && attributes.colspan !== 1
                    ? { colspan: attributes.colspan } : {},
            },
            rowspan: {
                ...heredados.rowspan,
                renderHTML: attributes => attributes.rowspan && attributes.rowspan !== 1
                    ? { rowspan: attributes.rowspan } : {},
            },
        });
        const EmailTableCell = TableCell.extend({
            addAttributes() { return atributosDeCelda(this.parent?.() || {}); },
        });
        const EmailTableHeader = TableHeader.extend({
            addAttributes() { return atributosDeCelda(this.parent?.() || {}); },
        });

        // Contraparte de EmailTable: el `style` que se pliega en parseHTML
        // (con width/height ya adentro) SOBREVIVE en el nodo, pero se BORRA
        // igual al construir el DOM en vivo. Causa (confirmada leyendo
        // tiptap-bundle.js): el NodeView de tabla (clase interna `rb`, la usa
        // SIEMPRE la extension Table, sea o no resizable:true) copia
        // `t.attrs.style` al <table> real y, en el mismo paso, llama a una
        // funcion interna (`Zu`) que RECALCULA table.style.width/minWidth a
        // partir de `colwidth` (atributo interno de ProseMirror-tables, solo
        // se puebla arrastrando el borde de una columna) de las celdas de la
        // fila 1. Como el HTML de una plantilla de email nunca trae ese dato,
        // Zu() SIEMPRE toma la rama que limpia table.style.width (lo deja "")
        // y pone un minWidth chico en su lugar — pisando el width/height que
        // acabamos de plegar en `style`, aunque el nodo (y getHTML()) lo
        // tengan perfecto. No hay forma de evitarlo desde parseHTML/
        // renderHTML: Zu corre DESPUES, dentro del propio NodeView de la
        // libreria. La unica ventana disponible es reponerlo una vez que
        // Tiptap termina de renderizar (onCreate/onUpdate, mas abajo).
        //
        // `!tableEl.style.width` es la señal de que Zu() tomo la rama que
        // limpia: en la otra rama (arrastre manual de una columna, con
        // colwidth ya poblado) Zu() SI deja un width calculado (nunca vacio)
        // y ahi no tocamos nada, para no pelear con ese gesto del usuario.
        //
        // align/valign/bgcolor/class/id de la tabla tienen el mismo problema
        // de raiz (el NodeView solo copia `style`, nada mas) pero no dependen
        // de Zu(): se reponen aqui tambien, como atributos HTML normales (no
        // van dentro de `style`).
        const ATRIBUTOS_TABLA_EN_VIVO = ['align', 'valign', 'bgcolor', 'class', 'id'];
        const reaplicarAtributosDeTabla = (editor) => {
            const { view } = editor;
            view.state.doc.descendants((node, pos) => {
                if (node.type.name !== 'table') return;
                const wrapperDom = view.nodeDOM(pos);
                const tableEl = wrapperDom?.querySelector?.(':scope > table');
                if (!tableEl) return;
                if (node.attrs.style && !tableEl.style.width) {
                    tableEl.style.cssText = node.attrs.style;
                }
                ATRIBUTOS_TABLA_EN_VIVO.forEach(nombre => {
                    const valor = node.attrs[nombre];
                    if (valor) {
                        if (tableEl.getAttribute(nombre) !== valor) tableEl.setAttribute(nombre, valor);
                    } else if (tableEl.hasAttribute(nombre)) {
                        tableEl.removeAttribute(nombre);
                    }
                });
            });
        };

        // Enlaces: conservar el target/rel que traiga el HTML original y, si no
        // trae ninguno, decidirlo segun el destino. Antes se forzaba
        // target="_blank" a TODOS via `HTMLAttributes` de la extension Link, lo
        // que rompia la navegacion interna de las plantillas: un enlace de ancla
        // (href="#castellano") abria una pestaña nueva en vez de saltar dentro
        // del propio documento.
        const esAnclaInterna = (href) => typeof href === 'string' && href.startsWith('#');
        const EmailLink = Link.extend({
            addAttributes() {
                return {
                    ...this.parent?.(),
                    target: {
                        default: null,
                        parseHTML: element => element.getAttribute('target'),
                        renderHTML: attributes => {
                            if (attributes.target) return { target: attributes.target };
                            return esAnclaInterna(attributes.href) ? {} : { target: '_blank' };
                        },
                    },
                    rel: {
                        default: null,
                        parseHTML: element => element.getAttribute('rel'),
                        renderHTML: attributes => {
                            if (attributes.rel) return { rel: attributes.rel };
                            return esAnclaInterna(attributes.href) ? {} : { rel: 'noopener noreferrer' };
                        },
                    },
                };
            },
        });

        // Nodo Center (codigo propio, NO parte de TipTap/prosemirror): conserva
        // el tag <center> tal cual. ProseMirror no lo reconoce (no hay parseDOM
        // que matchee "center" en ningun node/mark del schema), asi que por
        // defecto lo "desenvuelve": tira el tag y sigue parseando sus hijos en
        // el mismo contexto, perdiendo el centrado. Es el caso de las
        // plantillas de email: <center> es lo que centra la tabla de diseño
        // (ej. 600px) dentro del contenedor de fondo (ej. 100% de ancho) — sin
        // el tag, la tabla queda pegada a la izquierda en vez de centrada,
        // aunque su ancho ya se calcule bien (ver EmailHtmlAttributes y el
        // display:table de .tableWrapper en EDITOR_SURFACE_CSS). No alcanza
        // con `text-align:center` (solo centra contenido INLINE dentro de un
        // elemento — un <table>, que es de bloque, no se mueve con eso, hace
        // falta margin:auto en el propio elemento o el comportamiento legado
        // especial de <center>, que si centra bloques). Se preserva el tag
        // real (no se traduce a otra cosa) para ser fiel al HTML original,
        // igual que StyleBlock con <style> y AnchorTarget con <a> vacio.
        const Center = Node.create({
            name: 'center',
            group: 'block',
            content: 'block+',
            parseHTML() {
                return [{ tag: 'center' }];
            },
            renderHTML() {
                return ['center', 0];
            },
        });

        // Nodo HtmlContainer (codigo propio, mismo principio que Center de
        // arriba, aplicado a un juego mas amplio de etiquetas): las paginas y
        // plantillas HTML hechas fuera maquetan con etiquetas estructurales de
        // HTML5 (header, nav, footer, section, article, aside, main, figure,
        // figcaption, div) que StarterKit no trae en su schema por defecto
        // (solo paragraph/heading/lista/blockquote/codeBlock/hr). Sin
        // declararlas, ProseMirror las "desenvuelve" igual que hacia con
        // <center>: descarta el propio elemento (tag, class, id, style) y
        // conserva solo su contenido aplanado en el nodo padre. El <style> de
        // la plantilla sobrevive intacto (ver StyleBlock) pero sus reglas
        // (header{...}, nav a{...}, .card{...}, .grid{...}) dejan de tener
        // sobre que elemento aplicarse — el diseño se desmonta aunque el CSS
        // este bien. Un solo node type cubre toda la lista de etiquetas, igual
        // que 'heading' usa un atributo 'level' para h1-h6: el atributo 'tag'
        // guarda cual era la etiqueta real y renderHTML la reproduce tal cual
        // (en getHTML() y en la vista en vivo, ambos comparten esta unica
        // regla — a diferencia de StyleBlock, aqui no hace falta un
        // addNodeView propio: un <header>/<nav>/<div> real en el DOM del
        // editor no tiene el problema del <a> de ResizableImage). content
        // 'block*' (no 'block+'): tolera contenedores vacios (ej. un div
        // separador sin texto) sin que la etiqueta entera se pierda al
        // exigirse al menos un hijo que no existe.
        const HTML_CONTAINER_TAGS = ['div', 'header', 'nav', 'footer', 'section', 'article', 'aside', 'main', 'figure', 'figcaption'];
        const HtmlContainer = Node.create({
            name: 'htmlContainer',
            group: 'block',
            content: 'block*',
            addAttributes() {
                return {
                    // No se lee de ningun atributo HTML propio: lo fija el
                    // getAttrs() de la regla de parseHTML que matcheo (una por
                    // etiqueta de HTML_CONTAINER_TAGS).
                    tag: {
                        default: 'div',
                        parseHTML: () => null,
                        renderHTML: () => ({}),
                    },
                    ...passthroughAttributes('class', 'id', 'style'),
                };
            },
            parseHTML() {
                return HTML_CONTAINER_TAGS.map(tag => ({ tag, getAttrs: () => ({ tag }) }));
            },
            renderHTML({ HTMLAttributes, node }) {
                return [node.attrs.tag || 'div', HTMLAttributes, 0];
            },
        });

        // Crear instancia del editor
        this._editor = new Editor({
            element: this._els.editor,
            extensions: [
                StarterKit.configure({
                    // Configuración del StarterKit
                    heading: {
                        levels: [1, 2, 3, 4, 5, 6]
                    }
                }),
                StyleBlock,
                Center,
                HtmlContainer,
                EmailHtmlAttributes,
                AnchorTarget,
                ResizableImage.configure({
                    inline: false,
                    allowBase64: true,
                }),
                FontSize, // Extiende TextStyle con atributo fontSize
                FontFamily.configure({
                    types: ['textStyle'],
                }),
                Color.configure({
                    types: ['textStyle'],
                }),
                Highlight.configure({
                    multicolor: true,
                }),
                TextAlign.configure({
                    types: ['heading', 'paragraph'],
                }),
                EmailLink.configure({
                    openOnClick: false,
                    autolink: true,
                    // La extension Link solo acepta por defecto una lista corta
                    // de protocolos (http/https/mailto/tel/ftp...): si no lo
                    // reconoce, su parseHTML DESCARTA el <a> entero y con el se
                    // va tambien su style — asi se rompian los botones de
                    // "añadir al calendario" (webcal://...) de las plantillas.
                    // Como el objetivo es respetar el HTML del usuario, se acepta
                    // cualquier esquema MENOS los que ejecutan codigo. Misma
                    // politica que ya aplica _insertLink() al crear enlaces.
                    isAllowedUri: (uri) => !/^\s*(javascript|data|vbscript)\s*:/i.test(uri),
                    // target/rel a null A PROPOSITO: los decide EmailLink segun
                    // el destino (ver arriba). No basta con omitir esta opcion:
                    // la extension Link trae por defecto target:'_blank' y
                    // rel:'noopener noreferrer nofollow', y se fusionan ANTES
                    // que los atributos del nodo, asi que ganarian siempre y
                    // volverian a colar target="_blank" en las anclas internas.
                    // Los valores null los descarta el serializador.
                    HTMLAttributes: {
                        target: null,
                        rel: null,
                        class: null,
                    },
                }),
                EmailTable.configure({
                    resizable: true,
                }),
                TableRow,
                EmailTableCell,
                EmailTableHeader,
            ],
            content: this._initialValue,
            editable: !this.disabled && !this.readonly,
            autofocus: false,
            
            // Opciones de parseo para mejor manejo de HTML
            parseOptions: {
                preserveWhitespace: 'full'
            },

            // Props del editor para manejar paste y transformar HTML
            editorProps: {
                // Un enlace (texto o imagen) no navega mientras se EDITA, solo
                // desde la vista previa/HTML final — o desde el propio editor en
                // readonly/disabled (ahi no hay nada que editar). Se intento
                // bloquear el click por JS (preventDefault en
                // handleDOMEvents.click) pero no funcionaba de forma fiable en
                // pruebas reales (ni con la imagen ni con texto) pese a que el
                // mecanismo de ProseMirror deberia soportarlo — se resuelve de
                // raiz en CSS (ver EDITOR_SURFACE_CSS, regla `a[href]`): evita
                // que el <a> de texto sea nunca el objetivo del click salvo en
                // readonly/disabled. La imagen ni siquiera tiene un <a> real en
                // el editor (ver renderHTML/addNodeView de ResizableImage); su
                // equivalente en readonly/disabled esta en onImageClick.

                // Transformar HTML pegado antes de que TipTap lo procese
                transformPastedHTML: (html) => {
                    return this._cleanPastedHTML(html);
                },

                // Manejador de paste para HTML pegado como texto plano
                handlePaste: (view, event, slice) => {
                    const clipboardData = event.clipboardData;
                    if (!clipboardData) return false;

                    // Intentar obtener HTML del portapapeles
                    const html = clipboardData.getData('text/html');
                    const text = clipboardData.getData('text/plain');

                    // Si hay HTML en el portapapeles, dejar que TipTap lo maneje
                    // (pasará por transformPastedHTML primero)
                    if (html && html.trim()) {
                        return false; // TipTap manejará el HTML
                    }

                    // Si el texto parece ser HTML (contiene tags), parsearlo
                    if (text && /<[a-z][\s\S]*>/i.test(text)) {
                        event.preventDefault();
                        const cleanedHTML = this._cleanPastedHTML(text);
                        this._editor.commands.insertContent(cleanedHTML, {
                            parseOptions: {
                                preserveWhitespace: false
                            }
                        });
                        return true;
                    }

                    return false; // Dejar que TipTap maneje el texto normal
                },

                handleDrop: (view, event) => {
                    const files = event.dataTransfer?.files;
                    if (!files?.length) return false;
                    const images = Array.from(files).filter(f => f.type.startsWith('image/'));
                    if (!images.length) return false;

                    event.preventDefault();

                    // Posicionar cursor en el punto de drop
                    const posInfo = view.posAtCoords({ left: event.clientX, top: event.clientY });
                    if (posInfo) {
                        this._editor.chain().setTextSelection(posInfo.pos).run();
                    }

                    images.forEach(file => this._insertImageFile(file));
                    return true;
                }
            },

            // Callbacks
            onCreate: ({ editor }) => {
                reaplicarAtributosDeTabla(editor);
            },
            onUpdate: () => {
                this._onEditorUpdate();
            },
            // Solo onTransaction: en ProseMirror un cambio de seleccion TAMBIEN
            // es una transaccion, asi que tener ademas onSelectionUpdate hacia
            // que la toolbar se recalculase dos veces por cada pulsacion.
            //
            // reaplicarAtributosDeTabla() TAMBIEN va aqui (no solo en onUpdate/
            // onCreate): el plugin columnResizing (parte de la extension Table,
            // activo con resizable:true) redecora la tabla al pasar el mouse
            // por encima o mover la seleccion dentro de ella — SIN cambiar el
            // documento — y eso ya alcanza para que ProseMirror vuelva a llamar
            // al `update()` del NodeView de la tabla, que llama a Zu() de
            // nuevo y vuelve a limpiar table.style.width. Como ese caso NO es
            // un cambio de documento, onUpdate no se dispara — de ahi que el
            // ancho se viera "revertir" solo con pasar el mouse/hacer scroll
            // encima de la tabla (dispara hover del plugin) o al clickear para
            // editar (mueve la seleccion dentro de la tabla), sin tocar una
            // sola tecla.
            onTransaction: ({ editor }) => {
                reaplicarAtributosDeTabla(editor);
                this._programarActualizacionToolbar(editor);
            },
            onFocus: () => {
                this._els.wrapper.classList.add('is-focused');
                this.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
            },
            onBlur: () => {
                this._els.wrapper.classList.remove('is-focused');
                this._onEditorBlur();
                this.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
            }
        });

        // Mismo criterio que _sincronizarAhora (vacio -> ''), si no el primer
        // blur sin haber editado nada dispararia un 'change' falso
        this._lastValue = this._htmlActual();
        this._syncFormValue(this._lastValue);
        this._initImageResizer();
    }

    _destroyEditor() {
        // Trabajo agrupado pendiente: se cancela (el contenido se preserva mas
        // abajo leyendo el editor antes de destruirlo, que es mas fiable)
        clearTimeout(this._syncTimer);
        this._syncTimer = null;
        if (this._toolbarFrame) {
            cancelAnimationFrame(this._toolbarFrame);
            this._toolbarFrame = null;
        }

        if (this._editor) {
            // Preservar el contenido escrito por el usuario antes de destruir.
            // El editable es un contenteditable (no un <input>/<textarea>), asi que
            // RightSidebar._snapshotNodes NO lo guarda: si no lo persistimos aqui,
            // al re-hidratar en connectedCallback se perderia lo tecleado.
            let html = null;
            try { html = this._editor.getHTML(); } catch (e) { /* editor en estado inconsistente */ }
            this._editor.destroy();
            this._editor = null;
            // El editor ya no existe: marcar como no inicializado para que un futuro
            // connectedCallback re-monte el editor sobre el DOM (ver connectedCallback).
            this._isInitialized = false;
            if (html !== null) {
                this._initialValue = html;
                this._value = html;
            }
        }
        // Limpiar resize handler
        if (this._imageResizeCleanup) {
            this._imageResizeCleanup();
            this._imageResizeCleanup = null;
        }
    }

    // =========================================================================
    // LÓGICA INTERNA - Resize de imágenes
    // =========================================================================

    _initImageResizer() {
        const editor = this._els.editor;
        if (!editor) return;

        let activeImage = null;
        let handles = { right: null, bottom: null, corner: null };
        let currentHandle = null;
        let startX, startY, startWidth, startHeight;

        // Crear handles de resize
        const createHandles = () => {
            // Handle derecho (solo ancho)
            handles.right = document.createElement('div');
            handles.right.className = 'wcrt-resize-handle wcrt-resize-right';
            handles.right.dataset.direction = 'right';
            
            // Handle inferior (solo alto)
            handles.bottom = document.createElement('div');
            handles.bottom.className = 'wcrt-resize-handle wcrt-resize-bottom';
            handles.bottom.dataset.direction = 'bottom';
            
            // Handle esquina (proporcional)
            handles.corner = document.createElement('div');
            handles.corner.className = 'wcrt-resize-handle wcrt-resize-corner';
            handles.corner.dataset.direction = 'corner';
        };

        // Posicionar handles sobre la imagen
        const positionHandles = (img) => {
            const rect = img.getBoundingClientRect();
            const editorRect = editor.getBoundingClientRect();
            const scrollLeft = editor.scrollLeft;
            const scrollTop = editor.scrollTop;
            
            // Handle derecho (centro del borde derecho)
            handles.right.style.left = (rect.right - editorRect.left - 8 + scrollLeft) + 'px';
            handles.right.style.top = (rect.top + rect.height/2 - editorRect.top - 8 + scrollTop) + 'px';
            
            // Handle inferior (centro del borde inferior)
            handles.bottom.style.left = (rect.left + rect.width/2 - editorRect.left - 8 + scrollLeft) + 'px';
            handles.bottom.style.top = (rect.bottom - editorRect.top - 8 + scrollTop) + 'px';
            
            // Handle esquina (esquina inferior derecha)
            handles.corner.style.left = (rect.right - editorRect.left - 12 + scrollLeft) + 'px';
            handles.corner.style.top = (rect.bottom - editorRect.top - 12 + scrollTop) + 'px';
            
            // Añadir al editor si no están
            Object.values(handles).forEach(h => {
                if (!h.parentElement) editor.appendChild(h);
            });
        };

        // Ocultar handles
        const hideHandles = () => {
            Object.values(handles).forEach(h => h?.remove());
        };

        // Click en imagen: mostrar handles
        const onImageClick = (e) => {
            if (e.target.tagName === 'IMG' && editor.contains(e.target)) {
                e.preventDefault();

                const pos = this._editor?.view.posAtDOM(e.target, 0);

                // En readonly/disabled no se puede editar (ni hay toolbar con el
                // botón "Enlace" para aplicarlo/quitarlo: el editor no es mas
                // que una vista de lectura). Igual que un enlace de texto SI
                // navega en ese caso (ver EDITOR_SURFACE_CSS), una imagen
                // enlazada tambien debe hacerlo — no tiene sentido bloquearla
                // cuando no hay nada que editar. La imagen nunca lleva un <a>
                // real en el DOM en vivo (ver renderHTML/addNodeView de
                // ResizableImage), asi que hay que leer el href del propio
                // nodo de ProseMirror, no del DOM.
                if (this.disabled || this.readonly) {
                    const nodo = pos != null ? this._editor.state.doc.nodeAt(pos) : null;
                    if (nodo?.attrs?.href) {
                        window.open(nodo.attrs.href, '_blank', 'noopener,noreferrer');
                    }
                    return;
                }

                activeImage = e.target;
                positionHandles(activeImage);
                // Seleccionar la imagen como nodo en el propio ProseMirror (no solo
                // en nuestro estado local `activeImage`, que solo sirve para el
                // arrastre de los handles): sin esto this._editor.state.selection
                // nunca es una NodeSelection de imagen, y _insertLink() no puede
                // aplicarle un enlace (ni tampoco se ve el resaltado
                // .ProseMirror-selectednode ya definido en el CSS).
                if (pos != null && pos >= 0) {
                    this._editor.commands.setNodeSelection(pos);
                }
            }
        };

        // Click fuera: ocultar handles
        const onEditorClick = (e) => {
            const isHandle = Object.values(handles).includes(e.target);
            if (e.target.tagName !== 'IMG' && !isHandle) {
                hideHandles();
                activeImage = null;
            }
        };

        // Iniciar resize
        const onHandleMouseDown = (e) => {
            if (!activeImage) return;
            e.preventDefault();
            e.stopPropagation();
            currentHandle = e.target.dataset.direction;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = activeImage.offsetWidth;
            startHeight = activeImage.offsetHeight;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        // Redimensionar según el handle usado
        const onMouseMove = (e) => {
            if (!activeImage || !currentHandle) return;
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            let newWidth = startWidth;
            let newHeight = startHeight;
            
            if (currentHandle === 'right') {
                // Solo ancho
                newWidth = Math.max(30, startWidth + deltaX);
            } else if (currentHandle === 'bottom') {
                // Solo alto
                newHeight = Math.max(30, startHeight + deltaY);
            } else if (currentHandle === 'corner') {
                // Proporcional
                const aspectRatio = startWidth / startHeight;
                newWidth = Math.max(30, startWidth + deltaX);
                newHeight = Math.round(newWidth / aspectRatio);
            }
            
            activeImage.style.width = newWidth + 'px';
            activeImage.style.height = newHeight + 'px';
            activeImage.removeAttribute('width');
            activeImage.removeAttribute('height');
            positionHandles(activeImage);
        };

        // Finalizar resize y guardar en TipTap
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            currentHandle = null;
            if (activeImage && this._editor) {
                const width = activeImage.offsetWidth;
                const height = activeImage.offsetHeight;
                this._editor.chain().focus().updateAttributes('image', {
                    width: width,
                    height: height,
                    style: `width: ${width}px; height: ${height}px;`
                }).run();
            }
        };

        // Crear handles
        createHandles();

        // Event listeners
        editor.addEventListener('click', onImageClick);
        editor.addEventListener('click', onEditorClick);
        
        // Añadir listeners a cada handle
        Object.values(handles).forEach(h => {
            h.addEventListener('mousedown', onHandleMouseDown);
        });

        // Cleanup function
        this._imageResizeCleanup = () => {
            editor.removeEventListener('click', onImageClick);
            editor.removeEventListener('click', onEditorClick);
            Object.values(handles).forEach(h => {
                h?.removeEventListener('mousedown', onHandleMouseDown);
                h?.remove();
            });
        };
    }

    // =========================================================================
    // LÓGICA INTERNA - Toolbar
    // =========================================================================

    _buildToolbar() {
        if (!this._els.toolbar) return;

        this._els.toolbar.innerHTML = '';
        const buttons = this.toolbarConfig.buttons || WCRichText.DEFAULT_TOOLBAR;

        // Botones que solo se muestran dentro de una tabla (sin tableInsert)
        const TABLE_CTX_BUTTONS = WCRichText.TABLE_CTX_BUTTONS;

        // Agrupar la sección de tabla en un contenedor propio
        // Detectar dónde empieza el bloque de tabla para envolver separadores también
        let tableGroup = null;
        let prevWasTableCtx = false;

        buttons.forEach(buttonId => {
            const isTableCtx = TABLE_CTX_BUTTONS.includes(buttonId);
            const isTableInsert = buttonId === 'tableInsert';

            if (buttonId === '|') {
                const separator = document.createElement('span');
                separator.className = 'wcrt-separator';
                // Si el separador está dentro de la zona de botones de contexto de tabla, ocultarlo también
                if (prevWasTableCtx) {
                    separator.classList.add('wcrt-table-ctx');
                    separator.style.display = 'none';
                }
                this._els.toolbar.appendChild(separator);
                // El separador no cambia el estado de prevWasTableCtx
            } else if (buttonId === 'fontFamily') {
                prevWasTableCtx = false;
                const select = this._createFontFamilySelect();
                if (select) this._els.toolbar.appendChild(select);
            } else if (buttonId === 'fontSize') {
                prevWasTableCtx = false;
                const select = this._createFontSizeSelect();
                if (select) this._els.toolbar.appendChild(select);
            } else if (buttonId === 'headingStyle') {
                prevWasTableCtx = false;
                const select = this._createHeadingStyleSelect();
                if (select) this._els.toolbar.appendChild(select);
            } else if (buttonId === 'textColor') {
                prevWasTableCtx = false;
                const colorPicker = this._createColorPicker('textColor', 'Color de texto', '#000000');
                if (colorPicker) this._els.toolbar.appendChild(colorPicker);
            } else if (buttonId === 'bgColor') {
                prevWasTableCtx = false;
                const colorPicker = this._createColorPicker('bgColor', 'Color de fondo', '#ffffff');
                if (colorPicker) this._els.toolbar.appendChild(colorPicker);
            } else {
                prevWasTableCtx = isTableCtx;
                const btn = this._createToolbarButton(buttonId);
                if (btn) this._els.toolbar.appendChild(btn);
            }
        });

        // Añadir botones custom
        if (this._customButtons && this._customButtons.length > 0) {
            // Añadir separador antes de custom buttons
            const separator = document.createElement('span');
            separator.className = 'wcrt-separator';
            this._els.toolbar.appendChild(separator);

            this._customButtons.forEach(customBtn => {
                const btn = this._createCustomButton(customBtn);
                if (btn) {
                    this._els.toolbar.appendChild(btn);
                }
            });
        }

    }

    _createColorPicker(type, title, defaultColor) {
        const wrapper = document.createElement('div');
        wrapper.className = 'wcrt-color-picker';
        wrapper.title = title;

        const btn = document.createElement('wc-button');
        btn.variant = "soft-transparent";
        btn.className = `wcrt-btn wcrt-color-btn ${type}`;
        btn.dataset.command = type;

        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'wcrt-color-input';
        input.value = defaultColor;

        // Al hacer click en el botón, abrir el color picker
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!this.disabled && !this.readonly) {
                input.click();
            }
        });

        const noColorDefault = type === 'textColor' ? '#000000' : '#ffffff';

        const bar = document.createElement('div');
        bar.className = 'wcrt-color-bar';
        bar.style.background = noColorDefault;

        // Al cambiar el color
        input.addEventListener('input', (e) => {
            const color = e.target.value;
            bar.style.background = color;
            if (!this.disabled && !this.readonly && this._editor) {
                if (type === 'textColor') {
                    this._editor.chain().focus().setColor(color).run();
                } else if (type === 'bgColor') {
                    this._editor.chain().focus().toggleHighlight({ color }).run();
                }
            }
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(input);
        wrapper.appendChild(bar);

        // Guardar referencia
        if (type === 'textColor') {
            this._els.textColorPicker = input;
            this._els.textColorBar = bar;
        } else {
            this._els.bgColorPicker = input;
            this._els.bgColorBar = bar;
        }

        return wrapper;
    }

    _createFontFamilySelect() {
        const T = window.Traduccion || {};

        const sel = document.createElement('wc-select');
        sel.className = 'wcrt-font-select';
        sel.setAttribute('placeholder', T.TIPO_FUENTE || 'Fuente');
        sel.setAttribute('required', '');
        sel.options = WCRichText.FONTS.map(f => ({ label: f.name, value: f.value }));
        sel.value = 'Arial, sans-serif';

        sel.addEventListener('change', () => {
            if (!this.disabled && !this.readonly && this._editor) {
                const val = sel.value;
                if (val) {
                    this._editor.chain().focus().setFontFamily(val).run();
                } else {
                    this._editor.chain().focus().unsetFontFamily().run();
                }
            }
        });

        sel.renderOption  = (opt) => `<span style="font-family:${opt.value};display:block">${opt.label}</span>`;
        sel.renderSelected = (opt) => `<span style="font-family:${opt.value}">${opt.label}</span>`;

        this._els.fontSelect = sel;
        return sel;
    }

    _createFontSizeSelect() {
        const T = window.Traduccion || {};

        const sel = document.createElement('wc-select');
        sel.className = 'wcrt-fontsize-select';
        sel.setAttribute('placeholder', T['TAMAÑO_DE_FUENTE'] || 'Tamaño');
        sel.setAttribute('required', '');
        sel.options = WCRichText.FONT_SIZES.map(s => ({ label: s.name, value: s.value }));
        sel.value = '12px';

        sel.addEventListener('change', () => {
            if (!this.disabled && !this.readonly && this._editor) {
                const val = sel.value;
                if (val) {
                    this._editor.chain().focus().setFontSize(val).run();
                } else {
                    this._editor.chain().focus().unsetFontSize().run();
                }
            }
        });

        // Cada tamaño se muestra en su propio tamaño, capado a 24px para evitar items gigantes
        sel.renderOption = (opt) => {
            const px = Math.min(parseInt(opt.value, 10), 24);
            return `<span style="font-size:${px}px;line-height:1.3;display:block">${opt.label}</span>`;
        };

        this._els.fontSizeSelect = sel;
        return sel;
    }

    _createHeadingStyleSelect() {
        const T = window.Traduccion || {};
        const titulo = T.TITULO || 'Título';
        const normal = T.NORMAL || 'Normal';

        const sel = document.createElement('wc-select');
        sel.className = 'wcrt-headingstyle-select';
        sel.setAttribute('placeholder', titulo);
        sel.setAttribute('required', '');
        sel.options = [
            { label: normal,       value: 'normal' },
            { label: titulo + ' 1', value: 'h1' },
            { label: titulo + ' 2', value: 'h2' },
            { label: titulo + ' 3', value: 'h3' },
            { label: titulo + ' 4', value: 'h4' },
            { label: titulo + ' 5', value: 'h5' },
            { label: titulo + ' 6', value: 'h6' },
        ];
        sel.value = 'normal';

        sel.addEventListener('change', () => {
            if (!this.disabled && !this.readonly && this._editor) {
                const val = sel.value;
                if (!val || val === 'normal') {
                    this._editor.chain().focus().setParagraph().run();
                } else {
                    const level = parseInt(val.replace('h', ''), 10);
                    // Si ya estamos en ese nivel, no hacer nada (evitar toggle-off)
                    if (this._editor.isActive('heading', { level })) return;
                    this._editor.chain().focus().toggleHeading({ level }).run();
                }
            }
        });

        // Cada opción se muestra con el estilo visual de su nivel de encabezado
        const headingStyles = {
            normal: 'font-size:13px;font-weight:400',
            h1: 'font-size:22px;font-weight:700;line-height:1.2',
            h2: 'font-size:18px;font-weight:700;line-height:1.2',
            h3: 'font-size:15px;font-weight:600;line-height:1.2',
            h4: 'font-size:14px;font-weight:600;line-height:1.2',
            h5: 'font-size:13px;font-weight:600;line-height:1.2',
            h6: 'font-size:12px;font-weight:600;color:#888;line-height:1.2',
        };
        sel.renderOption = (opt) => {
            const style = headingStyles[opt.value] || headingStyles.normal;
            return `<span style="${style};display:block">${opt.label}</span>`;
        };

        this._els.headingStyleSelect = sel;
        return sel;
    }

    _createToolbarButton(buttonId) {
        // Botones especiales que no están en COMMAND_MAP
        const isSpecialButton = buttonId === 'image' || buttonId === 'sourceCode' || buttonId === 'link' || buttonId === 'print' || buttonId === 'preview';
        const command = WCRichText.COMMAND_MAP[buttonId];

        if (!command && !isSpecialButton) {
            console.warn(`[WCRichText] Botón desconocido: ${buttonId}`);
            return null;
        }

        // Botones que solo se muestran cuando el cursor está dentro de una tabla
        const btn = document.createElement('wc-button');
        btn.variant = "soft-transparent";
        btn.className = `wcrt-btn wcrt-btn-${buttonId} ${buttonId}`;
        btn.dataset.command = buttonId;
        if (WCRichText.TABLE_CTX_BUTTONS.includes(buttonId)) {
            btn.classList.add('wcrt-table-ctx');
            btn.style.display = 'none'; // Oculto por defecto
        }
        const btnTitle = this._getButtonTitle(buttonId);
        btn.title = btnTitle;
        // Accesibilidad: botones de solo icono → nombre accesible (se reenvia al <button> interno)
        btn.setAttribute('aria-label', btnTitle);

        // Todos los iconos se cargan vía CSS con mask-image

        // Prevenir que el botón robe el foco del editor
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isViewOnly = buttonId === 'print' || buttonId === 'preview';
            if (!this.disabled && (isViewOnly || !this.readonly) && this._editor) {
                // Manejar botones especiales
                if (buttonId === 'image') {
                    this._insertImage();
                } else if (buttonId === 'sourceCode') {
                    this._toggleSourceMode();
                } else if (buttonId === 'print') {
                    this._printContent();
                } else if (buttonId === 'preview') {
                    this._previewContent();
                } else if (buttonId === 'link') {
                    this._insertLink();
                } else if (command) {
                    command(this._editor);
                }
            }
        });

        return btn;
    }

    _createCustomButton(config) {
        const btn = document.createElement('wc-button');
        btn.variant = "soft-transparent";
        btn.className = 'wcrt-btn wcrt-btn-custom';
        btn.dataset.customCommand = config.name;
        btn.title = config.title || config.name;
        btn.setAttribute('aria-label', config.title || config.name);
        btn.icon = config.icon || '?';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!this.disabled && !this.readonly && this._editor && config.action) {
                config.action(this._editor, this);
            }
        });

        return btn;
    }

    _rebuildToolbar() {
        this._buildToolbar();
        this._updateToolbarState(this._editor);
    }

    /**
     * Agrupa por frame las actualizaciones de la toolbar: una transaccion puede
     * disparar varias seguidas y el estado visual solo se ve una vez por frame.
     */
    _programarActualizacionToolbar(editor) {
        if (this._toolbarFrame) return;
        this._toolbarFrame = requestAnimationFrame(() => {
            this._toolbarFrame = null;
            this._updateToolbarState(editor);
        });
    }

    _updateToolbarState(editor) {
        if (!editor || !this._els.toolbar) return;

        // Mostrar/ocultar botones de contexto de tabla
        const inTable = editor.isActive('table');
        this._els.toolbar.querySelectorAll('.wcrt-table-ctx').forEach(el => {
            el.style.display = inTable ? '' : 'none';
        });

        // Actualizar estado de botones
        this._els.toolbar.querySelectorAll('.wcrt-btn[data-command]').forEach(btn => {
            const command = btn.dataset.command;
            const checkActive = WCRichText.ACTIVE_MAP[command];

            if (checkActive && checkActive(editor)) {
                btn.classList.add('is-active');
                // Accesibilidad: estado pulsado del boton de formato (toggle)
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.classList.remove('is-active');
                if (checkActive) btn.setAttribute('aria-pressed', 'false');
            }
        });

        // Actualizar selector de fuente
        if (this._els.fontSelect) {
            this._els.fontSelect.value = editor.getAttributes('textStyle').fontFamily || 'Arial, sans-serif';
        }

        // Actualizar selector de tamaño de fuente
        if (this._els.fontSizeSelect) {
            this._els.fontSizeSelect.value = editor.getAttributes('textStyle').fontSize || '12px';
        }

        // Actualizar selector de estilo de encabezado
        if (this._els.headingStyleSelect) {
            let headingValue = 'normal';
            for (let level = 1; level <= 6; level++) {
                if (editor.isActive('heading', { level })) {
                    headingValue = `h${level}`;
                    break;
                }
            }
            this._els.headingStyleSelect.value = headingValue;
        }

        // Actualizar barras de color con el color en la posicion del cursor
        if (this._els.textColorBar) {
            const color = editor.getAttributes('textStyle').color;
            this._els.textColorBar.style.background = color || '#000000';
            if (color && this._els.textColorPicker) this._els.textColorPicker.value = color;
        }
        if (this._els.bgColorBar) {
            const color = editor.getAttributes('highlight').color;
            this._els.bgColorBar.style.background = color || '#ffffff';
            if (color && this._els.bgColorPicker) this._els.bgColorPicker.value = color;
        }
    }

    _getButtonTitle(buttonId) {
        // Usar traducciones del sistema (tokens existentes en Language.resx)
        const T = window.Traduccion || {};
        const titles = {
            bold: T.NEGRITA || 'Negrita',
            italic: T.CURSIVA || 'Cursiva',
            underline: T.SUBRAYADO || 'Subrayado',
            strike: T.TACHADO || 'Tachado',
            code: T.CODIGO || 'Código',
            codeBlock: T.BLOQUE_CODIGO || 'Bloque de código',
            h1: (T.TITULO || 'Título') + ' 1',
            h2: (T.TITULO || 'Título') + ' 2',
            h3: (T.TITULO || 'Título') + ' 3',
            h4: (T.TITULO || 'Título') + ' 4',
            h5: (T.TITULO || 'Título') + ' 5',
            h6: (T.TITULO || 'Título') + ' 6',
            bulletList: T.LISTA_VINETAS || 'Lista con viñetas',
            orderedList: T.LISTA_NUMERADA || 'Lista numerada',
            blockquote: T.CITA || 'Cita',
            link: T.ENLACE || 'Enlace',
            image: T.IMAGEN || 'Imagen',
            alignLeft: T.ALINEAR_A_LA_IZQUIERDA || 'Alinear a la izquierda',
            alignCenter: T.CENTRAR || 'Centrar',
            alignRight: T.ALINEAR_A_LA_DERECHA || 'Alinear a la derecha',
            alignJustify: T.JUSTIFICAR || 'Justificar',
            textColor: T.COLOR_DE_FUENTE || 'Color de fuente',
            bgColor: T.COLOR_DE_FONDO || 'Color de fondo',
            horizontalRule: T.LINEA_HORIZONTAL || 'Línea horizontal',
            clearFormat: T.LIMPIAR_FORMATO || 'Limpiar formato',
            undo: T.DESHACER || 'Deshacer',
            redo: T.REHACER || 'Rehacer',
            sourceCode: T.VER_CODIGO_HTML || 'Ver código HTML',
            print: T.IMPRIMIR || 'Imprimir',
            preview: T.VISTA_PREVIA || 'Vista previa',
            // Tabla
            tableInsert: T.INSERTAR_TABLA || 'Insertar tabla',
            tableBorderToggle: T.ALTERNAR_BORDES || 'Mostrar/ocultar bordes',
            tableAddRowBefore: T.INSERTAR_FILA_ARRIBA || 'Insertar fila arriba',
            tableAddRowAfter: T.INSERTAR_FILA_ABAJO || 'Insertar fila abajo',
            tableDeleteRow: T.ELIMINAR_FILA || 'Eliminar fila',
            tableAddColBefore: T.INSERTAR_COLUMNA_IZQUIERDA || 'Insertar columna a la izquierda',
            tableAddColAfter: T.INSERTAR_COLUMNA_DERECHA || 'Insertar columna a la derecha',
            tableDeleteCol: T.ELIMINAR_COLUMNA || 'Eliminar columna',
            tableMergeCells: T.FUSIONAR_CELDAS || 'Fusionar celdas',
            tableSplitCell: T.DIVIDIR_CELDA || 'Dividir celda',
            tableDelete: T.ELIMINAR_TABLA || 'Eliminar tabla'
        };
        return titles[buttonId] || buttonId;
    }

    // =========================================================================
    // LÓGICA INTERNA - Sincronización y Eventos
    // =========================================================================

    _onEditorUpdate() {
        // El evento se emite al momento: quien lo escucha lee `this.value`, que
        // va directo al editor y siempre esta al dia.
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        this._programarSincronizacion();
    }

    /**
     * Agrupa la sincronizacion pesada en vez de hacerla en cada pulsacion.
     * Antes, por cada tecla se serializaba el documento entero varias veces
     * (getHTML en _onEditorUpdate, en _syncFormValue, en _updateValidity y en
     * _excedeTamanioMaximo), mas 2 getText y un Blob del HTML completo. Con una
     * plantilla de email de tamaño normal eso son decenas de ms por tecla.
     */
    _programarSincronizacion() {
        clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => this._sincronizarAhora(), WCRichText.SYNC_DEBOUNCE_MS);
    }

    /**
     * Serializa UNA sola vez y reparte ese HTML a todo lo que lo necesita.
     * @returns {string} el HTML actual ('' si el editor esta vacio o no existe)
     */
    _sincronizarAhora() {
        clearTimeout(this._syncTimer);
        this._syncTimer = null;
        if (!this._editor) return this._value || '';

        const html = this._editor.isEmpty ? '' : this._editor.getHTML();

        this._value = html;

        this._syncFormValue(html);
        this._updateCount();
        return html;
    }

    _renderCountBar() {
        // Eliminar barra anterior si existe
        const existing = this._els.wrapper?.querySelector('.wcrt-count-bar');
        if (existing) existing.remove();

        const mode = this.showCount;
        if (!mode || mode === 'false') return;

        const bar = document.createElement('div');
        bar.className = 'wcrt-count-bar';

        if (mode === 'chars' || mode === 'both') {
            const span = document.createElement('span');
            span.className = 'wcrt-count-chars';
            bar.appendChild(span);
        }
        if (mode === 'words' || mode === 'both') {
            const span = document.createElement('span');
            span.className = 'wcrt-count-words';
            bar.appendChild(span);
        }

        this._els.wrapper.appendChild(bar);
        this._els.countBar = bar;
        this._updateCount();
    }

    _updateCount() {
        if (!this._els.countBar || !this._editor) return;
        const T = window.Traduccion || {};
        const text = this._editor.getText();
        const chars = text.length;
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

        const charsEl = this._els.countBar.querySelector('.wcrt-count-chars');
        const wordsEl = this._els.countBar.querySelector('.wcrt-count-words');

        if (charsEl) charsEl.textContent = `${T.CARACTERES || 'Caracteres'}: ${chars}`;
        if (wordsEl) wordsEl.textContent = `${T.PALABRAS || 'Palabras'}: ${words}`;
    }

    _onEditorBlur() {
        // Vaciar aqui la sincronizacion pendiente es lo que hace seguro el
        // debounce: un envio de formulario siempre pasa por un clic, que
        // provoca blur antes, asi que setFormValue llega actualizado.
        const currentValue = this._sincronizarAhora();

        // Solo disparar change si el valor cambió desde el último blur/focus
        if (currentValue !== this._lastValue) {
            this._lastValue = currentValue;
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }
    }

    /**
     * @param {string} [html] HTML ya serializado, para no volver a calcularlo.
     *        Se propaga desde _sincronizarAhora (ver alli el motivo).
     */
    _syncFormValue(html) {
        const valor = html !== undefined ? html : this._htmlActual();
        this._internals.setFormValue(valor);
        this._updateValidity(valor);
    }

    /** HTML actual del componente, sin serializar de mas si no hace falta. */
    _htmlActual() {
        return this._editor
            ? (this._editor.isEmpty ? '' : this._editor.getHTML())
            : (this._value || '');
    }

    /** @param {string} [html] ver _syncFormValue */
    _updateValidity(html) {
        const valor = html !== undefined ? html : this._htmlActual();
        let hasContent = false;
        if (this._editor) {
            hasContent = this._editor.getText().trim() !== '' ||
                         /<(img|video|iframe|figure|table)[\s>]/i.test(valor);
        } else {
            hasContent = !!valor.trim();
        }

        if (this.required && !hasContent) {
            this._internals.setValidity(
                { valueMissing: true },
                Traduccion.VALOR_OBLIGATORIO,
                this._els.editor || this
            );
        } else if (this.maxSize && hasContent && this._excedeTamanioMaximo(valor)) {
            const msg = Traduccion.CONTENIDO_SUPERA_TAMANIO_MAXIMO.replace('{0}', this.maxSize);
            this._internals.setValidity(
                { tooLong: true },
                msg,
                this._els.editor || this
            );
        } else {
            this._internals.setValidity({});
        }
    }

    /**
     * Comprueba si el HTML actual supera this.maxSize (MB) en bytes reales (UTF-8),
     * no en caracteres JS (que no cuentan el peso real de tildes/ñ ni el de las
     * imágenes base64 embebidas, que son el caso que motiva este límite).
     * @returns {boolean}
     */
    _excedeTamanioMaximo(html) {
        const valor = html !== undefined ? html : this._htmlActual();
        const maxBytes = this.maxSize * 1024 * 1024;
        return new Blob([valor]).size > maxBytes;
    }

    // =========================================================================
    // LÓGICA INTERNA - Estados
    // =========================================================================

    _handleAttributeChange(name, newVal) {
        switch (name) {
            case 'disabled':
            case 'readonly':
                this._applyStates();
                break;
            case 'placeholder':
                if (this._els.editor) {
                    this._els.editor.dataset.placeholder = newVal || '';
                }
                break;
            case 'min-height':
                if (this._els.editorContainer) {
                    this._els.editorContainer.style.minHeight = newVal || '150px';
                }
                this.style.setProperty('--wcrt-editor-min-height', newVal || '150px');
                break;
            case 'height':
                if (this._els.editorContainer) {
                    this._els.editorContainer.style.height = newVal || '';
                    this._els.editorContainer.style.overflowY = (newVal || this.maxHeight) ? 'auto' : '';
                }
                break;
            case 'max-height':
                if (this._els.editorContainer) {
                    this._els.editorContainer.style.maxHeight = newVal || '';
                    this._els.editorContainer.style.overflowY = (newVal || this.height) ? 'auto' : '';
                }
                break;
            case 'show-toolbar':
                if (this._els.toolbar) {
                    this._els.toolbar.style.display = newVal === 'false' ? 'none' : '';
                }
                break;
            case 'toolbar-position':
                if (this._els.wrapper) {
                    if (newVal === 'bottom') {
                        this._els.wrapper.classList.add('toolbar-bottom');
                    } else {
                        this._els.wrapper.classList.remove('toolbar-bottom');
                    }
                }
                break;
            case 'show-count':
                this._renderCountBar();
                break;
        }
    }

    // =========================================================================
    // MÉTODO: Insertar imagen
    // =========================================================================
    _insertImageFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            this._editor.chain().focus().setImage({ src: e.target.result }).run();
        };
        reader.readAsDataURL(file);
    }

    _insertImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';

        input.addEventListener('change', (e) => {
            this._insertImageFile(e.target.files[0]);
        });

        document.body.appendChild(input);
        input.click();
        input.remove();
    }

    // =========================================================================
    // MÉTODO: Insertar/editar enlace
    // =========================================================================
    _insertLink() {
        const T = window.Traduccion || {};

        // Verificar si hay texto seleccionado
        const { from, to, node } = this._editor.state.selection;
        const isImageSelected = node?.type?.name === 'image';
        let selectedText = this._editor.state.doc.textBetween(from, to, '');

        // Cursor dentro de un enlace de texto ya existente, sin selección propia
        // (p.ej. click simple sobre el enlace, sin arrastrar): extender la
        // selección a todo el enlace, igual que hace cualquier editor al
        // "re-clicar" un link. Sin esto se trataba como "sin selección" → se
        // insertaba un enlace NUEVO al lado del existente en vez de editarlo, y
        // el campo "Texto a mostrar" salía vacío en vez de con el texto actual.
        if (!isImageSelected && !selectedText && this._editor.isActive('link')) {
            this._editor.chain().extendMarkRange('link').run();
            const sel = this._editor.state.selection;
            selectedText = this._editor.state.doc.textBetween(sel.from, sel.to, '');
        }

        // Selección de nodo (no de texto) sobre una imagen: se enlaza la imagen
        // completa, igual que el texto seleccionado — sin pedir "texto a mostrar"
        // (no aplica, es una imagen). Las imagenes no usan la marca 'link' (ver
        // comentario en ResizableImage): el enlace es su propio atributo 'href'.
        const hasSelection = !!(selectedText || isImageSelected);

        // Obtener enlace actual si existe
        const previousUrl = isImageSelected
            ? (node.attrs.href || '')
            : (this._editor.getAttributes('link').href || '');

        // Textos traducidos
        const txtInsertar = T.INSERTAR_ENLACE || ((T.INSERTAR || 'Insertar') + ' ' + (T.ENLACE || 'enlace').toLowerCase());
        const txtEditar = T.EDITAR_ENLACE || ((T.EDITAR || 'Editar') + ' ' + (T.ENLACE || 'enlace').toLowerCase());
        const txtUrl = T.URL || 'URL';
        const txtTextoMostrar = T.TEXTO_A_MOSTRAR || 'Texto a mostrar';
        const txtPlaceholder = T.TEXTO_DEL_ENLACE || 'Texto del enlace';
        const txtQuitar = T.QUITAR_ENLACE || ((T.QUITAR || 'Quitar') + ' ' + (T.ENLACE || 'enlace').toLowerCase());
        const txtCancelar = T.CANCELAR || 'Cancelar';
        const txtAceptar = T.ACEPTAR || 'Aceptar';
        
        // Crear contenido de la modal
        const content = document.createElement('div');
        content.innerHTML = `
            <div class="wcrt-link-field" style="margin-bottom: 12px;">
                <label style="display: block; margin-bottom: 4px; font-weight: 500; font-size: 14px;">${txtUrl}*</label>
            </div>
            ${!hasSelection ? `
            <div class="wcrt-link-field">
                <label style="display: block; margin-bottom: 4px; font-weight: 500; font-size: 14px;">${txtTextoMostrar}</label>
            </div>
            ` : ''}
        `;
        
        // Crear inputs usando wc-input
        const urlInput = document.createElement('wc-input');
        urlInput.type = 'url';
        urlInput.placeholder = 'https://ejemplo.com';
        urlInput.value = previousUrl;
        // Accesibilidad: nombre accesible asociado a la etiqueta visible (se reenvia al input interno)
        urlInput.setAttribute('aria-label', txtUrl);
        urlInput.setAttribute('required', '');
        content.querySelector('.wcrt-link-field').appendChild(urlInput);

        let textInput = null;
        if (!hasSelection) {
            textInput = document.createElement('wc-input');
            textInput.type = 'text';
            textInput.placeholder = txtPlaceholder;
            textInput.setAttribute('aria-label', txtTextoMostrar);
            content.querySelectorAll('.wcrt-link-field')[1].appendChild(textInput);
        }
        
        // Configurar botones
        const buttons = [];
        
        if (previousUrl) {
            buttons.push({
                label: txtQuitar,
                variant: 'danger',
                position: 'left',
                action: 'remove'
            });
        }
        
        buttons.push(
            { label: txtCancelar, variant: 'default', action: 'cancel' },
            { label: txtAceptar, variant: 'primary', action: 'ok' }
        );
        
        // Crear y mostrar modal
        const modal = DynamicModal.create({
            title: previousUrl ? txtEditar : txtInsertar,
            size: 'auto',
            content: content,
            buttons: buttons,
            autoOpen: true
        });
        
        // Manejar acciones
        modal.addEventListener('modal-close', (e) => {
            const action = e.detail.action;
            
            if (action === 'ok') {
                let url = urlInput.value.trim();

                // Auto-prefixar https:// si empieza por www. y no lleva protocolo
                if (/^www\./i.test(url) && !/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//i.test(url)) {
                    url = `https://${url}`;
                }

                // Seguridad: rechazar esquemas que ejecutan codigo (javascript:, data:, vbscript:)
                if (!url || /^\s*(javascript|data|vbscript)\s*:/i.test(url)) {
                    urlInput.classList.add('has-error');
                    modal.open(); // Reabrir si hay error
                    return;
                }

                // Imagen: su propio atributo 'href' (no la marca 'link', ver
                // comentario en ResizableImage). Texto seleccionado: marca 'link'.
                // Sin selección: insertar texto nuevo con enlace.
                if (isImageSelected) {
                    this._editor.chain().focus().updateAttributes('image', { href: url }).run();
                } else if (selectedText) {
                    this._editor.chain().focus().setLink({ href: url }).run();
                } else {
                    // Si no hay selección, insertar texto con enlace (url y texto escapados: son entrada del usuario).
                    // Un enlace de ancla interna (#id) no lleva target/rel: debe
                    // saltar dentro del documento, no abrir otra pestaña.
                    const esc = WCBaseElement.escapeHtml;
                    const linkText = textInput?.value.trim() || url;
                    const extras = url.startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer"';
                    this._editor.chain().focus()
                        .insertContent(`<a href="${esc(url)}"${extras}>${esc(linkText)}</a>`)
                        .run();
                }
            } else if (action === 'remove') {
                if (isImageSelected) {
                    this._editor.chain().focus().updateAttributes('image', { href: null }).run();
                } else {
                    this._editor.chain().focus().unsetLink().run();
                }
            }
            
            // Restaurar foco al editor
            if (action !== 'ok' || urlInput.value.trim()) {
                this._editor.commands.focus();
                modal.destroy();
            }
        });
        
        // Focus en el input de URL
        requestAnimationFrame(() => urlInput.focus());
    }

    // =========================================================================
    // MÉTODO: Toggle modo código fuente HTML
    // =========================================================================
    _toggleSourceMode() {
        this._isSourceMode = !this._isSourceMode;

        // Actualizar estado visual del botón
        const sourceBtn = this._els.toolbar?.querySelector('[data-command="sourceCode"]');
        if (sourceBtn) {
            sourceBtn.classList.toggle('active', this._isSourceMode);
        }

        if (this._isSourceMode) {
            // Modo código fuente: mostrar textarea con HTML
            const htmlContent = this._editor.getHTML();
            this._els.sourceTextarea.value = htmlContent;
            this._els.editorContainer.style.display = 'none';
            this._els.sourceContainer.style.display = 'block';
            this._els.sourceTextarea.focus();
        } else {
            // Modo visual: aplicar cambios del textarea al editor
            const newHtml = this._els.sourceTextarea.value;
            this._editor.commands.setContent(newHtml, false);
            this._els.sourceContainer.style.display = 'none';
            this._els.editorContainer.style.display = 'block';
            this._editor.commands.focus();
            
            // Sincronizar valor
            this._onEditorUpdate(this._editor);
        }
    }

    // =========================================================================
    // MÉTODO: Obtener HTML actual (editor o modo código fuente)
    // =========================================================================
    _getCurrentHtml() {
        if (this._isSourceMode && this._els.sourceTextarea) {
            return this._els.sourceTextarea.value;
        }
        return this._editor ? this._editor.getHTML() : '';
    }

    // =========================================================================
    // MÉTODO: Imprimir contenido
    // =========================================================================
    _printContent() {
        const html = this._getCurrentHtml();
        const win = window.open('', '_blank', 'width=800,height=600');
        if (!win) return;

        win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Imprimir</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12pt; margin: 2cm; color: #000; }
    p { margin: 0.5em 0; }
    h1, h2, h3, h4, h5, h6 { margin: 1em 0 0.5em; font-weight: 600; line-height: 1.3; }
    h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.25em; }
    h4 { font-size: 1.1em; } h5 { font-size: 1em; } h6 { font-size: 0.9em; color: #666; }
    ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
    li { margin: 0.25em 0; }
    blockquote { margin: 1em 0; padding: 0.5em 1em; border-left: 3px solid #ccc; color: #666; font-style: italic; }
    code { background: #f3f4f6; padding: 0.125em 0.375em; border-radius: 0.25em; font-family: monospace; font-size: 0.9em; }
    pre { background: #f3f4f6; padding: 0.75em 1em; border-radius: 4px; font-family: monospace; font-size: 0.875em; overflow-x: auto; margin: 1em 0; }
    pre code { background: transparent; padding: 0; }
    hr { border: none; border-top: 1px solid #ccc; margin: 1.5em 0; }
    img { max-width: 100%; height: auto; }
    a { color: #2563eb; }
    @media print { body { margin: 1cm; } }
  </style>
</head>
<body>${html}</body>
</html>`);
        win.document.close();
        win.focus();
        win.print();
        win.close();
    }

    // =========================================================================
    // MÉTODO: Vista previa del contenido
    // =========================================================================
    _previewContent() {
        const html = this._getCurrentHtml();

        // Shadow root propio, y a proposito SIN ningun CSS del editor: la vista
        // previa debe enseñar lo que veria un cliente de correo, es decir el
        // HTML con su propio <style> y nada mas. Cargar aqui rich-text.css o
        // internal-layout.css (lo que hacia antes via <shadow-container>)
        // distorsionaba la preview: bordes en todas las celdas, box-sizing
        // border-box, margenes de parrafo, anchos forzados... El shadow sigue
        // haciendo falta para que el <style> de la plantilla no se fugue a la
        // pagina real.
        const capsula = document.createElement('div');
        const capsulaRoot = capsula.attachShadow({ mode: 'open' });

        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = html;
        // Mismo motivo que StyleBlock.addNodeView: :root no matchea dentro de
        // este shadow root (capsulaRoot), asi que las variables de color de la
        // plantilla se perderian tambien aqui si no se reescriben a :host.
        contentDiv.querySelectorAll('style').forEach(styleEl => {
            styleEl.textContent = WCRichText._cssRootComoHost(styleEl.textContent);
        });
        capsulaRoot.appendChild(contentDiv);

        // Navegacion interna (href="#ancla") dentro de la preview: hay que
        // hacerla a mano. El salto por fragmento del navegador busca el id en el
        // DOCUMENTO, y no entra en el Shadow DOM, asi que nunca encontraria el
        // ancla; y aunque la encontrara moveria el scroll de la pagina (no el
        // del modal) y ademas dejaria el "#..." pegado en la URL.
        capsulaRoot.addEventListener('click', (e) => {
            const enlace = e.target.closest?.('a[href^="#"]');
            if (!enlace || !capsulaRoot.contains(enlace)) return;

            e.preventDefault();
            const id = decodeURIComponent((enlace.getAttribute('href') || '').slice(1));
            if (!id) {
                contentDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            // Las anclas antiguas usan name en vez de id (o los dos)
            const escapado = window.CSS?.escape ? window.CSS.escape(id) : id.replace(/"/g, '\\"');
            const destino = capsulaRoot.getElementById?.(id)
                || capsulaRoot.querySelector(`[id="${escapado}"], [name="${escapado}"]`);
            destino?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        const modal = DynamicModal.create({
            title: 'Vista previa',
            size: 'auto',
            showClose: true,
            closeOnBackdrop: true,
            closeOnEscape: true,
            content: capsula,
            buttons: [
                { label: 'Cerrar', variant: 'default', action: 'close' }
            ]
        });

        modal.addEventListener('modal-close', () => modal.remove(), { once: true });
    }

    _applyStates() {
        if (!this._els.wrapper) return;

        // Estado disabled
        if (this.disabled) {
            this._els.wrapper.classList.add('is-disabled');
            this._els.editorShadow?.classList.add('is-disabled');
            if (this._editor) this._editor.setEditable(false);
        } else {
            this._els.wrapper.classList.remove('is-disabled');
            this._els.editorShadow?.classList.remove('is-disabled');
        }

        // Estado readonly
        if (this.readonly) {
            this._els.wrapper.classList.add('is-readonly');
            this._els.editorShadow?.classList.add('is-readonly');
            if (this._editor) this._editor.setEditable(false);
        } else if (!this.disabled) {
            this._els.wrapper.classList.remove('is-readonly');
            this._els.editorShadow?.classList.remove('is-readonly');
            if (this._editor) this._editor.setEditable(true);
        }

        // Actualizar botones de toolbar
        const toolbarBtns = this._els.toolbar?.querySelectorAll('.wcrt-btn wc-button');
        toolbarBtns?.forEach(btn => {
            const isViewOnly = btn.dataset.command === 'print' || btn.dataset.command === 'preview';
            btn.disabled = this.disabled || (!isViewOnly && this.readonly);
        });

        // Actualizar selector de fuente
        if (this._els.fontSelect) {
            this._els.fontSelect.disabled = this.disabled || this.readonly;
        }

        // Actualizar selector de tamaño de fuente
        if (this._els.fontSizeSelect) {
            this._els.fontSizeSelect.disabled = this.disabled || this.readonly;
        }

        // Actualizar color pickers
        if (this._els.textColorPicker) {
            this._els.textColorPicker.disabled = this.disabled || this.readonly;
        }
        if (this._els.bgColorPicker) {
            this._els.bgColorPicker.disabled = this.disabled || this.readonly;
        }
    }
}

// Registrar el componente
if (!customElements.get('wc-rich-text')) customElements.define('wc-rich-text', WCRichText);
