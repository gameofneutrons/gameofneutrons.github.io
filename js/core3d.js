// Interactive 3D model of the TURKER core, built from the Serpent input data.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { CORE, ASSEMBLIES, ROD_GROUPS, POWER } from '../data/core.js';
import { axialAt, RIA_POWER, RIA_EVENTS, DECAY_HEAT, powerAt } from '../data/transients.js';
import { ROD_SHAPES } from '../data/rodshapes.js';

const PIN_PITCH = 1.415;      // cm, rod pitch
const ASM_PITCH = 24.1416;    // cm, assembly pitch (Serpent core lattice)
const PIN_R = 0.475;          // cm, clad outer radius
const ROD_R = 0.43;           // cm, control rodlet
const H = 200;                // cm, active fuel height
const ROD_LIFT = H + 10;      // withdrawn rods sit above the core
const ROD_SHOWN = 90;         // only the lower 90 cm of a withdrawn rod is drawn
const FALL = RIA_EVENTS.rodsIn - RIA_EVENTS.trip;  // s, trip to rods fully in (FDR Table 30)

const THORIUM = new THREE.Color(0x8cedab);
const U_LOW = new THREE.Color(0xe2be6e);   // 2.50 %
const U_HIGH = new THREE.Color(0x8c4e14);  // 4.60 %

// Heat colours for the power view, low to high. Same stops as the legend in css.
export const HEAT_STOPS = ['#0d2a5c', '#1f78c8', '#5fd3d0', '#ffd166', '#ff6b3d'];
// Colour scale on the square root of local power (relative to the nominal core average), so that
// decay heat after a SCRAM still shows its shape. Nominal UO2 range: 0.29 to 1.03 × 1.471.
const P_MIN = 0.01, P_MAX = 1.03 * 1.471;
const D1_START = ROD_SHAPES.d1Start;  // cm; where the RIA replay puts the D1 group (shown value)

export function enrichmentColor(enr) {
  const t = Math.min(1, Math.max(0, (enr - 2.5) / (4.6 - 2.5)));
  return U_LOW.clone().lerp(U_HIGH, t);
}

function rodGroupAt(r, c) {
  for (const [g, list] of Object.entries(ROD_GROUPS)) {
    if (list.some(([rr, cc]) => rr === r && cc === c)) return g;
  }
  return null;
}

// A cylinder without its bottom cap. The camera never goes below the core, so those
// triangles are never seen; CylinderGeometry adds the bottom cap as its last group.
function withoutBottomCap(geo) {
  const bottom = geo.groups[2];
  geo.setIndex(Array.from(geo.index.array.subarray(0, bottom.start)));
  geo.clearGroups();
  return geo;
}

