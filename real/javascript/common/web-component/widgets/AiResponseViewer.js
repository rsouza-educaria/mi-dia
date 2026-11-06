/**
 * @fileoverview AiResponseViewer - Visor de respuestas de IA (markdown + trazas + graficas)
 *
 * Tag:        ai-response-viewer
 * Herencia:   WidgetBase (Shadow DOM)
 * CSS:        ai-response-viewer.css
 *
 * Presenta la respuesta de un agente de IA con la identidad visual de Alexia: barra de meta con el
 * destello de IA, la hora y las acciones; cuerpo en markdown con el resumen destacado y secciones
 * plegables con indice; las consultas realizadas plegadas y el aviso de revision.
 * Las graficas (barras, lineas, area, tarta, radar y heatmap) se dibujan con ECharts en SVG, que se
 * descarga solo si la respuesta trae alguna: en la marca `[[grafica:gN]]` del texto o, sin marca, al final.
 * Es GENERICO: no sabe de alumnos ni de la Situacion 360. Quien conoce el dominio es el
 * controlador que lo monta (UI.Situacion360 y los que vengan), que le da textos ya traducidos.
 *
 * En pantalla el visor no se titula: lo titula su anfitrion (la pestaña de la ficha, la cabecera
 * del panel). heading, report-name y logo-src titulan el documento que se imprime o se guarda
 * como PDF, que viaja solo.
 *
 * Atributos:
 *   heading   (String) - Titulo del documento exportado y base del nombre del fichero.
 *   subtitle  (String) - Marca de tiempo de la respuesta (p. ej. "Generado hoy a las 10:12").
 *   state     (String) - 'idle' | 'loading' | 'success' | 'error' | 'empty'.
 *   loading-text (String) - Texto del estado de carga.
 *   loading-hint (String) - Primer paso de la lista de carga (y ultimo anadido despues).
 *   loading-scene (String) - Escena animada del estado de carga: 'alumno' | 'grupo' | 'oferta' | 'curso' | 'ciclo' | 'estudio'.
 *                         Sin escena, la carga solo muestra el mensaje y los pasos.
 *   loading-variant (String) - Variante de la escena. 'alumno': 'chica' | 'chico' (sin variante, chica;
 *                         el anfitrion la deduce del sexo). 'estudio': codigo SysEstudio (INF, PRI, ESO,
 *                         BAC, CF, FPB, PCPI, PGS, NR, SERV, EXTRA) que elige el icono; otro o vacio, birrete.
 *   loading-estimate (Number) - Segundos que se espera que tarde la respuesta. Con escena y estimacion, la
 *                         carga pinta bajo la escena una barra de progreso simulada (un cohete que viaja a un
 *                         planeta): rapida al principio, mas lenta despues y sin llegar a la meta hasta que
 *                         llega la respuesta. Sin estimacion no hay barra.
 *   loading-skeleton (Bool) - Esqueleto del resumen y tres secciones bajo el mensaje de carga.
 *   collapsible-sections (Bool) - Pliega cada seccion (h2) en un details; el resumen no.
 *   open-sections (Number) - Secciones que quedan abiertas desde arriba (por defecto 1).
 *   hide-notice  (Bool) - Oculta en pantalla el aviso "contenido generado por IA".
 *   report-name (String) - Nombre del informe: segunda linea del titulo del documento exportado.
 *   logo-src (String) - Logo del centro junto al titulo del documento exportado.
 *   document-name (String) - Nombre base para imprimir y para el PDF (p. ej. "Maria Perez -
 *                         Situacion 360 IA"). Sin el se usa `heading` (y `report-name`).
 *
 * Propiedades JS (no atributos):
 *   texts   (Object) - Textos ya traducidos: { traces, retry, notice, copy, copied, print,
 *                      savePdf, index, collapseAll, expandAll, chartUnavailable }. Cada elemento
 *                      solo se pinta si su texto viene; chartUnavailable (grafica que no se puede
 *                      pintar) tiene un texto por defecto.
 *   result  (Object) - { markdown, traces[], charts[] } via setResult().
 *
 * API publica:
 *   setLoading(texto?, paso?) - Estado de carga; paso reinicia la lista de pasos.
 *   addLoadingStep(paso)      - Anade un paso a la lista de carga y lo marca como activo.
 *   setResult({markdown, traces, charts}) - Respuesta correcta. Con la barra en marcha, la completa y
 *                             la deja un instante en la meta (unos 750 ms) antes de pintar la respuesta.
 *   setError(mensaje)         - Error con boton de reintento (inmediato, sin completar la barra).
 *   setEmpty(mensaje)         - Sin contenido que mostrar (p. ej. sin prompt configurado).
 *
 * @fires ai-response-retry - El usuario pulsa "Volver a intentarlo".
 *
 * @example
 * const visor = document.createElement('ai-response-viewer');
 * visor.heading = 'Maria Perez Garcia';
 * visor.reportName = 'Situacion 360 IA';
 * visor.loadingScene = 'alumno';
 * visor.loadingEstimate = 31;
 * visor.texts = { traces: 'Consultas realizadas', retry: 'Volver a intentarlo' };
 * contenedor.appendChild(visor);
 * visor.setLoading('Analizando la informacion...');
 */

/** Estados posibles del visor. */
const AI_VIEWER_ESTADOS = ['idle', 'loading', 'success', 'error', 'empty'];

/**
 * Pasos de carga visibles a la vez. Al anadir uno mas, el mas antiguo sale por arriba.
 * Con la lista sin tope, una espera larga en el panel lateral de 320 px (donde cada paso ocupa
 * dos lineas) empujaba el contenido y obligaba a hacer scroll para ver el paso actual.
 */
const AI_VIEWER_MAX_PASOS_CARGA = 4;

/**
 * Libreria de generacion de PDF en el navegador (incluye html2canvas + jsPDF). Misma URL y misma
 * version que usa el visor del asistente de texto (TextAssistantResultViewer.html): son la misma
 * necesidad, no merece una segunda dependencia. Se carga bajo demanda, solo al pulsar "Guardar
 * como PDF", porque son ~350 KB y este visor aparece en muchas paginas donde nadie los pide.
 */
const AI_VIEWER_HTML2PDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

/**
 * Las tres estrellas del icono de la IA de Alexia (caja 20 x 20), sueltas para reutilizarlas: las
 * pinta el icono de la cabecera y las usa la estrella que recorre la orbita de las escenas de carga.
 * Mismo trazo y colores que el boton de Acciones IA (acciones-ia.js / ia-acciones-button.css).
 */
const AI_VIEWER_ESTRELLAS_IA =
    '<path d="M19.729 9.643C14.662 8.244 13.608 7.19 12.209 2.125a.39.39 0 0 0-.714 0C10.095 7.19 9.04 8.244 3.975 9.643a.39.39 0 0 0 0 .715C9.042 11.757 10.095 12.811 11.495 17.876a.39.39 0 0 0 .714 0C13.608 12.81 14.663 11.757 19.729 10.358a.39.39 0 0 0 0-.715z" fill="var(--arv-estrella-cian)"/>' +
    '<path d="M3.717 7.877a.39.39 0 0 0 .714 0C5.08 5.531 5.53 5.08 7.877 4.432a.39.39 0 0 0 0-.715C5.53 3.069 5.08 2.619 4.43.272a.39.39 0 0 0-.714 0C3.068 2.618 2.618 3.069.27 3.717a.39.39 0 0 0 0 .715C2.618 5.08 3.069 5.53 3.717 7.877z" fill="var(--arv-estrella-verde)"/>' +
    '<path d="M8.432 16.124c-1.968-.544-2.346-.921-2.889-2.89a.39.39 0 0 0-.714 0c-.544 1.97-.921 2.347-2.89 2.89a.39.39 0 0 0 0 .715c1.97.543 2.347.921 2.89 2.889a.39.39 0 0 0 .714 0c.543-1.968.921-2.346 2.889-2.89a.39.39 0 0 0 0-.714z" fill="var(--arv-estrella-amarilla)"/>';

/** Icono de destello de la IA de Alexia, el de la cabecera del visor. */
const AI_VIEWER_ICONO_IA =
    '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">' +
    AI_VIEWER_ESTRELLAS_IA +
    '</svg>';

/** Check del boton de copiar tras copiar (mismo trazo que el del visor del asistente de texto). */
const AI_VIEWER_ICONO_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<polyline points="20 6 9 17 4 12"/>' +
    '</svg>';

/** Icono de las consultas realizadas (lupa). */
const AI_VIEWER_ICONO_CONSULTAS =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
    '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7"/>' +
    '<path d="M16.5 16.5 21 21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
    '</svg>';

/** Flecha de las secciones plegables: apunta a la derecha y gira al abrir (lo hace el CSS). */
const AI_VIEWER_ICONO_FLECHA =
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">' +
    '<path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

/**
 * Plegar todo: dos flechas apiladas apuntando hacia arriba. Es la misma flecha que abre y cierra
 * cada seccion, duplicada para decir "todas". Los iconos dicen la ACCION que va a ocurrir al
 * pulsar, no el estado en el que esta el informe.
 *
 * Se descarto el par que apunta al centro (el clasico "unfold less"): a 16 px las dos puntas se
 * juntaban tanto que el boton parecia una equis, que en una botonera se lee como cerrar.
 */
//
// Dibujados en la misma rejilla que los glifos de trazo del catalogo (caja de 24, trazo de 1,8,
// como copiar y descargar): asi, al pintarse al mismo tamaño que ellos, el grosor de linea
// coincide. En una caja de 16 el mismo trazo salia un 50 % mas gordo que el de sus vecinos.
const AI_VIEWER_ICONO_PLEGAR =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
    '<path d="M5 11l7-5.5 7 5.5M5 18l7-5.5 7 5.5" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

/** Desplegar todo: las mismas dos flechas, apuntando hacia abajo. */
const AI_VIEWER_ICONO_DESPLEGAR =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
    '<path d="M5 6l7 5.5 7-5.5M5 13l7 5.5 7-5.5" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

// =============================================================================
// ESCENAS DEL ESTADO DE CARGA
// =============================================================================
// Escenas SVG animadas por CSS (ai-response-viewer.css, seccion 04), una por objeto, que el
// anfitrion elige con loading-scene. Estilo de las personas de la web de Alexia: bloques planos,
// azul institucional + tricolor del logotipo (cian/verde/amarillo).
// Las seis comparten composicion (aiViewerEscena): un motivo de pie sobre la misma sombra y rodeado
// por la misma orbita. Solo la estrella IA se mueve por si misma; el motivo reacciona a su paso con
// gestos cortos, para que la espera se lea como trabajo y no como decoracion.
// Colores por token (--arv-esc-*, definidos en el CSS); los tonos de piel y pelo son variables
// propias de la escena (--arv-piel-*, --arv-pelo-*) porque no existen en colors.css.
// Los grupos animados NO llevan transform de atributo: una animacion CSS de transform lo pisaria y
// el elemento saltaria al origen. Por eso cada pieza animada va envuelta en un <g> con la posicion.

/** Defs comunes: el icono IA (arv-ia) con la estrella grande en el origen, para que gire sobre si mismo. */
const AI_VIEWER_ESCENA_DEFS =
    '<g id="arv-ia"><g transform="translate(-11.85 -10)">' + AI_VIEWER_ESTRELLAS_IA + '</g></g>';

/** Sombra de suelo comun: todos los motivos se apoyan en y = 100, centrados en x = 80. */
const AI_VIEWER_ESCENA_SUELO =
    '<ellipse cx="80" cy="101" rx="42" ry="3.5" fill="var(--arv-esc-suave)" opacity=".7"/>';

/**
 * Orbita 360 comun a las seis escenas: una elipse achatada (centro 80,64; radios 66 x 20) que se lee
 * como un anillo visto en perspectiva, la estrella IA que la recorre y el arco de progreso que la
 * completa en cada vuelta. Va partida en dos capas, atras (mitad de arriba) y delante (mitad de
 * abajo), que la escena pinta antes y despues del motivo: asi el motivo tapa siempre lo que pasa por
 * detras. La estrella esta en las dos capas y el CSS muestra la de la mitad que recorre.
 * @returns {{atras: string, delante: string}}
 */
function aiViewerOrbita360() {
    const capa = (atras) => {
        const media = ' d="' + (atras ? 'M14 64 A66 20 0 0 1 146 64' : 'M146 64 A66 20 0 0 1 14 64') + '"';
        // Trazo del anillo y del arco. Delante lleva debajo un halo claro que lo separa del motivo.
        const trazo = (clase, extra) =>
            (atras ? '' : '<path class="arv-o3-halo' + clase + '"' + media + extra + '/>') +
            '<path class="arv-o3-trazo' + clase + '"' + media + extra + '/>';
        return '<g class="arv-o3 arv-o3-' + (atras ? 'atras' : 'delante') + '">' +
            '<path class="arv-o3-pista"' + media + '/>' +
            '<g class="arv-o3-anillo">' + trazo('', '') + '</g>' +
            trazo(' arv-o3-arco', ' pathLength="50"') +
            '<g class="arv-o3-estrella"><g class="arv-o3-prof"><g class="arv-o3-gira">' +
                '<use href="#arv-ia"/>' +
            '</g></g></g>' +
            '</g>';
    };
    return { atras: capa(true), delante: capa(false) };
}

/**
 * Monta una escena con la composicion comun, en este orden: orbita de atras, sombra, motivo y orbita
 * de delante. El motivo va de pie sobre y = 100, centrado en x = 80 y dentro de unos 84 x 70, para
 * que la orbita (x 14..146) asome por los dos lados. Sin disco detras del motivo: taparia la mitad
 * trasera de la orbita, que es la que da la profundidad.
 * @param {string} nombre - Sufijo de la clase arv-esc-<nombre>, con la que el CSS anima el motivo.
 * @param {string} motivo - SVG del motivo.
 * @param {string} [defs] - Defs propias de la escena.
 * @returns {string}
 */
function aiViewerEscena(nombre, motivo, defs) {
    const orbita = aiViewerOrbita360();
    // El viewBox recorta el aire de la caja de 160 x 120 (lo visible va de y 44 a 105): asi la caja
    // y lo que se ve tienen el mismo centro y la escena se alinea con el texto sin ajustes.
    return '<svg class="arv-esc arv-esc-' + nombre + '" viewBox="0 36 160 76" aria-hidden="true" focusable="false">' +
        '<defs>' + AI_VIEWER_ESCENA_DEFS + (defs || '') + '</defs>' +
        orbita.atras +
        AI_VIEWER_ESCENA_SUELO +
        motivo +
        orbita.delante +
        '</svg>';
}

/**
 * Personaje de las escenas 'alumno' y 'ciclo', de pie sobre y = 112 y centrado en x = 70 (cada escena
 * lo coloca con un transform). La cabeza va en su propio grupo para poder seguir a la estrella.
 * @param {'chica'|'chico'} variante - Sin variante, chica.
 * @returns {string}
 */
function aiViewerPersonaje(variante) {
    return variante === 'chico'
        // Chico: polo verde, pelo corto con flequillo, sin gafas.
        ? '<path d="M46 112 V86 a24 17 0 0 1 48 0 V112 Z" fill="var(--arv-esc-verde)"/>' +
          '<path d="M62 69 l8 7 l8 -7" fill="none" stroke="var(--arv-esc-claro)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<g class="arv-cabeza">' +
              '<rect x="65" y="58" width="10" height="12" rx="2" fill="var(--arv-piel-d)"/>' +
              '<circle cx="70" cy="52" r="13" fill="var(--arv-piel-c)"/>' +
              '<path d="M57 51 a13 13 0 0 1 26 0 q-3 -5 -8 -5 q-5 0 -8 3 q-5 -1 -10 2z" fill="var(--arv-pelo-d)"/>' +
          '</g>'
        // Chica: camiseta azul, melena larga hasta los hombros y gafas redondas de trazo (como el
        // hero de la web). La melena es lo que distingue la variante de un vistazo: con pelo corto
        // el personaje se leia como un chico incluso abriendo la ficha de una alumna.
        : '<path d="M46 112 V86 a24 17 0 0 1 48 0 V112 Z" fill="var(--arv-esc-azul)"/>' +
          '<path d="M61 70 l9 10 l9 -10" fill="none" stroke="var(--arv-esc-suave)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<g class="arv-cabeza">' +
              '<rect x="65" y="58" width="10" height="12" rx="2" fill="var(--arv-piel-b)"/>' +
              // Los dos mechones se dibujan ANTES de la cara: nacen detras de la cabeza y solo
              // asoman por los lados, hasta la altura de los hombros.
              '<path d="M57 43 q-9 16 -8 32 q0 5 5 5 h6 q-5 -20 1 -36z" fill="var(--arv-pelo-a)"/>' +
              '<path d="M83 43 q9 16 8 32 q0 5 -5 5 h-6 q5 -20 -1 -36z" fill="var(--arv-pelo-a)"/>' +
              '<circle cx="70" cy="52" r="13" fill="var(--arv-piel-a)"/>' +
              '<path d="M57 51 a13 13 0 0 1 26 0 v2 H57z" fill="var(--arv-pelo-a)"/>' +
              '<g fill="none" stroke="var(--arv-esc-azul)" stroke-width="1.4"><circle cx="64" cy="54" r="4.6"/><circle cx="76" cy="54" r="4.6"/><path d="M68.6 54 h2.8"/></g>' +
          '</g>';
}

/**
 * Escena 'alumno': el personaje en el centro de la orbita. Su cabeza sigue a la estrella con un
 * balanceo de 3 grados; nada mas se mueve, el progreso lo cuenta la orbita.
 * @param {'chica'|'chico'} variante
 * @returns {string}
 */
function aiViewerEscenaAlumno(variante) {
    return aiViewerEscena('alumno', '<g transform="translate(80 100) scale(.92) translate(-70 -112)">' + aiViewerPersonaje(variante) + '</g>');
}

/**
 * Escena 'grupo': tres alumnos tras un pupitre corrido, que tapa el corte del busto. Cada uno sube
 * un instante cuando la estrella pasa por delante de el (derecha, centro, izquierda).
 * Un solo simbolo de alumno reutilizado; piel, pelo y ropa por variables CSS.
 */
const AI_VIEWER_ESCENA_GRUPO = (function () {
    const alumno = (i, x, y, escala, estilo, extra) =>
        '<g class="arv-alu arv-alu-' + i + '" style="' + estilo + '">' +
            '<g transform="translate(' + x + ' ' + y + ') scale(' + escala + ')"><use href="#arv-alu"/>' + (extra || '') + '</g>' +
        '</g>';
    // Melena de la alumna del centro: dos mechones a los lados de la cara.
    const melena = '<path d="M-8 -31 q-3.5 9 -2.5 17 h3.5 q-1.5 -8 -1 -17z" fill="var(--arv-pelo-a)"/>' +
        '<path d="M8 -31 q3.5 9 2.5 17 h-3.5 q1.5 -8 1 -17z" fill="var(--arv-pelo-a)"/>';

    return aiViewerEscena('grupo',
        alumno(1, 56, 86.5, 1.12, '--p:var(--arv-piel-c);--h:var(--arv-pelo-b);--r:var(--arv-esc-verde)') +
        alumno(3, 104, 86.5, 1.12, '--p:var(--arv-piel-e);--h:var(--arv-pelo-e);--r:var(--arv-esc-amarillo)') +
        alumno(2, 80, 86.5, 1.25, '--p:var(--arv-piel-a);--h:var(--arv-pelo-a);--r:var(--arv-esc-cian)', melena) +
        '<rect x="42" y="81" width="76" height="19" fill="var(--arv-esc-suave)"/>' +
        '<rect x="42" y="79" width="76" height="3" rx="1.5" fill="var(--arv-esc-suave-oscuro)"/>',
        // Alumno centrado en x = 0 con el torso largo: el pupitre tapa su corte aunque el alumno suba.
        '<g id="arv-alu">' +
            '<path d="M-12 10 V-13 a12 9 0 0 1 24 0 V10 Z" fill="var(--r)"/>' +
            '<rect x="-3.2" y="-27" width="6.4" height="7" rx="1.5" fill="var(--p)"/>' +
            '<circle cx="0" cy="-30" r="8" fill="var(--p)"/>' +
            '<path d="M-8 -31 a8 8 0 0 1 16 0 v1.2 H-8z" fill="var(--h)"/>' +
        '</g>');
})();

