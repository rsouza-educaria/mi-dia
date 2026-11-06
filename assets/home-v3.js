/* Mi día V3: la home y los paneles montados con los Web Components REALES de Alexia
   (copiados de AlexiaResources a ./real, solo lectura). Mismas APIs que usan webpart-botonera.js y los controladores:
   button-bar vertical con HEADER_ICONS, right-sidebar con loadContext/navigate, tree-list, content-section, dynamic-form...
   Los datos son de ejemplo y están en un solo sitio: los contadores de la home salen de ellos. */
await Promise.all(['wc-button', 'wc-status', 'wc-icon', 'wc-banner', 'wc-select', 'tree-list', 'button-bar', 'content-section', 'dynamic-tab', 'dynamic-form', 'right-sidebar', 'wc-rich-text', 'wc-file-upload', 'action-result']
  .map(function (t) { return customElements.whenDefined(t); }));

/* Tooltip en todos los botones: si un botón tiene texto y no title, su title es su texto (los textOut se cortan con "...") */
const conTitle = (bs) => { (bs || []).forEach((b) => { if (!b) return; if (!b.title && b.label) b.title = b.label; if (b.children) conTitle(b.children); }); return bs; };
const conTitleNodos = (ns) => { (ns || []).forEach((n) => { if (n.buttons) conTitle(n.buttons); if (n.children) conTitleNodos(n.children); }); return ns; };
const envolver = (tag, prop, fn) => {
  const P = customElements.get(tag).prototype, D = Object.getOwnPropertyDescriptor(P, prop);
  Object.defineProperty(P, prop, {get: D.get, set: function (v) { D.set.call(this, fn(v)); }, configurable: true});
};
envolver('button-bar', 'buttons', conTitle);
envolver('tree-list', 'data', conTitleNodos);

/* Barras de scroll finas y claras en todo, también dentro de los shadow DOM de los componentes (el CSS de la página no los cruza) */
const scrollSheet = new CSSStyleSheet();
scrollSheet.replaceSync('*{scrollbar-width:auto!important;scrollbar-color:auto!important}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#e3e8ee;border-radius:5px}::-webkit-scrollbar-thumb:hover{background:#cfd7e0}.wcb-variant-outline-primary:not(:hover):not(:active):not(:disabled){background-color:#fff!important}');
const adoptScroll = (r) => { if (!r.adoptedStyleSheets.includes(scrollSheet)) r.adoptedStyleSheets = [...r.adoptedStyleSheets, scrollSheet]; };
const attachOrig = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init) { const r = attachOrig.call(this, init); adoptScroll(r); return r; };
const recorreScroll = (n) => { adoptScroll(n); n.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) recorreScroll(e.shadowRoot); }); };
recorreScroll(document);

/* Prueba nuestra: texto de los dropdowns a 14px (el componente real usa --rf-font-size = 15,2px; el design system lo tiene pendiente de migrar). Solo afecta al wc-select. */
{ const st = document.createElement('style'); st.textContent = 'wc-select,.wcs-dropdown,.wcs-panel{--rf-font-size:14px}'; document.head.appendChild(st); }

const GRUPO = '2º ESO B';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

/* ── Iconos y colores: HEADER_ICONS de controller-core.js (AlexiaResources) ── */
const HI = {
  alumnos: {icon: 'mis-alumnos', iconColor: '#7cbf86', colorBg: '#eaf7ea'},
  areas: {icon: 'mis-areas', iconColor: '#d15e5e', colorBg: '#fff4f4'},
  secciones: {icon: 'mis-secciones', iconColor: '#54a0d2', colorBg: '#e1f0fa'},
  comunicados: {icon: 'mis-comunicados', iconColor: '#6f99d3', colorBg: '#e8edf8'},
  entrevistas: {icon: 'mis-entrevistas', iconColor: '#95a2d8', colorBg: '#f0e6f5'},
  encuestas: {icon: 'mis-encuestas', iconColor: '#daa46e', colorBg: '#fdf9e8'},
  cuaderno: {icon: 'cuaderno_profesor', iconColor: '#3FA7A3', colorBg: '#E4F6F5'},
  situacion360: {icon: 'ia_alexia', iconColor: '#6352C7', colorBg: '#F1EFFA'},
  /* No están en HEADER_ICONS: icono del catálogo y colores de la home legada (home.css) */
  incidencias: {icon: 'incidencias', iconColor: '#B7791F', colorBg: '#FFFDE7'},
  agenda: {icon: 'agenda', iconColor: '#285A92', colorBg: '#E8F2F8'},
  midia: {icon: 'calendario_reloj', iconColor: '#1b7f79', colorBg: '#e3f4f2'},
  aniversarios: {icon: 'mis-cumple', iconColor: '#75A1DF', colorBg: '#E8F0FD'},
  galerias: {icon: 'mis-galerias', iconColor: '#B378BA', colorBg: '#F5EEF8'},
  alarmas: {icon: 'campana', iconColor: '#dc8b08', colorBg: '#fce8f0'},
  enlaces: {icon: 'link', iconColor: '#2A8DA9', colorBg: '#ebfdff'}
};
const hdrIcon = (code) => ({name: HI[code].icon, colorBg: HI[code].colorBg, iconColor: HI[code].iconColor, borderColor: 'transparent'});
const SVG_PEDIDOS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>';
const SVG_ACCESO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
const MOTIVO_SVG = {
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bus: '<rect x="3" y="4" width="18" height="13" rx="2"/><line x1="3" y1="11" x2="21" y2="11"/><circle cx="7.5" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'
};
const MOTIVOS = [
  {t: 'Enfermedad común / Cita médica', i: 'heart'}, {t: 'Asunto familiar', i: 'users'}, {t: 'Transporte', i: 'bus'},
  {t: 'Actividad del centro', i: 'flag'}, {t: 'Otro', i: 'dots'}
];

/* ── Datos de ejemplo ── */
const TUT = ['2º ESO B', '1º ESO A'], MIS = ['Matemáticas', 'Física'];
const items = [
  {id:1,  n:22, alumno:'Sergio Prieto',  grupo:'2º ESO B', asig:'Matemáticas', tipo:'Falta',   hora:'1ª hora · 08:30 – 09:25', min:510, off:0,  estado:'pendiente'},
  {id:2,  n:22, alumno:'Sergio Prieto',  grupo:'2º ESO B', asig:'Lengua',      tipo:'Falta',   hora:'3ª hora · 10:30 – 11:25', min:630, off:0,  estado:'pendiente'},
  {id:3,  n:22, alumno:'Sergio Prieto',  grupo:'2º ESO B', asig:'Inglés',      tipo:'Falta',   hora:'2ª hora · 09:30 – 10:25', min:570, off:1,  estado:'pendiente'},
  {id:4,  n:22, alumno:'Sergio Prieto',  grupo:'2º ESO B', asig:'Historia',    tipo:'Falta',   hora:'4ª hora · 11:30 – 12:25', min:690, off:2,  estado:'pendiente'},
  {id:5,  n:18, alumno:'Marcos Santos',  grupo:'2º ESO B', asig:'Matemáticas', tipo:'Falta',   hora:'1ª hora · 08:30 – 09:25', min:510, off:2,  estado:'pendiente'},
  {id:6,  n:18, alumno:'Marcos Santos',  grupo:'2º ESO B', asig:'Matemáticas', tipo:'Falta',   hora:'1ª hora · 08:30 – 09:25', min:510, off:7,  estado:'pendiente'},
  {id:7,  n:18, alumno:'Marcos Santos',  grupo:'2º ESO B', asig:'Matemáticas', tipo:'Falta',   hora:'1ª hora · 08:30 – 09:25', min:510, off:12, estado:'pendiente'},
  {id:8,  n:14, alumno:'Daniel Ortiz',   grupo:'2º ESO B', asig:'Historia',    tipo:'Falta',   hora:'Jornada completa',        min:0,   off:0,  estado:'pendiente'},
  {id:9,  n:14, alumno:'Daniel Ortiz',   grupo:'2º ESO B', asig:'Historia',    tipo:'Falta',   hora:'Jornada completa',        min:0,   off:5,  estado:'pendiente'},
  {id:10, n:14, alumno:'Daniel Ortiz',   grupo:'2º ESO B', asig:'Historia',    tipo:'Falta',   hora:'Jornada completa',        min:0,   off:8,  estado:'pendiente'},
  {id:11, n:9,  alumno:'Pablo Gómez',    grupo:'2º ESO B', asig:'Matemáticas', tipo:'Retraso', hora:'1ª hora · 08:45',         min:525, off:0,  estado:'pendiente'},
  {id:12, n:9,  alumno:'Pablo Gómez',    grupo:'2º ESO B', asig:'Lengua',      tipo:'Retraso', hora:'3ª hora · 10:40',         min:640, off:1,  estado:'pendiente'},
  {id:13, n:9,  alumno:'Pablo Gómez',    grupo:'2º ESO B', asig:'Física',      tipo:'Retraso', hora:'1ª hora · 08:50',         min:530, off:2,  estado:'pendiente'},
  {id:14, n:16, alumno:'Nora Lozano',    grupo:'2º ESO B', asig:'Lengua',      tipo:'Falta',   hora:'3ª hora · 10:30 – 11:25', min:630, off:1,  estado:'por_aceptar', motivo:'Asunto familiar', obsJ:'La familia avisó por la plataforma.'},
  {id:15, n:2,  alumno:'Adrián Castro',  grupo:'2º ESO B', asig:'Matemáticas', tipo:'Retraso', hora:'1ª hora · 08:45',         min:525, off:2,  estado:'por_aceptar', motivo:'Transporte', obsJ:''},
  {id:16, n:20, alumno:'Lucas Pardo',    grupo:'2º ESO B', asig:'Física',      tipo:'Falta',   hora:'2ª hora · 09:30 – 10:25', min:570, off:1,  estado:'por_aceptar', motivo:'Enfermedad común / Cita médica', obsJ:'Fiebre, parte médico adjunto.'},
  {id:17, n:27, alumno:'Lucía Vega',     grupo:'1º ESO A', asig:'Física',      tipo:'Falta',   hora:'2ª hora · 09:30 – 10:25', min:570, off:1,  estado:'por_aceptar', motivo:'Enfermedad común / Cita médica', obsJ:'Cita con el pediatra, la familia lo comunicó por teléfono.'},
  {id:18, n:21, alumno:'Alicia Ramos',   grupo:'3º ESO C', asig:'Matemáticas', tipo:'Falta',   hora:'5ª hora · 12:30 – 13:25', min:750, off:1,  estado:'pendiente'},
  {id:19, n:5,  alumno:'Sofía Ruiz',     grupo:'1º ESO A', asig:'Física',      tipo:'Falta',   hora:'4ª hora · 11:30 – 12:25', min:690, off:0,  estado:'pendiente'},
  {id:20, n:12, alumno:'Javier Ortega',  grupo:'3º ESO C', asig:'Lengua',      tipo:'Retraso', hora:'3ª hora · 10:30 – 11:25', min:630, off:5,  estado:'por_aceptar', motivo:'Transporte', obsJ:''},
  {id:21, n:3,  alumno:'Elena Castro',   grupo:'1º ESO A', asig:'Física',      tipo:'Retraso', hora:'1ª hora · 08:30 – 09:25', min:510, off:0,  estado:'pendiente'},
  {id:22, n:7,  alumno:'Hugo Medina',    grupo:'1º ESO A', asig:'Inglés',      tipo:'Falta',   hora:'2ª hora · 09:30 – 10:25', min:570, off:6,  estado:'pendiente'}
];
const ALU = {
  'Sergio Prieto': {n: 22, ext: 'Fútbol', pa: 'Javier Prieto Marín', ma: 'Elena Marín Gil', av: []},
  'Marcos Santos': {n: 18, ext: 'Baloncesto', pa: 'Pedro Santos Roca', ma: 'Lucía Pons Vera', av: ['Alergia a los frutos secos']},
  'Daniel Ortiz':  {n: 14, ext: 'Ninguna', pa: 'Iván Ortiz Lara', ma: 'Marta Díaz Soler', av: []},
  'Pablo Gómez':   {n: 9,  ext: 'Ajedrez', pa: 'Carlos Gómez Núñez', ma: 'Inés Rubio Peña', av: []},
  'Adrián Castro': {n: 2,  ext: 'Fútbol', pa: 'Raúl Castro León', ma: 'Sara Molina Ibáñez', av: []},
  'Nora Lozano':   {n: 16, ext: 'Danza', pa: 'Diego Lozano Prat', ma: 'Clara Vega Ruiz', av: ['Asma leve, lleva inhalador']},
  'Lucas Pardo':   {n: 20, ext: 'Natación', pa: 'Andrés Pardo Gil', ma: 'Rosa Vidal Sanz', av: []},
  'Clara Vidal':   {n: 25, ext: 'Teatro', pa: 'Tomás Vidal Mora', ma: 'Nuria Cano Ferrer', av: []},
  'Irene Navarro': {n: 15, ext: 'Ninguna', pa: 'Jorge Navarro Sala', ma: 'Pilar Ortega Cruz', av: []},
  'Alicia Ramos':  {n: 21, ext: 'Voleibol', pa: 'Luis Ramos Pozo', ma: 'Ana Gil Navas', av: []}
};
const SEG = {
  'Adrián Castro': {tema: 'Convivencia', titulo: '2 incidencias de conducta en 7 días', filas: [{a: 'Lunes 02/11 · 3ª hora · Lengua', b: 'Interrumpe la clase de forma repetida'}, {a: 'Martes 03/11 · 5ª hora · Educación Física', b: 'Falta de respeto a un compañero'}]},
  'Pablo Gómez':   {tema: 'Convivencia', titulo: '1 amonestación y 3 retrasos esta semana', filas: [{a: 'Martes 03/11 · 4ª hora · Física', b: 'Amonestación: uso del móvil en clase'}, {a: 'Lunes 02/11 a miércoles 04/11', b: '3 retrasos a primera hora, sin justificar'}]},
  'Daniel Ortiz':  {tema: 'Convivencia', titulo: '1 incidencia de conducta esta semana', filas: [{a: 'Martes 03/11 · 2ª hora · Inglés', b: 'Se niega a trabajar con su grupo'}]},
  'Nora Lozano':   {tema: 'Rendimiento', titulo: '3 materias por debajo de 5', filas: [{a: 'Matemáticas', b: '1ª evaluación, media provisional', nota: '3,8'}, {a: 'Física', b: '1ª evaluación, media provisional', nota: '4,2'}, {a: 'Lengua', b: '1ª evaluación, media provisional', nota: '4,5'}]},
  'Marcos Santos': {tema: 'Rendimiento', titulo: '2 materias por debajo de 5', filas: [{a: 'Matemáticas', b: '1ª evaluación, media provisional', nota: '4,1'}, {a: 'Inglés', b: '1ª evaluación, media provisional', nota: '4,6'}]},
  'Alicia Ramos':  {tema: 'Rendimiento', titulo: '2 materias por debajo de 5', filas: [{a: 'Física', b: '1ª evaluación, media provisional', nota: '3,9'}, {a: 'Historia', b: '1ª evaluación, media provisional', nota: '4,7'}]}
};
const COLS = [
  {k: 'Absentismo', sub: 'Faltas repetidas o sin justificar', c: ['#fff4f4', '#d15e5e'], rows: [['Sergio Prieto', '4 faltas sin justificar esta semana', ''], ['Marcos Santos', '3 faltas a 1ª hora en dos semanas', 'También en rendimiento'], ['Daniel Ortiz', '3 jornadas completas de falta en 10 días', '']]},
  {k: 'Convivencia', sub: 'Incidencias de comportamiento', c: ['#e1f0fa', '#54a0d2'], rows: [['Adrián Castro', '2 incidencias de conducta en 7 días', ''], ['Pablo Gómez', '1 amonestación y 3 retrasos esta semana', ''], ['Daniel Ortiz', '1 incidencia de conducta esta semana', '']]},
  {k: 'Rendimiento', sub: 'Materias por debajo de 5', c: ['#fdf9e8', '#daa46e'], rows: [['Nora Lozano', '3 materias por debajo de 5', ''], ['Marcos Santos', '2 materias por debajo de 5', 'También en absentismo'], ['Alicia Ramos', '2 materias por debajo de 5', '']]},
  {k: 'Riesgo de evaluación', sub: 'Ausencias por encima del 10 %', c: ['#fff1e6', '#d9822b'], rows: [['Sergio Prieto', '18 % de ausencias en el trimestre', ''], ['Daniel Ortiz', '14 % de ausencias en el trimestre', ''], ['Marcos Santos', '11 % de ausencias en el trimestre', '']]}
];
const CLASES = {
  mat2b: {titulo: 'MATEMÁTICAS (MAT)', grupo: '2º ESO B', franja: '08:30-09:25'},
  fis1a: {titulo: 'FÍSICA (FIS)', grupo: '1º ESO A', franja: '09:30-10:25'},
  exb1: {titulo: 'MATEMÁTICAS (MAT)', grupo: '1º BACH A', franja: '10:20-11:15'},
  mat3c: {titulo: 'MATEMÁTICAS (MAT)', grupo: '3º ESO C', franja: '12:30-13:25'},
  tut: {titulo: 'TUTORÍA (TUT)', grupo: '2º ESO B', franja: '10:30-11:25'}
};
const DIAS = [
  {t: 'Lunes, 2 de noviembre', f: 'Lunes 2/11', r: [['08:30', 'Matemáticas · 2º ESO B · Aula 204', 'mat2b'], ['09:30', 'Física · 1º ESO A', 'fis1a'], ['12:30', 'Matemáticas · 3º ESO C', 'mat3c']]},
  {t: 'Martes, 3 de noviembre', f: 'Martes 3/11', r: [['08:30', 'Matemáticas · 2º ESO B · Aula 204', 'mat2b'], ['10:30', 'Tutoría · 2º ESO B', 'tut'], ['13:30', 'Reunión del equipo docente de 2º ESO B']]},
  {t: 'Hoy, miércoles 4 de noviembre', f: 'Miércoles 4/11', r: [['08:30', 'Matemáticas · 2º ESO B · Aula 204', 'mat2b'], ['09:30', 'Física · 1º ESO A', 'fis1a'], ['10:20', 'Examen de Matemáticas · 1º BACH A', 'exb1'], ['11:45', 'Entrevista · Fam. Gómez'], ['12:30', 'Matemáticas · 3º ESO C', 'mat3c']]},
  {t: 'Jueves, 5 de noviembre', f: 'Jueves 5/11', r: [['08:30', 'Matemáticas · 2º ESO B · Aula 204', 'mat2b'], ['09:30', 'Física · 1º ESO A', 'fis1a'], ['10:30', 'Tutoría · 2º ESO B', 'tut'], ['12:30', 'Matemáticas · 3º ESO C', 'mat3c'], ['16:00', 'Reunión del departamento de Matemáticas']]},
  {t: 'Viernes, 6 de noviembre', f: 'Viernes 6/11', r: [['08:00', 'Claustro extraordinario · Sala de profesores'], ['09:30', 'Física · 1º ESO A', 'fis1a'], ['12:30', 'Matemáticas · 3º ESO C', 'mat3c']]}
];
const AREAS = [
  {n: 'Matemáticas', red: 'MAT', al: 70, sec: ['2º ESO B', '3º ESO C', '1º BACH A']},
  {n: 'Física', red: 'FIS', al: 50, sec: ['1º ESO A', '2º ESO B']},
  {n: 'Tutoría de 2º ESO B', red: 'TUT', al: 26, sec: ['2º ESO B']},
  {n: 'Refuerzo de Matemáticas', red: 'REF-MAT', al: 12, sec: ['2º ESO B']}
];
const byId = (id) => items.filter((x) => x.id === id)[0];
const dayLabel = (off) => {
  const d = new Date(2026, 10, 4); d.setDate(d.getDate() - off);
  return (off === 0 ? 'Hoy' : off === 1 ? 'Ayer' : 'Hace ' + off + ' días') + ' · ' + d.toLocaleDateString('es-ES', {weekday: 'long', day: 'numeric', month: 'short'});
};
/* Fotos de ejemplo: retratos ilustrados (sin personas reales, los alumnos son menores), generados aquí. Cada alumno tiene su aspecto: sexo según el nombre, tonos de piel, peinados y gafas variados. Si no hay ficha, iniciales. */
const AV_SPEC = {
  'Sergio Prieto': ['#f1c9a5', '#3b2a1f', 'side', '#2a80b5'], 'Marcos Santos': ['#8d5a3b', '#1c1410', 'short', '#10855b'], 'Daniel Ortiz': ['#c68a5e', '#2a1b12', 'curly', '#d9822b'],
  'Pablo Gómez': ['#f3d2b5', '#c47b3b', 'short', '#6352c7', 1], 'Adrián Castro': ['#6b4129', '#0f0b09', 'buzz', '#285a92'], 'Lucas Pardo': ['#e0ac82', '#5a3a22', 'side', '#b6153a'],
  'Javier Ortega': ['#d9a37a', '#1c1410', 'short', '#3fa7a3', 1], 'Hugo Medina': ['#f1c9a5', '#d8b45a', 'curly', '#8a60a8'], 'Iván Barroso': ['#b87c52', '#2a1b12', 'short', '#daa46e'],
  'Nora Lozano': ['#d49a70', '#2a1b12', 'long', '#e79aa8'], 'Alicia Ramos': ['#f1c9a5', '#8a4b2a', 'pony', '#54a0d2'], 'Clara Vidal': ['#7a4a30', '#120d0b', 'afro', '#daa46e'],
  'Irene Navarro': ['#f3d2b5', '#d8b45a', 'bob', '#7cbf86', 1], 'Sofía Ruiz': ['#c68a5e', '#1c1410', 'braids', '#7cbf86'], 'Lucía Vega': ['#e0ac82', '#3b2a1f', 'bun', '#95a2d8'],
  'Elena Castro': ['#8d5a3b', '#1c1410', 'bob', '#b378ba'], 'Elena Vidal': ['#f1c9a5', '#5a3a22', 'long', '#2a80b5'], 'Carla Jiménez': ['#d49a70', '#2a1b12', 'pony', '#f2b134']
};
const AV_BG = ['#E1EDF8', '#EAF7EA', '#FDF9E8', '#F0E6F5', '#FFF4F4', '#E4F6F5'];
const AV_FRONT = {
  short: (c) => '<path d="M51 72C47 44 64 36 80 36s33 8 29 36c-4-14-14-20-29-20s-25 6-29 20z" fill="' + c + '"/>',
  buzz: (c) => '<path d="M52 68C52 48 66 42 80 42s28 6 28 26c-5-11-14-15-28-15S57 57 52 68z" fill="' + c + '"/>',
  side: (c) => '<path d="M50 74C45 44 76 28 101 42c11 6 10 22 8 32-3-13-15-20-39-18-9 1-16 8-20 18z" fill="' + c + '"/>',
  curly: (c) => [56, 67, 80, 93, 104].map((x, i) => '<circle cx="' + x + '" cy="' + (i % 2 ? 44 : 48) + '" r="11" fill="' + c + '"/>').join('') + '<circle cx="50" cy="62" r="8" fill="' + c + '"/><circle cx="110" cy="62" r="8" fill="' + c + '"/>',
  afro: (c) => '<path d="M52 66c2-12 12-18 28-18s26 6 28 18c-6-8-16-11-28-11S58 58 52 66z" fill="' + c + '"/>',
  long: (c) => '<path d="M51 70C55 48 105 48 109 70c-8-10-16-14-29-14S59 60 51 70z" fill="' + c + '"/>',
  bob: (c) => '<path d="M51 70C55 48 105 48 109 70c-8-10-16-14-29-14S59 60 51 70z" fill="' + c + '"/>',
  pony: (c) => AV_FRONT.short(c), bun: (c) => AV_FRONT.short(c),
  braids: (c) => '<path d="M50 72C46 42 64 34 80 34s34 8 30 38c-6-14-18-20-30-20S56 58 50 72z" fill="' + c + '"/>'
};
const AV_BACK = {
  afro: (c) => '<circle cx="80" cy="62" r="39" fill="' + c + '"/>',
  long: (c) => '<path d="M47 72C43 40 62 32 80 32s37 8 33 40l4 54c-16 8-58 8-74 0z" fill="' + c + '"/>',
  bob: (c) => '<path d="M48 76C44 42 64 34 80 34s36 8 32 42l-2 26c-12 6-48 6-60 0z" fill="' + c + '"/>',
  pony: (c) => '<path d="M104 54c28 2 30 40 8 62 5-22-1-40-14-50z" fill="' + c + '"/>',
  bun: (c) => '<circle cx="80" cy="31" r="12" fill="' + c + '"/>',
  braids: (c) => '<g fill="none" stroke="' + c + '" stroke-width="9" stroke-linecap="round"><path d="M51 80c-8 14-10 30-5 46"/><path d="M109 80c8 14 10 30 5 46"/></g>'
};
const avatar = (name) => {
  const sp = AV_SPEC[name], ini = name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  if (!sp) return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#E1EDF8"/><text x="80" y="98" font-size="56" font-family="Nunito,Arial" font-weight="700" fill="#285A92" text-anchor="middle">' + ini + '</text></svg>');
  const skin = sp[0], hair = sp[1], st = sp[2], shirt = sp[3], k = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const g = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160"><rect width="160" height="160" fill="' + AV_BG[k % AV_BG.length] + '"/>'
    + '<path d="M18 160C18 128 46 114 80 114s62 14 62 46z" fill="' + shirt + '"/>'
    + (AV_BACK[st] ? AV_BACK[st](hair) : '')
    + '<rect x="68" y="94" width="24" height="26" rx="9" fill="' + skin + '"/><rect x="68" y="94" width="24" height="26" rx="9" fill="#000" opacity=".08"/>'
    + '<circle cx="51" cy="77" r="5.5" fill="' + skin + '"/><circle cx="109" cy="77" r="5.5" fill="' + skin + '"/>'
    + '<ellipse cx="80" cy="74" rx="29" ry="33" fill="' + skin + '"/>'
    + AV_FRONT[st](hair)
    + '<circle cx="70" cy="77" r="2.7" fill="#2b2b2b"/><circle cx="90" cy="77" r="2.7" fill="#2b2b2b"/>'
    + '<path d="M63 68q6-3 12 0M85 68q6-3 12 0" fill="none" stroke="#2b2b2b" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>'
    + '<path d="M72 90q8 6 16 0" fill="none" stroke="#7a3f2b" stroke-width="2.4" stroke-linecap="round"/>'
    + (sp[4] ? '<g fill="none" stroke="#333" stroke-width="2"><circle cx="70" cy="77" r="8.5"/><circle cx="90" cy="77" r="8.5"/><path d="M78.5 77h3"/></g>' : '')
    + '</svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(g);
};

