// Hand-built SVG figure: the module-in-pool schematic.

const NS = 'http://www.w3.org/2000/svg';

export function drawModule(svg) {
  const hot = '#f2a65a', cold = '#6fd0ff', line = '#dfe8f2', dim = '#8fa6bf', lead = '#6f8aa8';

  // core stripes: amber UO2 with thorium rods at the edges
  let stripes = '';
  const colors = ['#8cedab', '#e0b56a', '#e0b56a', '#d69f4f', '#8cedab', '#c98a3a', '#c98a3a', '#8cedab', '#d69f4f', '#e0b56a', '#e0b56a', '#8cedab'];
  colors.forEach((c, i) => { stripes += `<rect x="${234 + i * 7.8}" y="566" width="5" height="94" fill="${c}"/>`; });

  // steam generator helix in the downcomer (zigzag)
  const coil = (x1, x2) => {
    let p = '';
    for (let yy = 272, k = 0; yy <= 448; yy += 11, k++) p += `${k % 2 ? x2 : x1},${yy} `;
    return `<polyline points="${p}" fill="none" stroke="${line}" stroke-width="1.6" opacity=".85"/>`;
  };
  const valve = (cx, cy, rot = 0) =>
    `<g transform="translate(${cx} ${cy}) rotate(${rot})"><path d="M-8,-6 L8,6 L8,-6 L-8,6 Z" fill="#ffd479" stroke="#0a2440" stroke-width="1"/></g>`;
  const label = (x, y, text, tx, ty, anchor = 'start') =>
    `<line x1="${anchor === 'start' ? x + text.length * 10 + 6 : x + 6}" y1="${y - 7}" x2="${tx}" y2="${ty}" stroke="${lead}" stroke-width="1"/>` +
    `<text x="${x}" y="${y}" class="lab" text-anchor="${anchor}">${text}</text>`;

  svg.innerHTML = `
  <defs>
    <marker id="aHot" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${hot}"/></marker>
    <marker id="aCold" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${cold}"/></marker>
    <marker id="aPipe" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${line}"/></marker>
    <style>.lab{font:20px "Fira Sans",sans-serif;fill:#dfe8f2}.lab2{font:17px "Fira Sans",sans-serif;fill:#9fb3c9}</style>
  </defs>

  <!-- pool -->
  <rect x="4" y="34" width="552" height="722" rx="4" fill="#0f3358"/>
  <path d="M4,34 q20,-7 40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t40,0 t32,0" fill="none" stroke="${cold}" stroke-width="1.5" opacity=".7"/>

  <!-- containment vessel (vacuum) -->
  <rect x="176" y="60" width="210" height="676" rx="105" fill="#0a2440" stroke="${dim}" stroke-width="2.5"/>

  <!-- DHRS loop to the pool condenser -->
  <polyline points="352,290 470,290 470,312" fill="none" stroke="${line}" stroke-width="2.5"/>
  <line x1="400" y1="290" x2="430" y2="290" stroke="${line}" stroke-width="2.5" marker-end="url(#aPipe)"/>
  <rect x="444" y="312" width="52" height="112" rx="3" fill="#0a2440" stroke="${line}" stroke-width="2"/>
  ${[454, 464, 474, 484].map((xx) => `<line x1="${xx}" y1="318" x2="${xx}" y2="418" stroke="${line}" stroke-width="1.2" opacity=".8"/>`).join('')}
  <polyline points="470,424 470,452 352,452" fill="none" stroke="${line}" stroke-width="2.5"/>
  <line x1="430" y1="452" x2="400" y2="452" stroke="${line}" stroke-width="2.5" marker-end="url(#aPipe)"/>

  <!-- reactor pressure vessel -->
  <rect x="206" y="100" width="150" height="604" rx="75" fill="#15446f" stroke="${line}" stroke-width="2.5"/>
  <line x1="213" y1="192" x2="349" y2="192" stroke="${line}" stroke-width="2"/>
  <!-- riser -->
  <line x1="262" y1="232" x2="262" y2="552" stroke="${line}" stroke-width="1.8"/>
  <line x1="300" y1="232" x2="300" y2="552" stroke="${line}" stroke-width="1.8"/>
  ${coil(216, 254)}
  ${coil(308, 346)}
  <!-- core -->
  <rect x="230" y="562" width="102" height="102" fill="#0a2440" stroke="${line}" stroke-width="1.5"/>
  ${stripes}

  <!-- natural circulation -->
  <path class="flow" d="M281,556 L281,250" stroke="${hot}" stroke-width="4" fill="none" marker-end="url(#aHot)"/>
  <path class="flow" d="M275,242 Q250,222 238,252" stroke="${hot}" stroke-width="3" fill="none" marker-end="url(#aHot)"/>
  <path class="flow" d="M287,242 Q312,222 324,252" stroke="${hot}" stroke-width="3" fill="none" marker-end="url(#aHot)"/>
  <path class="flow" d="M236,462 L236,672 Q236,688 256,688 L266,688" stroke="${cold}" stroke-width="3.5" fill="none" marker-end="url(#aCold)"/>
  <path class="flow" d="M326,462 L326,672 Q326,688 306,688 L296,688" stroke="${cold}" stroke-width="3.5" fill="none" marker-end="url(#aCold)"/>

  <!-- ECCS valves: 3 RVV on the head, 2 RRV on the side -->
  ${valve(256, 112, -35)}${valve(281, 102)}${valve(306, 112, 35)}
  ${valve(206, 520, 90)}${valve(356, 520, 90)}

  ${label(16, 96, 'Koruma kabı', 186, 118)}
  <text x="16" y="118" class="lab2">içi vakum</text>
  ${label(16, 158, 'Basınçlandırıcı', 214, 158)}
  ${label(16, 362, 'Buhar üreteci', 216, 362)}
  ${label(16, 440, 'Basınç kabı', 207, 440)}
  ${label(16, 524, 'RRV vanası', 198, 520)}
  ${label(16, 616, 'Kor', 229, 612)}
  <text x="16" y="742" class="lab">Reaktör havuzu</text>
  <line x1="340" y1="100" x2="410" y2="74" stroke="${lead}" stroke-width="1"/>
  <text x="412" y="80" class="lab">RVV vanaları</text>
  <text x="414" y="480" class="lab">DHRS</text>
  <text x="414" y="500" class="lab2">havuzdaki</text>
  <text x="414" y="518" class="lab2">kondenser</text>
  `;
}
