// Builds data/rodshapes.js: how inserted control rods reshape the core power.
// Run from the site folder: node tools/rodshapes.mjs
//
// A two-group, three-dimensional finite-volume diffusion model of the core (12 cm radial and
// 10 cm axial mesh, beryllium ring, water around), with typical light-water constants.
// Two things are fitted to Serpent: the fission strength of each assembly, so that the rods-out
// assembly powers match the Serpent radial map, and the rod absorption, so that all rods fully in
// are worth 16 303 pcm (FDR Table 16). The page only uses the ratio of rodded to rods-out power
// from this model; the rods-out shape itself comes from Serpent.
import { writeFileSync } from 'node:fs';
import { CORE, ROD_GROUPS, POWER, ROD_WORTH_PCM } from '../data/core.js';
import { axialAt } from '../data/transients.js';

const P = 24.1416;            // assembly pitch, cm
const H = 200;                // active height, cm
const PER = 2;                // radial nodes per assembly
const h = P / PER;
const NX = 20;                // radial nodes per side (±120.7 cm)
const hz = 10, REFL = 2;      // axial node height; reflector nodes below and above
const NZC = H / hz, NZ = NZC + 2 * REFL, NQ = NX * NX, N = NQ * NZ;
const BINS = 20;              // output bins along the height (10 cm)
const K_OUT = 1.0234;         // all rods out, 750 ppm boron (FDR Table 16)
const ROD_FAST = 0.1;         // rod absorption in the fast group, relative to thermal

// Two-group constants (1 fast, 2 thermal): typical PWR values, not computed for TURKER.
const FUEL = { D1: 1.40, A1: 0.0095, S12: 0.0175, F1: 0.0065, D2: 0.40, A2: 0.095, F2: 0.135 };
const WATER = { D1: 1.45, A1: 0.0006, S12: 0.028, F1: 0, D2: 0.30, A2: 0.020, F2: 0 };
const BE = { D1: 0.60, A1: 0.0008, S12: 0.0085, F1: 0, D2: 0.50, A2: 0.0016, F2: 0 };

const asmIndex = [];          // [r][c] -> index in reading order, as in the 3D model
const groupOf = {};
let na = 0;
CORE.forEach((row, r) => { asmIndex[r] = []; row.forEach((n, c) => { asmIndex[r][c] = n ? na++ : -1; }); });
for (const [g, list] of Object.entries(ROD_GROUPS)) for (const [r, c] of list) groupOf[asmIndex[r][c]] = g;
const powerOf = [];
CORE.forEach((row, r) => row.forEach((n, c) => { if (n) powerOf.push(POWER[r][c]); }));

// ---- mesh and materials ----
const nodeAsm = new Int16Array(NQ).fill(-1);
const radMat = [];
const off = (NX - 7 * PER) / 2;
for (let j = 0; j < NX; j++) for (let i = 0; i < NX; i++) {
  const x = (i - NX / 2 + 0.5) * h, y = (j - NX / 2 + 0.5) * h;
  const c = Math.floor((i - off) / PER), r = Math.floor((j - off) / PER);
  const a = r >= 0 && r < 7 && c >= 0 && c < 7 ? asmIndex[r][c] : -1;
  nodeAsm[j * NX + i] = a;
  const rad = Math.hypot(x, y);
  radMat.push(a >= 0 ? FUEL : rad >= 94.5 && rad < 114.5 ? BE : WATER);
}
const inCore = (k) => k >= REFL && k < REFL + NZC;

const mat = { D1: new Float64Array(N), A1: new Float64Array(N), S12: new Float64Array(N), D2: new Float64Array(N), A2: new Float64Array(N) };
const F1 = new Float64Array(N), F2 = new Float64Array(N);
for (let k = 0; k < NZ; k++) for (let q = 0; q < NQ; q++) {
  const n = k * NQ + q;
  const m = radMat[q] === FUEL && !inCore(k) ? WATER : radMat[q];
  for (const key of Object.keys(mat)) mat[key][n] = m[key];
}

