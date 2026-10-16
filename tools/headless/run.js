// Headless smoke test for Portal Wall. Usage:
//   node run.js --url http://127.0.0.1:8000/ [--video file.y4m] [--camera] [--wait 8000] [--shot out.png] [--mobile] [--eval "js"]
const path = require('path');
const { chromium, devices } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
(async () => {
  const flags = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'];
  if (args.video) flags.push('--use-file-for-fake-video-capture=' + path.resolve(args.video));
  const browser = await chromium.launch({ headless: true, args: flags });
  const ctx = await browser.newContext(args.mobile ? { ...devices[args.mobile === true ? 'iPhone 13' : args.mobile] } : { viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', m => { const t = m.type(); if (['error', 'warning'].includes(t) || args.verbose) log.push(`[console.${t}] ${m.text()}`); });
  page.on('pageerror', e => log.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', r => log.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.url()}`); });
  await page.goto(args.url || 'http://127.0.0.1:8000/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  if (args.camera) { await page.click(args.mobile ? '#btn-head' : '#btn-start'); }
  await page.waitForTimeout(Number(args.wait || 8000));
  if (args.eval) { try { const r = await page.evaluate(args.eval); console.log('EVAL', JSON.stringify(r, null, 1)); } catch (e) { console.log('EVAL ERROR', e.message); } await page.waitForTimeout(Number(args.after || 0)); }   // --after N: settle time after --eval
  const st = await page.evaluate(() => ({ mode: document.getElementById('st-mode')?.textContent, detail: document.getElementById('st-detail')?.textContent, gesture: document.getElementById('st-gesture')?.textContent, dbg: window.__portal?.snapshot?.() }));
  console.log('STATUS', JSON.stringify(st, null, 1));
  if (args.shot) await page.screenshot({ path: args.shot });
  console.log(log.join('\n') || '(no console errors)');
  await browser.close();
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