/* ── Helpers de componentes (API real) ── */
const panel = $('panel');
const pad = (child, p) => { const d = el('div'); d.style.padding = p || '14px'; d.appendChild(child); return d; };
const tree = (data, o) => { const t = document.createElement('tree-list'); Object.assign(t, o || {}); t.data = data; return t; };
const sec = (label, kids, attrs) => {
  const s = document.createElement('content-section'); s.setAttribute('label', label); s.setAttribute('borderless', ''); s.setAttribute('header-divider', '');
  Object.keys(attrs || {}).forEach((k) => s.setAttribute(k, attrs[k]));
  kids.forEach((k) => s.appendChild(k)); return s;
};
const status = (text, st) => ({text: text, status: st, variant: 'outline'});
const form = (schema, readonly) => { const f = document.createElement('dynamic-form'); if (readonly) f.readonly = true; f.render(schema); return f; };
const banner = (msg, type, dismissible) => { const b = document.createElement('wc-banner'); b.type = type || 'success'; b.message = msg; b.dismissible = dismissible !== false; return b; };
function flash(host, msg) {
  if (!host) return;
  const wrap = el('div'); wrap.style.padding = '14px 14px 0'; wrap.appendChild(banner(msg)); host.insertBefore(wrap, host.firstChild);
  setTimeout(() => { if (wrap.parentNode) wrap.remove(); }, 3500);
}
const flashPanel = (msg) => setTimeout(() => flash(panel.querySelector('[slot="body"]'), msg), 50);
function open(cfg) { if (panel.shadowRoot) panel.shadowRoot.querySelectorAll('.header-left-addon .fh-photo').forEach((x) => x.remove()); panel.loadContext(cfg); panel.open(); }
function placeholder(code, label) {
  const b = el('div'); b.style.padding = '14px'; b.appendChild(banner('Módulo en construcción en este prototipo.', 'info', false));
  return {header: {title: label, subtitle: 'Panel del profesor', icon: hdrIcon(code)}, body: b};
}

/* ── Incidencias (contenido del prototipo de Laura; patrones del panel-incidencias del design system) ── */
const S = {mode: 'ambas', grupo: 'todas', tab: 'pend'};
let inStep1 = false;
const incMatches = (i) => {
  const tut = TUT.indexOf(i.grupo) > -1 && (S.grupo === 'todas' || i.grupo === S.grupo), prof = MIS.indexOf(i.asig) > -1;
  return S.mode === 'tutor' ? tut : S.mode === 'prof' ? prof : (tut || prof);
};
const incList = (estado) => items.filter((i) => i.estado === estado && incMatches(i)).sort((a, b) => a.off - b.off || b.min - a.min);
const incCount = (name) => items.filter((i) => i.alumno === name && i.estado === 'pendiente').length;

function panelInc(opt) {
  opt = opt || {};
  S.mode = opt.mode || 'ambas'; S.grupo = opt.grupo || 'todas'; S.tab = opt.tab || 'pend';
  const body = el('div'), top = el('div'); top.style.cssText = 'padding:14px;display:flex;flex-direction:column;gap:12px';
  const seg = document.createElement('button-bar');
  const grupo = document.createElement('wc-select'); grupo.label = 'Tutoría';
  grupo.options = [{value: 'todas', label: 'Todas mis tutorías'}].concat(TUT.map((g) => ({value: g, label: g}))); grupo.value = S.grupo;
  const vista = document.createElement('wc-select'); vista.label = 'Estado';
  const fila = el('div'); fila.style.cssText = 'display:flex;gap:12px'; [grupo, vista].forEach((s) => { s.style.cssText = 'flex:1;min-width:0'; fila.appendChild(s); });
  top.appendChild(seg); top.appendChild(fila);
  const lists = {};
  ['pend', 'aceptar'].forEach((k) => { lists[k] = tree([], {multiselect: true, defaultSelectable: true, showSelectAll: true, buttonsOnFocus: true, nodeHeight: '66px', disablePagination: true, emptyText: 'No hay incidencias con este filtro.'});
    /* una sola barra de scroll: la del panel; la lista crece con su contenido */
    const sh = new CSSStyleSheet(); sh.replaceSync('.wctl-tree-root{overflow:visible!important;max-height:none!important}'); if (lists[k].shadowRoot) lists[k].shadowRoot.adoptedStyleSheets = [...lists[k].shadowRoot.adoptedStyleSheets, sh]; });
  const caja = el('div'); caja.style.cssText = 'padding:0 14px 14px';
  /* Justificar en un solo paso: motivo y observaciones debajo de la lista, el CTA vive en el pie */
  let motivo = null;
  const jf = el('div'), tiles = el('div', 'tiles'), obsHost = el('div');
  tiles.setAttribute('role', 'radiogroup'); tiles.setAttribute('aria-label', 'Motivo');
  MOTIVOS.forEach((m) => {
    const t = el('button', 'tile', '<span class="tile-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' + MOTIVO_SVG[m.i] + '</svg></span>' + esc(m.t));
    t.type = 'button'; t.setAttribute('role', 'radio'); t.setAttribute('aria-checked', 'false');
    t.onclick = () => { motivo = m.t; tiles.querySelectorAll('.tile').forEach((x) => x.setAttribute('aria-checked', x === t ? 'true' : 'false')); };
    tiles.appendChild(t);
  });
  const nuevaObs = () => form([{id: 'obs', type: 'textarea', label: 'Observaciones de la justificación', placeholder: 'Opcional', rows: 3, columns: 12}]);
  let obs = nuevaObs(); obsHost.appendChild(obs);
  jf.appendChild(pad(sec('Motivo', [tiles]), '0 14px')); jf.appendChild(pad(obsHost, '14px'));
  body.appendChild(top); body.appendChild(caja); body.appendChild(jf);
  const selPend = () => (lists.pend.value || []).map(Number).filter((x) => !isNaN(x) && byId(x));
  function aplicar() {
    const sel = selPend(), n = sel.length;
    if (!n) return;
    if (!motivo) { body.scrollIntoView({block: 'start'}); flash(body, 'Selecciona un motivo para aplicar la justificación'); return; }
    const o = (obs.getData() || {}).obs || '';
    sel.forEach((id) => { const i = byId(id); i.estado = 'por_aceptar'; i.motivo = motivo; i.obsJ = o; });
    motivo = null; tiles.querySelectorAll('.tile').forEach((x) => x.setAttribute('aria-checked', 'false'));
    obs = nuevaObs(); obsHost.replaceChildren(obs);
    refresh(); body.scrollIntoView({block: 'start'});
    flash(body, n + ' incidencia' + (n > 1 ? 's justificadas' : ' justificada'));
  }

  function node(i, acc) {
    return {
      id: String(i.id), title: i.alumno + ' · Nº ' + i.n,
      subtitle: i.asig + ' · ' + i.hora.replace(/ · .*/, '') + ' · ' + i.grupo + (acc ? ' · ' + i.motivo : ''),
      image: {value: avatar(i.alumno), maxWidth: '40px'},
      rightTitle: status(i.tipo, acc ? 'success' : (i.tipo === 'Falta' ? 'error' : 'warning')), rightSubtitle: dayLabel(i.off),
      onClick: acc ? () => step2([i.id]) : undefined,
      buttons: acc ? [{id: 'a' + i.id, title: 'Aceptar justificación', class: 'aceptar', callback: () => step2([i.id])}] : []
    };
  }
  function groups(list, acc) {
    const hoy = list.filter((i) => i.off === 0), ant = list.filter((i) => i.off > 0), d = [];
    if (hoy.length) d.push({id: 'h' + acc, title: 'Hoy · ' + hoy.length, expanded: true, selectable: false, children: hoy.map((i) => node(i, acc))});
    if (ant.length) d.push({id: 'a' + acc, title: 'Anteriores · ' + ant.length, expanded: !hoy.length, selectable: false, children: ant.map((i) => node(i, acc))});
    return d;
  }
  function footer() {
    const acc = S.tab === 'aceptar';
    jf.style.display = acc ? 'none' : '';
    if (!inStep1) return;
    const sel = (lists[S.tab].value || []).map(Number).filter((x) => !isNaN(x) && byId(x)), n = sel.length;
    if (acc) { panel.refreshFooter({buttons: n ? [{label: 'Aceptar ' + n + ' seleccionada' + (n > 1 ? 's' : ''), variant: 'primary', callback: () => step2(sel.slice())}] : []}); return; }
    panel.refreshFooter({buttons: [
      {label: n > 1 ? 'Aplicar a ' + n + ' incidencias' : 'Aplicar justificación', variant: 'primary', disabled: !n, callback: aplicar},
      {label: 'Cancelar', variant: 'light', callback: () => panel.close()}
    ]});
  }
  function refresh() {
    const modes = [['tutor', 'Como tutor'], ['prof', 'Como profesor'], ['ambas', 'Tutor y profesor']];
    seg.buttons = modes.map((m) => ({id: m[0], label: m[1], variant: S.mode === m[0] ? 'primary' : 'outline-primary', size: 'sm', shape: 'pill', callback: () => { S.mode = m[0]; refresh(); }}));
    grupo.style.display = S.mode === 'prof' ? 'none' : '';
    const lp = incList('pendiente'), la = incList('por_aceptar');
    lists.pend.data = groups(lp, false); lists.aceptar.data = groups(la, true);
    vista.options = [{value: 'pend', label: 'Pendientes de justificar (' + lp.length + ')'}, {value: 'aceptar', label: 'Justificaciones por aceptar (' + la.length + ')'}];
    vista.value = S.tab; caja.replaceChildren(lists[S.tab]);
    if (inStep1) panel.refreshHeader({title: 'Incidencias de aula', subtitle: {tutor: 'Vista de tutor', prof: 'Vista de profesor', ambas: 'Vista de tutor y profesor'}[S.mode], icon: hdrIcon('incidencias')});
    syncHome(); footer();
  }
  grupo.addEventListener('change', () => { S.grupo = grupo.value; refresh(); });
  vista.addEventListener('change', () => { if (!vista.value || vista.value === S.tab) return; S.tab = vista.value; caja.replaceChildren(lists[S.tab]); footer(); });
  Object.keys(lists).forEach((k) => lists[k].addEventListener('change', footer));

  function step2(ids) {
    const acc = byId(ids[0]).estado === 'por_aceptar', n = ids.length, one = n === 1 ? byId(ids[0]) : null;
    let motivo = null;
    const b2 = el('div');
    if (one) {
      b2.appendChild(pad(form([
        {id: 'al', type: 'text', label: 'Alumno', value: one.alumno + ' · Nº ' + one.n, columns: 12},
        {id: 'gr', type: 'text', label: 'Grupo', value: one.grupo + (TUT.indexOf(one.grupo) > -1 ? ' · Tutoría' : ''), columns: 6},
        {id: 'as', type: 'text', label: 'Asignatura', value: one.asig + (MIS.indexOf(one.asig) > -1 ? ' · Mi asignatura' : ''), columns: 6},
        {id: 'ti', type: 'text', label: 'Tipo', value: one.tipo, columns: 6},
        {id: 'ho', type: 'text', label: 'Hora', value: one.hora, columns: 6},
        {id: 'di', type: 'text', label: 'Día', value: dayLabel(one.off), columns: 12}
      ].concat(acc ? [{id: 'mo', type: 'text', label: 'Motivo indicado por la familia', value: one.motivo, columns: 12}, {id: 'ob', type: 'textarea', label: 'Obs. justificación', value: one.obsJ || 'Sin observaciones', rows: 2, columns: 12}] : []), true), '14px 14px 0'));
    } else {
      b2.appendChild(pad(tree(ids.map((id) => { const i = byId(id); return {id: id, title: i.alumno + ' · Nº ' + i.n, subtitle: i.asig + ' · ' + i.tipo + ' · ' + dayLabel(i.off) + (acc ? ' · ' + i.motivo : ''), image: {value: avatar(i.alumno), maxWidth: '40px'}}; }), {nodeHeight: '62px', disablePagination: true}), '14px 14px 0'));
    }
    if (!acc) {
      const tiles = el('div', 'tiles'); tiles.setAttribute('role', 'radiogroup'); tiles.setAttribute('aria-label', 'Motivo');
      MOTIVOS.forEach((m) => {
        const t = el('button', 'tile', '<span class="tile-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' + MOTIVO_SVG[m.i] + '</svg></span>' + esc(m.t));
        t.type = 'button'; t.setAttribute('role', 'radio'); t.setAttribute('aria-checked', 'false');
        t.onclick = () => { motivo = m.t; tiles.querySelectorAll('.tile').forEach((x) => x.setAttribute('aria-checked', x === t ? 'true' : 'false')); foot(true); };
        tiles.appendChild(t);
      });
      b2.appendChild(pad(sec('Motivo', [tiles]), '14px 14px 0'));
    }
    const obs = form([{id: 'obs', type: 'textarea', label: acc ? 'Observaciones de la aceptación' : 'Observaciones de la justificación', placeholder: 'Opcional', rows: 3, columns: 12}]);
    b2.appendChild(pad(obs));
    const foot = (on) => panel.refreshFooter({buttons: [
      {label: acc ? (n === 1 ? 'Aceptar justificación' : 'Aceptar ' + n + ' justificaciones') : (n === 1 ? 'Aplicar justificación' : 'Aplicar a ' + n + ' incidencias'), variant: 'primary', disabled: !acc && !on, callback: () => apply()},
      {label: 'Cancelar', variant: 'light', callback: () => panel.goBack()}
    ]});
    const apply = () => {
      const o = (obs.getData() || {}).obs || '';
      ids.forEach((id) => { const i = byId(id); if (acc) { i.estado = 'aceptada'; i.obsA = o; } else { i.estado = 'por_aceptar'; i.motivo = motivo; i.obsJ = o; } });
      const pl = n > 1 ? 's' : '';
      flash(body, n + ' incidencia' + pl + (acc ? ' aceptada' : ' justificada') + pl);
      panel.goBack();
    };
    inStep1 = false;
    panel.navigate({
      header: {title: acc ? 'Aceptar justificación' : 'Justificar incidencias', subtitle: one ? one.alumno : n + ' seleccionadas', icon: hdrIcon('incidencias')},
      body: b2, footer: {buttons: []}, onBack: () => { inStep1 = true; refresh(); }
    });
    foot(false);
  }

  inStep1 = true;
  open({header: {title: 'Incidencias de aula', subtitle: 'Vista de tutor y profesor', icon: hdrIcon('incidencias')}, body: body});
  refresh();
  if (opt.alumno || opt.todas) {
    const est = S.tab === 'aceptar' ? 'por_aceptar' : 'pendiente', lista = lists[S.tab === 'aceptar' ? 'aceptar' : 'pend'];
    const ids = incList(est).filter((i) => !opt.alumno || i.alumno === opt.alumno).map((i) => i.id);
    setTimeout(() => { lista.value = ids.map(String); footer(); }, 80);
  }
}