// Coupling to the six neighbours; zero flux on the outer faces.
const NB = new Int32Array(N * 6);
function couplings(Dg) {
  const C = new Float64Array(N * 6), leak = new Float64Array(N);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NX; j++) for (let i = 0; i < NX; i++) {
    const n = (k * NX + j) * NX + i;
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(([di, dj, dk], s) => {
      const ii = i + di, jj = j + dj, kk = k + dk, hh = dk ? hz : h;
      if (ii < 0 || jj < 0 || kk < 0 || ii >= NX || jj >= NX || kk >= NZ) {
        NB[n * 6 + s] = -1; leak[n] += 2 * Dg[n] / (hh * hh);
      } else {
        const m = (kk * NX + jj) * NX + ii;
        NB[n * 6 + s] = m;
        C[n * 6 + s] = 2 * Dg[n] * Dg[m] / (Dg[n] + Dg[m]) / (hh * hh);
      }
    });
  }
  return { C, leak };
}
const G1 = couplings(mat.D1), G2 = couplings(mat.D2);

// Thermal rod absorption per node for given insertion depths (cm from the top) by assembly.
function rodAbs(sigma, depthOf) {
  const R = new Float64Array(N);
  if (!sigma) return R;
  for (let k = REFL; k < REFL + NZC; k++) {
    const z0 = (k - REFL) * hz, z1 = z0 + hz;
    for (let q = 0; q < NQ; q++) {
      const a = nodeAsm[q];
      const d = a >= 0 ? depthOf(a) : 0;
      if (d) R[k * NQ + q] = sigma * Math.min(1, Math.max(0, (z1 - (H - d)) / hz));
    }
  }
  return R;
}

// Power iteration with SOR inner sweeps. Returns { k, p1, p2 } (fast and thermal flux).
function sweep(phi, rhs, diag, G, w) {
  const { C } = G;
  for (let n = 0; n < N; n++) {
    let s = rhs[n];
    const b = n * 6;
    for (let t = 0; t < 6; t++) { const m = NB[b + t]; if (m >= 0) s += C[b + t] * phi[m]; }
    phi[n] += w * (s / diag[n] - phi[n]);
  }
}
function solve(R2, warm) {
  const p1 = warm ? Float64Array.from(warm.p1) : new Float64Array(N).fill(1);
  const p2 = warm ? Float64Array.from(warm.p2) : new Float64Array(N).fill(0.2);
  const d1 = new Float64Array(N), d2 = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    let s1 = mat.A1[n] + ROD_FAST * R2[n] + mat.S12[n] + G1.leak[n];
    let s2 = mat.A2[n] + R2[n] + G2.leak[n];
    for (let t = 0; t < 6; t++) { s1 += G1.C[n * 6 + t]; s2 += G2.C[n * 6 + t]; }
    d1[n] = s1; d2[n] = s2;
  }
  const rhs1 = new Float64Array(N), rhs2 = new Float64Array(N);
  const src = new Float64Array(N);
  const fis = () => { let s = 0; for (let n = 0; n < N; n++) { src[n] = F1[n] * p1[n] + F2[n] * p2[n]; s += src[n]; } return s; };
  let k = warm ? warm.k : 1, fsum = fis();
  const prev = Float64Array.from(src);
  let it = 0;
  for (; it < 20000; it++) {
    for (let n = 0; n < N; n++) rhs1[n] = src[n] / k;
    for (let s = 0; s < 3; s++) sweep(p1, rhs1, d1, G1, 1.5);
    for (let n = 0; n < N; n++) rhs2[n] = mat.S12[n] * p1[n];
    for (let s = 0; s < 3; s++) sweep(p2, rhs2, d2, G2, 1.3);
    const fnew = fis();
    const knew = k * fnew / fsum;
    const dk = Math.abs(knew - k);
    k = knew;
    // stop when both k and the shape of the fission source have settled
    const sc = fsum / fnew;
    let dmax = 0, smax = 0;
    for (let n = 0; n < N; n++) {
      p1[n] *= sc; p2[n] *= sc; src[n] *= sc;
      dmax = Math.max(dmax, Math.abs(src[n] - prev[n])); smax = Math.max(smax, src[n]);
      prev[n] = src[n];
    }
    if (dk < 1e-7 && dmax < 2e-6 * smax) break;
  }
  return { k, p1, p2, it };
}

