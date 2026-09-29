// SVG charts, drawn at the real pixel width of their box so text stays readable on phones.
import { AXIAL_IN, axialAt, RIA_POWER, RIA_EVENTS, LOCA_EVENTS } from '../data/transients.js';
import { THORIUM_SCAN, FM_SCAN, BE_SCAN, KEFF_STATES } from '../data/scans.js';

const INK = '#142233', INK2 = '#34485f', MUTED = '#5b6c80', GRID = '#e3e9ef', AXIS = '#9aabbd';
const BLUE = '#0f5fa8', NEUTRAL = '#c9d5e1', LIMIT = '#d6452f';
const fmt = (v, d = 0) => v.toFixed(d);  // dot decimals, as everywhere else on the page

// ---- shared tooltip: any element with data-tip shows it on hover or keyboard focus ----
let tipEl = null;
export function initChartTips() {
  tipEl = document.createElement('div');
  tipEl.className = 'chart-tip';
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  const show = (el, x, y) => {
    tipEl.innerHTML = el.getAttribute('data-tip');
    tipEl.hidden = false;
    place(x, y);
  };
  const place = (x, y) => {
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let left = x + 14, top = y - h - 12;
    if (left + w > innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 18;
    tipEl.style.transform = `translate(${left}px, ${top}px)`;
  };
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) show(el, e.clientX, e.clientY);
  });
  document.addEventListener('pointermove', (e) => {
    if (tipEl.hidden) return;
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) { if (el.getAttribute('data-tip') !== tipEl.dataset.src) { tipEl.innerHTML = el.getAttribute('data-tip'); tipEl.dataset.src = el.getAttribute('data-tip'); } place(e.clientX, e.clientY); }
    else tipEl.hidden = true;
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) tipEl.hidden = true;
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); }
  });
  document.addEventListener('focusout', () => { tipEl.hidden = true; });
  addEventListener('scroll', () => { if (tipEl) tipEl.hidden = true; }, { passive: true });
}