/* ── Paneles de webpart (webpart-botonera.js: _abrirConDetalle) ── */
function webpartPanel(code, label, nodes, o) {
  o = o || {};
  const t = tree(nodes, {searchable: true, nodeHeight: '65px', pageSize: 15, emptyText: o.empty || 'No hay datos nuevos'});
  const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;height:100%'; t.style.flex = '1'; wrap.appendChild(t);
  open({header: {title: label, icon: hdrIcon(code)}, actions: o.actions ? {buttons: o.actions} : null, body: wrap});
}
function panelAlumnos() {
  const nodes = Object.keys(ALU).slice(0, 9).map((n) => ({id: n, title: n, subtitle: GRUPO, image: {value: avatar(n), maxWidth: '40px'},
    buttons: [{id: 'c' + n, title: 'Comunicado', class: 'comunicado', callback: () => { miniFichaAlumno(n); panel.navigate(comunicadoCfg(n)); }}], onClick: () => miniFichaAlumno(n)}));
  webpartPanel('alumnos', 'Mis alumnos', nodes);
}
function panelAreas() {
  const nodes = AREAS.map((a) => ({id: a.n, title: a.n, subtitle: a.al + ' Alumnos', icon: {name: 'area', shape: 'circle'}, rightTitle: 'Secciones', rightSubtitle: a.sec.join(', '), onClick: () => miniFichaArea(a)}));
  webpartPanel('areas', 'Mis áreas', nodes);
}
function panelSecciones() {
  const nodes = [['2º ESO B', '2B', 26, 'ESO'], ['1º ESO A', '1A', 24, 'ESO'], ['3º ESO C', '3C', 24, 'ESO'], ['1º BACH A', 'B1A', 20, 'Bachillerato']].map((s) => ({id: s[0], title: s[0] + ' (' + s[1] + ')', subtitle: s[2] + ' Alumnos', icon: {name: 'mis-secciones', shape: 'circle'}, rightTitle: 'Estudio', rightSubtitle: s[3], onClick: () => miniFichaSeccion(s)}));
  webpartPanel('secciones', 'Secciones', nodes);
}
function panelComunicados() {
  const nodes = [['Convocatoria del claustro extraordinario', 'Jefatura de Estudios', '04/11/2026', 'envelope'], ['Salida al Museo Nacional de Ciencias Naturales', 'Dirección del Centro', '03/11/2026', 'envelope'], ['Resultados de la evaluación inicial', 'Equipo de Orientación', '30/10/2026', 'envelope-open']]
    .map((c, k) => ({id: 'c' + k, title: c[0], subtitle: 'De: ' + c[1], icon: {name: c[3], shape: 'circle'}, rightTitle: 'Fecha', rightSubtitle: c[2]}));
  webpartPanel('comunicados', 'Comunicados', nodes, {actions: [{id: 'red', label: 'Redactar', class: 'redactar', textOut: true, callback: () => panel.navigate(redactarGeneral())}, {id: 'act', label: 'Actualizar', class: 'actualizar', textOut: true}]});
}
/* ── Entrevistas ──
   Modelo real: controllers/comunicacion/entrevista.js (mini ficha: campos, orden, qué se omite según estado, acciones Aceptar / Cancelar / Realizada,
   colores de estado) y design_system/pantallas/panel-entrevistas (listado con wc-status, acciones del panel, solicitud como paso del propio panel).
   Contexto de la maqueta: Laura es tutora de 2º ESO B. Las entrevistas son con las familias de sus tutorizados, las pide la familia o ella misma,
   y salen de lo que ya ve en la home (convivencia, absentismo, rendimiento). */
const ENT_COLOR = {Solicitada: 'warning', Aceptada: 'info', Cancelada: 'error', Realizada: 'success'};
const ENTREVISTAS = [
  {id: 'e1', alumno: 'Iván Barroso', sec: '2º ESO B', fecha: '06/11/2026', hora: '16:00 - 16:30', estado: 'Solicitada', deFamilia: true, famNombre: 'Fam. Barroso Gómez', asunto: 'Seguimiento académico', lugar: 'Centro', solicitante: 'Fam. Barroso Gómez', quedan: '2 días',
    motivo: 'La familia quiere hablar del seguimiento académico de Iván.', fam: [['Javier Barroso', 'Padre', true], ['Elena Gómez', 'Madre', true], ['Iván Barroso', 'Alumno', false]]},
  {id: 'e6', alumno: 'Elena Vidal', sec: '2º ESO B', fecha: '09/11/2026', hora: '17:00 - 17:30', estado: 'Solicitada', deFamilia: true, famNombre: 'Fam. Vidal Torres', asunto: 'Convivencia en el aula', lugar: 'Online', solicitante: 'Fam. Vidal Torres', quedan: '5 días',
    motivo: 'La familia quiere hablar de la convivencia en el aula.', fam: [['Tomás Vidal', 'Padre', true], ['Marta Torres', 'Madre', true], ['Elena Vidal', 'Alumno', false]]},
  {id: 'e2', alumno: 'Marcos Santos', sec: '2º ESO B', fecha: '06/11/2026', hora: '12:30 - 13:00', estado: 'Aceptada', lugar: 'Centro', solicitante: 'Laura García', quedan: '2 días',
    motivo: 'Faltas repetidas a primera hora y dos materias por debajo de 5.', fam: [['Pedro Santos Roca', 'Padre', true], ['Lucía Pons Vera', 'Madre', true], ['Marcos Santos', 'Alumno', true]]},
  {id: 'e3', alumno: 'Pablo Gómez', sec: '2º ESO B', fecha: '04/11/2026', hora: '11:45 - 12:15', estado: 'Aceptada', lugar: 'Centro', solicitante: 'Laura García', quedan: '2 h 42 min',
    motivo: 'Amonestación por el uso del móvil y tres retrasos esta semana.', fam: [['Carlos Gómez Núñez', 'Padre', true], ['Inés Rubio Peña', 'Madre', true], ['Pablo Gómez', 'Alumno', false]]},
  {id: 'e4', alumno: 'Daniel Ortiz', sec: '2º ESO B', fecha: '30/10/2026', hora: '15:00 - 15:30', estado: 'Cancelada', porFamilia: true, enterado: false, famNombre: 'Fam. Ortiz Díaz', lugar: 'Online', solicitante: 'Laura García',
    motivo: 'La familia no puede asistir a esa hora y pedirá otra cita.', motivoCancel: 'Motivo laboral de los tutores. Rogamos disculpen las molestias y solicitaremos nueva fecha.', fam: [['Iván Ortiz Lara', 'Padre', false], ['Marta Díaz Soler', 'Madre', false]]},
  {id: 'e5', alumno: 'Nora Lozano', sec: '2º ESO B', fecha: '28/10/2026', hora: '10:00 - 10:30', estado: 'Realizada', lugar: 'Centro', solicitante: 'Clara Vega Ruiz (madre)',
    motivo: 'Preocupación por las notas de Matemáticas, Física y Lengua.',
    tema: 'Se repasan las tres materias por debajo de 5 y el tiempo de estudio en casa.', acuerdo: 'La familia supervisará las tareas a diario. Nueva revisión después de la evaluación.',
    fam: [['Clara Vega Ruiz', 'Madre', true], ['Nora Lozano', 'Alumno', true]]}
];
const ENT_ORDEN = ['Solicitada', 'Aceptada', 'Cancelada', 'Realizada'];
let ENT_LISTA = null;
const entStatus = (e) => ({text: e.estado, status: ENT_COLOR[e.estado], variant: 'outline'});
/* Lo que espera una respuesta de Laura sale en tarjetas arriba del panel; el listado trae el resto (o todo, con «Ver todas las entrevistas») */
let ENT_TODAS = false;
const entFam = (e) => e.famNombre || 'Fam. ' + (e.fam && e.fam[0] ? (e.fam[0][0].split(' ').slice(1).join(' ') || e.fam[0][0]) : e.alumno);
const entPendiente = (e) => e.estado === 'Solicitada' || (e.estado === 'Cancelada' && e.porFamilia && !e.enterado);
const entNodos = () => ENTREVISTAS.filter((e) => ENT_TODAS || !entPendiente(e)).sort((a, b) => ENT_ORDEN.indexOf(a.estado) - ENT_ORDEN.indexOf(b.estado)).map((e) => ({
  id: e.id, title: e.alumno, subtitle: 'Fecha: ' + e.fecha + ' (' + e.hora + ')', image: {value: avatar(e.alumno), maxWidth: '40px'}, rightTitle: entStatus(e), onClick: () => entFicha(e)
}));

