const T = { s0: 0, s1: 10, s2: 16, s3: 32, s4: 46, s5: 70, s6: 88, s7: 96, s8: 114, s9: 130, s10: 148, end: 156 };
const SCENES = [];
function scene(id, dur, build, render, fade = true) { const root = div($('scenes'), 'scene'); root.id = id; const s = { id, T0: T[id], dur, root, render, fade }; s.r = build(root, s) || {}; SCENES.push(s); return s; }
const phiAbs = t => .7 * (t - 5.6);
let LOCK = { bx: 700, wx: 800 }, WMW = 600;

// ===================== S0 HOOK =====================
scene('s0', 10, root => {
  const a = wordify(div(root, 'abs big', 'A qubit is not a coin.', 'top:766px'));
  const b = wordify(div(root, 'abs big', 'Ten minutes to find out why.', 'top:766px'));
  const tok = div($('over'), 'abs', '<svg width="120" height="120" viewBox="0 0 120 120"><rect x="6" y="6" width="108" height="108" rx="20" fill="#231552" stroke="#a58bff" stroke-width="3"/><text x="60" y="80" text-anchor="middle" font-family="IBM Plex Sans" font-weight="600" font-size="58" fill="#f2eeff">H</text></svg>', 'left:0;top:0;width:120px;height:120px;visibility:hidden');
  const ring = div($('over'), 'abs', '', 'left:0;top:0;width:400px;height:400px;border-radius:50%;border:3px solid #72e4ff;visibility:hidden');
  return { a, b, tok, ring };
}, (lt, r, t) => {
  words(r.a, lt, .45, 4.4, { stagger: .06, dur: .45, rise: 26 });
  words(r.b, lt, 5.3, 9.45, { stagger: .06, dur: .45, rise: 26 });
  const tp = seg(lt, 4.4, 4.98), tx = lerp(250, 960, eio(tp)), ts = lerp(1, .45, eio(tp));
  show(r.tok, tp > 0 && lt < 5.05 ? 1 - seg(lt, 4.97, 5.05) : 0, `translate(${tx - 60}px,${430 - 60 - Math.sin(tp * Math.PI) * 60}px) scale(${ts}) rotate(${(1 - tp) * -12}deg)`);
  const rp = seg(lt, 5.0, 5.7); show(r.ring, rp > 0 && rp < 1 ? (1 - rp) * .9 : 0, `translate(${960 - 200}px,${430 - 200}px) scale(${lerp(.3, 1.35, eo(rp))})`);
  const p = seg(lt, 0, 1.35), hop = 230 * 4 * p * (1 - p);
  return { x: 960, y: 430, R: 190, op: 1, shellY: lerp(.06, 1, eio(seg(lt, 1.2, 1.95))), shellOp: seg(lt, 1.12, 1.4), eqOp: seg(lt, 1.15, 1.45), merOp: seg(lt, 1.6, 2.1),
    axisOp: seg(lt, 1.55, 2), lblOp: seg(lt, 1.8, 2.3), vecLen: eo(seg(lt, 2, 2.5)), theta: eio(seg(lt, 4.98, 5.6)) * Math.PI / 2, phi: lt > 5.6 ? phiAbs(t) : 0,
    tiltX: .32, orbitY: .18 * t, coin: { x: 960, y: 430 - hop, R: 190, angle: .32 + (Math.PI / 2 - .32 + 4 * Math.PI) * (1 - eo(p)), op: 1 - seg(lt, 1.25, 1.6) } };
}, false);

// ===================== S1 TITLE =====================
scene('s1', 6, root => {
  const wm = div(root, 'abs', 'Quriosity', 'left:0;top:0;font-family:var(--serif);font-weight:600;font-size:150px;letter-spacing:-.015em;line-height:1;white-space:nowrap');
  const tag = wordify(div(root, 'abs', 'Learn quantum by building it.', 'left:0;top:548px;width:1920px;text-align:center;font-size:44px;color:var(--soft)'));
  const sub = wordify(div(root, 'abs', 'Drag gates, run real physics, and get told exactly what went wrong.', 'left:0;top:622px;width:1920px;text-align:center;font-size:28px;color:var(--muted)'));
  return { wm, tag, sub };
}, (lt, r, t) => {
  const mv = eio(seg(lt, 0, .7)), out = seg(lt, 5.5, 5.9);
  const p = eo(seg(lt, .5, .9)); show(r.wm, p * (1 - out), `translate(${LOCK.wx + (1 - p) * 30}px,${452 - 78}px)`);
  words(r.tag, lt, .78, 5.5, { stagger: .035, dur: .38, rise: 16 });
  words(r.sub, lt, 1.35, 5.5, { stagger: .03, dur: .36, rise: 12 });
  return { x: lerp(960, LOCK.bx, mv), y: lerp(430, 452, mv), R: lerp(190, 64, mv), op: 1 - out, lblOp: 1 - seg(lt, 0, .25), merOp: 1 - .6 * mv, vecLen: 1, theta: Math.PI / 2, phi: phiAbs(t), tiltX: .32, orbitY: .18 * t };
}, false);

