// 2D core map (fuel / radial power) and the pin-by-pin view of one assembly.
import { CORE, ASSEMBLIES, ROD_GROUPS, ROD_WORTH_PCM, POWER } from '../data/core.js';


const GROUP_NAME = { D1: 'D1, düzenleme', D2: 'D2, düzenleme', K1: 'K1, kapatma', K2: 'K2, kapatma' };
const TH = '#62c98a';
const WATER = '#dfeaf3';
const INK = '#0a2440';

function hex(c) { return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); }
function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }

export function uColor(enr) {
  const t = Math.min(1, Math.max(0, (enr - 2.5) / (4.6 - 2.5)));
  return hex(mix([226, 190, 110], [140, 78, 20], t));
}
function powerColor(p) {
  // below average: pale blue, above: warm
  if (p < 1) return hex(mix([255, 255, 255], [150, 190, 228], Math.min(1, (1 - p) / 0.07)));
  return hex(mix([255, 255, 255], [238, 150, 96], Math.min(1, (p - 1) / 0.03)));
}
function groupAt(r, c) {
  for (const [g, list] of Object.entries(ROD_GROUPS)) if (list.some(([a, b]) => a === r && b === c)) return g;
  return null;
}

function setup(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2.5);
  const size = canvas.clientWidth;
  canvas.width = canvas.height = Math.round(size * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, size };
}

function drawPins(g, name, x0, y0, cell, { big = false, rodded = false } = {}) {
  const a = ASSEMBLIES[name];
  const p = cell / 17;
  const col = uColor(a.enr);
  for (let i = 0; i < 17; i++) {
    for (let j = 0; j < 17; j++) {
      const ch = a.grid[i][j];
      const cx = x0 + (j + 0.5) * p, cy = y0 + (i + 0.5) * p;
      g.beginPath();
      if (ch === 'U' || ch === 'T') {
        g.arc(cx, cy, p * 0.42, 0, Math.PI * 2);
        g.fillStyle = ch === 'T' ? TH : col;
        g.fill();
        if (big) { g.lineWidth = 1; g.strokeStyle = 'rgba(10,36,64,.35)'; g.stroke(); }
      } else if (ch === 'G') {
        g.arc(cx, cy, p * 0.4, 0, Math.PI * 2);
        if (rodded && big) { g.fillStyle = '#5d6b7c'; g.fill(); }
        g.lineWidth = big ? 1.5 : 0.6;
        g.strokeStyle = '#7c8ea3';
        g.stroke();
      } else if (ch === 'I') {
        g.arc(cx, cy, p * 0.22, 0, Math.PI * 2);
        g.fillStyle = INK;
        g.fill();
      }
    }
  }
}

