/* ══════════════════════════════════════
   MECAFORGE 3D — app.js v4
   · Motor de costos reales (CEO Economía)
   · Horas + minutos separados
   · Pintado = pedido especial (sin precio)
   · Margen protegido, datos a Google Sheets
══════════════════════════════════════ */

// ── CONFIG EMPRESA ───────────────────
const CFG = {
  WA:       "51949995401",
  EMPRESA:  "MecaForge 3D",
  TECNICO:  "Mardik Moreno Huerta",
  CIUDAD:   "Pachacútec, Ventanilla – Lima",
  SHEETS_WEBHOOK: "https://script.google.com/macros/s/AKfycbyJr8ZqSi7ZoiWj6SMZrKn3EWzuIUGRB_uhwW8lPPkUgUvXdZW0of9OioY8vPLnocbxvA/exec",
};

// ── COSTOS DE PRODUCCIÓN (Modelo Finanzas — Dirección Económica) ──
// Estructura de costos reales validada por Dirección de Análisis Económico.
const COSTO = {
  filamento_g:  50 / 1000,   // S/ 0.05 por gramo (PLA S/ 50/kg)
  maquina_h:    0.64,        // S/ 0.64/h (Depreciación P1S S/ 0.54 + Energía S/ 0.10)
  gasto_op_umbral: 7,        // Peso mínimo para gasto operativo (g)
  gasto_op:     1.00,        // S/ 1.00 si Peso >= 7g
};

// ── REGLAS COMERCIALES — MODELO PROPORCIONAL 2.5× ───────────────
// Directiva Finanzas: Factor de Multiplicación sobre costo de producción.
// Excepción micro: piezas < 7g → precio fijo S/ 1.50 (estrategia de entrada).
// Resultado redondeado al sol o medio sol más cercano (facilitar cobro efectivo).
const PRECIO = {
  precio_micro:  1.50,  // Precio fijo para piezas < 7g
  factor:        2.5,   // Multiplicador sobre costo de producción total
};

// ── DESCUENTOS POR VOLUMEN ───────────
// Directiva Finanzas: incentivar tandas completas y eventos.
const DESCUENTOS = [
  { min: 20, pct: 0.15, label: 'Docena y media+ (20+ unid.) −15%' },
  { min: 12, pct: 0.10, label: 'Docena (12 unid.) −10%' },
  { min:  6, pct: 0.05, label: 'Media docena (6 unid.) −5%' },
];

// ── ESTADO ───────────────────────────
let S = {
  proNum: "",
  link: "", gramos: 0, horas: 0,
  color: "Blanco", pintado: false, qty: 1, envio: 0,
  detalles: "", nombre: "", distrito: "",
  presupuesto: null,
};

// ── GENERAR NÚMERO DE PROFORMA ───────
function genProNum() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return "PRO-" + n;
}

// ── IMÁGENES DE FONDO ─────────────────
const BG_IMAGES = {
  hero:   "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1600&q=75",
  svc:    "https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?w=1600&q=75",
  figuras:"https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=1400&q=75",
  esp:    "https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=1400&q=75",
  mecat:  "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&q=75",
};

function setBg(id, url) {
  const el = document.getElementById(id);
  if (el) el.style.backgroundImage = "url('" + url + "')";
}

// ── TABS / NAV ────────────────────────
function goTab(tab) {
  document.querySelectorAll('.tab').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.remove('active');
    if (l.dataset.tab === tab) l.classList.add('active');
  });
  const el = document.getElementById(tab);
  if (el) el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('navLinks')?.classList.remove('open');
}

