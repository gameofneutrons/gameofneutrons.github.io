// Numbers behind the axial power and accident figures, with their source.

// Axial relative power along the active fuel, bottom to top: [height in inches, relative power].
// TURKER COBRA-TF input (KODLAR/Örnek Girdiler, RIA deck.inp, Group 11). Its peak (1.471 near
// mid-height) matches the Serpent axial power peaking factor (1.4706).
export const AXIAL_IN = [
  [0.00, 0.353], [2.01, 0.307], [3.62, 0.373], [6.04, 0.482], [7.65, 0.578], [10.06, 0.695],
  [11.67, 0.774], [14.09, 0.878], [15.70, 0.931], [18.11, 1.019], [19.72, 1.082], [22.13, 1.153],
  [23.74, 1.183], [26.16, 1.270], [27.77, 1.308], [30.18, 1.363], [31.79, 1.399], [34.21, 1.412],
  [35.82, 1.445], [38.23, 1.471], [39.84, 1.465], [42.26, 1.409], [43.87, 1.403], [46.28, 1.397],
  [47.89, 1.375], [50.31, 1.351], [51.92, 1.311], [54.33, 1.259], [55.94, 1.214], [58.36, 1.135],
  [59.97, 1.088], [62.38, 0.991], [63.99, 0.956], [66.40, 0.858], [68.01, 0.795], [70.43, 0.688],
  [72.04, 0.612], [74.45, 0.498], [76.06, 0.416], [78.48, 0.315], [78.74, 0.346],
];

// Relative axial power at a height fraction f (0 = bottom, 1 = top of the active fuel).
export function axialAt(f) {
  const top = AXIAL_IN[AXIAL_IN.length - 1][0];
  const y = Math.min(1, Math.max(0, f)) * top;
  for (let i = 1; i < AXIAL_IN.length; i++) {
    const [y1, v1] = AXIAL_IN[i];
    if (y <= y1) {
      const [y0, v0] = AXIAL_IN[i - 1];
      return v0 + (v1 - v0) * (y - y0) / (y1 - y0 || 1);
    }
  }
  return AXIAL_IN[AXIAL_IN.length - 1][1];
}

// RIA, uncontrolled withdrawal of a control rod group: power (fraction of nominal) vs time (s).
// COBRA-TF "power forcing function table" of the TURKER RIA case (deck.inp / deck.out).
export const RIA_POWER = [
  [0, 1], [5, 1], [7, 1.054], [9, 1.135], [10.26, 1.2], [11, 1.245], [12, 1.313], [12.26, 1.333],
  [12.5, 1.296], [13, 0.884], [13.5, 0.32], [14, 0.141], [14.5, 0.101], [15, 0.089], [16, 0.077],
  [17, 0.068], [18, 0.061], [20, 0.06], [25, 0.06],
];

// Event times of the RIA case (FDR Table 30; the high-power limit is 120 % in the COBRA-TF input
// and FDR section 8.6, 118 % in Table 30).
export const RIA_EVENTS = {
  withdrawal: 5.0,   // rod group starts moving out
  limit: 10.26,      // high-power analytical limit reached, trip signal
  trip: 12.26,       // after the 2 s signal delay: rods released, SCRAM starts
  rodsIn: 14.8,      // rods fully inserted (about)
  decay: 18.0,       // power at decay-heat level (6 %)
};

export const DECAY_HEAT = 0.06;

export function powerAt(table, t) {
  if (t <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [t1, p1] = table[i];
    if (t <= t1) {
      const [t0, p0] = table[i - 1];
      return p0 + (p1 - p0) * (t - t0) / (t1 - t0);
    }
  }
  return table[table.length - 1][1];
}

// LOCA, the limiting case (CVCS injection line break with loss of normal AC power):
// sequence of events, FDR Table 28.
export const LOCA_EVENTS = [
  [100, 'Hat kırığı ve normal AC güç kaybı'],
  [108, 'Yüksek basınçlandırıcı basıncı (13.79 MPa)'],
  [110, 'Reaktör trip'],
  [116, 'Yüksek koruma kabı basıncı sinyali'],
  [423, 'Düşük basınçlandırıcı seviyesi (%35)'],
  [706, 'Düşük-düşük basınçlandırıcı seviyesi (%20)'],
  [2338, 'Yüksek koruma kabı su seviyesi'],
  [6281, 'ECCS devreye girer'],
];
