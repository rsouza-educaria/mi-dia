/**
 * @fileoverview FileUpload.js
 * Componente para subir archivos con drag & drop, validaciones y lista de archivos adjuntos.
 * 
 * @fires files-changed - Cuando cambia la lista de archivos. detail: { files: File[] }
 * @fires file-error - Cuando hay un error de validación. detail: { error: string, file?: File }
 */

class FileUpload extends WidgetBase {

    // =========================================================================
    // PRESETS DE CONFIGURACIÓN (equivalente a TipoCarga del backend)
    // Basado en CmptMultiUpload.ascx.cs - enum TipoCarga
    // =========================================================================

    /**
     * Extensiones permitidas por defecto (equivalente a GetExtensionesPermitidas del backend).
     * Se usa cuando no se especifica ningún preset.
     * Solo filtra en el navegador: la validación que protege es la del servidor, con
     * ControladorSubidaFicheros.ExtensionesPermitidasPorDefecto. Deben coincidir.
     * @type {string}
     */
    static DEFAULT_ACCEPT = '.jpg,.jpeg,.bmp,.gif,.png,.txt,.doc,.pps,.xls,.docx,.xlsx,.ppt,.pptx,.mp3,.pdf,.odt,.odp,.zip,.xml,.csv,.tpc,.dbf,.mdb,.les,.zmod,.expmod';    

