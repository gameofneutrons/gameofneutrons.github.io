// Interactive 3D model of the TURKER core, built from the Serpent input data.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { CORE, ASSEMBLIES, ROD_GROUPS } from '../data/core.js';

const PIN_PITCH = 1.415;      // cm, rod pitch
const ASM_PITCH = 24.1416;    // cm, assembly pitch (Serpent core lattice)
const PIN_R = 0.475;          // cm, clad outer radius
const ROD_R = 0.43;           // cm, control rodlet
const H = 200;                // cm, active fuel height
const ROD_LIFT = H + 10;      // withdrawn rods sit above the core

const POOL = 0x0a2440;
const THORIUM = new THREE.Color(0x8cedab);
const U_LOW = new THREE.Color(0xe2be6e);   // 2.50 %
const U_HIGH = new THREE.Color(0x8c4e14);  // 4.60 %

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

export function initCore3D(canvas, { onPick, onPower } = {}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance',
      preserveDrawingBuffer: location.search.includes('shot'),
    });
  } catch (e) {
    canvas.dataset.err = String(e && e.message || e);
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(POOL, 1);
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(POOL, 650, 1500);

  const camera = new THREE.PerspectiveCamera(34, 1, 5, 4000);
  const target = new THREE.Vector3(0, 140, 0);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x0a2440, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(260, 520, 320);
  scene.add(sun);
  const cherenkovLight = new THREE.PointLight(0x6fd0ff, 0, 420, 1.6);
  cherenkovLight.position.set(0, 250, 0);
  scene.add(cherenkovLight);

  // ---- fuel pins and control rodlets ----
  const pinGeo = new THREE.CylinderGeometry(PIN_R, PIN_R, H, 8, 1);
  pinGeo.translate(0, H / 2, 0);
  const rodGeo = new THREE.CylinderGeometry(ROD_R, ROD_R, H, 6, 1);
  rodGeo.translate(0, H / 2, 0);

  const pins = [];      // {x, z, color, asm}
  const rods = [];      // {x, z}
  const asmList = [];   // {r, c, name, group}

  CORE.forEach((row, r) => row.forEach((name, c) => {
    if (!name) return;
    const a = ASSEMBLIES[name];
    const group = rodGroupAt(r, c);
    const asmIndex = asmList.length;
    asmList.push({ r, c, name, group });
    const ax = (c - 3) * ASM_PITCH;
    const az = (r - 3) * ASM_PITCH;
    const uColor = enrichmentColor(a.enr);
    a.grid.forEach((line, i) => {
      for (let j = 0; j < 17; j++) {
        const ch = line[j];
        const x = ax + (j - 8) * PIN_PITCH;
        const z = az + (i - 8) * PIN_PITCH;
        if (ch === 'U') pins.push({ x, z, color: uColor, asm: asmIndex });
        else if (ch === 'T') pins.push({ x, z, color: THORIUM, asm: asmIndex });
        else if (ch === 'G' && group) rods.push({ x, z });
      }
    });
  }));

  const pinMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
  const pinMesh = new THREE.InstancedMesh(pinGeo, pinMat, pins.length);
  const m = new THREE.Matrix4();
  pins.forEach((p, i) => {
    m.makeTranslation(p.x, 0, p.z);
    pinMesh.setMatrixAt(i, m);
    pinMesh.setColorAt(i, p.color);
  });
  pinMesh.instanceMatrix.needsUpdate = true;
  pinMesh.instanceColor.needsUpdate = true;
  scene.add(pinMesh);

  // Only the lower 90 cm of a withdrawn rod is drawn; the rest would hide the core.
  const rodMat = new THREE.MeshStandardMaterial({
    color: 0xb9c3cf, roughness: 0.35, metalness: 0.6,
    clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), H + 90)],
  });
  const rodMesh = new THREE.InstancedMesh(rodGeo, rodMat, rods.length);
  function placeRods(lift) {
    rods.forEach((p, i) => {
      m.makeTranslation(p.x, lift, p.z);
      rodMesh.setMatrixAt(i, m);
    });
    rodMesh.instanceMatrix.needsUpdate = true;
  }
  placeRods(ROD_LIFT);
  scene.add(rodMesh);

  // ---- beryllium reflector (r 94.5 to 114.5 cm) and lower plate ----
  const beMat = new THREE.MeshStandardMaterial({
    color: 0xcfc3e2, transparent: true, opacity: 0.1, roughness: 0.8,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const beH = 221.045;
  const beOuter = new THREE.Mesh(new THREE.CylinderGeometry(114.5, 114.5, beH, 96, 1, true), beMat);
  const beTop = new THREE.Mesh(new THREE.RingGeometry(94.5, 114.5, 96), beMat.clone());
  beTop.material.opacity = 0.3;
  beTop.rotation.x = -Math.PI / 2;
  beOuter.position.y = H / 2;
  beTop.position.y = H / 2 + beH / 2;
  scene.add(beOuter, beTop);

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(116, 116, 6, 96),
    new THREE.MeshBasicMaterial({ color: 0x102f52 })
  );
  plate.position.y = -14;
  scene.add(plate);

  // ---- Cherenkov glow ----
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0x7fd8ff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(300, 300, 1);
  glow.position.set(0, H + 2, 0);
  scene.add(glow);

  // ---- controls ----
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 240;
  controls.maxDistance = 1100;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.45;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.55;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function placeCamera() {
    // Fit a sphere around core, reflector and the visible rod ends into the view.
    const aspect = camera.aspect || 1;
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * aspect);
    const dist = 0.88 * 190 / Math.sin(Math.min(vf, hf));
    const polar = 0.86, az = 0.62;
    camera.position.set(
      target.x + dist * Math.sin(polar) * Math.sin(az),
      target.y + dist * Math.cos(polar),
      target.z + dist * Math.sin(polar) * Math.cos(az)
    );
    camera.lookAt(target);
    controls.update();
  }
  fit();
  placeCamera();
  new ResizeObserver(() => { fit(); }).observe(canvas);

  // ---- picking ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  let highlighted = -1;
  const WHITE = new THREE.Color(0xffffff);

  function highlight(asmIndex) {
    if (highlighted === asmIndex) return;
    pins.forEach((p, i) => {
      if (p.asm === highlighted) pinMesh.setColorAt(i, p.color);
      if (p.asm === asmIndex) pinMesh.setColorAt(i, p.color.clone().lerp(WHITE, 0.45));
    });
    pinMesh.instanceColor.needsUpdate = true;
    highlighted = asmIndex;
  }

  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
    down = null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(pinMesh, false)[0];
    if (hit && hit.instanceId !== undefined) {
      const a = asmList[pins[hit.instanceId].asm];
      highlight(pins[hit.instanceId].asm);
      onPick && onPick(a.r, a.c);
    } else {
      highlight(-1);
      onPick && onPick(null, null);
    }
  });

  function select(r, c) {
    const idx = asmList.findIndex((a) => a.r === r && a.c === c);
    highlight(idx);
  }

  // ---- SCRAM ----
  // Rods fall under gravity; power follows the RIA result: down to decay heat (6 %).
  let power = 1;
  let anim = null;
  const DECAY = 0.06;

  function setPower(p) {
    power = p;
    glow.material.opacity = 0.05 + 0.6 * p;
    glow.scale.setScalar(180 + 150 * p);
    cherenkovLight.intensity = 9000 * p;
    onPower && onPower(p);
  }
  setPower(1);

  function scram() {
    if (anim) return;
    if (reduceMotion) { placeRods(0); setPower(DECAY); return; }
    const t0 = performance.now();
    const fall = 1.25;  // s
    anim = (now) => {
      const t = (now - t0) / 1000;
      const f = Math.min(1, t / fall);
      placeRods(ROD_LIFT * (1 - f * f));
      // prompt drop while rods enter, then slower decay toward decay heat
      const p = f < 1 ? 1 - 0.55 * f * f : DECAY + (0.45 - DECAY) * Math.exp(-(t - fall) / 0.9);
      setPower(Math.max(DECAY, p));
      if (t > fall + 5) { setPower(DECAY); anim = null; }
    };
  }

  function withdraw() {
    if (anim) return;
    if (reduceMotion) { placeRods(ROD_LIFT); setPower(1); return; }
    const t0 = performance.now();
    const dur = 2.2;
    const p0 = power;
    anim = (now) => {
      const f = Math.min(1, (now - t0) / 1000 / dur);
      const e = f * f * (3 - 2 * f);
      placeRods(ROD_LIFT * e);
      setPower(p0 + (1 - p0) * e);
      if (f >= 1) anim = null;
    };
  }

  controls.update();
  renderer.render(scene, camera);

  // ---- loop, paused when the hero is off screen ----
  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.01 }).observe(canvas);

  renderer.setAnimationLoop((now) => {
    if (!visible || document.hidden) return;
    if (anim) anim(now);
    controls.update();
    renderer.render(scene, camera);
  });

  // Screenshot helper for local checks (?shot): headless browsers do not capture WebGL,
  // so copy the first frame into an image. No effect on normal visits.
  if (location.search.includes('shot')) {
    const q = new URLSearchParams(location.search);
    if (q.get('state') === 'scram') { placeRods(0); setPower(DECAY); }
    if (q.get('pick')) { const [pr, pc] = q.get('pick').split(',').map(Number); select(pr, pc); }
    controls.update();
    renderer.render(scene, camera);
    const im = new Image();
    im.src = canvas.toDataURL();
    im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    canvas.after(im);
  }

  return { scram, withdraw, select, get power() { return power; }, get animating() { return !!anim; } };
}
