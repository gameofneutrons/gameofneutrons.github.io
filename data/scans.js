// Design scans behind the "Tasarım kararları" section, with their source.

// Thorium share of heavy metal (U-235 mass held at the NuScale value). rho: beginning-of-cycle
// excess reactivity; days: burnup time until reactivity reaches zero. Read from FDR Figures 18
// and 19 (plots without printed values), so they are approximate.
export const THORIUM_SCAN = [
  { th: 0, rho: 0.202, days: 955 },
  { th: 5, rho: 0.192, days: 925 },
  { th: 10, rho: 0.168, days: 890 },
  { th: 15, rho: 0.152, days: 860 },
  { th: 20, rho: 0.127, days: 690 },
  { th: 25, rho: 0.100, days: 540 },
];

// Fuel-to-moderator volume ratio: days to zero reactivity (FDR Figure 23, printed values) and
// the matching lattice (FDR Table 15). The NuScale reference ratio is 0.589.
export const FM_SCAN = [
  { fm: 0.3, days: 1045.7, pitch: 1.5599, core: 186.2 },
  { fm: 0.4, days: 1059.4, pitch: 1.4150, core: 169.0 },
  { fm: 0.5, days: 1019.4, pitch: 1.3204, core: 157.7 },
  { fm: 0.589, days: 946.4, pitch: 1.2598, core: 150.5, ref: true },
  { fm: 0.6, days: 922.4, pitch: 1.2534, core: 149.8 },
  { fm: 0.7, days: 812.6, pitch: 1.2033, core: 143.8 },
  { fm: 0.8, days: 688.1, pitch: 1.1643, core: 139.2 },
];

// Beryllium reflector thickness (cm) vs reactivity gain over the case without it (pcm, ±75),
// FDR Figure 26 (printed values). Radial 20 cm with no axial reflector was chosen.
export const BE_SCAN = [
  { radial: 0, axial: 0, pcm: 0 },
  { radial: 1, axial: 1, pcm: 61 },
  { radial: 5, axial: 5, pcm: 269 },
  { radial: 10, axial: 0, pcm: 306 },
  { radial: 10, axial: 10, pcm: 330 },
  { radial: 20, axial: 0, pcm: 494 },
  { radial: 20, axial: 5, pcm: 465 },
  { radial: 20, axial: 10, pcm: 455 },
  { radial: 20, axial: 20, pcm: 470 },
  { radial: 30, axial: 20, pcm: 520 },
  { radial: 30, axial: 30, pcm: 500 },
];

// Core k-eff with control rod groups in or out (FDR / poster Table 4).
export const KEFF_STATES = [
  { label: 'Tüm çubuklar dışarıda', k: 1.0234 },
  { label: 'Düzenleme grubu içeride', k: 1.0041 },
  { label: 'Kapatma grubu içeride', k: 0.9930 },
  { label: 'Tüm çubuklar içeride', k: 0.8771 },
];