    /**
     * Presets de configuración predefinidos.
     * Cada preset define: accept (extensiones), acceptLabel (texto traducido, opcional).
     * El tamaño máximo (maxSize) debe configurarse desde el servidor.
     * @type {Object.<string, {accept: string, acceptLabel?: string}>}
     */
    static PRESETS = {
        excel:                  { accept: '.xls,.xlsx' },
        imagen:                 { accept: '.jpg,.jpeg,.bmp,.gif,.png', acceptLabel: Traduccion.GENERAL_IMAGENES },
        foto:                   { accept: '.jpg,.jpeg,.bmp,.gif,.png', acceptLabel: Traduccion.GENERAL_IMAGENES },
        fotoGrupo:              { accept: '.jpg,.jpeg,.bmp,.gif,.png', acceptLabel: Traduccion.GENERAL_IMAGENES },
        fotoGrupoExtraescolar:  { accept: '.jpg,.jpeg,.bmp,.gif,.png', acceptLabel: Traduccion.GENERAL_IMAGENES },
        logo:                   { accept: '.jpg,.jpeg,.bmp,.gif,.png', acceptLabel: Traduccion.GENERAL_IMAGENES },
        logoInstitucion:        { accept: '.jpg,.jpeg,.bmp,.gif,.png', acceptLabel: Traduccion.GENERAL_IMAGENES },
        genericoTemp:           { accept: '.jpg,.jpeg,.bmp,.gif,.png', acceptLabel: Traduccion.GENERAL_IMAGENES },
        imagenBoletin:          { accept: '.jpg,.jpeg,.bmp,.gif,.png', acceptLabel: Traduccion.GENERAL_IMAGENES },
        xml:                    { accept: '.xml' },
        soportesBancarios:      { accept: '*', acceptLabel: Traduccion.GENERAL_TODOS },
        txt:                    { accept: '.txt' },
        dbf:                    { accept: '.dbf' },
        tpc:                    { accept: '.tpc,.TPC' },
        soloXls:                { accept: '.xls' },
        access:                 { accept: '.mdb' },
        zip:                    { accept: '.zip' },
        les:                    { accept: '.les,.LES' },
        csv:                    { accept: '.csv' },
        certificados:           { accept: '.pfx,.p12', acceptLabel: Traduccion.CERTIFICADOS },
        pdf:                    { accept: '.pdf' }
    };

constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });

    /** @private @type {File[]} Lista de archivos seleccionados */
    this._files = [];

    /** @private @type {boolean} Estado de arrastre */
    this._isDragging = false;

    // Cargar CSS de button para usar wc-button
    this._extraCss = ['button.css'];

    /** @private @type {Object.<string, {loaded:number,total:number}>} Progreso de subida por tempId */
    this._uploadProgress = {};

    /** @private @type {Object.<string, AbortController>} AbortControllers de subidas en curso */
    this._uploadAbortControllers = {};

    /** @private @type {Promise} Cadena de subidas chunked: procesa los ficheros de uno en uno.
     *  El servidor serializa las peticiones por bloqueo de sesion (InProc); lanzarlas en paralelo
     *  desde el cliente solo amontona peticiones "pending" sin ganar throughput real. */
    this._uploadChain = Promise.resolve();

    // Textos traducidos
    this.texts = {
        dropMultiple: Traduccion.ARRASTRA_ARCHIVOS_AQUI_O_HAZ_CLIC,
        dropSingle: Traduccion.ARRASTRA_ARCHIVO_AQUI_O_HAZ_CLIC,
        addMore: Traduccion.ANIADIR_MAS_ARCHIVOS,
        attachedFiles: Traduccion.ARCHIVOS_ADJUNTOS,
            attach: Traduccion.ADJUNTAR,
            deleteFile: Traduccion.ELIMINAR_ARCHIVO,
            maxFilesError: (n) => Traduccion.LIMITE_ARCHIVOS_ALCANZADO.replace('{0}', n),
            maxSizeError: (name, size) => Traduccion.ARCHIVO_EXCEDE_TAMANIO.replace('{0}', name).replace('{1}', size),
            typeError: (name) => Traduccion.TIPO_ARCHIVO_NO_PERMITIDO.replace('{0}', name),
            duplicateError: (name) => Traduccion.ARCHIVO_DUPLICADO.replace('{0}', name),
            maxPerFile: (size) => Traduccion.MAXIMO_POR_ARCHIVO.replace('{0}', size),
            typesAndMax: (types, size) => Traduccion.TIPOS_Y_MAXIMO_POR_ARCHIVO.replace('{0}', types).replace('{1}', size),
            maxFilesLabel: (n) => Traduccion.MAXIMO_ARCHIVOS.replace('{0}', n),
            downloadFile: Traduccion.DESCARGAR_ARCHIVO,
            previewFile: Traduccion.VISUALIZAR_ARCHIVO,
            uploadError: (name) => Traduccion.ERROR_AL_SUBIR_ARCHIVO.replace('{0}', name),
            pending: Traduccion.PENDIENTE
        };

        // Iconos SVG (usar comillas simples para evitar conflictos con atributos HTML)
        this.icons = {
            cloud: `<svg class='fu-cloud-icon' viewBox='-1 -1 30 25' fill='none' stroke='currentColor' stroke-width='1.5'>
                <path d='M19 16a5 5 0 1 0 0-10h-.5A8.5 8.5 0 1 0 4 14'/>
                <path d='M14 12v8M11 15l3-3 3 3'/>
            </svg>`,
            // Versión sin clase CSS para usar en wc-button (hereda color vía currentColor)
            cloudButton: `<svg viewBox='-1 -1 30 25' fill='none' stroke='currentColor' stroke-width='1.5'>
                <path d='M19 16a5 5 0 1 0 0-10h-.5A8.5 8.5 0 1 0 4 14'/>
                <path d='M14 12v8M11 15l3-3 3 3'/>
            </svg>`,
            add: `<svg class='fu-add-icon' viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.5'>
                <circle cx='8' cy='8' r='6.5'/>
                <path d='M8 5v6M5 8h6'/>
            </svg>`,
            upload: `<svg class='fu-upload-icon' viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.5'>
                <path d='M8 11V3M5 5l3-3 3 3'/>
                <path d='M2 12v2h12v-2'/>
            </svg>`,
            delete: '×',
            download: `<svg viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.5'>
                <path d='M8 2v9M5 8l3 3 3-3'/>
                <path d='M2 12v2h12v-2'/>
            </svg>`,
            preview: `<svg viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.5'>
                <circle cx='8' cy='8' r='2.5'/>
                <path d='M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z'/>
            </svg>`
        };
    }

    /**
     * Nombre del archivo CSS principal.
     */
    get componentCssName() {
        return 'file-upload.css';
    }

    /**
     * Atributos observados.
     */
    static get observedAttributes() {
        return [...super.observedAttributes, 'preset', 'max-files', 'max-size', 'accept', 'accept-label', 'multiple', 'disabled', 'readonly', 'show-download', 'show-preview', 'preview-accept', 'required', 'name', 'variant', 'button-size', 'show-files-header', 'upload-context'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (oldValue !== newValue) {
            this._render();
        }
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this.hasAttribute('upload-context'))
            this.setAttribute('upload-context', 'file-upload');
        this._render();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._removeEventListeners();
    }

    // =========================================================================
    // GETTERS / SETTERS
    // =========================================================================

    /**
     * Preset de configuración predefinido.
     * Cuando se establece, aplica automáticamente accept, acceptLabel y maxSize.
     * Los valores explícitos en atributos tienen prioridad sobre el preset.
     * @type {string}
     */
    get preset() {
        return this.getAttribute('preset') || '';
    }
    set preset(val) {
        val ? this.setAttribute('preset', val) : this.removeAttribute('preset');
    }

    /**
     * Obtiene la configuración del preset actual, si existe.
     * @returns {Object|null} Configuración del preset o null
     * @private
     */
    _getPresetConfig() {
        const presetName = this.preset;
        if (!presetName) return null;
        return FileUpload.PRESETS[presetName] || null;
    }

    /** Máximo de archivos permitidos */
    get maxFiles() {
        return parseInt(this.getAttribute('max-files')) || 10;
    }
    set maxFiles(val) {
        this.setAttribute('max-files', val);
    }

    /** 
     * Tamaño máximo por archivo en MB.
     * Debe configurarse desde el servidor mediante el atributo max-size.
     */
    get maxSize() {
        return parseInt(this.getAttribute('max-size')) || 2;
    }
    set maxSize(val) {
        this.setAttribute('max-size', val);
    }

    /** 
     * Tipos de archivo permitidos.
     * Prioridad: 1) atributo explícito, 2) preset con accept definido, 3) DEFAULT_ACCEPT.
     * Sin preset ni atributo, usa DEFAULT_ACCEPT (equivalente a GetExtensionesPermitidas del backend).
     */
    get accept() {
        // Atributo explícito tiene prioridad
        if (this.hasAttribute('accept')) {
            return this.getAttribute('accept');
        }
        // Fallback a preset (solo si tiene accept definido)
        const presetConfig = this._getPresetConfig();
        if (presetConfig?.accept) {
            return presetConfig.accept;
        }
        // Default: extensiones permitidas (igual que CmptMultiUpload.GetExtensionesPermitidas())
        return FileUpload.DEFAULT_ACCEPT;
    }
    set accept(val) {
        this.setAttribute('accept', val);
    }

    /** 
     * Etiqueta de tipos de archivo para mostrar (ej: "PDF, DOC, imágenes").
     * El atributo explícito accept-label tiene prioridad sobre el preset.
     */
    get acceptLabel() {
        if (this.hasAttribute('accept-label')) {
            return this.getAttribute('accept-label');
        }
        const presetConfig = this._getPresetConfig();
        return presetConfig?.acceptLabel || '';
    }
    set acceptLabel(val) {
        // '' es un valor con significado propio (ocultar la linea de tipos), no un "sin valor":
        // solo null/undefined borran el atributo y devuelven el componente a su default.
        if (val === null || val === undefined) {
            this.removeAttribute('accept-label');
        } else {
            this.setAttribute('accept-label', val);
        }
    }

    /** Permitir múltiples archivos */
    get multiple() {
        return this.hasAttribute('multiple') || !this.hasAttribute('max-files') || this.maxFiles > 1;
    }
    set multiple(val) {
        val ? this.setAttribute('multiple', '') : this.removeAttribute('multiple');
    }

    /** Estado deshabilitado */
    get disabled() {
        return this.hasAttribute('disabled');
    }
    set disabled(val) {
        val ? this.setAttribute('disabled', '') : this.removeAttribute('disabled');
    }

    /** Modo solo lectura (muestra archivos sin permitir modificar) */
    get readonly() {
        return this.hasAttribute('readonly');
    }
    set readonly(val) {
        val ? this.setAttribute('readonly', '') : this.removeAttribute('readonly');
    }

    /** Mostrar botón de descarga en modo readonly */
    get showDownload() {
        return this.hasAttribute('show-download');
    }
    set showDownload(val) {
        val ? this.setAttribute('show-download', '') : this.removeAttribute('show-download');
    }

    /** Mostrar botón de visualizar en modo readonly y, en edición, en los archivos precargados */
    get showPreview() {
        return this.hasAttribute('show-preview');
    }
    set showPreview(val) {
        val ? this.setAttribute('show-preview', '') : this.removeAttribute('show-preview');
    }

    /**
     * Extensiones que admiten el botón de visualizar (ej: '.pdf,.png'). Vacío = todas.
     * @type {string}
     */
    get previewAccept() {
        return this.getAttribute('preview-accept') || '';
    }
    set previewAccept(val) {
        val ? this.setAttribute('preview-accept', val) : this.removeAttribute('preview-accept');
    }

    /** Campo requerido */
    get required() {
        return this.hasAttribute('required');
    }
    set required(val) {
        val ? this.setAttribute('required', '') : this.removeAttribute('required');
    }

    /** Nombre del campo */
    get name() {
        return this.getAttribute('name') || '';
    }
    set name(val) {
        this.setAttribute('name', val);
    }

    /** Variante de visualización: 'dropzone' (default) | 'button' */
    get variant() {
        return this.getAttribute('variant') || 'dropzone';
    }
    set variant(val) {
        this.setAttribute('variant', val);
    }

    /** Tamaño del botón en variant='button': 'xs' | 'sm' | 'md' | 'lg' */
    get buttonSize() {
        return this.getAttribute('button-size') || 'md';
    }
    set buttonSize(val) {
        this.setAttribute('button-size', val);
    }

    /** Mostrar header "Archivos adjuntos" en el listado. Por defecto: true en dropzone, false en button */
    get showFilesHeader() {
        // Si no tiene el atributo, usar comportamiento por defecto según variant
        if (!this.hasAttribute('show-files-header')) {
            return this.variant !== 'button';
        }
        return this.getAttribute('show-files-header') !== 'false';
    }
    set showFilesHeader(val) {
        this.setAttribute('show-files-header', val ? 'true' : 'false');
    }

    /** URL del endpoint de subida. Si esta presente, activa el modo chunked upload. */
    get uploadUrl() {
        return this.getAttribute('upload-url') || '';
    }
    set uploadUrl(v) {
        if (v) this.setAttribute('upload-url', v);
        else this.removeAttribute('upload-url');
    }

    /** ID de contexto de esta instancia (semantico via atributo upload-context, o GUID como fallback). Incluirlo en el payload al enviar. */
    get uploadContextId() {
        return this.getAttribute('upload-context') || '';
    }
    set uploadContextId(v) {
        if (v) this.setAttribute('upload-context', v);
        else this.removeAttribute('upload-context');
    }

    /** True si hay subidas en curso o pendientes en cola. El formulario debe bloquearse mientras sea true. */
    get isUploading() {
        return this._files.some(f => f._isUploading);
    }

    /** Lista de archivos (solo lectura) */
    get files() {
        return [...this._files];
    }

    /** Alias de files para compatibilidad */
    get value() {
        return this.files;
    }

    // =========================================================================
    // MÉTODOS PÚBLICOS
    // =========================================================================

    /**
     * Elimina todos los archivos seleccionados.
     */
    clear() {
        this._files = [];
        this._updateUI();
        this._dispatchFilesChanged();
    }

    /**
     * Precarga archivos existentes (por ejemplo, desde el servidor).
     * Útil para mostrar archivos ya adjuntos en modo edición.
     * @param {Array<{id: string, name: string, size: number, type?: string, url?: string}>} preloadedFiles
     */
    setFiles(preloadedFiles) {
        if (!Array.isArray(preloadedFiles)) return;

        this._files = preloadedFiles.map(f => {
            // Crear un objeto que simule un File con metadata adicional
            const mockFile = new Blob([], { type: f.type || 'application/octet-stream' });
            // Añadir propiedades de File
            Object.defineProperties(mockFile, {
                name: { value: f.name, writable: false },
                size: { value: f.size || 0, writable: false },
                lastModified: { value: Date.now(), writable: false },
                // Propiedades adicionales para identificar archivos precargados
                _isPreloaded: { value: true, writable: false },
                _serverId: { value: f.id || null, writable: false },
                _serverUrl: { value: f.url || null, writable: false }
            });
            return mockFile;
        });

        this._updateUI();
        this._dispatchFilesChanged();
    }

    /**
     * Obtiene informacion de los archivos para enviar al backend.
     * Distingue tres grupos:
     *  - newFiles: File nuevos en memoria (modo clasico, sin upload-url)
     *  - existingIds: ids de precargados permanentes que se conservan
     *  - uploadedTokens: tokens de ficheros subidos a Temp en esta sesion (modo chunked)
     * @returns {{newFiles: File[], existingIds: string[], uploadedTokens: string[]}}
     */
    getFilesForUpload() {
        const newFiles = [];
        const existingIds = [];
        const uploadedTokens = [];

        this._files.forEach(file => {
            if (file._isUploading) return; // en curso: el llamante debe comprobar isUploading primero
            if (file._isUploaded && file._serverId) {
                uploadedTokens.push(file._serverId);
            } else if (file._isPreloaded && file._serverId) {
                existingIds.push(file._serverId);
            } else {
                newFiles.push(file);
            }
        });

        return { newFiles, existingIds, uploadedTokens };
    }

    /**
     * Verifica si el campo cumple las validaciones.
     * @returns {boolean}
     */
    checkValidity() {
        if (this.required && this._files.length === 0) {
            return false;
        }
        return true;
    }

    /**
     * Verifica y muestra errores de validación.
     * @returns {boolean}
     */
    reportValidity() {
        const isValid = this.checkValidity();
        const card = this.shadow.querySelector('.fu-card');
        if (!isValid) {
            card?.classList.add('has-error');
        } else {
            card?.classList.remove('has-error');
        }
        return isValid;
    }

    // =========================================================================
    // RENDERIZADO
    // =========================================================================

    _render() {
        const dropText = this.multiple ? this.texts.dropMultiple : this.texts.dropSingle;
        const isButtonVariant = this.variant === 'button';

        const subtitleText = this._buildSubtitleText();

        const container = document.createElement('div');
        let containerClass = 'fu-card';
        if (this.disabled) containerClass += ' is-disabled';
        if (this.readonly) containerClass += ' is-readonly';
        if (isButtonVariant) containerClass += ' fu-button-variant';
        container.className = containerClass;
        
        let mainContentHtml = '';
        
        if (this.readonly) {
            // Modo readonly: no mostramos zona de upload
            mainContentHtml = '';
        } else if (isButtonVariant) {
            // Modo button: solo el botón "Adjuntar"
            mainContentHtml = `
                <div class="fu-button-row" id="dropzone">
                    <wc-button 
                        id="attach-button"
                        variant="outline-primary" 
                        size="${this.buttonSize}"
                        icon="${this.icons.cloudButton}"
                        label="${this.texts.attach}"
                        ${this.disabled ? 'disabled' : ''}>
                    </wc-button>
                </div>
            `;
        } else {
            // Modo dropzone: comportamiento actual
            mainContentHtml = `
                <div class="fu-dropzone" id="dropzone">
                    ${this.icons.cloud}
                    ${this.icons.add}
                    <span class="fu-title" id="drop-title">${dropText}</span>
                    <span class="fu-subtitle" id="drop-subtitle">${subtitleText}</span>
                </div>
            `;
        }
        
        // Sección de archivos: mostrar header según showFilesHeader
        const filesSectionHtml = this.showFilesHeader ? `
            <div class="fu-files-section" id="files-section">
                <div class="fu-files-header">
                    <span class="fu-files-title">${this.texts.attachedFiles}</span>
                    <span class="fu-files-count" id="files-count">0</span>
                </div>
                <div class="fu-file-list" id="file-list"></div>
            </div>
        ` : `
            <div class="fu-files-section fu-no-header" id="files-section">
                <div class="fu-file-list" id="file-list"></div>
            </div>
        `;
        
        container.innerHTML = `
            ${mainContentHtml}

            <!-- Sección de archivos -->
            ${filesSectionHtml}

            <!-- Input oculto -->
            <input type="file" 
                   class="fu-input-hidden" 
                   id="file-input"
                   ${this.multiple ? 'multiple' : ''}
                   ${this.accept !== '*' ? `accept="${this.accept}"` : ''}
                   ${this.disabled || this.readonly ? 'disabled' : ''}>

            <!-- Mensaje de error -->
            <div class="fu-error-message" id="error-message"></div>
        `;

        // Reemplazar SOLO el contenedor, preservando los <link> de CSS en su sitio.
        // Quitar y volver a insertar los <link> (innerHTML = '') los devuelve a
        // estado "loading" y provoca un parpadeo sin estilos (FOUC) al re-renderizar
        // un componente que ya estaba visible (ej: anadir show-download a posteriori).
        const oldContainer = this.shadow.querySelector('.fu-card');
        if (oldContainer) {
            this.shadow.replaceChild(container, oldContainer);
        } else {
            this.shadow.appendChild(container);
        }

        this._updateUI();
        this._setupEventListeners();
    }

    _updateUI() {
        const dropzone = this.shadow.querySelector('#dropzone');
        const filesSection = this.shadow.querySelector('#files-section');
        const fileList = this.shadow.querySelector('#file-list');
        const filesCount = this.shadow.querySelector('#files-count');
        const dropTitle = this.shadow.querySelector('#drop-title');
        const dropSubtitle = this.shadow.querySelector('#drop-subtitle');

        if (!filesSection || !fileList) return;

        const hasFiles = this._files.length > 0;
        const isButtonVariant = this.variant === 'button';

        // Actualizar contador
        if (filesCount) filesCount.textContent = this._files.length;

        // Mostrar/ocultar sección de archivos
        // En modo readonly siempre visible si hay archivos
        filesSection.classList.toggle('visible', hasFiles);

        // Modo compacto del dropzone (solo en variant dropzone, no en button)
        if (dropzone && !isButtonVariant) {
            dropzone.classList.toggle('compact', hasFiles);

            // Actualizar textos
            if (hasFiles) {
                if (dropTitle) dropTitle.textContent = this.texts.addMore;
            } else {
                if (dropTitle) dropTitle.textContent = this.multiple ? this.texts.dropMultiple : this.texts.dropSingle;
                // Regenerar subtítulo con tipos de archivo si están definidos
                if (dropSubtitle) dropSubtitle.textContent = this._buildSubtitleText();
            }
        }

        // Renderizar lista de archivos
        fileList.innerHTML = '';
        this._files.forEach((file, index) => {
            const item = this._createFileItem(file, index);
            fileList.appendChild(item);
        });
    }

    _createFileItem(file, index) {
        const item = document.createElement('div');
        item.className = 'fu-file-item';
        item.dataset.index = index;

        // Fichero en proceso de subida al servidor
        if (file._isUploading) {
            item.classList.add('is-uploading');
            const progress = this._uploadProgress[file._tempId] || { loaded: 0, total: 1 };
            const pct = file._isPending ? 0 : Math.round((progress.loaded / progress.total) * 100);
            const pctLabel = file._isPending ? this.texts.pending : (pct + '%');
            const ext = this._getExtension(file.name);
            const esc = WidgetBase.escapeHtml;
            item.innerHTML = `
                <span class="fu-file-ext ${this._getExtClass(ext)}">${esc(ext.toUpperCase().slice(0, 4))}</span>
                <span class="fu-file-name" title="${esc(file.name)}">${esc(file.name)}</span>
                <span class="fu-file-size fu-uploading-pct">${esc(pctLabel)}</span>
                <span class="fu-file-actions">
                    <wc-button variant="ghost" size="xs" icon="${this.icons.delete}"
                        title="${this.texts.deleteFile}" data-index="${index}"
                        class="fu-file-delete"></wc-button>
                </span>
                <div class="fu-upload-progress">
                    <div class="fu-upload-progress-bar" style="width:${pct}%"></div>
                </div>
            `;
            item.querySelector('.fu-file-delete')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._removeFile(index);
            });
            return item;
        }

        const ext = this._getExtension(file.name);
        const extClass = this._getExtClass(ext);
        const size = this._formatSize(file.size);

        // Botones de acción según modo
        let actionsHtml = '';
        if (this.readonly) {
            // Modo readonly: botones de visualizar y descargar
            if (this.showPreview && this._canPreview(file)) {
                actionsHtml += `<wc-button 
                    variant="ghost" 
                    size="xs" 
                    icon="${this.icons.preview}"
                    title="${this.texts.previewFile}"
                    data-index="${index}"
                    class="fu-file-preview">
                </wc-button>`;
            }
            if (this.showDownload) {
                actionsHtml += `<wc-button 
                    variant="ghost" 
                    size="xs" 
                    icon="${this.icons.download}"
                    title="${this.texts.downloadFile}"
                    data-index="${index}"
                    class="fu-file-download">
                </wc-button>`;
            }
        } else {
            // Botón visualizar para archivos precargados cuando showPreview está activo.
            if (this.showPreview && file._isPreloaded && this._canPreview(file)) {
                actionsHtml += `<wc-button
                    variant="ghost"
                    size="xs"
                    icon="${this.icons.preview}"
                    title="${this.texts.previewFile}"
                    data-index="${index}"
                    class="fu-file-preview">
                </wc-button>`;
            }
            // Botón descarga para archivos precargados del servidor cuando showDownload está activo.
            // Va antes del botón eliminar para que eliminar siempre quede en última posición.
            // Sin _serverUrl (recién subido a Temp) no hay nada que descargar: no se pinta.
            if (this.showDownload && file._isPreloaded && file._serverUrl) {
                actionsHtml += `<wc-button
                    variant="ghost"
                    size="xs"
                    icon="${this.icons.download}"
                    title="${this.texts.downloadFile}"
                    data-index="${index}"
                    class="fu-file-download">
                </wc-button>`;
            }
            // Botón eliminar siempre al final
            actionsHtml += `<wc-button
                variant="ghost"
                size="xs"
                icon="${this.icons.delete}"
                title="${this.texts.deleteFile}"
                data-index="${index}"
                class="fu-file-delete">
            </wc-button>`;
        }

        // file.name viene del usuario (nombre del archivo subido): escapar siempre
        const esc = WidgetBase.escapeHtml;
        item.innerHTML = `
            <span class="fu-file-ext ${extClass}">${esc(ext.toUpperCase().slice(0, 4))}</span>
            <span class="fu-file-name" title="${esc(file.name)}">${esc(file.name)}</span>
            <span class="fu-file-size">${size}</span>
            <span class="fu-file-actions">${actionsHtml}</span>
        `;

        // Eventos según modo
        if (this.readonly) {
            // Evento de visualizar
            const previewBtn = item.querySelector('.fu-file-preview');
            if (previewBtn) {
                previewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._previewFile(file, index);
                });
            }
            // Evento de descargar
            const downloadBtn = item.querySelector('.fu-file-download');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._downloadFile(file, index);
                });
            }
        } else {
            // Evento de eliminar
            const deleteBtn = item.querySelector('.fu-file-delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._removeFile(index);
                });
            }
            // Evento de visualizar para archivos precargados en modo edición
            const previewBtn = item.querySelector('.fu-file-preview');
            if (previewBtn) {
                previewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._previewFile(file, index);
                });
            }
            // Evento de descarga para archivos precargados en modo edición
            if (this.showDownload && file._isPreloaded && file._serverUrl) {
                const downloadBtn = item.querySelector('.fu-file-download');
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._downloadFile(file, index);
                    });
                }
            }
        }

        return item;
    }

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================

    _setupEventListeners() {
        const dropzone = this.shadow.querySelector('#dropzone');
        const attachButton = this.shadow.querySelector('#attach-button');
        const fileInput = this.shadow.querySelector('#file-input');
        const card = this.shadow.querySelector('.fu-card');
        const isButtonVariant = this.variant === 'button';

        if (dropzone) {
            // En modo button, solo el botón abre el picker, no el área completa
            if (!isButtonVariant) {
                dropzone.addEventListener('click', () => this._openFilePicker());
            }
            dropzone.addEventListener('dragover', (e) => this._handleDragOver(e));
            dropzone.addEventListener('dragleave', (e) => this._handleDragLeave(e));
            dropzone.addEventListener('drop', (e) => this._handleDrop(e));
        }

        // En modo button, el click va al wc-button
        if (attachButton) {
            attachButton.addEventListener('click', () => this._openFilePicker());
        }

        if (card) {
            card.addEventListener('dragover', (e) => this._handleDragOver(e));
            card.addEventListener('dragleave', (e) => this._handleDragLeave(e));
            card.addEventListener('drop', (e) => this._handleDrop(e));
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => this._handleFileSelect(e));
        }
    }

    _removeEventListeners() {
        // Los event listeners se limpian automáticamente al destruir el shadow DOM
    }

    _openFilePicker() {
        if (this.disabled) return;
        const fileInput = this.shadow.querySelector('#file-input');
        if (fileInput) {
            fileInput.value = ''; // Reset para permitir re-seleccionar el mismo archivo
            fileInput.click();
        }
    }

    _handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.disabled) return;

        const card = this.shadow.querySelector('.fu-card');
        const dropzone = this.shadow.querySelector('#dropzone');
        card?.classList.add('drag-over');
        dropzone?.classList.add('drag-over');
        this._isDragging = true;
    }

    _handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();

        const card = this.shadow.querySelector('.fu-card');
        // Solo quitar el estilo si realmente salimos del componente
        if (!card?.contains(e.relatedTarget)) {
            card?.classList.remove('drag-over');
            const dropzone = this.shadow.querySelector('#dropzone');
            dropzone?.classList.remove('drag-over');
            this._isDragging = false;
        }
    }

    _handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.disabled) return;

        const card = this.shadow.querySelector('.fu-card');
        const dropzone = this.shadow.querySelector('#dropzone');
        card?.classList.remove('drag-over');
        dropzone?.classList.remove('drag-over');
        this._isDragging = false;

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            this._addFiles(files);
        }
    }

    _handleFileSelect(e) {
        const files = e.target.files;
        if (files && files.length > 0) {
            this._addFiles(files);
        }
    }

    // =========================================================================
    // LÓGICA DE ARCHIVOS
    // =========================================================================

    _addFiles(fileList) {
        const newFiles = Array.from(fileList);

        for (const file of newFiles) {
            // Validar límite de archivos
            if (this._files.length >= this.maxFiles) {
                this._dispatchError(this.texts.maxFilesError(this.maxFiles));
                break;
            }

            // Validar tamaño
            if (file.size > this.maxSize * 1024 * 1024) {
                this._dispatchError(this.texts.maxSizeError(file.name, this.maxSize), file);
                continue;
            }

            // Validar tipo
            if (!this._isValidType(file)) {
                this._dispatchError(this.texts.typeError(file.name), file);
                continue;
            }

            // Validar duplicado
            if (this._isDuplicate(file)) {
                this._dispatchError(this.texts.duplicateError(file.name), file);
                continue;
            }

            // Agregar archivo y limpiar error previo
            if (this.uploadUrl) {
                // Placeholder "pendiente" inmediato: se ve en la lista aunque su turno de subida
                // (encolada en _uploadChain) aun no haya llegado. _uploadFileChunked nunca rechaza
                // (captura sus propios errores), así que encadenar con .then() es seguro.
                const pending = { name: file.name, size: file.size, _isUploading: true, _isPending: true, _tempId: null };
                this._files.push(pending);
                this._uploadChain = this._uploadChain.then(() => this._uploadFileChunked(file, pending));
            } else {
                this._files.push(file);
            }
            this._clearError();
        }

        this._updateUI();
        this._dispatchFilesChanged();
    }

    _clearError() {
        const errorEl = this.shadow.querySelector('#error-message');
        const card = this.shadow.querySelector('.fu-card');
        if (errorEl) errorEl.textContent = '';
        if (card) card.classList.remove('has-error');
    }

    _removeFile(index) {
        if (index < 0 || index >= this._files.length) return;
        const file = this._files[index];

        // Subida en curso: abortar fetch y limpiar estado
        if (file._isUploading && file._tempId) {
            const ctrl = this._uploadAbortControllers[file._tempId];
            if (ctrl) ctrl.abort();
            delete this._uploadProgress[file._tempId];
            delete this._uploadAbortControllers[file._tempId];
            this._files.splice(index, 1);
            this._updateUI();
            this._dispatchFilesChanged();
            return;
        }

        // Fichero conocido por el servidor: notificar para que lo descarte (si era nuevo) o lo
        // marque como quitado (si ya existia). El componente nunca borra nada del repositorio.
        if (file._serverId && this.uploadUrl) {
            const fd = new FormData();
            fd.append('action', 'delete');
            fd.append('contextId', this.uploadContextId);
            fd.append('token', file._serverId);
            fetch(this.uploadUrl, { method: 'POST', body: fd }).catch(() => {});
        }

        this._files.splice(index, 1);
        this._updateUI();
        this._dispatchFilesChanged();
    }

    // =========================================================================
    // SUBIDA POR TROCEO (CHUNKED UPLOAD)
    // =========================================================================

    async _uploadFileChunked(file, placeholder) {
        // El usuario pudo quitar el fichero mientras esperaba turno en la cola: no subir nada.
        if (!this._files.includes(placeholder)) return;

        const CHUNK_SIZE = 1024 * 1024; // 1 MB por trozo: nunca supera el maxRequestLength de 4 MB
        const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
        const fileId = this._generateUUID();
        const tempId = 'uploading_' + fileId;

        // Arranca la subida real: el placeholder pasa de "pendiente" a "subiendo"
        delete placeholder._isPending;
        placeholder._tempId = tempId;
        this._uploadProgress[tempId] = { loaded: 0, total: totalChunks };

        const abortCtrl = new AbortController();
        this._uploadAbortControllers[tempId] = abortCtrl;
        this._updateUI();

        try {
            let token = null;
            for (let i = 0; i < totalChunks; i++) {
                if (abortCtrl.signal.aborted) return;

                const start = i * CHUNK_SIZE;
                const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));

                const fd = new FormData();
                fd.append('action', 'chunk');
                fd.append('contextId', this.uploadContextId);
                fd.append('fileId', fileId);
                fd.append('fileName', file.name);
                fd.append('chunkIndex', String(i));
                fd.append('totalChunks', String(totalChunks));
                fd.append('chunk', chunk, file.name);

                const resp = await fetch(this.uploadUrl, { method: 'POST', body: fd, signal: abortCtrl.signal });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const json = await resp.json();
                if (!json.ok) throw new Error(json.error || '');

                this._uploadProgress[tempId].loaded = i + 1;
                this._updateProgressUI(tempId);

                if (json.token) token = json.token;
            }

            if (abortCtrl.signal.aborted) return;

            // Sustituir placeholder por mock con el token del servidor
            const idx = this._files.findIndex(f => f._tempId === tempId);
            if (idx !== -1) {
                const mock = new Blob([], { type: file.type || 'application/octet-stream' });
                Object.defineProperties(mock, {
                    name:         { value: file.name,         writable: false },
                    size:         { value: file.size,         writable: false },
                    lastModified: { value: file.lastModified, writable: false },
                    _isPreloaded: { value: true,              writable: false },
                    _isUploaded:  { value: true,              writable: false }, // subido a Temp en esta sesion (token distinto de un precargado permanente)
                    _serverId:    { value: token,             writable: false },
                    _localFile:   { value: file,              writable: false }
                });
                this._files[idx] = mock;
            }

        } catch (err) {
            if (abortCtrl.signal.aborted) return; // cancelado por el usuario, ya limpiado en _removeFile
            const idx = this._files.findIndex(f => f._tempId === tempId);
            if (idx !== -1) this._files.splice(idx, 1);
            const detalle = err && err.message ? ' (' + err.message + ')' : '';
            this._dispatchError(this.texts.uploadError(file.name) + detalle);
        } finally {
            delete this._uploadProgress[tempId];
            delete this._uploadAbortControllers[tempId];
            this._updateUI();
            this._dispatchFilesChanged();
        }
    }

    _updateProgressUI(tempId) {
        const progress = this._uploadProgress[tempId];
        if (!progress) return;
        const pct = Math.round((progress.loaded / progress.total) * 100);
        const idx = this._files.findIndex(f => f._tempId === tempId);
        if (idx === -1) return;
        const fileList = this.shadow.querySelector('#file-list');
        if (!fileList) return;
        const item = fileList.querySelectorAll('.fu-file-item')[idx];
        if (!item) return;
        const pctEl = item.querySelector('.fu-uploading-pct');
        if (pctEl) pctEl.textContent = pct + '%';
        const bar = item.querySelector('.fu-upload-progress-bar');
        if (bar) bar.style.width = pct + '%';
    }

    _generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    /**
     * Visualiza un archivo precargado.
     * Dispara evento 'file-preview' (cancelable) con la información del archivo.
     * Si quien escucha llama a preventDefault() no se abre la pestaña por defecto.
     * @param {Object} file - Archivo a visualizar
     * @param {number} index - Índice del archivo
     */
    _previewFile(file, index) {
        const url = file._serverUrl || null;
        const id = file._serverId || null;

        const evento = new CustomEvent('file-preview', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: { file, index, url, id, name: file.name }
        });
        this.dispatchEvent(evento);

        // Si tiene URL y nadie ha gestionado el evento, abrir en nueva pestaña por defecto
        if (url && !evento.defaultPrevented) {
            window.open(url, '_blank');
        }
    }

    /**
     * Descarga un archivo precargado.
     * Dispara evento 'file-download' con la información del archivo.
     * @param {Object} file - Archivo a descargar
     * @param {number} index - Índice del archivo
     */
    _downloadFile(file, index) {
        const url = file._serverUrl || null;
        const id = file._serverId || null;
        
        this.dispatchEvent(new CustomEvent('file-download', {
            bubbles: true,
            composed: true,
            detail: { file, index, url, id, name: file.name }
        }));

        // Si tiene URL, iniciar descarga
        if (url) {
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    }

    _isValidType(file) {
        if (this.accept === '*') return true;

        const acceptTypes = this.accept.split(',').map(t => t.trim().toLowerCase());
        const fileName = file.name.toLowerCase();
        const fileType = file.type.toLowerCase();

        return acceptTypes.some(accept => {
            // Extensión: .pdf, .doc
            if (accept.startsWith('.')) {
                return fileName.endsWith(accept);
            }
            // MIME type con wildcard: image/*
            if (accept.endsWith('/*')) {
                const category = accept.replace('/*', '');
                return fileType.startsWith(category + '/');
            }
            // MIME type exacto
            return fileType === accept;
        });
    }

    _isDuplicate(file) {
        return this._files.some(f => f.name === file.name && f.size === file.size);
    }

    // =========================================================================
    // UTILIDADES
    // =========================================================================

    _getExtension(filename) {
        return filename.split('.').pop() || '';
    }

    /** Indica si el archivo admite el botón de visualizar según previewAccept (vacío = todos). */
    _canPreview(file) {
        const accept = this.previewAccept;
        if (!accept) return true;
        const ext = '.' + this._getExtension(file.name).toLowerCase();
        return accept.split(',').some(a => a.trim().toLowerCase() === ext);
    }

    _getExtClass(ext) {
        const extLower = ext.toLowerCase();
        if (extLower === 'pdf') return 'pdf';
        if (['doc', 'docx'].includes(extLower)) return 'doc';
        if (['xls', 'xlsx'].includes(extLower)) return 'xls';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extLower)) return 'img';
        return 'generic';
    }

    _formatSize(bytes) {
        if (bytes >= 1048576) {
            return (bytes / 1048576).toFixed(1) + ' MB';
        }
        return Math.round(bytes / 1024) + ' KB';
    }

    /**
     * Genera el texto de tipos de archivo permitidos.
     * Si hay acceptLabel del preset, lo combina con las extensiones: "Label (.ext1, .ext2)"
     * Si no, intenta generar desde el atributo accept.
     * @returns {string} Texto de tipos o cadena vacía si accept="*"
     */
    _formatAcceptLabel() {
        // Si accept es "*" o no hay restricción, no mostrar tipos
        if (this.accept === '*' || !this.accept) {
            return '';
        }

        // accept-label="" explicito = ocultar los tipos (distinto de no declarar el atributo,
        // que sí los lista, que es el default). getAttribute devuelve null si no existe, así
        // que solo entra aquí quien lo haya puesto vacío a propósito.
        const etiquetaExplicita = this.getAttribute('accept-label');
        if (etiquetaExplicita !== null && etiquetaExplicita.trim() === '') {
            return '';
        }

        // Si hay acceptLabel (del preset o explícito), combinarlo con extensiones
        if (this.acceptLabel) {
            const extensions = this._formatExtensions();
            return extensions ? `${this.acceptLabel} (${extensions})` : this.acceptLabel;
        }

        // Sin acceptLabel, mostrar solo extensiones
        return this._formatExtensions();
    }

    /**
     * Subtítulo del dropzone: tipos permitidos (si los hay) + tamaño máximo por archivo +
     * número máximo de archivos (solo en modo múltiple; en modo single no aporta información).
     */
    _buildSubtitleText() {
        const typesLabel = this._formatAcceptLabel();
        const sizeText = typesLabel
            ? this.texts.typesAndMax(typesLabel, this.maxSize)
            : this.texts.maxPerFile(this.maxSize);
        return this.multiple
            ? `${sizeText}, ${this.texts.maxFilesLabel(this.maxFiles)}`
            : sizeText;
    }

    /**
     * Formatea las extensiones del accept para mostrar.
     * @returns {string} Extensiones formateadas o cadena vacía
     * @private
     */
    _formatExtensions() {
        if (!this.accept || this.accept === '*') return '';

        // Mapeo de MIME types a códigos genéricos (sin textos traducibles)
        const typeMap = {
            'image/*': 'IMG',
            'video/*': 'VIDEO',
            'audio/*': 'AUDIO',
            'application/pdf': 'PDF'
        };

        const types = this.accept.split(',').map(t => t.trim().toLowerCase());
        const labels = [];
        const seen = new Set();

        for (const type of types) {
            let label = typeMap[type];
            
            // Si no está en el mapa, intentar extraer extensión
            if (!label && type.startsWith('.')) {
                label = type.slice(1).toUpperCase();
            }

            if (label && !seen.has(label)) {
                seen.add(label);
                labels.push(label);
            }
        }

        return labels.join(', ');
    }

    // =========================================================================
    // EVENTOS
    // =========================================================================

    _dispatchFilesChanged() {
        this.dispatchEvent(new CustomEvent('files-changed', {
            bubbles: true,
            composed: true,
            detail: { files: this.files }
        }));
    }

    _dispatchError(message, file = null) {
        this.dispatchEvent(new CustomEvent('file-error', {
            bubbles: true,
            composed: true,
            detail: { error: message, file }
        }));

        // Mostrar error visual
        const errorEl = this.shadow.querySelector('#error-message');
        const card = this.shadow.querySelector('.fu-card');
        if (errorEl && card) {
            errorEl.textContent = message;
            card.classList.add('has-error');
        }
    }
}

if (!customElements.get('wc-file-upload')) customElements.define('wc-file-upload', FileUpload);