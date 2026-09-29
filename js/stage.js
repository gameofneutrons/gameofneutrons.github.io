// Controls and overlays around the 3D core: toolbar, hover label, picked card, RIA mini chart.
import { ASSEMBLIES, CORE, ROD_GROUPS, POWER } from '../data/core.js';
import { RIA_POWER, RIA_EVENTS } from '../data/transients.js';
import { initCore3D } from './core3d.js';

const $ = (s) => document.querySelector(s);

function groupOf(r, c) {
  for (const [g, list] of Object.entries(ROD_GROUPS)) if (list.some(([a, b]) => a === r && b === c)) return g;
  return null;
}

// Mini chart of the RIA power history, drawn once; the played part is revealed as time runs.
function drawRiaMini(svg) {
  const W = 260, Hh = 118, L = 30, R = 8, T = 10, B = 22, tMax = 22, pMax = 1.4;
  const x = (t) => L + (t / tMax) * (W - L - R);
  const y = (p) => T + (1 - p / pMax) * (Hh - T - B);
  const pts = RIA_POWER.filter(([t]) => t <= tMax).map(([t, p]) => `${x(t).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  svg.innerHTML = `
    <defs><clipPath id="ria-clip"><rect id="ria-clip-r" x="0" y="0" width="${L}" height="${Hh}"/></clipPath></defs>
    ${[0, 0.5, 1].map((p) => `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}" class="g"/><text x="${L - 5}" y="${y(p) + 3.5}" class="t" text-anchor="end">${p === 0.5 ? '0.5' : p}</text>`).join('')}
    <line x1="${L}" x2="${W - R}" y1="${y(1.2)}" y2="${y(1.2)}" class="lim"/>
    <text x="${W - R}" y="${y(1.2) - 4}" class="t lim-t" text-anchor="end">%120 sınır</text>
    ${[0, 5, 10, 15, 20].map((t) => `<text x="${x(t)}" y="${Hh - 6}" class="t" text-anchor="middle">${t}</text>`).join('')}
    <text x="${W - R}" y="${Hh - 6}" class="t" text-anchor="end" dx="2">s</text>
    <polyline points="${pts}" class="ghost"/>
    <polyline points="${pts}" class="live" clip-path="url(#ria-clip)"/>
    <line id="ria-trip" x1="${x(RIA_EVENTS.trip)}" x2="${x(RIA_EVENTS.trip)}" y1="${T}" y2="${Hh - B}" class="trip"/>
    <circle id="ria-dot" r="3.5" cx="${x(0)}" cy="${y(1)}"/>`;
  const clip = svg.querySelector('#ria-clip-r');
  const dot = svg.querySelector('#ria-dot');
  return (t, p) => {
    clip.setAttribute('width', x(t) + 1);
    dot.setAttribute('cx', x(t));
    dot.setAttribute('cy', y(p));
  };
}

export function initStage() {
  const picked = $('#picked');
  const tip = $('#tip');
  const powerEl = $('#power');
  const stateEl = $('#power-state');
  const toolbar = $('#toolbar');
  const btnScram = $('#scram');
  const btnRia = $('#ria');
  const btnCut = $('#cut');
  const riaCard = $('#ria-card');
  const riaT = $('#ria-t');
  const modeBtns = [...toolbar.querySelectorAll('[data-mode]')];
  let onSelect = () => {};

  function describe(r, c) {
    const name = CORE[r][c];
    const a = ASSEMBLIES[name];
    const g = groupOf(r, c);
    return { name, a, g, p: POWER[r][c] };
  }

  function showPicked(r, c) {
    if (r === null) { picked.hidden = true; return; }
    const { name, a, g, p } = describe(r, c);
    picked.innerHTML =
      `<b>${name}</b>UO₂ zenginliği %${a.enr.toFixed(2)}<br>` +
      (a.tho2 ? `${a.tho2} ThO₂ çubuğu` : 'Toryum çubuğu yok') +
      `<br>Nominal göreli güç ${p.toFixed(3)}` +
      (g ? `<br>Kontrol grubu ${g}` : '') +
      `<br><a href="#kor">Haritada gör</a>`;
    picked.hidden = false;
    riaCard.hidden = true;
  }

  const updateMini = drawRiaMini($('#ria-mini'));

  const core = initCore3D($('#core3d'), {
    onPick: (r, c) => { showPicked(r, c); if (r !== null) onSelect(r, c); },
    onHover: (h) => {
      if (!h) { tip.hidden = true; return; }
      const { name, a } = describe(h.r, h.c);
      tip.innerHTML = `<b>${name}</b> · %${a.enr.toFixed(2)} UO₂ · ${a.tho2} ThO₂`;
      tip.style.transform = `translate(${h.x + 14}px, ${h.y + 16}px)`;
      tip.hidden = false;
    },
    onPower: (p, state) => {
      powerEl.textContent = '%' + Math.round(p * 100);
      powerEl.classList.toggle('is-over', p > 1.005);
      stateEl.textContent = state;
    },
    onRia: (t, p) => {
      riaT.textContent = `t = ${t.toFixed(1)} s`;
      updateMini(t, p);
    },
    onBusy: (b) => {
      btnScram.disabled = btnRia.disabled = b;
      if (!b) syncScram();
    },
  });

  if (!core) {
    const img = $('.stage-fallback');
    img.src = img.dataset.src;
    img.hidden = false;
    $('#core3d').hidden = true;
    $('.hud-power').hidden = true;
    toolbar.hidden = true;
    $('#legend-fuel').hidden = true;
    $('#stage-hint').textContent = 'Tarayıcınız 3B çizimi desteklemediği için Serpent görüntüsü gösteriliyor.';
    return { has3d: false, select: () => {}, set onSelect(f) {} };
  }

  if (matchMedia('(hover: hover)').matches) {
    $('#stage-hint').textContent = 'Sürükleyerek çevirin, bir demete tıklayın. Yakınlaştırmak için Ctrl + tekerlek.';
  }

  function syncScram() {
    const rodsIn = core.rodsIn;
    btnScram.classList.toggle('is-reset', rodsIn);
    btnScram.textContent = rodsIn ? 'Sıfırla' : 'SCRAM';
    btnScram.title = rodsIn ? 'Başa al: çubuklar dışarıda, nominal güç' : 'Acil durdurma: bütün kontrol çubukları kora düşer';
  }

  // Rod moves change the power distribution; show it in the power colours.
  const showPower = () => modeBtns.find((b) => b.dataset.mode === 'power').click();

  btnScram.addEventListener('click', () => {
    if (core.animating) return;
    if (core.rodsIn) { core.reset(); riaCard.hidden = true; } else { showPower(); core.scram(); }
  });

  btnRia.addEventListener('click', () => {
    if (core.animating) return;
    showPower();
    picked.hidden = true;
    riaCard.hidden = false;
    updateMini(0, 1);
    core.ria();
  });

  btnCut.addEventListener('click', () => {
    const on = btnCut.getAttribute('aria-pressed') !== 'true';
    btnCut.setAttribute('aria-pressed', String(on));
    core.setCut(on);
  });

  modeBtns.forEach((b) => b.addEventListener('click', () => {
    modeBtns.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    const power = b.dataset.mode === 'power';
    core.setMode(b.dataset.mode);
    $('#legend-fuel').hidden = power;
    $('#legend-power').hidden = !power;
  }));

  return {
    has3d: true,
    select: (r, c) => core.select(r, c),
    set onSelect(f) { onSelect = f; },
  };
}