function glowTexture() {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(160,225,255,0.9)');
  grd.addColorStop(0.35, 'rgba(90,190,255,0.35)');
  grd.addColorStop(1, 'rgba(60,150,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Axial power shape as a small texture the pin shader can sample (value / 1.5 in 0..255).
function axialTexture() {
  const n = 128, data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.round(Math.min(1, axialAt(i / (n - 1)) / 1.5) * 255);
  const tex = new THREE.DataTexture(data, n, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Rod-state power shapes (data/rodshapes.js): for each insertion depth, the ratio of rodded to
// rods-out power per assembly and 10 cm height bin. Depth 0 (rods out) is all ones.
function decodeSeries({ depths, data }) {
  const bin = atob(data), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const words = new Uint16Array(bytes.buffer);
  const size = ROD_SHAPES.assemblies * ROD_SHAPES.bins;
  const states = [{ d: 0, r: new Float32Array(size).fill(1) }];
  depths.forEach((d, i) => states.push({ d, r: Float32Array.from(words.subarray(i * size, (i + 1) * size), (v) => v / 1000) }));
  return states;
}
function shapeAt(states, d, out) {
  let i = 1;
  while (i < states.length - 1 && states[i].d < d) i++;
  const a = states[i - 1], b = states[i];
  const f = Math.min(1, Math.max(0, (d - a.d) / (b.d - a.d)));
  for (let j = 0; j < out.length; j++) out[j] = a.r[j] + (b.r[j] - a.r[j]) * f;
}

function heatGLSL() {
  const c = HEAT_STOPS.map((h) => { const k = new THREE.Color(h); return `vec3(${k.r.toFixed(4)}, ${k.g.toFixed(4)}, ${k.b.toFixed(4)})`; });
  return `
  vec3 heat(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.25) return mix(${c[0]}, ${c[1]}, t / 0.25);
    if (t < 0.5) return mix(${c[1]}, ${c[2]}, (t - 0.25) / 0.25);
    if (t < 0.75) return mix(${c[2]}, ${c[3]}, (t - 0.5) / 0.25);
    return mix(${c[3]}, ${c[4]}, (t - 0.75) / 0.25);
  }`;
}

export function initCore3D(canvas, { onPick, onHover, onPower, onRia, onBusy, onAwake } = {}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.dataset.err = String(e && e.message || e);
    return null;
  }
  // Phones start with fewer pixels: their screens are dense enough that 1.5× still looks sharp,
  // and their GPUs are far slower. The render loop lowers this further if frames arrive late.
  const coarse = matchMedia('(pointer: coarse)').matches;
  let pixelRatio = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  // Phones also get a lighter model. A pin is one or two pixels wide there, so a 4-sided pin
  // looks the same as an 8-sided one, and Lambert shading costs far less than PBR on 9768 pins.
  // ?lite=1 or ?lite=0 in the address forces either way, for testing.
  const liteParam = new URLSearchParams(location.search).get('lite');
  const lite = liteParam ? liteParam === '1' : coarse;
  const Shaded = lite ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const pbr = (params) => (lite ? {} : params);
  renderer.setClearColor(0x000000, 0);  // the hero background shows through
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a2440, 650, 1500);

  const camera = new THREE.PerspectiveCamera(34, 1, 5, 4000);
  const target = new THREE.Vector3(0, 138, 0);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x0a2440, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(260, 520, 320);
  scene.add(sun);
  const cherenkovLight = new THREE.PointLight(0x6fd0ff, 0, 420, 1.6);
  cherenkovLight.position.set(0, 250, 0);
  scene.add(cherenkovLight);

  // ---- assemblies, pins and control rodlets ----
  const pins = [];      // {x, z, color, asm}
  const rods = [];      // {x, z, asm}
  const asmList = [];   // {r, c, name, group, x, z}

  CORE.forEach((row, r) => row.forEach((name, c) => {
    if (!name) return;
    const a = ASSEMBLIES[name];
    const group = rodGroupAt(r, c);
    const asmIndex = asmList.length;
    const ax = (c - 3) * ASM_PITCH;
    const az = (r - 3) * ASM_PITCH;
    asmList.push({ r, c, name, group, x: ax, z: az, power: POWER[r][c] });
    const uColor = enrichmentColor(a.enr);
    a.grid.forEach((line, i) => {
      for (let j = 0; j < 17; j++) {
        const ch = line[j];
        const x = ax + (j - 8) * PIN_PITCH;
        const z = az + (i - 8) * PIN_PITCH;
        if (ch === 'U') pins.push({ x, z, color: uColor, asm: asmIndex, th: false });
        else if (ch === 'T') pins.push({ x, z, color: THORIUM, asm: asmIndex, th: true });
        else if (ch === 'G' && group) rods.push({ x, z, asm: asmIndex });
      }
    });
  }));
  const inCut = (x, z) => x > 0.5 && z > 0.5;   // the quarter removed in the cutaway view

  // Fuel pins. The power view blends each pin towards a heat colour for its local power:
  // assembly power × axial shape (Serpent, rods out) × the rod-state multiplier (uShape).
  // ThO2 pins make almost no power at the start of the cycle.
  const pinGeo = withoutBottomCap(new THREE.CylinderGeometry(PIN_R, PIN_R, H, lite ? 4 : 8, 1));
  pinGeo.translate(0, H / 2, 0);
  const pow = new Float32Array(pins.length);
  pins.forEach((p, i) => { pow[i] = p.th ? 0 : asmList[p.asm].power; });
  pinGeo.setAttribute('aPow', new THREE.InstancedBufferAttribute(pow, 1));
  pinGeo.setAttribute('aAsm', new THREE.InstancedBufferAttribute(Float32Array.from(pins, (p) => p.asm), 1));

  // Local power multiplier per assembly and height bin: decay heat keeps the rods-out shape
  // (it comes from fission products already made), fission power follows the rods.
  const SHAPES = { all: decodeSeries(ROD_SHAPES.all), d1: decodeSeries(ROD_SHAPES.d1) };
  const ratio = new Float32Array(ROD_SHAPES.assemblies * ROD_SHAPES.bins);
  const shapeData = new Uint16Array(ratio.length);
  const shapeTex = new THREE.DataTexture(shapeData, ROD_SHAPES.bins, ROD_SHAPES.assemblies, THREE.RedFormat, THREE.HalfFloatType);
  shapeTex.minFilter = shapeTex.magFilter = THREE.LinearFilter;
  shapeTex.wrapS = shapeTex.wrapT = THREE.ClampToEdgeWrapping;

  const uniforms = {
    uMix: { value: 0 },
    uAxial: { value: axialTexture() },
    uRange: { value: new THREE.Vector2(Math.sqrt(P_MIN), Math.sqrt(P_MAX)) },
    uShape: { value: shapeTex },
    uAsmN: { value: ROD_SHAPES.assemblies },
  };
  const pinMat = new Shaded(pbr({ roughness: 0.55, metalness: 0.05 }));
  pinMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'attribute float aPow;\nattribute float aAsm;\nvarying float vPow;\nvarying float vAsm;\nvarying float vZ;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  vPow = aPow;\n  vAsm = aAsm;\n  vZ = position.y / ${H.toFixed(1)};`);
    shader.fragmentShader = 'uniform float uMix;\nuniform sampler2D uAxial;\nuniform sampler2D uShape;\nuniform float uAsmN;\nuniform vec2 uRange;\nvarying float vPow;\nvarying float vAsm;\nvarying float vZ;\n' + heatGLSL() + '\n' +
      shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
  float zf = clamp(vZ, 0.0, 1.0);
  float axialP = texture2D(uAxial, vec2(zf, 0.5)).r * 1.5;
  float localP = vPow * axialP * texture2D(uShape, vec2(zf, (vAsm + 0.5) / uAsmN)).r;
  float heatT = vPow > 0.0 ? (sqrt(max(localP, 0.0)) - uRange.x) / (uRange.y - uRange.x) : 0.0;
  vec3 heatC = heat(heatT);
  diffuseColor.rgb = mix(diffuseColor.rgb, heatC, uMix);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += heatC * (0.15 + 0.55 * clamp(heatT, 0.0, 1.0)) * uMix;`);
  };
  pinMat.customProgramCacheKey = () => 'turker-pin';

  const pinMesh = new THREE.InstancedMesh(pinGeo, pinMat, pins.length);
  const m = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  pins.forEach((p, i) => pinMesh.setColorAt(i, p.color));
  pinMesh.instanceColor.needsUpdate = true;
  scene.add(pinMesh);

  // Control rodlets and the spider head that holds each cluster.
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), H + ROD_SHOWN);
  const rodMat = new THREE.MeshStandardMaterial({ color: 0xb9c3cf, roughness: 0.35, metalness: 0.6, clippingPlanes: [clip] });
  const rodGeo = new THREE.CylinderGeometry(ROD_R, ROD_R, H, 6, 1);
  rodGeo.translate(0, H / 2, 0);
  const rodMesh = new THREE.InstancedMesh(rodGeo, rodMat, rods.length);
  scene.add(rodMesh);

  const rodded = asmList.filter((a) => a.group);
  const spiderMat = new THREE.MeshStandardMaterial({ color: 0xd5dde6, roughness: 0.3, metalness: 0.7, clippingPlanes: [clip] });
  const hubGeo = new THREE.CylinderGeometry(1.8, 1.8, 12, 16);
  hubGeo.translate(0, 6, 0);
  const armGeo = new THREE.BoxGeometry(17 * PIN_PITCH * 0.72, 1.4, 1.4);
  armGeo.translate(0, 9, 0);
  const hubMesh = new THREE.InstancedMesh(hubGeo, spiderMat, rodded.length);
  const armMeshA = new THREE.InstancedMesh(armGeo, spiderMat, rodded.length);
  const armMeshB = new THREE.InstancedMesh(armGeo, spiderMat, rodded.length);
  scene.add(hubMesh, armMeshA, armMeshB);

  let cut = false;
  let lift = ROD_LIFT, liftD1 = ROD_LIFT;   // rod tip heights; the D1 group can move on its own
  const rot = new THREE.Matrix4();
  const yOf = (asm, y, yD1) => (asmList[asm].group === 'D1' ? yD1 : y);
  function placePins() {
    pins.forEach((p, i) => pinMesh.setMatrixAt(i, cut && inCut(p.x, p.z) ? hidden : m.makeTranslation(p.x, 0, p.z)));
    pinMesh.instanceMatrix.needsUpdate = true;
  }
  function placeRods(y, yD1 = y) {
    lift = y;
    liftD1 = yD1;
    rods.forEach((p, i) => rodMesh.setMatrixAt(i, cut && inCut(p.x, p.z) ? hidden : m.makeTranslation(p.x, yOf(p.asm, y, yD1), p.z)));
    rodMesh.instanceMatrix.needsUpdate = true;
    rodded.forEach((a, i) => {
      const off = cut && inCut(a.x, a.z);
      const top = (a.group === 'D1' ? yD1 : y) + H;
      hubMesh.setMatrixAt(i, off ? hidden : m.makeTranslation(a.x, top, a.z));
      armMeshA.setMatrixAt(i, off ? hidden : m.makeTranslation(a.x, top, a.z).multiply(rot.makeRotationY(Math.PI / 4)));
      armMeshB.setMatrixAt(i, off ? hidden : m.makeTranslation(a.x, top, a.z).multiply(rot.makeRotationY(-Math.PI / 4)));
    });
    hubMesh.instanceMatrix.needsUpdate = armMeshA.instanceMatrix.needsUpdate = armMeshB.instanceMatrix.needsUpdate = true;
  }
  placePins();
  placeRods(ROD_LIFT);

  // ---- beryllium reflector (r 94.5 to 114.5 cm) and lower plate ----
  const beMat = new Shaded({
    color: 0xcfc3e2, transparent: true, opacity: 0.1, ...pbr({ roughness: 0.8 }),
    side: THREE.DoubleSide, depthWrite: false,
  });
  const beTopMat = beMat.clone();
  beTopMat.opacity = 0.3;
  const beH = 221.045;
  const beFull = [new THREE.CylinderGeometry(114.5, 114.5, beH, 96, 1, true), new THREE.RingGeometry(94.5, 114.5, 96)];
  // cutaway: leave out the quarter that faces x > 0, z > 0
  const beCut = [new THREE.CylinderGeometry(114.5, 114.5, beH, 72, 1, true, Math.PI / 2, 1.5 * Math.PI), new THREE.RingGeometry(94.5, 114.5, 72, 1, 0, 1.5 * Math.PI)];
  const beOuter = new THREE.Mesh(beFull[0], beMat);
  const beTop = new THREE.Mesh(beFull[1], beTopMat);
  beTop.rotation.x = -Math.PI / 2;
  beOuter.position.y = H / 2;
  beTop.position.y = H / 2 + beH / 2;
  scene.add(beOuter, beTop);

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(116, 116, 6, 96), new THREE.MeshBasicMaterial({ color: 0x102f52 }));
  plate.position.y = -14;
  scene.add(plate);

  // ---- Cherenkov glow ----
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0x7fd8ff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.position.set(0, H + 2, 0);
  scene.add(glow);

  // ---- selection and hover boxes; invisible assembly boxes make picking cheap ----
  const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(ASM_PITCH, H, ASM_PITCH));
  boxEdges.translate(0, H / 2, 0);
  const selBox = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.95 }));
  const hovBox = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
  selBox.visible = hovBox.visible = false;
  scene.add(selBox, hovBox);

  const pickMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(ASM_PITCH, H, ASM_PITCH).translate(0, H / 2, 0), new THREE.MeshBasicMaterial(), asmList.length);
  pickMesh.visible = false;
  function placePick() {
    asmList.forEach((a, i) => pickMesh.setMatrixAt(i, cut && a.x > 1 && a.z > 1 ? hidden : m.makeTranslation(a.x, 0, a.z)));
    pickMesh.instanceMatrix.needsUpdate = true;
    pickMesh.computeBoundingSphere();
  }
  placePick();
  scene.add(pickMesh);

  // ---- controls ----
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;  // the wheel scrolls the page; Ctrl/Cmd + wheel zooms (below)
  controls.minDistance = 240;
  controls.maxDistance = 1100;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.45;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.55;
  controls.addEventListener('start', () => { controls.autoRotate = false; tween = null; });
  // OrbitControls blocks every touch gesture on the canvas. On phones the model therefore
  // starts parked: swipes scroll the page and a tap wakes it, after which it turns freely and
  // the page stays put. A tap outside the stage, or scrolling it out of view, parks it again.
  // Elsewhere vertical swipes keep scrolling the page.
  const stageEl = canvas.closest('.stage') || canvas.parentElement;
  let awake = !coarse;
  function setAwake(on) {
    if (!coarse || on === awake) return;
    awake = on;
    controls.enabled = on;
    canvas.style.touchAction = on ? 'none' : 'auto';
    onAwake && onAwake(on);
  }
  controls.enabled = awake;
  canvas.style.touchAction = coarse ? 'auto' : 'pan-y';
  if (coarse && onAwake) onAwake(false);
  document.addEventListener('pointerdown', (e) => { if (awake && !stageEl.contains(e.target)) setAwake(false); });

  canvas.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const dir = camera.position.clone().sub(controls.target);
    const len = THREE.MathUtils.clamp(dir.length() * Math.exp(e.deltaY * 0.002), controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(dir.setLength(len));
    controls.autoRotate = false;
  }, { passive: false });

  let baseDist = 600;
  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * camera.aspect);
    baseDist = 0.92 * 192 / Math.sin(Math.min(vf, hf));
  }
  function setView(polar, az, dist) {
    camera.position.set(
      target.x + dist * Math.sin(polar) * Math.sin(az),
      target.y + dist * Math.cos(polar),
      target.z + dist * Math.sin(polar) * Math.cos(az)
    );
    camera.lookAt(target);
  }
  fit();
  setView(0.95, 0.62, baseDist);
  controls.update();
  new ResizeObserver(() => fit()).observe(canvas);

  // Smoothly turn the camera to a given angle (used to face the cutaway).
  let tween = null;
  const sph = new THREE.Spherical();
  function turnTo(polar, az) {
    const off = camera.position.clone().sub(controls.target);
    sph.setFromVector3(off);
    let dAz = az - sph.theta;
    dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
    const from = { p: sph.phi, a: sph.theta, r: sph.radius };
    if (reduceMotion) { setView(polar, az, from.r); return; }
    const t0 = performance.now();
    tween = (now) => {
      const f = Math.min(1, (now - t0) / 900);
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      setView(from.p + (polar - from.p) * e, from.a + dAz * e, from.r);
      if (f >= 1) tween = null;
    };
    controls.autoRotate = false;
  }

  // ---- picking ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitAt(x, y) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(pickMesh, false)[0];
    return hit ? hit.instanceId : -1;
  }
  function boxAt(box, idx) {
    if (idx < 0) { box.visible = false; return; }
    box.position.set(asmList[idx].x, 0, asmList[idx].z);
    box.visible = true;
  }

  let selected = -1;
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
    down = null;
    if (!awake) { setAwake(true); return; }  // the first tap only wakes the model
    selected = hitAt(e.clientX, e.clientY);
    boxAt(selBox, selected);
    const a = asmList[selected];
    onPick && onPick(a ? a.r : null, a ? a.c : null);
  });

  let hoverXY = null, hovered = -1;
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !down) hoverXY = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerleave', () => {
    hoverXY = null; hovered = -1; hovBox.visible = false;
    onHover && onHover(null);
  });
  function updateHover() {
    if (!hoverXY) return;
    const [x, y] = hoverXY;
    hoverXY = null;
    const idx = hitAt(x, y);
    if (idx !== hovered) { hovered = idx; boxAt(hovBox, idx === selected ? -1 : idx); }
    const a = asmList[idx];
    const rect = canvas.getBoundingClientRect();
    onHover && onHover(a ? { r: a.r, c: a.c, x: x - rect.left, y: y - rect.top } : null);
    canvas.style.cursor = a ? 'pointer' : '';
  }

  function select(r, c) {
    selected = asmList.findIndex((a) => a.r === r && a.c === c);
    boxAt(selBox, selected);
  }

  // ---- view modes ----
  let mix = 0, mixTarget = 0;
  function setMode(mode) { mixTarget = mode === 'power' ? 1 : 0; if (reduceMotion) mix = mixTarget; }
  function setCut(on) {
    cut = on;
    beOuter.geometry = on ? beCut[0] : beFull[0];
    beTop.geometry = on ? beCut[1] : beFull[1];
    placePins();
    placeRods(lift, liftD1);
    placePick();
    if (selected >= 0 && cut && asmList[selected].x > 1 && asmList[selected].z > 1) boxAt(selBox, -1);
    if (on) turnTo(0.98, Math.PI / 4);
  }

  // ---- power, SCRAM and the RIA replay ----
  let power = 1;
  let state = 'Nominal işletme';
  let anim = null;
  // Rod insertion depth (cm from the top of the fuel) for a tip height.
  const depthOf = (y) => Math.min(H, Math.max(0, H - y));
  function updateShape() {
    const dAll = depthOf(lift), dD1 = depthOf(liftD1);
    if (dAll > 0) shapeAt(SHAPES.all, dAll, ratio);
    else if (dD1 > 0) shapeAt(SHAPES.d1, dD1, ratio);
    else ratio.fill(1);
    const dec = Math.min(power, DECAY_HEAT), fis = power - dec;
    for (let j = 0; j < ratio.length; j++) shapeData[j] = THREE.DataUtils.toHalfFloat(dec + fis * ratio[j]);
    shapeTex.needsUpdate = true;
  }

  function setPower(p, st) {
    power = p;
    if (st) state = st;
    updateShape();
    const g = Math.min(p, 1.4);
    glow.material.opacity = (0.05 + 0.55 * g) * (1 - 0.45 * mix);
    glow.scale.setScalar(180 + 150 * g);
    cherenkovLight.intensity = 9000 * g;
    onPower && onPower(p, state);
  }
  setPower(1);

  // After a trip, power follows the RIA curve's shape from its peak down to decay heat.
  const TRIP_P = powerAt(RIA_POWER, RIA_EVENTS.trip);
  function afterTrip(dt, from) {
    const shape = (powerAt(RIA_POWER, RIA_EVENTS.trip + dt) - DECAY_HEAT) / (TRIP_P - DECAY_HEAT);
    return DECAY_HEAT + (from - DECAY_HEAT) * Math.max(0, shape);
  }
  const rodY = (dt) => ROD_LIFT * (1 - Math.min(1, Math.pow(Math.max(0, dt) / FALL, 2)));
  const busy = (b) => onBusy && onBusy(b);

  function scram() {
    if (anim) return;
    if (reduceMotion) { placeRods(0); setPower(DECAY_HEAT, 'Bozunma ısısı'); return; }
    const t0 = performance.now();
    const p0 = power;
    busy(true);
    anim = (now) => {
      const t = (now - t0) / 1000;
      placeRods(rodY(t));
      const done = t > RIA_EVENTS.decay - RIA_EVENTS.trip;
      setPower(done ? DECAY_HEAT : afterTrip(t, p0), done ? 'Bozunma ısısı' : t < FALL ? 'SCRAM: çubuklar kora düşüyor' : 'Güç bozunma ısısına iniyor');
      if (done) { anim = null; busy(false); }
    };
  }

  // Back to the start of the demo: rods out, nominal power. (A real restart takes hours.)
  function reset() {
    if (anim) return;
    if (reduceMotion) { placeRods(ROD_LIFT); setPower(1, 'Nominal işletme'); return; }
    const t0 = performance.now();
    const p0 = power, y0 = lift, y1 = liftD1;
    busy(true);
    anim = (now) => {
      const f = Math.min(1, (now - t0) / 1000 / 1.6);
      const e = f * f * (3 - 2 * f);
      placeRods(y0 + (ROD_LIFT - y0) * e, y1 + (ROD_LIFT - y1) * e);
      setPower(p0 + (1 - p0) * e, f >= 1 ? 'Nominal işletme' : 'Başa alınıyor');
      if (f >= 1) { anim = null; busy(false); }
    };
  }

  // Replays the RIA case from its COBRA-TF power table, 2.5 times faster than real time.
  // The FDR does not say which group is withdrawn or from where: D1 at D1_START is shown.
  const RIA_END = 22, RIA_SPEED = 2.5;
  const D1_Y0 = H - D1_START;
  function d1Y(t) {
    const { withdrawal, trip } = RIA_EVENTS;
    if (t < 2) { const f = t / 2; return ROD_LIFT + (D1_Y0 - ROD_LIFT) * f * f * (3 - 2 * f); }
    if (t < withdrawal) return D1_Y0;
    if (t < trip) return D1_Y0 + (ROD_LIFT - D1_Y0) * (t - withdrawal) / (trip - withdrawal);
    return rodY(t - trip);
  }
  function riaState(t) {
    if (t < RIA_EVENTS.withdrawal) return 'Kararlı işletme, D1 grubu kısmen içeride';
    if (t < RIA_EVENTS.limit) return 'D1 grubu kontrolsüz çekiliyor';
    if (t < RIA_EVENTS.trip) return '%120 sınırı aşıldı: trip sinyali, 2 s gecikme';
    if (t < RIA_EVENTS.rodsIn) return 'SCRAM: çubuklar kora düşüyor';
    if (t < RIA_EVENTS.decay) return 'Güç bozunma ısısına iniyor';
    return 'Bozunma ısısı, DHRS soğutuyor';
  }
  function ria() {
    if (anim) return;
    const show = (t) => {
      placeRods(rodY(t - RIA_EVENTS.trip), d1Y(t));
      const p = powerAt(RIA_POWER, t);
      setPower(p, riaState(t));
      onRia && onRia(t, p);
    };
    if (reduceMotion) { show(RIA_END); return; }
    placeRods(ROD_LIFT);
    const t0 = performance.now();
    busy(true);
    anim = (now) => {
      const t = Math.min(RIA_END, ((now - t0) / 1000) * RIA_SPEED);
      show(t);
      if (t >= RIA_END) { anim = null; busy(false); }
    };
  }

  // ---- loop, paused when the hero is off screen ----
  // Phones are capped at 60 fps (a 120 Hz phone would otherwise draw twice as often); computers
  // draw at their screen's rate. Motion is time-based, so the model turns at the same speed at
  // any frame rate. If frames keep arriving late (below ~42 fps), the view drops to fewer
  // pixels, a quarter step at a time.
  const FRAME_MS = coarse ? 1000 / 62 : 0;  // just under 1/60 s, so 60 Hz screens never skip a frame
  const SLOW_MS = 24;
  let visible = true;
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (!visible) setAwake(false);
  }, { threshold: 0.01 }).observe(canvas);

  let frames = 0, slow = 0, warmup = 60;
  function adaptResolution(gap) {
    if (warmup > 0) { warmup--; return; }  // skip shader compiles and resumes
    frames++;
    if (gap > SLOW_MS) slow++;
    if (frames < 60) return;
    if (slow > 20 && pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      warmup = 30;
    }
    frames = slow = 0;
  }

  // ?fps in the address shows the frame rate and pixel ratio, for testing on phones.
  let fpsBox = null, fpsN = 0, fpsT = performance.now();
  if (/[?&]fps\b/.test(location.search)) {
    fpsBox = document.createElement('div');
    fpsBox.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.75);color:#fff;font:12px/1.4 monospace';
    document.body.append(fpsBox);
  }

  let lastTick = performance.now(), lastFrame = lastTick, budget = 0;
  renderer.setAnimationLoop((now) => {
    if (!visible || document.hidden) { lastTick = lastFrame = now; budget = 0; warmup = 30; return; }
    budget += now - lastTick;
    lastTick = now;
    if (budget < FRAME_MS) return;
    budget = Math.min(budget - FRAME_MS, FRAME_MS);
    const gap = now - lastFrame;
    lastFrame = now;
    const dt = Math.min(0.1, gap / 1000);
    adaptResolution(gap);
    if (mix !== mixTarget) {
      mix += Math.sign(mixTarget - mix) * Math.min(Math.abs(mixTarget - mix), dt * 2.5);
      uniforms.uMix.value = mix;
      setPower(power);
    }
    if (anim) anim(now);
    if (tween) tween(now);
    updateHover();
    controls.update(dt);
    renderer.render(scene, camera);
    if (fpsBox && (++fpsN, now - fpsT >= 1000)) {
      fpsBox.textContent = `${Math.round(fpsN * 1000 / (now - fpsT))} fps · ${pixelRatio}×`;
      fpsN = 0; fpsT = now;
    }
  });

  return {
    scram, reset, ria, select, setMode, setCut,
    get power() { return power; },
    get animating() { return !!anim; },
    get rodsIn() { return lift < ROD_LIFT / 2; },
  };
}