// Power summed per assembly and height bin.
function blockSums(sol) {
  const s = new Float64Array(na * BINS);
  const per = NZC / BINS;
  for (let k = REFL; k < REFL + NZC; k++) {
    const b = Math.floor((k - REFL) / per);
    for (let q = 0; q < NQ; q++) {
      const a = nodeAsm[q];
      if (a >= 0) { const n = k * NQ + q; s[a * BINS + b] += F1[n] * sol.p1[n] + F2[n] * sol.p2[n]; }
    }
  }
  return s;
}

// ---- 1. rods out: pick the fission strength node by node so that the rods-out solution is the
// Serpent shape (assembly power x axial profile) at k = 1.0234. With that source fixed, one
// fixed-source solve gives the flux, and the needed fission strength follows directly. ----
const target = new Float64Array(N);
for (let k = REFL; k < REFL + NZC; k++) for (let q = 0; q < NQ; q++) {
  const a = nodeAsm[q];
  if (a >= 0) target[k * NQ + q] = powerOf[a] * axialAt((k - REFL + 0.5) / NZC);
}
function fixedSource(G, diag, rhs) {
  const phi = new Float64Array(N);
  for (let it = 0; it < 20000; it++) {
    let dmax = 0, pmax = 0;
    const { C } = G;
    for (let n = 0; n < N; n++) {
      let s = rhs[n];
      const b = n * 6;
      for (let t = 0; t < 6; t++) { const m = NB[b + t]; if (m >= 0) s += C[b + t] * phi[m]; }
      const d = 1.5 * (s / diag[n] - phi[n]);
      phi[n] += d;
      dmax = Math.max(dmax, Math.abs(d)); pmax = Math.max(pmax, phi[n]);
    }
    if (dmax < 1e-10 * pmax) break;
  }
  return phi;
}
{
  const d1 = new Float64Array(N), d2 = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    let s1 = mat.A1[n] + mat.S12[n] + G1.leak[n], s2 = mat.A2[n] + G2.leak[n];
    for (let t = 0; t < 6; t++) { s1 += G1.C[n * 6 + t]; s2 += G2.C[n * 6 + t]; }
    d1[n] = s1; d2[n] = s2;
  }
  const p1 = fixedSource(G1, d1, target.map((v) => v / K_OUT));
  const p2 = fixedSource(G2, d2, mat.S12.map((v, n) => v * p1[n]));
  for (let n = 0; n < N; n++) {
    if (!target[n]) continue;
    const f = target[n] / (FUEL.F1 * p1[n] + FUEL.F2 * p2[n]);
    F1[n] = FUEL.F1 * f; F2[n] = FUEL.F2 * f;
  }
}
const zero = new Float64Array(N);
const out = solve(zero);
{
  const s = blockSums(out);
  let worst = 0, tot = 0, ttot = 0;
  for (let i = 0; i < s.length; i++) tot += s[i];
  const tb = new Float64Array(na * BINS);
  for (let k = REFL; k < REFL + NZC; k++) for (let q = 0; q < NQ; q++) {
    const a = nodeAsm[q];
    if (a >= 0) tb[a * BINS + Math.floor((k - REFL) / (NZC / BINS))] += target[k * NQ + q];
  }
  for (let i = 0; i < tb.length; i++) ttot += tb[i];
  for (let i = 0; i < s.length; i++) worst = Math.max(worst, Math.abs(s[i] / tot - tb[i] / ttot) / (tb[i] / ttot));
  const fr = F1.filter((v) => v > 0).map((v) => v / FUEL.F1);
  console.log(`rods out k = ${out.k.toFixed(5)} (${out.it} iterations) | worst misfit to Serpent shape ${(worst * 100).toFixed(2)} % | fission strength ${Math.min(...fr).toFixed(2)}-${Math.max(...fr).toFixed(2)}`);
}

