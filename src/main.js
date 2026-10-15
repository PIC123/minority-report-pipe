import { TimelineScene, PX_PER_YEAR } from './scene.js';
import { MemoryView } from './memory.js';
import { Hud } from './hud.js';
import { PointerInput } from './input-touch.js';
import { GestureEngine } from './gestures.js';
import { Tracker, drawDebug } from './tracker.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), gl = $('gl'), hudCanvas = $('hud'), video = $('cam'), pip = $('pip'), pipc = $('pipc');
const data = await (await fetch('data/timeline.json')).json();
$('subtitle').textContent = data.subtitle;

const scene = new TimelineScene(gl, data);
const memory = new MemoryView(scene, scene.loader);
const hud = new Hud(hudCanvas);
const pointer = new PointerInput(stage);
const gestures = new GestureEngine();
let input = pointer;                       // whichever engine currently drives the cursor
let tracker = null, lastFrame = null;
if (pointer.touch) stage.classList.add('touch');

// ---------------------------------------------------------------- state
const S = { scroll: 0, scrollV: 0, zoom: 1, targetZoom: 1, head: { x: 0, y: 0 }, headT: { x: 0, y: 0 }, hover: null, scrollTarget: null, drag: null, zoom0: 1, scroll0: 0, current: null, memDrag: 0 };
S.scroll = -(2004 - data.range[0]) * PX_PER_YEAR;
const minScroll = () => -(scene.trackLen * S.zoom - scene.W * .25), maxScroll = () => scene.W * .25;

function status(mode, detail) { $('st-mode').textContent = mode; $('st-detail').textContent = detail; }
function gesture(name) { $('st-gesture').textContent = name; hud.say(name); clearTimeout(gesture.t); gesture.t = setTimeout(() => $('st-gesture').textContent = '', 900); }

function showCaption(e) {
  const c = $('memory-caption'); if (!e) { c.hidden = true; return; }
  $('mc-year').textContent = e.year; $('mc-title').textContent = e.title; $('mc-group').textContent = e.group; $('mc-blurb').textContent = e.blurb || '';
  c.hidden = false; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
}
function openCard(card) {
  if (!card) return; S.current = card;
  memory.open(card.userData.entry, scene.cardWorld(card));
  S.scrollTarget = scene.scrollToCenter(card, S.zoom); S.scrollV = 0; showCaption(card.userData.entry);
}
function closeMemory() { if (!memory.isOpen) return; memory.close(); showCaption(null); S.current = null; memory.orbit.x = memory.orbit.y = 0; gesture('close'); }
function step(dir) { if (!S.current) return; const n = scene.neighbor(S.current, dir); if (n !== S.current) { openCard(n); gesture(dir > 0 ? 'next' : 'previous'); } }

// ---------------------------------------------------------------- intents (same wiring for hands and pointer)
function wire(eng) {
  eng.on('head', h => { S.headT.x = h.x; S.headT.y = h.y; });
  eng.on('dragStart', ({ pose }) => { S.drag = true; S.scroll0 = S.scroll; S.scrollTarget = null; S.scrollV = 0; S.memDrag = 0; if (eng === gestures) gesture(pose === 'fist' ? 'grab' : 'pinch'); });
  eng.on('drag', ({ dx, dy }) => {
    if (memory.isOpen) { memory.orbit.x = -dx / 420; memory.orbit.y = dy / 420; if (Math.abs(dx) > 220 && !S.memDrag) { S.memDrag = 1; step(dx < 0 ? 1 : -1); memory.orbit.x = 0; } return; }
    S.scroll = S.scroll0 + dx;
  });
  eng.on('dragEnd', ({ vx, moved }) => { S.drag = null; if (memory.isOpen) { memory.orbit.x = memory.orbit.y = 0; return; } if (moved) S.scrollV = vx * .9; });
  eng.on('flick', ({ vx }) => { if (memory.isOpen) step(vx < 0 ? 1 : -1); else { S.scrollV = vx * 1.1; S.scrollTarget = null; gesture('flick'); } });
  eng.on('zoomStart', () => { S.zoom0 = S.zoom; S.scroll0 = S.scroll; gesture('stretch time'); });
  eng.on('zoom', r => { if (memory.isOpen) return; S.targetZoom = Math.min(2.4, Math.max(.5, S.zoom0 * r)); S.scrollTarget = null; });
  eng.on('select', ({ x, y }) => { if (memory.isOpen) { closeMemory(); return; } const c = scene.pick(x, y); if (c) { openCard(c); gesture('open'); } });
  eng.on('tap', ({ x, y }) => { if (memory.isOpen) return; const c = scene.pick(x, y); if (c) { openCard(c); gesture('open'); } });
  eng.on('push', () => closeMemory());
  eng.on('wheel', ({ dx, dy, ctrl }) => { if (memory.isOpen) { if (Math.abs(dx) > 30) step(dx > 0 ? 1 : -1); return; } if (ctrl) S.targetZoom = Math.min(2.4, Math.max(.5, S.targetZoom * (1 - dy * .01))); else { S.scroll -= dx + dy * .6; S.scrollV = 0; S.scrollTarget = null; } });
  eng.on('key', k => { if (k === 'Escape') closeMemory(); if (k === 'ArrowRight') memory.isOpen ? step(1) : (S.scrollV = -2200); if (k === 'ArrowLeft') memory.isOpen ? step(-1) : (S.scrollV = 2200); if (k === 'f') toggleFullscreen(); });
}
wire(pointer); wire(gestures);