/* Campos de la mini ficha para el rol empleado, omitiendo según el estado igual que _filtrarCamposEntrevista */
function entSchema(e) {
  const f = [
    {id: 'estado', label: 'Estado', type: 'status', variant: 'outline', status: ENT_COLOR[e.estado], value: e.estado, columns: 4},
    {id: 'fecha', label: 'Fecha', type: 'text', value: e.fecha, columns: 4},
    {id: 'hora', label: 'Hora', type: 'text', value: e.hora, columns: 4},
    {id: 'foto', type: 'image', columns: 4, rows: 2, value: avatar(e.alumno), maxWidth: '160px', newRow: true},
    {id: 'alumno', label: 'Alumno', type: 'text', value: e.alumno, columns: 8, buttons: [{title: 'Mini ficha', class: 'mini_ficha', callback: () => miniFichaAlumno(e.alumno)}]},
    {id: 'secciones', label: 'Secciones', type: 'text', value: e.sec, columns: 8},
    {id: 'lugar', label: 'Lugar', type: 'text', value: e.lugar, columns: 4},
    {id: 'responsable', label: 'Responsable', type: 'text', value: 'Laura García', columns: 4},
    {id: 'solicitante', label: 'Solicitante', type: 'text', value: e.solicitante, columns: 4}
  ];
  if (e.estado === 'Cancelada') f.push({id: 'motivo', label: 'Motivo', type: 'textarea', columns: 12, textareaRows: 3, value: e.motivoCancel || e.motivo});
  else f.push({id: 'motivoEntrevista', label: 'Motivo de la entrevista', type: 'textarea', columns: 12, textareaRows: 3, value: e.motivo});
  if (e.estado === 'Realizada') {
    f.push({id: 'temaTratado', label: 'Temas tratados', type: 'textarea', columns: 12, textareaRows: 3, value: e.tema || ''});
    f.push({id: 'acuerdo', label: 'Acuerdos', type: 'textarea', columns: 12, textareaRows: 3, value: e.acuerdo || ''});
  }
  /* Participantes: sección plegable, cada uno plegado con Lugar y Asiste (Ha asistido si ya se realizó); en Cancelada no hay casillas de asistencia */
  const asist = e.estado === 'Realizada' ? 'Ha asistido' : 'Asiste';
  f.push({id: 'participantes', label: 'Participantes', type: 'section', collapsable: true, borderless: true, fields: e.fam.map((p, i) => ({
    id: 'p' + i, type: 'section', label: p[0] + ' (' + p[1] + ')', collapsable: true, collapsed: true, borderless: true,
    fields: [{id: 'pl' + i, label: 'Lugar', type: 'text', value: e.lugar, columns: e.estado === 'Cancelada' ? 12 : 6}]
      .concat(e.estado === 'Cancelada' ? [] : [{id: 'pa' + i, label: asist, type: 'checkbox', value: p[2], columns: 6}])
  }))});
  return f;
}
function entForm(e) {
  const fm = form(entSchema(e), true); fm.setAttribute('data-guid', e.id); return fm;
}
/* Acciones del servidor (Aceptar 2, Cancelar 3, Realizada 13): aquí solo las que corresponden al estado */
function entAcciones(e) {
  const a = [];
  if (e.estado === 'Solicitada') a.push({label: 'Aceptar', title: 'Aceptar', class: 'check', textOut: true, callback: () => { e.estado = 'Aceptada'; entRefrescar(e); }});
  if (e.estado === 'Aceptada') a.push({label: 'Realizada', title: 'Marcar como realizada', class: 'check', textOut: true, callback: () => { entRealizada(e); }});
  if (e.estado === 'Solicitada' || e.estado === 'Aceptada') a.push({label: 'Cancelar', title: 'Cancelar', class: 'cruz', textOut: true, callback: () => entCancelar(e)});
  return a;
}
const entHeader = (e) => ({title: 'Entrevista', subtitle: (e.estado === 'Solicitada' || e.estado === 'Aceptada') && e.quedan ? 'Quedan ' + e.quedan + '...' : '', icon: hdrIcon('entrevistas'), navBtn: {text: 'Ver ficha completa', url: '#', callback: () => {}}});
function entFicha(e) {
  const b = el('div'); b.appendChild(entForm(e));
  panel.navigate({header: entHeader(e), actions: {buttons: entAcciones(e)}, body: b});
}
/* Como _actualizarPanelConDatos: sustituye el formulario, refresca acciones y cabecera y actualiza la fila del listado sin recargarlo */
function entRefrescar(e) {
  const viejo = document.querySelector('[data-guid="' + e.id + '"]');
  if (viejo) viejo.replaceWith(entForm(e));
  panel.refreshHeader(entHeader(e));
  panel.refreshActions({buttons: entAcciones(e)});
  if (ENT_LISTA) ENT_LISTA.updateNode(e.id, {rightTitle: entStatus(e)});
  flashPanel('Entrevista ' + e.estado.toLowerCase().replace(/a$/, 'a'));
}
function entRealizada(e) {
  e.estado = 'Realizada';
  entRefrescar(e);
}
/* El producto pide el motivo en un diálogo obligatorio; aquí es un paso del panel */
function entCancelar(e) {
  const fm = form([{id: 's', type: 'section', borderless: true, fields: [{id: 'motivo', label: 'Motivo de la cancelación', type: 'textarea', required: true, columns: 12, textareaRows: 4}]}]);
  const b = el('div'); b.appendChild(fm);
  panel.navigate({header: {title: 'Cancelar entrevista', subtitle: e.alumno + ' · ' + e.fecha, icon: hdrIcon('entrevistas')}, body: b, footer: {buttons: [
    {label: 'Cancelar entrevista', variant: 'primary', callback: () => {
      const d = fm.getData(), motivo = (d.motivo || '').trim();
      if (!motivo) { fm.validate(); return; }
      e.estado = 'Cancelada'; e.motivoCancel = motivo; panel.goBack(); entRefrescar(e);
    }},
    {label: 'Volver', callback: () => panel.goBack()}
  ]}});
}
const ENT_DISP = [5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27];
function entCalendario(sel, onPick) {
  /* Franjas de hora del día elegido en el campo de fecha (Mañana / Tarde). Noviembre 2026. */
  const hm = (m) => (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60);
  const FR = [[540, 'Mañana'], [900, 'Tarde']].map((g, i) => ({t: g[1], h: Array.from({length: i ? 6 : 9}, (_, k) => g[0] + k * 30)}));
  const st = el('style');
  st.textContent = '.fe{grid-column:1/-1;display:flex;flex-direction:column;gap:12px;padding:0 10px 8px;font-family:inherit;box-sizing:border-box;min-width:0}'
    + '.fe-g{display:flex;flex-direction:column;gap:6px}.fe-g span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8896a5}'
    + '.fe-hs{display:flex;flex-wrap:wrap;gap:6px}'
    + '.fe-h{border:1px solid #dbe3ec;background:#fff;border-radius:30px;padding:5px 12px;font-size:13px;font-family:inherit;color:#285A92;cursor:pointer}'
    + '.fe-h:hover:not(:disabled){border-color:#285A92;background:#eef4fb}.fe-h.on{background:#285A92;border-color:#285A92;color:#fff}'
    + '.fe-h:disabled{color:#b4bfcb;background:#f4f6f9;text-decoration:line-through;cursor:default}';
  const root = el('div', 'fe'); root.appendChild(st);
  const hs = el('div', 'fe-g'); root.appendChild(hs);
  function elige(d) {
    hs.innerHTML = '';
    let marcada = false;
    FR.forEach((g) => {
      const caja = el('div', 'fe-g'), fila = el('div', 'fe-hs'); caja.appendChild(el('span', '', g.t));
      g.h.forEach((m) => {
        const ocupada = (d * 7 + m / 30) % 5 === 0, b = el('button', 'fe-h', hm(m)); b.type = 'button';
        b.setAttribute('aria-label', hm(m) + ' a ' + hm(m + 30));
        if (ocupada) { b.disabled = true; b.title = 'Franja no disponible'; }
        else {
          if (!marcada) { b.classList.add('on'); marcada = true; onPick(d, hm(m) + ' - ' + hm(m + 30)); }
          b.title = hm(m) + ' a ' + hm(m + 30);
          b.onclick = () => { Array.prototype.forEach.call(hs.querySelectorAll('.fe-h.on'), (o) => o.classList.remove('on')); b.classList.add('on'); onPick(d, hm(m) + ' - ' + hm(m + 30)); };
        }
        fila.appendChild(b);
      });
      caja.appendChild(fila); hs.appendChild(caja);
    });
  }
  root.setDia = elige; elige(sel);
  return root;
}
/* Solicitar entrevista: un nivel más del mismo panel (esquema de panel-entrevistas) con los campos del producto */
function entSolicitar(opt) {
  opt = opt || {};
  const nom = opt.alumno || 'Pablo Gómez', fam = ALU[nom] || {pa: 'Padre de ' + nom.split(' ')[0], ma: 'Madre de ' + nom.split(' ')[0]};
  const SEC = [{value: '2º ESO B', label: '2º ESO B'}, {value: '1º ESO A', label: '1º ESO A'}], lugares = ['Domicilio', 'Centro', 'Online', 'Otros'].map((l) => ({value: l, label: l}));
  const alumnos = Object.keys(ALU).filter((n) => ['Pablo Gómez', 'Marcos Santos', 'Nora Lozano', 'Daniel Ortiz', 'Adrián Castro', 'Sergio Prieto', 'Alicia Ramos', 'Lucas Pardo'].indexOf(n) > -1 || n === nom).map((n) => ({value: n, label: n}));
  let dia = 5, hora = '08:00 - 18:30';
  const fm = document.createElement('dynamic-form'); fm.dividedFields = true;
  fm.render([{id: 'sec-ent', type: 'section', borderless: true, banner: {message: 'Son obligatorios los campos marcados con asterisco', type: 'info', dismissible: false}, fields: [
    {id: 'seccion', type: 'select', label: 'Sección', required: true, searchable: true, placeholder: '- Seleccionar -', options: SEC, defaultValue: '2º ESO B', columns: 12},
    {id: 'tutorizados', type: 'checkbox', label: 'Solo alumnos tutorizados', hiddenLabel: true, defaultValue: true, columns: 12},
    {id: 'alumno', type: 'select', label: 'Alumno', required: true, searchable: true, placeholder: '- Seleccionar -', options: alumnos, defaultValue: nom, columns: 12},
    {id: 'responsable', type: 'select', label: 'Responsable', options: [{value: 'lg', label: 'Laura García'}], defaultValue: 'lg', columns: 12},
    {id: 'lugar-responsable', type: 'select', label: 'Lugar', hiddenLabel: true, placeholder: 'Lugar', options: lugares, columns: 12},
    {id: 'sec-alumno', type: 'section', label: 'Alumno', borderless: true, fields: [
      {id: 'alumno-asiste', type: 'checkbox', label: nom, hiddenLabel: true, defaultValue: true, columns: 12},
      {id: 'lugar-alumno', type: 'select', label: 'Lugar', hiddenLabel: true, placeholder: 'Lugar', options: lugares, columns: 12, divider: false}]},
    {id: 'sec-fam', type: 'section', label: 'Familiares y tutores', borderless: true, fields: [
      {id: 'padre', type: 'checkbox', label: fam.pa + ' (padre)', hiddenLabel: true, defaultValue: true, columns: 12},
      {id: 'madre', type: 'checkbox', label: fam.ma + ' (madre)', hiddenLabel: true, defaultValue: true, columns: 12},
      {id: 'lugar-fam', type: 'select', label: 'Lugar', hiddenLabel: true, placeholder: 'Lugar', options: lugares, columns: 12, divider: false}]},
    {id: 'fecha', type: 'date', label: 'Fecha', required: true, defaultValue: '2026-11-05', min: '2026-11-05', max: '2026-11-30', enabledDates: ENT_DISP.map((d) => '2026-11-' + (d < 10 ? '0' : '') + d), columns: 12, divider: false,
     onChange: (ev) => { const d = +String(ev.value || '').slice(8, 10); if (d && fm.__franjas) { dia = d; fm.__franjas.setDia(d); } }},
    {id: 'sin-horario', type: 'checkbox', label: 'Entrevistas sin horario', hiddenLabel: true, columns: 12, divider: false}
  ]}]);
  requestAnimationFrame(() => {
    const ref = fm.getField('fecha'), wrap = ref && ref.element && ref.element.closest('.form-group');
    fm.__franjas = entCalendario(dia, (d, h) => { dia = d; hora = h; });
    if (wrap) wrap.insertAdjacentElement('afterend', fm.__franjas);
  });
  const b = el('div'); b.appendChild(fm);
  panel.navigate({header: {title: 'Solicitar entrevista'}, body: b, footer: {buttons: [
    {label: 'Aceptar', variant: 'primary', callback: () => {
      const d = fm.getData();
      if (!fm.validate()) return;
      const n = d.alumno || nom, f2 = ALU[n] || {pa: 'Padre de ' + n.split(' ')[0], ma: 'Madre de ' + n.split(' ')[0]};
      ENTREVISTAS.push({id: 'e' + (ENTREVISTAS.length + 1), alumno: n, sec: d.seccion || '2º ESO B', fecha: (dia < 10 ? '0' : '') + dia + '/11/2026', hora: d['sin-horario'] ? 'Sin horario' : hora, estado: 'Solicitada', lugar: d['lugar-responsable'] || 'Centro',
        solicitante: 'Laura García', motivo: opt.motivo || 'Entrevista solicitada desde la tutoría.', fam: [[f2.pa, 'Padre', true], [f2.ma, 'Madre', true], [n, 'Alumno', true]]});
      panel.goBack(); if (ENT_LISTA) ENT_LISTA.data = entNodos(); flashPanel('Entrevista solicitada');
    }},
    {label: 'Cancelar', callback: () => panel.goBack()}
  ]}});
}
/* Proponer entrevista a una familia: alumno, motivo, fecha (campo de fecha real + franjas) y modalidad en un solo paso */
function entProponer() {
  const alumnos = ['Adrián Castro', 'Alicia Ramos', 'Daniel Ortiz', 'Lucas Pardo', 'Marcos Santos', 'Nora Lozano', 'Pablo Gómez', 'Sergio Prieto'].map((n) => ({value: n, label: n}));
  const opts = (l) => l.map((t) => ({value: t, label: t}));
  let dia = 5, hora = '09:00 - 09:30';
  const fm = document.createElement('dynamic-form'); fm.dividedFields = true;
  fm.render([{id: 'sec-prop', type: 'section', borderless: true, banner: {message: 'La familia recibirá la propuesta y podrá aceptarla o pedir otra fecha', type: 'info', dismissible: false}, fields: [
    {id: 'alumno', type: 'select', label: 'Alumno', required: true, searchable: true, placeholder: '- Seleccionar -', options: alumnos, columns: 12},
    {id: 'motivo', type: 'select', label: 'Motivo', required: true, options: opts(['Seguimiento académico', 'Convivencia', 'Absentismo', 'Rendimiento', 'Otro']), defaultValue: 'Seguimiento académico', columns: 6},
    {id: 'mod', type: 'select', label: 'Modalidad', options: opts(['Presencial', 'Online', 'Telefónica']), defaultValue: 'Presencial', columns: 6},
    {id: 'fecha', type: 'date', label: 'Fecha', required: true, defaultValue: '2026-11-05', min: '2026-11-05', max: '2026-11-30', enabledDates: ENT_DISP.map((d) => '2026-11-' + (d < 10 ? '0' : '') + d), columns: 12, divider: false,
     onChange: (ev) => { const d = +String(ev.value || '').slice(8, 10); if (d && fm.__franjas) { dia = d; fm.__franjas.setDia(d); } }},
    {id: 'mensaje', type: 'textarea', label: 'Mensaje para la familia', placeholder: 'Opcional', rows: 3, columns: 12}
  ]}]);
  requestAnimationFrame(() => {
    const ref = fm.getField('fecha'), wrap = ref && ref.element && ref.element.closest('.form-group');
    fm.__franjas = entCalendario(dia, (d, h) => { dia = d; hora = h; });
    if (wrap) wrap.insertAdjacentElement('afterend', fm.__franjas);
  });
  const b = el('div'); b.appendChild(fm);
  panel.navigate({header: {title: 'Proponer entrevista a una familia', icon: hdrIcon('entrevistas')}, body: b, footer: {buttons: [
    {label: 'Proponer a la familia', variant: 'primary', callback: () => {
      if (!fm.validate()) return;
      const d = fm.getData(), n = d.alumno, f2 = ALU[n] || {pa: 'Padre de ' + n.split(' ')[0], ma: 'Madre de ' + n.split(' ')[0]};
      ENTREVISTAS.push({id: 'e' + (ENTREVISTAS.length + 1), alumno: n, sec: GRUPO, fecha: (dia < 10 ? '0' : '') + dia + '/11/2026', hora: hora, estado: 'Solicitada', lugar: d.mod === 'Presencial' ? 'Centro' : (d.mod || 'Centro'),
        solicitante: 'Laura García', motivo: (d.mensaje || '').trim() || d.motivo, fam: [[f2.pa, 'Padre', true], [f2.ma, 'Madre', true], [n, 'Alumno', true]]});
      panel.goBack(); if (ENT_LISTA) ENT_LISTA.data = entNodos(); flashPanel('Entrevista propuesta a la familia de ' + n);
    }},
    {label: 'Cancelar', variant: 'light', callback: () => panel.goBack()}
  ]}});
}
function panelEntrevistas() {
  ENT_TODAS = false;
  if (!document.getElementById('en-css')) {
    const st = el('style'); st.id = 'en-css';
    st.textContent = '.en{display:flex;flex-direction:column;gap:24px;padding:20px 20px 24px;font-family:inherit}.en-z{display:flex;flex-direction:column;gap:12px}'
      + '.en-h{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5c5c5c}.en-h.rojo{color:#b3223f}'
      + '.en-c{border:1px solid #e8e9eb;background:#fff;border-radius:8px;display:flex;flex-direction:column;overflow:hidden}'
      + '.en-sec{padding:16px 20px;display:flex;flex-direction:column;gap:12px}.en-sec+.en-sec{border-top:1px solid #e1e4e8}'
      + '.en-hd{display:flex;align-items:center;gap:12px}.en-hd img{width:40px;height:40px;border-radius:50%;flex:none;display:block}'
      + '.en-hd-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}.en-nm{font-size:15px;line-height:1.2;font-weight:700;color:#111}.en-sb{font-size:13px;line-height:1.2;color:#5c5c5c}'
      + '.en-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px}.en-kv>div{display:flex;flex-direction:column;gap:8px;min-width:0}.en-kv .full{grid-column:1/-1}'
      + '.en-k{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#767676}.en-v{font-size:13px;line-height:1.45;font-weight:600;color:#333}.en-v.q{font-weight:400;font-style:italic}'
      + '.en-l{font-size:13px;color:#5c5c5c}'
      + '.en-in{display:flex;flex-direction:column;gap:12px}'
      + '.en-av{font-size:13px;color:#b3223f;background:#fdeeef;border-radius:6px;padding:8px 12px}'
      + '.en-bt{display:flex;justify-content:flex-start}';
    document.head.appendChild(st);
  }
  const root = el('div', 'en'), zSol = el('div', 'en-z'), zCan = el('div', 'en-z'), zLis = el('div', 'en-z'), hLis = el('div', 'en-h');
  const abierto = {};
  const iso = (f) => { const p = f.split('/'); return p[2] + '-' + p[1] + '-' + p[0]; };
  const dmy = (s) => { const p = String(s).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  const larga = (f) => { const p = f.split('/'); return new Date(+p[2], +p[1] - 1, +p[0]).toLocaleDateString('es-ES', {weekday: 'long', day: 'numeric', month: 'short'}).replace(',', ''); };
  const rango = (h) => { const m = +h.slice(0, 2) * 60 + +h.slice(3, 5) + 30, z = (n) => (n < 10 ? '0' : '') + n; return h.slice(0, 5) + ' - ' + z(Math.floor(m / 60)) + ':' + z(m % 60); };
  const bar = (list) => { const bb = document.createElement('button-bar'); bb.buttons = list.map((x) => Object.assign({shape: 'pill', size: 'sm'}, x)); return bb; };
  ENT_LISTA = tree(entNodos(), {searchable: true, nodeHeight: '65px', disablePagination: true, emptyText: 'No hay entrevistas'});
  { const sh = new CSSStyleSheet(); sh.replaceSync('.wctl-tree-root{overflow:visible!important;max-height:none!important}'); if (ENT_LISTA.shadowRoot) ENT_LISTA.shadowRoot.adoptedStyleSheets = [...ENT_LISTA.shadowRoot.adoptedStyleSheets, sh]; }
  zLis.appendChild(hLis); zLis.appendChild(ENT_LISTA);

  function inline(e, modo) {
    const caja = el('div', 'en-in');
    const cierra = () => { abierto[e.id] = null; pinta(); };
    const fila = (ok, fn, peligro) => { const w = el('div', 'en-bt'); w.appendChild(bar([{id: 'ok', label: ok, variant: peligro ? 'danger' : 'primary', callback: fn}, {id: 'vl', label: 'Volver', variant: 'light', callback: cierra}])); return w; };
    if (modo === 'rep') {
      const f = form([{id: 'fecha', type: 'date', label: 'Nueva fecha', defaultValue: iso(e.fecha), min: '2026-11-05', columns: 7}, {id: 'hora', type: 'time', label: 'Hora', defaultValue: e.hora.slice(0, 5), columns: 5}]);
      caja.appendChild(f);
      caja.appendChild(fila('Proponer nueva fecha', () => {
        const v = f.getData(); e.fecha = dmy(v.fecha || iso(e.fecha)); e.hora = rango(v.hora || e.hora.slice(0, 5));
        if (e.estado === 'Cancelada') { e.estado = 'Solicitada'; e.porFamilia = false; e.deFamilia = false; }
        abierto[e.id] = null; pinta(); flash(root, 'Nueva fecha propuesta a la ' + entFam(e).replace('Fam.', 'familia'));
      }));
    } else if (modo === 'can') {
      caja.appendChild(el('div', 'en-av', 'La familia recibirá un aviso de que la entrevista se ha cancelado.'));
      caja.appendChild(fila('Confirmar cancelación', () => { e.estado = 'Cancelada'; e.porFamilia = false; e.enterado = true; e.motivoCancel = 'Cancelada por la tutora.'; abierto[e.id] = null; pinta(); flash(root, 'Entrevista cancelada: ' + entFam(e)); }, true));
    } else {
      const f = form([{id: 'msg', type: 'textarea', label: 'Comunicado a la ' + entFam(e).replace('Fam.', 'familia'), rows: 6, columns: 12,
        defaultValue: 'Buenos días:\n\nHemos recibido el aviso de que no podrán asistir a la entrevista de ' + e.alumno.split(' ')[0] + '. Quedamos a la espera de la nueva fecha que nos indiquen o, si lo prefieren, les propongo otra.\n\nUn saludo,\nLaura García'}]);
      caja.appendChild(f);
      caja.appendChild(fila('Enviar comunicado', () => { abierto[e.id] = null; pinta(); flash(root, 'Comunicado enviado a la ' + entFam(e).replace('Fam.', 'familia')); }));
    }
    return caja;
  }
  function tarjeta(e, canc) {
    const c = el('div', 'en-c' + (canc ? ' canc' : '')), s2 = entStatus(e), st = document.createElement('wc-status');
    st.text = s2.text; st.status = s2.status; st.variant = 'outline';
    /* tres bloques con divisor: quién es, los datos de la entrevista y las acciones */
    const hd = el('div', 'en-sec'), fila = el('div', 'en-hd'), img = new Image(); img.src = avatar(e.alumno); img.alt = '';
    fila.appendChild(img); fila.appendChild(el('div', 'en-hd-t', '<span class="en-nm">' + esc(entFam(e)) + '</span><span class="en-sb">' + esc(e.alumno) + ' · ' + esc(e.sec) + '</span>')); fila.appendChild(st);
    hd.appendChild(fila); c.appendChild(hd);
    const kv = (k, v, full, q) => '<div' + (full ? ' class="full"' : '') + '><span class="en-k">' + esc(k) + '</span><span class="en-v' + (q ? ' q' : '') + '">' + esc(v) + '</span></div>';
    const dt = el('div', 'en-sec'), hora = e.hora.replace(' - ', ' – ');
    dt.innerHTML = '<div class="en-kv">' + (canc
      ? kv('Fecha original', larga(e.fecha)) + kv('Hora', hora) + kv('Motivo de la cancelación', '«' + e.motivoCancel + '»', true, true)
      : kv('Motivo', e.asunto || e.motivo, true) + kv('Fecha propuesta', larga(e.fecha)) + kv('Hora', hora) + kv('Lugar', e.lugar) + kv('Solicitante', e.solicitante)) + '</div>';
    c.appendChild(dt);
    const ac = el('div', 'en-sec'), m = abierto[e.id], abre = (k) => () => { abierto[e.id] = k; pinta(); };
    if (m) ac.appendChild(inline(e, m));
    else if (canc) ac.appendChild(bar([
      {id: 'en', label: 'Marcar como enterado', variant: 'success', callback: () => { e.enterado = true; pinta(); flash(root, 'Marcada como enterada: ' + entFam(e)); }},
      {id: 'nf', label: 'Proponer nueva fecha', variant: 'outline-primary', callback: abre('rep')},
      {id: 'co', label: 'Enviar comunicado', variant: 'ghost-primary', callback: abre('com')}]));
    else ac.appendChild(bar([
      {id: 'ac', label: 'Aceptar', variant: 'primary', callback: () => { e.estado = 'Aceptada'; pinta(); flash(root, 'Entrevista aceptada: ' + entFam(e)); }},
      {id: 'rp', label: 'Reprogramar', variant: 'outline-primary', callback: abre('rep')},
      {id: 'ca', label: 'Cancelar', variant: 'ghost-danger', callback: abre('can')}]));
    c.appendChild(ac);
    return c;
  }
  function pinta() {
    const sol = ENTREVISTAS.filter((e) => e.estado === 'Solicitada'), can = ENTREVISTAS.filter((e) => e.estado === 'Cancelada' && e.porFamilia && !e.enterado);
    zSol.replaceChildren(); zCan.replaceChildren();
    zSol.appendChild(el('div', 'en-h', 'Solicitadas (' + sol.length + ')' + (sol.length ? ' · requieren confirmación' : '')));
    if (sol.length) sol.forEach((e) => zSol.appendChild(tarjeta(e, false))); else zSol.appendChild(el('div', 'en-l', 'No hay entrevistas solicitadas pendientes.'));
    if (can.length) { zCan.appendChild(el('div', 'en-h rojo', 'Canceladas por la familia (' + can.length + ') · pendientes de enterado')); can.forEach((e) => zCan.appendChild(tarjeta(e, true))); }
    hLis.textContent = ENT_TODAS ? 'Todas las entrevistas' : 'Próximas y recientes';
    ENT_LISTA.data = entNodos();
  }
  const pie = () => panel.refreshFooter({buttons: [
    {label: 'Proponer entrevista a una familia', variant: 'primary', callback: entProponer},
    {label: ENT_TODAS ? 'Ver solo próximas' : 'Ver todas las entrevistas', variant: 'light', callback: () => { ENT_TODAS = !ENT_TODAS; pinta(); pie(); }}
  ]});
  root.appendChild(zSol); root.appendChild(zCan); root.appendChild(zLis);
  const wrap = root;
  open({header: {title: 'Mis entrevistas', icon: hdrIcon('entrevistas')}, footer: {buttons: [
    {label: 'Proponer entrevista a una familia', variant: 'primary', callback: entProponer},
    {label: 'Ver todas las entrevistas', variant: 'light', callback: () => { ENT_TODAS = !ENT_TODAS; pinta(); pie(); }}
  ]}, actions: {buttons: [
    {label: 'Solicitar una entrevista', title: 'Solicitar una entrevista', class: 'aniadir', textOut: true, callback: entSolicitar},
    {label: 'Planificador familias', title: 'Planificador familias', class: 'planificador_familias', textOut: true, callback: () => flashPanel('Planificador de familias: módulo en construcción en este prototipo.')},
    {label: 'Planificador alumnos', title: 'Planificador alumnos', class: 'planificador_alumnos', textOut: true, callback: () => flashPanel('Planificador de alumnos: módulo en construcción en este prototipo.')}
  ]}, body: wrap}); pinta();
}
function panelEncuestas() {
  const mk = (n, de, f, k) => ({id: k, title: n, subtitle: 'Enviada por: ' + de, icon: {name: 'encuesta', shape: 'circle'}, rightTitle: 'Fecha', rightSubtitle: f});
  webpartPanel('encuestas', 'Encuestas', [
    {id: 'pen', title: 'Pendientes (2)', expanded: true, selectable: false, children: [mk('Encuesta del comedor escolar', 'Dirección del Centro', '11/11/2026', 'p1'), mk('Valoración de la salida al museo', 'Jefatura de Estudios', '20/11/2026', 'p2')]},
    {id: 'env', title: 'Enviadas (1)', expanded: true, selectable: false, children: [mk('Satisfacción con las tutorías', 'Laura García', '15/10/2026', 'e1')]}
  ]);
}
/* Agenda: tira de los 5 días + línea de tiempo; las tarjetas siguen el estilo del calendario real (HomeCalendario):
   barra lateral de color, fondo suave, título + código en gris y pliegue con el icono de pasar lista. Las clases avanzan al panel de la clase. */
const AG_PX = 62, AG_INI = 8 * 60, AG_FIN = 18 * 60, AG_HOY = 'Miércoles 4/11', AG_AHORA = 9 * 60 + 3;
const AG_COL = {mat: '#7cc0a8', fis: '#8f6fd0', tut: '#6b7fc4', exam: '#d15e5e', ent: '#b378ba', reu: '#cbd35a'};
const AG_CAP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#1f2f40" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c3 2.5 9 2.5 12 0v-4.5"/></svg>';
const agMin = (s) => { const p = s.split(':'); return +p[0] * 60 + +p[1]; };
function agEvento(r, dia) {
  const key = r[2], c = key && CLASES[key], partes = r[1].split(' · ');
  let tipo = 'mat';
  if (key === 'tut') tipo = 'tut'; else if (/^Examen/.test(r[1])) tipo = 'exam'; else if (/^Entrevista/.test(r[1])) tipo = 'ent'; else if (/^(Reunión|Claustro)/.test(r[1])) tipo = 'reu'; else if (/^Física/.test(r[1])) tipo = 'fis';
  const ini = c ? c.franja.split('-')[0] : r[0];
  const fin = c ? c.franja.split('-')[1] : /^Claustro/.test(r[1]) ? '09:30' : tipo === 'ent' ? '12:15' : tipo === 'reu' ? (agMin(r[0]) >= 15 * 60 ? '17:00' : '14:30') : '';
  /* etiqueta y línea de detalle de cada evento (el aula ya sale en el subtítulo de Matemáticas 2º ESO B) */
  const AG_DET = {mat2b: '26 alumnos · 2 tareas', fis1a: 'Aula 105 · 24 alumnos · 1 tarea', mat3c: 'Aula 301 · 25 alumnos', tut: 'Aula 204 · 26 alumnos'};
  let det = key ? AG_DET[key] || '' : '';
  if (key === 'mat2b' && dia.f === AG_HOY && ini === '08:30') det = '26 alumnos · 2 ausencias ya comunicadas por secretaría · 2 tareas';
  if (tipo === 'exam') det = 'Aula 102 · 1 tarea';
  if (tipo === 'ent') det = 'Despacho Tutoría 2 · Objetivo: revisar la evolución en matemáticas y acordar un plan de refuerzo';
  if (/^Reunión del departamento/.test(r[1])) det = 'Sala de juntas · coordinación EVAU';
  if (/^Reunión del equipo/.test(r[1])) det = 'Sala de reuniones · evaluación del trimestre';
  const tag = {mat: 'Sesión', fis: 'Sesión', tut: 'Tutoría', exam: 'Examen', ent: 'Entrevista', reu: /^Claustro/.test(r[1]) ? 'Claustro' : 'Reunión'}[tipo];
  return {a: agMin(ini), b: agMin(fin), nombre: partes[0], sub: partes.slice(1).join(' · '), tipo: tipo, tag: tag, det: det, esClase: !!c && tipo !== 'exam', clase: c ? Object.assign({}, c, {fecha: dia.f}) : null};
}
function panelAgenda() {
  if (!document.getElementById('ag-css')) {
    const st = el('style'); st.id = 'ag-css';
    st.textContent = '.ag{padding:14px;display:flex;flex-direction:column;gap:16px;font-family:inherit}'
      + '.ag-dias{display:flex;border-bottom:1px solid #e8e9eb}.ag-dia{flex:1;min-width:0;border:0;background:none;padding:6px 2px 0;display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;font-family:inherit;color:#5c5c5c;transition:background .15s}.ag-dia:hover{background:#f8fafd}'
      + '.ag-dia small{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#767676}.ag-dia b{font-family:Nunito,sans-serif;font-size:24px;line-height:1.15;font-weight:300;color:#111}.ag-dia span{display:flex;gap:4px;height:10px;align-items:center;margin-top:7px}.ag-dia span i{width:4px;height:4px;border-radius:50%;background:#cdd5df}.ag-dia::after{content:"";display:block;width:100%;height:2px;margin-top:7px;background:transparent;transition:background .2s}'
      + '.ag-dia.on::after{background:#285A92}.ag-dia.on b{color:#285A92;font-weight:400}.ag-dia.on span i{background:#285A92}.ag-dia.hoy small{color:#285A92;font-weight:700}'
      + '.ag-res{font-size:13px;color:#5a6b7d}.ag-tl{display:flex;flex-direction:column;gap:10px}'
      + '.ag-fila{display:grid;grid-template-columns:44px 1fr;gap:10px;align-items:stretch}'
      + '.ag-h{font-size:13px;font-weight:600;color:var(--color-grey-800,#333);display:flex;flex-direction:column;align-items:flex-end;padding-top:8px}.ag-h i{font-style:normal;font-weight:400;font-size:11px;color:var(--color-grey-800,#333)}'
      + '.ag-ev{position:relative;box-sizing:border-box;overflow:hidden;text-align:left;font-family:inherit;border:1px solid #e8e9eb;border-left:4px solid var(--c);border-radius:6px;padding:14px 16px;min-height:54px;'
      + 'background:#fff;display:flex;flex-direction:column;gap:0;justify-content:center}'
      + 'button.ag-ev{cursor:pointer;transition:box-shadow .12s,transform .12s}button.ag-ev:hover{box-shadow:0 3px 12px rgba(16,40,70,.08);transform:translateY(-1px)}'
      + '.ag-head{display:flex;flex-direction:column;gap:8px}.ag-n{font-size:15px;line-height:1.25;color:#111;font-weight:600}'
      + '.ag-s{font-size:13px;line-height:1.35;color:#5c5c5c}'
      + '.ag-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
      + '.ag-t{font-size:11px;font-weight:700;color:#33475b;background:#fff;border:1px solid var(--c);border-radius:30px;padding:0 9px}'
      + '.ag-sec{display:flex;flex-direction:column;gap:8px}.ag-sec+.ag-sec,.ag-row+.ag-sec{border-top:1px solid #e1e4e8;margin-top:12px;padding-top:12px}'
      + '.ag-sec.ag-f{flex-direction:row;flex-wrap:wrap;gap:8px 18px;font-size:12.5px;line-height:1.4;color:#5c5c5c}.ag-f span{display:inline-flex;align-items:center;gap:8px}.ag-f span::before{content:"";width:4px;height:4px;border-radius:50%;background:#cdd5df}.ag-f b{font-weight:700;color:#333}.ag-obj{font-size:12.5px;line-height:1.55;color:#5c5c5c}'
      + '.ag-live{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:#0e7550}.ag-live i{width:7px;height:7px;border-radius:50%;background:#10855b;animation:agpulse 2.2s ease-out infinite}'
      + '@keyframes agpulse{0%{box-shadow:0 0 0 0 rgba(16,133,91,.45)}70%{box-shadow:0 0 0 7px rgba(16,133,91,0)}100%{box-shadow:0 0 0 0 rgba(16,133,91,0)}}@media (prefers-reduced-motion:reduce){.ag-live i{animation:none}}'
      + '.ag-ev.curso{border:1px solid color-mix(in srgb,var(--c) 55%,#fff);border-left:4px solid var(--c);cursor:pointer;align-items:stretch}'
      + '.ag-row{display:flex;gap:16px;align-items:flex-start}.ag-main{flex:1;min-width:0;display:flex;flex-direction:column}.ag-acc{flex:none}.ag-ev.curso .ag-nota{border-top:1px solid #e1e4e8;margin-top:12px;padding-top:12px;font-size:12px;line-height:1.45;color:#767676}'
      + '.ag-vacio{text-align:center;color:#8896a5;padding:28px 0;font-size:13px}';
    document.head.appendChild(st);
  }
  const root = el('div', 'ag'), strip = el('div', 'ag-dias'), res = el('div', 'ag-res'), tl = el('div', 'ag-tl');
  root.appendChild(strip); root.appendChild(res); root.appendChild(tl);
  const letra = {Lunes: 'LU', Martes: 'MA', 'Miércoles': 'MI', Jueves: 'JU', Viernes: 'VI'};
  const hm = (m) => (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60);
  function pinta(k) {
    const d = DIAS[k], hoy = d.f === AG_HOY, evs = d.r.map((r) => agEvento(r, d)).sort((x, y) => x.a - y.a);
    Array.prototype.forEach.call(strip.children, (b, i) => b.classList.toggle('on', i === k));
    const clases = evs.filter((e) => e.esClase).length;
    res.textContent = d.t + ' · ' + evs.length + (evs.length === 1 ? ' evento' : ' eventos') + (clases ? ', ' + clases + (clases === 1 ? ' clase' : ' clases') : '');
    tl.innerHTML = '';
    evs.forEach((e) => {
      const curso = hoy && e.esClase && e.a <= AG_AHORA && AG_AHORA < e.b;
      const partes = e.det ? e.det.split(' · ') : [], largos = partes.filter((x) => x.length > 60), cortos = partes.filter((x) => x.length <= 60);
      const fila = el('div', 'ag-fila'), card = el(e.clase && e.tipo !== 'exam' && !curso ? 'button' : 'div', 'ag-ev' + (curso ? ' curso' : ''));
      fila.appendChild(el('div', 'ag-h', hm(e.a) + (e.b ? '<i>' + hm(e.b) + '</i>' : '')));
      card.style.setProperty('--c', AG_COL[e.tipo]);
      card.innerHTML = '<span class="ag-sec"><span class="ag-top"><span class="ag-t">' + esc(e.tag) + '</span>' + (curso ? '<span class="ag-live"><i></i>en curso</span>' : '') + '</span>'
        + '<span class="ag-head"><span class="ag-n">' + esc(e.nombre) + '</span>' + (e.sub ? '<span class="ag-s">' + esc(e.sub) + '</span>' : '') + '</span></span>'
        + (cortos.length ? '<span class="ag-sec ag-f">' + cortos.map((x) => '<span>' + esc(x).replace(/^(\d+)/, '<b>$1</b>') + '</span>').join('') + '</span>' : '')
        + (largos.length ? '<span class="ag-sec ag-obj">' + esc(largos.join(' · ')) + '</span>' : '');
      if (curso) {
        /* sesión en curso: pasar lista desde la propia tarjeta */
        const acc = el('div', 'ag-acc'), bb = document.createElement('button-bar'), nota = el('span', 'ag-nota', '«Todos presentes» mantiene las 2 ausencias que ya comunicó secretaría.');
        const pie = (hecho) => { bb.style.display = hecho ? 'none' : ''; nota.textContent = hecho ? 'Lista guardada. Se mantienen las 2 ausencias que ya comunicó secretaría.' : nota.textContent; };
        bb.buttons = [{id: 'tp', label: 'Todos presentes', class: 'aceptar', shape: 'pill', variant: 'outline-primary', textOut: true, callback: () => { pie(true); flash(root, 'Ya se ha pasado lista'); }},
          {id: 'pl', label: 'Pasar lista', class: 'pasar_lista', shape: 'pill', variant: 'outline-primary', textOut: true, callback: () => panel.navigate(listaCfg(e.clase))}];
        /* marco circular con borde fino y rótulo debajo, igual que los botones de la lista de pasar lista */
        const circ = new CSSStyleSheet();
        circ.replaceSync('.wcb-btn.wcb-variant-outline-primary,.wcb-btn.wcb-variant-outline-primary:not(:hover):not(:active):not(:disabled){background:transparent!important;box-shadow:none!important}.wcb-btn{width:auto!important;min-width:88px;gap:8px}.wcb-icon-frame{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:44px;height:44px;border:1px solid #e8e9eb;border-radius:50%;background:#fff}'
          + '.wcb-mask-icon::before{width:18px!important;height:18px!important;min-height:0!important}.wcb-label{white-space:nowrap;overflow:visible!important;text-overflow:clip!important}');
        if (bb.shadowRoot) bb.shadowRoot.adoptedStyleSheets = [...bb.shadowRoot.adoptedStyleSheets, circ];
        /* texto a la izquierda; acciones a la derecha de la sesión, como en la lista */
        const sec1 = card.firstChild, fila2 = el('div', 'ag-row'); sec1.style.flex = '1'; sec1.style.minWidth = '0';
        card.insertBefore(fila2, sec1); fila2.appendChild(sec1); acc.appendChild(bb); fila2.appendChild(acc); card.appendChild(nota);
        card.onclick = (ev) => { if (!ev.target.closest('button-bar')) detalleSesion(e.clase); };
      } else if (e.clase && e.tipo !== 'exam') card.onclick = () => detalleSesion(e.clase);
      else if (e.tipo === 'ent' && hoy) {
        const ent = ENTREVISTAS.filter((x) => x.fecha === '04/11/2026' && x.hora.slice(0, 5) === hm(e.a))[0];
        if (ent) { card.style.cursor = 'pointer'; card.onclick = () => entFicha(ent); }
      }
      fila.appendChild(card); tl.appendChild(fila);
    });
  }
  DIAS.forEach((d, k) => {
    const nom = d.f.split(' ')[0], b = el('button', 'ag-dia' + (d.f === AG_HOY ? ' hoy' : ''), '<small>' + letra[nom] + '</small><b>' + d.f.split(' ')[1].split('/')[0] + '</b><span aria-hidden="true">' + '<i></i>'.repeat(Math.min(d.r.length, 5)) + '</span>');
    b.setAttribute('aria-label', d.t); b.onclick = () => pinta(k); strip.appendChild(b);
  });
  pinta(DIAS.map((d) => d.f).indexOf(AG_HOY));
  open({header: {title: 'Agenda', subtitle: 'Panel del profesor · semana del 2 al 6 de noviembre', icon: hdrIcon('agenda')}, body: root});
}

/* ── Fichas (minificha) ── */
function fichaCfg(code, title, subtitle, schema, actions, info) {
  const f = form(schema, true); if (info) f.info = info;
  const b = el('div'); b.appendChild(f);
  return {header: {title: title, subtitle: subtitle, icon: hdrIcon(code), navBtn: {text: 'Ver ficha completa', url: '#', callback: () => {}}}, actions: actions ? {buttons: actions} : null, body: b};
}
/* La cabecera del panel solo admite iconos del catálogo: en los paneles de un alumno se cambia por su foto de ejemplo */
const fotoHdr = (name) => setTimeout(() => { if (panel.historyStack && panel.historyStack.length) return; const w = panel.shadowRoot && panel.shadowRoot.querySelector('.header-left-addon .header-icon-style'); if (!w) return; const r = w.getBoundingClientRect(), im = new Image(); im.src = avatar(name); im.alt = ''; im.className = 'fh-photo'; im.style.cssText = 'width:' + (r.width || 48) + 'px;height:' + (r.height || 48) + 'px;border-radius:50%;display:block;flex:none'; w.replaceWith(im); }, 120);
const go = (cfg) => { if (panel.isOpen) panel.navigate(cfg); else open(cfg); };
function miniFichaAlumno(name) {
  const d = ALU[name] || {n: 0, ext: 'Ninguna', pa: 'Padre de ' + name.split(' ')[0], ma: 'Madre de ' + name.split(' ')[0], av: []};
  const inc = incCount(name);
  const schema = [
    {id: 'foto', type: 'image', columns: 4, rows: 2, value: avatar(name), maxWidth: '160px'},
    {id: 'ne', label: 'Num. Expediente', type: 'text', columns: 4, value: '2026' + (500 + d.n)},
    {id: 'nia', label: 'NIA', type: 'text', columns: 4, value: '36136' + (10 + d.n)},
    {id: 'email', label: 'Email', type: 'text', columns: 8, value: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@familia.es'},
    {id: 'tem', label: 'Teléfono de emergencia', type: 'text', columns: 4, value: '91 555 01 ' + (10 + d.n)},
    {id: 'mov', label: 'Móvil', type: 'text', columns: 4, value: '6' + (600 + d.n) + ' 345 ' + (100 + d.n)},
    {id: 'sec', label: 'Secciones', type: 'text', columns: 4, value: GRUPO},
    {id: 'ext', label: 'Extraescolares', type: 'text', columns: 4, value: d.ext},
    {id: 'tut', label: 'Tutor', type: 'text', value: 'Laura García'},
    {id: 'fam', type: 'section', label: 'Familiares/Tutores', collapsable: true, borderless: true, fields: [
      {id: 'f1', type: 'section', label: d.pa + ' (Padre)', collapsable: true, fields: [{id: 'f1e', label: 'Email', type: 'text', columns: 8, value: d.pa.split(' ')[0].toLowerCase() + '@familia.es'}, {id: 'f1m', label: 'Móvil', type: 'text', columns: 4, value: '6' + (700 + d.n) + ' 111 ' + (200 + d.n)}]},
      {id: 'f2', type: 'section', label: d.ma + ' (Madre)', collapsable: true, fields: [{id: 'f2e', label: 'Email', type: 'text', columns: 8, value: d.ma.split(' ')[0].toLowerCase() + '@familia.es'}, {id: 'f2m', label: 'Móvil', type: 'text', columns: 4, value: '6' + (800 + d.n) + ' 222 ' + (300 + d.n)}]}
    ]}
  ].concat(d.av.length ? [{id: 'avisos', label: 'Avisos médicos', type: 'textarea', rows: 3, value: d.av.join('\n\n')}] : []);
  const acts = [
    {id: 'com', label: 'Comunicado', class: 'comunicado', textOut: true, callback: () => panel.navigate(comunicadoCfg(name))},
    {id: 'age', label: 'Agenda', class: 'agenda', textOut: true},
    {id: 'jus', label: 'Justificar', class: 'incidencias', textOut: true, badge: inc || null, callback: () => panelInc({mode: 'tutor', grupo: GRUPO, alumno: name, paso2: true})},
    {id: 'eva', label: 'Evaluar', class: 'evaluar', textOut: true},
    {id: 'ia', label: '360° IA', class: 'ia_alexia', textOut: true}
  ];
  go(fichaCfg('alumnos', name, '', schema, acts, d.av.length ? {message: d.av.length + (d.av.length > 1 ? ' Avisos médicos' : ' Aviso médico'), type: 'info', dismissible: true} : null)); fotoHdr(name);
}
function miniFichaArea(a) {
  const schema = [
    {id: 'nom', label: 'Área', type: 'text', columns: 6, value: a.n}, {id: 'red', label: 'Reducido', type: 'text', columns: 6, value: a.red},
    {id: 'iu', label: 'IU', type: 'text', columns: 6, value: a.red}, {id: 'cod', label: 'Código oficial', type: 'text', columns: 6, value: a.red},
    {id: 'pro', label: 'Profesor', type: 'text', columns: 6, value: 'Laura García'}, {id: 'sec', label: 'Secciones', type: 'text', columns: 6, value: a.sec.join(' - ')},
    {id: 'cargos', type: 'section', label: 'Otros cargos', collapsable: true, borderless: true, fields: [
      {id: 'c1', type: 'section', label: 'Raúl Ibáñez (Profesor)', collapsable: true, fields: [{id: 'c1d', label: 'Fecha desde', type: 'text', columns: 6, value: '01/09/2026'}, {id: 'c1h', label: 'Fecha hasta', type: 'text', columns: 6, value: '30/06/2027'}]},
      {id: 'c2', type: 'section', label: 'Carmen Soto (Profesor)', collapsable: true, fields: [{id: 'c2d', label: 'Fecha desde', type: 'text', columns: 6, value: '01/09/2026'}, {id: 'c2h', label: 'Fecha hasta', type: 'text', columns: 6, value: '30/06/2027'}]}
    ]},
    {id: 'evs', type: 'section', label: 'Evaluaciones', collapsable: true, borderless: true, fields: [
      {id: 'e1', label: '1ª evaluación', type: 'checkbox', columns: 3, value: true}, {id: 'e2', label: '2ª evaluación', type: 'checkbox', columns: 3, value: true},
      {id: 'e3', label: '3ª evaluación', type: 'checkbox', columns: 3, value: true}, {id: 'ef', label: 'Final', type: 'checkbox', columns: 3, value: true}
    ]}
  ];
  const acts = [
    {id: 'cua', label: 'Cuaderno del profesor', class: 'cuaderno_profesor', textOut: true, callback: () => panel.navigate(placeholder('cuaderno', 'Cuaderno del profesor'))},
    {id: 'com', label: 'Comunicado', class: 'comunicado', textOut: true, callback: () => panel.navigate(comunicadoCfg(null, a.n))},
    {id: 'lis', label: 'Pasar lista', class: 'pasar_lista', textOut: true, callback: () => panel.navigate(listaCfg({titulo: a.n.toUpperCase() + ' (' + a.red + ')', grupo: GRUPO, fecha: 'Miércoles 4/11', franja: '08:30-09:25'}))},
    {id: 'age', label: 'Agenda', class: 'agenda', textOut: true},
    {id: 'jus', label: 'Aceptar Just.', class: 'justificar', textOut: true, callback: () => panelInc({mode: 'tutor', grupo: GRUPO, tab: 'aceptar'})}
  ];
  go(fichaCfg('areas', a.n, a.al + ' Alumnos', schema, acts));
}
function miniFichaSeccion(s) {
  const schema = [{id: 'cod', label: 'Código', type: 'text', columns: 3, value: s[1]}, {id: 'nom', label: 'Nombre', type: 'text', columns: 5, value: s[0]}, {id: 'tut', label: 'Tutor', type: 'text', columns: 8, value: s[0] === GRUPO ? 'Laura García' : 'Marta Ferrer'}, {id: 'cur', label: 'Curso', type: 'text', value: s[0].replace(/ [A-Z]$/, '')}];
  const acts = [
    {id: 'alu', label: 'Alumnos', class: 'relacion_alumnos', textOut: true, callback: () => panel.navigate({header: {title: s[0], subtitle: s[2] + ' Alumnos', icon: hdrIcon('alumnos')}, body: tree(Object.keys(ALU).map((n) => ({id: n, title: n, subtitle: s[0], image: {value: avatar(n), maxWidth: '40px'}, onClick: () => miniFichaAlumno(n)})), {searchable: true, nodeHeight: '65px'})})},
    {id: 'lis', label: 'Pasar lista', class: 'pasar_lista', textOut: true, callback: () => panel.navigate(listaCfg({titulo: s[0].toUpperCase(), grupo: s[0], fecha: 'Miércoles 4/11', franja: '08:30-09:25'}))},
    {id: 'com', label: 'Comunicado', class: 'comunicado', textOut: true, callback: () => panel.navigate(comunicadoCfg(null, s[0]))}
  ];
  go(fichaCfg('secciones', s[0], s[2] + ' Alumnos', schema, acts));
}
/* Redactar comunicado: UI.Comunicado.Redactar de comunicado.js (AlexiaResources).
   Mismo schema: section "Destinatarios" con una section por groupName y casillas, Asunto, Mensaje (rich-text con la barra reducida),
   Ficheros adjuntos (file-upload variant button), "¿Se puede contestar?" (switch, activado) y "Enviar en nombre del centro" (switch, solo si se puede).
   Pie: Enviar (primary) y Guardar borrador (secondary); al guardar se añade Descartar borrador (outline-danger).
   o: {titulo, destinatarios: [{id, label, value, groupName, rol, avisos}], puedeEnviarComoCentro} */
function redactarCfg(o) {
  const grupos = {};
  o.destinatarios.forEach((d) => {
    const g = grupos[d.groupName] = grupos[d.groupName] || {items: [], avisos: []};
    g.items.push(d);
    if (d.avisos && g.avisos.indexOf(d.avisos) < 0) g.avisos.push(d.avisos);
  });
  /* Con pocos destinatarios, casillas con línea divisoria; con varios (familias), lista de selección del tree-list (la misma de los listados) */
  const listas = {}, marcadas = {};
  const sections = Object.keys(grupos).map((name) => {
    const items = grupos[name].items, key = name.toLowerCase().replace(/\s+/g, '_');
    let fields;
    if (items.length > 3) {
      listas[key] = items.map((it) => it.id + '_' + (it.rol || 'x'));
      fields = [{id: 'lista_' + key, name: 'lista_' + key, type: 'tree-list', multiselect: true, defaultSelectable: true, showSelectAll: true, disablePagination: true, nodeHeight: '48px',
        data: items.map((it) => ({id: it.id + '_' + (it.rol || 'x'), title: it.label, icon: {name: 'relacion_alumnos', shape: 'circle'}})),
        columns: 12, divider: false}];
      marcadas['lista_' + key] = items.filter((it) => it.value).map((it) => it.id + '_' + (it.rol || 'x'));
    } else {
      fields = items.map((it, k) => ({id: it.id + '_' + (it.rol || 'x'), name: it.id + '_' + (it.rol || 'x'), label: it.label, type: 'checkbox', value: !!it.value, defaultValue: !!it.value, columns: 12, divider: k < items.length - 1}));
    }
    const s = {type: 'section', id: 'section_' + key, label: name, collapsable: false, collapsed: false, borderless: true, columns: 12, fields: fields};
    if (grupos[name].avisos.length) s.banner = {message: grupos[name].avisos};
    return s;
  });
  const schema = [
    {id: 'destinatariosLabel', type: 'section', label: 'Destinatarios', columns: 12, borderless: true, divider: false, headerDivider: true, dividerStyle: 'dot', fields: sections},
    {id: 'asunto_1', label: 'Asunto', type: 'text', required: true, value: o.asunto || ''},
    {id: 'mensaje_1', label: 'Mensaje', type: 'rich-text', required: true, value: o.mensaje || '', toolbarConfig: {buttons: ['fontFamily', 'fontSize', '|', 'bold', 'italic', 'underline', '|', 'textColor', '|', 'image']}},
    {id: 'adjuntos', variant: 'button', label: 'Ficheros adjuntos', type: 'file-upload'},
    {id: 'contestable', label: '¿Se puede contestar?', type: 'checkbox', switch: true, value: true, defaultValue: true},
    {id: 'enviarComoCentro', label: 'Enviar en nombre del centro', type: 'checkbox', switch: true, visible: !!o.puedeEnviarComoCentro}
  ];
  const f = document.createElement('dynamic-form');
  f.dividedFields = true;
  f.validator = (data) => {
    const e = {};
    if (!data.asunto_1) e.asunto_1 = 'Valor obligatorio';
    if (!data.mensaje_1) e.mensaje_1 = 'Valor obligatorio';
    return Object.keys(e).length ? e : null;
  };
  f.render(schema);
  /* El tree-list real no admite valor inicial antes de estar en pantalla: se marca después */
  setTimeout(() => { if (Object.keys(marcadas).length) f.setValues(marcadas, false); }, 200);
  const header = {title: o.titulo, subtitle: 'Nuevo comunicado', icon: hdrIcon('comunicados'), navBtn: {text: 'Ver ficha completa', url: '#', callback: () => {}}};
  const b = el('div'); b.appendChild(f);
  const pie = (conBorrador) => ({buttons: [
    {label: 'Enviar', variant: 'primary', callback: enviar},
    {label: 'Guardar borrador', variant: 'secondary', callback: guardar}
  ].concat(conBorrador ? [{label: 'Descartar borrador', variant: 'outline-danger', callback: descartar}] : [])});
  function guardar() {
    const d = new Date();
    f.info = {message: 'Guardado en borradores - ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), type: 'success', dismissible: true};
    panel.refreshFooter(pie(true));
  }
  function descartar() { f.info = null; if (f.clean) f.clean(); panel.refreshFooter(pie(false)); }
  function enviar() {
    if (!f.validate()) return;
    const data = f.getData() || {};
    const n = sections.reduce((acc, s) => acc + s.fields.reduce((a2, c) => a2 + (c.type === 'tree-list' ? (data[c.id] || []).length : (data[c.id] === true ? 1 : 0)), 0), 0);
    const r = document.createElement('action-result');
    r.setAttribute('variant', 'success'); r.setAttribute('heading', '¡Comunicado enviado!'); r.setAttribute('subtitle', 'Se ha enviado a ' + n + (n === 1 ? ' destinatario.' : ' destinatarios.'));
    panel.loadContext({header: {title: o.titulo, subtitle: 'Nuevo comunicado', icon: hdrIcon('comunicados')}, body: r, footer: {buttons: [{label: 'Cerrar', variant: 'light', callback: () => panel.close()}]}});
  }
  return {header: header, body: b, footer: pie(false)};
}
/* Desde una sección o un área (ControladorAccionesGrupo: un único destinatario, groupName vacío, título = nombre del grupo) */
function comunicadoCfg(name, grupo) {
  if (grupo) return redactarCfg({titulo: grupo, destinatarios: [{id: 'g_' + grupo.replace(/\W+/g, ''), label: grupo, value: true, groupName: '', rol: 'x'}]});
  /* Desde el alumno (alumno.js: _abrirPanelRedactarComunicado): el alumno y sus familiares */
  const d = ALU[name] || {pa: 'Padre de ' + name.split(' ')[0], ma: 'Madre de ' + name.split(' ')[0]};
  const k = name.replace(/\W+/g, '');
  return redactarCfg({titulo: name, destinatarios: [
    {id: 'al_' + k, label: name, value: false, groupName: 'Alumno', rol: 'a'},
    {id: 'pa_' + k, label: d.pa + ' (Padre)', value: true, groupName: 'Familiares/Tutores', rol: 'p'},
    {id: 'ma_' + k, label: d.ma + ' (Madre)', value: true, groupName: 'Familiares/Tutores', rol: 'm'}
  ]});
}
/* Redactar desde el panel de Comunicados: sin destinatarios marcados */
function redactarGeneral() {
  return redactarCfg({titulo: 'Comunicados', destinatarios: ['2º ESO B', '1º ESO A', '3º ESO C', '1º BACH A'].map((g) => ({id: 's_' + g.replace(/\W+/g, ''), label: g, value: false, groupName: 'Secciones', rol: 'x'}))});
}
/* Avisar familias (home): abre Comunicados y pasa a redactar, con las 7 familias sin contestar ya marcadas */
const FAMILIAS_SIN_RESPUESTA = ['Fam. Prieto Marín', 'Fam. Santos Pons', 'Fam. Ortiz Díaz', 'Fam. Gómez Rubio', 'Fam. Castro Molina', 'Fam. Lozano Vega', 'Fam. Pardo Vidal'];
function avisarFamilias() {
  panelComunicados();
  panel.navigate(redactarCfg({
    titulo: 'Comunicados',
    destinatarios: FAMILIAS_SIN_RESPUESTA.map((f, k) => ({id: 'fam' + k, label: f, value: true, groupName: 'Familias que no han contestado', rol: 'f'})),
    asunto: 'Autorización pendiente: excursión al Museo Nacional de Ciencias Naturales',
    mensaje: '<p>Estimadas familias:</p><p>Os recordamos que aún no hemos recibido la autorización para la excursión al Museo Nacional de Ciencias Naturales. El plazo termina en 4 días.</p><p>Gracias.<br>Laura García</p>'
  }));
}

/* ── Detalle de sesión (detalle-sesion.js) ── */
function detalleSesion(c) {
  const b = el('div');
  [['actividades', 'Actividades', 'No existen actividades creadas'], ['tareas', 'Tareas', 'No existen tareas creadas'], ['anotaciones', 'Anotaciones', 'No existen anotaciones creadas']].forEach((s) => {
    const t = tree([], {nodeHeight: '46px', disablePagination: true, borderless: true, emptyText: s[2]});
    t.noDataIcon = {name: s[0], iconColor: 'var(--color-grey-600)', colorBg: 'var(--color-grey-300)', shape: 'circle'};
    b.appendChild(pad(sec(s[1], [t], {badge: '0', 'divider-style': 'dot'}), '14px 14px 0'));
  });
  panel.navigate({
    header: {title: c.titulo, subtitle: c.grupo + ' | ' + c.fecha + ' - ' + c.franja, icon: {name: 'area', iconColor: '#d15e5e', colorBg: '#fff4f4', borderColor: 'transparent'}, navBtn: {text: 'Ficha', url: '#', callback: () => {}}},
    actions: {buttons: [
      {id: 'cre', label: 'Crear', class: 'aniadir', textOut: true, children: [{label: 'Tarea'}, {label: 'Actividad'}, {label: 'Anotación'}]},
      {id: 'lis', label: 'Pasar lista', class: 'pasar_lista', textOut: true, callback: () => panel.navigate(listaCfg(c))},
      {id: 'pro', label: 'Programación', class: 'programacion_didactica', textOut: true},
      {id: 'cua', label: 'Cuaderno del profesor', class: 'cuaderno_profesor', textOut: true, callback: () => panel.navigate(placeholder('cuaderno', 'Cuaderno del profesor'))}
    ]},
    body: b
  });
}

/* ── Pasar lista (pasarlista.js, simplificado: marcas por alumno y pie según estado) ── */
function listaCfg(c) {
  let materia = c.titulo.replace(/ \(.*\)$/, ''); materia = materia.charAt(0) + materia.slice(1).toLowerCase();
  const names = ['Sergio Prieto', 'Marcos Santos', 'Daniel Ortiz', 'Pablo Gómez', 'Adrián Castro', 'Nora Lozano', 'Lucas Pardo', 'Clara Vidal', 'Irene Navarro'];
  const MARCAS = [['ausencia', 'Ausencia'], ['retraso', 'Retraso'], ['conducta', 'Conducta'], ['sin_material', 'Sin material']];
  const st = {}, b = el('div');
  const fecha = c.fecha && c.fecha.indexOf('5/11') > -1 ? '05/11/2026' : c.fecha && c.fecha.indexOf('6/11') > -1 ? '06/11/2026' : '04/11/2026';
  const cab = form([{id: 'fecha', type: 'text', label: 'Fecha', value: fecha, columns: 6}, {id: 'sesion', type: 'text', label: 'Sesión', value: c.franja.replace('-', ' - '), columns: 6}]);
  const lt = document.createElement('tree-list'); Object.assign(lt, {searchable: true, nodeHeight: '68px', disablePagination: true});
  const resumen = (n) => { const m = (st[n] || []).map((k) => MARCAS.filter((x) => x[0] === k)[0][1].toLowerCase()); return m.length ? m.join(' · ') : GRUPO; };
  const nodes = () => names.map((n) => ({id: n, title: n, subtitle: resumen(n), image: {value: avatar(n), maxWidth: '40px'}, onClick: () => miniFichaAlumno(n),
    buttons: MARCAS.map((m) => ({id: m[0] + n, title: m[1], class: m[0], shape: 'pill', variant: (st[n] || []).indexOf(m[0]) > -1 ? 'primary' : 'outline-primary', callback: () => { st[n] = st[n] || []; const k = st[n].indexOf(m[0]); if (k > -1) st[n].splice(k, 1); else st[n].push(m[0]); lt.data = nodes(); pie(); }}))}));
  lt.data = nodes();
  b.appendChild(pad(cab, '14px 14px 0')); b.appendChild(lt);
  let guardada = false;
  const marcas = () => names.some((n) => (st[n] || []).length);
  const salir = () => { panel.canGoBack() ? panel.goBack() : panel.close(); };
  function pie() {
    panel.refreshFooter({buttons: marcas()
      ? [{label: 'Guardar', variant: 'primary', callback: guardar}, {label: 'Descartar', variant: 'light', callback: () => { Object.keys(st).forEach((k) => delete st[k]); lt.data = nodes(); pie(); }}]
      : guardada ? [{label: 'Cerrar', variant: 'light', callback: salir}]
      : [{label: 'Todos presentes', variant: 'primary', callback: guardar}, {label: 'Cerrar', variant: 'light', callback: salir}]});
  }
  function guardar() { guardada = true; flash(b, 'Ya se ha pasado lista'); pie(); }
  return {header: {title: materia + ' · ' + c.grupo, subtitle: 'Pasar lista', icon: hdrIcon('areas'), navBtn: {text: 'Ver ficha completa', url: '#', callback: () => {}}}, body: b,
    footer: {buttons: [{label: 'Todos presentes', variant: 'primary', callback: guardar}, {label: 'Cerrar', variant: 'light', callback: salir}]}};
}
function abrirLista(c) { open(listaCfg(c)); }

/* ── Seguimiento (Convivencia y Rendimiento) ── */
function panelSeguimiento(name) {
  const d = SEG[name]; if (!d) { miniFichaAlumno(name); return; }
  const conv = d.tema === 'Convivencia', pend = incCount(name);
  const rows = d.filas.map((f, k) => ({id: k, title: f.a, subtitle: f.b, rightTitle: f.nota ? status(f.nota, 'error') : null}));
  const intro = el('p'); intro.style.cssText = 'margin:0 0 8px;font:600 14px Roboto,sans-serif;color:#333'; intro.textContent = d.titulo;
  const b = el('div'); b.appendChild(pad(sec('Por qué aparece en tu home', [intro, tree(rows, {nodeHeight: '58px', disablePagination: true})])));
  const acts = [];
  if (conv) acts.push({id: 'inc', label: 'Crear incidencia de conducta', class: 'conducta', textOut: true, callback: () => panel.navigate(conductaCfg(name))});
  acts.push({id: 'com', label: 'Comunicar a la familia', class: 'comunicado', textOut: true, callback: () => panel.navigate(comunicadoCfg(name))});
  acts.push({id: 'ent', label: 'Pedir entrevista', class: 'mis-entrevistas', textOut: true, callback: () => entSolicitar({alumno: name, motivo: d.titulo})});
  if (pend) acts.push({id: 'jus', label: 'Justificar', class: 'justificar', textOut: true, badge: pend, callback: () => panelInc({mode: 'tutor', grupo: GRUPO, alumno: name, paso2: true})});
  acts.push({id: 'fic', label: 'Ver ficha', class: 'mini_ficha_alumno', textOut: true, callback: () => miniFichaAlumno(name)});
  open({header: {title: name, subtitle: d.tema, icon: hdrIcon('alumnos')}, actions: {buttons: acts}, body: b}); fotoHdr(name);
}
/* ── Absentismo (Atender en la home): resumen de las faltas, escribir a la familia o proponer entrevista en el mismo panel, anotación ── */
const ABS = {
  'Sergio Prieto': {titulo: '4 faltas sin justificar esta semana', hecho: '4 faltas sin justificar esta semana', pct: 18, filas: ['Hoy · miércoles 4 nov · 1ª hora, Matemáticas', 'Hoy · miércoles 4 nov · 3ª hora, Lengua', 'Ayer · martes 3 nov · 2ª hora, Inglés', 'Hace 2 días · lunes 2 nov · 4ª hora, Historia']},
  'Marcos Santos': {titulo: '3 faltas a 1ª hora en dos semanas', hecho: '3 faltas a 1ª hora en dos semanas', filas: ['Miércoles 4 nov · 1ª hora, Matemáticas', 'Jueves 29 oct · 1ª hora, Matemáticas', 'Lunes 26 oct · 1ª hora, Lengua']},
  'Daniel Ortiz': {titulo: '3 jornadas completas de falta en 10 días', hecho: '3 jornadas completas de falta en 10 días', filas: ['Hoy · miércoles 4 nov · jornada completa', 'Viernes 30 oct · jornada completa', 'Miércoles 28 oct · jornada completa']}
};
function panelAtender(name) {
  const d = ABS[name] || null, sg = SEG[name] || null; if (!d && !sg) { miniFichaAlumno(name); return; }
  const titulo0 = (d || sg).titulo;
  const al = ALU[name] || {n: 0}, pri = name.split(' ')[0];
  if (!document.getElementById('abs-css')) {
    const st = el('style'); st.id = 'abs-css';
    st.textContent = '.abs{padding:14px;display:flex;flex-direction:column;gap:14px;font-family:inherit}'
      + '.abs-card{border:1px solid #d5e0ec;border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:10px;background:#fff}'
      + '.abs-tit{display:flex;align-items:center;gap:10px;font-weight:700;color:#1f2f40;font-size:14px}'
      + '.abs-f{background:#f4f7fb;border-radius:6px;padding:8px 10px;font-size:13px;color:#33475b}'
      + '.abs-q{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#44586d}'
      + '.abs-in{background:#f4f8fd;border:1px solid #d5e0ec;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px}'
      + '.abs-bt{display:flex;justify-content:flex-start}';
    document.head.appendChild(st);
  }
  const b = el('div', 'abs');
  /* Una tarjeta por motivo por el que el alumno está en la home; Marcos Santos está en Absentismo y en Rendimiento */
  const tarjeta = (tag, st, titulo, filas, link, msg) => {
    const card = el('div', 'abs-card'), tit = el('div', 'abs-tit'), stt = document.createElement('wc-status');
    stt.text = tag; stt.status = st; stt.variant = 'outline';
    tit.appendChild(stt); tit.appendChild(el('span', '', esc(titulo))); card.appendChild(tit);
    filas.forEach((f) => card.appendChild(el('div', 'abs-f', esc(f))));
    const ver = document.createElement('button-bar'); ver.buttons = [{id: 'ver' + tag, label: link + ' ' + pri, variant: 'link', size: 'sm', callback: () => flash(b, msg + ' de ' + name + ': módulo en construcción en este prototipo.')}];
    card.appendChild(ver); b.appendChild(card);
  };
  if (d) tarjeta('Absentismo', 'error', d.titulo, d.filas.concat(d.pct ? [d.pct + ' % de ausencias en el trimestre'] : []), 'Ver asistencia de', 'Asistencia');
  if (sg) {
    const rend = sg.tema === 'Rendimiento';
    tarjeta(sg.tema, rend ? 'warning' : 'info', sg.titulo, sg.filas.map((f) => f.a + ' · ' + (rend ? f.nota : f.b)), rend ? 'Ver calificaciones de' : 'Ver incidencias de', rend ? 'Calificaciones' : 'Incidencias');
  }

  b.appendChild(el('div', 'abs-q', '¿Qué quieres hacer?'));
  const acc = document.createElement('button-bar'), zona = el('div');
  let modo = null;
  const pinta = () => { acc.buttons = [['com', 'Escribir a la familia'], ['ent', 'Proponer entrevista']].map((m) => ({id: m[0], label: m[1], shape: 'pill', size: 'sm', variant: modo === m[0] ? 'primary' : 'outline-primary', callback: () => abre(modo === m[0] ? null : m[0])})); };
  const cierra = () => abre(null);
  const botones = (ok, fn) => { const bb = document.createElement('button-bar'), w = el('div', 'abs-bt'); bb.buttons = [{id: 'ok', label: ok, variant: 'primary', callback: fn}, {id: 'c', label: 'Cancelar', variant: 'light', callback: cierra}]; w.appendChild(bb); return w; };
  function abre(m) {
    modo = m; pinta(); zona.innerHTML = '';
    if (!m) return;
    const caja = el('div', 'abs-in');
    if (m === 'com') {
      const f = form([{id: 'msg', type: 'textarea', label: 'Comunicado a la familia de ' + name, rows: 7, columns: 12,
        defaultValue: 'Buenos días:\n\nComo tutora de ' + GRUPO + ', me pongo en contacto con ustedes porque hemos detectado ' + titulo0 + (d ? ' de ' : ' en el caso de ') + pri + '. Me gustaría comentarlo con ustedes para buscar juntos cómo ayudarle.\n\nUn saludo,\nLaura García'}]);
      caja.appendChild(f);
      caja.appendChild(botones('Enviar comunicado', () => { cierra(); flash(b, 'Comunicado enviado a la familia de ' + name); }));
    } else {
      const f = form([{id: 'fecha', type: 'date', label: 'Fecha', defaultValue: '2026-11-06', min: '2026-11-05', columns: 4},
        {id: 'hora', type: 'time', label: 'Hora', defaultValue: '16:30', columns: 3},
        {id: 'mod', type: 'select', label: 'Modalidad', options: ['Presencial', 'Online', 'Telefónica'].map((t) => ({value: t, label: t})), defaultValue: 'Presencial', columns: 5}]);
      caja.appendChild(f);
      caja.appendChild(botones('Proponer a la familia', () => {
        const v = f.getData(), p = String(v.fecha || '2026-11-06').split('-'), fam = [[al.pa || 'Padre de ' + pri, 'Padre', true], [al.ma || 'Madre de ' + pri, 'Madre', true], [name, 'Alumno', true]];
        ENTREVISTAS.push({id: 'e' + (ENTREVISTAS.length + 1), alumno: name, sec: GRUPO, fecha: p[2] + '/' + p[1] + '/' + p[0], hora: v.hora || '16:30', estado: 'Solicitada', lugar: v.mod === 'Presencial' ? 'Centro' : (v.mod || 'Centro'), solicitante: 'Laura García', motivo: titulo0, fam: fam});
        if (ENT_LISTA) ENT_LISTA.data = entNodos();
        cierra(); flash(b, 'Entrevista propuesta a la familia de ' + name);
      }));
    }
    zona.appendChild(caja);
  }
  pinta(); b.appendChild(acc); b.appendChild(zona);
  const nota = form([{id: 'nota', type: 'textarea', label: 'Anotación de seguimiento', placeholder: 'Ej.: hablado con el alumno en tutoría individual...', rows: 3, columns: 12}]);
  const gb = document.createElement('button-bar'), gw = el('div', 'abs-bt');
  gb.buttons = [{id: 'gn', label: 'Guardar anotación', variant: 'link', size: 'sm', callback: () => { if (!(nota.getData().nota || '').trim()) return; flash(b, 'Anotación guardada'); }}]; gw.appendChild(gb);
  b.appendChild(nota); b.appendChild(gw);
  open({header: {title: name, subtitle: 'Mi tutoría · ' + GRUPO + ' · Nº ' + al.n, icon: hdrIcon('alumnos'), navBtn: {text: 'Ver ficha del alumno', url: '#', callback: () => miniFichaAlumno(name)}}, body: b,
    footer: {buttons: [{label: 'Marcar como revisado', variant: 'primary', callback: () => { flash(b, 'Marcado como revisado'); panel.refreshFooter({buttons: [{label: 'Cerrar', variant: 'light', callback: () => panel.close()}]}); }}, {label: 'Ver ficha del alumno', variant: 'light', callback: () => miniFichaAlumno(name)}]}}); fotoHdr(name);
}
function conductaCfg(name) {
  const f = form([{id: 'fi', type: 'text', label: 'Fecha inicio', value: '04/11/2026', columns: 6}, {id: 'ff', type: 'text', label: 'Fecha fin', value: '04/11/2026', columns: 6},
    {id: 'tipo', type: 'select', label: 'Tipo de incidencia', options: ['Conducta en clase', 'Ausencia injustificada', 'Retraso', 'Uso del móvil'].map((t) => ({value: t, label: t})), value: 'Conducta en clase', columns: 12},
    {id: 'obs', type: 'textarea', label: 'Observaciones', placeholder: 'Describe lo ocurrido...', rows: 4, columns: 12}]);
  const b = el('div'); b.appendChild(f);
  const back = () => { panel.goBack(); };
  return {header: {title: name, subtitle: 'Nueva incidencia', icon: hdrIcon('incidencias')}, body: b,
    footer: {buttons: [{label: 'Crear incidencia', variant: 'primary', callback: () => { back(); flashPanel('Incidencia creada'); }}, {label: 'Cancelar', variant: 'light', callback: back}]}};
}

/* ── Mi día reducido: la home en un panel (botón de la botonera). Mismos datos y mismos paneles que la home; bloques con divisor, 8px mínimo entre elementos ── */
function panelMiDia() {
  if (!document.getElementById('md-css')) {
    const st = el('style'); st.id = 'md-css';
    st.textContent = '.md{display:flex;flex-direction:column;font-family:inherit}.md-sec{padding:20px;display:flex;flex-direction:column;gap:12px}.md-sec+.md-sec{border-top:1px solid #e1e4e8}'
      + '.md-lab{margin:0;font-family:inherit;font-size:14px;font-weight:700;color:#333}.md-top{display:flex;align-items:center;justify-content:space-between;gap:8px}'
      + '.md-lk{border:0;background:none;padding:0;font-family:inherit;font-size:13px;font-weight:600;color:#285A92;cursor:pointer}.md-lk:hover{text-decoration:underline}'
      + '.md-eb{display:flex;align-items:center;gap:8px;font-size:13px;color:#5c5c5c}'
      + '.md-pill{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#285A92;border:1px solid #b9cfe6;border-radius:30px;padding:2px 11px}.md-pill i{width:7px;height:7px;border-radius:50%;background:#10855b;animation:mdpulse 2.2s ease-out infinite}'
      + '@keyframes mdpulse{0%{box-shadow:0 0 0 0 rgba(16,133,91,.45)}70%{box-shadow:0 0 0 7px rgba(16,133,91,0)}100%{box-shadow:0 0 0 0 rgba(16,133,91,0)}}@media (prefers-reduced-motion:reduce){.md-pill i{animation:none}}'
      + '.md-t{margin:0;font-family:Nunito,sans-serif;font-weight:300;font-size:26px;line-height:1.15;color:#111}.md-m{margin:0;font-family:inherit;font-size:13px;line-height:1.4;color:#5c5c5c}'
      + '.md-list{gap:0;padding-bottom:8px}.md-list .md-top{margin-bottom:12px}'
      + '.md-row{display:grid;gap:12px;align-items:center;margin:0 -20px;padding:12px 20px;cursor:pointer;border-top:1px solid #e1e4e8;transition:background .15s}.md-row:hover{background:#f8fafd}'
      + '.md-ev{grid-template-columns:44px minmax(0,1fr);align-items:start}.md-h{font-size:13px;font-weight:600;color:#333;text-align:right}'
      + '.md-x{display:flex;flex-direction:column;gap:8px;min-width:0}.md-x b{font-size:14px;line-height:1.2;color:#111;font-weight:600}.md-x em{font-style:normal;font-size:12.5px;line-height:1.3;color:#5c5c5c}'
      + '.md-ask{grid-template-columns:36px minmax(0,1fr) auto}.md-n{font-family:Nunito,sans-serif;font-weight:300;font-size:24px;line-height:1;color:#111}'
      + '.md-stu{grid-template-columns:40px minmax(0,1fr);align-items:start}.md-stu img{width:40px;height:40px;border-radius:50%;display:block}'
      + '.md-nm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px;font-weight:700;color:#111}'
      + '.md-tag{font-size:11px;font-weight:700;border:1px solid var(--c);color:var(--ct);background:#fff;border-radius:30px;padding:0 9px}';
    document.head.appendChild(st);
  }
  const b = el('div', 'md'), sec = (html, cls) => { const x = el('div', 'md-sec' + (cls ? ' ' + cls : ''), html); b.appendChild(x); return x; };
  const cab = (t, lk, fn) => { const h = el('div', 'md-top', '<h3 class="md-lab">' + t + '</h3>'); if (lk) { const l = el('button', 'md-lk', lk); l.onclick = fn; h.appendChild(l); } return h; };
  /* Ahora: la sesión en curso con sus acciones */
  const a = sec('<div class="md-eb"><span class="md-pill"><i></i>Ahora</span><span>08:30 – 09:25 · quedan 22 min</span></div><h3 class="md-t">Matemáticas · 2º ESO B</h3><p class="md-m">Aula 204 · 26 alumnos · 2 ausencias ya comunicadas</p>');
  const acts = document.createElement('button-bar');
  acts.buttons = conTitle([{id: 'tp', label: 'Todos presentes', class: 'aceptar', shape: 'pill', variant: 'outline-primary', textOut: true, callback: () => flash(b, 'Lista guardada: se mantienen las 2 ausencias comunicadas')},
    {id: 'pl', label: 'Pasar lista', class: 'pasar_lista', shape: 'pill', variant: 'outline-primary', textOut: true, callback: () => abrirLista(Object.assign({fecha: 'Miércoles 4/11'}, CLASES.mat2b))}]);
  { const sh = new CSSStyleSheet(); sh.replaceSync('.wcb-btn.wcb-variant-outline-primary,.wcb-btn.wcb-variant-outline-primary:not(:hover):not(:active):not(:disabled){background:transparent!important;box-shadow:none!important}.wcb-btn{width:auto!important;min-width:88px;gap:8px}.wcb-icon-frame{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:44px;height:44px;border:1px solid #e8e9eb;border-radius:50%;background:#fff}.wcb-mask-icon::before{width:18px!important;height:18px!important;min-height:0!important}.wcb-label{white-space:nowrap;overflow:visible!important;text-overflow:clip!important}'); if (acts.shadowRoot) acts.shadowRoot.adoptedStyleSheets = [...acts.shadowRoot.adoptedStyleSheets, sh]; }
  const a2 = sec(''); a2.appendChild(acts);
  /* Hoy: lo que viene después */
  const dia = DIAS.filter((d) => d.f === AG_HOY)[0], hm = (m) => (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60);
  const evs = dia.r.map((r) => agEvento(r, dia)).sort((x, y) => x.a - y.a).filter((e) => e.a > AG_AHORA).slice(0, 3);
  const h = sec('', 'md-list'); h.appendChild(cab('Hoy, a continuación', 'Ver agenda', panelAgenda));
  evs.forEach((e) => { const r = el('div', 'md-row md-ev', '<span class="md-h">' + hm(e.a) + '</span><span class="md-x"><b>' + esc(e.nombre) + '</b><em>' + esc([e.sub, e.det].filter(Boolean)[0] || '') + '</em></span>'); r.onclick = panelAgenda; h.appendChild(r); });
  /* Pide respuesta */
  const q = sec('', 'md-list'); q.appendChild(cab('Pide respuesta'));
  const pend = items.filter((i) => i.grupo === GRUPO && i.estado === 'pendiente').length, porAc = items.filter((i) => i.grupo === GRUPO && i.estado === 'por_aceptar').length;
  [['incidencias', porAc, 'Justificaciones por aceptar', () => panelInc({mode: 'tutor', grupo: GRUPO, tab: 'aceptar', todas: true})],
    ['incidencias', pend, 'Faltas y retrasos sin justificar', () => panelInc({mode: 'tutor', grupo: GRUPO, todas: true})],
    ['entrevistas', ENTREVISTAS.filter(entPendiente).length, 'Entrevistas por responder', panelEntrevistas],
    ['comunicados', 7, 'Autorizaciones sin respuesta', avisarFamilias]].forEach((x) => {
    const r = el('div', 'md-row md-ask'), ic = document.createElement('wc-icon'), hi = hdrIcon(x[0]);
    ic.setAttribute('name', hi.name); ic.setAttribute('shape', 'circle'); ic.setAttribute('size', 'md'); ic.setAttribute('color-bg', hi.colorBg); ic.setAttribute('icon-color', hi.iconColor); ic.setAttribute('border-color', 'transparent');
    r.appendChild(ic); r.appendChild(el('span', 'md-x', '<b>' + esc(x[2]) + '</b>')); r.appendChild(el('span', 'md-n', String(x[1]))); r.onclick = x[3]; q.appendChild(r);
  });
  /* Alumnos que piden atención: los tres más urgentes */
  const TAGC = {Absentismo: ['#d15e5e', '#a01233'], Convivencia: ['#54a0d2', '#0a529f'], Rendimiento: ['#daa46e', '#8a5a00'], Riesgo: ['#d9822b', '#9a4f12']};
  const al = sec('', 'md-list'); al.appendChild(cab('Alumnos que piden atención', null));
  ['Sergio Prieto', 'Daniel Ortiz', 'Marcos Santos'].forEach((n) => {
    const tags = COLS.filter((c) => c.rows.some((r) => r[0] === n)).map((c) => (c.k === 'Riesgo de evaluación' ? 'Riesgo' : c.k));
    const fila = COLS.map((c) => c.rows.filter((r) => r[0] === n)[0]).filter(Boolean)[0];
    const r = el('div', 'md-row md-stu'), img = new Image(); img.src = avatar(n); img.alt = '';
    r.appendChild(img); r.appendChild(el('span', 'md-x', '<span class="md-nm">' + esc(n) + tags.map((t) => '<span class="md-tag" style="--c:' + TAGC[t][0] + ';--ct:' + TAGC[t][1] + '">' + t + '</span>').join('') + '</span><em>' + esc(fila ? fila[1] : '') + '</em>'));
    r.onclick = () => panelAtender(n); al.appendChild(r);
  });
  open({header: {title: 'Mi día', subtitle: 'Miércoles, 4 de noviembre', icon: hdrIcon('midia')}, body: b, footer: {buttons: [{label: 'Cerrar', variant: 'light', callback: () => panel.close()}]}});
}

/* ── Botonera de webparts (webpart-botonera.js: _render) ── */
const bar = document.createElement('button-bar');
bar.id = 'webpartBotonera'; bar.className = 'webpart-botonera-fija'; bar.extraCss = '../webpart-botonera.css';
document.body.appendChild(bar);
document.body.classList.add('con-botonera-webpart');
bar.gap = '1rem'; bar.orientation = 'vertical';
const BTN = (code, label, fn, extra) => Object.assign({id: code, title: label, iconColor: HI[code].iconColor, colorBg: HI[code].colorBg, borderColor: 'transparent', class: HI[code].icon, shape: 'pill', textOut: true, size: 'sm', callback: fn}, extra || {});
const enConstruccion = (code, label) => () => open(placeholder(code, label));
bar.buttons = [
  {id: 'boton_ia_botonera', class: 'ia_alexia_mujer', iconOriginal: true, title: 'Asistente de IA', shape: 'pill', textOut: true, size: 'sm', colorBg: '#E3EBF3', borderColor: 'transparent', callback: enConstruccion('situacion360', 'Asistente de IA')},
  BTN('midia', 'Mi día', panelMiDia),
  BTN('incidencias', 'Incidencias', () => panelInc(), {badge: items.filter((i) => i.estado !== 'aceptada' && (TUT.indexOf(i.grupo) > -1 || MIS.indexOf(i.asig) > -1)).length}),
  BTN('alumnos', 'Mis alumnos', panelAlumnos),
  BTN('areas', 'Mis áreas', panelAreas),
  BTN('secciones', 'Secciones', panelSecciones),
  BTN('comunicados', 'Comunicados', panelComunicados),
  BTN('entrevistas', 'Entrevistas', panelEntrevistas),
  BTN('encuestas', 'Encuestas', panelEncuestas),
  BTN('agenda', 'Agenda', panelAgenda),
  BTN('aniversarios', 'Cumpleaños', enConstruccion('aniversarios', 'Cumpleaños')),
  BTN('galerias', 'Galerías', enConstruccion('galerias', 'Galerías')),
  BTN('alarmas', 'Gestionar alarmas', enConstruccion('alarmas', 'Gestionar alarmas'), {badge: 20}),
  BTN('enlaces', 'Enlaces', enConstruccion('enlaces', 'Enlaces')),
  {id: 'pedidos', title: 'Pedidos', icon: SVG_PEDIDOS, iconColor: '#2b6cb0', colorBg: '#dbebfc', borderColor: 'transparent', shape: 'pill', textOut: true, size: 'sm', badge: 2, callback: () => open({header: {title: 'Pedidos', subtitle: 'Panel del profesor'}, body: pad(banner('Módulo en construcción en este prototipo.', 'info', false))})},
  {id: 'acceso', title: 'Acceso', icon: SVG_ACCESO, iconColor: '#2A8DA9', colorBg: '#d8f5fe', borderColor: 'transparent', shape: 'pill', textOut: true, size: 'sm', callback: () => open({header: {title: 'Acceso', subtitle: 'Panel del profesor'}, body: pad(banner('Módulo en construcción en este prototipo.', 'info', false))})}
];
panel.anchor = '#webpartBotonera';
panel.backdrop = true;

/* ── Home ── */
/* Barras pequeñas por alumno dentro de las tarjetas de la home: [nombre, cantidad] */
function miniBars(host, rows, color) {
  if (!host) return;
  const max = Math.max.apply(null, rows.map((r) => r[1]).concat([1]));
  host.innerHTML = rows.map((r) => '<div class="hm-mini-r"><span class="hm-mini-n" title="' + esc(r[0]) + '">' + esc(r[0]) + '</span><span class="hm-mini-t"><i style="width:' + Math.round(r[1] / max * 100) + '%;background:' + color + '"></i></span><span class="hm-mini-c">' + r[1] + '</span></div>').join('');
  host.setAttribute('role', 'img'); host.setAttribute('aria-label', rows.map((r) => r[0] + ' ' + r[1]).join(', '));
}
function syncHome() {
  const g = items.filter((i) => i.grupo === GRUPO), pend = g.filter((i) => i.estado === 'pendiente');
  const v = {
    pendiente: pend.length, por_aceptar: g.filter((i) => i.estado === 'por_aceptar').length,
    faltas: pend.filter((i) => i.tipo === 'Falta').length, retrasos: pend.filter((i) => i.tipo === 'Retraso').length,
    'alumnos-falta': Object.keys(pend.filter((i) => i.tipo === 'Falta').reduce((a, i) => { a[i.alumno] = 1; return a; }, {})).length
  };
  document.querySelectorAll('[data-inc-stat]').forEach((e) => { e.textContent = v[e.dataset.incStat]; });
  const porAl = pend.filter((i) => i.tipo === 'Falta').reduce((a, i) => { a[i.alumno] = (a[i.alumno] || 0) + 1; return a; }, {});
  miniBars($('hm-mini-faltas'), Object.keys(porAl).map((n) => [n, porAl[n]]).sort((x, y) => y[1] - x[1]).slice(0, 3), 'var(--alexia-color-danger)');
  miniBars($('hm-mini-conducta'), [['Adrián Castro', 2], ['Pablo Gómez', 1], ['Daniel Ortiz', 1]], 'var(--alexia-color-info)');
  const fj = $('hm-feed-just');
  if (fj && fj.updateNode) fj.updateNode('just', {title: v.pendiente + ' faltas y retrasos de ' + GRUPO + ' siguen sin justificar', subtitle: 'Además, ' + v.por_aceptar + ' justificaciones de familias esperan tu aceptación'});
  if (window.__v4sync) window.__v4sync();
}
function renderHome() {
  const ic = (name, c) => ({name: name, shape: 'circle', colorBg: c[0], iconColor: c[1], borderColor: 'transparent'});
  const btn = (label, variant, cb) => ({id: label, label: label, variant: variant, shape: 'rounded', size: 'sm', callback: cb});
  const urg = [
    {id: 'lista', title: 'Aún no has pasado lista en ' + GRUPO + ' · Matemáticas', subtitle: 'Ahora · 08:30 – 09:25 · Aula 204 · quedan 22 min · 2 ausencias ya comunicadas', icon: ic('pasar_lista', ['#e1f0fa', '#54a0d2']), buttons: [btn('Pasar lista', 'primary', () => abrirLista(Object.assign({fecha: 'Miércoles 4/11'}, CLASES.mat2b)))]},
    {id: 'aut', title: '7 familias aún no han contestado autorizaciones vigentes', subtitle: 'La excursión al Museo Nacional de Ciencias Naturales caduca en 4 días', icon: ic('comunicado', ['#fff4f4', '#d15e5e']), buttons: [btn('Avisar familias', 'primary', avisarFamilias)]},
    {id: 'just', title: '13 faltas y retrasos de ' + GRUPO + ' siguen sin justificar', subtitle: 'Además, 3 justificaciones de familias esperan tu aceptación', icon: ic('incidencias', ['#FFFDE7', '#B7791F']), buttons: [btn('Justificar', 'primary', () => panelInc({mode: 'tutor', grupo: GRUPO, todas: true}))]}
  ];
  const hoy = [{id: 'hoy', title: 'Hoy tienes un examen a las 10:20 con 1º Bachillerato A y la entrevista con la Fam. Gómez a las 11:45', subtitle: 'El viernes a las 08:00 hay claustro extraordinario en la sala de profesores', icon: ic('agenda', ['#eaf7ea', '#7cbf86']), buttons: [btn('Ver agenda de hoy', 'light', panelAgenda)]}];
  const rec = [{id: 'enc', title: '2 encuestas del centro están pendientes de responder', subtitle: 'La del comedor escolar cierra el 11 nov · unos 3 minutos', icon: ic('mis-encuestas', ['#fdf9e8', '#daa46e']), buttons: [btn('Responder', 'light', panelEncuestas)]}];
  const avisos = urg.length + hoy.length + rec.length;
  const feed = $('hm-sec-feed');
  [['AHORA Y URGENTE', urg, 'hm-feed-just'], ['PARA HOY', hoy], ['RECUERDA', rec]].forEach((g) => {
    const t = tree(g[1], {hideExpander: true, nodeHeight: '72px', disablePagination: true}); if (g[2]) t.id = g[2];
    const s = document.createElement('content-section'); s.setAttribute('label', g[0]); s.setAttribute('borderless', ''); s.appendChild(t); feed.appendChild(s);
  });
  feed.setAttribute('label', 'MIS AVISOS · ' + avisos + ' pendientes');

  const cols = $('hm-cols'), seen = {};
  COLS.forEach((c) => {
    const s = document.createElement('content-section'); s.setAttribute('label', c.k + ' · ' + c.sub); s.setAttribute('header-divider', ''); s.setAttribute('badge', String(c.rows.length));
    { const tt = new CSSStyleSheet(); tt.replaceSync('.header-text{font-size:14px!important;font-weight:700!important;color:var(--color-grey-800)!important}'); if (s.shadowRoot) s.shadowRoot.adoptedStyleSheets = [...s.shadowRoot.adoptedStyleSheets, tt]; }
    s.appendChild(tree(c.rows.map((r) => {
      seen[r[0]] = 1;
      return {id: c.k + r[0], title: r[0], subtitle: r[1], rightSubtitle: r[2] || null, image: {value: avatar(r[0]), maxWidth: '40px'},
        buttons: [{id: 'at' + r[0], label: 'Atender', variant: 'light', shape: 'rounded', size: 'xs', callback: () => { panelAtender(r[0]); }}]};
    }), {hideExpander: true, nodeHeight: '62px', disablePagination: true}));
    cols.appendChild(s);
  });
  const alumnos = Object.keys(seen).length;
  $('hm-sum-main').textContent = 'Tienes ' + avisos + ' avisos pendientes y ' + alumnos + ' alumnos de tu tutoría que necesitan atención.';
  $('hm-tut-n').textContent = alumnos + ' necesitan seguimiento de los 26 alumnos del grupo';
  $('hm-th-h').textContent = GRUPO + ' · 26 alumnos';

  const chips = document.createElement('button-bar'); let cur = 'todos';
  const setChips = () => {
    chips.buttons = [['todos', 'Todo'], ['accion', 'Mis pendientes · ' + avisos], ['tut', 'Mi tutoría · ' + alumnos]].map((c) => ({id: c[0], label: c[1], shape: 'pill', size: 'md', variant: cur === c[0] ? 'primary' : 'outline-primary', callback: () => { cur = c[0]; setChips(); }}));
    $('hm-sec-tut').style.display = cur === 'accion' ? 'none' : ''; $('hm-sec-feed').style.display = cur === 'tut' ? 'none' : '';
  };
  setChips(); $('hm-chips').appendChild(chips);
  const per = document.createElement('wc-button'); per.label = 'Personalizar inicio'; per.title = 'Personalizar inicio'; per.variant = 'light'; per.size = 'sm'; $('hm-personalizar').appendChild(per);
  const gr = document.createElement('wc-select'); gr.label = 'Grupo'; gr.options = ['Todos mis grupos', '2º ESO B · Matemáticas', '1º Bachillerato A · Matemáticas', '3º ESO A · Matemáticas'].map((t) => ({value: t, label: t})); gr.value = 'Todos mis grupos'; $('hm-grupo').appendChild(gr);
  const acts = document.createElement('button-bar'); acts.buttons = [{id: 'msg', label: 'Mensaje a las familias del grupo', variant: 'outline-primary', shape: 'pill', size: 'md', callback: () => open(comunicadoCfg(null, GRUPO))}];
  /* contorno en el azul primario (el outline por defecto trae borde gris) */
  { const az = new CSSStyleSheet(); az.replaceSync('.wcb-btn.wcb-variant-outline-primary{border:1px solid #285A92!important}.wcb-btn.wcb-variant-outline-primary:not(:hover):not(:active):not(:disabled){color:#285A92!important}'); if (acts.shadowRoot) acts.shadowRoot.adoptedStyleSheets = [...acts.shadowRoot.adoptedStyleSheets, az]; }
  $('hm-tut-acts').appendChild(acts);
  syncHome();
}
/* V4: misma base (paneles, datos, componentes), otra home. home-v4.html fija window.HOME_V4 antes de cargar este módulo. */
if (window.HOME_V4) {
  window.__MD = {panel, open, el, esc, $, GRUPO, items, ALU, SEG, ABS, COLS, ENTREVISTAS, entPendiente, entFam, entFicha, DIAS, agEvento, AG_HOY, AG_AHORA, AG_COL, CLASES, avatar, hdrIcon, flash, placeholder,
    panelInc, panelAtender, panelEntrevistas, panelAgenda, panelEncuestas, avisarFamilias, detalleSesion, listaCfg, abrirLista, miniFichaAlumno, comunicadoCfg, entProponer};
  const m = await import('./home-v4.js?v=9');
  m.renderHomeV4(window.__MD);
} else renderHome();

/* ── Animación de entrada: números que cuentan, barras que crecen, tarjetas que aparecen ── */
function animarHome() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ease = (t) => 1 - Math.pow(1 - t, 3), DUR = 1100, NUM = /\d+(?:,\d+)?/g;
  const kpis = Array.prototype.slice.call(document.querySelectorAll('.hm-kp'));
  kpis.forEach((k, i) => {
    k.style.opacity = '0'; k.style.transform = 'translateY(10px)';
    setTimeout(() => { k.style.transition = 'opacity .5s ease, transform .5s ease'; k.style.opacity = '1'; k.style.transform = 'none'; }, 60 + i * 110);
  });
  /* Números: cada texto con cifras se reescribe frame a frame hasta su valor real */
  const nodos = [];
  document.querySelectorAll('.hm-kv, .hm-kn, .hm-leg, #hm-sum-main, #hm-tut-n').forEach((host) => {
    const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) { if (NUM.test(n.nodeValue)) nodos.push({n: n, orig: n.nodeValue}); NUM.lastIndex = 0; }
  });
  const fmt = (m, p) => { const dec = m.indexOf(',') > -1 ? m.split(',')[1].length : 0, v = parseFloat(m.replace(',', '.')) * p; return v.toFixed(dec).replace('.', ','); };
  const t0 = performance.now();
  const paso = (now) => {
    const p = ease(Math.min(1, (now - t0 - 150) / DUR));
    nodos.forEach((o) => { o.n.nodeValue = p <= 0 ? o.orig.replace(NUM, (m) => fmt(m, 0)) : o.orig.replace(NUM, (m) => fmt(m, p)); });
    if (p < 1) requestAnimationFrame(paso); else nodos.forEach((o) => { o.n.nodeValue = o.orig; });
  };
  requestAnimationFrame(paso);
  /* Barras de asistencia: crecen desde cero, escalonadas */
  document.querySelectorAll('.hm-bars .hm-bar > div').forEach((b, i) => {
    const h = b.style.height; b.style.height = '0px';
    setTimeout(() => { b.style.transition = 'height .8s cubic-bezier(.2,.9,.3,1.15)'; b.style.height = h; }, 350 + i * 90);
  });
  /* Barra segmentada de evaluación: los tramos se abren de izquierda a derecha */
  document.querySelectorAll('.hm-seg > div').forEach((s, i) => {
    const w = s.style.width; s.style.width = '0%';
    setTimeout(() => { s.style.transition = 'width .9s cubic-bezier(.2,.8,.2,1)'; s.style.width = w; }, 500 + i * 160);
  });
  /* Columnas de seguimiento y avisos: entran de abajo a arriba */
  document.querySelectorAll('#hm-cols > content-section, #hm-sec-feed > content-section').forEach((c, i) => {
    c.style.opacity = '0'; c.style.transform = 'translateY(14px)';
    setTimeout(() => { c.style.transition = 'opacity .55s ease, transform .55s ease'; c.style.opacity = '1'; c.style.transform = 'none'; }, 450 + i * 120);
  });
}
if (!window.HOME_V4) requestAnimationFrame(animarHome);

/* Clic fuera del panel lo cierra (el right-sidebar real no cierra con el backdrop; en la maqueta sí). No cuenta el clic dentro del panel ni en la botonera de la derecha, que abre otro panel. */
document.addEventListener('pointerdown', (e) => {
  if (!panel.isOpen) return;
  const ruta = e.composedPath(), fondo = ruta.some((n) => n.classList && n.classList.contains('backdrop'));
  if (!fondo && (ruta.indexOf(panel) > -1 || ruta.indexOf(bar) > -1)) return;
  if (ruta.some((n) => n.classList && n.classList.contains('h4-toast'))) return;
  panel.close();
}, true);

/* ESC cierra el panel abierto (el right-sidebar real no lo hace solo); si un componente ya usó la tecla (p. ej. un desplegable), se respeta */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.defaultPrevented && panel.isOpen) panel.close();
});