// ---- 2. rod absorption from the all-rods-in worth ----
const pcm = (kIn) => (1 / kIn - 1 / out.k) * 1e5;
const rodded = (a) => groupOf[a] !== undefined;
const worthAll = (sig) => pcm(solve(rodAbs(sig, (a) => (rodded(a) ? H : 0)), out).k);
let s0 = 0.01, s1 = 0.04, w0 = worthAll(s0), w1 = worthAll(s1);
for (let i = 0; i < 15 && Math.abs(w1 - ROD_WORTH_PCM.ALL) > 5; i++) {
  const s2 = Math.exp(Math.log(s1) + (ROD_WORTH_PCM.ALL - w1) * (Math.log(s1) - Math.log(s0)) / (w1 - w0));
  s0 = s1; w0 = w1; s1 = Math.min(2, Math.max(1e-4, s2)); w1 = worthAll(s1);
  console.log(`  thermal rod absorption ${s1.toFixed(5)} /cm -> ${w1.toFixed(0)} pcm`);
}
const SIG = s1;
console.log(`all rods in: ${w1.toFixed(0)} pcm (Serpent ${ROD_WORTH_PCM.ALL})`);
for (const g of Object.keys(ROD_GROUPS)) {
  const kg = solve(rodAbs(SIG, (a) => (groupOf[a] === g ? H : 0)), out).k;
  console.log(`  ${g} alone: model ${pcm(kg).toFixed(0)} pcm, Serpent ${ROD_WORTH_PCM[g]}`);
}

// ---- 3. power ratios rodded / rods out, normalized to the same Serpent-weighted total ----
const base = blockSums(out);
const axialBin = Array.from({ length: BINS }, (_, b) => axialAt((b + 0.5) / BINS));
function ratios(sol) {
  const s = blockSums(sol), r = new Float64Array(na * BINS);
  let num = 0, den = 0;
  for (let a = 0; a < na; a++) for (let b = 0; b < BINS; b++) {
    const i = a * BINS + b;
    r[i] = s[i] / base[i];
    const wgt = powerOf[a] * axialBin[b];
    num += wgt * r[i]; den += wgt;
  }
  return r.map((v) => v * den / num);
}
function series(depths, depthOf) {
  const words = new Uint16Array(depths.length * na * BINS);
  let warm = out;
  depths.forEach((d, i) => {
    const sol = solve(rodAbs(SIG, (a) => depthOf(a, d)), warm);
    warm = sol;
    const r = ratios(sol);
    r.forEach((v, j) => { words[i * na * BINS + j] = Math.round(Math.min(65, v) * 1000); });
    const rod = [], free = [];
    for (let a = 0; a < na; a++) (depthOf(a, d) ? rod : free).push(...r.slice(a * BINS, a * BINS + BINS));
    const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;
    console.log(`  ${d} cm: k ${sol.k.toFixed(4)} | rodded assemblies mean ${mean(rod).toFixed(2)}, others ${mean(free).toFixed(2)} | max ${Math.max(...r).toFixed(2)}`);
  });
  return { depths, data: Buffer.from(words.buffer).toString('base64') };
}

const D1_START = 60;   // cm; shown value only, the FDR does not give the group or its start
console.log('all rods:');
const all = series([20, 40, 60, 80, 100, 120, 140, 160, 180, 200], (a, d) => (rodded(a) ? d : 0));
console.log('D1 only:');
const d1 = series([10, 20, 30, 40, 50, 60], (a, d) => (groupOf[a] === 'D1' ? d : 0));

writeFileSync(new URL('../data/rodshapes.js', import.meta.url), `// Generated by tools/rodshapes.mjs; do not edit by hand.
// How inserted control rods reshape the power. For each rod state: the ratio of rodded to
// rods-out power for every assembly (reading order, as in CORE) and 10 cm height bin (bottom
// to top), as unsigned 16-bit integers / 1000 in base64. From a two-group diffusion model of the
// core fitted to the Serpent radial power map and all-rods-in worth (16 303 pcm, FDR Table 16).
// depths: rod insertion from the top of the fuel, cm. d1Start: where the RIA replay starts the
// D1 group (shown value only; the FDR does not say which group or from where).
export const ROD_SHAPES = ${JSON.stringify({ bins: BINS, assemblies: na, d1Start: D1_START, all, d1 })};
`);
console.log('wrote data/rodshapes.js');
