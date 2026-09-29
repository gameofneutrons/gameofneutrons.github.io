import { initCoreMap } from './coremap.js';
import { axialChart, beHeatmap, fmChart, initChartTips, keffChart, locaTimeline, riaChart, thoriumCharts } from './charts.js';
import { drawModule } from './figures.js';
import { initNav, initReveal } from './nav.js';
import { initStage } from './stage.js';
import { TEAM } from './team.js';

const $ = (s) => document.querySelector(s);

initNav();
initReveal();

// ---- figures ----
initChartTips();
axialChart($('#axial-chart'));
keffChart($('#keff-chart'));
thoriumCharts($('#th-rho'), $('#th-days'));
fmChart($('#fm-chart'));
beHeatmap($('#be-chart'));
riaChart($('#ria-chart'));
locaTimeline($('#loca-timeline'));
drawModule($('#module-svg'));

// ---- team ----
function initials(name) {
  return name.trim().split(/\s+/).map((p) => p[0]).join('').toLocaleUpperCase('tr');
}
$('#team').innerHTML = TEAM.map((m) => {
  const kind = /kaptan/i.test(m.role) ? ' is-lead' : /danışman/i.test(m.role) ? ' is-advisor' : '';
  const inner =
    `<span class="avatar" aria-hidden="true">${initials(m.name)}</span>` +
    `<span class="who"><span class="name">${m.name}</span><span class="role">${m.role || ''}</span></span>`;
  return m.link
    ? `<li><a class="member${kind}" href="${m.link}" target="_blank" rel="noopener">${inner}` +
      `<svg class="icon" aria-label="LinkedIn"><use href="#i-linkedin"/></svg></a></li>`
    : `<li><div class="member${kind}">${inner}</div></li>`;
}).join('');

// ---- 3D core and the 2D map, kept in sync ----
const stage = initStage();
const map = initCoreMap({
  mapCanvas: $('#coremap'),
  detailCanvas: $('#asm-canvas'),
  facts: $('#asm-facts'),
  note: $('#map-note'),
  toggle: $('.toggle'),
  onSelect: (r, c) => stage.select(r, c),
});
stage.onSelect = (r, c) => map.select(r, c);

// Original COBRA-TF plots load only when their panel is opened.
document.querySelectorAll('details.orig').forEach((d) => d.addEventListener('toggle', () => {
  const img = d.querySelector('img[data-src]');
  if (d.open && img) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
}, { once: true }));

// "3B modelde oynat": go up to the model and start the RIA replay there.
const riaBtn = $('#ria-3d');
if (!stage.has3d) riaBtn.hidden = true;
riaBtn.addEventListener('click', () => {
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('.stage').scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
  setTimeout(() => $('#ria').click(), smooth ? 700 : 0);
});
