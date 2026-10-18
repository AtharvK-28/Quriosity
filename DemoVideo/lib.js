// ---------- helpers ----------
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eo = p => 1 - Math.pow(1 - p, 3);
const eio = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const eob = p => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const lerp = (a, b, p) => a + (b - a) * p;
function h2r(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
const mix = (c1, c2, p) => { const a = h2r(c1), b = h2r(c2); return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], p))).join(',')})`; };
const C = { lilac: '#a58bff', lilac2: '#c9b8ff', cyan: '#72e4ff', coral: '#ff6f8e', mint: '#5ef0b0', amber: '#ffc66e', wire: '#4a3a86', text: '#f2eeff', soft: '#d6ccf6', muted: '#9d90cc', dim: '#6e62a0', tile: '#231552', tileline: '#4a3790', panel: '#1b1040' };

function div(parent, cls, html, style) { const e = document.createElement('div'); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (style) e.style.cssText = style; parent.appendChild(e); return e; }
function sv(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function svgLayer(parent) { return sv('svg', { class: 'layer', viewBox: '0 0 1920 1080', width: 1920, height: 1080 }, parent); }
function show(e, o, tf) { e.style.opacity = o; e.style.visibility = o <= 0.002 ? 'hidden' : 'visible'; if (tf !== undefined) e.style.transform = tf; }
function pop(e, lt, t0, d = .3, from = .85) { const p = seg(lt, t0, t0 + d); show(e, eo(p), `scale(${lerp(from, 1, eob(p))})`); return p; }
function rise(e, lt, t0, d = .45, dy = 24, tout = 1e9, od = .25) { const p = eo(seg(lt, t0, t0 + d)), q = seg(lt, tout, tout + od); show(e, p * (1 - q), `translateY(${(1 - p) * dy - q * 10}px)`); return p; }

// words: element whose text is split into .w spans
function wordify(e) {
  const nodes = [...e.childNodes]; e.innerHTML = ''; const ws = [];
  nodes.forEach(n => {
    if (n.nodeType === 3) { n.textContent.split(/(\s+)/).forEach(tok => { if (!tok) return; if (/^\s+$/.test(tok)) e.appendChild(document.createTextNode(' ')); else { const s = document.createElement('span'); s.className = 'w'; s.textContent = tok; e.appendChild(s); ws.push(s); } }); }
    else { const s = document.createElement('span'); s.className = 'w'; s.appendChild(n); e.appendChild(s); ws.push(s); }
  });
  e._w = ws; return e;
}
function words(e, lt, tin, tout, o = {}) {
  const st = o.stagger ?? .045, du = o.dur ?? .42, ri = o.rise ?? 22, od = o.outDur ?? .2;
  const q = seg(lt, tout, tout + od); let any = false;
  e._w.forEach((s, i) => { const p = eo(seg(lt, tin + i * st, tin + i * st + du)); const op = p * (1 - q); if (op > .002) any = true; s.style.opacity = op; s.style.transform = `translateY(${(1 - p) * ri - eio(q) * 12}px)`; });
  e.style.visibility = any ? 'visible' : 'hidden';
}
function mkHL(root, text, cls = 'hl') { return wordify(div(root, 'abs ' + cls, text)); }
// type-on text
function typed(e, full, lt, t0, t1, caret = true) { const n = Math.round(full.length * seg(lt, t0, t1)); const key = n + (caret && lt > t0 - .1 && lt < t1 + .5 ? 'c' : ''); if (e._k !== key) { e._k = key; e.innerHTML = full.slice(0, n).replace(/&/g, '&amp;').replace(/</g, '&lt;') + (key.endsWith('c') ? '<span class="caret"></span>' : ''); } }
function setText(e, s) { if (e._t !== s) { e._t = s; e.innerHTML = s; } }

// ---------- syntax highlight ----------
const KW = new Set(['from', 'import', 'def', 'return', 'as', 'operation', 'use', 'let', 'in', 'for', 'include', 'qubit', 'bit', 'measure', 'OPENQASM']);
const TY = new Set(['Result', 'Qubit']);
function hl(line) {
  const re = /("[^"]*"?|'[^']*'?|#.*$|\/\/.*$|@[A-Za-z_.]+|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|\s+|.)/g; let out = ''; const toks = line.match(re) || [];
  toks.forEach((tk, i) => { const nx = toks[i + 1]; let c = '';
    if (/^["']/.test(tk)) c = 's'; else if (/^(#|\/\/)/.test(tk)) c = 'c'; else if (/^@/.test(tk)) c = 'd'; else if (/^\d/.test(tk)) c = 'n';
    else if (/^[A-Za-z_]/.test(tk)) { if (KW.has(tk)) c = 'k'; else if (TY.has(tk)) c = 't'; else if (nx === '(') c = 'f'; }
    else if (/^[()[\]{},.:;=<>+\-*/]$/.test(tk)) c = 'p';
    const esc = tk.replace(/&/g, '&amp;').replace(/</g, '&lt;'); out += c ? `<span class="${c}">${esc}</span>` : esc; });
  return out;
}
const LANG = {
  qiskit: ['from qiskit import QuantumCircuit', '', 'qc = QuantumCircuit(2, 2)', 'qc.h(0)', 'qc.cx(0, 1)', 'qc.measure([0, 1], [0, 1])'],
  cirq: ['import cirq', '', 'q = cirq.LineQubit.range(2)', 'circuit = cirq.Circuit([', '    cirq.H(q[0]),', '    cirq.CNOT(q[0], q[1]),', "    cirq.measure(q[0], q[1], key='m'),", '])'],
  penny: ['import pennylane as qml', '', 'dev = qml.device("default.qubit", wires=2)', '', '@qml.qnode(dev)', 'def circuit():', '    qml.Hadamard(wires=0)', '    qml.CNOT(wires=[0, 1])', '    return qml.probs(wires=[0, 1])'],
  qs: ['operation Bell() : (Result, Result) {', '    use (a, b) = (Qubit(), Qubit());', '    H(a);', '    CNOT(a, b);', '    return (MResetZ(a), MResetZ(b));', '}'],
  qasm: ['OPENQASM 3.0;', 'include "stdgates.inc";', '', 'qubit[2] q;', 'bit[2] c;', '', 'h q[0];', 'cx q[0], q[1];', 'c = measure q;']
};

// ---------- circuit glyphs ----------
function gateBox(g, x, y, label, color, s = 64, fs = 28) {
  sv('rect', { x: x - s / 2, y: y - s / 2, width: s, height: s, rx: s * .19, fill: C.tile, stroke: color || C.tileline, 'stroke-width': 1.8 }, g);
  const t = sv('text', { x, y: y + fs * .36, 'text-anchor': 'middle', 'font-family': 'IBM Plex Sans', 'font-weight': 600, 'font-size': fs, fill: C.text }, g); t.textContent = label; return g;
}
function measBox(g, x, y, s = 64, color) {
  const k = s / 64; sv('rect', { x: x - s / 2, y: y - s / 2, width: s, height: s, rx: 12 * k, fill: C.tile, stroke: color || C.tileline, 'stroke-width': 1.8 }, g);
  sv('path', { d: `M${x - 18 * k} ${y + 10 * k} A${20 * k} ${20 * k} 0 0 1 ${x + 18 * k} ${y + 10 * k}`, fill: 'none', stroke: C.lilac2, 'stroke-width': 2.4 }, g);
  sv('line', { x1: x, y1: y + 12 * k, x2: x + 12 * k, y2: y - 12 * k, stroke: C.lilac2, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
}
function drawCX(g, x, cy, ty, color, k = 1) {
  g.innerHTML = ''; const up = ty < cy, R = 22 * k;
  sv('line', { x1: x, y1: cy, x2: x, y2: ty + (up ? -R : R), stroke: color, 'stroke-width': 2.6 }, g);
  sv('circle', { cx: x, cy, r: 10 * k, fill: color }, g);
  sv('circle', { cx: x, cy: ty, r: R, fill: C.panel, stroke: color, 'stroke-width': 2.6 }, g);
  sv('line', { x1: x - R, y1: ty, x2: x + R, y2: ty, stroke: color, 'stroke-width': 2.6 }, g);
  sv('line', { x1: x, y1: ty - R, x2: x, y2: ty + R, stroke: color, 'stroke-width': 2.6 }, g);
}
// a quick mini-circuit: wires + list of gates [{t:'H',q:0,c:col}|{t:'CX',c:col,ctl,tgt}|{t:'M',q,c}]
function miniCircuit(parent, x0, y0, w, nq, gap, cols, gates, k = .8) {
  const g = sv('g', {}, parent); const wires = [];
  for (let q = 0; q < nq; q++) wires.push(sv('line', { x1: x0, y1: y0 + q * gap, x2: x0 + w, y2: y0 + q * gap, stroke: C.wire, 'stroke-width': 2 }, g));
  const els = gates.map(gt => { const gg = sv('g', {}, g); gg.style.transformBox = 'fill-box'; gg.style.transformOrigin = 'center';
    const x = x0 + cols[gt.c];
    if (gt.t === 'CX') drawCX(gg, x, y0 + gt.ctl * gap, y0 + gt.tgt * gap, gt.color || C.lilac, k);
    else if (gt.t === 'M') measBox(gg, x, y0 + gt.q * gap, 64 * k);
    else gateBox(gg, x, y0 + gt.q * gap, gt.t, gt.color || C.lilac, 64 * k, 28 * k);
    return gg; });
  return { g, wires, els };
}

// ---------- 3D ----------
const W3 = {};
function faceTex(txt) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const g = x.createRadialGradient(200, 170, 20, 256, 256, 300); g.addColorStop(0, '#fff0c4'); g.addColorStop(.45, '#ffc66e'); g.addColorStop(1, '#c9821f');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(255,240,200,.75)'; x.lineWidth = 16; x.beginPath(); x.arc(256, 256, 226, 0, 7); x.stroke();
  x.strokeStyle = 'rgba(140,80,15,.55)'; x.lineWidth = 6; x.beginPath(); x.arc(256, 256, 206, 0, 7); x.stroke();
  x.font = '700 300px "STIX Two Text"'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,245,215,.8)'; x.fillText(txt, 262, 282); x.fillStyle = '#7a4a10'; x.fillText(txt, 256, 276);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function labelTex(txt, size = 80, color = '#f2eeff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.font = `${size}px "STIX Two Math"`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; x.fillText(txt, 128, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(114,228,255,.95)'); g.addColorStop(.25, 'rgba(114,228,255,.45)'); g.addColorStop(1, 'rgba(114,228,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}
function init3D() {
  const canvas = $('gl');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(1920, 1080, false); r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-960, 960, 540, -540, -2000, 2000); cam.position.z = 1000;
  scene.add(new THREE.AmbientLight(0xffffff, .55));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(-.5, .8, 1); scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xa58bff, 1.0); dl2.position.set(.8, -.3, .6); scene.add(dl2);
  // bloch group: outer (position/scale) > tilt > orbit
  const outer = new THREE.Group(), tilt = new THREE.Group(), orbit = new THREE.Group();
  outer.add(tilt); tilt.add(orbit); scene.add(outer);
  const shellMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { cIn: { value: new THREE.Color(0x2a1766) }, cRim: { value: new THREE.Color(0xc9b8ff) }, op: { value: 1 } },
    vertexShader: 'varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 cIn; uniform vec3 cRim; uniform float op; varying vec3 vN; void main(){ vec3 n=normalize(vN); float f=pow(1.-abs(n.z),2.4); vec3 L=normalize(vec3(-.45,.6,.75)); vec3 R=reflect(-L,n); float s=pow(max(R.z,0.),28.)*.55; float s2=pow(max(dot(n,normalize(vec3(-.3,.5,.8))),0.),6.)*.18; vec3 col=mix(cIn,cRim,f)+s*vec3(1.)+s2*vec3(.8,.75,1.); gl_FragColor=vec4(col,(0.13+0.62*f+0.9*s+s2)*op); }'
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), shellMat); orbit.add(shell);
  const basic = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false });
  const eq = new THREE.Mesh(new THREE.TorusGeometry(1, .011, 8, 160), basic(0xb49cff, .95)); eq.rotation.x = Math.PI / 2; orbit.add(eq);
  const mer1 = new THREE.Mesh(new THREE.TorusGeometry(1, .006, 6, 160), basic(0xa58bff, .35)); orbit.add(mer1);
  const mer2 = new THREE.Mesh(new THREE.TorusGeometry(1, .006, 6, 160), basic(0xa58bff, .35)); mer2.rotation.y = Math.PI / 2; orbit.add(mer2);
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, 2.3, 8), basic(0xa58bff, .45)); orbit.add(axis);
  const center = new THREE.Mesh(new THREE.SphereGeometry(.028, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc9b8ff, transparent: true })); orbit.add(center);
  const vecMat = new THREE.MeshStandardMaterial({ color: 0x72e4ff, emissive: 0x1f7f99, roughness: .3, metalness: .1, transparent: true });
  const vec = new THREE.Group(); orbit.add(vec);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .86, 20), vecMat); shaft.position.y = .43; vec.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(.06, .15, 28), vecMat); head.position.y = .925; vec.add(head);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); glow.scale.set(.5, .5, 1); orbit.add(glow);
  const l0 = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('|0⟩'), transparent: true, depthWrite: false })); l0.scale.set(.8, .4, 1); l0.position.y = 1.3; tilt.add(l0);
  const l1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex('|1⟩'), transparent: true, depthWrite: false })); l1.scale.set(.8, .4, 1); l1.position.y = -1.32; tilt.add(l1);
  // coin
  const coin = new THREE.Group(); scene.add(coin);
  const side = new THREE.MeshStandardMaterial({ color: 0xe0a040, emissive: 0x5a3408, metalness: .55, roughness: .3, transparent: true });
  const f0 = new THREE.MeshStandardMaterial({ map: faceTex('0'), emissive: 0xffffff, emissiveMap: faceTex('0'), emissiveIntensity: .5, metalness: .25, roughness: .45, transparent: true });
  const f1 = new THREE.MeshStandardMaterial({ map: faceTex('1'), emissive: 0xffffff, emissiveMap: faceTex('1'), emissiveIntensity: .5, metalness: .25, roughness: .45, transparent: true });
  const coinMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .09, 96), [side, f0, f1]); coin.add(coinMesh);
  Object.assign(W3, { r, scene, cam, outer, tilt, orbit, shell, shellMat, eq, mer1, mer2, axis, center, vec, vecMat, glow, l0, l1, coin, coinMesh, coinMats: [side, f0, f1] });
}
// state: {x,y,R,op, shellY, eqOp, merOp, axisOp, lblOp, vecLen, theta, phi, tiltX, orbitY, coin:{on,x,y,R,angle,op}}
function set3D(s) {
  const w = W3; if (!s) { $('gl').style.visibility = 'hidden'; return false; }
  $('gl').style.visibility = 'visible';
  const op = s.op ?? 1;
  w.outer.visible = op > .002; w.outer.position.set(s.x - 960, 540 - s.y, 0); w.outer.scale.setScalar(s.R);
  w.tilt.rotation.set(s.tiltX ?? .32, 0, 0); w.orbit.rotation.set(0, s.orbitY ?? 0, 0);
  w.shell.scale.set(1, s.shellY ?? 1, 1); w.shellMat.uniforms.op.value = op * (s.shellOp ?? 1);
  w.eq.material.opacity = .95 * op * (s.eqOp ?? 1); w.mer1.material.opacity = w.mer2.material.opacity = .32 * op * (s.merOp ?? 1);
  w.axis.material.opacity = .45 * op * (s.axisOp ?? 1); w.center.material.opacity = op * (s.axisOp ?? 1);
  w.l0.material.opacity = w.l1.material.opacity = op * (s.lblOp ?? 1);
  const th = s.theta ?? 0, ph = s.phi ?? 0, L = s.vecLen ?? 1;
  const dir = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
  w.vec.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); w.vec.scale.setScalar(Math.max(L, .001));
  w.vecMat.opacity = op * (L > .01 ? 1 : 0); w.glow.position.copy(dir.clone().multiplyScalar(L)); w.glow.material.opacity = op * (L > .01 ? 1 : 0);
  const c = s.coin; w.coin.visible = !!(c && c.op > .002);
  if (w.coin.visible) { w.coin.position.set(c.x - 960, 540 - c.y, 300); w.coin.scale.setScalar(c.R); w.coinMesh.rotation.set(c.angle, 0, 0); w.coinMats.forEach(m => m.opacity = c.op); }
  w.r.render(w.scene, w.cam); return true;
}

// ---------- cursor ----------
const CURSOR = [];   // {T0, k:[[lt,x,y]], press:[[a,b]], vis:[a,b]}
function cursorState(t) {
  for (const c of CURSOR) {
    const lt = t - c.T0; if (lt < c.vis[0] - .01 || lt > c.vis[1] + .01) continue;
    const k = c.k; let x = k[0][1], y = k[0][2];
    if (lt >= k[k.length - 1][0]) { x = k[k.length - 1][1]; y = k[k.length - 1][2]; }
    else for (let i = 0; i < k.length - 1; i++) { if (lt >= k[i][0] && lt <= k[i + 1][0]) { const p = eio(seg(lt, k[i][0], k[i + 1][0])); x = lerp(k[i][1], k[i + 1][1], p); y = lerp(k[i][2], k[i + 1][2], p); break; } }
    const press = (c.press || []).some(([a, b]) => lt >= a && lt < b);
    const op = seg(lt, c.vis[0], c.vis[0] + .2) * (1 - seg(lt, c.vis[1] - .3, c.vis[1]));
    return { x, y, press, op, lt };
  }
  return null;
}