/**
 * Escena 'oferta': un encerado sobre su caballete. La tiza escribe tres lineas mientras la estrella
 * recorre la mitad de atras y pone un tic al cruzar por delante; al cerrar la vuelta se borra todo.
 */
const AI_VIEWER_ESCENA_OFERTA = aiViewerEscena('oferta',
    '<path d="M58 78 L53 100 M102 78 L107 100" stroke="var(--arv-esc-madera-oscura)" stroke-width="2.6" stroke-linecap="round"/>' +
    '<rect x="46" y="36" width="68" height="44" rx="4" fill="var(--arv-esc-madera)"/>' +
    '<rect x="50" y="40" width="60" height="36" rx="1.5" fill="var(--arv-esc-pizarra)"/>' +
    // pathLength 1: las cuatro piezas se escriben con el mismo stroke-dashoffset de 1 a 0.
    '<g class="arv-tiza" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<g stroke="var(--arv-esc-tiza)" stroke-width="2" stroke-opacity=".92">' +
            '<path class="arv-tiza-1" d="M56 48 H98" pathLength="1"/>' +
            '<path class="arv-tiza-2" d="M56 55 H90" pathLength="1"/>' +
            '<path class="arv-tiza-3" d="M56 62 H80" pathLength="1"/>' +
        '</g>' +
        '<path class="arv-tic" d="M89 64 l4 4 l9 -10" stroke="var(--arv-esc-tiza-amarilla)" stroke-width="2.2" pathLength="1"/>' +
    '</g>');

/**
 * Escena 'curso': tres puertas de aula (A, B, C) de pie, sin pared: una pared taparia la orbita de
 * atras. La luz de cada aula (su ventanita) se enciende cuando la estrella pasa por detras de su
 * puerta y se apagan juntas al cerrar la vuelta.
 */
const AI_VIEWER_ESCENA_CURSO = (function () {
    const puerta = (i, cx, color, letra, tinta) => {
        const ventana = ' x="' + (cx - 4.5) + '" y="55" width="9" height="9" rx="1.5"';
        return '<rect x="' + (cx - 8.5) + '" y="50" width="17" height="50" rx="1.5" fill="var(--arv-esc-suave)" stroke="var(--arv-esc-suave-oscuro)" stroke-width="1.4"/>' +
            '<rect' + ventana + ' fill="var(--arv-esc-blanco)"/>' +
            // La luz va entre el cristal y su marco: al encenderse solo cambia el color del cristal.
            '<rect class="arv-luz arv-luz-' + i + '"' + ventana + ' fill="var(--arv-esc-tiza-amarilla)"/>' +
            '<rect' + ventana + ' fill="none" stroke="var(--arv-esc-suave-oscuro)" stroke-width="1.2"/>' +
            '<circle cx="' + (cx + 5) + '" cy="78" r="1.4" fill="var(--arv-esc-gris)"/>' +
            '<rect x="' + (cx - 6.5) + '" y="38" width="13" height="10" rx="2" fill="var(--arv-esc-' + color + ')"/>' +
            '<text x="' + cx + '" y="45.7" text-anchor="middle" font-size="7.5" font-weight="700" fill="var(--arv-esc-' + tinta + ')">' + letra + '</text>';
    };

    return aiViewerEscena('curso',
        puerta(1, 56, 'cian', 'A', 'blanco') +
        puerta(2, 80, 'verde', 'B', 'blanco') +
        puerta(3, 104, 'amarillo', 'C', 'gris'));
})();

/**
 * Escena 'ciclo': la alumna junto a tres barras ascendentes (los cursos del ciclo). Cada barra crece
 * desde el suelo al pasar la estrella por detras de ella y bajan juntas al cerrar la vuelta; la
 * cabeza de la alumna sigue a la estrella como en 'alumno'.
 */
const AI_VIEWER_ESCENA_CICLO = (function () {
    // La barra se alarga 12 por debajo del suelo: al bajar 10 px su pie sigue tapado por el recorte.
    const barra = (i, x, alto, color) =>
        '<rect class="arv-barra arv-barra-' + i + '" x="' + x + '" y="' + (100 - alto) + '" width="11.5" height="' + (alto + 12) + '" rx="2" fill="var(--arv-esc-' + color + ')"/>';

    return aiViewerEscena('ciclo',
        '<g transform="translate(58.7 100) scale(.85) translate(-70 -112)">' + aiViewerPersonaje('chica') + '</g>' +
        '<g clip-path="url(#arv-suelo)">' +
            barra(1, 82, 26, 'cian') + barra(2, 96, 38, 'verde') + barra(3, 110, 50, 'amarillo') +
        '</g>',
        '<clipPath id="arv-suelo"><rect width="160" height="100"/></clipPath>');
})();

/**
 * Iconos de la escena 'estudio', centrados en x = 0 y de pie sobre y = 0 (su base toca el suelo). Cada
 * uno redibuja en planos el icono que Alexia asocia a ese estudio en la Estructura educativa y lleva
 * su propia escala: con una sola, los anchos y bajos (autobus, manos) se veian menores que el resto.
 */
const AI_VIEWER_ESTUDIO_ICONOS = {
    // INF: alumno de infantil de frente, con babi y mochila, cabeza grande y los dos brazos a los lados.
    nino:
        '<g transform="translate(0 -41)">' +
        '<rect x="-19" y="14" width="38" height="17" rx="6" fill="var(--arv-esc-amarillo)"/>' +
        '<rect x="-22" y="12" width="7" height="17" rx="3.5" fill="var(--arv-esc-cian)"/><rect x="15" y="12" width="7" height="17" rx="3.5" fill="var(--arv-esc-cian)"/>' +
        '<circle cx="-18.5" cy="30" r="3.6" fill="var(--arv-piel-c)"/><circle cx="18.5" cy="30" r="3.6" fill="var(--arv-piel-c)"/>' +
        '<path d="M-15 36 V19 a15 9 0 0 1 30 0 V36 Z" fill="var(--arv-esc-cian)"/>' +
        '<rect x="-9" y="21" width="18" height="15" rx="3" fill="var(--arv-esc-verde)"/>' +
        '<rect x="-9" y="12" width="3.2" height="10" rx="1.6" fill="var(--arv-esc-verde)"/><rect x="5.8" y="12" width="3.2" height="10" rx="1.6" fill="var(--arv-esc-verde)"/>' +
        '<rect x="-12" y="36" width="10" height="5" rx="2.5" fill="var(--arv-esc-gris)"/><rect x="2" y="36" width="10" height="5" rx="2.5" fill="var(--arv-esc-gris)"/>' +
        '<rect x="-4" y="1" width="8" height="10" rx="2" fill="var(--arv-piel-d)"/>' +
        '<circle cx="-17" cy="-6" r="5" fill="var(--arv-pelo-d)"/><circle cx="17" cy="-6" r="5" fill="var(--arv-pelo-d)"/>' +
        '<circle cx="-15" cy="-11" r="2" fill="var(--arv-esc-amarillo)"/><circle cx="15" cy="-11" r="2" fill="var(--arv-esc-amarillo)"/>' +
        '<circle cx="0" cy="-8" r="15" fill="var(--arv-piel-c)"/>' +
        '<path d="M-15 -9 a15 15 0 0 1 30 0 q-4 -6 -10 -5 q-5 -4 -10 1 q-4 0 -10 4z" fill="var(--arv-pelo-d)"/>' +
        '</g>',
    // PRI: la bola del mundo sobre su soporte.
    mundo:
        '<g transform="scale(.88) translate(0 -41)">' +
        '<path d="M-26 -2 a28 28 0 0 0 52 14" fill="none" stroke="var(--arv-esc-gris)" stroke-width="3" stroke-linecap="round" transform="translate(0 -2)"/>' +
        '<rect x="-4" y="30" width="8" height="6" fill="var(--arv-esc-gris)"/>' +
        '<rect x="-16" y="35" width="32" height="6" rx="3" fill="var(--arv-esc-gris)"/>' +
        '<circle cx="0" cy="-4" r="27" fill="var(--arv-esc-cian)"/>' +
        '<path d="M-17 -16 q6 -9 15 -8 q4 4 -1 8 q-2 6 -8 5 q-3 5 -6 0z" fill="var(--arv-esc-verde)"/>' +
        '<path d="M4 -22 q10 0 14 7 q-3 6 -8 4 q-4 6 -3 14 q-6 3 -9 -4 q-2 -9 2 -14z" fill="var(--arv-esc-verde)"/>' +
        '<path d="M-6 10 q8 -3 12 3 q-2 8 -8 10 q-5 -4 -4 -13z" fill="var(--arv-esc-verde)"/>' +
        '<ellipse cx="0" cy="-4" rx="12" ry="27" fill="none" stroke="var(--arv-esc-blanco)" stroke-width="1" opacity=".5"/>' +
        '<path d="M-27 -4 H27" stroke="var(--arv-esc-blanco)" stroke-width="1" opacity=".5"/>' +
        '</g>',
    // ESO: una pila de libros.
    libros:
        '<g transform="scale(.9) translate(0 -32)">' +
        '<rect x="-34" y="14" width="68" height="18" rx="3" fill="var(--arv-esc-azul)"/>' +
        '<rect x="-30" y="19" width="62" height="8" rx="1.5" fill="var(--arv-esc-blanco)"/>' +
        '<rect x="-34" y="14" width="6" height="18" rx="2" fill="var(--arv-esc-gris)" opacity=".45"/>' +
        '<rect x="-27" y="-4" width="58" height="17" rx="3" fill="var(--arv-esc-verde)"/>' +
        '<rect x="-23" y="0" width="52" height="7" rx="1.5" fill="var(--arv-esc-blanco)"/>' +
        '<rect x="-27" y="-4" width="6" height="17" rx="2" fill="var(--arv-esc-gris)" opacity=".4"/>' +
        '<g transform="rotate(-7 0 -20)"><rect x="-22" y="-22" width="48" height="16" rx="3" fill="var(--arv-esc-amarillo)"/>' +
        '<rect x="-18" y="-18" width="42" height="7" rx="1.5" fill="var(--arv-esc-blanco)"/>' +
        '<rect x="-22" y="-22" width="6" height="16" rx="2" fill="var(--arv-esc-gris)" opacity=".4"/></g>' +
        '</g>',
    // BAC y generico: el birrete con su borla.
    birrete:
        '<g transform="scale(.88) translate(0 -32)">' +
        '<path d="M-22 4 V20 q22 14 44 0 V4 L0 14 Z" fill="var(--arv-esc-gris)"/>' +
        '<path d="M0 -26 L40 -8 L0 10 L-40 -8 Z" fill="var(--arv-esc-azul)"/>' +
        '<circle cx="0" cy="-8" r="3.4" fill="var(--arv-esc-amarillo)"/>' +
        '<path d="M0 -8 L30 -4 V20" fill="none" stroke="var(--arv-esc-amarillo)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<rect x="26.5" y="20" width="7" height="12" rx="3" fill="var(--arv-esc-amarillo)"/>' +
        '</g>',
    // CF: la escuadra y el compas.
    escuadra:
        '<g transform="scale(.82) translate(0 -38)">' +
        '<path fill-rule="evenodd" d="M-32 32 V-30 L20 32 Z M-21 21 V-6 L-1 21 Z" fill="var(--arv-esc-cian)"/>' +
        '<path d="M-32 32 H20" stroke="var(--arv-esc-blanco)" stroke-width="1.2" stroke-dasharray="2 4" opacity=".7"/>' +
        '<path d="M14 -34 L-2 32 M14 -34 L34 30" fill="none" stroke="var(--arv-esc-gris)" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M-2 32 l-1 5 M34 30 l1 5" stroke="var(--arv-esc-gris)" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M2 14 Q14 22 27 12" fill="none" stroke="var(--arv-esc-gris)" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="14" cy="-34" r="5.5" fill="var(--arv-esc-amarillo)"/>' +
        '</g>',
    // FPB, PCPI y PGS: llave y destornillador cruzados sobre un engranaje.
    herramientas:
        '<g transform="scale(.95) translate(0 -29)">' +
        '<g fill="var(--arv-esc-suave-oscuro)">' +
            '<circle r="19"/>' +
            '<rect x="-4.5" y="-27" width="9" height="54" rx="2"/><rect x="-27" y="-4.5" width="54" height="9" rx="2"/>' +
            '<g transform="rotate(45)"><rect x="-4.5" y="-27" width="9" height="54" rx="2"/><rect x="-27" y="-4.5" width="54" height="9" rx="2"/></g>' +
        '</g><circle r="8" fill="var(--arv-esc-suave)"/>' +
        // Cabeza de llave fija: circulo con la boca recortada en el propio trazado, que deja ver lo de detras.
        '<g transform="rotate(45)" fill="var(--arv-esc-azul)">' +
            '<rect x="-4" y="-18" width="8" height="52" rx="4"/>' +
            '<path d="M4.5 -33.49 A10.5 10.5 0 1 1 -4.5 -33.49 V-22 H4.5 Z"/>' +
        '</g>' +
        '<g transform="rotate(-45)">' +
            '<rect x="-5.5" y="12" width="11" height="26" rx="4" fill="var(--arv-esc-amarillo)"/>' +
            '<rect x="-2" y="-30" width="4" height="44" rx="1.5" fill="var(--arv-esc-gris)"/>' +
            '<path d="M-4 -30 L0 -38 L4 -30 Z" fill="var(--arv-esc-gris)"/>' +
        '</g>' +
        '</g>',
    // NR: la flecha que se bifurca en tres caminos.
    flechas:
        '<g transform="scale(.85) translate(0 -37)">' +
        '<path d="M0 34 V8" stroke="var(--arv-esc-azul)" stroke-width="6" stroke-linecap="round" fill="none"/>' +
        '<path d="M0 10 Q0 -4 -20 -12" stroke="var(--arv-esc-cian)" stroke-width="5" stroke-linecap="round" fill="none"/>' +
        '<path d="M-31 -18 L-12 -22 L-20 -4 Z" fill="var(--arv-esc-cian)"/>' +
        '<path d="M0 10 V-22" stroke="var(--arv-esc-verde)" stroke-width="5" stroke-linecap="round" fill="none"/>' +
        '<path d="M0 -38 L-11 -20 H11 Z" fill="var(--arv-esc-verde)"/>' +
        '<path d="M0 10 Q0 -4 20 -12" stroke="var(--arv-esc-amarillo)" stroke-width="5" stroke-linecap="round" fill="none"/>' +
        '<path d="M31 -18 L12 -22 L20 -4 Z" fill="var(--arv-esc-amarillo)"/>' +
        '</g>',
    // SERV: el autobus escolar.
    autobus:
        '<g transform="scale(.88) translate(0 -32)">' +
        '<rect x="-38" y="-20" width="76" height="42" rx="7" fill="var(--arv-esc-amarillo)"/>' +
        '<g fill="var(--arv-esc-blanco)"><rect x="-32" y="-14" width="14" height="14" rx="2.5"/><rect x="-14" y="-14" width="14" height="14" rx="2.5"/><rect x="4" y="-14" width="14" height="14" rx="2.5"/>' +
        '<rect x="22" y="-14" width="11" height="22" rx="2.5" fill="var(--arv-esc-suave)"/></g>' +
        '<rect x="-38" y="16" width="76" height="6" rx="3" fill="var(--arv-esc-gris)"/>' +
        '<circle cx="-24" cy="24" r="8" fill="var(--arv-esc-gris)"/><circle cx="-24" cy="24" r="3.2" fill="var(--arv-esc-claro)"/>' +
        '<circle cx="24" cy="24" r="8" fill="var(--arv-esc-gris)"/><circle cx="24" cy="24" r="3.2" fill="var(--arv-esc-claro)"/>' +
        '<circle cx="35" cy="10" r="2.4" fill="var(--arv-esc-tiza-amarilla)"/>' +
        '</g>',
    // EXTRA: el apreton de manos.
    manos:
        '<g transform="translate(0 -24.6)">' +
        '<g transform="rotate(-18)">' +
            '<rect x="-42" y="-9" width="14" height="22" rx="3" fill="var(--arv-esc-azul)"/>' +
            '<rect x="-30" y="-6" width="38" height="16" rx="7" fill="var(--arv-piel-c)"/>' +
        '</g>' +
        '<g transform="rotate(18)">' +
            '<rect x="28" y="-9" width="14" height="22" rx="3" fill="var(--arv-esc-verde)"/>' +
            '<rect x="-8" y="-6" width="38" height="16" rx="7" fill="var(--arv-piel-b)"/>' +
        '</g>' +
        '<rect x="-14" y="-8" width="28" height="20" rx="9" fill="var(--arv-piel-b)"/>' +
        '<path d="M-6 -6 V8 M0 -6 V10 M6 -6 V8" stroke="var(--arv-piel-d)" stroke-width="1.6" stroke-linecap="round"/>' +
        '</g>'
};

/** Variante (codigo SysEstudio) -> icono de AI_VIEWER_ESTUDIO_ICONOS. Cualquier otra: birrete. */
const AI_VIEWER_ESTUDIO_VARIANTES = {
    INF: 'nino', PRI: 'mundo', ESO: 'libros', BAC: 'birrete', CF: 'escuadra',
    FPB: 'herramientas', PCPI: 'herramientas', PGS: 'herramientas',
    NR: 'flechas', SERV: 'autobus', EXTRA: 'manos'
};

/**
 * Escena 'estudio': el icono que Alexia asocia al estudio (el de la Estructura educativa) de pie en
 * el centro de la orbita. Cuando la estrella cruza por delante, el icono respira: sube 1,5 px y
 * crece un 3 % y vuelve.
 * @param {string} variante - Codigo SysEstudio ('INF', 'PRI', 'ESO', ...); vacio o desconocido = birrete.
 * @returns {string}
 */
function aiViewerEscenaEstudio(variante) {
    const clave = AI_VIEWER_ESTUDIO_VARIANTES[String(variante || '').toUpperCase()] || 'birrete';
    return aiViewerEscena('estudio',
        '<g class="arv-motivo"><g transform="translate(80 100)">' + AI_VIEWER_ESTUDIO_ICONOS[clave] + '</g></g>');
}

/** Escenas disponibles por valor de loading-scene. */
const AI_VIEWER_ESCENAS = ['alumno', 'grupo', 'oferta', 'curso', 'ciclo', 'estudio'];

// =============================================================================
// GRAFICAS
// =============================================================================
// El servicio entrega cada grafica como un spec neutro (tipo, categorias, series) y el visor lo
// traduce a una option de ECharts. Las funciones de esta seccion son puras (spec + medidas ->
// option): no tocan el DOM, asi que el pintado, el redimensionado y la exportacion comparten la
// misma traduccion.