export function initCoreMap({ mapCanvas, detailCanvas, facts, note, toggle, onSelect }) {
  let view = 'fuel';
  let sel = [0, 2]; // C-01, the highest-power assembly

  function geometry(size) {
    const pad = 4;
    const cell = (size - pad * 2) / 7;
    return { pad, cell };
  }

  function drawMap() {
    const { g, size } = setup(mapCanvas);
    const { pad, cell } = geometry(size);
    g.clearRect(0, 0, size, size);
    // water background inside the core outline
    CORE.forEach((row, r) => row.forEach((name, c) => {
      if (!name) return;
      const x = pad + c * cell, y = pad + r * cell;
      g.fillStyle = view === 'fuel' ? WATER : powerColor(POWER[r][c]);
      g.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      if (view === 'fuel') {
        drawPins(g, name, x + cell * 0.04, y + cell * 0.04, cell * 0.92, { rodded: !!groupAt(r, c) });
        const grp = groupAt(r, c);
        if (grp) {
          const fs = Math.max(9, cell * 0.2);
          g.font = `600 ${fs}px "Fira Sans", sans-serif`;
          const w = g.measureText(grp).width + fs * 0.5;
          g.fillStyle = INK;
          g.fillRect(x + 2, y + 2, w, fs * 1.25);
          g.fillStyle = '#fff';
          g.textBaseline = 'middle';
          g.fillText(grp, x + 2 + fs * 0.25, y + 2 + fs * 0.65);
        }
      } else {
        const fs = Math.max(10, cell * 0.2);
        g.font = `500 ${fs}px "Fira Sans", sans-serif`;
        g.fillStyle = INK;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(POWER[r][c].toFixed(3), x + cell / 2, y + cell / 2);
        g.textAlign = 'start';
      }
    }));
    // grid lines
    g.strokeStyle = 'rgba(10,36,64,.25)';
    g.lineWidth = 1;
    CORE.forEach((row, r) => row.forEach((name, c) => {
      if (name) g.strokeRect(pad + c * cell + 0.5, pad + r * cell + 0.5, cell - 1, cell - 1);
    }));
    // selection
    const [sr, sc] = sel;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.strokeRect(pad + sc * cell + 1.5, pad + sr * cell + 1.5, cell - 3, cell - 3);
  }

  function drawDetail() {
    const [r, c] = sel;
    const name = CORE[r][c];
    const a = ASSEMBLIES[name];
    const grp = groupAt(r, c);
    const { g, size } = setup(detailCanvas);
    g.clearRect(0, 0, size, size);
    g.fillStyle = WATER;
    g.fillRect(0, 0, size, size);
    drawPins(g, name, 0, 0, size, { big: true, rodded: !!grp });

    const rows = [
      ['UO₂ zenginliği', '%' + a.enr.toFixed(2)],
      ['UO₂ çubuğu', a.uo2],
      ['ThO₂ çubuğu', a.tho2],
      ['Normalize güç', POWER[r][c].toFixed(3)],
      ['Kontrol çubuğu grubu', grp ? GROUP_NAME[grp] : 'yok'],
    ];
    if (grp) rows.push(['Grubun değeri', ROD_WORTH_PCM[grp].toLocaleString('tr-TR') + ' pcm']);
    facts.innerHTML =
      `<h3>${name}</h3><p class="asm-sub">Tip ${a.type} demet, korda ${countOf(name)} adet</p>` +
      '<dl>' + rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('') + '</dl>' +
      `<div class="pinkey"><span><i style="background:${uColor(a.enr)}"></i>UO₂</span>` +
      `<span><i style="background:${TH}"></i>ThO₂</span>` +
      `<span><i style="border:1.5px solid #7c8ea3"></i>kılavuz tüp</span>` +
      (grp ? `<span><i style="background:#5d6b7c"></i>kontrol çubuğu girer</span>` : '') +
      `<span><i style="background:${INK};transform:scale(.55)"></i>ölçüm tüpü</span></div>`;
  }

  function countOf(name) {
    return CORE.flat().filter((n) => n === name).length;
  }

  function select(r, c, fromOutside = false) {
    if (r === null || !CORE[r] || !CORE[r][c]) return;
    sel = [r, c];
    mapCanvas.setAttribute('aria-label', `37 demetlik kor haritası. Seçili demet ${CORE[r][c]}. Ok tuşlarıyla başka bir demete geçebilirsiniz.`);
    drawMap();
    drawDetail();
    if (!fromOutside && onSelect) onSelect(r, c);
  }

  mapCanvas.addEventListener('click', (e) => {
    const rect = mapCanvas.getBoundingClientRect();
    const { pad, cell } = geometry(rect.width);
    const c = Math.floor((e.clientX - rect.left - pad) / cell);
    const r = Math.floor((e.clientY - rect.top - pad) / cell);
    if (r >= 0 && r < 7 && c >= 0 && c < 7) select(r, c);
  });

  // Keyboard: arrow keys move the selection to the next assembly in that direction.
  mapCanvas.tabIndex = 0;
  mapCanvas.setAttribute('role', 'application');
  mapCanvas.setAttribute('aria-roledescription', 'kor haritası');
  mapCanvas.addEventListener('keydown', (e) => {
    const dir = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    let [r, c] = sel;
    do { r += dir[0]; c += dir[1]; } while (r >= 0 && r < 7 && c >= 0 && c < 7 && !CORE[r][c]);
    if (r >= 0 && r < 7 && c >= 0 && c < 7) select(r, c);
  });

  toggle.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    toggle.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
    note.textContent = view === 'fuel'
      ? 'Renkler UO₂ zenginliğini, yeşil noktalar toryum çubuklarını gösteriyor. D ve K harfleri kontrol çubuğu gruplarıdır.'
      : 'Her demetin ürettiği gücün kor ortalamasına oranı. En yüksek 1.029 (C-01), en düşük 0.932 (A-01).';
    drawMap();
  }));

  let lastW = 0;
  new ResizeObserver(() => {
    const w = mapCanvas.clientWidth;
    if (w && w !== lastW) { lastW = w; drawMap(); drawDetail(); }
  }).observe(mapCanvas);

  return { select: (r, c) => select(r, c, true) };
}