document.querySelectorAll('.nav-link').forEach(l =>
  l.addEventListener('click', e => { e.preventDefault(); goTab(l.dataset.tab); })
);
document.querySelector('.nav-logo')?.addEventListener('click', () => goTab('inicio'));
document.getElementById('hamburger')?.addEventListener('click', () =>
  document.getElementById('navLinks')?.classList.toggle('open')
);
function scrollId(id) {
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

// ── CONTADOR ANIMADO ──────────────────
function animStats() {
  document.querySelectorAll('.snum').forEach(el => {
    const t = parseInt(el.dataset.t);
    let c = 0; const step = t / 40;
    const tm = setInterval(() => {
      c = Math.min(c + step, t);
      el.textContent = Math.round(c);
      if (c >= t) clearInterval(tm);
    }, 28);
  });
}
const ob = new IntersectionObserver(es => {
  es.forEach(e => { if (e.isIntersecting) { animStats(); ob.disconnect(); } });
}, { threshold: .4 });
const sb = document.querySelector('.stats-bar');
if (sb) ob.observe(sb);

// ── CONFIRMAR LINK ────────────────────
function confirmarLink() {
  const inp = document.getElementById('makerLink');
  const v = inp.value.trim();
  if (!v) { inp.style.borderColor = '#ef4444'; setTimeout(() => inp.style.borderColor = '', 1400); return; }
  S.link = v;
  S.proNum = genProNum();
  const ok = document.getElementById('linkOk');
  ok.style.display = 'block';
  ok.innerHTML = '✓ Modelo confirmado &nbsp;·&nbsp; Proforma <strong>' + S.proNum + '</strong> asignada<br><span style="opacity:.6;font-size:11px">' + v + '</span>';
  unlock('s3'); unlock('s4');
  scrollStep('s3');
}

// ── LEER HORAS DESDE CAMPOS H+MIN ─────
function getHorasTotal() {
  const h   = parseFloat(document.getElementById('horasNum')?.value)  || 0;
  const min = parseFloat(document.getElementById('minutosNum')?.value) || 0;
  return parseFloat((h + min / 60).toFixed(4));
}

// ── POST-PROCESO AUTOMÁTICO ───────────
function getPostProcesoHoras(hImpresion) {
  if (hImpresion < 1)  return 5  / 60;
  if (hImpresion <= 3) return 10 / 60;
  return 30 / 60;
}

// ── TIPO DE PRODUCTO ──────────────────
function getTipoProducto(gramos) {
  if (gramos <= 20)  return 'mini';
  if (gramos <= 80)  return 'medio';
  return 'grande';
}

// ── CÁLCULO CENTRAL ───────────────────
function calcular() {
  const g     = parseFloat(document.getElementById('gramos')?.value) || 0;
  const h     = getHorasTotal();
  const envio = parseFloat(document.getElementById('envioVal')?.value) || 0;
  S.gramos = g; S.horas = h; S.envio = envio;

  if (g <= 0 || h <= 0) {
    ['s5','s6','s7','waZone'].forEach(id => lock(id));
    document.getElementById('budgetOut').innerHTML = '';
    document.getElementById('pdfBtn').style.display = 'none';
    document.getElementById('presWarn').style.display = 'none';
    return;
  }

  // ── NUEVA FÓRMULA PROPORCIONAL (Dirección Finanzas) ──
  const cFil   = g * COSTO.filamento_g;                // S/ 0.05 × gramos
  const cMaq   = h * COSTO.maquina_h;                  // S/ 0.64 × horas
  const gastoOp = g < COSTO.gasto_op_umbral ? 0 : COSTO.gasto_op; // S/ 0 si <7g, S/ 1.00 si >=7g
  const costoProd = parseFloat((cFil + cMaq + gastoOp).toFixed(4));

  // Regla Micro: precio fijo para piezas <7g. Regla Proporcional: costo × 2.5
  let precioSinRedondear;
  let esMicro = false;
  if (g < COSTO.gasto_op_umbral) {
    precioSinRedondear = PRECIO.precio_micro;
    esMicro = true;
  } else {
    precioSinRedondear = costoProd * PRECIO.factor;
  }

  // Redondear al sol o medio sol más cercano (0.5) para facilitar cobro en efectivo
  let precioUnit = Math.round(precioSinRedondear * 2) / 2;

  // ── DESCUENTO POR VOLUMEN ──
  const descReg = DESCUENTOS.find(d => S.qty >= d.min);
  const descPct  = descReg ? descReg.pct : 0;
  const descLabel = descReg ? descReg.label : '';

  const subtotalSinDesc = parseFloat((precioUnit * S.qty).toFixed(2));
  const descMonto       = parseFloat((subtotalSinDesc * descPct).toFixed(2));
  const subtotal        = parseFloat((subtotalSinDesc - descMonto).toFixed(2));
  const total           = parseFloat((subtotal + envio).toFixed(2));
  const adelanto        = parseFloat((total * 0.5).toFixed(2));
  const gananciaU       = parseFloat((precioUnit - costoProd).toFixed(2));
  const ganHora         = h > 0 ? parseFloat((gananciaU / h).toFixed(2)) : 0;
  const margenPct       = costoProd > 0 ? parseFloat(((gananciaU / costoProd) * 100).toFixed(1)) : 0;
  const tipo            = esMicro ? 'micro' : (g < 80 ? 'medio' : 'grande');
  const hPP             = getPostProcesoHoras(h);

  S.presupuesto = {
    cFil, cMaq, cMO: 0, gastoOp, costoProd,
    precioUnit, subtotalSinDesc, descPct, descMonto, descLabel,
    subtotal, envio, total, adelanto,
    ganancia: gananciaU,
    gananciaTotal: parseFloat((gananciaU * S.qty).toFixed(2)),
    gananciaHora: ganHora,
    margenReal: margenPct,
    tipo, esMicro,
    hPostProceso: parseFloat((hPP * 60).toFixed(1)),
  };

  renderBudget(S.presupuesto);
  ['s5','s6','s7','waZone'].forEach(id => unlock(id));
  document.getElementById('presWarn').style.display = 'flex';
  valForm();
}

// ── RENDER PRESUPUESTO (cliente) ──────
function renderBudget(p) {
  let html = '<div class="bdhead"><span>PRESUPUESTO — ' + CFG.EMPRESA + '</span><span class="pronum"># ' + S.proNum + '</span></div>';
  html += '<div class="bdrow"><span class="bdk">Color</span><span class="bdv">' + S.color + '</span></div>';
  html += '<div class="bdrow"><span class="bdk">Acabado</span><span class="bdv">Monocromático</span></div>';
  html += '<div class="bdrow"><span class="bdk">Cantidad</span><span class="bdv">' + S.qty + ' unidad(es)</span></div>';
  if (S.qty > 1) {
    html += '<div class="bdrow"><span class="bdk">Precio unitario</span><span class="bdv">S/ ' + p.precioUnit.toFixed(2) + '</span></div>';
    html += '<div class="bdrow"><span class="bdk">Subtotal</span><span class="bdv">S/ ' + p.subtotalSinDesc.toFixed(2) + '</span></div>';
  }
  if (p.descPct > 0) {
    html += '<div class="bdrow bddesc"><span class="bdk">🎉 Descuento (' + (p.descPct * 100).toFixed(0) + '%) — ' + p.descLabel + '</span><span class="bdv" style="color:var(--gr)">−S/ ' + p.descMonto.toFixed(2) + '</span></div>';
    html += '<div class="bdrow"><span class="bdk">Subtotal c/ descuento</span><span class="bdv">S/ ' + p.subtotal.toFixed(2) + '</span></div>';
  }
  if (p.envio > 0) html += '<div class="bdrow"><span class="bdk">Envío estimado</span><span class="bdv">S/ ' + p.envio.toFixed(2) + '</span></div>';
  html += '<div class="bdtotal"><span class="bdtk">PRECIO ESTIMADO</span><span class="bdtv">S/ ' + p.total.toFixed(2) + '</span></div>';
  html += '<div class="bdadel"><span>Adelanto requerido (50%)</span><span>S/ ' + p.adelanto.toFixed(2) + '</span></div>';

  if (p.descPct === 0 && S.qty < 6) {
    html += '<div class="bd-discount-hint">💡 Compra <strong>6 o más</strong> piezas y obtén hasta <strong>15% de descuento</strong></div>';
  }

  if (S.pintado) {
    html += '<div class="bdpintado"><span class="bdp-ico">🎨</span><div><strong>Pintado artístico — coordinación por WhatsApp</strong><p>El precio de arriba es solo por la figura monocromática. El pintado se cotiza según tu diseño y se coordina por WhatsApp antes de iniciar.</p></div></div>';
  }

  document.getElementById('budgetOut').innerHTML = html;
  document.getElementById('pdfBtn').style.display = 'inline-block';
}

// ── CONTROLES ─────────────────────────
function selColor(btn) {
  document.querySelectorAll('.cbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.color = btn.dataset.color;
  calcular();
}
function selFinish(btn) {
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.pintado = btn.dataset.f === '1';
  calcular();
}
function chgQty(d) {
  const inp = document.getElementById('qtyInput');
  S.qty = Math.max(1, S.qty + d);
  if (inp) inp.value = S.qty;
  document.getElementById('qtyShow').textContent = S.qty;
  calcular();
}
function setQtyFromInput(val) {
  const n = parseInt(val) || 1;
  S.qty = Math.max(1, n);
  document.getElementById('qtyShow').textContent = S.qty;
  calcular();
}

// ── PASOS ─────────────────────────────
function unlock(id) { const e=document.getElementById(id); if(e){e.classList.remove('locked');} }
function lock(id)   { const e=document.getElementById(id); if(e){e.classList.add('locked');} }
function scrollStep(id) { setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}),180); }
function valForm() {
  const n = document.getElementById('cliName')?.value.trim();
  const btn = document.getElementById('waBtn');
  if (btn) btn.disabled = !(n && S.presupuesto);
}