/**
 * ECharts, build completa (la `common` no trae radar ni heatmap). Se carga bajo demanda y una sola
 * vez por pagina, solo cuando una respuesta trae graficas: son ~1,1 MB (~360 KB comprimidos) y este
 * visor aparece en muchas paginas donde nadie las pide. El hash (campo `sri` de la API de cdnjs)
 * fija el contenido: al cambiar de version hay que cambiar tambien el hash.
 */
const AI_VIEWER_ECHARTS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/6.1.0/echarts.min.js';
const AI_VIEWER_ECHARTS_SRI = 'sha512-Uyq/AgtqFM4vT+unIGTDr4wMJDTUK9O5w2PXMQeBCSR8koqHpVz+qBmcQ+9Oeo5H+EmvT4pp/5QrsqhIbyjHTQ==';

/** Tipos de grafica que sabe pintar el visor (valores de `tipo` del spec). */
const AI_VIEWER_TIPOS_GRAFICA = ['barras', 'barras_horizontales', 'lineas', 'area', 'tarta', 'radar', 'heatmap'];

/** Marca que deja el servicio en el texto donde va una grafica: un parrafo con solo esto. */
const AI_VIEWER_MARCA_GRAFICA = /^\[\[grafica:([\w-]+)\]\]$/i;

/** Texto de una grafica que no se puede pintar, si el anfitrion no da `texts.chartUnavailable`. */
const AI_VIEWER_TEXTO_GRAFICA_NO_DISPONIBLE = 'Gr\u00e1fica no disponible';

/** Ancho (px) con el que se dibuja una grafica cuyo contenedor aun no tiene medida (seccion plegada). */
const AI_VIEWER_ANCHO_GRAFICA_DEFECTO = 480;

/**
 * Estilo de cada contenedor de grafica, en linea y no en la hoja: el documento exportado clona el
 * DOM con outerHTML, asi que lo que viaja en el propio elemento llega al papel y al PDF.
 */
const AI_VIEWER_ESTILO_GRAFICA = 'position:relative;width:100%;margin:4px 0 16px;' +
    'break-inside:avoid;page-break-inside:avoid;';
const AI_VIEWER_ESTILO_GRAFICA_NO_DISPONIBLE = 'margin:4px 0 16px;padding:14px 12px;text-align:center;' +
    'border:1px dashed var(--arv-border-suave);border-radius:var(--radius-md);' +
    'color:var(--arv-text-sec);font-size:var(--font-size-200);break-inside:avoid;page-break-inside:avoid;';

/**
 * Colores de las series: los tokens que ya usa el visor (azul primario primero). Cada entrada es
 * [token, respaldo]; el respaldo (el valor del token en colors.css) vale mientras la hoja del
 * componente no ha cargado y no hay token que leer.
 */
const AI_VIEWER_PALETA_GRAFICA = [
    ['--arv-esc-azul', '#285A92'],
    ['--color-yellow-700', '#CC9E43'],
    ['--color-green-700', '#4E7D36'],
    ['--arv-color-ia', '#6352C7'],
    ['--arv-esc-cian', '#3F96B4'],
    ['--color-red-500', '#D94A4A'],
    ['--arv-esc-gris', '#5C5C5C'],
    ['--arv-esc-suave-oscuro', '#91B3D7']
];

/**
 * Escala del heatmap, de menor a mayor: rojo, amarillo, verde. Tonos claros a proposito: el valor
 * se escribe dentro de la celda en texto oscuro y sobre los tonos plenos no llegaba al contraste.
 */
const AI_VIEWER_ESCALA_HEATMAP = [
    ['--color-red-400', '#E47777'],
    ['--color-yellow-400', '#F5D83E'],
    ['--color-green-400', '#9DC877']
];

/** Promesa compartida de la carga de ECharts: una sola descarga para todos los visores de la pagina. */
let aiViewerEchartsPromesa = null;

/**
 * Carga ECharts bajo demanda, mismo patron que html2pdf. Si ya esta en la pagina, lo reutiliza; si
 * la descarga falla, olvida la promesa para que la siguiente respuesta con graficas reintente.
 * @returns {Promise<Object>} El objeto global `echarts`.
 */
function aiViewerCargarECharts() {
    if (window.echarts) return Promise.resolve(window.echarts);
    if (aiViewerEchartsPromesa) return aiViewerEchartsPromesa;

    aiViewerEchartsPromesa = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = AI_VIEWER_ECHARTS_URL;
        script.integrity = AI_VIEWER_ECHARTS_SRI;
        script.crossOrigin = 'anonymous';
        // onload llega despues de ejecutar el script: si echarts no esta definido es que la pagina
        // tiene un cargador de modulos que lo ha capturado, y no hay nada que pintar con el.
        script.onload = () => (window.echarts ? resolve(window.echarts) : reject(new Error('ECharts no se ha definido.')));
        script.onerror = () => {
            script.remove();
            reject(new Error('No se ha podido cargar ECharts.'));
        };
        document.head.appendChild(script);
    }).catch((error) => {
        aiViewerEchartsPromesa = null;
        throw error;
    });

    return aiViewerEchartsPromesa;
}

// --- Normalizacion del spec --------------------------------------------------

/**
 * Indexa las claves de un objeto sin mayusculas, guiones ni espacios: `EjeX` (.NET), `ejeX` y
 * `eje_x` (chat-api) acaban todas en `ejex`.
 * @param {Object} objeto
 * @returns {Object}
 */
function aiViewerIndiceClaves(objeto) {
    const indice = {};
    Object.keys(objeto).forEach((clave) => {
        indice[clave.replace(/[\s_-]/g, '').toLowerCase()] = objeto[clave];
    });
    return indice;
}

/** Numero finito o null: `null`, texto vacio, booleanos y NaN significan "sin dato". */
function aiViewerNumeroONulo(valor) {
    if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean') return null;
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
}

/** Texto recortado, o '' si no hay valor. */
function aiViewerTextoONada(valor) {
    return valor === null || valor === undefined ? '' : String(valor).trim();
}

/**
 * Lleva una grafica recibida a la forma unica con la que trabaja el visor:
 * { id, tipo, titulo, categorias[], series[{nombre, valores[]}], ejeX, ejeY, min, max, error }.
 * Acepta PascalCase (JSON de .NET), camelCase y snake_case (chat-api), y la grafica envuelta en
 * `{ kind, spec }`. Los valores se alinean con las categorias: sobran o faltan celdas = null.
 * @param {Object} crudo
 * @returns {Object|null} null si no es un objeto.
 */
function aiViewerNormalizarGrafica(crudo) {
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;

    const envuelta = aiViewerIndiceClaves(crudo);
    const datos = (envuelta.spec && typeof envuelta.spec === 'object') ? aiViewerIndiceClaves(envuelta.spec) : envuelta;

    const categorias = (Array.isArray(datos.categorias) ? datos.categorias : [])
        .map(categoria => (categoria === null || categoria === undefined ? '' : String(categoria)));

    const series = (Array.isArray(datos.series) ? datos.series : [])
        .filter(serie => serie && typeof serie === 'object')
        .map((serie) => {
            const indice = aiViewerIndiceClaves(serie);
            const valores = Array.isArray(indice.valores) ? indice.valores : [];
            return {
                nombre: aiViewerTextoONada(indice.nombre),
                valores: categorias.map((categoria, posicion) => aiViewerNumeroONulo(valores[posicion]))
            };
        });

    return {
        id: aiViewerTextoONada(datos.id),
        // "Barras horizontales" y "barras-horizontales" valen como barras_horizontales.
        tipo: aiViewerTextoONada(datos.tipo).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s-]+/g, '_'),
        titulo: aiViewerTextoONada(datos.titulo),
        categorias: categorias,
        series: series,
        ejeX: aiViewerTextoONada(datos.ejex),
        ejeY: aiViewerTextoONada(datos.ejey),
        min: aiViewerNumeroONulo(datos.min),
        max: aiViewerNumeroONulo(datos.max),
        error: aiViewerTextoONada(datos.error)
    };
}

/**
 * Normaliza la lista de graficas de una respuesta; ignora las entradas que no son objetos.
 * @param {Object[]} graficas
 * @returns {Object[]}
 */
function aiViewerNormalizarGraficas(graficas) {
    return (Array.isArray(graficas) ? graficas : []).map(aiViewerNormalizarGrafica).filter(Boolean);
}

/**
 * Dice si una grafica ya normalizada no se puede pintar: viene con error, de un tipo que el visor
 * no conoce o sin datos.
 * @param {Object|null} spec
 * @returns {boolean}
 */
function aiViewerNoSePinta(spec) {
    return !spec || !!spec.error || AI_VIEWER_TIPOS_GRAFICA.indexOf(spec.tipo) < 0 ||
        !spec.categorias.length || !spec.series.length;
}

// --- Medidas de texto --------------------------------------------------------

let aiViewerLienzoMedida = null;

/**
 * Ancho en px de un texto con una fuente CSS ("600 13px Nunito"). Hace falta medir para decidir
 * cuantas lineas ocupa un titulo o una etiqueta y reservar su sitio antes de dibujar.
 */
function aiViewerAnchoTexto(texto, fuente) {
    if (!aiViewerLienzoMedida) {
        const lienzo = document.createElement('canvas');
        aiViewerLienzoMedida = lienzo.getContext ? lienzo.getContext('2d') : null;
    }
    if (!aiViewerLienzoMedida) return String(texto).length * 7;
    aiViewerLienzoMedida.font = fuente;
    return aiViewerLienzoMedida.measureText(String(texto)).width;
}

/** Acorta un texto con puntos suspensivos hasta que cabe en `ancho` px, en una sola linea. */
function aiViewerAcortar(texto, ancho, fuente) {
    let recorte = String(texto);
    if (aiViewerAnchoTexto(recorte, fuente) <= ancho) return recorte;
    while (recorte.length > 1 && aiViewerAnchoTexto(recorte + '\u2026', fuente) > ancho) {
        recorte = recorte.slice(0, -1);
    }
    return recorte.replace(/\s+$/, '') + '\u2026';
}

/**
 * Parte un texto en lineas de como mucho `ancho` px, por palabras. Si hace falta mas de
 * `maxLineas`, lo que sobra se junta en la ultima y se acorta con puntos suspensivos.
 * @returns {string[]}
 */
function aiViewerPartirTexto(texto, ancho, fuente, maxLineas) {
    let lineas = [];
    let actual = '';
    String(texto).split(/\s+/).filter(Boolean).forEach((palabra) => {
        const candidata = actual ? actual + ' ' + palabra : palabra;
        if (!actual || aiViewerAnchoTexto(candidata, fuente) <= ancho) {
            actual = candidata;
        } else {
            lineas.push(actual);
            actual = palabra;
        }
    });
    if (actual) lineas.push(actual);

    if (lineas.length > maxLineas) {
        lineas = lineas.slice(0, maxLineas - 1).concat(lineas.slice(maxLineas - 1).join(' '));
    }
    return lineas.map(linea => aiViewerAcortar(linea, ancho, fuente));
}

/** Formateador de numeros de las graficas: hasta dos decimales y la coma o el punto del idioma de la pagina. */
function aiViewerFormatoNumero() {
    let formateador;
    try {
        formateador = new Intl.NumberFormat(document.documentElement.lang || undefined, { maximumFractionDigits: 2 });
    } catch (error) {
        formateador = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    }
    return valor => (valor === null || valor === undefined || isNaN(valor) ? '' : formateador.format(valor));
}

// --- Traduccion spec -> option de ECharts --------------------------------------

/**
 * Parte comun de todas las graficas: titulo (partido en las lineas que quepan), tooltip, estilo
 * de texto y descripcion accesible. Devuelve ademas lo que ocupa el titulo, para que cada tipo
 * deje ese hueco arriba.
 * @returns {{option: Object, arriba: number, tam: number, formato: Function}}
 */
function aiViewerBaseGrafica(spec, ctx) {
    // En un panel lateral (400-480 px) todo baja un punto: ya no queda ancho para las etiquetas.
    const tam = ctx.ancho < 460 ? 11 : 12;
    const lineasTitulo = spec.titulo ? aiViewerPartirTexto(spec.titulo, ctx.ancho - 24, '600 13px ' + ctx.fuente, 3) : [];
    const arriba = lineasTitulo.length ? 6 + lineasTitulo.length * 18 + 8 : 10;

    // ECharts genera su descripcion accesible en ingles; con el titulo o las series se dice lo
    // mismo en el idioma del informe.
    const descripcion = spec.titulo || spec.series.map(serie => serie.nombre).filter(Boolean).slice(0, 6).join(', ');

    const option = {
        animation: false,
        color: ctx.colores,
        aria: { enabled: true },
        textStyle: { fontFamily: ctx.fuente, fontSize: tam, color: ctx.texto },
        tooltip: {
            confine: true,
            backgroundColor: '#FFFFFF',
            borderColor: ctx.linea,
            padding: [6, 10],
            textStyle: { fontFamily: ctx.fuente, fontSize: 12, color: ctx.texto },
            extraCssText: 'box-shadow:0 2px 8px rgba(0,0,0,.15);'
        }
    };
    if (descripcion) option.aria.label = { description: descripcion };
    if (lineasTitulo.length) {
        option.title = {
            text: lineasTitulo.join('\n'),
            left: 4,
            top: 4,
            textStyle: { fontFamily: ctx.fuente, fontSize: 13, fontWeight: 600, lineHeight: 18, color: ctx.texto }
        };
    }

    return { option: option, arriba: arriba, tam: tam, formato: aiViewerFormatoNumero() };
}

/**
 * Leyenda inferior. Los nombres se reparten en las filas que hagan falta (se miden para saber
 * cuantas son y dejarles sitio); pasadas cuatro filas se vuelve desplazable, de una sola.
 * @returns {{option: Object, alto: number}}
 */
function aiViewerLeyenda(nombres, ctx, tam) {
    const fuenteCss = tam + 'px ' + ctx.fuente;
    const disponible = ctx.ancho - 24;
    const separacion = 12;

    let filas = 1;
    let usado = 0;
    nombres.forEach((nombre) => {
        // Icono (14) + hueco hasta el texto (5) + texto.
        const ancho = 19 + aiViewerAnchoTexto(nombre, fuenteCss);
        if (usado && usado + separacion + ancho > disponible) {
            filas++;
            usado = ancho;
        } else {
            usado += (usado ? separacion : 0) + ancho;
        }
    });
    const desplazable = filas > 4;

    return {
        option: {
            type: desplazable ? 'scroll' : 'plain',
            data: nombres,
            bottom: 2,
            left: 'center',
            width: disponible,
            icon: 'roundRect',
            itemWidth: 14,
            itemHeight: 8,
            itemGap: separacion,
            pageIconSize: 10,
            textStyle: { fontFamily: ctx.fuente, fontSize: tam, color: ctx.textoSec }
        },
        alto: desplazable ? 30 : filas * (tam + 3) + (filas - 1) * separacion + 12
    };
}

/** Pone nombre a un eje, centrado y a `hueco` px de su linea. No hace nada si no hay nombre. */
function aiViewerNombreEje(eje, nombre, hueco, ctx, tam) {
    if (!nombre) return;
    eje.name = nombre;
    eje.nameLocation = 'middle';
    eje.nameGap = hueco;
    eje.nameTextStyle = { fontFamily: ctx.fuente, fontSize: tam, color: ctx.textoSec };
}

/**
 * Etiquetas del eje de categorias horizontal. Si caben, tal cual; si no, en dos lineas; y si el
 * hueco por categoria es muy estrecho, inclinadas y acortadas. Se decide aqui (y no con las
 * opciones automaticas de ECharts) porque hay que saber el alto que ocupan para dimensionar la grafica.
 * @returns {{etiquetas: string[], rotar: number, alto: number}}
 */
function aiViewerEtiquetasEjeX(categorias, anchoUtil, tam, fuenteCss) {
    const hueco = anchoUtil / Math.max(categorias.length, 1);
    const mayor = Math.max.apply(null, categorias.map(categoria => aiViewerAnchoTexto(categoria, fuenteCss)).concat(0));
    const interlineado = tam + 3;

    if (mayor <= hueco - 6) {
        return { etiquetas: categorias, rotar: 0, alto: tam + 10 };
    }
    // En dos lineas solo si cada palabra cabe entera: partir "Matematicas" por la mitad es peor que inclinarla.
    const palabraLarga = Math.max.apply(null, categorias.map(categoria => Math.max.apply(null,
        categoria.split(/\s+/).map(palabra => aiViewerAnchoTexto(palabra, fuenteCss)).concat(0))).concat(0));
    if (palabraLarga <= hueco - 6) {
        const lineas = categorias.map(categoria => aiViewerPartirTexto(categoria, hueco - 6, fuenteCss, 2));
        const filas = Math.max.apply(null, lineas.map(partes => partes.length));
        return { etiquetas: lineas.map(partes => partes.join('\n')), rotar: 0, alto: filas * interlineado + 8 };
    }

    const tope = 96;
    const grados = 40;
    return {
        etiquetas: categorias.map(categoria => aiViewerAcortar(categoria, tope, fuenteCss)),
        rotar: grados,
        alto: Math.ceil(Math.min(mayor, tope) * Math.sin(grados * Math.PI / 180) + tam) + 10
    };
}

/**
 * Etiquetas del eje de categorias vertical (barras horizontales y filas del heatmap): una linea,
 * acortada a `proporcion` del ancho para dejar sitio a la grafica.
 * @returns {{etiquetas: string[], ancho: number}}
 */
function aiViewerEtiquetasEjeY(categorias, ctx, fuenteCss, proporcion) {
    const tope = Math.round(ctx.ancho * proporcion);
    const mayor = Math.max.apply(null, categorias.map(categoria => aiViewerAnchoTexto(categoria, fuenteCss)).concat(0));
    const ancho = Math.min(Math.ceil(mayor), tope);
    return { etiquetas: categorias.map(categoria => aiViewerAcortar(categoria, ancho, fuenteCss)), ancho: ancho };
}

/**
 * Barras, barras horizontales, lineas y area: una grafica cartesiana con un eje de categorias y
 * un eje de valores, y tantas series como traiga el spec.
 * @returns {{option: Object, alto: number}}
 */
