// Phone emulation: tap a card (opens), swipe (scrolls), swipe down (closes), two-finger pinch (zoom) via CDP touch events.
const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage();
  const log = []; page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/GL Driver|gl_context/.test(m.text())) log.push(`[${m.type()}] ${m.text()}`); }); page.on('pageerror', e => log.push('[pageerror] ' + e.message));
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const snap = () => page.evaluate(() => { const P = window.__portal; return { open: P.memory.isOpen, current: P.S.current?.userData.entry.id || null, scroll: Math.round(P.S.scroll), zoom: +P.S.zoom.toFixed(2), mode: document.getElementById('st-mode').textContent }; });
  const out = { start: await snap() };
  // card center on screen
  const c = await page.evaluate(() => { const P = window.__portal; for (const card of P.scene.cards) { const p = P.scene.cardWorld(card).position.clone().project(P.scene.camera); if (Math.abs(p.x) < .8 && Math.abs(p.y) < .8) return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, id: card.userData.entry.id }; } });
  await touch('touchStart', [[c.x, c.y]]); await sleep(80); await touch('touchEnd', []); await sleep(1500);
  out.afterTap = { ...await snap(), tapped: c.id };
  // swipe down closes
  await touch('touchStart', [[200, 250]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[200, 250 + i * 25]]); await sleep(30); } await touch('touchEnd', []); await sleep(2500);
  out.afterSwipeDown = await snap();
  // horizontal swipe scrolls
  await touch('touchStart', [[320, 450]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[320 - i * 30, 450]]); await sleep(30); } await touch('touchEnd', []); await sleep(800);
  out.afterSwipe = await snap();
  // pinch out zooms
  await touch('touchStart', [[150, 400], [250, 400]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[150 - i * 10, 400], [250 + i * 10, 400]]); await sleep(30); } await touch('touchEnd', []); await sleep(1200);
  out.afterPinch = await snap();
  console.log(JSON.stringify(out, null, 1)); console.log(log.join('\n') || '(no console errors)');
  await browser.close();
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
