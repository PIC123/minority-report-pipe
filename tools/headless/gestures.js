// Synthetic gesture test: drives GestureEngine with fabricated tracker frames (no camera) and checks the intents it emits.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const log = []; page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/GL Driver|gl_context/.test(m.text())) log.push(`[${m.type()}] ${m.text()}`); }); page.on('pageerror', e => log.push('[pageerror] ' + e.message));
  await page.goto('http://127.0.0.1:8000/?x=1', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const P = window.__portal, G = P.gestures, T = P.tune, out = {}, ev = [];
    for (const n of ['select', 'dragStart', 'drag', 'dragEnd', 'flick', 'zoomStart', 'zoom', 'zoomEnd', 'push', 'tap']) G.on(n, a => ev.push(n + (a && a.vx != null && n === 'flick' ? ':' + Math.round(a.vx) : n === 'zoom' ? ':' + a.toFixed(2) : '')));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // hand at normalized (nx,ny) → screen px via engine.map; fabricate a hand object with the given pose
    const hand = (nx, ny, pose, palm = .3, lbl = 'Left') => ({ lm: [], label: lbl, pose, pinch: pose === 'pinch', pinchDist: pose === 'pinch' ? .2 : 1, palm, nExt: pose === 'open' ? 4 : pose === 'point' ? 1 : 0, ext: [], curl: [], tip: { x: nx, y: ny }, center: { x: nx, y: ny } });
    const toN = (px, py) => ({ x: (px - P.scene.W / 2) / (T.gain * P.scene.W) + .5, y: (py - P.scene.H / 2) / (T.gain * P.scene.H) + .5 });
    let t = performance.now();   // one monotonic synthetic clock for the whole test (rendering is slow headless, real time drifts)
    const run = async (frames, dtMs = 33) => { for (const f of frames) { G.feed({ hands: f, head: null }, t); t += dtMs; await sleep(dtMs); } };
    const evs = {};
    // 1. find a card on screen and point at it for the dwell time
    const card = P.scene.cards.find(c => { const p = P.scene.cardWorld(c).position.clone().project(P.scene.camera); return Math.abs(p.x) < .6 && Math.abs(p.y) < .7; });
    const pr = P.scene.cardWorld(card).position.clone().project(P.scene.camera); const sx = (pr.x + 1) / 2 * P.scene.W, sy = (1 - pr.y) / 2 * P.scene.H;
    const n = toN(sx, sy + 20);
    await run(Array.from({ length: 28 }, () => [hand(n.x, n.y, 'point')]));
    out.selectAfterDwell = ev.includes('select'); out.opened = P.memory.isOpen; out.current = P.S.current?.userData.entry.id; out.pickedId = card.userData.entry.id;
    // 2. keep pointing (still): must NOT select again within rearm window
    ev.length = 0; await run(Array.from({ length: 24 }, () => [hand(n.x + .002, n.y, 'point')]));
    out.noReselectWhileLocked = !ev.includes('select'); evs.t2 = [...ev];
    // 3. open hand then point again elsewhere → select (closes memory)
    await run([[hand(n.x, n.y, 'open')], [hand(n.x, n.y, 'open')]]); ev.length = 0;
    const trace = []; for (let i = 0; i < 28; i++) { await run([[hand(.5, .5, 'point')]]); trace.push([Math.round(G.cursor.x), Math.round(G.cursor.y), +G.dwell.toFixed(2), G._lock ? 'L' : '-', G._dwell ? Math.round(t - G._dwell.t) : null]); } out.trace3 = trace;
    out.secondSelect = ev.includes('select'); evs.t3 = [...ev]; await sleep(3000); out.closedAfter = !P.memory.isOpen;
    // 4. pinch drag: 300px to the right over 15 frames, release
    ev.length = 0; const s0 = P.S.scroll; const fr = []; for (let i = 0; i <= 15; i++) { const q = toN(600 + i * 20, 450); fr.push([hand(q.x, q.y, 'pinch')]); } fr.push([hand(toN(900, 450).x, toN(900, 450).y, 'open')]);
    await run(fr); out.dragEvents = [ev[0], ev.includes('drag'), ev[ev.length - 1]]; out.scrollMoved = Math.round(P.S.scroll - s0);
    // 5. open-hand flick: sweep 900px in 6 frames
    ev.length = 0; await run(Array.from({ length: 8 }, (_, i) => { const q = toN(300 + i * 150, 450); return [hand(q.x, q.y, 'open')]; })); out.flick = ev.find(e => e.startsWith('flick')) || null;
    // 6. palm push: palm grows 1.5x over 300 ms (after a gap so the flick frames fall out of the window)
    await run([[]]); t += 1500; ev.length = 0; await run(Array.from({ length: 10 }, (_, i) => [hand(.5, .5, 'open', .25 * (1 + i * .06))])); out.push = ev.includes('push'); evs.t6 = [...ev]; out.pushRatioSeen = G.debug.push;
    // 7. two hands open moving apart → zoom; one hand point + one open → no zoom (gate)
    ev.length = 0; await run(Array.from({ length: 8 }, (_, i) => [hand(.45 - i * .02, .5, 'open', .3, 'Left'), hand(.55 + i * .02, .5, 'open', .3, 'Right')])); out.zoomEvents = [ev[0], ev.filter(e => e.startsWith('zoom:')).pop()];
    await run([[]]); ev.length = 0; await run(Array.from({ length: 6 }, (_, i) => [hand(.45 - i * .02, .5, 'point', .3, 'Left'), hand(.55 + i * .02, .5, 'open', .3, 'Right')])); out.gatedNoZoom = !ev.some(e => e.startsWith('zoom'));
    await run([[]]);
    out.evs = evs; return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log(log.join('\n') || '(no console errors)');
  await browser.close();
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