// Redraw an SVG whenever its box width changes. draw(width) returns [height, markup].
function responsive(svg, draw) {
  let lastW = 0;
  const render = () => {
    const box = svg.parentElement, cs = getComputedStyle(box);
    const w = Math.floor(box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    if (!w || w === lastW) return;
    lastW = w;
    const [h, markup] = draw(w);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.innerHTML = markup;
  };
  new ResizeObserver(render).observe(svg.parentElement);
  render();
}

const text = (x, y, s, cls = 't', anchor = 'start', extra = '') =>
  `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}"${extra}>${s}</text>`;

// ---------- axial power profile (vertical, like the reactor) ----------
export function axialChart(svg) {
  responsive(svg, (w) => {
    const h = Math.min(420, Math.max(320, w * 0.9));
    const L = 52, R = 18, T = 18, B = 46;
    const pMax = 1.6;
    const x = (p) => L + (p / pMax) * (w - L - R);
    const y = (cm) => h - B - (cm / 200) * (h - T - B);
    const top = AXIAL_IN[AXIAL_IN.length - 1][0];
    const pts = AXIAL_IN.map(([yin, p]) => [(yin / top) * 200, p]);
    const line = pts.map(([cm, p]) => `${x(p).toFixed(1)},${y(cm).toFixed(1)}`).join(' ');
    const area = `${x(0)},${y(0)} ${line} ${x(0)},${y(200)}`;
    let s = '';
    for (const p of [0, 0.5, 1, 1.5]) {
      s += `<line x1="${x(p)}" x2="${x(p)}" y1="${T}" y2="${h - B}" class="grid"/>`;
      s += text(x(p), h - B + 18, fmt(p, p % 1 ? 1 : 0), 't', 'middle');
    }
    for (const cm of [0, 50, 100, 150, 200]) {
      s += text(L - 8, y(cm) + 4, cm, 't', 'end');
    }
    s += `<line x1="${L}" x2="${L}" y1="${T}" y2="${h - B}" class="axis"/>`;
    s += `<polygon points="${area}" class="area"/>`;
    s += `<line x1="${x(1)}" x2="${x(1)}" y1="${T}" y2="${h - B}" class="ref"/>`;
    s += text(x(1) + 5, T + 10, 'kor ortalaması', 't ref-t');
    s += `<polyline points="${line}" class="line"/>`;
    const peak = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
    s += `<circle cx="${x(peak[1])}" cy="${y(peak[0])}" r="4.5" class="dot"/>`;
    s += text(x(peak[1]) - 10, y(peak[0]) + 4, `tepe ${fmt(peak[1], 2)}`, 't strong halo', 'end');
    s += text((L + w - R) / 2, h - 8, 'Göreli güç (kor ortalaması = 1)', 'ax', 'middle');
    s += `<text transform="translate(14 ${(T + h - B) / 2}) rotate(-90)" class="ax" text-anchor="middle">Yakıt yüksekliği (cm)</text>`;
    // crosshair
    s += `<g class="xhair" visibility="hidden"><line class="xh-line" x1="${L}" x2="${w - R}"/><circle class="xh-dot" r="4"/></g>`;
    s += `<rect x="${L}" y="${T}" width="${w - L - R}" height="${h - T - B}" fill="transparent" class="hit"/>`;
    queueMicrotask(() => {
      const hit = svg.querySelector('.hit'), g = svg.querySelector('.xhair');
      if (!hit) return;
      const move = (e) => {
        const r = svg.getBoundingClientRect();
        const cm = Math.min(200, Math.max(0, ((h - B - (e.clientY - r.top)) / (h - T - B)) * 200));
        const p = axialAt(cm / 200);
        g.setAttribute('visibility', 'visible');
        g.querySelector('.xh-line').setAttribute('y1', y(cm)); g.querySelector('.xh-line').setAttribute('y2', y(cm));
        g.querySelector('.xh-dot').setAttribute('cx', x(p)); g.querySelector('.xh-dot').setAttribute('cy', y(cm));
        hit.setAttribute('data-tip', `<b>${fmt(cm)} cm</b> yükseklikte göreli güç <b>${fmt(p, 2)}</b>`);
      };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerenter', move);
      hit.addEventListener('pointerleave', () => g.setAttribute('visibility', 'hidden'));
    });
    return [h, s];
  });
}

// ---------- thorium scan: two small charts sharing the x axis ----------
export function thoriumCharts(svgRho, svgDays) {
  const xs = THORIUM_SCAN.map((d) => d.th);
  const frame = (w, h, L, R, T, B) => ({ x: (v) => L + (v / 25) * (w - L - R), inner: h - B, L, R, T, B });

  responsive(svgRho, (w) => {
    const h = 230, L = 46, R = 14, T = 20, B = 40;
    const f = frame(w, h, L, R, T, B);
    const y = (v) => T + ((0.22 - v) / (0.22 - 0.08)) * (h - T - B);
    let s = '';
    for (const v of [0.08, 0.12, 0.16, 0.2]) {
      s += `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` + text(L - 7, y(v) + 4, fmt(v, 2), 't', 'end');
    }
    xs.forEach((v) => { s += text(f.x(v), h - B + 18, v, 't', 'middle'); });
    s += text((L + w - R) / 2, h - 5, 'Ağır metalde toryum (%)', 'ax', 'middle');
    s += `<polyline points="${THORIUM_SCAN.map((d) => `${f.x(d.th)},${y(d.rho)}`).join(' ')}" class="line"/>`;
    THORIUM_SCAN.forEach((d) => {
      const sel = d.th === 15;
      s += `<circle cx="${f.x(d.th)}" cy="${y(d.rho)}" r="${sel ? 6.5 : 4.5}" class="${sel ? 'dot sel' : 'dot hollow'}" tabindex="0" data-tip="%${d.th} toryum: başlangıç fazla reaktivitesi <b>≈${fmt(d.rho, 3)}</b>"/>`;
    });
    const t15 = THORIUM_SCAN.find((d) => d.th === 15);
    s += text(f.x(15) + 10, y(t15.rho) - 10, 'TURKER, %15', 't strong halo');
    return [h, s];
  });

  responsive(svgDays, (w) => {
    const h = 230, L = 14, R = 14, T = 22, B = 40;
    const f = frame(w, h, L, R, T, B);
    const y = (v) => T + (1 - v / 1000) * (h - T - B);
    const bw = Math.min(44, (w - L - R) / 9);
    const xb = (v) => L + bw / 2 + 4 + (v / 25) * (w - L - R - bw - 8);
    let s = '';
    for (const v of [0, 250, 500, 750, 1000]) {
      s += `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}" class="${v ? 'grid' : 'axis'}"/>`;
    }
    THORIUM_SCAN.forEach((d) => {
      const sel = d.th === 15, x0 = xb(d.th) - bw / 2, top = y(d.days);
      s += `<path d="M${x0},${y(0)} V${top + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${y(0)} Z" class="${sel ? 'bar sel' : 'bar'}" tabindex="0" data-tip="%${d.th} toryum: sıfır reaktiviteye <b>≈${d.days} gün</b>"/>`;
      s += text(xb(d.th), top - 6, `≈${d.days}`, sel ? 't strong' : 't', 'middle');
      s += text(xb(d.th), h - B + 18, d.th, 't', 'middle');
    });
    s += text((L + w - R) / 2, h - 5, 'Ağır metalde toryum (%)', 'ax', 'middle');
    return [h, s];
  });
}

// ---------- fuel-to-moderator ratio scan ----------
export function fmChart(svg) {
  responsive(svg, (w) => {
    const h = 290, L = 50, R = 18, T = 26, B = 44;
    const x = (v) => L + ((v - 0.3) / 0.5) * (w - L - R);
    const y = (v) => T + ((1100 - v) / (1100 - 650)) * (h - T - B);
    let s = '';
    for (const v of [700, 800, 900, 1000, 1100]) {
      s += `<line x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` + text(L - 7, y(v) + 4, fmt(v), 't', 'end');
    }
    for (const v of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) s += text(x(v), h - B + 18, fmt(v, 1), 't', 'middle');
    s += text((L + w - R) / 2, h - 5, 'Yakıt / yavaşlatıcı hacim oranı', 'ax', 'middle');
    s += `<polyline points="${FM_SCAN.map((d) => `${x(d.fm)},${y(d.days)}`).join(' ')}" class="line"/>`;
    FM_SCAN.forEach((d) => {
      const sel = d.fm === 0.4, ref = d.ref;
      s += `<circle cx="${x(d.fm)}" cy="${y(d.days)}" r="${sel ? 6.5 : 4.5}" class="${sel ? 'dot sel' : ref ? 'dot refdot' : 'dot hollow'}" tabindex="0"
        data-tip="F/M ${fmt(d.fm, d.fm === 0.589 ? 3 : 1)}: <b>${fmt(d.days, 1)} gün</b><br>çubuk aralığı ${fmt(d.pitch, 3)} cm · kor çapı ${fmt(d.core, 1)} cm"/>`;
    });
    const sel = FM_SCAN.find((d) => d.fm === 0.4), ref = FM_SCAN.find((d) => d.ref);
    s += text(x(sel.fm), y(sel.days) - 14, `TURKER · ${fmt(sel.days, 1)} gün`, 't strong', 'middle');
    s += text(x(ref.fm) + 10, y(ref.days) - 8, `NuScale referansı · ${fmt(ref.days, 1)}`, 't');
    return [h, s];
  });
}

// ---------- beryllium reflector scan (heatmap with printed values) ----------
export function beHeatmap(svg) {
  const cols = [0, 1, 5, 10, 20, 30], rows = [30, 20, 10, 5, 1, 0];
  const val = new Map(BE_SCAN.map((d) => [`${d.radial}|${d.axial}`, d.pcm]));
  const ramp = (v) => {
    // one hue, light to dark: 0 → #eef4fb, 520 → #0f5fa8
    const t = Math.max(0, Math.min(1, v / 520));
    const a = [238, 244, 251], b = [15, 95, 168];
    return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(',')})`;
  };
  responsive(svg, (w) => {
    const L = 58, R = 6, T = 8, B = 46;
    const cw = (w - L - R) / cols.length;
    const ch = Math.min(46, Math.max(34, cw * 0.62));
    const h = T + ch * rows.length + B;
    let s = '';
    rows.forEach((a, ri) => {
      s += text(L - 8, T + ri * ch + ch / 2 + 4, a, 't', 'end');
      cols.forEach((r, ci) => {
        const v = val.get(`${r}|${a}`);
        const x0 = L + ci * cw, y0 = T + ri * ch;
        if (v === undefined) {
          s += `<rect x="${x0 + 1}" y="${y0 + 1}" width="${cw - 2}" height="${ch - 2}" rx="4" class="cell-empty"/>`;
          return;
        }
        const sel = r === 20 && a === 0;
        s += `<rect x="${x0 + 1}" y="${y0 + 1}" width="${cw - 2}" height="${ch - 2}" rx="4" fill="${ramp(v)}" class="${sel ? 'cell sel' : 'cell'}" tabindex="0"
          data-tip="Radyal ${r} cm, eksenel ${a} cm: <b>${v > 0 ? '+' : ''}${v} pcm</b>"/>`;
        s += text(x0 + cw / 2, y0 + ch / 2 + 4, `${v > 0 ? '+' : ''}${v}`, v > 280 ? 't cell-t on' : 't cell-t', 'middle', ' pointer-events="none"');
      });
    });
    cols.forEach((r, ci) => { s += text(L + ci * cw + cw / 2, T + rows.length * ch + 17, r, 't', 'middle'); });
    s += text(L + (w - L - R) / 2, h - 5, 'Radyal yansıtıcı kalınlığı (cm)', 'ax', 'middle');
    s += `<text transform="translate(13 ${T + (rows.length * ch) / 2}) rotate(-90)" class="ax" text-anchor="middle">Eksenel (cm)</text>`;
    return [h, s];
  });
}

// ---------- control rod states: k-eff against the critical line ----------
export function keffChart(svg) {
  responsive(svg, (w) => {
    const rowH = 44, T = 30, B = 34;
    const labelW = Math.min(190, w * 0.42);
    const L = labelW + 12, R = 22;
    const h = T + KEFF_STATES.length * rowH + B;
    const x = (k) => L + ((k - 0.86) / (1.04 - 0.86)) * (w - L - R);
    let s = '';
    for (const k of [0.88, 0.92, 0.96, 1.0, 1.04]) {
      s += `<line x1="${x(k)}" x2="${x(k)}" y1="${T - 8}" y2="${h - B}" class="${k === 1 ? 'crit' : 'grid'}"/>`;
      s += text(x(k), h - B + 18, fmt(k, 2), 't', 'middle');
    }
    s += text(x(1), T - 14, 'kritik (k = 1)', 't strong', 'middle');
    KEFF_STATES.forEach((d, i) => {
      const cy = T + i * rowH + rowH / 2;
      s += text(0, cy + 4, d.label, 't lbl');
      s += `<line x1="${x(Math.min(1, d.k))}" x2="${x(Math.max(1, d.k))}" y1="${cy}" y2="${cy}" class="stem"/>`;
      s += `<circle cx="${x(d.k)}" cy="${cy}" r="6" class="${d.k < 1 ? 'dot sel' : 'dot hollow'}" tabindex="0" data-tip="${d.label}: k<sub>eff</sub> = <b>${fmt(d.k, 4)}</b>"/>`;
      s += text(x(d.k), cy - 11, fmt(d.k, 4), 't strong', 'middle');
    });
    return [h, s];
  });
}

// ---------- RIA power history (dark section), from the COBRA-TF power table ----------
export function riaChart(svg) {
  responsive(svg, (w) => {
    const h = Math.min(300, Math.max(240, w * 0.52));
    const L = 40, R = 16, T = 30, B = 40, tMax = 25, pMax = 1.4;
    const x = (t) => L + (t / tMax) * (w - L - R);
    const y = (p) => T + (1 - p / pMax) * (h - T - B);
    let s = '';
    for (const p of [0, 0.5, 1]) {
      s += `<line x1="${L}" x2="${w - R}" y1="${y(p)}" y2="${y(p)}" class="grid"/>` + text(L - 7, y(p) + 4, fmt(p, p % 1 ? 1 : 0), 't', 'end');
    }
    for (const t of [0, 5, 10, 15, 20, 25]) s += text(x(t), h - B + 18, t, 't', 'middle');
    s += text((L + w - R) / 2, h - 5, 'Zaman (s)', 'ax', 'middle');
    // shaded window between the trip signal and the rods being released
    s += `<rect x="${x(RIA_EVENTS.limit)}" y="${T}" width="${x(RIA_EVENTS.trip) - x(RIA_EVENTS.limit)}" height="${h - T - B}" class="band"/>`;
    s += `<line x1="${L}" x2="${w - R}" y1="${y(1.2)}" y2="${y(1.2)}" class="lim"/>`;
    s += text(L + 4, y(1.2) - 6, 'yüksek güç sınırı %120', 't lim-t', 'start');
    const pts = RIA_POWER.filter(([t]) => t <= tMax).map(([t, p]) => `${x(t).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
    s += `<polyline points="${pts}" class="line"/>`;
    const marks = [
      [RIA_EVENTS.withdrawal, 'çekilme başlar'],
      [RIA_EVENTS.trip, 'SCRAM, tepe %133'],
      [RIA_EVENTS.decay, 'bozunma ısısı %6'],
    ];
    marks.forEach(([t, label], i) => {
      const p = powerAt(t);
      s += `<circle cx="${x(t)}" cy="${y(p)}" r="4.5" class="dot" tabindex="0" data-tip="t = ${fmt(t, 2)} s: ${label}, güç <b>%${Math.round(p * 100)}</b>"/>`;
      const ty = i === 0 ? y(p) + 20 : y(p) - 12;
      const anchor = i === 0 ? 'start' : i === 1 ? 'end' : 'start';
      s += text(x(t) + (anchor === 'end' ? -8 : 6), ty, label, 't strong', anchor);
    });
    // hover crosshair
    s += `<g class="xhair" visibility="hidden"><line class="xh-line" y1="${T}" y2="${h - B}"/><circle class="xh-dot" r="4"/></g>`;
    s += `<rect x="${L}" y="${T}" width="${w - L - R}" height="${h - T - B}" fill="transparent" class="hit"/>`;
    queueMicrotask(() => {
      const hit = svg.querySelector('.hit'), g = svg.querySelector('.xhair');
      if (!hit) return;
      const move = (e) => {
        const r = svg.getBoundingClientRect();
        const t = Math.min(tMax, Math.max(0, ((e.clientX - r.left - L) / (w - L - R)) * tMax));
        const p = powerAt(t);
        g.setAttribute('visibility', 'visible');
        g.querySelector('.xh-line').setAttribute('x1', x(t)); g.querySelector('.xh-line').setAttribute('x2', x(t));
        g.querySelector('.xh-dot').setAttribute('cx', x(t)); g.querySelector('.xh-dot').setAttribute('cy', y(p));
        hit.setAttribute('data-tip', `t = <b>${fmt(t, 1)} s</b>, güç <b>%${Math.round(p * 100)}</b>`);
      };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerenter', move);
      hit.addEventListener('pointerleave', () => g.setAttribute('visibility', 'hidden'));
    });
    return [h, s];
  });
}