// ---------------------------------------------------------------- camera
async function startCamera(handsToo) {
  const b = handsToo ? $('btn-start') : $('btn-head'); b.disabled = true; b.textContent = 'Loading…';
  try {
    tracker = await new Tracker(video).start({ hands: handsToo, face: true });
    pipc.width = video.videoWidth; pipc.height = video.videoHeight; pip.classList.remove('off');
    $('btn-start').hidden = true; $('btn-head').hidden = true; $('btn-pip').hidden = false;
    if (handsToo) { input = gestures; status('hands', 'hand + head tracking live'); } else status('touch', 'head tracking live');
  } catch (err) { console.error(err); b.disabled = false; b.textContent = handsToo ? 'Start camera' : 'Head tracking'; status('error', (err?.message || String(err)).slice(0, 70)); }
}
$('btn-start').onclick = () => startCamera(true);
$('btn-head').onclick = () => startCamera(false);
$('btn-pip').onclick = () => pip.classList.toggle('off');
function toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen?.(); else stage.requestFullscreen?.().catch(() => {}); }
$('btn-fs').onclick = toggleFullscreen;
if (pointer.touch) {
  $('btn-start').hidden = true; $('btn-head').hidden = false; status('touch', 'swipe · tap · pinch');
  // first touch asks for device tilt as a stand-in for head tracking
  stage.addEventListener('pointerdown', () => { if (!pointer.tiltOn && !tracker) pointer.enableTilt(); }, { once: true });
} else status('mouse', 'move the mouse · drag to grab · click to open · wheel to scroll');

// ---------------------------------------------------------------- loop
function resize() { scene.resize(); hud.resize(); pointer.resize(scene.W, scene.H); gestures.resize(scene.W, scene.H); }
addEventListener('resize', resize); resize();

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (tracker) { try { const f = tracker.read(now); if (f) { lastFrame = f; if (input === gestures) gestures.feed(f, now); else if (f.head) { S.headT.x = (f.head.x - .5) * 2; S.headT.y = (f.head.y - .5) * 2; } if (!pip.classList.contains('off')) drawDebug(pipc.getContext('2d'), pipc.width, pipc.height, f); } } catch (e) { console.warn(e); } }
  // physics
  if (S.scrollTarget != null) { S.scroll += (S.scrollTarget - S.scroll) * .12; if (Math.abs(S.scrollTarget - S.scroll) < .5) S.scrollTarget = null; }
  else if (!S.drag) { S.scroll += S.scrollV * dt; S.scrollV *= Math.pow(.08, dt); }
  const lo = minScroll(), hi = maxScroll();
  if (S.scroll > hi) { S.scroll += (hi - S.scroll) * .2; S.scrollV = 0; } if (S.scroll < lo) { S.scroll += (lo - S.scroll) * .2; S.scrollV = 0; }
  if (Math.abs(S.targetZoom - S.zoom) > 1e-3) { const z = S.zoom + (S.targetZoom - S.zoom) * .12; S.scroll *= z / S.zoom; S.zoom = z; }
  S.head.x += (S.headT.x - S.head.x) * .1; S.head.y += (S.headT.y - S.head.y) * .1;
  // hover
  const cur = input.cursor;
  const hover = cur.on && !memory.isOpen ? scene.pick(cur.x, cur.y) : null;
  scene.setHover(hover);
  const dim = memory.update(dt, S.head);
  scene.update(dt, now / 1000, { scroll: S.scroll, zoom: S.zoom, head: S.head, dim });
  scene.render();
  hud.draw(cur, input.dwell || 0, input.second, now);
}
requestAnimationFrame(loop);
