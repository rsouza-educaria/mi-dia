/* Mi día V4: la home pensada alrededor del día del profesor, no de los motivos de aviso.
   Misma base que la V3 (Web Components reales, paneles, datos de ejemplo); lo que cambia es el orden y el contenido:
   Ahora (la sesión en curso) · Hoy (línea de tiempo) · Pide respuesta · Mi tutoría por alumno · Mis clases.
   Datos inventados para la maqueta: estados de seguimiento, límite de faltas del centro, tareas por corregir y notas pendientes. */
export function renderHomeV4(M) {
  const {panel, open, el, esc, GRUPO, items, ALU, COLS, ENTREVISTAS, entPendiente, entFicha, DIAS, agEvento, AG_HOY, AG_AHORA, AG_COL, CLASES, avatar, hdrIcon, flash, placeholder,
    panelInc, panelAtender, panelEntrevistas, panelAgenda, panelEncuestas, avisarFamilias, detalleSesion, listaCfg, abrirLista} = M;
  const root = document.getElementById('h4-root');
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const $$ = (s, r) => Array.prototype.slice.call((r || root).querySelectorAll(s));
  const BLUE = '#285A92', AI = '#342453';
  const adopt = (host, css) => { const sh = new CSSStyleSheet(); sh.replaceSync(css); if (host.shadowRoot) host.shadowRoot.adoptedStyleSheets = [...host.shadowRoot.adoptedStyleSheets, sh]; };
  const bar = (list, css) => { const bb = document.createElement('button-bar'); bb.buttons = list.map((x) => Object.assign({shape: 'pill', size: 'md'}, x)); if (css) adopt(bb, css); return bb; };
  const ico = (code, size) => { const i = document.createElement('wc-icon'), h = hdrIcon(code); i.setAttribute('name', h.name); i.setAttribute('shape', 'circle'); i.setAttribute('size', size || 'md'); i.setAttribute('color-bg', h.colorBg); i.setAttribute('icon-color', h.iconColor); i.setAttribute('border-color', 'transparent'); return i; };
  const STAR = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.1L22 12l-7.6 2.9L12 22l-2.4-7.1L2 12l7.6-2.9z"/></svg>';
  const CHEV = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
  const CIRC = '.wcb-btn.wcb-variant-outline-primary,.wcb-btn.wcb-variant-outline-primary:not(:hover):not(:active):not(:disabled){background:transparent!important;box-shadow:none!important}'
    + '.wcb-btn{width:auto!important;min-width:84px;gap:8px}.wcb-icon-frame{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:44px;height:44px;border:1px solid #e8e9eb;border-radius:50%;background:#fff}'
    + '.wcb-mask-icon::before{width:18px!important;height:18px!important;min-height:0!important}.wcb-label{white-space:nowrap;overflow:visible!important;text-overflow:clip!important}';
  const AIBTN = '.wcb-btn.wcb-variant-outline-primary,.wcb-btn.wcb-variant-outline-primary:not(:hover):not(:active):not(:disabled){color:' + AI + '!important;border:1px solid #cbc3e6!important;background:#F1EFFA!important}.wcb-btn.wcb-variant-outline-primary:hover{background:#e7e2f7!important}';

  /* ── Toast con «Deshacer» ── */
  let toastEl = null, toastT = 0;
  function toast(msg, undo) {
    if (!toastEl) { toastEl = el('div', 'h4-toast'); toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>';
    if (undo) { const u = el('button', 'h4-toast-u', 'Deshacer'); u.onclick = () => { undo(); toastEl.classList.remove('on'); }; toastEl.appendChild(u); }
    toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 5200);
  }

  /* ── Estado local de la maqueta ── */
  const S = {rol: 'todos', filtro: 'todos', listaOk: false, revisado: {}};
  const CONTACT = {'Adrián Castro': {t: 'Familia escrita ayer', k: 'wr'}};
  const RES = {
    'Sergio Prieto': 'Cuatro faltas sin justificar esta semana y 18 % de ausencias en el trimestre. A este ritmo supera el 20 % del centro el 20 nov.',
    'Daniel Ortiz': 'Tres jornadas completas de falta en 10 días y una incidencia de conducta el martes. 14 % de ausencias.',
    'Marcos Santos': 'Tres faltas a 1ª hora en dos semanas y dos materias por debajo de 5 (Mat 4,1 · Ing 4,6). 11 % de ausencias.',
    'Pablo Gómez': 'Una amonestación por el uso del móvil y tres retrasos esta semana.',
    'Adrián Castro': 'Dos incidencias de conducta en 7 días: interrumpe la clase y una falta de respeto a un compañero.',
    'Nora Lozano': 'Tres materias por debajo de 5 (Mat 3,8 · Fís 4,2 · Len 4,5). Asma leve, lleva inhalador.',
    'Alicia Ramos': 'Dos materias por debajo de 5 (Fís 3,9 · His 4,7). Sin contacto con la familia este trimestre.'
  };
  const ORDEN = ['Sergio Prieto', 'Daniel Ortiz', 'Marcos Santos', 'Pablo Gómez', 'Adrián Castro', 'Nora Lozano', 'Alicia Ramos'];
  const TAGC = {Absentismo: ['#d15e5e', '#a01233'], Convivencia: ['#54a0d2', '#0a529f'], Rendimiento: ['#daa46e', '#8a5a00'], Riesgo: ['#d9822b', '#9a4f12']};
  const tagsOf = (n) => COLS.filter((c) => c.rows.some((r) => r[0] === n)).map((c) => (c.k === 'Riesgo de evaluación' ? 'Riesgo' : c.k));
  const fmtF = (f) => { const p = f.split('/'), d = new Date(2026, +p[1] - 1, +p[0]); return ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()] + ' ' + p[0] + '/' + p[1]; };
  function seguimiento(n) {
    const es = ENTREVISTAS.filter((e) => e.alumno === n);
    if (es.some((e) => e.estado === 'Cancelada' && e.porFamilia && !e.enterado)) return {t: 'Entrevista cancelada por la familia', k: 'wn'};
    const prox = es.filter((e) => e.estado === 'Aceptada' || e.estado === 'Solicitada')[0];
    if (prox) return {t: 'Entrevista ' + (prox.fecha === '04/11/2026' ? 'hoy ' : fmtF(prox.fecha) + ' · ') + prox.hora.slice(0, 5), k: 'ok'};
    if (CONTACT[n]) return CONTACT[n];
    const real = es.filter((e) => e.estado === 'Realizada')[0];
    if (real) return {t: 'Entrevista el ' + fmtF(real.fecha) + ' · revisión tras la evaluación', k: 'ok'};
    return {t: 'Sin contacto con la familia', k: ''};
  }
  const pend = () => items.filter((i) => i.grupo === GRUPO && i.estado === 'pendiente');
  const porAceptar = () => items.filter((i) => i.grupo === GRUPO && i.estado === 'por_aceptar');

  /* ── Cabecera ── */
  const top = el('div', 'h4-top h4-rv');
  const topL = el('div');
  topL.innerHTML = '<p class="h4-date">Miércoles, 4 de noviembre</p><h1 class="h4-h1">Buenos días, Laura</h1>'
    + '<p class="h4-brief"><span>Hoy empiezas con <b>Matemáticas a las 8:30</b>. Tres cosas piden tu atención antes de las 11:45:</span></p>'
    + '<div class="h4-src" id="h4-srcrow"><button class="h4-chip" data-go="lista">Pasar lista · 08:30</button><button class="h4-chip" data-go="just" id="h4-chip-just"></button><button class="h4-chip" data-go="ent">Entrevista Fam. Gómez · 11:45</button></div>';
  const topR = el('div', 'h4-top-r');
  const seg = el('div', 'h4-seg-ctl');
  const pintaSeg = () => { seg.replaceChildren(); const b = bar([['todos', 'Todo'], ['clases', 'Mis clases'], ['tutoria', 'Mi tutoría']].map((c) => ({id: c[0], label: c[1], variant: S.rol === c[0] ? 'primary' : 'outline-primary', callback: () => { S.rol = c[0]; pintaSeg(); filtraRol(); }}))); seg.appendChild(b); };
  topR.appendChild(seg);
  top.appendChild(topL); top.appendChild(topR); root.appendChild(top);
  $$('[data-go]', topL).forEach((b) => { b.onclick = () => { const g = b.dataset.go; if (g === 'lista') abrirLista(Object.assign({fecha: 'Miércoles 4/11'}, CLASES.mat2b)); else if (g === 'just') panelInc({mode: 'tutor', grupo: GRUPO, tab: 'aceptar', todas: true}); else { const ent = ENTREVISTAS.filter((x) => x.fecha === '04/11/2026' && x.hora.slice(0, 5) === '11:45')[0]; panelEntrevistas(); if (ent) entFicha(ent); } }; });
  const chipJust = () => { const c = topL.querySelector('#h4-chip-just'); if (c) c.textContent = porAceptar().length + ' justificaciones por aceptar'; };
  chipJust();

  /* ── Ahora ── */
  const now = el('section', 'h4-card h4-now h4-rv'); now.dataset.r = 'c';
  /* dos bloques separados por un divisor: la sesión (datos y acciones) y, debajo, los avisos de la clase con el apoyo de IA */
  const nowA = el('div', 'h4-now-a'), nowL = el('div', 'h4-now-l'), nowR = el('div', 'h4-now-r'), nowB = el('div', 'h4-now-b'), nowF = el('div', 'h4-flags');
  nowA.appendChild(nowL); nowA.appendChild(nowR); nowB.appendChild(nowF); now.appendChild(nowA); now.appendChild(nowB); root.appendChild(now);
  const claseAhora = Object.assign({fecha: 'Miércoles 4/11'}, CLASES.mat2b);
  /* clic en la sesión: abre el panel de la sección (detalle de sesión), con la agenda detrás para poder volver */
  nowL.tabIndex = 0; nowL.setAttribute('role', 'button'); nowL.setAttribute('aria-label', 'Abrir la sesión de Matemáticas de 2º ESO B');
  const abreSesion = () => { panelAgenda(); detalleSesion(claseAhora); };
  nowL.onclick = abreSesion; nowL.onkeydown = (k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); abreSesion(); } };
  function fillNow() {
    const av = ['Nora Lozano', 'Marcos Santos'].filter((n) => ALU[n] && ALU[n].av.length).map((n) => '<span class="h4-flag warn" title="Aviso médico o de salud">' + esc(n) + ': ' + esc(ALU[n].av[0].toLowerCase()) + '</span>').join('');
    nowL.innerHTML = '<div class="h4-now-eb"><span class="h4-pill on"><i></i>Ahora</span><span>08:30 – 09:25 · quedan 22 min</span></div>'
      + '<h2 class="h4-now-t">Matemáticas · 2º ESO B</h2><p class="h4-now-m">Aula 204 · 26 alumnos</p>';
    nowF.innerHTML = (S.listaOk ? '<span class="h4-flag ok">Lista guardada · 24 presentes y 2 ausencias comunicadas</span>' : '<span class="h4-flag">2 ausencias ya comunicadas por secretaría</span>') + av;
    nowR.replaceChildren();
    const acts = [];
    if (!S.listaOk) { acts.push({id: 'tp', label: 'Todos presentes', class: 'aceptar', callback: () => { S.listaOk = true; fillNow(); toast('Lista guardada: se mantienen las 2 ausencias comunicadas', () => { S.listaOk = false; fillNow(); }); }});
      acts.push({id: 'pl', label: 'Pasar lista', class: 'pasar_lista', callback: () => abrirLista(claseAhora)}); }
    acts.push({id: 'pr', label: 'Programación', class: 'programacion_didactica', callback: () => open(placeholder('areas', 'Programación'))});
    acts.push({id: 'cu', label: 'Cuaderno', class: 'cuaderno_profesor', callback: () => open(placeholder('cuaderno', 'Cuaderno del profesor'))});
    nowR.appendChild(bar(acts.map((a) => Object.assign({shape: 'pill', variant: 'outline-primary', textOut: true}, a)), CIRC));
    const viejo = nowB.querySelector('.h4-ia'); if (viejo) viejo.remove();
    const ia = bar([{id: 'ia', label: '✦ Preparar clase', variant: 'outline-primary', size: 'sm', callback: prepararClase}], AIBTN); ia.className = 'h4-ia';
    nowB.appendChild(ia);
  }
  function prepararClase() {
    const b = el('div'); b.style.padding = '14px';
    const bn = document.createElement('wc-banner'); bn.type = 'info'; bn.dismissible = false; bn.message = 'Borrador generado con Acciones IA a partir de la programación de Matemáticas en 2º ESO B. Revísalo antes de usarlo.';
    b.appendChild(bn);
    const L = el('div', 'h4-acts');
    [['Calentamiento · 10 min', 'Problema de la semana: ¿de cuántas formas se pueden repartir 24 baldosas en rectángulos?', 'Competencia específica 1'],
      ['Trabajo en parejas · 25 min', 'Ecuaciones de primer grado con balanzas virtuales, con dos niveles de dificultad para elegir.', 'Competencia específica 3'],
      ['Cierre · 10 min', 'Ticket de salida con tres preguntas autocorregibles para ver quién necesita refuerzo.', 'Competencia específica 5']].forEach((a) => {
      L.appendChild(el('div', 'h4-act', '<b>' + esc(a[0]) + '</b><p>' + esc(a[1]) + '</p><span class="h4-tag" style="--c:#cbc3e6;--ct:' + AI + '">' + esc(a[2]) + '</span>'));
    });
    b.appendChild(L);
    open({header: {title: 'Preparar clase', subtitle: 'Matemáticas · 2º ESO B · hoy 08:30', icon: hdrIcon('areas')}, body: b,
      footer: {buttons: [{label: 'Añadir a la sesión', variant: 'primary', callback: () => { panel.close(); toast('Borrador añadido a la sesión de hoy'); }}, {label: 'Descartar', variant: 'light', callback: () => panel.close()}]}});
  }

  /* ── Hoy + Pide respuesta ── */
  const two = el('div', 'h4-2col'); two.dataset.r = 'c t'; root.appendChild(two);
  const hoy = el('section', 'h4-card h4-rv'), ask = el('section', 'h4-card h4-rv');
  two.appendChild(hoy); two.appendChild(ask);
  { const dia = DIAS.filter((d) => d.f === AG_HOY)[0], evs = dia.r.map((r) => agEvento(r, dia)).sort((x, y) => x.a - y.a);
    const hm = (m) => (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60);
    const h = el('div', 'h4-card-h'); h.innerHTML = '<h2 class="h4-card-t">Hoy</h2>'; const lk = el('button', 'h4-link', 'Ver agenda ' + CHEV); lk.onclick = panelAgenda; h.appendChild(lk); hoy.appendChild(h);
    const tl = el('div', 'h4-tl');
    evs.forEach((e, i) => {
      const curso = e.esClase && e.a <= AG_AHORA && AG_AHORA < e.b, row = el('div', 'h4-ev' + (curso ? ' now' : ''));
      row.style.setProperty('--c', AG_COL[e.tipo]); row.style.setProperty('--d', (i * 90) + 'ms'); row.tabIndex = 0; row.setAttribute('role', 'button');
      row.innerHTML = '<span class="h4-ev-h">' + hm(e.a) + (e.b ? '<i>' + hm(e.b) + '</i>' : '') + '</span><span class="h4-ev-d"><b></b></span>'
        + '<span class="h4-ev-x"><span class="h4-ev-t">' + esc(e.nombre) + (curso ? ' <em>en curso</em>' : '') + '</span><span class="h4-ev-s">' + esc([e.sub, e.det].filter(Boolean).join(' · ')) + '</span></span>';
      /* la entrevista de hoy abre su ficha (con Mis entrevistas detrás); las clases, el detalle de la sesión; el resto, la agenda */
      const ent = e.tipo === 'ent' ? ENTREVISTAS.filter((x) => x.fecha === '04/11/2026' && x.hora.slice(0, 5) === hm(e.a))[0] : null;
      const go = () => { if (ent) { panelEntrevistas(); entFicha(ent); return; } panelAgenda(); if (e.clase && e.tipo !== 'exam') detalleSesion(e.clase); };
      row.onclick = go; row.onkeydown = (k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); go(); } };
      tl.appendChild(row);
    });
    hoy.appendChild(tl); }
  function fillAsk() {
    ask.replaceChildren();
    const h = el('div', 'h4-card-h'); h.innerHTML = '<h2 class="h4-card-t">Pide respuesta</h2>'; ask.appendChild(h);
    const ent = ENTREVISTAS.filter(entPendiente).length, p = pend().length, a = porAceptar().length;
    const rows = [
      ['incidencias', a, 'justificaciones por aceptar', 'Familias que ya han explicado una falta', () => panelInc({mode: 'tutor', grupo: GRUPO, tab: 'aceptar', todas: true})],
      ['incidencias', p, 'faltas y retrasos sin justificar', 'En ' + GRUPO + ', concentradas en pocos alumnos', () => panelInc({mode: 'tutor', grupo: GRUPO, todas: true})],
      ['entrevistas', ent, 'entrevistas por responder', 'Solicitudes y cancelaciones de familias', panelEntrevistas],
      ['comunicados', 7, 'autorizaciones sin respuesta', 'La excursión al Museo caduca en 4 días', avisarFamilias],
      ['encuestas', 2, 'encuestas del centro', 'La del comedor cierra el 11 nov · 3 minutos', panelEncuestas]
    ];
    rows.forEach((r) => {
      const row = el('div', 'h4-ask' + (r[1] === 0 ? ' done' : '')); row.tabIndex = 0; row.setAttribute('role', 'button');
      row.appendChild(ico(r[0], 'md'));
      row.appendChild(el('span', 'h4-ask-x', '<span class="h4-ask-t">' + esc(r[2]) + '</span><span class="h4-ask-s">' + esc(r[3]) + '</span>'));
      row.appendChild(el('span', 'h4-ask-n', '<b>' + r[1] + '</b>' + CHEV));
      row.onclick = r[4]; row.onkeydown = (k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); r[4](); } };
      ask.appendChild(row);
    });
  }

  /* ── Mi tutoría ── */
  const tut = el('section', 'h4-sec h4-rv'); tut.dataset.r = 't'; root.appendChild(tut);
  const tHead = el('div', 'h4-sh');
  tHead.innerHTML = '<span class="h4-sh-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4 1.8 4 4.5"/></svg></span>'
    + '<div class="h4-sh-t"><p class="h4-sh-eb">MI TUTORÍA</p><h2 class="h4-sh-h">' + esc(GRUPO) + ' · 26 alumnos</h2></div>';
  const tAct = el('div', 'h4-sh-r');
  tAct.appendChild(bar([{id: 'msg', label: 'Mensaje a las familias del grupo', variant: 'outline-primary', callback: () => open(M.comunicadoCfg(null, GRUPO))}], '.wcb-btn.wcb-variant-outline-primary{border:1px solid #285A92!important}.wcb-btn.wcb-variant-outline-primary:not(:hover):not(:active):not(:disabled){color:#285A92!important}'));
  tHead.appendChild(tAct); tut.appendChild(tHead);
  const stats = el('div', 'h4-card h4-stats'); tut.appendChild(stats);
  function fillStats(final) {
    const fa = pend().filter((i) => i.tipo === 'Falta'), re = pend().filter((i) => i.tipo === 'Retraso').length;
    const por = {}; fa.forEach((i) => { por[i.alumno] = (por[i.alumno] || 0) + 1; });
    const top3 = Object.keys(por).map((n) => [n, por[n]]).sort((a, b) => b[1] - a[1]).slice(0, 3), tot = top3.reduce((s, x) => s + x[1], 0) || 1;
    const RC = ['#b6153a', '#d4566f', '#e79aa8'];
    stats.innerHTML =
      '<div class="h4-st"><span class="h4-st-l">Asistencia esta semana</span><span class="h4-st-v"><b class="h4-n" data-v="95,1">95,1</b> <small>%</small></span><span class="h4-st-n">Mejor que la semana pasada</span>'
      + '<div class="h4-spark" role="img" aria-label="Asistencia diaria: lunes 96 %, martes 93 %, miércoles 94 %, jueves 97 %">' + [['L', 28], ['M', 18], ['X', 22], ['J', 25], ['V', 2]].map((d, i) => '<span><i data-h="' + d[1] + '" style="--b:' + (i === 3 ? '#9cc3e0' : i === 4 ? '#d0deec' : BLUE) + '"></i><em>' + d[0] + '</em></span>').join('') + '</div></div>'
      + '<div class="h4-st"><span class="h4-st-l">Faltas sin justificar</span><span class="h4-st-v" style="color:#a01233"><b class="h4-n" data-v="' + fa.length + '">' + fa.length + '</b> <small>faltas</small></span><span class="h4-st-n" style="color:#a01233;font-weight:600">+ ' + re + ' retrasos sin justificar</span>'
      + '<div class="h4-split" role="img" aria-label="' + esc(top3.map((x) => x[0] + ' ' + x[1]).join(', ')) + '">' + top3.map((x, i) => '<i data-w="' + Math.round(x[1] / tot * 100) + '" style="background:' + RC[i] + '"></i>').join('') + '</div>'
      + '<span class="h4-st-n">' + esc(top3.map((x) => x[0].split(' ')[0] + ' ' + x[1]).join(' · ')) + '</span></div>'
      + '<div class="h4-st"><span class="h4-st-l">Incidencias de conducta</span><span class="h4-st-v" style="color:#0a529f"><b class="h4-n" data-v="4">4</b> <small>este mes</small></span><span class="h4-st-n" style="color:#0a529f;font-weight:600">3 en los últimos 7 días</span>'
      + '<div class="h4-dots" role="img" aria-label="4 incidencias este mes">' + [1, 1, 1, 0].map((x) => '<i class="' + (x ? 'r' : '') + '"></i>').join('') + '</div><span class="h4-st-n">Implican a 3 alumnos</span></div>'
      + '<div class="h4-st"><span class="h4-st-l">Evaluación continua</span><span class="h4-st-v"><b class="h4-n" data-v="6,4">6,4</b> <small>de media</small></span><span class="h4-st-n">17 aprueban todo</span>'
      + '<div class="h4-split" role="img" aria-label="17 aprueban todo, 7 con 1 o 2 suspensas, 2 con 3 o más"><i data-w="65" style="background:#10855b"></i><i data-w="27" style="background:#ebb851"></i><i data-w="8" style="background:#b6153a"></i></div><span class="h4-st-n">7 con 1 o 2 suspensas · 2 con 3 o más</span></div>';
    if (!RM && !final) { $$('.h4-spark i', stats).forEach((b) => { b.style.height = '0px'; }); $$('.h4-split i', stats).forEach((b) => { b.style.width = '0%'; }); }
    else { $$('.h4-spark i', stats).forEach((b) => { b.style.height = b.dataset.h + 'px'; }); $$('.h4-split i', stats).forEach((b) => { b.style.width = b.dataset.w + '%'; }); }
  }
  const stuCard = el('div', 'h4-card'); tut.appendChild(stuCard);
  function fillStu() {
    const lista = ORDEN.filter((n) => tagsOf(n).length), pend2 = lista.filter((n) => !S.revisado[n]), hechos = lista.filter((n) => S.revisado[n]);
    stuCard.replaceChildren();
    const h = el('div', 'h4-card-h h4-stu-h');
    h.innerHTML = '<div><h2 class="h4-card-t">' + pend2.length + ' alumnos piden atención</h2><p class="h4-card-s">Ordenados por urgencia. Cada alumno aparece una sola vez, con sus motivos.</p></div>';
    h.appendChild(bar([['todos', 'Todos'], ['Absentismo', 'Absentismo'], ['Convivencia', 'Convivencia'], ['Rendimiento', 'Rendimiento'], ['Riesgo', 'Riesgo']].map((c) => ({id: 'f' + c[0], label: c[1], size: 'sm', variant: S.filtro === c[0] ? 'primary' : 'outline-primary', callback: () => { S.filtro = c[0]; fillStu(); }}))));
    stuCard.appendChild(h);
    const mk = (n, hecho) => {
      const tags = tagsOf(n), sg = seguimiento(n), row = el('div', 'h4-stu' + (hecho ? ' hecho' : ''));
      const av = el('img', 'h4-stu-av'); av.src = avatar(n); av.alt = '';
      const body = el('div', 'h4-stu-b');
      body.innerHTML = '<div class="h4-stu-n">' + esc(n) + tags.map((t) => '<span class="h4-tag" style="--c:' + TAGC[t][0] + ';--ct:' + TAGC[t][1] + '">' + t + '</span>').join('') + '</div>'
        + '<p class="h4-stu-r"><span class="h4-ai-mini" title="Resumen generado con Acciones IA">' + STAR + '</span>' + esc(RES[n] || '') + '</p>'
        + '<div class="h4-stu-m"><span class="h4-sg ' + sg.k + '"><i></i>' + esc(sg.t) + '</span></div>';
      const ac = el('div', 'h4-stu-a');
      if (!hecho) {
        ac.appendChild(bar([{id: 'at', label: 'Atender', variant: 'outline-primary', size: 'sm', callback: () => panelAtender(n)},
          {id: 'ok', title: 'Marcar como revisado', class: 'aceptar', variant: 'outline-primary', size: 'sm', callback: () => { S.revisado[n] = true; fillStu(); toast(n + ' marcado como revisado hoy', () => { delete S.revisado[n]; fillStu(); }); }}]));
      } else ac.appendChild(el('span', 'h4-done', 'Revisado hoy'));
      row.appendChild(av); row.appendChild(body); row.appendChild(ac);
      if (!hecho) { row.onclick = (e) => { if (!e.target.closest('button-bar')) panelAtender(n); }; row.classList.add('click'); }
      return row;
    };
    pend2.filter((n) => S.filtro === 'todos' || tagsOf(n).indexOf(S.filtro) > -1).forEach((n) => stuCard.appendChild(mk(n, false)));
    if (!pend2.filter((n) => S.filtro === 'todos' || tagsOf(n).indexOf(S.filtro) > -1).length) stuCard.appendChild(el('div', 'h4-vacio', pend2.length ? 'Ningún alumno con este motivo.' : 'Has revisado a todos por hoy.'));
    if (hechos.length) { stuCard.appendChild(el('div', 'h4-hechos-h', 'Revisados hoy · ' + hechos.length)); hechos.forEach((n) => stuCard.appendChild(mk(n, true))); }
  }

  /* ── Mis clases (maqueta: tareas y notas inventadas) ── */
  const cls = el('section', 'h4-sec h4-rv'); cls.dataset.r = 'c'; root.appendChild(cls);
  { const h = el('div', 'h4-card-h h4-flat'); h.innerHTML = '<div><h2 class="h4-card-t">Mis clases</h2><p class="h4-card-s">La evaluación se cierra el 20 nov · faltan 16 días</p></div>'; cls.appendChild(h);
    const g = el('div', 'h4-cls');
    [['Matemáticas', '2º ESO B', 26, 'En curso ahora · Aula 204', 2, 18], ['Matemáticas', '1º BACH A', 24, 'Examen hoy a las 10:20', 0, 21], ['Matemáticas', '3º ESO C', 20, 'Hoy a las 12:30', 5, 12], ['Física', '1º ESO A', 24, 'Hoy a las 9:30', 0, 22]].forEach((c, i) => {
      const card = el('article', 'h4-card h4-cl'); card.style.setProperty('--d', (i * 80) + 'ms');
      card.innerHTML = '<h3 class="h4-card-t">' + esc(c[0]) + ' · ' + esc(c[1]) + '</h3><p class="h4-cl-s">' + c[2] + ' alumnos · ' + esc(c[3]) + '</p>'
        + '<div class="h4-cl-r"><span>' + (c[4] ? '<b>' + c[4] + '</b> tareas por corregir' : 'Sin tareas por corregir') + '</span></div>'
        + '<div class="h4-cl-r"><span>Notas de la evaluación</span><span><b>' + c[5] + '</b>/' + c[2] + '</span></div>'
        + '<div class="h4-prog" role="img" aria-label="' + c[5] + ' de ' + c[2] + ' notas puestas"><i data-w="' + Math.round(c[5] / c[2] * 100) + '"></i></div>';
      const l = el('button', 'h4-link', 'Abrir cuaderno ' + CHEV); l.onclick = () => open(placeholder('cuaderno', 'Cuaderno del profesor')); card.appendChild(l);
      g.appendChild(card);
    });
    cls.appendChild(g); }

  /* ── Rol: mostrar u ocultar bloques ── */
  function filtraRol() {
    $$('[data-r]').forEach((s) => { const r = s.dataset.r.split(' '), ok = S.rol === 'todos' || (S.rol === 'clases' && r.indexOf('c') > -1) || (S.rol === 'tutoria' && r.indexOf('t') > -1); s.hidden = !ok; });
  }

  /* ── Animación: aparición escalonada, números que cuentan, barras que crecen ── */
  const countUp = (n) => { const to = n.dataset.v, dec = to.indexOf(',') > -1 ? to.split(',')[1].length : 0, v = parseFloat(to.replace(',', '.')), t0 = performance.now();
    const f = (now) => { const p = Math.min(1, (now - t0) / 1000), e = 1 - Math.pow(1 - p, 3); n.textContent = (v * e).toFixed(dec).replace('.', ','); if (p < 1) requestAnimationFrame(f); else n.textContent = to; };
    if (RM) { n.textContent = to; return; } n.textContent = (0).toFixed(dec).replace('.', ','); requestAnimationFrame(f); };
  const entra = (s) => {
    s.classList.add('in');
    $$('.h4-n', s).forEach(countUp);
    if (!RM) {
      $$('.h4-spark i', s).forEach((b, i) => { setTimeout(() => { b.style.height = b.dataset.h + 'px'; }, 200 + i * 90); });
      $$('.h4-split i, .h4-prog i', s).forEach((b, i) => { setTimeout(() => { b.style.width = b.dataset.w + '%'; }, 250 + i * 120); });
      if (s.classList.contains('h4-now')) setTimeout(() => s.style.setProperty('--p', '60%'), 350);
    } else { $$('.h4-prog i', s).forEach((b) => { b.style.width = b.dataset.w + '%'; }); s.style.setProperty('--p', '60%'); }
  };
  function observa() {
    const rv = $$('.h4-rv');
    if (RM || !('IntersectionObserver' in window)) { rv.forEach(entra); return; }
    const io = new IntersectionObserver((es) => { es.forEach((x) => { if (x.isIntersecting) { entra(x.target); io.unobserve(x.target); } }); }, {root: root.closest('.h4-scroll'), threshold: 0.08});
    rv.forEach((s, i) => { s.style.transitionDelay = Math.min(i, 3) * 90 + 'ms'; io.observe(s); });
  }

  /* ── Re-sincronizar cuando cambian los datos (justificar, entrevistas) ── */
  function refresca() { fillAsk(); fillStu(); fillStats(true); chipJust(); }
  window.__v4sync = refresca;
  panel.addEventListener('sidebar-closed', refresca);

  pintaSeg(); fillNow(); fillAsk(); fillStats(); fillStu(); filtraRol(); observa();
}
