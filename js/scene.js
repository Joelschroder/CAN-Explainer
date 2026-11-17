// 3D-scenen: lastbilen, närbilden på kabeln och arbetsbänken med dosan.
// Allt byggs av enkla primitiver. Etiketter är vanliga HTML-element som följer med 3D-punkterna.

import * as THREE from '../vendor/three.module.min.js';
import { NODES, BUSES, WIRES, MESSAGES } from './data.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const UP = new THREE.Vector3(0, 1, 0);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createWorld(stage) {
  const canvas = stage.querySelector('canvas');
  const labelLayer = stage.querySelector('.labels');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const styles = getComputedStyle(document.documentElement);
  const token = (name) => new THREE.Color(styles.getPropertyValue(name).trim() || '#ffffff');
  const C = {
    xray: token('--xray'),
    ecu: token('--ecu'),
    grid: token('--grid'),
    muted: token('--muted'),
    canH: token('--can-h'),
    canL: token('--can-l'),
    bad: token('--bad'),
    fg: token('--fg'),
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(-4, 9, 6);
  scene.add(sun);

  const groups = { truck: new THREE.Group(), wire: new THREE.Group(), bench: new THREE.Group() };
  Object.values(groups).forEach((g) => scene.add(g));
  const pulseLayer = new THREE.Group();
  scene.add(pulseLayer);

  // ---------- byggstenar ----------

  function xbox(w, h, d, pos, { color = C.xray, fill = 0.07, line = 0.5 } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fill, depthWrite: false })));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color, transparent: true, opacity: line })));
    g.position.copy(V(pos));
    return g;
  }

  function xcyl(r, len, pos, axis = 'z', { color = C.xray, fill = 0.07, line = 0.5 } = {}) {
    const geo = new THREE.CylinderGeometry(r, r, len, 28);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fill, depthWrite: false })));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 40), new THREE.LineBasicMaterial({ color, transparent: true, opacity: line })));
    if (axis === 'z') g.rotation.x = Math.PI / 2;
    if (axis === 'x') g.rotation.z = Math.PI / 2;
    g.position.copy(V(pos));
    return g;
  }

  function tube(a, b, r, material) {
    const d = b.clone().sub(a);
    const len = d.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), material);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, d.normalize());
    return mesh;
  }

  function polyTube(points, r, material) {
    const g = new THREE.Group();
    for (let i = 1; i < points.length; i++) g.add(tube(points[i - 1], points[i], r, material));
    for (const p of points) {
      const joint = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), material);
      joint.position.copy(p);
      g.add(joint);
    }
    return g;
  }

  const solid = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...extra });

  function resistor(pos, axis = 'y') {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 14), solid(0xd9c8a3));
    g.add(body);
    [-0.08, 0, 0.08].forEach((y, i) => {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.073, 0.035, 14), solid([0x7a4a21, 0xc0392b, 0x7a4a21][i]));
      band.position.y = y;
      g.add(band);
    });
    if (axis === 'z') g.rotation.x = Math.PI / 2;
    g.position.copy(V(pos));
    return g;
  }

  // ---------- etiketter ----------

  const labels = [];
  function addLabel(group, pos, html, cls = '') {
    const el = document.createElement('div');
    el.className = `lbl ${cls}`;
    el.innerHTML = html;
    labelLayer.appendChild(el);
    const label = { el, pos: pos.clone(), group, visible: true };
    labels.push(label);
    return label;
  }

  // ---------- lastbilen ----------

  function buildTruck() {
    const g = groups.truck;
    const grid = new THREE.GridHelper(40, 40, C.grid, C.grid);
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    g.add(grid);

    // ram
    g.add(xbox(7.7, 0.22, 0.1, [0.15, 0.92, 0.45]), xbox(7.7, 0.22, 0.1, [0.15, 0.92, -0.45]));
    [-1.2, 0.6, 2.65, 3.9].forEach((x) => g.add(xbox(0.08, 0.16, 0.9, [x, 0.92, 0], { line: 0.3 })));
    // hytt
    g.add(xbox(2.1, 2.5, 2.4, [-2.95, 2.3, 0], { fill: 0.05 }));
    g.add(xbox(0.04, 0.9, 2.1, [-4.0, 2.75, 0], { fill: 0.12, line: 0.3 })); // vindruta
    // motor, växellåda, retarder, kardan
    g.add(xbox(1.3, 0.9, 0.8, [-2.6, 1.2, 0], { fill: 0.1 }));
    g.add(xbox(0.9, 0.62, 0.6, [-1.5, 1.1, 0], { fill: 0.1 }));
    g.add(xcyl(0.27, 0.5, [-0.8, 1.1, 0], 'x', { fill: 0.14 }));
    g.add(xcyl(0.06, 2.6, [0.75, 0.95, 0], 'x', { line: 0.3 }));
    // hjul och axlar
    [-2.9, 2.0, 3.3].forEach((x) => {
      g.add(xcyl(0.52, 0.34, [x, 0.52, 1.05]), xcyl(0.52, 0.34, [x, 0.52, -1.05]));
      g.add(xcyl(0.07, 2.1, [x, 0.52, 0], 'z', { line: 0.3 }));
    });
    // tank och påbyggnad
    g.add(xcyl(0.33, 1.2, [0.1, 0.72, 0.95], 'x', { line: 0.35 }));
    g.add(xbox(5.6, 2.3, 2.4, [1.2, 2.56, 0], { fill: 0.025, line: 0.28 }));
  }

  // Punkt-till-punkt-kablage: en ledning mellan varje par av styrenheter.
  let spaghetti;
  function buildSpaghetti() {
    const ids = Object.keys(NODES).filter((k) => NODES[k].group === 'truck' && k !== 'spak');
    const pts = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) pts.push(node[ids[i]].P, node[ids[j]].P);
    }
    spaghetti = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: token('--accent'), transparent: true, opacity: 0.75 }),
    );
    spaghetti.visible = false;
    groups.truck.add(spaghetti);
    return { nodes: ids.length, wires: pts.length / 2 };
  }

  // ---------- närbilden på kabeln ----------

  class Helix extends THREE.Curve {
    constructor(x0, x1, y, r, turns, phase) {
      super();
      Object.assign(this, { x0, x1, y, r, turns, phase });
    }
    getPoint(t, target = new THREE.Vector3()) {
      const a = this.phase + t * this.turns * Math.PI * 2;
      return target.set(this.x0 + (this.x1 - this.x0) * t, this.y + this.r * Math.cos(a), this.r * Math.sin(a));
    }
  }

  const wire = { termA: null, termB: null, matH: null, matL: null };
  function buildWireScene() {
    const g = groups.wire;
    wire.matH = solid(C.canH, { emissive: C.canH, emissiveIntensity: 0.15 });
    wire.matL = solid(C.canL, { emissive: C.canL, emissiveIntensity: 0.15 });
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(-3, 3, 0.6, 0.11, 9, 0), 260, 0.045, 10), wire.matH));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(-3, 3, 0.6, 0.11, 9, Math.PI), 260, 0.045, 10), wire.matL));
    wire.termA = resistor([-3.12, 0.6, 0]);
    wire.termB = resistor([3.12, 0.6, 0]);
    g.add(wire.termA, wire.termB);
    wire.lblA = addLabel('wire', new THREE.Vector3(-3.12, 0.98, 0), '<b>120 Ω</b>', 'small');
    wire.lblB = addLabel('wire', new THREE.Vector3(3.12, 0.98, 0), '<b>120 Ω</b>', 'small');
    addLabel('wire', new THREE.Vector3(-2.35, 0.2, 0), '<b class="h">CAN_H</b> <b class="l">CAN_L</b>', 'small');
    const grid = new THREE.GridHelper(20, 20, C.grid, C.grid);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    grid.position.y = -0.2;
    g.add(grid);
  }

  // ---------- arbetsbänken ----------

  const bench = { termA: null, termB: null, lblA: null, lblB: null, cfg: {} };
  function buildBench() {
    const g = groups.bench;
    const grid = new THREE.GridHelper(20, 20, C.grid, C.grid);
    grid.material.transparent = true;
    grid.material.opacity = 0.4;
    g.add(grid);
    // dosan
    g.add(xbox(3.6, 0.6, 1.0, [0, 0.3, 0], { fill: 0.06, line: 0.7 }));
    addLabel('bench', new THREE.Vector3(0.1, 0.05, 0.62), '<b>Dosan</b>', 'small');
    // kontakter på dosans baksida och sida
    [-1.4, -0.4, 0.6, 1.5].forEach((x) => g.add(xcyl(0.11, 0.08, [x, 0.3, -0.5], 'z', { line: 0.9, fill: 0.25 })));
    g.add(xbox(0.08, 0.2, 0.34, [1.8, 0.3, 0], { line: 0.9, fill: 0.25 }));
    bench.termA = resistor([-1.6, 0.3, 0], 'z');
    bench.termB = resistor([2.45, 0.3, 0], 'z');
    g.add(bench.termA, bench.termB);
    bench.lblA = addLabel('bench', new THREE.Vector3(-1.6, 0.62, 0), '<b>120 Ω</b>', 'small');
    bench.lblB = addLabel('bench', new THREE.Vector3(2.45, 0.62, 0), '<b>120 Ω</b>', 'small');
  }

  // ---------- noder ----------

  const node = {};
  function buildNode(id, def) {
    const P = V(def.pos);
    const g = new THREE.Group();
    g.position.copy(P);
    const mat = solid(C.ecu, { emissive: 0x000000 });
    const edge = new THREE.LineBasicMaterial({ color: C.fg, transparent: true, opacity: 0.55 });
    const box = (w, h, d, at = [0, 0, 0]) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, mat);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge);
      m.position.set(...at);
      e.position.set(...at);
      g.add(m, e);
      return m;
    };
    let top = 0.2;
    switch (def.shape) {
      case 'sensor': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 20), mat);
        body.rotation.x = Math.PI / 2;
        g.add(body);
        box(0.22, 0.22, 0.16, [0, 0, -0.32]);
        top = 0.28;
        break;
      }
      case 'io':
        box(0.5, 0.36, 0.5);
        top = 0.3;
        break;
      case 'vn':
        box(0.7, 0.2, 0.46);
        top = 0.22;
        break;
      case 'laptop':
        box(0.9, 0.05, 0.6, [0, -0.3, 0]);
        box(0.9, 0.6, 0.04, [0, 0.0, -0.3]);
        top = 0.42;
        break;
      case 'lever': {
        box(0.24, 0.2, 0.24);
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), mat);
        stick.position.set(0, 0.16, 0.3);
        stick.rotation.x = 1.0;
        g.add(stick);
        top = 0.3;
        break;
      }
      default:
        box(0.34, 0.2, 0.26);
        top = 0.18;
    }
    groups[def.group].add(g);
    const html = `<b>${def.label}</b>${def.sub ? `<span>${def.sub}</span>` : ''}`;
    const label = addLabel(def.group, P.clone().add(new THREE.Vector3(0, top, 0)), html, 'node');
    node[id] = { id, def, P, g, mat, label, visible: true, flash: 0, flashColor: new THREE.Color(), stubs: [], hold: null };
  }

  // ---------- bussar ----------

  const bus = {};
  function nearestOnPolyline(b, p) {
    let best = { dist: Infinity, s: 0, point: b.P[0].clone() };
    for (let i = 1; i < b.P.length; i++) {
      const a = b.P[i - 1];
      const ab = b.P[i].clone().sub(a);
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      const point = a.clone().addScaledVector(ab, t);
      const dist = point.distanceTo(p);
      if (dist < best.dist) best = { dist, s: b.cum[i - 1] + ab.length() * t, point };
    }
    return best;
  }

  function pointAt(b, s) {
    s = THREE.MathUtils.clamp(s, 0, b.len);
    for (let i = 1; i < b.P.length; i++) {
      if (s <= b.cum[i]) {
        const t = (s - b.cum[i - 1]) / (b.cum[i] - b.cum[i - 1]);
        return b.P[i - 1].clone().lerp(b.P[i], t);
      }
    }
    return b.P[b.P.length - 1].clone();
  }

  function subPath(b, s0, s1) {
    const pts = [pointAt(b, s0)];
    const inner = b.P.map((p, i) => ({ p, s: b.cum[i] })).filter((v) => v.s > Math.min(s0, s1) && v.s < Math.max(s0, s1));
    if (s1 < s0) inner.reverse();
    inner.forEach((v) => pts.push(v.p.clone()));
    pts.push(pointAt(b, s1));
    return pts;
  }

  function buildBus(id, def) {
    const b = { id, def, P: def.pts.map(V), cum: [0], attach: {}, g: new THREE.Group() };
    for (let i = 1; i < b.P.length; i++) b.cum.push(b.cum[i - 1] + b.P[i].distanceTo(b.P[i - 1]));
    b.len = b.cum[b.cum.length - 1];
    b.color = def.token ? token(def.token) : C.canH;
    const stubMat = solid(b.color, { emissive: b.color, emissiveIntensity: 0.25 });

    if (def.render === 'pair') {
      const off = new THREE.Vector3(0, 0, 0.045);
      b.g.add(polyTube(b.P.map((p) => p.clone().add(off)), 0.022, solid(C.canH, { emissive: C.canH, emissiveIntensity: 0.3 })));
      b.g.add(polyTube(b.P.map((p) => p.clone().sub(off)), 0.022, solid(C.canL, { emissive: C.canL, emissiveIntensity: 0.3 })));
    } else if (def.render !== 'twisted') {
      b.g.add(polyTube(b.P, 0.035, stubMat));
      // terminering i ändarna
      if (def.group === 'truck') {
        [b.P[0], b.P[b.P.length - 1]].forEach((p) => {
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), solid(0xd9c8a3));
          cap.position.copy(p);
          b.g.add(cap);
        });
      }
    }

    for (const nid of def.nodes) {
      const n = node[nid];
      const at = nearestOnPolyline(b, n.P);
      b.attach[nid] = at;
      let stub;
      if (def.render === 'twisted' || def.render === 'pair') {
        stub = new THREE.Group();
        const dx = new THREE.Vector3(0.04, 0, 0);
        stub.add(tube(n.P.clone().add(dx), at.point.clone().add(dx), 0.016, solid(C.canH)));
        stub.add(tube(n.P.clone().sub(dx), at.point.clone().sub(dx), 0.016, solid(C.canL)));
      } else {
        stub = tube(n.P, at.point, 0.02, stubMat);
      }
      b.g.add(stub);
      n.stubs.push(stub);
    }
    groups[def.group].add(b.g);
    bus[id] = b;
  }

  const plainWires = [];
  function buildPlainWire(w) {
    const a = node[w.from].P;
    const b = node[w.to].P;
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: C.muted, dashSize: 0.07, gapSize: 0.05 }));
    line.computeLineDistances();
    groups[w.group].add(line);
    plainWires.push({ ...w, line });
  }

  // ---------- pulser (meddelanden på väg) ----------

  const pulseGeo = new THREE.SphereGeometry(0.075, 14, 10);
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  let pulses = [];
  let timers = [];
  let generation = 0;

  function spawnPulse(points, speed, color, onDone) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color })));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.55);
    g.add(halo);
    g.position.copy(points[0]);
    pulseLayer.add(g);
    pulses.push({ points, cum, len: cum[cum.length - 1], d: 0, speed, g, onDone });
  }

  function after(seconds, fn) {
    timers.push({ t: seconds, fn, generation });
  }

  function clearPackets() {
    generation++;
    pulses.forEach((p) => pulseLayer.remove(p.g));
    pulses = [];
    timers = [];
    Object.values(node).forEach((n) => {
      n.flash = 0;
      n.label.el.classList.remove('blocked', 'rx');
    });
  }

  function flash(nid, color, mark) {
    const n = node[nid];
    n.flashColor.copy(color);
    n.flash = 1;
    if (mark) {
      n.label.el.classList.add(mark);
      const gen = generation;
      setTimeout(() => gen === generation && n.label.el.classList.remove(mark), 1400);
    }
  }

  function messageColor(m, busId) {
    if (busId === 'bench' && bench.cfg.error) return C.bad;
    return token(m.token ?? '--accent');
  }

  function receive(nid, busId, key) {
    const m = MESSAGES[key];
    if (busId === 'bench' && bench.cfg.error) {
      flash(nid, C.bad, nid === 'vn' ? 'blocked' : null);
      return;
    }
    if (m.block?.[nid]) {
      flash(nid, C.bad, 'blocked');
      return;
    }
    if (m.accept?.includes(nid)) flash(nid, messageColor(m, busId), 'rx');
    else flash(nid, C.muted.clone().multiplyScalar(0.5));
    for (const to of m.routes?.[nid]?.[busId] ?? []) after(0.3, () => broadcast(to, nid, key));
    if (m.then?.[nid]) after(0.45, () => send(m.then[nid]));
  }

  function broadcast(busId, fromId, key) {
    const b = bus[busId];
    const m = MESSAGES[key];
    const from = b.attach[fromId];
    if (!from || !node[fromId].visible) return;
    const speed = b.def.speed ?? 3;
    const color = messageColor(m, busId);
    flash(fromId, color);
    spawnPulse([node[fromId].P, from.point], speed, color, () => {
      // Ramen sprider sig åt båda håll och når alla noder på bussen.
      if (from.s > 0.02) spawnPulse(subPath(b, from.s, 0), speed, color);
      if (from.s < b.len - 0.02) spawnPulse(subPath(b, from.s, b.len), speed, color);
      for (const nid of b.def.nodes) {
        if (nid === fromId || !node[nid].visible) continue;
        const to = b.attach[nid];
        after(Math.abs(to.s - from.s) / speed, () => {
          spawnPulse([to.point, node[nid].P], speed, color, () => receive(nid, busId, key));
        });
      }
    });
  }

  function send(key) {
    const m = MESSAGES[key];
    if (!m) return;
    if (m.wire) {
      const [a, b] = m.wire;
      if (!node[a].visible || !node[b].visible) return;
      const color = token(m.token ?? '--muted');
      flash(a, C.fg);
      spawnPulse([node[a].P, node[b].P], 2.2, color, () => {
        flash(b, C.fg);
        if (m.then?.[b]) after(0.35, () => send(m.then[b]));
      });
      return;
    }
    broadcast(m.bus, m.from, key);
  }

  // ---------- kamera ----------

  const cam = { target: new THREE.Vector3(0, 1.5, 0), theta: 0.6, phi: 1.1, radius: 14 };
  const goal = { target: cam.target.clone(), theta: cam.theta, phi: cam.phi, radius: cam.radius };
  let autoRotate = false;
  let userMoved = false;

  function setCamera(pos, target, snap = false) {
    const off = V(pos).sub(V(target));
    const s = new THREE.Spherical().setFromVector3(off);
    goal.target.copy(V(target));
    goal.radius = s.radius;
    goal.phi = s.phi;
    // gå kortaste vägen runt
    let theta = s.theta;
    while (theta - cam.theta > Math.PI) theta -= Math.PI * 2;
    while (theta - cam.theta < -Math.PI) theta += Math.PI * 2;
    goal.theta = theta;
    if (snap || reducedMotion()) {
      Object.assign(cam, { theta: goal.theta, phi: goal.phi, radius: goal.radius });
      cam.target.copy(goal.target);
    }
  }

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    userMoved = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    goal.theta -= (e.clientX - drag.x) * 0.006;
    goal.phi = THREE.MathUtils.clamp(goal.phi - (e.clientY - drag.y) * 0.005, 0.25, 1.52);
    drag = { x: e.clientX, y: e.clientY };
  });
  const endDrag = () => (drag = null);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      goal.radius = THREE.MathUtils.clamp(goal.radius * (1 + Math.sign(e.deltaY) * 0.1), 2.5, 30);
      userMoved = true;
    },
    { passive: false },
  );

  // ---------- vyer ----------

  let view = {};
  let ambientTimer = 0;
  let ambientIndex = 0;

  function applyVisibility() {
    Object.entries(groups).forEach(([k, g]) => (g.visible = k === view.group));
    const showBuses = view.buses !== false;
    Object.values(bus).forEach((b) => {
      if (b.def.group !== 'truck') return;
      b.g.visible = showBuses && (!Array.isArray(view.buses) || view.buses.includes(b.id));
    });
    if (spaghetti) spaghetti.visible = !!view.spaghetti;
    plainWires.forEach((w) => (w.line.visible = node[w.from].visible && node[w.to].visible && !view.spaghetti));
    const only = view.labels;
    labels.forEach((l) => (l.visible = true));
    Object.values(node).forEach((n) => {
      n.g.visible = n.visible;
      n.stubs.forEach((s) => (s.visible = n.visible));
      n.label.visible = n.visible && (!only || only.includes(n.id));
      n.label.el.classList.toggle('dim', !!view.highlight && !view.highlight.includes(n.id));
      n.hold = view.highlight?.includes(n.id) ? token('--accent') : null;
    });
    if (view.spaghetti && node.spak) node.spak.g.visible = node.spak.label.visible = false;
  }

  function setView(v) {
    clearPackets();
    const groupChanged = v.group !== view.group;
    view = { ...v };
    userMoved = false;
    autoRotate = !!v.rotate && !reducedMotion();
    setCamera(v.cam.pos, v.cam.target, groupChanged);
    applyVisibility();
    ambientTimer = 0.4;
    ambientIndex = 0;
  }

  function patchView(patch) {
    Object.assign(view, patch);
    applyVisibility();
  }

  function setWire({ termA, termB, dominant, driving } = {}) {
    if (termA !== undefined) wire.termA.visible = wire.lblA.forced = termA;
    if (termB !== undefined) wire.termB.visible = wire.lblB.forced = termB;
    if (dominant !== undefined) {
      wire.matH.emissiveIntensity = dominant ? 0.9 : 0.12;
      wire.matL.emissiveIntensity = dominant ? 0.9 : 0.12;
    }
    if (driving) {
      Object.entries(driving).forEach(([nid, on]) => (node[nid].hold = on ? token(typeof on === 'string' ? on : '--accent') : null));
    }
  }

  function setBench(cfg) {
    bench.cfg = { ...bench.cfg, ...cfg };
    const c = bench.cfg;
    const n = c.instruments ?? 3;
    node.i1.visible = n >= 1;
    node.i2.visible = n >= 2;
    node.i3.visible = n >= 3;
    node.io.visible = node.lever.visible = !!c.io;
    bench.termA.visible = bench.lblA.forced = c.termA !== false;
    bench.termB.visible = bench.lblB.forced = c.termB !== false;
    applyVisibility();
  }

  // ---------- bildruta för bildruta ----------

  const tmp = new THREE.Vector3();
  let width = 1;
  let height = 1;

  function resize() {
    const r = stage.getBoundingClientRect();
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  function update(dt) {
    if (autoRotate && !userMoved) goal.theta += dt * 0.07;
    const k = 1 - Math.exp(-dt * 4.5);
    cam.theta += (goal.theta - cam.theta) * k;
    cam.phi += (goal.phi - cam.phi) * k;
    cam.radius += (goal.radius - cam.radius) * k;
    cam.target.lerp(goal.target, k);
    // smal scen (mobil): backa kameran så att allt får plats
    const fit = Math.max(1, 1.5 / camera.aspect);
    camera.position.setFromSphericalCoords(cam.radius * fit, cam.phi, cam.theta).add(cam.target);
    camera.lookAt(cam.target);

    for (const t of timers) t.t -= dt;
    const due = timers.filter((t) => t.t <= 0);
    timers = timers.filter((t) => t.t > 0);
    due.forEach((t) => t.generation === generation && t.fn());

    for (const p of pulses) {
      p.d += p.speed * dt;
      if (p.d >= p.len) {
        pulseLayer.remove(p.g);
        p.done = true;
        p.onDone?.();
        continue;
      }
      let i = 1;
      while (i < p.cum.length - 1 && p.cum[i] < p.d) i++;
      const t = (p.d - p.cum[i - 1]) / Math.max(1e-6, p.cum[i] - p.cum[i - 1]);
      p.g.position.copy(p.points[i - 1]).lerp(p.points[i], t);
    }
    pulses = pulses.filter((p) => !p.done);

    if (view.ambient?.length && !reducedMotion()) {
      ambientTimer -= dt;
      if (ambientTimer <= 0) {
        const candidates = view.ambient.filter((key) => {
          const m = MESSAGES[key];
          return node[m.from ?? m.wire[0]].visible;
        });
        if (candidates.length) send(candidates[ambientIndex++ % candidates.length]);
        ambientTimer = view.ambientEvery ?? 1.7;
      }
    }

    for (const n of Object.values(node)) {
      if (n.flash > 0) {
        n.flash = Math.max(0, n.flash - dt * 1.3);
        n.mat.emissive.copy(n.flashColor).multiplyScalar(n.flash);
      } else if (n.hold) {
        n.mat.emissive.copy(n.hold).multiplyScalar(0.75);
      } else {
        n.mat.emissive.setScalar(0);
      }
    }

    // etiketter
    labelLayer.classList.toggle('far', cam.radius * fit > 11);
    for (const l of labels) {
      const show = l.visible && l.group === view.group && l.forced !== false;
      if (!show) {
        l.el.hidden = true;
        continue;
      }
      tmp.copy(l.pos).project(camera);
      if (tmp.z > 1) {
        l.el.hidden = true;
        continue;
      }
      l.el.hidden = false;
      l.el.style.transform = `translate(-50%,-100%) translate(${((tmp.x + 1) / 2) * width}px, ${((1 - tmp.y) / 2) * height - 4}px)`;
    }
  }

  // ---------- start ----------

  buildTruck();
  buildWireScene();
  buildBench();
  Object.entries(NODES).forEach(([id, def]) => buildNode(id, def));
  Object.entries(BUSES).forEach(([id, def]) => buildBus(id, def));
  WIRES.forEach(buildPlainWire);
  const spaghettiStats = buildSpaghetti();
  setBench({ instruments: 3, io: false, termA: true, termB: true, error: false });
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    update(Math.min(clock.getDelta(), 0.05));
    renderer.render(scene, camera);
  });

  return {
    ok: true,
    setView,
    patchView,
    send(key) {
      clearPackets();
      send(key);
    },
    setWire,
    setBench,
    spaghettiStats,
  };
}

/** Används när WebGL saknas: samma gränssnitt, gör ingenting. */
export function createNullWorld() {
  const noop = () => {};
  return { ok: false, setView: noop, patchView: noop, send: noop, setWire: noop, setBench: noop, spaghettiStats: { nodes: 10, wires: 45 } };
}
