import { ASSEMBLIES, CORE, ROD_GROUPS } from '../data/core.js';
import { initCore3D } from './core3d.js';
import { initCoreMap } from './coremap.js';
import { drawThoriumChart, drawModule } from './figures.js';
import { TEAM } from './team.js';

const $ = (s) => document.querySelector(s);

// Local screenshot helper (?shot&sec=id): hide everything before the section.
const shotSec = new URLSearchParams(location.search).get('sec');
if (location.search.includes('shot') && shotSec) {
  const target = document.getElementById(shotSec);
  document.querySelectorAll('header.hero, main > section').forEach((el) => {
    if (el !== target && (el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) el.style.display = 'none';
  });
}

// ---- figures ----
drawThoriumChart($('#th-chart'));
drawModule($('#module-svg'));

// ---- team ----
const teamList = $('#team');
teamList.innerHTML = TEAM.map((m) => {
  const name = m.link ? `<a href="${m.link}" rel="noopener">${m.name}</a>` : m.name;
  return `<li><span class="name">${name}</span><span class="role">${m.role || ''}</span></li>`;
}).join('');

// ---- 2D core map ----
let core3d = null;
const map = initCoreMap({
  mapCanvas: $('#coremap'),
  detailCanvas: $('#asm-canvas'),
  facts: $('#asm-facts'),
  note: $('#map-note'),
  toggle: $('.toggle'),
  onSelect: (r, c) => core3d && core3d.select(r, c),
});

// ---- 3D core ----
const powerEl = $('#power');
const powerLabel = $('.readout-label');
const picked = $('#picked');
const btn = $('#scram');

function groupOf(r, c) {
  for (const [g, list] of Object.entries(ROD_GROUPS)) if (list.some(([a, b]) => a === r && b === c)) return g;
  return null;
}

function showPicked(r, c) {
  if (r === null) { picked.hidden = true; return; }
  const name = CORE[r][c];
  const a = ASSEMBLIES[name];
  const g = groupOf(r, c);
  picked.innerHTML =
    `<b>${name}</b><br>UO₂ zenginliği %${a.enr.toFixed(2)}<br>` +
    (a.tho2 ? `${a.tho2} ThO₂ çubuğu` : 'toryum çubuğu yok') +
    (g ? `<br>Kontrol grubu ${g}` : '') +
    `<br><a href="#kor">Haritada gör</a>`;
  picked.hidden = false;
}

core3d = initCore3D($('#core3d'), {
  onPick: (r, c) => {
    showPicked(r, c);
    if (r !== null) map.select(r, c);
  },
  onPower: (p) => {
    powerEl.textContent = '%' + Math.round(p * 100);
    powerLabel.textContent = p <= 0.061 ? 'Kor gücü, bozunma ısısı' : 'Kor gücü';
  },
});

if (!core3d) {
  $('#core3d').hidden = true;
  $('.stage-fallback').hidden = false;
  $('.readout').hidden = true;
  btn.hidden = true;
  $('#stage-hint').textContent = 'Tarayıcın 3B çizimi desteklemediği için Serpent görüntüsü gösteriliyor.';
} else {
  btn.addEventListener('click', () => {
    if (core3d.animating) return;
    if (btn.classList.contains('is-reset')) {
      core3d.withdraw();
      btn.classList.remove('is-reset');
      btn.textContent = 'SCRAM';
    } else {
      core3d.scram();
      btn.classList.add('is-reset');
      btn.textContent = 'Çubukları çek';
    }
  });
}
