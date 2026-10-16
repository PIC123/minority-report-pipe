const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: Number(process.env.VW || 1600), height: Number(process.env.VH || 900) } });
  const log = []; page.on('console', m => { if (!/GL Driver|gl_context/.test(m.text())) log.push(`[${m.type()}] ${m.text().slice(0, 400)}`); }); page.on('pageerror', e => log.push('[pageerror] ' + e.message));
  page.on('response', r => { if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.url()}`); });
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const entry = JSON.parse(process.argv[2] || '{"id":"splat-test","year":2024,"title":"Splat test","group":"test","splat":"assets/splats/nike.splat"}');
  const t0 = Date.now();
  const r = await page.evaluate(async (entry) => { const P = window.__portal; try { await P.memory.open(entry, null); return { ok: true }; } catch (e) { return { ok: false, err: String(e && e.stack || e) }; } }, entry);
  console.log('open →', JSON.stringify(r), (Date.now() - t0) + 'ms');
  await page.waitForTimeout(Number(process.argv[3] || 6000));
  const st = await page.evaluate(() => { const P = window.__portal, m = P.memory; const s = m.splat; return { memState: m.state, progress: m.progress, hasSplat: !!s, hasMesh: !!m.mesh, size: m.size, groupPos: m.group.position.toArray().map(v => +v.toFixed(1)), groupScale: +m.group.scale.x.toFixed(3), splatChildren: s ? s.children.length : null, splatMesh: s ? !!s.splatMesh : null, splatCount: s?.viewer?.splatMesh?.getSplatCount?.() ?? null, sceneCount: s?.getSceneCount?.() ?? null, camPos: P.scene.camera.position.toArray().map(v => +v.toFixed(1)) }; });
  console.log('STATE', JSON.stringify(st));
  await page.screenshot({ path: process.argv[4] || 'splat.png', timeout: 180000 });
  console.log(log.join('\n') || '(no console output)');
  await browser.close();
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