function aiViewerGraficaCartesiana(spec, ctx, comun) {
    const option = comun.option;
    const tam = comun.tam;
    const formato = comun.formato;
    const horizontal = spec.tipo === 'barras_horizontales';
    const esBarra = spec.tipo === 'barras' || horizontal;
    const n = spec.categorias.length;
    const ns = spec.series.length;
    const fuenteCss = tam + 'px ' + ctx.fuente;

    const leyenda = ns > 1 ? aiViewerLeyenda(spec.series.map(serie => serie.nombre), ctx, tam) : null;
    const bajoLeyenda = leyenda ? leyenda.alto + 4 : 6;
    // El eje de categorias es el horizontal salvo en las barras horizontales.
    const nombreCategorias = horizontal ? spec.ejeY : spec.ejeX;
    const nombreValores = horizontal ? spec.ejeX : spec.ejeY;

    const margenIzq = 8;
    const margenDer = 16;
    const anchoEtiquetaValor = 30;
    const reservaIzq = (horizontal ? nombreCategorias : nombreValores) ? tam + 16 : 0;

    let etiquetas;
    let etiquetasY = null;
    let altoTrazado;
    if (horizontal) {
        etiquetasY = aiViewerEtiquetasEjeY(spec.categorias, ctx, fuenteCss, 0.4);
        etiquetas = { etiquetas: etiquetasY.etiquetas, rotar: 0, alto: 0 };
        const paso = ns > 1 ? ns * 13 + 10 : 26;
        altoTrazado = Math.min(Math.max(150, n * paso), 560);
    } else {
        const anchoUtil = ctx.ancho - margenIzq - margenDer - anchoEtiquetaValor - reservaIzq;
        etiquetas = aiViewerEtiquetasEjeX(spec.categorias, anchoUtil, tam, fuenteCss);
        altoTrazado = 190;
    }

    const reservaAbajo = (horizontal ? nombreValores : nombreCategorias) ? tam + 14 : 0;
    const altoEjeInferior = horizontal ? tam + 10 : etiquetas.alto;

    // Valor sobre cada barra solo si hay hueco: con muchas, las cifras se pisan.
    const huecoBarra = horizontal ? Infinity : (ctx.ancho - 60) / (n * ns);
    const conValores = esBarra && n * ns <= 18 && huecoBarra >= 26;

    const ejeCategorias = {
        type: 'category',
        data: spec.categorias,
        inverse: horizontal,
        boundaryGap: true,
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: ctx.linea } },
        axisLabel: {
            interval: 0,
            hideOverlap: true,
            rotate: etiquetas.rotar,
            fontSize: tam,
            color: ctx.textoSec,
            lineHeight: tam + 3,
            formatter: (valor, posicion) => etiquetas.etiquetas[posicion]
        }
    };
    const ejeValores = {
        type: 'value',
        splitLine: { lineStyle: { color: ctx.linea } },
        axisLabel: { fontSize: tam, color: ctx.textoSec, formatter: valor => formato(valor) }
    };
    if (spec.min !== null) ejeValores.min = spec.min;
    if (spec.max !== null) ejeValores.max = spec.max;

    if (horizontal) {
        aiViewerNombreEje(ejeCategorias, nombreCategorias, etiquetasY.ancho + 10, ctx, tam);
        aiViewerNombreEje(ejeValores, nombreValores, altoEjeInferior + 4, ctx, tam);
    } else {
        aiViewerNombreEje(ejeCategorias, nombreCategorias, altoEjeInferior + 4, ctx, tam);
        aiViewerNombreEje(ejeValores, nombreValores, anchoEtiquetaValor + 6, ctx, tam);
    }

    option.xAxis = horizontal ? ejeValores : ejeCategorias;
    option.yAxis = horizontal ? ejeCategorias : ejeValores;
    option.grid = {
        left: margenIzq + reservaIzq,
        right: margenDer,
        top: comun.arriba,
        bottom: bajoLeyenda + reservaAbajo,
        containLabel: true
    };
    option.tooltip.trigger = 'axis';
    option.tooltip.axisPointer = { type: esBarra ? 'shadow' : 'line' };
    option.tooltip.valueFormatter = valor => (valor === null || valor === undefined ? '-' : formato(valor));

    option.series = spec.series.map((serie) => {
        if (esBarra) {
            const barras = {
                type: 'bar',
                name: serie.nombre,
                data: serie.valores,
                barMaxWidth: horizontal ? 20 : 32,
                itemStyle: { borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
                emphasis: { focus: 'series' }
            };
            if (conValores) {
                barras.label = {
                    show: true,
                    position: horizontal ? 'right' : 'top',
                    fontSize: tam - 1,
                    color: ctx.textoSec,
                    formatter: parametros => formato(parametros.value)
                };
            }
            return barras;
        }
        const linea = {
            type: 'line',
            name: serie.nombre,
            data: serie.valores,
            symbol: 'circle',
            symbolSize: 6,
            showSymbol: n <= 24,
            connectNulls: false,
            lineStyle: { width: 2 },
            emphasis: { focus: 'series' }
        };
        if (spec.tipo === 'area') linea.areaStyle = { opacity: 0.16 };
        return linea;
    });
    if (leyenda) option.legend = leyenda.option;

    return {
        option: option,
        alto: Math.round(comun.arriba + altoTrazado + altoEjeInferior + bajoLeyenda + reservaAbajo + 8)
    };
}

/**
 * Tarta (en anillo, que lee mejor en estrecho): usa la primera serie; los valores sin dato o no
 * positivos no son porcion y se dejan fuera.
 * @returns {{option: Object, alto: number}}
 */
function aiViewerGraficaTarta(spec, ctx, comun) {
    const option = comun.option;
    const tam = comun.tam;
    const formato = comun.formato;
    const serie = spec.series[0];

    const datos = [];
    spec.categorias.forEach((categoria, posicion) => {
        const valor = serie.valores[posicion];
        if (valor !== null && valor > 0) datos.push({ name: categoria, value: valor });
    });
    if (!datos.length) throw new Error('La tarta no tiene valores positivos.');

    option.tooltip.trigger = 'item';
    option.tooltip.formatter = parametros => parametros.marker + AiResponseViewer._escapar(parametros.name) +
        ': <b>' + formato(parametros.value) + '</b> (' + formato(Math.round(parametros.percent * 10) / 10) + '%)';
    const leyenda = aiViewerLeyenda(datos.map(dato => dato.name), ctx, tam);
    option.legend = leyenda.option;

    // Radio en px: a los lados queda sitio para el porcentaje de cada porcion.
    const radio = Math.max(60, Math.min(Math.round(ctx.ancho / 2 - 56), 110));
    option.series = [{
        type: 'pie',
        name: serie.nombre,
        radius: [Math.round(radio * 0.55), radio],
        center: ['50%', comun.arriba + radio + 22],
        data: datos,
        avoidLabelOverlap: true,
        minShowLabelAngle: 12,
        itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
        label: {
            show: true,
            position: 'outside',
            formatter: parametros => formato(Math.round(parametros.percent * 10) / 10) + '%',
            fontSize: tam - 1,
            color: ctx.textoSec
        },
        labelLine: { length: 8, length2: 6 }
    }];

    return { option: option, alto: Math.round(comun.arriba + 2 * radio + 44 + leyenda.alto + 4) };
}

/**
 * Radar: las categorias son los ejes y cada serie un poligono. El maximo de los ejes es el del
 * spec o, sin el, el mayor dato; el minimo, el del spec o 0.
 * @returns {{option: Object, alto: number}}
 */
function aiViewerGraficaRadar(spec, ctx, comun) {
    const option = comun.option;
    const tam = comun.tam;
    const formato = comun.formato;
    const fuenteCss = tam + 'px ' + ctx.fuente;

    const datos = [];
    spec.series.forEach(serie => serie.valores.forEach((valor) => { if (valor !== null) datos.push(valor); }));
    const minimo = spec.min !== null ? spec.min : Math.min.apply(null, datos.concat(0));
    let maximo = spec.max !== null ? spec.max : Math.max.apply(null, datos.concat(minimo));
    if (maximo <= minimo) maximo = minimo + 1;

    // Radio en px: a cada lado queda sitio para el nombre del eje, que se parte en dos lineas
    // y se acorta a ese hueco.
    const radio = Math.max(56, Math.min(Math.round(ctx.ancho / 2 - 90), 150));
    const anchoNombre = Math.max(56, Math.round(ctx.ancho / 2 - radio - 6));
    const leyenda = spec.series.length > 1 ? aiViewerLeyenda(spec.series.map(serie => serie.nombre), ctx, tam) : null;

    option.radar = {
        shape: 'polygon',
        radius: radio,
        center: ['50%', comun.arriba + radio + 30],
        splitNumber: 5,
        indicator: spec.categorias.map(categoria => ({
            name: aiViewerPartirTexto(categoria, anchoNombre, fuenteCss, 2).join('\n'),
            min: minimo,
            max: maximo
        })),
        axisName: { fontFamily: ctx.fuente, fontSize: tam, color: ctx.textoSec },
        axisLine: { lineStyle: { color: ctx.linea } },
        splitLine: { lineStyle: { color: ctx.linea } },
        splitArea: { show: false }
    };
    option.tooltip.trigger = 'item';
    option.tooltip.formatter = (parametros) => {
        const valores = Array.isArray(parametros.value) ? parametros.value : [];
        const filas = spec.categorias.map((categoria, posicion) => AiResponseViewer._escapar(categoria) +
            ': <b>' + (valores[posicion] === null || valores[posicion] === undefined ? '-' : formato(valores[posicion])) + '</b>');
        return parametros.marker + '<b>' + AiResponseViewer._escapar(parametros.name) + '</b><br/>' + filas.join('<br/>');
    };
    option.series = [{
        type: 'radar',
        symbol: 'circle',
        symbolSize: 5,
        emphasis: { focus: 'series' },
        data: spec.series.map((serie, posicion) => {
            const color = ctx.colores[posicion % ctx.colores.length];
            return {
                name: serie.nombre,
                value: serie.valores,
                itemStyle: { color: color },
                lineStyle: { color: color, width: 2 },
                areaStyle: { color: color, opacity: 0.14 }
            };
        })
    }];
    if (leyenda) option.legend = leyenda.option;

    return { option: option, alto: Math.round(comun.arriba + 2 * radio + 60 + (leyenda ? leyenda.alto + 4 : 8)) };
}

/**
 * Heatmap: las categorias son las columnas y cada serie una fila. Las celdas sin dato se dejan
 * vacias. La escala de color va de `min` a `max` del spec (se ensancha si algun dato queda fuera).
 * @returns {{option: Object, alto: number}}
 */
function aiViewerGraficaHeatmap(spec, ctx, comun) {
    const option = comun.option;
    const tam = comun.tam;
    const formato = comun.formato;
    const fuenteCss = tam + 'px ' + ctx.fuente;
    const columnas = spec.categorias;
    const filas = spec.series.map(serie => serie.nombre);

    const celdas = [];
    let menor = Infinity;
    let mayor = -Infinity;
    spec.series.forEach((serie, y) => serie.valores.forEach((valor, x) => {
        if (valor === null) return;
        celdas.push([x, y, valor]);
        menor = Math.min(menor, valor);
        mayor = Math.max(mayor, valor);
    }));
    if (!celdas.length) throw new Error('El heatmap no tiene ningun dato.');

    const minimo = spec.min !== null ? Math.min(spec.min, menor) : menor;
    let maximo = spec.max !== null ? Math.max(spec.max, mayor) : mayor;
    if (maximo <= minimo) maximo = minimo + 1;

    const etiquetasFila = aiViewerEtiquetasEjeY(filas, ctx, fuenteCss, 0.32);
    const reservaIzq = spec.ejeY ? tam + 16 : 0;
    const anchoTrazado = ctx.ancho - 8 - reservaIzq - 12 - etiquetasFila.ancho - 10;
    const etiquetasColumna = aiViewerEtiquetasEjeX(columnas, anchoTrazado, tam, fuenteCss);
    const reservaAbajo = spec.ejeX ? tam + 14 : 0;

    const altoCelda = filas.length > 40 ? 12 : 18;
    const altoTrazado = filas.length * altoCelda;
    const mostrarValor = anchoTrazado / columnas.length >= 24 && altoCelda >= 16;
    const barraMapa = 42;

    const ejeColumnas = {
        type: 'category',
        data: columnas,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
            interval: 0,
            hideOverlap: true,
            rotate: etiquetasColumna.rotar,
            fontSize: tam,
            color: ctx.textoSec,
            lineHeight: tam + 3,
            formatter: (valor, posicion) => etiquetasColumna.etiquetas[posicion]
        }
    };
    const ejeFilas = {
        type: 'category',
        data: filas,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
            interval: 0,
            hideOverlap: true,
            fontSize: tam,
            color: ctx.textoSec,
            formatter: (valor, posicion) => etiquetasFila.etiquetas[posicion]
        }
    };
    aiViewerNombreEje(ejeColumnas, spec.ejeX, etiquetasColumna.alto + 4, ctx, tam);
    aiViewerNombreEje(ejeFilas, spec.ejeY, etiquetasFila.ancho + 10, ctx, tam);

    option.xAxis = ejeColumnas;
    option.yAxis = ejeFilas;
    option.grid = { left: 8 + reservaIzq, right: 12, top: comun.arriba, bottom: barraMapa + reservaAbajo, containLabel: true };
    option.visualMap = {
        type: 'continuous',
        dimension: 2,
        min: minimo,
        max: maximo,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        itemWidth: 12,
        itemHeight: Math.max(80, Math.min(180, ctx.ancho - 140)),
        calculable: false,
        text: [formato(maximo), formato(minimo)],
        textStyle: { fontFamily: ctx.fuente, fontSize: tam - 1, color: ctx.textoSec },
        inRange: { color: ctx.escala }
    };
    option.tooltip.trigger = 'item';
    option.tooltip.formatter = parametros => AiResponseViewer._escapar(filas[parametros.value[1]]) + ' \u00b7 ' +
        AiResponseViewer._escapar(columnas[parametros.value[0]]) + '<br/><b>' + formato(parametros.value[2]) + '</b>';
    option.series = [{
        type: 'heatmap',
        data: celdas,
        progressive: 0,
        itemStyle: { borderColor: '#FFFFFF', borderWidth: 1 },
        label: {
            show: mostrarValor,
            fontSize: tam - 1,
            color: ctx.texto,
            formatter: parametros => formato(parametros.value[2])
        },
        emphasis: { itemStyle: { borderColor: ctx.texto, borderWidth: 1 } }
    }];

    return {
        option: option,
        alto: Math.min(1100, Math.round(comun.arriba + altoTrazado + etiquetasColumna.alto + reservaAbajo + barraMapa + 8))
    };
}

/**
 * Traduce un spec normalizado a la option de ECharts y calcula el alto que necesita la grafica.
 * @param {Object} spec - Salida de aiViewerNormalizarGrafica, ya validada con aiViewerNoSePinta.
 * @param {{ancho: number, fuente: string, colores: string[], escala: string[], texto: string,
 *          textoSec: string, linea: string}} ctx - Ancho del contenedor y tema.
 * @returns {{option: Object, alto: number}}
 */
function aiViewerOpcionGrafica(spec, ctx) {
    const comun = aiViewerBaseGrafica(spec, ctx);
    switch (spec.tipo) {
        case 'tarta': return aiViewerGraficaTarta(spec, ctx, comun);
        case 'radar': return aiViewerGraficaRadar(spec, ctx, comun);
        case 'heatmap': return aiViewerGraficaHeatmap(spec, ctx, comun);
        default: return aiViewerGraficaCartesiana(spec, ctx, comun);
    }
}

// =============================================================================
// BARRA DE PROGRESO SIMULADA
// =============================================================================
// Bajo la escena de carga, un cohete viaja hacia un planeta con anillo. El servicio no devuelve
// progreso real, asi que el avance sale de una curva sobre la estimacion del anfitrion
// (loading-estimate): rapida al principio y cada vez mas lenta, sin llegar nunca a la meta por si
// sola. Solo la respuesta la completa. El pintado va por clases (--arv-esc-* en el CSS, seccion 04).

/** La barra llega al 85 % a los T segundos y se acerca al 95 % sin alcanzarlo. */
const AI_VIEWER_BARRA_TOPE = 0.95;
const AI_VIEWER_BARRA_K = 2.25;

/** Tras la respuesta: tramo final hasta el 100 %, pausa con la meta cumplida y cambio de color del anillo. */
const AI_VIEWER_BARRA_COMPLETAR_MS = 350;
const AI_VIEWER_BARRA_PAUSA_MS = 400;
const AI_VIEWER_BARRA_ANILLO_S = 0.3;

/**
 * Progreso simulado a los `segundos` de empezar la carga.
 * @param {number} segundos - Tiempo transcurrido.
 * @param {number} estimacion - Segundos que se espera que tarde la respuesta.
 * @returns {number} Entre 0 y AI_VIEWER_BARRA_TOPE.
 */
function aiViewerProgresoSimulado(segundos, estimacion) {
    if (segundos <= 0 || !(estimacion > 0)) return 0;
    return AI_VIEWER_BARRA_TOPE * (1 - Math.exp(-AI_VIEWER_BARRA_K * segundos / estimacion));
}

/** Suavizado de entrada y salida (0..1 a 0..1) para los cambios de la llegada. */
function aiViewerSuave(x) {
    const q = Math.min(1, Math.max(0, x));
    return q * q * (3 - 2 * q);
}

/** Frenada final del tramo que completa la barra. */
function aiViewerSalida(x) {
    const q = Math.min(1, Math.max(0, x));
    return 1 - Math.pow(1 - q, 3);
}

/** Estrella de cuatro puntas del mismo trazo curvo que las chispas de la orbita, de radio r. */
function aiViewerEstrella4(r) {
    const c = (r * 0.16).toFixed(2);
    return 'M0 ' + (-r) + 'Q' + c + ' -' + c + ' ' + r + ' 0Q' + c + ' ' + c + ' 0 ' + r +
        'Q-' + c + ' ' + c + ' ' + (-r) + ' 0Q-' + c + ' -' + c + ' 0 ' + (-r) + 'Z';
}

/**
 * SVG de la barra: viewBox 160 x 36, el ancho de la escena. La pista va de x 8 a 127; el planeta
 * (centro 145,18) tiene el anillo en dos capas, una detras del disco y otra delante, como la orbita
 * de la escena, y cada capa existe en amarillo y en morado para cruzarlos al llegar.
 * @returns {string}
 */
function aiViewerBarraProgreso() {
    const arcoAtras = 'M-14.5 0A14.5 4.2 0 0 1 14.5 0';
    const arcoDelante = 'M14.5 0A14.5 4.2 0 0 1 -14.5 0';
    const chispas = [0, 1, 2].map((i) =>
        '<path class="arv-bp-chispa arv-bp-chispa--' + i + '" d="' + aiViewerEstrella4(3.7) + '" opacity="0"/>').join('');
    return '<svg class="arv-progreso" viewBox="0 0 160 36" aria-hidden="true" focusable="false">' +
        '<line class="arv-bp-pista" x1="8" y1="18" x2="127" y2="18" stroke-width="1.5" stroke-dasharray="0 4.4"/>' +
        '<circle class="arv-bp-origen" cx="8" cy="18" r="2.5"/>' +
        '<line class="arv-bp-hecha" x1="8" y1="18" x2="8" y2="18" stroke-width="2.4"/>' +
        '<g transform="translate(145 18) rotate(-18)">' +
            '<path class="arv-bp-anillo arv-bp-anillo--amarillo" data-capa="atras" d="' + arcoAtras + '" stroke-width="1.7" opacity=".6"/>' +
            '<path class="arv-bp-anillo arv-bp-anillo--ia" data-capa="atras" d="' + arcoAtras + '" stroke-width="1.7" opacity="0"/>' +
        '</g>' +
        '<g transform="translate(145 18)">' +
            '<circle class="arv-bp-disco" r="9.5"/>' +
            '<circle class="arv-bp-crater" cx="2.6" cy="-3.4" r="2" opacity=".75"/>' +
            '<circle class="arv-bp-crater" cx="4.6" cy="1.6" r="1.2" opacity=".75"/>' +
            '<circle class="arv-bp-crater" cx="-3.6" cy="-.4" r=".9" opacity=".6"/>' +
            '<path class="arv-bp-brillo" d="M-6.8 -3.6A7.8 7.8 0 0 1 -2.6 -7.4" stroke-width="1.5"/>' +
        '</g>' +
        '<g transform="translate(145 18) rotate(-18)">' +
            '<path class="arv-bp-anillo arv-bp-anillo--amarillo" data-capa="delante" d="' + arcoDelante + '" stroke-width="2"/>' +
            '<path class="arv-bp-anillo arv-bp-anillo--ia" data-capa="delante" d="' + arcoDelante + '" stroke-width="2" opacity="0"/>' +
        '</g>' +
        chispas +
        '<g class="arv-bp-cohete">' +
            '<path class="arv-bp-llama" d="M-5.2 -1.5L-10.2 0L-5.2 1.5Z"/>' +
            '<path class="arv-bp-aleta" d="M-4.6 -3L-8.2 -5.6L-2.2 -3.2Z"/>' +
            '<path class="arv-bp-aleta" d="M-4.6 3L-8.2 5.6L-2.2 3.2Z"/>' +
            '<path class="arv-bp-cuerpo" d="M7.4 0C3.6 -3.5 -1 -3.5 -5.2 -3L-5.2 3C-1 3.5 3.6 3.5 7.4 0Z"/>' +
            '<circle class="arv-bp-ventana" cx="1.2" cy="0" r="1.45" stroke-width=".6"/>' +
        '</g>' +
        '</svg>';
}