function powerAt(t) {
  if (t <= RIA_POWER[0][0]) return RIA_POWER[0][1];
  for (let i = 1; i < RIA_POWER.length; i++) {
    const [t1, p1] = RIA_POWER[i];
    if (t <= t1) { const [t0, p0] = RIA_POWER[i - 1]; return p0 + (p1 - p0) * (t - t0) / (t1 - t0); }
  }
  return RIA_POWER[RIA_POWER.length - 1][1];
}

// ---------- LOCA sequence of events (list with a log-time position bar) ----------
export function locaTimeline(el) {
  const t0 = 100, tEnd = 14000;
  const pos = (t) => (Math.log10(t) - Math.log10(t0 * 0.9)) / (Math.log10(tEnd) - Math.log10(t0 * 0.9)) * 100;
  const clock = (t) => t < 600 ? `${t} s` : `${t} s <small>(${t >= 3600 ? `${Math.floor(t / 3600)} sa ` : ''}${Math.round((t % 3600) / 60)} dk)</small>`;
  const key = new Set([110, 6281]);
  el.innerHTML =
    `<ol class="tl">` +
    LOCA_EVENTS.map(([t, label]) =>
      `<li class="${key.has(t) ? 'is-key' : ''}"><span class="tl-t">${clock(t)}</span><span class="tl-e">${label}</span>` +
      `<span class="tl-bar" aria-hidden="true"><i style="left:${pos(t).toFixed(1)}%"></i></span></li>`).join('') +
    `<li class="is-end"><span class="tl-t">14 000 s <small>(3 sa 53 dk)</small></span><span class="tl-e">Hesabın sonu; kor soğumaya devam ediyor</span>` +
    `<span class="tl-bar" aria-hidden="true"><i style="left:100%"></i></span></li>` +
    `</ol>`;
}