// ===================== S2 PLAYGROUND =====================
const DOTS1 = (() => { const a = Array(100).fill(0).map((_, i) => i < 51 ? 1 : 0); let s = 7; for (let i = 99; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
scene('s2', 16, root => {
  const hl = mkHL(root, 'Put a qubit anywhere. Then look at it.');
  const card = div(root, 'card', '', 'left:1040px;top:196px;width:760px;height:820px');
  const L = (x, y, html, st = '') => div(card, 'abs', html, `left:${x}px;top:${y}px;${st}`);
  L(40, 34, 'Prepare', 'font-size:15px;color:var(--dim)');
  L(40, 70, '<span class="math" style="font-size:26px">θ</span>&nbsp; tilt away from <span class="math">|0⟩</span>', 'font-size:19px;color:var(--soft)');
  const tv = L(640, 70, '0°', 'width:80px;text-align:right;font-family:var(--mono);font-size:20px');
  L(40, 170, '<span class="math" style="font-size:26px">φ</span>&nbsp; phase', 'font-size:19px;color:var(--soft)');
  const pv = L(640, 170, '0°', 'width:80px;text-align:right;font-family:var(--mono);font-size:20px');
  const track = (y) => { L(40, y, '', 'width:680px;height:6px;border-radius:3px;background:var(--line)'); const f = L(40, y, '', 'width:0;height:6px;border-radius:3px;background:var(--lilac)'); const k = L(27, y - 10, '', 'width:26px;height:26px;border-radius:50%;background:#f2eeff;box-shadow:0 0 0 5px rgba(165,139,255,.35)'); return { f, k }; };
  const th = track(128), ph = track(228);
  L(40, 272, 'Or apply a gate', 'font-size:15px;color:var(--dim)');
  const gbtn = ['X', 'Y', 'Z', 'H', 'S', 'T'].map((g, i) => L(40 + i * 84, 300, g, 'width:68px;height:56px;border-radius:12px;background:#231552;border:1.5px solid #4a3790;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:24px'));
  L(40, 384, '', 'width:680px;height:1px;background:var(--line)');
  const psi = L(40, 404, '', 'font-family:var(--math);font-size:34px;white-space:nowrap');
  const prow = (y, lab) => { L(40, y, lab, 'font-family:var(--math);font-size:22px;color:var(--soft)'); L(150, y + 9, '', 'width:440px;height:14px;border-radius:7px;background:var(--line)'); const f = L(150, y + 9, '', 'width:0;height:14px;border-radius:7px'); const v = L(610, y, '', 'width:110px;text-align:right;font-family:var(--mono);font-size:21px'); return { f, v }; };
  const p0 = prow(470, 'P(|0⟩)'), p1 = prow(512, 'P(|1⟩)');
  const msg = L(40, 566, '', 'font-size:21px;color:var(--soft)');
  L(40, 618, 'Measure', 'height:48px;padding:0 22px;border-radius:10px;border:1.5px solid var(--line2);display:flex;align-items:center;font-weight:500;font-size:18px');
  const mbtn = L(190, 618, 'Measure 100 copies', 'height:48px;padding:0 22px;border-radius:10px;background:var(--lilac);color:#140a2b;display:flex;align-items:center;font-weight:600;font-size:18px');
  const cnt = L(460, 630, '', 'font-family:var(--mono);font-size:19px;color:var(--soft);white-space:nowrap');
  const dots = []; for (let i = 0; i < 100; i++) dots.push(L(40 + (i % 20) * 34.5 + 4, 700 + Math.floor(i / 20) * 20 + 0, '', 'width:24px;height:12px;border-radius:6px;border:1.5px solid var(--line2)'));
  const cap1 = wordify(div(root, 'abs', 'φ changes nothing you can measure here,', 'left:130px;top:906px;font-family:var(--serif);font-size:36px;color:var(--soft);white-space:nowrap'));
  const cap2 = wordify(div(root, 'abs', 'and everything a later gate does.', 'left:130px;top:954px;font-family:var(--serif);font-size:36px;color:var(--text);white-space:nowrap'));
  CURSOR.push({ T0: T.s2, vis: [.95, 14.3], press: [[1.6, 3.35], [4.1, 4.2], [5.85, 7.65], [8.4, 8.5], [9.55, 9.65], [11.35, 13.35]],
    k: [[1.0, 1250, 960], [1.6, 1080, 337], [1.75, 1080, 337], [3.3, 1420, 337], [3.6, 1420, 337], [4.1, 1345, 852], [4.3, 1345, 852], [5.4, 1300, 700], [5.85, 1080, 433], [6.05, 1080, 433], [7.6, 1420, 433], [7.9, 1420, 433], [8.4, 1366, 534], [8.6, 1366, 534], [9.5, 1345, 852], [9.8, 1345, 852], [10.9, 760, 520], [11.35, 600, 520], [11.5, 600, 520], [13.3, 860, 540], [13.6, 880, 560]] });
  return { hl, card, tv, pv, th, ph, gbtn, psi, p0, p1, msg, mbtn, cnt, dots, cap1, cap2 };
}, (lt, r, t) => {
  words(r.hl, lt, .35, 15.5);
  rise(r.card, lt, .3, .5, 30);
  const thD = 90 * eio(seg(lt, 1.75, 3.3)) + 90 * eio(seg(lt, 8.55, 9.25)), phD = 180 * eio(seg(lt, 6.05, 7.6));
  const setK = (o, v) => { o.f.style.width = 680 * v + 'px'; o.k.style.left = (27 + 680 * v) + 'px'; };
  setK(r.th, thD / 180); setK(r.ph, phD / 360);
  setText(r.tv, Math.round(thD) + '°'); setText(r.pv, Math.round(phD) + '°');
  const th = thD * Math.PI / 180, ph = phD * Math.PI / 180, a = Math.cos(th / 2), b = Math.sin(th / 2);
  let bs;
  if (b < .0005) bs = `+ 0.000|1⟩`; else if (a < .0005) bs = `+ ${b.toFixed(3)}|1⟩`; else if (phD < .5) bs = `+ ${b.toFixed(3)}|1⟩`; else if (phD > 179.5) bs = `− ${b.toFixed(3)}|1⟩`;
  else bs = `+ ${b.toFixed(3)}<span style="font-size:.8em">e<sup style="font-size:.6em">i·${Math.round(phD)}°</sup></span>|1⟩`;
  setText(r.psi, `|ψ⟩ = ${a.toFixed(3)}|0⟩ ${bs}`);
  const P0 = a * a, P1 = b * b;
  r.p0.f.style.width = 440 * P0 + 'px'; r.p0.f.style.background = C.lilac; setText(r.p0.v, (100 * P0).toFixed(1) + '%');
  r.p1.f.style.width = 440 * P1 + 'px'; r.p1.f.style.background = C.cyan; setText(r.p1.v, (100 * P1).toFixed(1) + '%');
  setText(r.msg, P0 > .9995 ? 'Measuring now gives <span class="math">|0⟩</span>, for certain.' : P1 > .9995 ? 'Measuring now gives <span class="math">|1⟩</span>, for certain.' : 'Each look gives a plain 0 or 1, at these odds.');
  r.gbtn[3].style.background = lt > 8.4 && lt < 8.9 ? '#3a2580' : '#231552'; r.gbtn[3].style.borderColor = lt > 8.4 && lt < 9.3 ? C.lilac : '#4a3790';
  r.mbtn.style.transform = (lt > 4.1 && lt < 4.2) || (lt > 9.55 && lt < 9.65) ? 'scale(.96)' : 'none';
  let n0 = 0, n1 = 0;
  r.dots.forEach((d, i) => {
    const t1 = 4.25 + i * .0075, t2 = 9.75 + i * .0075; let v = null;
    if (lt >= t2) v = 1; else if (lt >= t1) v = DOTS1[i];
    if (lt > 9.7 && lt < t2) v = null;
    if (v === null) { d.style.background = 'transparent'; d.style.borderColor = '#3d2d78'; }
    else { d.style.background = v ? C.cyan : C.lilac; d.style.borderColor = 'transparent'; v ? n1++ : n0++; }
  });
  setText(r.cnt, n0 + n1 ? `${n0} × 0 &nbsp;&nbsp; ${n1} × 1` : '');
  words(r.cap1, lt, 6.3, 15.5, { stagger: .04 }); words(r.cap2, lt, 8.7, 15.5, { stagger: .04 });
  const sp = eob(seg(lt, .15, .75)), out = seg(lt, 15.6, 16);
  return { x: 580, y: 560, R: 232 * Math.max(sp, .001), op: seg(lt, .15, .4) * (1 - out), lblOp: 1, vecLen: 1, theta: th, phi: ph, tiltX: .3, orbitY: -.55 + 1.3 * eio(seg(lt, 11.5, 13.3)) };
});

// ===================== S3 PATH =====================
const UNITS = [
  { tag: 'Unit 0', name: 'What a qubit is not', meta: '3 nodes · 11 min', n: ['An honest coin', 'A lean, not an answer', 'Where the coin analogy dies'] },
  { tag: 'Unit 1', name: 'One qubit', meta: '6 nodes · 20 min', n: ['X flips it', 'Getting back to certainty', 'Measuring is deciding', 'The sphere', 'Any odds you like', 'Build it unaided'] },
  { tag: 'Unit 2', name: 'Phase', meta: '5 nodes · 19 min', n: ['The gate that does nothing', 'The same odds, a different state', 'Quarter turns', 'Invisible, then decisive', 'Phase, unaided'] },
  { tag: 'Unit 3', name: 'Two qubits', meta: '5 nodes · 23 min', n: ['Two separate stories', 'One qubit acting on another', 'Two coins, one answer', 'Where the sphere runs out', 'Three that agree'] }];
const NODEX = []; { let x = 300; UNITS.forEach(u => { u.x = x - 40; u.n.forEach(() => { NODEX.push(x); x += 220; }); x += 110; }); }
const PATH_END = NODEX[18] + 160, CUR_NODE = 10;
const dotX = lt => lerp(NODEX[0], NODEX[CUR_NODE], eio(seg(lt, .8, 6.2)));
scene('s3', 14, root => {
  const hl = mkHL(root, 'Entanglement is not hard. It is a stack of easy things.');
  const trk = div(root, 'abs', '', 'left:0;top:0;width:5000px;height:1080px');
  const sg = sv('svg', { width: 5000, height: 1080, style: 'position:absolute;left:0;top:0' }, trk);
  sv('line', { x1: NODEX[0] - 120, y1: 540, x2: PATH_END, y2: 540, stroke: '#3a2c70', 'stroke-width': 3 }, sg);
  const prog = sv('line', { x1: NODEX[0] - 120, y1: 540, x2: NODEX[0], y2: 540, stroke: C.mint, 'stroke-width': 3.5, opacity: .8 }, sg);
  UNITS.forEach(u => div(trk, 'abs', `<div class="mono" style="font-size:15px;color:var(--dim)">${u.tag}</div><div class="serif" style="font-size:34px;margin-top:4px">${u.name}</div><div style="font-size:16px;color:var(--muted);margin-top:4px">${u.meta}</div>`, `left:${u.x}px;top:318px;white-space:nowrap`));
  const nodes = []; let k = 0;
  UNITS.forEach(u => u.n.forEach(name => { const x = NODEX[k];
    const box = div(trk, 'abs', `<span class="mono">${k + 1}</span>`, `left:${x - 38}px;top:502px;width:76px;height:76px;border-radius:16px;background:#1f1347;border:2px solid #3d2d78;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--muted)`);
    const chk = div(trk, 'abs', '<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="#5ef0b0"/><path d="M7.5 13.5l3.5 3.5 7.5-8" fill="none" stroke="#0f2a20" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>', `left:${x + 22}px;top:490px;visibility:hidden`);
    const lab = div(trk, 'abs', name, `left:${x - 100}px;top:596px;width:200px;text-align:center;font-size:18px;line-height:1.3;color:var(--muted)`);
    nodes.push({ box, chk, lab, x }); k++; }));
  const next = div(trk, 'abs', 'Up next', `left:${NODEX[CUR_NODE] - 44}px;top:452px;width:88px;text-align:center;font-size:14px;font-weight:600;color:#140a2b;background:var(--lilac);border-radius:999px;padding:3px 0`);
  const dot = div(trk, 'abs', '', 'left:0;top:0;width:22px;height:22px;border-radius:50%;background:#72e4ff;box-shadow:0 0 18px 6px rgba(114,228,255,.55)');
  div(root, 'abs', '', 'left:0;top:280px;width:140px;height:480px;background:linear-gradient(90deg,#140a2b,transparent)');
  div(root, 'abs', '', 'left:1780px;top:280px;width:140px;height:480px;background:linear-gradient(270deg,#140a2b,transparent)');
  const stats = [['19', 'lesson nodes, each ending in a circuit you built'], ['14', 'challenges: reach, golf and bug hunt'], ['14', 'catalogued misconceptions the tutor knows by name'], ['13', 'rules that diagnose without calling a model']]
    .map((s, i) => { const e = div(root, 'abs', `<div class="serif n0" style="font-size:88px;line-height:1;font-weight:500">${s[0]}</div><div style="font-size:21px;line-height:1.35;color:var(--soft);margin-top:10px;width:330px">${s[1]}</div>`, `left:${120 + i * 430}px;top:780px`); e._n = +s[0]; e._v = e.querySelector('.n0'); return e; });
  return { hl, trk, prog, nodes, next, dot, stats };
}, (lt, r) => {
  words(r.hl, lt, .35, 13.55, { stagger: .04 });
  const dx = dotX(lt), panA = Math.min(0, 760 - dx), panEnd = 1820 - PATH_END;
  const pan = lerp(panA, panEnd, eio(seg(lt, 6.5, 9.3)));
  r.trk.style.transform = `translateX(${pan}px)`;
  r.prog.setAttribute('x2', dx);
  show(r.dot, seg(lt, .5, .8), `translate(${dx - 11}px,${529}px)`);
  r.nodes.forEach((n, i) => {
    const passed = i < CUR_NODE && dx >= n.x - 2, cur = i === CUR_NODE && lt > 6.15;
    const pp = passed ? seg(dx, n.x, n.x + 40) : 0;
    n.box.style.borderColor = cur ? C.lilac : passed ? mix('#3d2d78', C.mint, pp) : '#3d2d78';
    n.box.style.color = cur || passed ? C.text : (i > CUR_NODE ? '#5a4f8a' : C.muted);
    n.box.style.boxShadow = cur ? `0 0 0 ${6 + 4 * Math.sin(lt * 5)}px rgba(165,139,255,.25)` : 'none';
    n.box.style.transform = passed ? `scale(${1 + .12 * Math.sin(Math.PI * pp)})` : 'none';
    n.lab.style.color = cur ? C.text : passed ? C.soft : (i > CUR_NODE ? '#5a4f8a' : C.muted);
    n.chk.style.visibility = passed ? 'visible' : 'hidden'; n.chk.style.opacity = pp;
  });
  pop(r.next, lt, 6.2, .35);
  r.stats.forEach((s, i) => { rise(s, lt, 9.4 + i * .15, .45, 24); s._v.textContent = Math.round(s._n * eo(seg(lt, 9.4 + i * .15, 10.4 + i * .15))); });
});

// ===================== S4 BENCH =====================
scene('s4', 24, root => {
  const R = {};
  R.hls = ['A shape to hit, not a paragraph.', 'Drag a gate. The code writes itself.', 'Run it. Get told which gate is wrong.', 'Graded by physics, not by gate names.', 'Then the why, after you try.'].map(s => mkHL(root, s));
  R.fr = div(root, 'layer'); R.frame = div(R.fr, 'abs', '<div class="hr" style="left:0;top:63px;width:1678px;height:1px"></div><div class="hr" style="left:112px;top:64px;width:1px;height:764px"></div><div class="hr" style="left:112px;top:470px;width:928px;height:1px"></div>'); R.frame.id = 'frame';
  R.top = div(root, 'layer btop', `<div class="abs logo"><svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="rgba(165,139,255,.15)" stroke="#a58bff" stroke-width="1.6"/><ellipse cx="15" cy="15" rx="13" ry="4" fill="none" stroke="#a58bff" stroke-width="1.2" opacity=".8"/><line x1="15" y1="15" x2="24" y2="8" stroke="#72e4ff" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="8" r="2.4" fill="#72e4ff"/></svg>Quriosity</div><div class="abs nav"><span>Path</span><span>Challenges</span><span>Arena</span><span class="on">Bench</span><span>Review</span><span>Progress</span></div><div class="abs mode">guided</div><div class="abs ripple"></div><div class="abs run">Run <span class="kk">⌘↵</span></div>`);
  R.ripple = R.top.querySelector('.ripple'); R.run = R.top.querySelector('.run');
  R.pal = div(root, 'layer'); const ps = svgLayer(R.pal);
  sv('text', { x: 146, y: 291, 'font-family': 'IBM Plex Sans', 'font-size': 15, fill: C.dim }, ps).textContent = 'Gates';
  R.tiles = ['H', 'X', 'Y', 'Z', 'S', 'T', 'CX', 'M'].map((n, i) => { const y = 344 + i * 72, g = sv('g', {}, ps);
    sv('rect', { x: 146, y: y - 30, width: 60, height: 60, rx: 12, fill: C.tile, stroke: C.tileline, 'stroke-width': 1.6 }, g);
    if (n === 'CX') { sv('line', { x1: 176, y1: y - 8, x2: 176, y2: y + 16, stroke: C.lilac2, 'stroke-width': 2 }, g); sv('circle', { cx: 176, cy: y + 16, r: 5, fill: C.lilac2 }, g); sv('circle', { cx: 176, cy: y - 10, r: 10, fill: C.tile, stroke: C.lilac2, 'stroke-width': 2 }, g); sv('line', { x1: 166, y1: y - 10, x2: 186, y2: y - 10, stroke: C.lilac2, 'stroke-width': 2 }, g); sv('line', { x1: 176, y1: y - 20, x2: 176, y2: y, stroke: C.lilac2, 'stroke-width': 2 }, g); }
    else if (n === 'M') { sv('path', { d: `M160 ${y + 8} A16 16 0 0 1 192 ${y + 8}`, fill: 'none', stroke: C.lilac2, 'stroke-width': 2 }, g); sv('line', { x1: 176, y1: y + 10, x2: 186, y2: y - 10, stroke: C.lilac2, 'stroke-width': 2, 'stroke-linecap': 'round' }, g); }
    else sv('text', { x: 176, y: y + 9, 'text-anchor': 'middle', 'font-family': 'IBM Plex Sans', 'font-weight': 600, 'font-size': 25, fill: C.text }, g).textContent = n;
    return g; });
  R.cv = div(root, 'layer');
  R.chip = div(R.cv, 'abs chip', '<b>Target</b><span>Bell pair</span><span class="m">(|00⟩ + |11⟩) / √2</span>');
  const cs = svgLayer(R.cv);
  R.cols = [460, 600, 740, 880, 1020].map((x, i) => { sv('line', { x1: x, y1: 370, x2: x, y2: 562, stroke: 'rgba(165,139,255,.10)', 'stroke-width': 1.5, 'stroke-dasharray': '3 6' }, cs); const t = sv('text', { x, y: 356, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono', 'font-size': 15, fill: C.dim }, cs); t.textContent = i + 1; return t; });
  R.w0 = sv('line', { x1: 360, y1: 406, x2: 1120, y2: 406, 'stroke-width': 2.2 }, cs); R.w1 = sv('line', { x1: 360, y1: 526, x2: 1120, y2: 526, 'stroke-width': 2.2 }, cs);
  const mg = sv('g', {}, cs); measBox(mg, 1020, 406); measBox(mg, 1020, 526);
  R.gH = sv('g', {}, cs); gateBox(R.gH, 460, 406, 'H', C.lilac); R.gH.style.transformBox = 'fill-box'; R.gH.style.transformOrigin = 'center';
  R.ring = sv('rect', { x: 560, y: 366, width: 80, height: 200, rx: 16, fill: 'none', stroke: C.coral, 'stroke-width': 2.5 }, cs);
  R.gCX = sv('g', {}, cs); R.gCX.style.transformBox = 'fill-box'; R.gCX.style.transformOrigin = 'center';
  R.l1 = div(R.cv, 'abs qlbl', 'q<sub>1</sub>', 'left:268px;top:504px'); div(R.cv, 'abs qlbl', 'q<sub>0</sub>', 'left:268px;top:384px');
  div(R.cv, 'abs ket', '|0⟩', 'left:312px;top:392px'); div(R.cv, 'abs ket', '|0⟩', 'left:312px;top:512px');
  R.res = div(root, 'layer');
  div(R.res, 'abs resh', 'Measured <span>1024 shots</span>'); div(R.res, 'abs legend', '<i></i>Target');
  const ch = svgLayer(R.res); const BASE = 966, SC = 340, BX = [420, 560, 700, 840];
  sv('line', { x1: 360, y1: BASE, x2: 900, y2: BASE, stroke: '#30225f', 'stroke-width': 1.5 }, ch);
  [.25, .5].forEach(v => { sv('line', { x1: 360, y1: BASE - v * SC, x2: 900, y2: BASE - v * SC, stroke: 'rgba(165,139,255,.08)' }, ch); sv('text', { x: 352, y: BASE - v * SC + 5, 'text-anchor': 'end', 'font-family': 'IBM Plex Mono', 'font-size': 14, fill: C.dim }, ch).textContent = v === .5 ? '.5' : '.25'; });
  R.ghosts = [0, 3].map(i => sv('rect', { x: BX[i] - 42, y: BASE - .5 * SC, width: 84, height: .5 * SC, rx: 8, fill: 'none', stroke: 'rgba(165,139,255,.6)', 'stroke-width': 1.6, 'stroke-dasharray': '6 5' }, ch));
  R.bars = BX.map(x => sv('rect', { x: x - 36, y: BASE, width: 72, height: 0, rx: 7 }, ch));
  R.cnt = BX.map(x => sv('text', { x, y: BASE, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono', 'font-size': 17, fill: C.soft }, ch));
  ['00', '01', '10', '11'].forEach((s, i) => sv('text', { x: BX[i], y: BASE + 32, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono', 'font-size': 20, fill: C.muted }, ch).textContent = s);
  sv('text', { x: 352, y: BASE + 32, 'text-anchor': 'end', 'font-family': 'STIX Two Math', 'font-size': 20, fill: C.dim }, ch).textContent = 'q₁q₀';
  R.fid = div(R.res, 'abs fid', '<div class="l">Fidelity</div><div class="v">—</div><div class="s2">passes at 0.999</div>'); R.fv = R.fid.querySelector('.v'); R.fs = R.fid.querySelector('.s2');
  R.pass = div(R.res, 'abs pill passpill', '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="#0f2a20" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Passed');
  R.code = div(root, 'layer'); div(R.code, 'abs codebg');
  div(R.code, 'abs tabs', '<span style="color:var(--text)">Qiskit</span><span>Cirq</span><span>PennyLane</span><span>Q#</span>', 'left:1186px;top:274px');
  div(R.code, 'abs', '', 'left:1186px;top:309px;width:48px;height:2px;background:var(--lilac)');
  const cc = div(R.code, 'abs', '', 'left:1160px;top:0;width:640px;height:1080px');
  R.rows = []; for (let i = 0; i < 6; i++) { const r = div(cc, 'row', '<div class="bgx"></div><span class="g"></span><span class="txt"></span>'); R.rows.push({ r, bg: r.children[0], g: r.children[1], tx: r.children[2] }); }
  const tc = (cls, col, body) => div(root, 'abs tcard ' + cls, `<div class="bar" style="background:${col}"></div>${body}`, `border:1px solid ${col}66`);
  R.tut = tc('', C.coral, '<div class="top"><b><i style="background:#ff6f8e"></i>Tutor</b><span>diagnosed in your browser</span></div><h3>Upside-down CNOT in column 2</h3><p>Its control, <span class="q">q<sub>1</sub></span>, is still <span class="math">|0⟩</span>, so it never fires.</p><div class="fix">Fix: put the control on <span class="q">q<sub>0</sub></span></div>');
  R.why = tc('', C.mint, '<div class="top"><b><i style="background:#5ef0b0"></i>Why it works</b><span>Bell state Φ⁺</span></div><h3>Two wires, one answer</h3><p>H splits <span class="q">q<sub>0</sub></span>. The CNOT copies it onto <span class="q">q<sub>1</sub></span>, so both wires always agree.</p>');
  R.ghost = svgLayer(root); R.ghH = sv('g', {}, R.ghost); gateBox(R.ghH, 0, 0, 'H', C.lilac); R.ghCX = sv('g', {}, R.ghost); drawCX(R.ghCX, 0, 0, -120, C.lilac2);
  CURSOR.push({ T0: T.s4, vis: [3.9, 16.0], press: [[4.47, 4.57], [5.62, 5.72], [9.3, 9.4], [13.8, 13.9], [14.72, 14.82]],
    k: [[3.9, 1060, 1010], [4.1, 1060, 1010], [4.5, 176, 344], [4.57, 176, 344], [5.1, 460, 406], [5.2, 460, 406], [5.63, 176, 776], [5.72, 176, 776], [6.4, 600, 526], [6.55, 600, 526], [8.6, 700, 600], [9.25, 1698, 228], [9.45, 1698, 228], [10.0, 1090, 622], [13.3, 1090, 622], [13.78, 600, 526], [13.92, 600, 526], [14.32, 600, 406], [14.36, 600, 406], [14.7, 1698, 228], [14.84, 1698, 228], [15.6, 1420, 760]] });
  return R;
}, (lt, R, t) => {
  const hs = [[.5, 3.5], [3.75, 8.95], [9.1, 13.95], [14.1, 18.6], [18.8, 23.55]]; R.hls.forEach((h, i) => words(h, lt, hs[i][0], hs[i][1]));
  const bi = d => eo(seg(lt, .05 + d, .55 + d)), up = d => (1 - bi(d)) * 50;
  [[R.fr, 0], [R.top, .03], [R.pal, .06], [R.cv, .08], [R.res, .1], [R.code, .12]].forEach(([e, d]) => show(e, bi(d), `translateY(${up(d)}px)`));
  const glowT = lt > 1 && lt < 3.4 ? .5 + .5 * Math.sin((lt - 1) * 5) : 0;
  R.chip.style.boxShadow = `0 0 0 ${glowT * 8}px rgba(165,139,255,${.25 * glowT})`; R.ghosts.forEach(g => g.setAttribute('stroke', `rgba(165,139,255,${.6 + .4 * glowT})`));
  R.tiles[0].style.opacity = lt > 4.5 && lt < 5.1 ? .45 : 1; R.tiles[6].style.opacity = lt > 5.65 && lt < 6.4 ? .45 : 1;
  const hp = seg(lt, 5.1, 5.35); R.gH.style.opacity = lt < 5.1 ? 0 : 1; R.gH.style.transform = `scale(${lerp(.7, 1, eob(hp))})`;
  const fixP = eio(seg(lt, 13.92, 14.32)), err = lt >= 10.2 && lt < 14.36, ringIn = seg(lt, 10.2, 10.45), passT = seg(lt, 15.05, 15.4);
  drawCX(R.gCX, 600, lerp(526, 406, fixP), lerp(406, 526, fixP), err ? C.coral : lt >= 15.05 ? mix(C.lilac, C.mint, passT) : lt >= 14.36 ? C.lilac2 : C.lilac);
  const cxp = seg(lt, 6.4, 6.65); R.gCX.style.opacity = lt < 6.4 ? 0 : 1; R.gCX.style.transform = `scale(${lerp(.75, 1, eob(cxp))})`;
  R.ring.style.opacity = err ? eo(ringIn) * (1 - seg(lt, 14.3, 14.45)) * (.55 + .45 * (.5 + .5 * Math.cos((lt - 10.2) * 5.7))) : 0;
  const pm = lt >= 15.05 ? Math.max(0, 1 - seg(lt, 15.05, 16.2)) : 0;
  R.w0.setAttribute('stroke', lt >= 15.05 ? mix(C.wire, C.mint, .35 + .65 * pm) : C.wire);
  R.w1.setAttribute('stroke', err ? mix(C.wire, C.coral, .75 * eo(ringIn)) : lt >= 15.05 ? mix(C.wire, C.mint, .35 + .65 * pm) : C.wire);
  R.l1.style.color = err ? C.coral : C.text; R.cols.forEach((n, i) => n.setAttribute('fill', i === 1 && err ? C.coral : C.dim));
  const cur = cursorState(t);
  [[R.ghH, 4.52, 5.1], [R.ghCX, 5.67, 6.4]].forEach(([g, a, b]) => { const on = lt >= a && lt < b && cur; g.style.opacity = on ? .92 : 0; if (on) g.setAttribute('transform', `translate(${cur.x},${cur.y}) scale(1.06)`); });
  const rp = [seg(lt, 9.35, 9.8), seg(lt, 14.75, 15.2)].find(p => p > 0 && p < 1) || 0;
  show(R.ripple, rp > 0 ? (1 - rp) * .9 : 0, `scale(${1 + rp * .35},${1 + rp * .8})`);
  R.run.style.transform = (lt > 9.3 && lt < 9.4) || (lt > 14.72 && lt < 14.82) ? 'scale(.96)' : 'none';
  const Wv = [519, 505, 0, 0], Rv = [508, 0, 0, 516], g1 = eo(seg(lt, 9.5, 10)), g2 = eio(seg(lt, 14.84, 15.05)), BASE = 966, SC = 340;
  R.bars.forEach((b, i) => { const v = lerp(Wv[i] * g1, Rv[i], g2) / 1024, hh = v * SC; b.setAttribute('y', BASE - hh); b.setAttribute('height', Math.max(0, hh));
    let col = i === 1 ? C.coral : C.lilac; if (g2 > 0) col = mix(col, C.mint, g2); b.setAttribute('fill', col); b.style.opacity = hh > .5 ? .92 : 0;
    const n = Math.round(lerp(Wv[i] * g1, Rv[i], g2)); R.cnt[i].textContent = n; R.cnt[i].setAttribute('y', BASE - hh - 10); R.cnt[i].style.opacity = n > 8 ? 1 : 0; });
  if (lt < 10) { setText(R.fv, '—'); R.fv.style.color = C.muted; R.fv.style.opacity = 1; R.fv.style.transform = 'none'; }
  else if (lt < 14.84) { const p = eo(seg(lt, 10, 10.25)); setText(R.fv, '0.250'); R.fv.style.color = C.coral; R.fv.style.opacity = p; R.fv.style.transform = `translateY(${(1 - p) * -10}px)`; }
  else if (lt < 15.05) R.fv.style.opacity = 1 - seg(lt, 14.84, 14.98);
  else { const p = seg(lt, 15.05, 15.35); setText(R.fv, '1.000'); R.fv.style.color = C.mint; R.fv.style.opacity = eo(p); R.fv.style.transform = `scale(${lerp(.85, 1, eob(p))})`; R.fv.style.transformOrigin = 'left center'; }
  R.fs.style.opacity = 1 - seg(lt, 15, 15.15); pop(R.pass, lt, 15.1, .3, .7);
  $('frame').style.borderColor = lt >= 15.05 ? mix('#34246a', C.mint, .8 * pm) : '#34246a';
  { const p = eo(seg(lt, 10.35, 10.7)), q = seg(lt, 14.3, 14.5); show(R.tut, p * (1 - q), `translateY(${(1 - p) * 26 + q * 10}px) scale(${lerp(.97, 1, p)})`); }
  { const p = eo(seg(lt, 19.1, 19.5)); show(R.why, p, `translateY(${(1 - p) * 26}px) scale(${lerp(.97, 1, p)})`); }
  const Lr = [{ tx: 'from qiskit import QuantumCircuit', h: 1 }, { tx: '', h: 1 }, { tx: 'qc = QuantumCircuit(2, 2)', h: 1 }];
  Lr.push({ tx: 'qc.h(0)'.slice(0, Math.round(7 * seg(lt, 5.15, 5.4))), h: eo(seg(lt, 5.1, 5.25)), caret: lt > 5.13 && lt < 5.6, flash: lt > 5.15 ? .18 * (1 - seg(lt, 5.5, 6.3)) : 0 });
  let t5 = 'qc.cx(1, 0)'.slice(0, Math.round(11 * seg(lt, 6.46, 6.8))), c5 = lt > 6.43 && lt < 6.95, f5 = lt > 6.46 ? .18 * (1 - seg(lt, 6.9, 7.7)) : 0, x5 = 0;
  if (lt >= 14.36) { const del = Math.round(5 * seg(lt, 14.36, 14.44)), add = Math.round(5 * seg(lt, 14.45, 14.57)); t5 = add > 0 ? 'qc.cx(' + '0, 1)'.slice(0, add) : 'qc.cx(1, 0)'.slice(0, 11 - del); c5 = lt < 14.75; f5 = 0; x5 = .2 * (1 - seg(lt, 14.9, 16)); }
  Lr.push({ tx: t5, h: eo(seg(lt, 6.4, 6.55)), caret: c5, flash: f5, err, fix: x5 }); Lr.push({ tx: 'qc.measure([0, 1], [0, 1])', h: 1 });
  let y = 334, num = 0;
  Lr.forEach((ln, i) => { const o = R.rows[i]; if (ln.h > .5) num++; o.r.style.top = y + 'px'; o.g.textContent = ln.h > .5 ? num : '';
    const key = ln.tx + (ln.caret ? '|' : ''); if (o.k !== key) { o.k = key; o.tx.innerHTML = hl(ln.tx) + (ln.caret ? '<span class="caret"></span>' : ''); }
    o.r.style.opacity = ln.h; let bg = 'transparent', bl = 'none';
    if (ln.err) { bg = `rgba(255,111,142,${.16 * eo(ringIn)})`; bl = `3px solid rgba(255,111,142,${eo(ringIn)})`; } else if (ln.fix > 0) bg = `rgba(94,240,176,${ln.fix})`; else if (ln.flash > 0) bg = `rgba(165,139,255,${ln.flash})`;
    o.bg.style.background = bg; o.bg.style.borderLeft = bl; y += 38 * ln.h; });
});

// ===================== S5 TUTOR + FIREWALL =====================
scene('s5', 18, root => {
  const R = {};
  R.hls = [['Ask why. The tutor answers in plain words.', .4, 6.6], ['A physics firewall checks every claim against the simulator.', 6.8, 12.4], ["If it doesn't match, you never see it.", 12.6, 17.55]].map(([s, a, b]) => { const e = mkHL(root, s); e._a = a; e._b = b; return e; });
  const ST = [['Rule engine', '13 rules, no model, under 200 ms'], ['Docs', 'retrieves what applies'], ['Language model', 'drafts an answer'], ['Physics firewall', 'checks every claim'], ['You', 'see only what passed']];
  const icons = ['<path d="M8 10h20M8 18h14M8 26h18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>', '<path d="M10 7h13l5 5v17H10z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M14 17h10M14 22h8" stroke="currentColor" stroke-width="2"/>', '<circle cx="18" cy="18" r="10" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M13 18h10M18 13v10" stroke="currentColor" stroke-width="2.2"/>', '<path d="M18 5l11 4v8c0 7-5 12-11 14C12 29 7 24 7 17V9z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M13 18l4 4 7-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>', '<circle cx="18" cy="13" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 29c1-6 5-9 10-9s9 3 10 9" fill="none" stroke="currentColor" stroke-width="2.2"/>'];
  const ps = svgLayer(root);
  R.st = ST.map((s, i) => { const x = 120 + i * 345; if (i < 4) sv('line', { x1: x + 300, y1: 252, x2: x + 345, y2: 252, stroke: '#3d2d78', 'stroke-width': 2 }, ps);
    const e = div(root, 'card', `<div style="display:flex;gap:14px;align-items:center"><svg width="36" height="36" viewBox="0 0 36 36" style="color:var(--muted)">${icons[i]}</svg><div><div style="font-size:22px;font-weight:600">${s[0]}</div><div style="font-size:15px;color:var(--muted);margin-top:2px">${s[1]}</div></div></div>`, `left:${x}px;top:196px;width:300px;height:112px;padding:26px 22px;border-radius:14px`); e._i = e.querySelector('svg'); return e; });
  R.pk = div(root, 'abs', '', 'left:0;top:0;width:16px;height:16px;border-radius:50%;background:#72e4ff;box-shadow:0 0 14px 5px rgba(114,228,255,.5)');
  R.q = div(root, 'card', '<div style="font-size:15px;color:var(--dim)">Learner asks</div><div class="qt" style="font-size:28px;margin-top:6px;font-family:var(--serif)"></div>', 'left:120px;top:356px;width:880px;height:110px;padding:18px 26px;border-radius:14px'); R.qt = R.q.querySelector('.qt');
  R.dr = div(root, 'card', '<div style="display:flex;justify-content:space-between;font-size:16px;color:var(--muted)"><span style="font-weight:600;color:var(--soft)">Draft from the language model</span><span>not shown yet</span></div><div class="dt" style="font-size:27px;line-height:1.55;margin-top:14px;color:var(--soft)">H puts <span class="q">q<sub>0</sub></span> halfway between 0 and 1, and the CNOT copies that onto <span class="q">q<sub>1</sub></span>. You will read <span class="c1">00 about half the time</span>, and <span class="c2">01 about a quarter of the time</span>.</div>', 'left:120px;top:490px;width:880px;height:360px;padding:24px 30px');
  R.dt = wordify(R.dr.querySelector('.dt')); R.c1 = [...R.dr.querySelectorAll('.c1')][0]; R.c2 = R.dr.querySelector('.c2');
  // re-wrap claim spans: wordify split them, so mark the word spans that belong to each claim
  R.c1w = R.dt._w.filter(w => w.closest('.c1') || w.querySelector('.c1')); R.c2w = R.dt._w.filter(w => w.closest('.c2') || w.querySelector('.c2'));
  R.stamp = div(root, 'abs', 'Discarded', 'left:640px;top:760px;font-family:var(--serif);font-weight:600;font-size:44px;color:var(--coral);border:3px solid var(--coral);border-radius:12px;padding:4px 22px;transform-origin:center');
  R.ok = div(root, 'card', '<div style="display:flex;justify-content:space-between;align-items:center;font-size:16px"><span style="font-weight:600;display:flex;gap:9px;align-items:center"><i style="width:9px;height:9px;border-radius:50%;background:#5ef0b0;display:inline-block"></i>Tutor</span><span class="pill" style="border:1.5px solid rgba(94,240,176,.55);color:var(--mint);font-size:15px">checked against 1024 shots</span></div><div style="font-family:var(--serif);font-size:36px;line-height:1.35;margin-top:22px">H splits <span class="q">q<sub>0</sub></span>. The CNOT copies it onto <span class="q">q<sub>1</sub></span>, so both wires always agree: you read 00 or 11, never 01.</div>', 'left:120px;top:490px;width:880px;height:360px;padding:26px 32px;border-color:rgba(94,240,176,.5)');
  R.rc = div(root, 'card', '<div style="display:flex;justify-content:space-between;font-size:16px"><span style="font-weight:600;color:var(--soft)">Simulator result</span><span style="color:var(--muted)">1024 shots, F = 1.000</span></div>', 'left:1080px;top:356px;width:720px;height:494px;padding:24px 30px');
  const rs = svgLayer(R.rc); rs.style.left = '-1080px'; rs.style.top = '-356px';
  const BX = [1250, 1390, 1530, 1670], BASE = 690, SC = 400;
  sv('line', { x1: 1180, y1: BASE, x2: 1740, y2: BASE, stroke: '#30225f', 'stroke-width': 1.5 }, rs);
  R.rb = [508, 0, 0, 516].map((v, i) => { const hh = v / 1024 * SC; sv('rect', { x: BX[i] - 40, y: BASE - hh, width: 80, height: hh, rx: 7, fill: C.mint, opacity: .9 }, rs); const t = sv('text', { x: BX[i], y: BASE - hh - 10, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono', 'font-size': 18, fill: C.soft }, rs); t.textContent = v; sv('text', { x: BX[i], y: BASE + 32, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono', 'font-size': 20, fill: C.muted }, rs).textContent = ['00', '01', '10', '11'][i]; return { x: BX[i], y: BASE - hh }; });
  R.hi = [0, 1].map(i => sv('rect', { x: BX[i] - 52, y: 460, width: 104, height: 262, rx: 12, fill: 'none', 'stroke-width': 2.5 }, rs));
  R.checks = [['“00 about half the time”', 'measured 0.496', 'mint'], ['“01 about a quarter of the time”', 'measured 0.000', 'coral']].map((c, i) => div(R.rc, 'abs', `<span style="color:var(--soft)">${c[0]}</span><span style="display:flex;gap:10px;align-items:center"><span class="mono" style="color:var(--muted)">${c[1]}</span><span class="pill" style="background:var(--${c[2]});color:#140a2b;font-weight:600;padding:3px 12px">${c[2] === 'mint' ? 'true' : 'false'}</span></span>`, `left:30px;top:${398 + i * 38}px;width:660px;display:flex;justify-content:space-between;font-size:18px`));
  R.link = svgLayer(root); R.ln = [0, 1].map(() => sv('path', { fill: 'none', 'stroke-width': 2.5, pathLength: 1 }, R.link));
  R.scan = div(root, 'abs', '', 'left:0;top:490px;width:90px;height:360px;background:linear-gradient(90deg,transparent,rgba(255,198,110,.35),transparent)');
  return R;
}, (lt, R) => {
  R.hls.forEach(h => words(h, lt, h._a, h._b));
  const stT = [2.4, 3.0, 3.6, 7.0, 14.0], stC = [C.lilac, C.lilac, C.lilac, C.amber, C.mint];
  R.st.forEach((e, i) => { const p = rise(e, lt, .3 + i * .08, .45, 20); const on = lt >= stT[i]; const fl = on ? 1 - seg(lt, stT[i], stT[i] + .6) : 0;
    e.style.borderColor = on ? stC[i] : '#3d2d78'; e._i.style.color = on ? stC[i] : C.muted; e.style.boxShadow = on ? `0 0 ${18 + 30 * fl}px ${stC[i]}${fl > .05 ? '66' : '33'}` : '0 30px 80px rgba(0,0,0,.35)'; });
  let si = 0; stT.forEach((s, i) => { if (lt >= s - .3) si = i; }); const prev = Math.max(0, si - 1), pp = eio(seg(lt, stT[si] - .3, stT[si]));
  const pxAt = i => 120 + i * 345 + 150; show(R.pk, lt > 2.1 ? 1 : 0, `translate(${lerp(pxAt(prev), pxAt(si), si === 0 ? 1 : pp) - 8}px,${316}px)`);
  rise(R.q, lt, .6, .45, 20); typed(R.qt, 'Why do both wires always agree?', lt, .9, 2.2);
  const dIn = eo(seg(lt, 3.6, 4)), dOut = seg(lt, 13.5, 13.8), drop = eo(seg(lt, 12.8, 13.3));
  show(R.dr, dIn * (1 - dOut) * (1 - .55 * drop), `translateY(${(1 - dIn) * 20 + drop * 14}px) scale(${1 - .03 * drop})`);
  R.dt._w.forEach((w, i) => { w.style.opacity = lt >= 3.85 + i * .065 ? 1 : 0; w.style.transform = 'none'; });
  const c1a = seg(lt, 7.4, 7.7), c1ok = lt >= 8.4, c2a = seg(lt, 9.0, 9.3), c2bad = lt >= 9.9;
  R.c1w.forEach(w => { w.style.background = c1ok ? 'rgba(94,240,176,.22)' : `rgba(255,198,110,${.28 * c1a})`; w.style.borderRadius = '4px'; });
  R.c2w.forEach(w => { w.style.background = c2bad ? 'rgba(255,111,142,.25)' : `rgba(255,198,110,${.28 * c2a})`; w.style.borderRadius = '4px'; w.style.textDecoration = lt > 12.85 ? 'line-through' : 'none'; w.style.textDecorationColor = C.coral; });
  R.dr.style.borderColor = c2bad ? C.coral : '#3d2d78';
  show(R.scan, lt > 7.3 && lt < 9.9 ? 1 : 0, `translateX(${lerp(120, 910, seg(lt, 7.3, 9.9))}px)`);
  rise(R.rc, lt, 1.0, .5, 24);
  R.hi[0].setAttribute('stroke', C.mint); R.hi[0].style.opacity = lt > 8.0 && lt < 12.6 ? eo(seg(lt, 8.0, 8.4)) : 0;
  R.hi[1].setAttribute('stroke', C.coral); R.hi[1].style.opacity = lt > 9.5 && lt < 12.6 ? eo(seg(lt, 9.5, 9.9)) : 0;
  rise(R.checks[0], lt, 8.4, .35, 12); rise(R.checks[1], lt, 9.9, .35, 12);
  const link = (pe, words, bar, a, b, col) => { const p = seg(lt, a, b); if (p <= 0 || lt > 12.6) { pe.style.opacity = 0; return; } const w = words[words.length - 1].getBoundingClientRect(); const x1 = w.right + 4, y1 = w.top + w.height / 2, x2 = bar.x - 40, y2 = bar.y - 20;
    pe.setAttribute('d', `M${x1} ${y1} C ${x1 + 160} ${y1}, ${x2 - 160} ${y2}, ${x2} ${y2}`); pe.setAttribute('stroke', col); pe.style.opacity = .9; pe.setAttribute('stroke-dasharray', `${eo(p)} 1`); };
  link(R.ln[0], R.c1w, R.rb[0], 7.7, 8.2, C.mint); link(R.ln[1], R.c2w, R.rb[1], 9.2, 9.7, C.coral);
  { const p = seg(lt, 13.0, 13.25), q = seg(lt, 13.5, 13.8); show(R.stamp, eo(p) * (1 - q), `rotate(-7deg) scale(${lerp(1.6, 1, eo(p))})`); }
  { const p = eo(seg(lt, 13.8, 14.3)); show(R.ok, p, `translateY(${(1 - p) * 24}px)`); }
});

// ===================== S6 DIALECTS =====================
scene('s6', 8, root => {
  const R = { hl: mkHL(root, 'Switching SDK changes the spelling, never the circuit.') };
  R.cir = div(root, 'layer'); const cs = svgLayer(R.cir);
  [520, 640].forEach(y => sv('line', { x1: 250, y1: y, x2: 900, y2: y, stroke: C.wire, 'stroke-width': 2.2 }, cs));
  const g = sv('g', {}, cs); gateBox(g, 400, 520, 'H', C.lilac); drawCX(sv('g', {}, cs), 560, 520, 640, C.lilac); measBox(g, 800, 520); measBox(g, 800, 640);
  div(R.cir, 'abs qlbl', 'q<sub>0</sub>', 'left:180px;top:498px'); div(R.cir, 'abs qlbl', 'q<sub>1</sub>', 'left:180px;top:618px');
  R.pulse = [520, 640].map(y => sv('circle', { cx: 250, cy: y, r: 7, fill: C.cyan, style: 'filter:drop-shadow(0 0 8px #72e4ff)' }, cs));
  R.card = div(root, 'card', '', 'left:1000px;top:300px;width:800px;height:540px;background:#120a2a');
  const names = ['Qiskit', 'Cirq', 'PennyLane', 'Q#', 'OpenQASM']; R.tabs = div(R.card, 'abs tabs', names.map(n => `<span>${n}</span>`).join(''), 'left:30px;top:22px');
  R.tl = div(R.card, 'abs', '', 'top:56px;height:2px;background:var(--lilac)');
  R.codes = ['qiskit', 'cirq', 'penny', 'qs', 'qasm'].map(k => { const c = div(R.card, 'abs', '', 'left:0;top:0;width:800px;height:540px'); c._rows = LANG[k].map((ln, j) => div(c, 'row', `<span class="g">${j + 1}</span><span class="txt">${hl(ln)}</span>`, `top:${86 + j * 38}px;width:800px`)); return c; });
  return R;
}, (lt, R) => {
  words(R.hl, lt, .35, 7.55, { stagger: .04 });
  rise(R.cir, lt, .3, .5, 24); rise(R.card, lt, .4, .5, 24);
  if (!R.TB) { R.TB = [...R.tabs.children].map(s => ({ x: s.offsetLeft + 30, w: s.offsetWidth })); }
  const SW = [1.7, 2.9, 4.1, 5.3]; let ai = 0; SW.forEach(s => { if (lt >= s) ai++; }); const last = ai ? SW[ai - 1] : 0;
  R.codes.forEach((c, i) => { if (i === ai) { c.style.visibility = 'visible'; c.style.opacity = 1; c._rows.forEach((r, j) => { const p = ai ? eo(seg(lt, last + .05 + j * .022, last + .27 + j * .022)) : 1; r.style.opacity = p; r.style.transform = `translateX(${(1 - p) * 14}px)`; }); }
    else if (i === ai - 1) { const q = seg(lt, last, last + .08); c.style.opacity = 1 - q; c.style.visibility = q >= 1 ? 'hidden' : 'visible'; } else c.style.visibility = 'hidden'; });
  [...R.tabs.children].forEach((s, i) => s.style.color = i === ai ? C.text : C.muted);
  const f = R.TB[Math.max(0, ai - 1)], to = R.TB[ai], p = ai ? eio(seg(lt, last, last + .2)) : 1; R.tl.style.left = lerp(f.x, to.x, p) + 'px'; R.tl.style.width = lerp(f.w, to.w, p) + 'px';
  const pp = ai ? seg(lt, last, last + .6) : 0; R.pulse.forEach(c => { c.setAttribute('cx', lerp(250, 900, pp)); c.style.opacity = pp > 0 && pp < 1 ? 1 : 0; });
});

// ===================== S7 ARENA =====================
scene('s7', 18, root => {
  const R = {};
  R.hls = [['Race someone to a state.', .35, 6.6], ['The server re-grades every answer. Nobody can cheat.', 6.8, 12.45], ['Nobody online? A bot takes the seat.', 12.65, 17.55]].map(([s, a, b]) => { const e = mkHL(root, s); e._a = a; e._b = b; return e; });
  const pcard = (x, av, name, rating, col) => div(root, 'card', `<div style="display:flex;align-items:center;gap:20px"><div class="av" style="width:72px;height:72px;border-radius:50%;background:${col}22;border:2px solid ${col};display:flex;align-items:center;justify-content:center;font-weight:600;font-size:30px;color:${col}">${av}</div><div style="flex:1"><div class="nm" style="font-size:26px;font-weight:600">${name}</div><div class="sb" style="font-size:15px;color:var(--muted);margin-top:4px">rating</div></div><div class="rt mono" style="font-size:44px;font-weight:500">${rating}</div></div>`, `left:${x}px;top:190px;width:640px;height:124px;padding:26px 30px`);
  R.you = pcard(120, 'Y', 'You', 1200, C.lilac); R.opp = pcard(1160, 'O', 'Opponent', 1214, C.amber);
  R.youR = R.you.querySelector('.rt'); R.oppR = R.opp.querySelector('.rt'); R.oppInner = R.opp.firstChild;
  R.tgt = div(root, 'card', '<div style="font-size:15px;color:var(--muted)">Target</div><div class="tm" style="font-family:var(--math);font-size:30px;margin-top:6px;white-space:nowrap">(|000⟩ + |111⟩) / √2</div><div class="tn" style="font-size:15px;color:var(--dim);margin-top:4px">GHZ state</div>', 'left:800px;top:190px;width:320px;height:124px;padding:18px 20px;text-align:center');
  R.tm = R.tgt.querySelector('.tm'); R.tn = R.tgt.querySelector('.tn');
  const board = x => { const b = div(root, 'card', '', `left:${x}px;top:346px;width:820px;height:390px;background:#170d38`); const s = svgLayer(b); s.style.left = -x + 'px'; s.style.top = '-346px';
    [450, 540, 630].forEach((y, q) => { sv('line', { x1: x + 120, y1: y, x2: x + 760, y2: y, stroke: C.wire, 'stroke-width': 2 }, s); });
    ['0', '1', '2'].forEach((q, i) => div(b, 'abs qlbl', `q<sub>${q}</sub>`, `left:44px;top:${82 + i * 90}px;font-size:28px`));
    const st = div(b, 'abs', '', 'left:30px;top:22px;font-size:16px;color:var(--muted)'); const tm = div(b, 'abs mono', '0:00.0', 'right:30px;top:18px;font-size:24px');
    return { b, s, st, tm, x }; };
  R.bY = board(120); R.bO = board(980);
  const mk = (bd, list) => list.map(g => { const gg = sv('g', {}, bd.s); gg.style.transformBox = 'fill-box'; gg.style.transformOrigin = 'center'; const x = bd.x + [220, 360, 500][g.c];
    if (g.t === 'CX') drawCX(gg, x, [450, 540, 630][g.ctl], [450, 540, 630][g.tgt], g.col || C.lilac, .8); else gateBox(gg, x, [450, 540, 630][g.q], g.t, g.col || C.lilac, 54, 24); gg._t = g.at; gg._r = g.round || 1; return gg; });
  R.gY = mk(R.bY, [{ t: 'H', q: 0, c: 0, at: 2.2 }, { t: 'CX', c: 1, ctl: 0, tgt: 1, at: 3.0 }, { t: 'CX', c: 2, ctl: 1, tgt: 2, at: 3.8 }, { t: 'H', q: 0, c: 0, at: 14.8, round: 2 }, { t: 'CX', c: 1, ctl: 0, tgt: 1, at: 15.8, round: 2 }]);
  R.gO = mk(R.bO, [{ t: 'H', q: 0, c: 0, at: 2.6, col: C.amber }, { t: 'CX', c: 1, ctl: 0, tgt: 1, at: 3.5, col: C.amber }, { t: 'H', q: 2, c: 2, at: 4.6, col: C.amber }, { t: 'H', q: 0, c: 0, at: 15.2, round: 2, col: C.cyan }, { t: 'CX', c: 1, ctl: 0, tgt: 1, at: 16.4, round: 2, col: C.cyan }]);
  R.srv = div(root, 'card', '<div style="display:flex;align-items:center;gap:12px;font-size:18px;font-weight:600"><svg width="26" height="26" viewBox="0 0 26 26"><rect x="3" y="4" width="20" height="7" rx="2" fill="none" stroke="#a58bff" stroke-width="2"/><rect x="3" y="15" width="20" height="7" rx="2" fill="none" stroke="#a58bff" stroke-width="2"/><circle cx="7.5" cy="7.5" r="1.4" fill="#72e4ff"/><circle cx="7.5" cy="18.5" r="1.4" fill="#72e4ff"/></svg>Server</div>', 'left:120px;top:768px;width:1680px;height:236px;padding:24px 30px');
  const srow = (y, html) => div(R.srv, 'abs', html, `left:30px;top:${y}px;width:1620px;display:flex;align-items:center;gap:24px;font-size:21px`);
  R.s0 = srow(70, '<span style="color:var(--soft)">Re-running both circuits on the server. Client clocks are ignored.</span>');
  R.s1 = srow(118, '<span style="width:180px;font-weight:600">You</span><span class="mono" style="width:200px;color:var(--muted)">0:02.9</span><span class="mono" style="width:200px">F = 1.000</span><span class="pill" style="background:var(--mint);color:#0f2a20;font-weight:600">accepted</span>');
  R.s2 = srow(166, '<span style="width:180px;font-weight:600">Opponent</span><span class="mono" style="width:200px;color:var(--muted)">0:04.0</span><span class="mono" style="width:200px">F = 0.500</span><span class="pill" style="background:var(--coral);color:#2a0f16;font-weight:600">rejected</span>');
  R.win = div(root, 'card', '<div style="font-family:var(--serif);font-weight:600;font-size:72px">You win</div><div class="mono" style="font-size:34px;margin-top:14px"><span class="wr">1200</span> <span style="color:var(--mint)">+16</span></div><div class="mono" style="font-size:18px;color:var(--muted);margin-top:10px">Opponent 1214 → 1198</div>', 'left:660px;top:420px;width:600px;height:270px;padding:36px;text-align:center;border-color:rgba(94,240,176,.6);box-shadow:0 0 80px rgba(94,240,176,.25),0 30px 80px rgba(0,0,0,.5)');
  R.wr = R.win.querySelector('.wr');
  R.botHTML = '<div style="display:flex;align-items:center;gap:20px"><div style="width:72px;height:72px;border-radius:50%;background:#72e4ff22;border:2px solid #72e4ff;display:flex;align-items:center;justify-content:center"><svg width="40" height="40" viewBox="0 0 40 40"><rect x="8" y="12" width="24" height="18" rx="5" fill="none" stroke="#72e4ff" stroke-width="2.4"/><circle cx="15" cy="21" r="2.4" fill="#72e4ff"/><circle cx="25" cy="21" r="2.4" fill="#72e4ff"/><path d="M20 12V7" stroke="#72e4ff" stroke-width="2.4"/><circle cx="20" cy="6" r="2" fill="#72e4ff"/></svg></div><div style="flex:1"><div style="font-size:26px;font-weight:600">Practice bot</div><div style="font-size:15px;color:var(--muted);margin-top:4px">takes the seat when the queue is empty</div></div><div class="mono" style="font-size:44px;font-weight:500">1200</div></div>';
  R.oppHTML = R.opp.innerHTML; R.flipped = false;
  return R;
}, (lt, R) => {
  R.hls.forEach(h => words(h, lt, h._a, h._b));
  rise(R.you, lt, .4, .45, 20); rise(R.tgt, lt, .9, .45, 20);
  const fl = seg(lt, 12.8, 13.4), ang = fl * 180, second = fl >= .5;
  if (second !== R.flipped) { R.opp.innerHTML = second ? R.botHTML : R.oppHTML; R.oppR = R.opp.querySelector('.mono:last-child') || R.opp.querySelector('.rt'); R.flipped = second; }
  const op = rise(R.opp, lt, .5, .45, 20); R.opp.style.transform = `perspective(1400px) rotateY(${second ? ang - 180 : ang}deg)`; R.opp.style.borderColor = second ? C.cyan : '#3d2d78';
  rise(R.bY.b, lt, .7, .5, 24); rise(R.bO.b, lt, .8, .5, 24);
  const round2 = lt > 13.6;
  if (lt > 13.3 && lt < 13.6) { R.tgt.style.opacity = 1 - seg(lt, 13.3, 13.45); }
  if (round2) { setText(R.tm, '(|00⟩ + |11⟩) / √2'); setText(R.tn, 'Bell pair'); R.tgt.style.opacity = eo(seg(lt, 13.6, 13.9)); } else { setText(R.tm, '(|000⟩ + |111⟩) / √2'); setText(R.tn, 'GHZ state'); }
  const clr = seg(lt, 13.1, 13.4);
  [[R.gY], [R.gO]].forEach(([gs]) => gs.forEach(g => { const p = seg(lt, g._t, g._t + .25); const vis = g._r === 1 ? (lt >= g._t ? 1 - clr : 0) : (lt >= g._t ? 1 : 0); g.style.opacity = vis; g.style.transform = `scale(${lerp(.7, 1, eob(p))})`; }));
  const tmr = (e, stop, t0 = 1.4) => { const v = Math.max(0, Math.min(lt, stop) - t0); setText(e, `0:${String(Math.floor(v)).padStart(2, '0')}.${Math.floor((v % 1) * 10)}`); };
  if (!round2) { tmr(R.bY.tm, 4.3); tmr(R.bO.tm, 5.4); } else { tmr(R.bY.tm, 99, 14.2); tmr(R.bO.tm, 99, 14.2); }
  setText(R.bY.st, round2 ? 'Round 2, building' : lt < 4.3 ? 'Building' : lt < 8.2 ? 'Submitted' : '<span style="color:#5ef0b0">Accepted</span>');
  setText(R.bO.st, round2 ? '<span style="color:#72e4ff">Bot, building</span>' : lt < 5.4 ? 'Building' : lt < 9.2 ? 'Submitted' : '<span style="color:#ff6f8e">Rejected</span>');
  R.bY.b.style.borderColor = !round2 && lt >= 8.2 ? C.mint : '#3d2d78'; R.bO.b.style.borderColor = !round2 && lt >= 9.2 ? C.coral : '#3d2d78';
  const srvOut = seg(lt, 12.9, 13.2); show(R.srv, eo(seg(lt, 6.9, 7.3)) * (1 - srvOut)); rise(R.s0, lt, 7.1, .35, 10); rise(R.s1, lt, 8.2, .35, 10); rise(R.s2, lt, 9.2, .35, 10);
  { const p = seg(lt, 10.0, 10.4), q = seg(lt, 12.5, 12.8); show(R.win, eo(p) * (1 - q), `scale(${lerp(.8, 1, eob(p))})`); const e = Math.round(lerp(1200, 1216, eo(seg(lt, 10.3, 11.0)))); setText(R.wr, e); }
  if (!R.flipped) { setText(R.youR, Math.round(lerp(1200, 1216, eo(seg(lt, 10.3, 11.0))))); setText(R.oppR, Math.round(lerp(1214, 1198, eo(seg(lt, 10.3, 11.0))))); }
});

// ===================== S8 DAILY =====================
scene('s8', 16, root => {
  const R = {};
  R.h1 = mkHL(root, 'A reason to come back every day.'); R.h2 = mkHL(root, 'A researcher who sees XP closes the tab. So they never see it.'); R.h2.style.fontSize = '54px';
  R.mode = div(root, 'abs', '<span class="g1">guided</span><span class="g2">workbench</span><i></i>', 'left:1560px;top:76px;width:240px;height:44px;border-radius:999px;border:1px solid var(--line2);font-size:17px;display:flex;align-items:center;justify-content:space-around;position:absolute');
  R.mi = R.mode.querySelector('i'); R.mi.style.cssText = 'position:absolute;left:4px;top:4px;width:110px;height:34px;border-radius:999px;background:rgba(165,139,255,.25);z-index:-1';
  R.cards = div(root, 'layer');
  // puzzle
  R.pz = div(R.cards, 'card', '<div style="font-size:26px;font-weight:600">Daily puzzle</div><div style="font-size:16px;color:var(--muted);margin-top:4px">Sunday, 27 September</div><div style="margin-top:26px;display:inline-flex;gap:12px;align-items:center;background:rgba(165,139,255,.08);border:1px solid rgba(165,139,255,.3);border-radius:999px;padding:8px 18px;font-size:18px;color:var(--soft)">Reach <span class="math" style="font-size:24px;color:var(--text)">|−⟩</span> in two gates</div>', 'left:120px;top:200px;width:540px;height:620px;padding:34px');
  const ps = svgLayer(R.pz); ps.style.left = '-120px'; ps.style.top = '-200px';
  sv('line', { x1: 200, y1: 520, x2: 610, y2: 520, stroke: C.wire, 'stroke-width': 2.2 }, ps); div(R.pz, 'abs qlbl', 'q<sub>0</sub>', 'left:34px;top:298px');
  [320, 450].forEach(x => sv('rect', { x: x - 32, y: 488, width: 64, height: 64, rx: 12, fill: 'none', stroke: '#3d2d78', 'stroke-dasharray': '5 5', 'stroke-width': 1.5 }, ps));
  R.pg = [['X', 320, 2.0], ['H', 450, 2.6]].map(([n, x, at]) => { const g = sv('g', {}, ps); gateBox(g, x, 520, n, C.lilac); g.style.transformBox = 'fill-box'; g.style.transformOrigin = 'center'; g._t = at; return g; });
  R.solved = div(R.pz, 'abs pill', '<svg width="16" height="16" viewBox="0 0 18 18"><path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="#0f2a20" stroke-width="2.6" stroke-linecap="round"/></svg>Solved in 2, par 2', 'left:34px;top:430px;background:var(--mint);color:#0f2a20;font-weight:600;font-size:18px;padding:7px 16px');
  div(R.pz, 'abs', 'New puzzle in 14 h 22 m', 'left:34px;top:560px;font-size:16px;color:var(--dim)');
  // streak
  R.sk = div(R.cards, 'card', '<div style="font-size:26px;font-weight:600">Streak</div>', 'left:690px;top:200px;width:540px;height:620px;padding:34px');
  div(R.sk, 'abs', '<svg width="110" height="130" viewBox="0 0 110 130"><defs><linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff6f8e"/><stop offset=".55" stop-color="#ffc66e"/><stop offset="1" stop-color="#fff0c4"/></linearGradient></defs><path d="M55 6C62 30 92 44 92 80c0 24-17 42-37 42S18 104 18 80c0-18 10-28 18-36 2 12 8 18 14 20C46 42 50 22 55 6z" fill="url(#fl)"/></svg>', 'left:215px;top:80px');
  R.sn = div(R.sk, 'abs serif', '12', 'left:0;top:220px;width:540px;text-align:center;font-size:120px;font-weight:600;line-height:1');
  div(R.sk, 'abs', 'day streak', 'left:0;top:350px;width:540px;text-align:center;font-size:22px;color:var(--soft)');
  R.days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => { const e = div(R.sk, 'abs', '', `left:${52 + i * 64}px;top:420px;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px`); div(R.sk, 'abs', d, `left:${52 + i * 64}px;top:474px;width:44px;text-align:center;font-size:15px;color:var(--muted)`); return e; });
  R.fz = div(R.sk, 'abs', '<span style="font-size:22px">❄</span> <span style="font-size:18px;color:var(--soft)">2 freezes left. One covered Wednesday.</span>', 'left:34px;top:540px;color:#72e4ff');
  // quests
  R.qc = div(R.cards, 'card', "<div style=\"font-size:26px;font-weight:600\">Today's quests</div>", 'left:1260px;top:200px;width:540px;height:620px;padding:34px');
  R.qs = [['Solve the daily puzzle', 1, [[3.1, 1]]], ['Pass a lesson node', 1, [[4.9, 1]]], ['Review 3 due circuits', 3, [[0, 1], [5.6, 2], [6.3, 3]]]].map((q, i) => {
    const e = div(R.qc, 'abs', `<div style="font-size:21px">${q[0]}</div><div style="margin-top:12px;width:400px;height:12px;border-radius:6px;background:var(--line)"><div class="f" style="height:12px;border-radius:6px;background:var(--lilac);width:0"></div></div><div class="n mono" style="position:absolute;left:420px;top:32px;font-size:17px;color:var(--muted)"></div><div class="ck" style="position:absolute;left:432px;top:-4px"></div>`, `left:34px;top:${110 + i * 120}px;width:480px`);
    e._f = e.querySelector('.f'); e._n = e.querySelector('.n'); e._ck = e.querySelector('.ck'); e._q = q; return e; });
  R.done = div(R.qc, 'abs', 'All three done. See you tomorrow.', 'left:34px;top:500px;font-family:var(--serif);font-size:30px;color:var(--mint)');
  // workbench view
  R.wb = div(root, 'layer'); const ws = svgLayer(R.wb); R.wl = [];
  for (let i = 0; i < 12; i++) { const y = 230 + i * 50; R.wl.push(sv('line', { x1: 220, y1: y, x2: 1720, y2: y, stroke: C.wire, 'stroke-width': 1.8 }, ws)); div(R.wb, 'abs qlbl', `q<sub>${i}</sub>`, `left:150px;top:${y - 20}px;font-size:24px`); }
  R.wg = []; const GS = ['H', 'X', 'RZ', 'H', 'CX', 'Y', 'CX', 'T', 'H', 'CX', 'S', 'X', 'RY', 'CX', 'H', 'Z'];
  for (let k = 0; k < 16; k++) { const q = (k * 5) % 11, x = 340 + k * 84, g = sv('g', {}, ws); if (GS[k] === 'CX') drawCX(g, x, 230 + q * 50, 230 + (q + 1) * 50, C.lilac, .6); else gateBox(g, x, 230 + q * 50, GS[k], C.lilac, 40, 17); g._x = x; R.wg.push(g); }
  R.noise = div(R.wb, 'abs pill', 'noise on', 'left:1640px;top:156px;border:1.5px solid var(--line2);color:var(--muted)');
  R.sub = wordify(div(root, 'abs', 'No XP, no streaks, no tutor unless asked. Twelve wires and noise.', 'left:0;top:870px;width:1920px;text-align:center;font-family:var(--serif);font-size:36px;color:var(--soft)'));
  CURSOR.push({ T0: T.s8, vis: [8.9, 10.2], press: [[9.5, 9.6]], k: [[8.9, 1500, 300], [9.45, 1742, 98], [10.2, 1760, 160]] });
  return R;
}, (lt, R) => {
  words(R.h1, lt, .35, 8.8); words(R.h2, lt, 9.0, 15.55, { stagger: .035 });
  const tg = eio(seg(lt, 9.55, 9.8)); R.mi.style.left = lerp(4, 126, tg) + 'px'; R.mi.style.width = lerp(110, 110, tg) + 'px';
  R.mode.querySelector('.g1').style.color = tg < .5 ? C.text : C.muted; R.mode.querySelector('.g2').style.color = tg >= .5 ? C.text : C.muted; rise(R.mode, lt, .5, .4, 10);
  const co = seg(lt, 9.8, 10.3); show(R.cards, 1 - co, `scale(${1 - .04 * co})`);
  rise(R.pz, lt, .5, .45, 26); rise(R.sk, lt, .62, .45, 26); rise(R.qc, lt, .74, .45, 26);
  R.pg.forEach(g => { const p = seg(lt, g._t, g._t + .25); g.style.opacity = lt >= g._t ? 1 : 0; g.style.transform = `scale(${lerp(.7, 1, eob(p))})`; });
  pop(R.solved, lt, 3.0, .3, .7);
  const bump = seg(lt, 3.8, 4.2); setText(R.sn, lt >= 3.8 ? '13' : '12'); R.sn.style.transform = `scale(${1 + .18 * Math.sin(Math.PI * bump)})`;
  R.days.forEach((d, i) => { let st = i === 2 ? 'fz' : i < 6 ? 'ok' : (lt >= 3.8 ? 'ok' : 'todo');
    const html = st === 'fz' ? '❄' : st === 'ok' ? '<svg width="20" height="20" viewBox="0 0 18 18"><path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="#0f2a20" stroke-width="2.6" stroke-linecap="round"/></svg>' : ''; setText(d, html);
    d.style.background = st === 'ok' ? C.mint : st === 'fz' ? 'rgba(114,228,255,.18)' : 'transparent'; d.style.border = st === 'todo' ? '2px dashed #4a3790' : st === 'fz' ? '2px solid #72e4ff' : 'none'; d.style.color = C.cyan;
    d.style.transform = i === 6 ? `scale(${1 + .25 * Math.sin(Math.PI * bump)})` : i === 2 ? `scale(${1 + .2 * Math.sin(Math.PI * seg(lt, 4.3, 4.7))}) rotate(${seg(lt, 4.3, 4.7) * 60}deg)` : 'none'; });
  rise(R.fz, lt, 4.3, .4, 10);
  R.qs.forEach(e => { const [name, tot, steps] = e._q; let v = 0; steps.forEach(([at, n]) => { if (lt >= at) v = n; }); const last = steps.filter(s => lt >= s[0]).pop(); const anim = last ? seg(lt, last[0], last[0] + .35) : 1;
    const prevV = steps.filter(s => lt >= s[0]).length > 1 ? steps[steps.filter(s => lt >= s[0]).length - 2][1] : 0; const shown = lerp(prevV, v, eo(anim));
    e._f.style.width = 400 * shown / tot + 'px'; e._f.style.background = v >= tot ? C.mint : C.lilac; setText(e._n, `${v}/${tot}`);
    setText(e._ck, v >= tot ? '<svg width="30" height="30" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="#5ef0b0"/><path d="M7.5 13.5l3.5 3.5 7.5-8" fill="none" stroke="#0f2a20" stroke-width="2.6" stroke-linecap="round"/></svg>' : '<svg width="30" height="30" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="none" stroke="#4a3790" stroke-width="2"/></svg>'); });
  rise(R.done, lt, 6.6, .4, 12); R.qc.style.borderColor = lt > 6.4 ? mix('#3d2d78', C.mint, .7 * seg(lt, 6.4, 6.8)) : '#3d2d78';
  const wp = seg(lt, 10.2, 11.2); show(R.wb, seg(lt, 10.1, 10.4)); R.wl.forEach((l, i) => l.setAttribute('x2', lerp(220, 1720, eio(seg(lt, 10.2 + i * .03, 11.0 + i * .03)))));
  R.wg.forEach(g => { const p = seg(lt, 10.4 + (g._x - 340) / 1344 * .8, 10.65 + (g._x - 340) / 1344 * .8); g.style.opacity = eo(p); });
  words(R.sub, lt, 11.0, 15.55, { stagger: .035 });
});

// ===================== S9 TEACH =====================
const MIS = [['Places the CNOT before the Hadamard', 'M8 · Two coins, one answer', 23, 40], ['Treats |+⟩ and |−⟩ as interchangeable', 'M6 · The same odds, a different state', 20, 34], ['Adds Z to |0⟩ and expects a change', 'M5 · The gate that does nothing', 15, 26], ['Expects two H gates to correlate the wires', 'M8 · Two coins, one answer', 13, 22], ['Measures mid-circuit and expects interference to survive', 'M7 · Invisible, then decisive', 12, 21], ['Treats a qubit as a coin that is secretly heads or tails', 'M1 · Where the coin analogy dies', 11, 19], ['Reads an entangled Bloch sphere as an error', 'M4 · Where the sphere runs out', 7, 12]];
scene('s9', 18, root => {
  const R = {};
  R.hls = [['Where the class is stuck.', .35, 6.6], ["Open any student's wrong circuit.", 6.8, 12.45], ['Build the answer. The platform works out the question.', 12.65, 17.55]].map(([s, a, b]) => { const e = mkHL(root, s); e._a = a; e._b = b; return e; });
  R.dash = div(root, 'layer');
  R.meta = div(R.dash, 'abs', '<span style="font-weight:600;font-size:21px">CS-402 Quantum Computing</span><span class="pill" style="border:1px solid var(--line2);color:var(--soft)">58 students</span><span class="pill" style="border:1px solid var(--line2);color:var(--soft)">29 active this week</span><span class="pill" style="border:1px solid var(--line2);color:var(--soft)">16/19 median node</span><span style="font-size:15px;color:var(--dim);font-style:italic">Seeded demo data, not a real cohort</span>', 'left:120px;top:156px;display:flex;gap:14px;align-items:center');
  R.call = div(R.dash, 'card', '<div style="font-size:16px;color:var(--amber);font-weight:500">The thing to cover first</div><div style="font-family:var(--serif);font-size:42px;line-height:1.2;margin-top:10px">40% of the class places the CNOT before the Hadamard.</div><div style="font-size:18px;line-height:1.45;color:var(--muted);margin-top:14px">23 of 58 students hit this in “Two coins, one answer”. The rule engine caught each one by reading the circuit, not a quiz score.</div>', 'left:120px;top:214px;width:800px;height:312px;padding:30px 34px');
  R.list = div(R.dash, 'card', '<div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:24px;font-weight:600">Misconceptions, ranked</span><span style="font-size:15px;color:var(--muted)">by students affected</span></div>', 'left:960px;top:214px;width:840px;height:790px;padding:28px 32px');
  R.rows = MIS.map((m, i) => { const e = div(R.list, 'abs', `<div style="font-size:19px">${m[0].replace(/\|([+−0])⟩/g, '<span class="math">|$1⟩</span>')}</div><div style="font-size:14px;color:var(--dim);margin-top:3px">${m[1]}</div><div style="margin-top:10px;display:flex;align-items:center;gap:16px"><div style="width:560px;height:14px;border-radius:7px;background:var(--line)"><div class="f" style="height:14px;border-radius:7px;background:${i ? '#a58bff' : '#ff6f8e'};width:0"></div></div><span class="mono" style="font-size:17px;color:var(--soft)">${m[2]} · ${m[3]}%</span></div>`, `left:20px;top:${78 + i * 100}px;width:800px;padding:10px 12px;border-radius:12px`); e._f = e.querySelector('.f'); return e; });
  R.dw = div(R.dash, 'card', '<div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:22px;font-weight:600">Aarav, attempt 3</span><span style="font-size:15px;color:var(--muted)">Two coins, one answer</span></div>', 'left:120px;top:556px;width:800px;height:448px;padding:26px 32px;border-color:rgba(255,111,142,.45)');
  const ds = svgLayer(R.dw); ds.style.left = '-120px'; ds.style.top = '-556px';
  [700, 800].forEach(y => sv('line', { x1: 230, y1: y, x2: 840, y2: y, stroke: C.wire, 'stroke-width': 2 }, ds));
  div(R.dw, 'abs qlbl', 'q<sub>0</sub>', 'left:44px;top:124px;font-size:28px'); div(R.dw, 'abs qlbl', 'q<sub>1</sub>', 'left:44px;top:224px;font-size:28px');
  R.dcx = sv('g', {}, ds); drawCX(R.dcx, 360, 700, 800, C.coral, .9); const dg = sv('g', {}, ds); gateBox(dg, 500, 700, 'H', C.lilac, 58, 26); measBox(dg, 760, 700, 58); measBox(dg, 760, 800, 58);
  R.dring = sv('rect', { x: 322, y: 660, width: 76, height: 180, rx: 14, fill: 'none', stroke: C.coral, 'stroke-width': 2.5 }, ds);
  R.dtag = div(R.dw, 'abs', '<span class="pill" style="background:rgba(255,111,142,.15);border:1.5px solid var(--coral);color:#ffb3c6">M8, CNOT placed before the Hadamard</span><span class="mono" style="font-size:18px;color:var(--muted)">measured 00, 01 &nbsp; F = <span style="color:var(--coral)">0.250</span></span>', 'left:32px;top:330px;width:736px;display:flex;justify-content:space-between;align-items:center');
  // authoring
  R.au = div(root, 'layer');
  R.ac = div(R.au, 'card', '<div style="font-size:22px;font-weight:600">Author a challenge</div>', 'left:120px;top:196px;width:1000px;height:520px;padding:28px 32px');
  const as = svgLayer(R.ac); as.style.left = '-120px'; as.style.top = '-196px';
  [['H', 300], ['X', 380], ['Z', 460]].forEach(([n, x]) => gateBox(sv('g', {}, as), x, 300, n, C.tileline, 56, 24)); { const g = sv('g', {}, as); sv('rect', { x: 532, y: 272, width: 56, height: 56, rx: 11, fill: C.tile, stroke: C.tileline, 'stroke-width': 1.8 }, g); drawCX(sv('g', {}, as), 560, 290, 312, C.lilac2, .45); } measBox(sv('g', {}, as), 640, 300, 56);
  [420, 540].forEach(y => sv('line', { x1: 260, y1: y, x2: 1060, y2: y, stroke: C.wire, 'stroke-width': 2.2 }, as));
  div(R.ac, 'abs qlbl', 'q<sub>0</sub>', 'left:70px;top:202px;font-size:28px'); div(R.ac, 'abs qlbl', 'q<sub>1</sub>', 'left:70px;top:322px;font-size:28px');
  R.aH = sv('g', {}, as); gateBox(R.aH, 420, 420, 'H', C.lilac); R.aCX = sv('g', {}, as); drawCX(R.aCX, 580, 420, 540, C.lilac);
  [R.aH, R.aCX].forEach(g => { g.style.transformBox = 'fill-box'; g.style.transformOrigin = 'center'; });
  R.at = div(R.au, 'card', '<div style="font-size:17px;color:var(--muted)">What learners will be asked to reach</div><div class="e0" style="font-size:19px;color:var(--dim);margin-top:30px">Place gates on the canvas and the target appears here.</div><div class="e1 math" style="font-size:40px;margin-top:26px"></div><div class="e2" style="font-size:18px;color:var(--mint);margin-top:8px"></div>', 'left:1160px;top:196px;width:640px;height:520px;padding:28px 32px');
  R.e0 = R.at.querySelector('.e0'); R.e1 = R.at.querySelector('.e1'); R.e2 = R.at.querySelector('.e2');
  const ts = svgLayer(R.at); ts.style.left = '-1160px'; ts.style.top = '-196px'; R.tb = [[1300, 0], [1440, 0], [1580, 0], [1720, 0]].map(([x]) => sv('rect', { x: x - 34, y: 640, width: 68, height: 0, rx: 6, fill: C.lilac }, ts));
  ['00', '01', '10', '11'].forEach((s, i) => sv('text', { x: 1300 + i * 140, y: 672, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono', 'font-size': 18, fill: C.muted }, ts).textContent = s);
  R.pl = div(R.au, 'card', '<div style="font-size:19px;font-weight:600">Palette, suggested from the answer</div><div class="ch" style="display:flex;gap:14px;margin-top:22px"></div><div class="nt" style="font-size:18px;color:var(--muted);margin-top:22px">With a decoy or two, so the palette doesn\'t give it away.</div>', 'left:120px;top:748px;width:1000px;height:256px;padding:28px 32px');
  R.chips = [['H', 1], ['CX', 1], ['X', 0], ['Z', 0]].map(([n, real]) => div(R.pl.querySelector('.ch'), '', `${n}${real ? '' : ' <span style="font-size:13px;color:var(--dim)">decoy</span>'}`, `padding:10px 20px;border-radius:12px;font-weight:600;font-size:22px;${real ? 'background:#2a1b5e;border:1.5px solid #a58bff' : 'border:1.5px dashed #4a3790;color:var(--muted)'}`));
  R.nt = R.pl.querySelector('.nt');
  R.sv = div(R.au, 'card', '<div style="font-size:15px;color:var(--muted)">Title</div><div class="tt" style="font-size:24px;margin-top:4px;height:32px"></div><div style="font-size:15px;color:var(--muted);margin-top:16px">Kind</div><div style="display:flex;gap:10px;margin-top:6px"><span class="pill" style="background:#2a1b5e;border:1.5px solid #a58bff">Reach</span><span class="pill" style="border:1.5px solid var(--line2);color:var(--muted)">Golf</span></div>', 'left:1160px;top:748px;width:640px;height:256px;padding:24px 32px');
  R.tt = R.sv.querySelector('.tt'); R.sbtn = div(R.sv, 'abs', 'Save the challenge', 'right:32px;bottom:26px;height:48px;padding:0 22px;border-radius:10px;background:var(--lilac);color:#140a2b;display:flex;align-items:center;font-weight:600;font-size:18px');
  R.gh = svgLayer(root); R.ghH = sv('g', {}, R.gh); gateBox(R.ghH, 0, 0, 'H', C.lilac); R.ghCX = sv('g', {}, R.gh); drawCX(R.ghCX, 0, 0, 120, C.lilac2);
  CURSOR.push({ T0: T.s9, vis: [6.9, 17.2], press: [[7.15, 7.25], [13.12, 13.2], [13.87, 13.95], [16.25, 16.35]],
    k: [[6.9, 1500, 980], [7.15, 1380, 318], [7.4, 1380, 318], [8.3, 1180, 540], [12.7, 1180, 540], [13.12, 300, 300], [13.2, 300, 300], [13.6, 420, 420], [13.65, 420, 420], [13.87, 560, 300], [13.95, 560, 300], [14.3, 580, 420], [14.4, 580, 420], [16.25, 1676, 953], [16.5, 1676, 953], [17.0, 1500, 1000]] });
  return R;
}, (lt, R, t) => {
  R.hls.forEach(h => words(h, lt, h._a, h._b));
  const dOut = seg(lt, 12.6, 13.0); show(R.dash, 1 - dOut);
  rise(R.meta, lt, .5, .4, 12); rise(R.call, lt, .7, .45, 24); rise(R.list, lt, .8, .45, 24);
  R.rows.forEach((e, i) => { e._f.style.width = 560 * MIS[i][3] / 40 * eo(seg(lt, 1.2 + i * .15, 1.9 + i * .15)) + 'px'; e.style.background = i === 0 && lt > 7.15 ? 'rgba(255,111,142,.10)' : 'transparent'; e.style.opacity = eo(seg(lt, 1.0 + i * .15, 1.4 + i * .15)); });
  rise(R.dw, lt, 7.4, .5, 30); R.dring.style.opacity = lt > 8.0 ? .55 + .45 * Math.cos((lt - 8) * 5.5) : 0; rise(R.dtag, lt, 8.2, .4, 10);
  show(R.au, seg(lt, 12.9, 13.2));
  const hp = seg(lt, 13.6, 13.85), cp = seg(lt, 14.3, 14.55);
  R.aH.style.opacity = lt >= 13.6 ? 1 : 0; R.aH.style.transform = `scale(${lerp(.7, 1, eob(hp))})`; R.aCX.style.opacity = lt >= 14.3 ? 1 : 0; R.aCX.style.transform = `scale(${lerp(.7, 1, eob(cp))})`;
  const cur = cursorState(t); [[R.ghH, 13.2, 13.6], [R.ghCX, 13.95, 14.3]].forEach(([g, a, b]) => { const on = lt >= a && lt < b && cur; g.style.opacity = on ? .92 : 0; if (on) g.setAttribute('transform', `translate(${cur.x},${cur.y}) scale(1.04)`); });
  R.e0.style.display = lt < 13.6 ? 'block' : 'none';
  setText(R.e1, lt < 13.6 ? '' : lt < 14.3 ? '(|00⟩ + |01⟩) / √2' : '(|00⟩ + |11⟩) / √2'); setText(R.e2, lt >= 14.5 ? 'Bell pair, worked out from your circuit' : '');
  const tv = lt < 13.6 ? [0, 0, 0, 0] : lt < 14.3 ? [.5, .5, 0, 0] : [.5, 0, 0, .5]; const tp = lt < 14.3 ? eo(seg(lt, 13.6, 13.9)) : eo(seg(lt, 14.3, 14.6));
  R.tb.forEach((b, i) => { const prev = lt < 14.3 ? [0, 0, 0, 0] : [.5, .5, 0, 0]; const v = lerp(prev[i], tv[i], tp); b.setAttribute('height', v * 200); b.setAttribute('y', 640 - v * 200); b.setAttribute('fill', lt >= 14.3 ? C.mint : C.lilac); });
  R.chips.forEach((c, i) => pop(c, lt, 15.0 + i * .12, .3, .7)); rise(R.nt, lt, 15.5, .4, 8);
  typed(R.tt, 'Two coins, one answer', lt, 15.2, 15.9); R.sbtn.style.transform = lt > 16.25 && lt < 16.35 ? 'scale(.96)' : 'none'; setText(R.sbtn, lt >= 16.35 ? 'Saved' : 'Save the challenge'); R.sbtn.style.background = lt >= 16.35 ? C.mint : C.lilac;
});

// ===================== S10 OUTRO =====================
scene('s10', 8, root => {
  const wm = div(root, 'abs', 'Quriosity', 'left:0;top:0;font-family:var(--serif);font-weight:600;font-size:150px;letter-spacing:-.015em;line-height:1;white-space:nowrap');
  const l1 = wordify(div(root, 'abs', 'Unit 0 takes ten minutes.', 'left:0;top:486px;width:1920px;text-align:center;font-family:var(--serif);font-size:64px;font-weight:500'));
  const l2 = wordify(div(root, 'abs', 'Nothing to install. It all runs in this tab.', 'left:0;top:580px;width:1920px;text-align:center;font-family:var(--serif);font-size:42px;color:var(--soft)'));
  const url = div(root, 'abs', '<span style="display:inline-block;font-family:var(--mono);font-size:32px;color:var(--lilac);border:1.5px solid rgba(165,139,255,.55);background:rgba(165,139,255,.08);border-radius:999px;padding:12px 30px">quriosity-livid.vercel.app</span>', 'left:0;top:672px;width:1920px;text-align:center');
  const ft = div(root, 'abs', 'SIH 26140 · Quantum Latte', 'left:0;top:975px;width:1920px;text-align:center;font-size:22px;color:var(--muted)');
  return { wm, l1, l2, url, ft };
}, (lt, r, t) => {
  const p = eo(seg(lt, .2, .6)); show(r.wm, p, `translate(${LOCK.wx + (1 - p) * 30}px,${392 - 78}px)`);
  words(r.l1, lt, .6, 99, { stagger: .05 }); words(r.l2, lt, 1.1, 99, { stagger: .04 }); rise(r.url, lt, 1.6, .4, 14); rise(r.ft, lt, 2.0, .4, 10);
  const pp = seg(lt, 0, .5);
  return { x: LOCK.bx, y: 392, R: 64 * lerp(.35, 1, eob(pp)), op: clamp(pp * 2.2), lblOp: 0, merOp: .4, vecLen: 1, theta: Math.PI / 2, phi: phiAbs(t), tiltX: .32, orbitY: .18 * t };
}, false);

// ===================== MASTER =====================
function render(t) {
  $('dots').style.backgroundPosition = `${t * 7}px ${t * 4}px`;
  let s3d = null;
  if (t >= T.s1) { const r0 = SCENES[0].r; show(r0.tok, 0); show(r0.ring, 0); }
  for (const s of SCENES) {
    const lt = t - s.T0, on = lt >= -1e-6 && lt < s.dur - 1e-6 || (s.id === 's10' && lt >= 0);
    if (!on) { if (s.root.style.display !== 'none') s.root.style.display = 'none'; continue; }
    if (s.root.style.display !== 'block') { s.root.style.display = 'block'; s.root.style.visibility = 'visible'; }
    s.root.style.opacity = s.fade ? eo(seg(lt, 0, .45)) * (1 - seg(lt, s.dur - .4, s.dur - .02)) : 1;
    const r3 = s.render(lt, s.r, t); if (r3) s3d = r3;
  }
  const g = $('glow');
  if (s3d && s3d.op > .002) { show(g, .9 * s3d.op, `translate(${s3d.x - 450}px,${s3d.y - 450}px) scale(${clamp(s3d.R / 190, .45, 1.3)})`); } else show(g, 0);
  set3D(s3d && s3d.op > .002 ? s3d : null);
  const c = cursorState(t), ce = $('cursor');
  if (c) show(ce, c.op, `translate(${c.x - 2}px,${c.y - 2}px) scale(${c.press ? .86 : 1})`); else show(ce, 0);
}
window.render = render;
document.fonts.ready.then(() => {
  init3D();
  const wm = SCENES.find(s => s.id === 's1').r.wm; WMW = wm.getBoundingClientRect().width; const total = 128 + 40 + WMW, x0 = 960 - total / 2; LOCK = { bx: x0 + 64, wx: x0 + 128 + 40 };
  render(0); window.__ready = true;
});