// ── PDF PARA EL CLIENTE ───────────────
function generarPDF() {
  if (!S.presupuesto) return;
  const p       = S.presupuesto;
  const fecha   = new Date().toLocaleDateString('es-PE', {day:'2-digit',month:'2-digit',year:'numeric'});
  const nombre  = document.getElementById('cliName')?.value  || 'Cliente';
  const dist    = document.getElementById('cliDist')?.value  || '';
  const det     = document.getElementById('detallesExtra')?.value || '';
  const pintMsg = S.pintado ? '<div class="warn">🎨 <strong>Pintado artístico solicitado:</strong> El precio mostrado es para la figura monocromática. El costo del pintado se coordinará por WhatsApp.</div>' : '';

  const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Proforma ' + S.proNum + ' — ' + CFG.EMPRESA + '</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:\'Segoe UI\',Arial,sans-serif;color:#111;background:#fff;padding:36px;font-size:13px}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #FF6B00;padding-bottom:18px;margin-bottom:22px}.logo-wrap .logo{font-size:26px;font-weight:900;letter-spacing:.05em;color:#0a0a0a}.logo-wrap .logo span{color:#FF6B00}.logo-wrap .sede{font-size:10px;color:#999;letter-spacing:.12em;text-transform:uppercase;margin-top:2px}.logo-wrap .tec{font-size:11px;color:#666;margin-top:3px}.badge{display:inline-block;background:#FF6B00;color:#fff;font-size:10px;padding:3px 10px;margin-top:8px;letter-spacing:.08em;font-weight:600}.ri{text-align:right;font-size:12px;color:#666}.ri .pronum{font-size:20px;font-weight:900;color:#FF6B00;letter-spacing:.06em;display:block;margin-bottom:4px}.ri strong{display:block;font-size:13px;color:#111;margin-bottom:2px}table{width:100%;border-collapse:collapse;margin-bottom:18px}td{padding:7px 10px;font-size:13px;border-bottom:1px solid #f0f0f0}.k{color:#555;width:56%}.v{text-align:right;font-family:\'Courier New\',monospace;font-weight:600;color:#111}.sec-t{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#FF6B00;padding:14px 0 6px;font-weight:700}.tot-row{background:#0a0a0a}.tot-row td{color:#fff;padding:13px 10px;border-bottom:none;font-size:15px;font-weight:700}.tot-row .v{color:#FF6B00;font-size:20px}.adv-row{background:#FFF3E0}.adv-row td{color:#c45000;font-weight:600;border-bottom:none}.disc-row{background:#f0fff4}.disc-row td{color:#16a34a;font-weight:600}.note{background:#f8f8f8;border-left:3px solid #FF6B00;padding:10px 14px;font-size:12px;color:#444;line-height:1.6;margin-bottom:14px}.warn{background:#fff3e0;border:1px solid #FF6B00;padding:10px 14px;font-size:12px;color:#c45000;line-height:1.55;margin-bottom:14px;border-radius:2px}.verify-box{background:#f0f9ff;border:1px solid #bae6fd;padding:10px 14px;font-size:11px;color:#0369a1;line-height:1.55;border-radius:2px;margin-bottom:14px}.ft{margin-top:24px;border-top:1px solid #e5e5e5;padding-top:14px;text-align:center;font-size:11px;color:#aaa;line-height:1.8}</style></head><body><div class="top"><div class="logo-wrap"><div class="logo">⬡ MECAFORGE<span>3D</span></div><div class="sede">PACHACÚTEC · VENTANILLA · LIMA</div><div class="tec">Técnico responsable: ' + CFG.TECNICO + '</div><div class="badge">PROFORMA OFICIAL</div></div><div class="ri"><span class="pronum">' + S.proNum + '</span><strong>Proforma de Pedido</strong> Fecha: ' + fecha + '<br>Cliente: <strong>' + nombre + '</strong><br>' + (dist ? 'Distrito: ' + dist : '') + '</div></div><div class="verify-box">🔍 <strong>Número de proforma: ' + S.proNum + '</strong> — Usa este código para consultar tu pedido por WhatsApp.</div><div class="sec-t">Detalle del pedido</div><table><tr><td class="k">Modelo (Maker World)</td><td class="v" style="font-size:10px;word-break:break-all;text-align:right">' + (S.link||'—') + '</td></tr><tr><td class="k">Color PLA</td><td class="v">' + S.color + '</td></tr><tr><td class="k">Acabado</td><td class="v">Monocromático</td></tr><tr><td class="k">Cantidad</td><td class="v">' + S.qty + ' unidad(es)</td></tr></table><table>' + (S.qty>1 ? '<tr><td class="k">Precio unitario</td><td class="v">S/ ' + p.precioUnit.toFixed(2) + '</td></tr>' : '') + (S.qty>1 ? '<tr><td class="k">Subtotal (×' + S.qty + ')</td><td class="v">S/ ' + p.subtotalSinDesc.toFixed(2) + '</td></tr>' : '') + (p.descPct>0 ? '<tr class="disc-row"><td>Descuento por volumen (' + (p.descPct*100).toFixed(0) + '%) — ' + p.descLabel + '</td><td class="v">−S/ ' + p.descMonto.toFixed(2) + '</td></tr>' : '') + (p.descPct>0 ? '<tr><td class="k">Subtotal con descuento</td><td class="v">S/ ' + p.subtotal.toFixed(2) + '</td></tr>' : '') + (p.envio>0 ? '<tr><td class="k">Envío estimado</td><td class="v">S/ ' + p.envio.toFixed(2) + '</td></tr>' : '') + '<tr class="tot-row"><td><strong>PRECIO ESTIMADO</strong></td><td class="v">S/ ' + p.total.toFixed(2) + '</td></tr><tr class="adv-row"><td>Adelanto requerido (50%) para iniciar impresión</td><td class="v">S/ ' + p.adelanto.toFixed(2) + '</td></tr></table>' + pintMsg + (det ? '<div class="note"><strong>📝 Notas adicionales del cliente:</strong><br>' + det + '</div>' : '') + '<div class="warn">⚠ Este presupuesto es una estimación. Si hay detalles adicionales (tamaño, pintado, modificaciones), el precio puede variar. Se coordina por WhatsApp.</div><div class="ft">Válido por 7 días · Pago: Yape · Plin · Transferencia<br><strong>' + CFG.EMPRESA + '</strong> · ' + CFG.CIUDAD + '<br>WhatsApp: <strong>+' + CFG.WA + '</strong> · Técnico: ' + CFG.TECNICO + '</div></body></html>';

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ── GUARDAR EN GOOGLE SHEETS ──────────
async function guardarEnSheets(datos) {
  try {
    const url = CFG.SHEETS_WEBHOOK + "?data=" + encodeURIComponent(JSON.stringify(datos));
    await fetch(url, { method: "GET" });
  } catch (e) {
    console.log("Sheets webhook:", e.message);
  }
}

// ── WHATSAPP — FIGURAS ────────────────
function enviarWA() {
  const nombre  = document.getElementById('cliName')?.value.trim();
  const dist    = document.getElementById('cliDist')?.value.trim();
  const det     = document.getElementById('detallesExtra')?.value.trim();
  const p = S.presupuesto;
  if (!nombre || !p) return;

  const fecha   = new Date().toLocaleDateString('es-PE');
  const hh = Math.floor(S.horas);
  const mm  = Math.round((S.horas - hh) * 60);
  const horasTxt = hh === 0 ? mm + ' min' : (mm === 0 ? hh + 'h' : hh + 'h ' + mm + 'min');

  guardarEnSheets({
    proforma:           S.proNum,
    fecha,
    cliente:            nombre,
    distrito:           dist || "",
    link:               S.link,
    color:              S.color,
    acabado:            S.pintado ? 'Monocromático + pintado especial' : 'Monocromático',
    horas:              S.horas,
    gramos:             S.gramos,
    cantidad:           S.qty,
    tipo_producto:      p.tipo,
    es_micro:           p.esMicro ? "SI" : "NO",
    costo_filamento:    p.cFil.toFixed(4),
    costo_maquina:      p.cMaq.toFixed(4),
    gasto_operativo:    p.gastoOp.toFixed(4),
    costo_produccion:   p.costoProd.toFixed(4),
    factor_precio:      PRECIO.factor,
    precio_unitario:    p.precioUnit.toFixed(2),
    descuento_pct:      (p.descPct * 100).toFixed(0) + "%",
    descuento_monto:    p.descMonto.toFixed(2),
    subtotal:           p.subtotal.toFixed(2),
    envio:              p.envio.toFixed(2),
    total:              p.total.toFixed(2),
    adelanto:           p.adelanto.toFixed(2),
    ganancia_unit:      p.ganancia.toFixed(2),
    ganancia_total:     p.gananciaTotal.toFixed(2),
    ganancia_por_hora:  p.gananciaHora.toFixed(2),
    margen_pct:         p.margenReal,
    horas_post_proceso_min: p.hPostProceso,
    detalles:           det || "",
    pintado_especial:   S.pintado ? "SI" : "NO",
  });

  let m = '¡Hola! 👋 Soy *' + nombre + '*';
  if (dist) m += ' (' + dist + ')';
  m += '. Me interesa hacer un pedido de impresión 3D.\n\n';
  m += '🖨️ *PEDIDO — ' + CFG.EMPRESA + '*\n';
  m += '📌 *Proforma N°: ' + S.proNum + '*\n';
  m += '📅 Fecha: ' + fecha + '\n';
  m += '─────────────────────\n';
  m += '🔗 Modelo: ' + S.link + '\n';
  m += '🎨 Color: *' + S.color + '* | Acabado: *Monocromático*\n';
  m += '⚖️ Filamento: ' + S.gramos + 'g | Tiempo: ' + horasTxt + '\n';
  m += '🔢 Cantidad: ' + S.qty + '\n';
  m += '─────────────────────\n';
  if (S.qty > 1) m += '💰 Precio unitario: S/ ' + p.precioUnit.toFixed(2) + '\n';
  if (p.descPct > 0) m += '🎉 Descuento (' + (p.descPct*100).toFixed(0) + '%): −S/ ' + p.descMonto.toFixed(2) + '\n';
  if (p.envio > 0) m += '🚚 Envío: S/ ' + p.envio.toFixed(2) + '\n';
  m += '💵 *PRECIO ESTIMADO (monocromático): S/ ' + p.total.toFixed(2) + '*\n';
  m += '📌 *Adelanto (50%): S/ ' + p.adelanto.toFixed(2) + '*\n';
  if (S.pintado) { m += '─────────────────────\n'; m += '🎨 *También quiero pintado artístico* — coordinar precio por WhatsApp\n'; }
  if (det) { m += '─────────────────────\n'; m += '📝 *Notas:* ' + det + '\n'; }
  m += '─────────────────────\n';
  m += 'Quedo a la espera de su confirmación para coordinar el adelanto y comenzar la impresión. ¡Gracias! 🙏';

  window.open('https://wa.me/' + CFG.WA + '?text=' + encodeURIComponent(m), '_blank');
}

// ── WHATSAPP — ESPECIALES ─────────────
function enviarEspecial() {
  const nom  = document.getElementById('espNom')?.value.trim();
  const tipo = document.getElementById('espTipo')?.value;
  const desc = document.getElementById('espDesc')?.value.trim();
  const dist = document.getElementById('espDist')?.value.trim();
  if (!nom || !desc) { alert('Por favor completa tu nombre y la descripción del proyecto.'); return; }
  let m = '¡Hola! 👋 Soy *' + nom + '*';
  if (dist) m += ' de ' + dist;
  m += '. Tengo una consulta de *Pedido Especial*.\n\n';
  m += '📌 *Tipo:* ' + tipo + '\n';
  m += '📝 *Descripción:*\n' + desc + '\n\n';
  m += 'Quedo a la espera de su cotización. ¡Gracias!';
  window.open('https://wa.me/' + CFG.WA + '?text=' + encodeURIComponent(m), '_blank');
}

// ── NAV SCROLL ────────────────────────
window.addEventListener('scroll', () => {
  const n = document.getElementById('nav');
  if (n) n.style.background = window.scrollY > 50 ? 'rgba(7,7,8,1)' : 'rgba(7,7,8,.95)';
});

// ── INIT ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  goTab('inicio');
  setBg('heroBg',  BG_IMAGES.hero);
  setBg('svcBg',   BG_IMAGES.svc);
  setBg('phBg1',   BG_IMAGES.figuras);
  setBg('phBg2',   BG_IMAGES.esp);
  setBg('mecatBg', BG_IMAGES.mecat);
});