class AiResponseViewer extends WidgetBase {
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });

        /** @private Textos traducidos que aporta el anfitrion. */
        this._texts = {};
        /** @private Ultima respuesta pintada: { markdown, traces, charts }. */
        this._result = null;
        /** @private Mensaje del estado error/empty. */
        this._mensaje = '';
        /** @private Estructura montada una sola vez. */
        this._initialized = false;

        /** @private Graficas pintadas ahora mismo: [{ chart, el, spec, ancho }]. */
        this._graficas = [];
        /** @private ResizeObserver compartido por las graficas (se crea al pintar la primera). */
        this._observadorGraficas = null;
        /** @private Cuenta los repintados del cuerpo: descarta la carga de ECharts de uno anterior. */
        this._generacionGraficas = 0;
        /** @private Promesa que se cumple cuando las graficas pendientes ya estan dibujadas. */
        this._graficasListas = null;

        /** @private Barra de progreso en marcha, o null: { svg, clave, estimacion, t0, piso, cierre, raf, refs }. */
        this._barra = null;
        /** @private Resultado que espera a que la barra llegue a la meta, y el temporizador que lo pinta. */
        this._cierreAplicar = null;
        this._cierreTimer = 0;
        this._alFotograma = (ahora) => this._tickBarra(ahora);
    }

    get componentCssName() {
        return 'ai-response-viewer.css';
    }

    static get observedAttributes() {
        return [...super.observedAttributes, 'heading', 'subtitle', 'state', 'loading-text',
                'loading-hint', 'loading-scene', 'loading-variant', 'loading-estimate', 'hide-notice',
                'document-name', 'report-name', 'logo-src', 'loading-skeleton',
                'collapsible-sections', 'open-sections'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback(name, oldValue, newValue);
        // Un cambio de estado de fuera anula el resultado que esperaba a la barra.
        if (name === 'state' && oldValue !== newValue) this._cancelarCierre();
        if (oldValue !== newValue && this._initialized) {
            this._render();
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this._montarEstructura();
        this._render();
        this._initialized = true;
    }

    /**
     * La hoja del componente carga en asincrono (WidgetBase). Una respuesta pintada antes de que
     * llegue -el informe en cache del panel se pinta nada mas crear el visor- mide la cabecera
     * sin estilos, y con esa medida el indice queda fuera de la vista.
     */
    onStylesLoaded() {
        const card = this.shadow.querySelector('.arv-card');
        if (card) this._fijarAltoCabecera(card);

        // Una grafica dibujada antes de la hoja uso la tipografia y los colores de reserva.
        this._graficas.forEach((entrada) => {
            this._aplicarOpcionGrafica(entrada, Math.round(entrada.el.clientWidth) || entrada.ancho);
        });
    }

    disconnectedCallback() {
        // Un resultado que esperaba a la barra se pinta ya: si el visor vuelve a conectarse, no se pierde.
        const pendiente = this._cierreAplicar;
        this._cancelarCierre();
        this._detenerBarra();
        if (pendiente) pendiente();

        super.disconnectedCallback();
        this._liberarGraficas();
    }

    // =========================================================================
    // GETTERS / SETTERS
    // =========================================================================

    get heading() { return this.getAttribute('heading') || ''; }
    set heading(val) { val ? this.setAttribute('heading', val) : this.removeAttribute('heading'); }

    get subtitle() { return this.getAttribute('subtitle') || ''; }
    set subtitle(val) { val ? this.setAttribute('subtitle', val) : this.removeAttribute('subtitle'); }

    /** @type {'idle'|'loading'|'success'|'error'|'empty'} */
    get state() {
        const valor = this.getAttribute('state');
        return AI_VIEWER_ESTADOS.indexOf(valor) >= 0 ? valor : 'idle';
    }
    set state(val) {
        AI_VIEWER_ESTADOS.indexOf(val) >= 0 ? this.setAttribute('state', val) : this.removeAttribute('state');
    }

    get loadingText() { return this.getAttribute('loading-text') || ''; }
    set loadingText(val) { val ? this.setAttribute('loading-text', val) : this.removeAttribute('loading-text'); }

    get loadingHint() { return this.getAttribute('loading-hint') || ''; }
    set loadingHint(val) { val ? this.setAttribute('loading-hint', val) : this.removeAttribute('loading-hint'); }

    /** @type {''|'alumno'|'grupo'|'oferta'|'curso'|'ciclo'|'estudio'} Escena animada de carga; vacio = sin animacion. */
    get loadingScene() {
        const valor = this.getAttribute('loading-scene');
        return AI_VIEWER_ESCENAS.indexOf(valor) >= 0 ? valor : '';
    }
    set loadingScene(val) {
        AI_VIEWER_ESCENAS.indexOf(val) >= 0 ? this.setAttribute('loading-scene', val) : this.removeAttribute('loading-scene');
    }

    /**
     * Variante de la escena. En 'alumno': 'chica' (por defecto) | 'chico'. En 'estudio': el codigo
     * SysEstudio ('INF' | 'PRI' | 'ESO' | 'BAC' | 'CF' | 'FPB' | 'PCPI' | 'PGS' | 'NR' | 'SERV' |
     * 'EXTRA'; vacio o desconocido = birrete). Las demas escenas la ignoran.
     * @type {string}
     */
    get loadingVariant() {
        const val = this.getAttribute('loading-variant') || '';
        if (this.loadingScene === 'estudio') return val.toUpperCase();
        return val === 'chico' ? 'chico' : 'chica';
    }
    set loadingVariant(val) { val ? this.setAttribute('loading-variant', val) : this.removeAttribute('loading-variant'); }

    /** @type {number} Segundos que se espera que tarde la respuesta; 0 = sin barra de progreso. */
    get loadingEstimate() {
        const valor = Number(this.getAttribute('loading-estimate'));
        return valor > 0 ? valor : 0;
    }
    set loadingEstimate(val) {
        val > 0 ? this.setAttribute('loading-estimate', String(val)) : this.removeAttribute('loading-estimate');
    }

    get hideNotice() { return this.hasAttribute('hide-notice'); }
    set hideNotice(val) { val ? this.setAttribute('hide-notice', '') : this.removeAttribute('hide-notice'); }

    /**
     * Dibuja bajo el mensaje de carga el esqueleto de lo que va a llegar (bloque de resumen y unas
     * secciones). Opt-in: solo tiene sentido cuando la respuesta es un informe con secciones y la
     * espera es larga; para una respuesta corta sobraria.
     * @type {boolean}
     */
    get loadingSkeleton() { return this.hasAttribute('loading-skeleton'); }
    set loadingSkeleton(val) { val ? this.setAttribute('loading-skeleton', '') : this.removeAttribute('loading-skeleton'); }

    /**
     * Pliega las secciones del informe (cada `h2` de primer nivel y su contenido). Opt-in por lo
     * mismo: una respuesta de dos parrafos no gana nada plegandose.
     * @type {boolean}
     */
    get collapsibleSections() { return this.hasAttribute('collapsible-sections'); }
    set collapsibleSections(val) { val ? this.setAttribute('collapsible-sections', '') : this.removeAttribute('collapsible-sections'); }

    /**
     * Cuantas secciones quedan abiertas desde arriba cuando se pliegan (sin contar el resumen, que
     * nunca se pliega). Por defecto una: la primera de datos.
     * @type {number}
     */
    get openSections() {
        const valor = parseInt(this.getAttribute('open-sections'), 10);
        return isNaN(valor) || valor < 0 ? 1 : valor;
    }
    set openSections(val) {
        (val === null || val === undefined) ? this.removeAttribute('open-sections') : this.setAttribute('open-sections', String(val));
    }

    /**
     * Nombre base del fichero al imprimir o guardar como PDF. Solo el anfitrion sabe de que
     * objeto habla el informe, asi que es el quien lo aporta.
     * @type {string}
     */
    get documentName() { return this.getAttribute('document-name') || ''; }
    set documentName(val) { val ? this.setAttribute('document-name', val) : this.removeAttribute('document-name'); }

    /**
     * Nombre del informe ("Situacion 360 IA"): la segunda linea del titulo, debajo del nombre del
     * objeto. Lo aporta el anfitrion porque el visor es generico y no sabe que informe presenta.
     * Tambien completa el nombre del fichero cuando no se ha dado `document-name`.
     * @type {string}
     */
    get reportName() { return this.getAttribute('report-name') || ''; }
    set reportName(val) { val ? this.setAttribute('report-name', val) : this.removeAttribute('report-name'); }

    /**
     * Logo que acompana al titulo del documento que se imprime o se guarda como PDF, normalmente
     * el del centro. En pantalla no sale: alli el visor no se titula.
     * @type {string}
     */
    get logoSrc() { return this.getAttribute('logo-src') || ''; }
    set logoSrc(val) { val ? this.setAttribute('logo-src', val) : this.removeAttribute('logo-src'); }

    /**
     * Textos ya traducidos por el anfitrion (el componente no traduce nada).
     * @type {{traces?: string, retry?: string, notice?: string, copy?: string, copied?: string,
     *         print?: string, savePdf?: string, index?: string, collapseAll?: string,
     *         expandAll?: string, chartUnavailable?: string}}
     */
    get texts() { return this._texts; }
    set texts(val) {
        this._texts = (val && typeof val === 'object') ? val : {};
        if (this._initialized) this._render();
    }

    /** @type {{markdown?: string, traces?: string[], charts?: Object[]}|null} */
    get result() { return this._result; }

    // =========================================================================
    // API PUBLICA
    // =========================================================================

    /**
     * Pinta el estado de carga.
     * @param {string} [texto] - Mensaje contextual; si no se pasa, se mantiene loading-text.
     * @param {string} [hint] - Pista secundaria (p. ej. "puede tardar unos segundos"); si no se
     *                          pasa, se mantiene loading-hint.
     */
    setLoading(texto, hint) {
        this._cancelarCierre();
        if (texto !== undefined) this.loadingText = texto;
        if (hint !== undefined) {
            this.loadingHint = hint;
            // Cada consulta empieza su propia lista: el hint es su primer paso.
            this._pasosCarga = hint ? [hint] : [];
            this._totalPasos = this._pasosCarga.length;
            this._generacionPasos = (this._generacionPasos || 0) + 1;
        }
        this._result = null;
        this._mensaje = '';
        this.state = 'loading';
        if (this._initialized) this._render();
    }

    /**
     * Anade un paso a la lista del estado de carga y lo deja como paso activo. El anterior se
     * atenua. Pensado para tareas largas de las que no se recibe progreso real: la lista que
     * crece es la senal de que se sigue trabajando.
     * @param {string} paso - Texto del paso, ya traducido.
     */
    addLoadingStep(paso) {
        if (!paso) return;

        this._pasosCarga = (this._pasosCarga || []).concat(paso);
        this._totalPasos = (this._totalPasos || 0) + 1;

        if (this._pasosCarga.length > AI_VIEWER_MAX_PASOS_CARGA) {
            this._pasosCarga = this._pasosCarga.slice(-AI_VIEWER_MAX_PASOS_CARGA);
        }

        this.loadingHint = paso;

        if (this._initialized && this.state === 'loading') this._renderPasos(this.shadow.querySelector('.arv-card'));
    }

    /**
     * Pinta la respuesta del agente.
     * @param {Object} respuesta
     * @param {string} respuesta.markdown - Texto en markdown (o HTML ya generado por el servicio).
     * @param {string[]} [respuesta.traces] - Frases humanizadas de las consultas realizadas.
     * @param {Object[]} [respuesta.charts] - Graficas (spec neutro: tipo, titulo, categorias,
     *        series...). Cada una se pinta donde el texto lleva su marca `[[grafica:gN]]`; las que
     *        no tienen marca, al final. Se aceptan las claves en PascalCase, camelCase o snake_case.
     */
    setResult(respuesta) {
        const datos = respuesta || {};
        const resultado = {
            markdown: datos.markdown || '',
            traces: Array.isArray(datos.traces) ? datos.traces : [],
            charts: Array.isArray(datos.charts) ? datos.charts : []
        };

        this._cancelarCierre();
        // Con la barra en marcha la respuesta espera a que llegue a la meta; el resto de llamadas la anulan.
        if (this._initialized && this.state === 'loading' && this._barra) {
            this._result = resultado;
            this._cerrarBarra(() => this._mostrarResultado(resultado));
            return;
        }
        this._mostrarResultado(resultado);
    }

    _mostrarResultado(resultado) {
        this._result = resultado;
        this._mensaje = '';
        this.state = 'success';
        if (this._initialized) this._render();
    }

    /**
     * Pinta un error con boton de reintento.
     * @param {string} mensaje - Mensaje legible para el usuario.
     */
    setError(mensaje) {
        this._cancelarCierre();
        this._result = null;
        this._mensaje = mensaje || '';
        this.state = 'error';
        if (this._initialized) this._render();
    }

    /**
     * Pinta un estado vacio (sin contenido que mostrar, no es un fallo).
     * @param {string} mensaje - Explicacion para el usuario.
     */
    setEmpty(mensaje) {
        this._cancelarCierre();
        this._result = null;
        this._mensaje = mensaje || '';
        this.state = 'empty';
        if (this._initialized) this._render();
    }

    // =========================================================================
    // ESTRUCTURA
    // =========================================================================

    /**
     * Monta la estructura una sola vez. Los re-render solo actualizan contenido y clases:
     * asi no se quitan los <link> de estilos (evita FOUC) ni se pierde el foco.
     */
    _montarEstructura() {
        if (this.shadow.querySelector('.arv-card')) return;

        const card = document.createElement('article');
        card.className = 'arv-card';
        card.innerHTML =
            // Titulo, nombre del informe y logo van ocultos: solo los rellena el documento exportado.
            '<header class="arv-header arv-header--meta">' +
                '<img class="arv-header-logo" alt="" hidden>' +
                '<span class="arv-header-icon">' + AI_VIEWER_ICONO_IA + '</span>' +
                '<div class="arv-header-texts">' +
                    '<h2 class="arv-heading" hidden></h2>' +
                    '<p class="arv-report-name" hidden></p>' +
                    '<p class="arv-subtitle" hidden></p>' +
                '</div>' +
                '<div class="arv-header-actions"></div>' +
            '</header>' +
            '<div class="arv-body">' +
                '<div class="arv-loading" hidden>' +
                    '<span class="arv-scene" aria-hidden="true" hidden></span>' +
                    '<div class="arv-loading-texts">' +
                        '<span class="arv-loading-text"></span>' +
                        '<ul class="arv-loading-steps" aria-live="polite" hidden></ul>' +
                    '</div>' +
                '</div>' +
                '<div class="arv-skeleton" aria-hidden="true" hidden>' +
                    AiResponseViewer._htmlEsqueleto() +
                '</div>' +
                '<div class="arv-layout">' +
                    '<div class="arv-col">' +
                        '<div class="arv-markdown md" hidden></div>' +
                        '<div class="arv-charts" hidden></div>' +
                    '</div>' +
                    '<nav class="arv-indice" hidden></nav>' +
                '</div>' +
                '<div class="arv-state" hidden></div>' +
            '</div>' +
            '<footer class="arv-footer" hidden>' +
                '<details class="arv-traces" hidden>' +
                    '<summary>' +
                        '<span class="arv-traces-icon">' + AI_VIEWER_ICONO_CONSULTAS + '</span>' +
                        '<span class="arv-traces-label"></span>' +
                    '</summary>' +
                    '<ul class="arv-traces-list"></ul>' +
                '</details>' +
                '<p class="arv-notice" hidden></p>' +
            '</footer>';

        this.shadow.appendChild(card);

        // Zona de resultado con aria-live: los lectores de pantalla anuncian el cambio de estado
        // sin robar el foco (la respuesta puede tardar y llega de forma asincrona).
        const body = card.querySelector('.arv-body');
        body.setAttribute('aria-live', 'polite');
        body.setAttribute('aria-busy', 'false');
    }

    // =========================================================================
    // RENDERIZADO
    // =========================================================================

    _render() {
        const card = this.shadow.querySelector('.arv-card');
        if (!card) return;

        const estado = this.state;
        card.setAttribute('data-state', estado);

        this._renderCabecera(card);
        this._renderCuerpo(card, estado);
        this._renderPie(card, estado);

        // Va al final: la cabecera se pinta antes que el cuerpo, asi que cuando se monta el boton
        // todavia no existe ninguna seccion que mirar.
        this._sincronizarBotonPlegado();
    }

    /**
     * Barra de meta: destello de IA, marca de tiempo y acciones. El titulo lo pone el anfitrion
     * (repetirlo aqui es ruido y, en un panel de 320 px, alto robado al contenido); titulo, nombre
     * del informe y logo solo salen en el documento exportado (_htmlExportable).
     */
    _renderCabecera(card) {
        const cabecera = card.querySelector('.arv-header');
        const subtitulo = card.querySelector('.arv-subtitle');

        // La marca de tiempo describe la respuesta que se esta viendo. En carga, error o vacio
        // no hay respuesta, asi que fecharla enganya: se oculta aunque el anfitrion la haya dejado
        // puesta de una respuesta anterior (caso real: regenerar y que falle la segunda llamada).
        var hayRespuesta = this.state === 'success';
        subtitulo.textContent = this.subtitle;
        subtitulo.hidden = !this.subtitle || !hayRespuesta;

        this._renderAccionesCabecera(card);

        // Sin marca de tiempo y sin acciones (error, vacio, idle) no queda nada que pintar en la
        // barra: fuera, que el estado se lea solo. Mientras carga o cuando ya hay respuesta
        // (aunque el anfitrion no de fecha ni acciones) se mantiene con el destello: evita que la
        // tarjeta se vea vacia justo en la espera larga del MCP.
        const hayAcciones = !!card.querySelector('.arv-header-actions').firstChild;
        const enProceso = this.state === 'loading' || this.state === 'success';
        cabecera.hidden = subtitulo.hidden && !hayAcciones && !enProceso;
    }

    /**
     * Acciones de la cabecera: plegar/desplegar todo, imprimir, guardar como PDF y copiar. Solo
     * cuando hay respuesta, y cada una solo si el anfitrion ha dado su texto (el componente no
     * traduce nada). El plegado, ademas, solo si las secciones se pliegan.
     */
    _renderAccionesCabecera(card) {
        const zona = card.querySelector('.arv-header-actions');
        const hayRespuesta = this.state === 'success' && this._result && this._result.markdown;

        // Un informe de diez apartados se recorre plegado y se lee desplegado, y hasta ahora eso
        // eran diez clics. El boton va el primero porque es el unico que cambia lo que se ve;
        // los otros tres se llevan el informe fuera.
        const acciones = !hayRespuesta ? [] : [
            { clave: 'plegado',  glifo: '',          texto: this.collapsibleSections ? this._texts.collapseAll : '',
              icono: AI_VIEWER_ICONO_PLEGAR,         pulsar: () => this._alternarPlegado() },
            { clave: 'imprimir', glifo: 'imprimir',  texto: this._texts.print,   pulsar: () => this._imprimir() },
            { clave: 'pdf',      glifo: 'descargar', texto: this._texts.savePdf, pulsar: () => this._guardarPdf() },
            { clave: 'copiar',   glifo: 'copiar',    texto: this._texts.copy,    pulsar: (boton) => this._copiar(boton, this._texts.copy) }
        ].filter(accion => !!accion.texto);

        // Se reconstruye solo si cambia el juego de acciones o alguno de sus textos. Si no, se
        // reusan los botones: el de copiar puede estar a media confirmacion (el check verde dura
        // 1,8 s) y un innerHTML en un re-render se la comeria.
        const firma = acciones.map(accion => accion.clave + '=' + accion.texto).join('|');
        if (zona.dataset.arvAcciones === firma) return;

        zona.innerHTML = '';
        zona.dataset.arvAcciones = firma;

        acciones.forEach(accion => {
            const boton = document.createElement('wc-button');
            // Solo icono, con borde y fondo claro: el look de .text-assistant-copy-btn. El glifo
            // sale del catalogo de iconos (icon-catalog.css) por el nombre de clase, y el texto
            // pasa a tooltip porque en el panel lateral no hay ancho para etiquetas.
            boton.className = 'arv-accion ' + (accion.glifo || '') +
                (accion.clave === 'copiar' ? ' arv-copiar' : '') +
                (accion.clave === 'plegado' ? ' arv-plegado' : '');
            if (accion.icono) boton.setAttribute('icon', accion.icono);
            boton.setAttribute('variant', 'white');
            boton.setAttribute('size', 'sm');
            boton.setAttribute('shape', 'rounded');
            boton.setAttribute('title', accion.texto);
            boton.setAttribute('aria-label', accion.texto);
            boton.addEventListener('click', () => accion.pulsar(boton));
            zona.appendChild(boton);
        });
    }

    /**
     * Pliega o despliega TODAS las secciones a la vez.
     *
     * Decide por lo que hay, no por lo que se pulso la vez anterior: si queda alguna cerrada,
     * abre; si estan todas abiertas, cierra. Asi el boton hace siempre lo que promete su icono,
     * incluso despues de que el usuario haya abierto o cerrado secciones sueltas a mano.
     * @private
     */
    _alternarPlegado() {
        const secciones = this._secciones();
        if (!secciones.length) return;

        const abrir = secciones.some(seccion => !seccion.open);
        secciones.forEach(seccion => { seccion.open = abrir; });

        this._sincronizarBotonPlegado();
    }

    /**
     * Secciones plegables pintadas ahora mismo.
     * @returns {HTMLDetailsElement[]}
     * @private
     */
    _secciones() {
        const markdown = this.shadow.querySelector('.arv-markdown');
        if (!markdown || markdown.hidden) return [];
        return Array.from(markdown.querySelectorAll('details.arv-seccion'));
    }

    /**
     * Pone el boton de plegado acorde con el estado real del informe: con todo abierto ofrece
     * plegar, y en cualquier otro caso (todo cerrado o a medias) ofrece desplegar. Sin secciones
     * el boton no pinta nada, asi que se esconde.
     * @private
     */
    _sincronizarBotonPlegado() {
        const boton = this.shadow.querySelector('.arv-plegado');
        if (!boton) return;

        const secciones = this._secciones();
        boton.hidden = secciones.length < 2;
        if (boton.hidden) return;

        const todoAbierto = secciones.every(seccion => seccion.open);

        // Plegar todo son diez eventos `toggle` seguidos, y cada escritura de atributo repinta el
        // wc-button: sin esta guarda el boton se rehace diez veces por pulsacion.
        const estado = todoAbierto ? 'abierto' : 'plegado';
        if (boton.dataset.arvPlegado === estado) return;
        boton.dataset.arvPlegado = estado;

        const etiqueta = (todoAbierto ? this._texts.collapseAll : this._texts.expandAll)
            || this._texts.collapseAll || '';

        boton.setAttribute('icon', todoAbierto ? AI_VIEWER_ICONO_PLEGAR : AI_VIEWER_ICONO_DESPLEGAR);
        boton.setAttribute('title', etiqueta);
        boton.setAttribute('aria-label', etiqueta);
    }

    /**
     * Copia la respuesta al portapapeles. Se copia el markdown (texto plano): es lo que el usuario
     * puede pegar en un comunicado o una entrevista sin arrastrar estilos.
     */
    _copiar(boton, textoCopiar) {
        const texto = this._result ? this._result.markdown : '';
        if (!texto || !navigator.clipboard) return;

        navigator.clipboard.writeText(texto).then(() => {
            // Confirmacion visual como en el asistente de texto: check verde 1,8 s y vuelta al icono.
            const confirmacion = this._texts.copied || textoCopiar;

            boton.classList.add('arv-copied');
            boton.setAttribute('icon', AI_VIEWER_ICONO_CHECK);
            boton.setAttribute('title', confirmacion);
            boton.setAttribute('aria-label', confirmacion);

            window.setTimeout(() => {
                boton.classList.remove('arv-copied');
                boton.removeAttribute('icon');
                boton.setAttribute('title', textoCopiar);
                boton.setAttribute('aria-label', textoCopiar);
            }, 1800);
        }).catch(() => { /* Sin permiso de portapapeles: no molestamos al usuario. */ });
    }

    /**
     * Imprime la respuesta. Se imprime un iframe, no la pagina: el anfitrion de este visor es una
     * pagina completa de ACWeb (menu, grid, panel lateral) y un window.print() sacaria todo eso
     * en lugar del informe.
     */
    _imprimir() {
        this._crearMarcoExportacion().then(marco => {
            const ventana = marco.contentWindow;
            const limpiar = () => marco.remove();

            // afterprint no llega en todos los navegadores, ni siempre si el usuario cancela:
            // red de seguridad para no dejar el iframe colgado en el DOM del anfitrion.
            ventana.addEventListener('afterprint', limpiar, { once: true });
            window.setTimeout(limpiar, 60000);

            ventana.focus();
            ventana.print();
        }).catch(error => { console.error('AiResponseViewer (imprimir):', error); });
    }

    /** Descarga la respuesta como PDF, con las mismas opciones que el visor del asistente de texto. */
    _guardarPdf() {
        this._crearMarcoExportacion().then(marco => {
            const doc = marco.contentDocument;

            // La libreria se inyecta por DOM y dentro del iframe: asi el PDF se genera contra el
            // documento que ya tiene los estilos, y el anfitrion no carga nada que no ha pedido.
            const script = doc.createElement('script');
            script.src = AI_VIEWER_HTML2PDF_URL;
            script.onerror = () => {
                console.error('AiResponseViewer (PDF): no se ha podido cargar la libreria.');
                marco.remove();
            };
            // onload no llega hasta DESPUES de ejecutar el script, asi que ahi html2pdf ya existe
            // en la ventana del iframe: no hace falta sondear.
            script.onload = () => this._generarPdf(marco);
            doc.head.appendChild(script);
        }).catch(error => { console.error('AiResponseViewer (PDF):', error); });
    }

    /**
     * Genera el PDF dentro del iframe pero dispara la descarga DESDE LA PAGINA ANFITRIONA.
     *
     * Es la unica parte que no puede quedarse dentro del iframe: html2pdf().save() da por hecho
     * que su ventana sigue viva mientras el navegador arranca la descarga, y aqui el iframe es
     * temporal. Quitarlo justo despues de que save() resolviera hacia que el navegador cancelase
     * la descarga en silencio: se pulsaba "Guardar como PDF" y no pasaba nada, sin ningun error.
     * Por eso se pide el blob (outputPdf) y el enlace de descarga lo pone el anfitrion.
     * @param {HTMLIFrameElement} marco
     * @private
     */
    _generarPdf(marco) {
        const ventana = marco.contentWindow;
        const doc = marco.contentDocument;
        const nombre = this._nombreDocumento() + '.pdf';

        ventana.html2pdf().set({
            margin: 10,
            filename: nombre,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
            // Sin esto html2pdf corta por donde cae el borde de la hoja y partia parrafos y filas
            // por la mitad, con media linea en una pagina y media en la siguiente. El modo 'css'
            // lee los break-inside que declara la seccion 10 de la hoja; `avoid` los repite aqui
            // porque el modo css solo mira los elementos que le nombras.
            pagebreak: { mode: ['css', 'legacy'], avoid: ['p', 'li', 'tr', 'table', 'blockquote', 'pre', '.arv-grafica'] }
        }).from(doc.body).outputPdf('blob')
        .then(blob => {
            // La URL se crea con el iframe aun montado y en el contexto del anfitrion: cuando el
            // iframe desaparece, la descarga ya no depende de el.
            const url = URL.createObjectURL(blob);
            marco.remove();
            this._descargar(url, nombre);
        })
        .catch(error => { console.error('AiResponseViewer (PDF):', error); marco.remove(); });
    }

    /**
     * Dispara la descarga de un fichero ya generado.
     * @param {string} url - URL de objeto (blob:).
     * @param {string} nombre - Nombre con el que se guarda.
     * @private
     */
    _descargar(url, nombre) {
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombre;
        enlace.style.display = 'none';
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        // El navegador puede tardar en leer el blob: revocarlo antes le dejaria el fichero a medias.
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    /**
     * Nombre base para imprimir y para el PDF, sin los caracteres que no valen en un nombre de
     * fichero.
     */
    _nombreDocumento() {
        // Sin `document-name` explicito se compone con lo que ya hay en la cabecera:
        // "Primero de Bachillerato A - Situacion 360 IA".
        const base = this.documentName
            || [this.heading, this.reportName].filter(Boolean).join(' - ')
            || 'Alexia';
        return base.replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * Crea un iframe oculto con el documento exportable y resuelve cuando esta listo.
     * Hace falta un documento aparte por dos motivos: imprimir el del anfitrion sacaria toda la
     * pagina de ACWeb, y html2canvas no sabe mirar dentro de un shadow DOM.
     * @returns {Promise<HTMLIFrameElement>}
     */
    _crearMarcoExportacion() {
        const html = this._htmlExportable();
        if (!html) return Promise.reject(new Error('No hay respuesta que exportar.'));

        return new Promise(resolve => {
            const marco = document.createElement('iframe');
            marco.setAttribute('aria-hidden', 'true');
            marco.setAttribute('tabindex', '-1');
            // Fuera de pantalla pero con tamano real: html2canvas mide la maquetacion y un iframe
            // de 0x0 saldria en blanco. 794 x 1123 px es un A4 a 96 ppp.
            marco.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;';
            document.body.appendChild(marco);

            const doc = marco.contentDocument;
            doc.open();
            doc.write(html);
            doc.close();

            // Las hojas de estilo del iframe cargan aparte del documento; sin esperarlas se
            // imprimiria sin estilos. El ultimo timeout es la red de seguridad para no colgarse
            // si alguna no llega: resolver dos veces una promesa es inocuo.
            const listo = () => {
                // Las webfonts (@font-face de fonts.css) cargan aparte de la hoja: sin esperarlas
                // se exportaria con la tipografia de reserva. Si el navegador no expone
                // document.fonts, se sigue igual.
                const fuentes = doc.fonts;
                if (fuentes && fuentes.ready && typeof fuentes.ready.then === 'function') {
                    fuentes.ready.then(() => resolve(marco), () => resolve(marco));
                } else {
                    resolve(marco);
                }
            };

            if (doc.readyState === 'complete') {
                window.setTimeout(listo, 100);
            } else {
                marco.contentWindow.addEventListener('load', () => window.setTimeout(listo, 100), { once: true });
            }

            window.setTimeout(listo, 3000);
        });
    }

    /**
     * Documento HTML autonomo con la respuesta, para imprimir o convertir a PDF.
     *
     * Se CLONA la tarjeta que ya esta en pantalla en lugar de rehacer su html a mano: asi lo
     * exportado no puede divergir de lo que ve el usuario cada vez que cambie la estructura del
     * visor. La raiz del documento lleva:
     *   - la clase `arv-export`, porque la hoja del componente esta escrita contra `:host` y en un
     *     documento sin shadow host esas reglas no casan con nada (las secciones 01, 02 y 10 del
     *     CSS declaran tambien `.arv-export`). Sin ella se imprimia sin un solo color ni margen:
     *     todos los tokens --arv-* quedaban sin valor.
     *   - el atributo `wc-educaria`, que es como internal-layout.css aplica su reset de box-sizing
     *     fuera de un shadow root.
     * @returns {string} html completo, o '' si no hay respuesta que exportar.
     */
    _htmlExportable() {
        const card = this.shadow.querySelector('.arv-card');
        const markdown = this.shadow.querySelector('.arv-markdown');
        if (!card || !markdown || markdown.hidden) return '';

        const clon = card.cloneNode(true);
        this._fijarSvgExportables(card, clon);
        this._fijarGraficasExportables(clon);

        // Los propios botones de accion no se exportan.
        const acciones = clon.querySelector('.arv-header-actions');
        if (acciones) acciones.remove();

        // Las consultas realizadas son un desplegable: en papel serian una linea muerta.
        const trazas = clon.querySelector('.arv-traces');
        if (trazas) trazas.remove();

        // El esqueleto solo tiene sentido mientras se espera.
        const esqueleto = clon.querySelector('.arv-skeleton');
        if (esqueleto) esqueleto.remove();

        // El indice son enlaces que en papel no llevan a ninguna parte.
        const indice = clon.querySelector('.arv-indice');
        if (indice) indice.remove();

        // Las secciones plegadas salen abiertas: en papel nadie puede desplegarlas, y lo plegado
        // se perderia sin dejar rastro.
        clon.querySelectorAll('details.arv-seccion').forEach((seccion) => {
            seccion.open = true;
            seccion.setAttribute('open', '');
        });

        // En pantalla el titulo lo pone el anfitrion, asi que el clon viene sin titular. El
        // documento exportado viaja solo: siempre lleva titulo, y con el el nombre del informe y
        // el logo del centro, igual que el visor del asistente de texto.
        const cabecera = clon.querySelector('.arv-header');
        if (cabecera) {
            cabecera.hidden = false;
            cabecera.classList.remove('arv-header--meta');
        }

        // Dos lineas cuando el anfitrion da las dos ("Primero de Bachillerato A" /
        // "Situacion 360 IA"); si solo hay una, el titulo es el nombre completo del documento.
        const titulo = clon.querySelector('.arv-heading');
        const nombreInforme = clon.querySelector('.arv-report-name');
        if (titulo) {
            titulo.textContent = this.heading || this._nombreDocumento();
            titulo.hidden = false;
        }
        if (nombreInforme) {
            const hayDosLineas = !!(this.heading && this.reportName);
            nombreInforme.textContent = hayDosLineas ? this.reportName : '';
            nombreInforme.hidden = !hayDosLineas;
        }

        // El logo del centro: lo pinta el anfitrion via logo-src, leyendolo de la cabecera de la
        // aplicacion. Si no viene, el documento sale sin logo y no pasa nada.
        const logo = clon.querySelector('.arv-header-logo');
        if (logo) {
            if (this.logoSrc) {
                logo.src = this.logoSrc;
                logo.hidden = false;
            } else {
                logo.remove();
            }
        }

        // El aviso de contenido generado por IA viaja con el documento a proposito, incluso si en
        // pantalla esta oculto: impreso o en PDF el informe sale del navegador y puede acabar en
        // manos de un tercero, que es justo cuando mas falta hace.
        const pie = clon.querySelector('.arv-footer');
        const aviso = clon.querySelector('.arv-notice');
        if (aviso) {
            aviso.textContent = this._texts.notice || '';
            aviso.hidden = !this._texts.notice;
        }
        if (pie) pie.hidden = !(aviso && !aviso.hidden);

        const hojas = Array.prototype.map.call(
            this.shadow.querySelectorAll('link[rel="stylesheet"]'),
            enlace => '<link rel="stylesheet" href="' + AiResponseViewer._escapar(enlace.href) + '">'
        ).join('');

        return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
            AiResponseViewer._escapar(this._nombreDocumento()) + '</title>' +
            hojas +
            '<style>html,body{margin:0;padding:16px;background:#fff}[hidden]{display:none!important}</style>' +
            '</head><body class="arv-export" wc-educaria>' +
            clon.outerHTML +
            '</body></html>';
    }

    /**
     * Deja escritos dentro del propio <svg> el tamano y los colores que le daba la hoja de estilos.
     *
     * html2canvas no dibuja un svg en linea: lo serializa y lo vuelve a cargar como una imagen
     * suelta. Dentro de esa imagen no existen ni las variables CSS del componente ni las reglas
     * que le daban tamano, asi que un `fill="var(--arv-estrella-cian)"` no pinta nada y un svg sin
     * width/height se queda a cero. Por eso el destello de la cabecera salia en blanco en el PDF.
     * Se llama con el clon recien hecho, antes de quitarle nodos, para que los dos recorridos de
     * svg vayan en el mismo orden.
     * @param {Element} original - La tarjeta viva, ya maquetada.
     * @param {Element} clon - La copia que se va a exportar.
     * @private
     */
    _fijarSvgExportables(original, clon) {
        const estilo = window.getComputedStyle(this);
        const vivos = original.querySelectorAll('svg');
        const copias = clon.querySelectorAll('svg');

        Array.prototype.forEach.call(copias, (svg, i) => {
            if (vivos[i]) {
                const caja = vivos[i].getBoundingClientRect();
                if (caja.width && caja.height) {
                    svg.setAttribute('width', Math.round(caja.width));
                    svg.setAttribute('height', Math.round(caja.height));
                }
            }

            const pintados = svg.querySelectorAll('[fill], [stroke]');
            Array.prototype.forEach.call(pintados, nodo => {
                ['fill', 'stroke'].forEach(propiedad => {
                    const valor = nodo.getAttribute(propiedad);
                    const token = valor && valor.match(/^var\(\s*(--[\w-]+)/);
                    if (!token) return;
                    const color = estilo.getPropertyValue(token[1]).trim();
                    if (color) nodo.setAttribute(propiedad, color);
                });
            });
        });
    }

    /** Escapa texto para incrustarlo en el html exportable (contenido y atributos). */
    static _escapar(texto) {
        return String(texto === null || texto === undefined ? '' : texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _renderCuerpo(card, estado) {
        const body = card.querySelector('.arv-body');
        const cargando = card.querySelector('.arv-loading');
        const esqueleto = card.querySelector('.arv-skeleton');
        const markdown = card.querySelector('.arv-markdown');
        const charts = card.querySelector('.arv-charts');
        const zonaEstado = card.querySelector('.arv-state');

        body.setAttribute('aria-busy', estado === 'loading' ? 'true' : 'false');

        cargando.hidden = estado !== 'loading';
        if (estado !== 'loading') this._detenerBarra();
        if (estado === 'loading') {
            card.querySelector('.arv-loading-text').textContent = this.loadingText;
            this._renderPasos(card);
            this._renderEscena(card);
        }

        if (esqueleto) esqueleto.hidden = !(estado === 'loading' && this.loadingSkeleton);

        // El innerHTML de abajo y el de la zona de graficas tiran los contenedores vivos: antes hay
        // que soltar sus instancias de ECharts y su observador.
        this._liberarGraficas();
        charts.hidden = true;
        charts.innerHTML = '';

        const hayRespuesta = estado === 'success' && this._result;
        markdown.hidden = !hayRespuesta;
        let graficas = [];
        if (hayRespuesta) {
            markdown.innerHTML = AiResponseViewer.markdownToHtml(this._result.markdown);
            graficas = this._montarGraficas(markdown, charts);
            AiResponseViewer._nivelarSecciones(markdown);
            AiResponseViewer._resaltarResumen(markdown);
            AiResponseViewer._colorearSecciones(markdown);
            if (this.collapsibleSections) {
                AiResponseViewer._plegarSecciones(markdown, this.openSections);
                // `toggle` no burbujea, asi que no vale delegar en el contenedor: se escucha en
                // cada seccion para que el boton no prometa plegar lo que ya esta plegado.
                markdown.querySelectorAll('details.arv-seccion').forEach((seccion) => {
                    seccion.addEventListener('toggle', () => this._sincronizarBotonPlegado());
                });
            }
        }

        this._fijarAltoCabecera(card);
        this._renderIndice(card);

        // Ya con el cuerpo plegado y montado: ECharts mide el contenedor al dibujar.
        this._pintarGraficas(graficas);

        const hayEstado = estado === 'error' || estado === 'empty';
        zonaEstado.hidden = !hayEstado;
        if (hayEstado) {
            this._renderEstado(zonaEstado, estado);
        }
    }

    /**
     * Publica el alto real de la cabecera en una variable de la tarjeta, que es lo que usan el
     * indice para quedarse justo debajo y los titulos para no esconderse al saltar a ellos. No
     * vale un valor fijo: la cabecera mide 49, 61 u 79 px segun lleve solo la fecha, un titulo o
     * titulo y fecha, y como es sticky, cualquiera mas alta que el valor supuesto se comeria la
     * primera linea de lo que se apunta.
     *
     * @param {HTMLElement} card - Tarjeta del visor.
     */
    _fijarAltoCabecera(card) {
        const cabecera = card.querySelector('.arv-header');
        if (!cabecera) return;

        const alto = Math.round(cabecera.getBoundingClientRect().height);
        if (alto > 0) card.style.setProperty('--arv-alto-cabecera', alto + 'px');
    }

    /**
     * Indice de secciones al lado del texto. Solo aparece si el anfitrion ha dado su titulo en
     * `texts.index` (misma palanca que el resto de la UI: sin texto, no se pinta) y si hay sitio:
     * por debajo de 900 px el CSS lo esconde y el cuerpo vuelve a una columna, porque en un panel
     * lateral se comeria el ancho de lectura.
     *
     * Nace de limitar la medida de lectura: en una pestaña a pantalla completa sobra la mitad
     * derecha, y un informe de diez apartados no tenia donde enseñar lo que trae sin recorrerlo.
     *
     * @param {HTMLElement} card - Tarjeta del visor.
     */
    _renderIndice(card) {
        const indice = card.querySelector('.arv-indice');
        if (!indice) return;

        const titulo = this._texts.index || '';
        const markdown = card.querySelector('.arv-markdown');
        const titulos = markdown && !markdown.hidden ? Array.from(markdown.querySelectorAll('h2')) : [];

        indice.hidden = !titulo || titulos.length < 2;
        indice.innerHTML = '';
        if (indice.hidden) return;

        indice.setAttribute('aria-label', titulo);

        const rotulo = document.createElement('span');
        rotulo.className = 'arv-indice-titulo';
        rotulo.textContent = titulo;
        indice.appendChild(rotulo);

        titulos.forEach((h2) => {
            const enlace = document.createElement('a');
            enlace.href = '#';
            enlace.className = 'arv-indice-item';
            enlace.textContent = (h2.textContent || '').trim();
            // La marca de color viaja del titulo a su entrada del indice: sin esto, la lista
            // pintaba todas las secciones del mismo gris y no habia forma de emparejarlas.
            // El resumen no entra en el ciclo (no lleva data-marca), pero si tiene color propio.
            if (h2.closest('.arv-resumen')) {
                enlace.setAttribute('data-marca', 'resumen');
            } else if (h2.dataset.marca) {
                enlace.setAttribute('data-marca', h2.dataset.marca);
            }

            enlace.addEventListener('click', (evento) => {
                evento.preventDefault();
                // Una seccion plegada se abre antes de llevar el foco: si no, el enlace deja al
                // usuario en un titulo y el contenido que buscaba sigue escondido.
                const seccion = h2.closest('details');
                if (seccion) seccion.open = true;
                h2.scrollIntoView({ block: 'start', behavior: 'smooth' });
            });

            indice.appendChild(enlace);
        });
    }

    /**
     * Lista de pasos del estado de carga.
     *
     * Se pinta por DESPLAZAMIENTO, no reescribiendo el texto de los <li> que ya estan: cada paso
     * nuevo entra como elemento nuevo (y con el, su animacion de entrada) y, si se pasa del tope,
     * sale el mas antiguo por arriba. Reescribir el texto en su sitio dejaba la lista visualmente
     * quieta a partir del cuarto paso, que es justo cuando mas falta hace ver movimiento.
     *
     * Para saber cuantos <li> crear no vale la longitud del array, que se queda clavada en el tope:
     * se lleva un contador total (_totalPasos) y se compara con lo ya pintado (data-total).
     */
    _renderPasos(card) {
        const lista = card.querySelector('.arv-loading-steps');
        if (!lista) return;

        // Uso declarativo (solo el atributo loading-hint, sin pasar por setLoading/addLoadingStep).
        let pasos = this._pasosCarga || [];
        if (!pasos.length && this.loadingHint) pasos = [this.loadingHint];

        lista.hidden = pasos.length === 0;
        if (!pasos.length) {
            lista.innerHTML = '';
            lista.removeAttribute('data-total');
            return;
        }

        const total = this._totalPasos || pasos.length;
        const generacion = String(this._generacionPasos || 0);

        // Consulta nueva: se rehace la lista entera, sin animar (aparece con el bloque de carga).
        if (lista.getAttribute('data-generacion') !== generacion) {
            lista.innerHTML = '';
            lista.setAttribute('data-generacion', generacion);
            lista.setAttribute('data-total', '0');
        }

        const pintados = Number(lista.getAttribute('data-total') || 0);

        for (let n = pintados + 1; n <= total; n++) {
            const paso = document.createElement('li');
            paso.className = 'arv-loading-step';
            // pasos[] solo guarda los ultimos: el paso n-esimo esta al final menos lo que falte.
            paso.textContent = pasos[pasos.length - 1 - (total - n)];
            // El primero aparece a la vez que el bloque de carga: animarlo seria un salto sin motivo.
            if (n > 1) paso.classList.add('arv-loading-step--nuevo');
            lista.appendChild(paso);

            while (lista.children.length > AI_VIEWER_MAX_PASOS_CARGA) {
                lista.removeChild(lista.firstElementChild);
            }
        }

        lista.setAttribute('data-total', String(total));

        const ultimo = lista.children.length - 1;
        for (let i = 0; i <= ultimo; i++) {
            lista.children[i].classList.toggle('arv-loading-step--activo', i === ultimo);
        }
    }

    // =========================================================================
    // BARRA DE PROGRESO
    // =========================================================================

    /**
     * Monta la barra bajo la escena y la deja avanzando. Sin estimacion no hay barra. Mientras sea
     * la misma consulta (misma generacion de pasos y misma estimacion) conserva su avance: un
     * setLoading o un paso nuevo repinta el cuerpo y no debe devolverla al principio.
     * @param {HTMLElement} zona - Contenedor .arv-scene.
     */
    _renderBarra(zona) {
        const estimacion = this.loadingEstimate;
        let svg = zona.querySelector('.arv-progreso');

        if (!estimacion) {
            this._detenerBarra();
            if (svg) svg.remove();
            return;
        }

        if (!svg) {
            zona.insertAdjacentHTML('beforeend', aiViewerBarraProgreso());
            svg = zona.querySelector('.arv-progreso');
        }

        const clave = estimacion + ':' + (this._generacionPasos || 0);
        if (this._barra && this._barra.svg === svg && this._barra.clave === clave) return;
        this._iniciarBarra(svg, estimacion, clave);
    }

    _iniciarBarra(svg, estimacion, clave) {
        this._detenerBarra();
        this._barra = {
            svg: svg,
            clave: clave,
            estimacion: estimacion,
            t0: performance.now(),
            piso: 0,
            cierre: null,
            raf: 0,
            refs: {
                hecha: svg.querySelector('.arv-bp-hecha'),
                cohete: svg.querySelector('.arv-bp-cohete'),
                llama: svg.querySelector('.arv-bp-llama'),
                chispas: Array.prototype.slice.call(svg.querySelectorAll('.arv-bp-chispa')),
                anillos: Array.prototype.slice.call(svg.querySelectorAll('.arv-bp-anillo'))
            }
        };
        this._pintarBarra(0);
        this._barra.raf = requestAnimationFrame(this._alFotograma);
    }

    /** Para el bucle de animacion. Se llama al salir de la carga y al desconectar el visor. */
    _detenerBarra() {
        if (!this._barra) return;
        cancelAnimationFrame(this._barra.raf);
        this._barra = null;
    }

    _tickBarra(ahora) {
        const barra = this._barra;
        if (!barra) return;
        this._pintarBarra((ahora - barra.t0) / 1000);
        barra.raf = requestAnimationFrame(this._alFotograma);
    }

    /**
     * Progreso a los t segundos de empezar: la curva simulada y, desde que llega la respuesta, el
     * tramo que la lleva al 100 % partiendo de donde estaba.
     */
    _progresoBarra(t) {
        const barra = this._barra;
        if (t <= 0) return 0;
        if (barra.cierre && t >= barra.cierre.t0) {
            const avance = (t - barra.cierre.t0) / (AI_VIEWER_BARRA_COMPLETAR_MS / 1000);
            return barra.cierre.p0 + (1 - barra.cierre.p0) * aiViewerSalida(avance);
        }
        return aiViewerProgresoSimulado(t, barra.estimacion);
    }

    _pintarBarra(t) {
        const barra = this._barra;
        const r = barra.refs;
        const reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // El avance nunca retrocede, ni siquiera si se cancela el cierre a medias.
        const p = Math.max(barra.piso, this._progresoBarra(t));
        barra.piso = p;

        const posicion = (progreso) => 15 + progreso * 103.6;
        const x = posicion(p);
        r.cohete.setAttribute('transform', 'translate(' + x.toFixed(2) + ' 18) scale(1.4)');
        r.hecha.setAttribute('x2', (x - 8).toFixed(2));

        // Al llegar, la llama se apaga a medias; el parpadeo se retira con movimiento reducido.
        const llegado = aiViewerSuave((p - 0.985) / 0.015);
        r.llama.setAttribute('transform', 'scale(' + (reducido ? 1 : 1 + 0.12 * Math.sin(t * 9)).toFixed(3) + ' 1)');
        r.llama.setAttribute('opacity', (1 - 0.6 * llegado).toFixed(3));

        // Cada chispa nace en la cola donde estaba el cohete cuando salio, asi se queda atras.
        const vida = 1.35;
        const desvio = [-6.4, 6.2, -4.6];
        r.chispas.forEach((chispa, i) => {
            if (reducido) {
                chispa.setAttribute('opacity', 0);
                return;
            }
            const u = ((t / vida) + i / 3) % 1;
            const xs = posicion(this._progresoBarra(t - u * vida)) - 19;
            const ys = 18 + desvio[i] * (0.35 + u * 1.2);
            const opacidad = Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.9) * 0.72 * (1 - llegado) * aiViewerSuave(p / 0.04);
            chispa.setAttribute('transform', 'translate(' + xs.toFixed(2) + ' ' + ys.toFixed(2) + ') scale(' + (1 - 0.45 * u).toFixed(3) + ')');
            chispa.setAttribute('opacity', opacidad.toFixed(3));
        });

        // Meta cumplida: el anillo pasa de amarillo a morado, "cierra la orbita".
        let v = 0;
        if (barra.cierre) {
            const desde = barra.cierre.t0 + AI_VIEWER_BARRA_COMPLETAR_MS / 1000;
            v = reducido ? (t >= desde ? 1 : 0) : aiViewerSuave((t - desde) / AI_VIEWER_BARRA_ANILLO_S);
        }
        r.anillos.forEach((anillo) => {
            const base = anillo.getAttribute('data-capa') === 'atras' ? 0.6 : 1;
            const morado = anillo.classList.contains('arv-bp-anillo--ia');
            anillo.setAttribute('opacity', (base * (morado ? v : 1 - v)).toFixed(3));
        });
    }

    /**
     * La respuesta llego con la barra en marcha: la completa, la deja un momento en la meta y
     * entonces ejecuta `alTerminar`, que es quien pinta el resultado.
     * @param {Function} alTerminar
     */
    _cerrarBarra(alTerminar) {
        const barra = this._barra;
        const t = (performance.now() - barra.t0) / 1000;
        barra.cierre = { t0: t, p0: Math.max(barra.piso, this._progresoBarra(t)) };

        this._cierreAplicar = alTerminar;
        this._cierreTimer = setTimeout(() => {
            const aplicar = this._cierreAplicar;
            this._cierreTimer = 0;
            this._cierreAplicar = null;
            if (aplicar) aplicar();
        }, AI_VIEWER_BARRA_COMPLETAR_MS + AI_VIEWER_BARRA_PAUSA_MS);
    }

    /** Descarta el resultado que esperaba a que la barra llegara. Lo llama todo lo que cambia el estado. */
    _cancelarCierre() {
        if (this._cierreTimer) clearTimeout(this._cierreTimer);
        this._cierreTimer = 0;
        this._cierreAplicar = null;
        if (this._barra) this._barra.cierre = null;
    }

    /**
     * Escena animada del estado de carga (loading-scene); sin ella, solo mensaje y pasos. El SVG
     * solo se vuelve a inyectar si cambia la escena o la variante: re-renderizar en cada
     * setLoading reiniciaria las animaciones.
     */
    _renderEscena(card) {
        const zona = card.querySelector('.arv-scene');
        const escena = this.loadingScene;

        if (!escena) {
            this._detenerBarra();
            zona.hidden = true;
            zona.innerHTML = '';
            zona.removeAttribute('data-escena');
            return;
        }

        const clave = escena + ':' + (escena === 'alumno' || escena === 'estudio' ? this.loadingVariant : '');
        if (zona.getAttribute('data-escena') !== clave) {
            // Se cambia solo el SVG de la escena: la barra de debajo conserva su avance.
            const marcado = escena === 'alumno' ? aiViewerEscenaAlumno(this.loadingVariant)
                : escena === 'grupo' ? AI_VIEWER_ESCENA_GRUPO
                : escena === 'curso' ? AI_VIEWER_ESCENA_CURSO
                : escena === 'ciclo' ? AI_VIEWER_ESCENA_CICLO
                : escena === 'estudio' ? aiViewerEscenaEstudio(this.loadingVariant)
                : AI_VIEWER_ESCENA_OFERTA;
            const anterior = zona.querySelector('.arv-esc');
            if (anterior) anterior.remove();
            zona.insertAdjacentHTML('afterbegin', marcado);
            zona.setAttribute('data-escena', clave);
        }

        zona.hidden = false;
        this._renderBarra(zona);
    }

    /** Error y vacio se pintan con action-result, que ya resuelve icono, titulo y botones. */
    _renderEstado(zona, estado) {
        let resultado = zona.querySelector('action-result');
        if (!resultado) {
            zona.innerHTML = '';
            resultado = document.createElement('action-result');
            zona.appendChild(resultado);
        }

        resultado.setAttribute('variant', estado === 'error' ? 'error' : 'empty');
        resultado.setAttribute('size', 'sm');
        resultado.heading = this._mensaje;

        const textoReintentar = this._texts.retry;
        resultado.buttons = (estado === 'error' && textoReintentar)
            ? [{
                text: textoReintentar,
                variant: 'primary',
                callback: () => this.dispatchEvent(new CustomEvent('ai-response-retry', { bubbles: true, composed: true }))
            }]
            : [];
    }

    _renderPie(card, estado) {
        const footer = card.querySelector('.arv-footer');
        const traces = card.querySelector('.arv-traces');
        const notice = card.querySelector('.arv-notice');

        const listaTrazas = (estado === 'success' && this._result) ? this._result.traces : [];
        const etiquetaTrazas = this._texts.traces;
        const hayTrazas = listaTrazas.length > 0 && !!etiquetaTrazas;

        traces.hidden = !hayTrazas;
        if (hayTrazas) {
            card.querySelector('.arv-traces-label').textContent = etiquetaTrazas + ' (' + listaTrazas.length + ')';
            card.querySelector('.arv-traces-list').innerHTML = listaTrazas
                .map(traza => '<li>' + AiResponseViewer.markdownToHtml(traza) + '</li>')
                .join('');
        }

        const textoAviso = this._texts.notice;
        const hayAviso = estado === 'success' && !!textoAviso && !this.hideNotice;
        notice.hidden = !hayAviso;
        if (hayAviso) {
            notice.textContent = textoAviso;
        }

        footer.hidden = !hayTrazas && !hayAviso;
    }

    // =========================================================================
    // GRAFICAS
    // =========================================================================

    /**
     * Coloca las graficas de la respuesta: cada parrafo que sea solo la marca `[[grafica:gN]]` se
     * cambia por un contenedor con la grafica gN, y las que el texto no referencia van a la zona
     * `.arv-charts`, al final. No dibuja nada (ECharts se carga aparte): solo deja los contenedores.
     * Una marca sin grafica deja su contenedor con spec null, que se pinta como no disponible.
     * @param {HTMLElement} markdown - Contenedor .arv-markdown recien pintado.
     * @param {HTMLElement} zona - Contenedor .arv-charts, para las graficas sin marca.
     * @returns {Array<{el: HTMLElement, spec: Object|null}>}
     * @private
     */
    _montarGraficas(markdown, zona) {
        const specs = aiViewerNormalizarGraficas(this._result.charts);
        const porId = {};
        specs.forEach((spec) => {
            const clave = spec.id.toLowerCase();
            if (clave && !porId[clave]) porId[clave] = spec;
        });

        const usadas = [];
        const montadas = [];

        Array.from(markdown.querySelectorAll('p')).forEach((parrafo) => {
            const marca = (parrafo.textContent || '').trim().match(AI_VIEWER_MARCA_GRAFICA);
            if (!marca) return;

            const spec = porId[marca[1].toLowerCase()] || null;
            const el = this._crearContenedorGrafica(spec);
            parrafo.replaceWith(el);
            if (spec) usadas.push(spec);
            montadas.push({ el: el, spec: spec });
        });

        specs.filter(spec => usadas.indexOf(spec) < 0).forEach((spec) => {
            const el = this._crearContenedorGrafica(spec);
            zona.appendChild(el);
            montadas.push({ el: el, spec: spec });
        });

        zona.hidden = zona.children.length === 0;
        if (!zona.hidden) zona.style.marginTop = '12px';

        return montadas;
    }

    /**
     * Contenedor de una grafica. El estilo va en linea porque el documento exportado solo lleva el
     * clon de la tarjeta y su hoja, no los estilos que se pongan en el shadow DOM.
     * @param {Object|null} spec
     * @returns {HTMLElement}
     * @private
     */
    _crearContenedorGrafica(spec) {
        const el = document.createElement('div');
        el.className = 'arv-grafica';
        el.style.cssText = AI_VIEWER_ESTILO_GRAFICA;
        if (spec && spec.id) el.setAttribute('data-grafica', spec.id);
        return el;
    }

    /**
     * Dibuja las graficas montadas. Las que no se pueden pintar (error del servicio, tipo
     * desconocido, sin datos, marca sin grafica) pasan a "no disponible" sin esperar; ECharts solo
     * se descarga si queda alguna por dibujar.
     * @param {Array<{el: HTMLElement, spec: Object|null}>} lista
     * @private
     */
    _pintarGraficas(lista) {
        const generacion = this._generacionGraficas;
        const porPintar = [];

        lista.forEach((item) => {
            if (aiViewerNoSePinta(item.spec)) {
                this._marcarGraficaNoDisponible(item.el, item.spec);
            } else {
                // Hueco mientras llega ECharts: el texto de debajo no salta cuando se dibuja.
                item.el.style.minHeight = '160px';
                porPintar.push(item);
            }
        });
        if (!porPintar.length) return;

        this._graficasListas = aiViewerCargarECharts().then((echarts) => {
            // Si mientras tanto se ha repintado el cuerpo, estos contenedores ya no estan en el DOM.
            if (generacion !== this._generacionGraficas) return;
            porPintar.forEach(item => this._pintarGrafica(echarts, item));
        }).catch((error) => {
            if (generacion !== this._generacionGraficas) return;
            console.warn('AiResponseViewer (graficas):', error);
            porPintar.forEach(item => this._marcarGraficaNoDisponible(item.el, item.spec));
        });
    }

    /**
     * Crea la instancia de ECharts de una grafica. Si falla (datos que la option no admite), esa
     * grafica pasa a "no disponible" y el resto del informe no se entera.
     * @param {Object} echarts
     * @param {{el: HTMLElement, spec: Object}} item
     * @private
     */
    _pintarGrafica(echarts, item) {
        const el = item.el;
        let chart = null;

        try {
            // Sin medida (seccion plegada) se dibuja con un ancho de reserva; el observador la
            // reajusta en cuanto la seccion se abre.
            const ancho = Math.round(el.clientWidth) || AI_VIEWER_ANCHO_GRAFICA_DEFECTO;
            const traduccion = aiViewerOpcionGrafica(item.spec, this._contextoGraficas(ancho));

            el.style.minHeight = '';
            el.style.height = traduccion.alto + 'px';
            chart = echarts.init(el, null, { renderer: 'svg', width: ancho, height: traduccion.alto });
            this._graficas.push({ chart: chart, el: el, spec: item.spec, ancho: ancho });
            chart.setOption(traduccion.option);

            this._observarGrafica(el);
        } catch (error) {
            console.warn('AiResponseViewer (grafica ' + (item.spec.id || 'sin id') + '):', error);
            if (chart) {
                try { chart.dispose(); } catch (errorLiberar) { /* ya liberada */ }
                this._graficas = this._graficas.filter(entrada => entrada.chart !== chart);
            }
            this._marcarGraficaNoDisponible(el, item.spec);
        }
    }

    /**
     * Vuelve a traducir y a pintar una grafica con un ancho nuevo: etiquetas, leyenda y titulo
     * dependen del ancho, asi que no basta con estirar el SVG.
     * @param {{chart: Object, el: HTMLElement, spec: Object}} entrada
     * @param {number} ancho - px del contenedor.
     * @private
     */
    _aplicarOpcionGrafica(entrada, ancho) {
        try {
            const traduccion = aiViewerOpcionGrafica(entrada.spec, this._contextoGraficas(ancho));
            entrada.ancho = ancho;
            entrada.el.style.height = traduccion.alto + 'px';
            entrada.chart.resize({ width: ancho, height: traduccion.alto });
            // notMerge: la option nueva sustituye a la anterior en vez de mezclarse con ella.
            entrada.chart.setOption(traduccion.option, true);
        } catch (error) {
            console.warn('AiResponseViewer (grafica ' + (entrada.spec.id || 'sin id') + '):', error);
        }
    }

    /**
     * Observa el ancho de una grafica. Un unico ResizeObserver para todas; vive en el visor y no en
     * la pagina porque el panel puede cambiar de ancho sin que cambie la ventana.
     * @param {HTMLElement} el
     * @private
     */
    _observarGrafica(el) {
        if (typeof ResizeObserver !== 'function') return;

        if (!this._observadorGraficas) {
            this._observadorGraficas = new ResizeObserver((medidas) => {
                medidas.forEach((medida) => {
                    const entrada = this._graficas.find(grafica => grafica.el === medida.target);
                    const ancho = Math.round(medida.contentRect.width);
                    // Ancho 0: seccion plegada. Menos de 2 px de cambio no se ve, y asi el propio
                    // ajuste de alto no puede volver a disparar el observador.
                    if (!entrada || !ancho || Math.abs(ancho - entrada.ancho) < 2) return;
                    // En el siguiente fotograma: tocar el tamano de lo observado dentro del callback
                    // hace que el navegador avise de "ResizeObserver loop".
                    window.requestAnimationFrame(() => {
                        if (this._graficas.indexOf(entrada) >= 0) this._aplicarOpcionGrafica(entrada, ancho);
                    });
                });
            });
        }
        this._observadorGraficas.observe(el);
    }

    /**
     * Medidas y colores con los que se traduce una grafica: ancho del contenedor, tipografia del
     * visor y los tokens de color de su hoja (con el valor de colors.css como reserva).
     * @param {number} ancho - px del contenedor.
     * @returns {Object}
     * @private
     */
    _contextoGraficas(ancho) {
        const estilo = window.getComputedStyle(this);
        const token = par => estilo.getPropertyValue(par[0]).trim() || par[1];

        return {
            ancho: ancho,
            fuente: estilo.fontFamily || 'sans-serif',
            colores: AI_VIEWER_PALETA_GRAFICA.map(token),
            escala: AI_VIEWER_ESCALA_HEATMAP.map(token),
            texto: token(['--arv-text', '#333333']),
            textoSec: token(['--arv-text-sec', '#5C5C5C']),
            linea: token(['--arv-border-suave', '#E8E9EB'])
        };
    }

    /**
     * Sustituye el contenido de una grafica por el aviso de que no esta disponible. El motivo que
     * da el servicio, si lo hay, queda como tooltip: es para quien mantiene, no para el lector.
     * @param {HTMLElement} el
     * @param {Object|null} spec
     * @private
     */
    _marcarGraficaNoDisponible(el, spec) {
        el.removeAttribute('aria-label');
        el.style.cssText = AI_VIEWER_ESTILO_GRAFICA_NO_DISPONIBLE;
        el.textContent = this._texts.chartUnavailable || AI_VIEWER_TEXTO_GRAFICA_NO_DISPONIBLE;
        el.setAttribute('role', 'note');
        if (spec && spec.error) el.title = spec.error;
    }

    /**
     * Suelta las instancias de ECharts y el observador. Hay que llamarlo antes de tirar los
     * contenedores (cada repintado del cuerpo y al desconectar el visor), o ECharts conserva en
     * memoria sus listeners y el SVG de graficas que ya no estan en pantalla.
     * @private
     */
    _liberarGraficas() {
        this._generacionGraficas++;
        this._graficasListas = null;

        if (this._observadorGraficas) {
            this._observadorGraficas.disconnect();
            this._observadorGraficas = null;
        }
        this._graficas.forEach((entrada) => {
            try { entrada.chart.dispose(); } catch (error) { /* ya liberada */ }
        });
        this._graficas = [];
    }

    /**
     * Deja cada grafica del clon exportable reducida a su <svg>, que se escala al ancho de la hoja.
     * El resto del contenedor es andamio interactivo de ECharts (una capa con el tamano en px de la
     * pantalla y el tooltip), que en papel sobra y en una pestana ancha desbordaria la pagina.
     * @param {Element} clon - La copia de la tarjeta que se va a exportar.
     * @private
     */
    _fijarGraficasExportables(clon) {
        Array.prototype.forEach.call(clon.querySelectorAll('.arv-grafica'), (grafica) => {
            const svg = grafica.querySelector('svg');
            if (!svg) return;

            // ECharts no escribe viewBox: sin el, reducir el svg recortaria el dibujo en vez de escalarlo.
            if (!svg.hasAttribute('viewBox') && svg.getAttribute('width') && svg.getAttribute('height')) {
                svg.setAttribute('viewBox', '0 0 ' + svg.getAttribute('width') + ' ' + svg.getAttribute('height'));
            }
            svg.style.cssText = 'display:block;max-width:100%;height:auto;';
            grafica.replaceChildren(svg);
            grafica.removeAttribute('_echarts_instance_');
            grafica.style.height = 'auto';
            grafica.style.minHeight = '';
        });
    }

    // =========================================================================
    // MARKDOWN
    // =========================================================================

    /**
     * Convierte markdown a HTML. Usa `marked` si la pagina lo ha cargado; si no, aplica un
     * renderizador propio con lo esencial (ver markdownBasico).
     * Mismo criterio que acciones-ia.js: si el servicio ya devuelve HTML, se respeta.
     * @param {string} texto
     * @returns {string}
     */
    static markdownToHtml(texto) {
        if (!texto) return '';

        const crudo = String(texto).trim();
        if (!crudo) return '';

        if (/<[a-z][\s\S]*>/i.test(crudo)) return crudo;
        if (typeof marked !== 'undefined' && marked.parse) return marked.parse(crudo);

        return AiResponseViewer.markdownBasico(crudo);
    }

    /**
     * Envuelve la primera seccion (desde su <h2> hasta el siguiente <h2>, o el final si no hay
     * mas) en una tarjeta propia (.arv-resumen, estilo en ai-response-viewer.css): es el resumen
     * del informe y debe leerse primero, distinto del resto de apartados que comparten el mismo
     * patron de titulo. Generico a proposito: cualquier informe de IA con secciones tiene un
     * primer bloque a modo de resumen, no es exclusivo de la Situacion 360.
     * @param {HTMLElement} markdown - Contenedor .arv-markdown ya pintado (innerHTML asignado).
     */
    static _resaltarResumen(markdown) {
        const primerH2 = markdown.querySelector(':scope > h2');
        if (!primerH2) return;

        const tarjeta = document.createElement('div');
        tarjeta.className = 'arv-resumen';
        markdown.insertBefore(tarjeta, primerH2);

        let nodo = primerH2;
        while (nodo && !(nodo !== primerH2 && nodo.nodeType === 1 && nodo.tagName === 'H2')) {
            const siguiente = nodo.nextSibling;
            tarjeta.appendChild(nodo);
            nodo = siguiente;
        }
    }


    /**
     * Deja las secciones del informe en `h2`, que es el nivel del que cuelga todo lo demas: la
     * tarjeta del resumen, la marca de color, el plegado y el indice.
     *
     * El nivel lo elige el modelo al redactar y no es estable: el mismo prompt devuelve `##` una
     * vez y `###` la siguiente. Sin `h2` no fallaba nada ruidosamente, simplemente el informe salia
     * como texto corrido con los titulos en versalitas (el estilo de `h3`/`h4`, que son etiquetas,
     * no secciones) y sin indice, y parecia que se habian perdido los estilos.
     *
     * Solo entra en accion si NO hay ningun `h2` de primer nivel: con uno solo que haya, manda el
     * marcado tal cual viene y un informe que mezcle `##` y `###` conserva su jerarquia.
     *
     * @param {HTMLElement} markdown - Contenedor .arv-markdown recien pintado.
     */
    static _nivelarSecciones(markdown) {
        if (markdown.querySelector(':scope > h2')) return;

        // De mas alto a mas bajo: si el informe titula con `#`, esas son sus secciones.
        const nivel = ['h1', 'h3', 'h4'].find(etiqueta => markdown.querySelector(':scope > ' + etiqueta));
        if (!nivel) return;

        Array.from(markdown.querySelectorAll(':scope > ' + nivel)).forEach((titulo) => {
            const seccion = document.createElement('h2');
            Array.from(titulo.attributes).forEach(atributo => {
                seccion.setAttribute(atributo.name, atributo.value);
            });
            while (titulo.firstChild) seccion.appendChild(titulo.firstChild);
            titulo.replaceWith(seccion);
        });
    }

    /**
     * Numera las secciones para el ciclo de color de su marca izquierda (cian, verde, amarillo:
     * las tres estrellas del destello de IA). El resumen queda fuera: su tarjeta ya lo distingue y
     * no lleva marca.
     *
     * Va por atributo y no por `nth-of-type` en el CSS porque al plegar cada `h2` acaba siendo el
     * unico de su tipo dentro de su propio `<summary>`, y el ciclo se quedaba clavado en el primer
     * color.
     *
     * @param {HTMLElement} markdown - Contenedor .arv-markdown ya pintado.
     */
    static _colorearSecciones(markdown) {
        let turno = 0;
        markdown.querySelectorAll('h2').forEach((titulo) => {
            if (titulo.closest('.arv-resumen')) return;
            titulo.dataset.marca = String(turno % 3);
            turno++;
        });
    }

    /**
     * Pliega cada seccion del informe (un `h2` de primer nivel y todo lo que va detras hasta el
     * siguiente) en un `<details>`. El resumen queda fuera: ya lo ha sacado _resaltarResumen a su
     * tarjeta y es lo primero que hay que leer.
     *
     * Un informe de diez apartados son cinco o siete pantallas de scroll seguido, y ninguna lista
     * dice de antemano que trae. Plegado, el profesor ve todos los titulos de una vez y abre el que
     * le interesa. Lo que queda abierto se decide por posicion y no por el titulo: que un apartado
     * importe depende del informe, y aqui no se sabe de que informe se trata.
     *
     * La cabecera plegada lleva solo la flecha y el titulo. Se probo a acompañarla del principio
     * del texto a modo de pista y se quito: en el panel lateral el titulo ya ocupa dos lineas y la
     * pista salia cortada y descuadrada, con el titulo desplazado.
     *
     * @param {HTMLElement} markdown - Contenedor .arv-markdown ya pintado.
     * @param {number} abiertas - Cuantas secciones quedan abiertas, contando desde arriba.
     */
    static _plegarSecciones(markdown, abiertas) {
        const titulos = Array.from(markdown.querySelectorAll(':scope > h2'));

        titulos.forEach((titulo, indice) => {
            const seccion = document.createElement('details');
            seccion.className = 'arv-seccion';
            seccion.open = indice < abiertas;

            markdown.insertBefore(seccion, titulo);

            const cabecera = document.createElement('summary');
            cabecera.innerHTML = '<span class="arv-seccion-flecha">' + AI_VIEWER_ICONO_FLECHA + '</span>';
            seccion.appendChild(cabecera);

            // El titulo pasa dentro del summary; el cuerpo, detras.
            cabecera.appendChild(titulo);

            let nodo = seccion.nextSibling;
            while (nodo && !(nodo.nodeType === 1 && nodo.tagName === 'H2')) {
                const siguiente = nodo.nextSibling;
                seccion.appendChild(nodo);
                nodo = siguiente;
            }
        });
    }

    /**
     * Marcado del esqueleto que acompana a la espera: el bloque del resumen y tres secciones con su
     * marca a la izquierda. Es una figura fija a proposito -no sabemos cuantas secciones traera la
     * respuesta-, y por eso va con aria-hidden: lo que se anuncia son los pasos.
     * @returns {string}
     */
    static _htmlEsqueleto() {
        const linea = (ancho) => '<div class="arv-sk arv-sk-linea" style="width:' + ancho + '"></div>';
        const seccion = (anchoTitulo, anchos) =>
            '<div class="arv-sk-seccion">' +
                '<span class="arv-sk-marca"></span>' +
                '<div class="arv-sk arv-sk-titulo" style="width:' + anchoTitulo + '"></div>' +
                anchos.map(linea).join('') +
            '</div>';

        return '<div class="arv-sk arv-sk-resumen"></div>' +
            seccion('170px', ['96%', '88%', '62%']) +
            seccion('140px', ['92%', '74%']) +
            seccion('190px', ['86%', '90%', '46%']);
    }

    /**
     * Renderizador de markdown de reserva para cuando `marked` no esta disponible (la pagina no
     * lo cargo o el CDN fallo). Cubre lo que usan las respuestas del MCP: titulos, negrita,
     * cursiva, codigo en linea, listas, citas, separadores y tablas con su fila de cabecera.
     * El texto se escapa ANTES de aplicar el markdown, asi que nunca inyecta HTML.
     * @param {string} texto
     * @returns {string}
     */
    static markdownBasico(texto) {
        const enLinea = (fragmento) => WidgetBase.escapeHtml(fragmento)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');

        const esSeparadorTabla = (linea) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(linea) && linea.indexOf('-') >= 0;
        const celdas = (linea) => linea.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

        const lineas = String(texto).replace(/\r\n/g, '\n').split('\n');
        const html = [];
        let i = 0;

        /** Cierra la lista abierta, si la hay. */
        let listaAbierta = null;
        const cerrarLista = () => {
            if (listaAbierta) {
                html.push('</' + listaAbierta + '>');
                listaAbierta = null;
            }
        };

        while (i < lineas.length) {
            const linea = lineas[i];
            const limpia = linea.trim();

            if (!limpia) {
                cerrarLista();
                i++;
                continue;
            }

            // Titulo (## Seccion)
            const titulo = limpia.match(/^(#{1,4})\s+(.*)$/);
            if (titulo) {
                cerrarLista();
                const nivel = titulo[1].length;
                html.push('<h' + nivel + '>' + enLinea(titulo[2]) + '</h' + nivel + '>');
                i++;
                continue;
            }

            // Separador (--- o ***)
            if (/^([-*_])\1{2,}$/.test(limpia.replace(/\s/g, ''))) {
                cerrarLista();
                html.push('<hr>');
                i++;
                continue;
            }

            // Tabla: cabecera + separador + filas
            if (limpia.indexOf('|') >= 0 && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1].trim())) {
                cerrarLista();
                const cabecera = celdas(limpia);
                i += 2;

                const filas = [];
                while (i < lineas.length && lineas[i].trim().indexOf('|') >= 0) {
                    filas.push(celdas(lineas[i].trim()));
                    i++;
                }

                html.push('<table><thead><tr>'
                    + cabecera.map(c => '<th>' + enLinea(c) + '</th>').join('')
                    + '</tr></thead><tbody>'
                    + filas.map(f => '<tr>' + f.map(c => '<td>' + enLinea(c) + '</td>').join('') + '</tr>').join('')
                    + '</tbody></table>');
                continue;
            }

            // Cita (> texto)
            const cita = limpia.match(/^>\s?(.*)$/);
            if (cita) {
                cerrarLista();
                html.push('<blockquote>' + enLinea(cita[1]) + '</blockquote>');
                i++;
                continue;
            }

            // Lista (- item, * item, 1. item)
            const item = limpia.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
            if (item) {
                const tipo = /^\d/.test(limpia) ? 'ol' : 'ul';
                if (listaAbierta !== tipo) {
                    cerrarLista();
                    html.push('<' + tipo + '>');
                    listaAbierta = tipo;
                }
                html.push('<li>' + enLinea(item[1]) + '</li>');
                i++;
                continue;
            }

            // Parrafo: se juntan las lineas consecutivas de texto corrido.
            cerrarLista();
            const parrafo = [];
            while (i < lineas.length && lineas[i].trim()
                   && !/^(#{1,4})\s/.test(lineas[i].trim())
                   && !/^(?:[-*+]|\d+\.)\s/.test(lineas[i].trim())
                   && !/^>\s?/.test(lineas[i].trim())
                   && lineas[i].trim().indexOf('|') < 0) {
                parrafo.push(lineas[i].trim());
                i++;
            }
            if (parrafo.length) {
                html.push('<p>' + enLinea(parrafo.join(' ')) + '</p>');
            } else {
                // Linea que ninguna regla acepta (p. ej. una fila de tabla suelta): se escapa.
                html.push('<p>' + enLinea(limpia) + '</p>');
                i++;
            }
        }

        cerrarLista();

        return html.join('');
    }
}

if (!customElements.get('ai-response-viewer')) customElements.define('ai-response-viewer', AiResponseViewer);

window.AiResponseViewer = AiResponseViewer;
