// Live tuning panel: one slider per entry in tune.js SCHEMA, plus a copyable JSON of what you changed.
// Toggle with the `t` key, the TUNE button, or ?tune=1. Values persist in localStorage.
import { SCHEMA, TUNE, save, reset, changed } from './tune.js';

export function buildTunePanel(root, { onChange } = {}) {
  const el = document.createElement('div'); el.id = 'tune'; el.hidden = true;
  el.innerHTML = `<div class="hd"><b>TUNE</b><span id="tune-live"></span><button id="tune-reset" title="back to defaults">reset</button><button id="tune-copy" title="copy changed values as JSON">copy</button><button id="tune-x">×</button></div><div class="rows"></div><pre id="tune-json"></pre>`;
  const rows = el.querySelector('.rows'), out = el.querySelector('#tune-json'), inputs = {};
  const refresh = () => { for (const k in inputs) { inputs[k].r.value = TUNE[k]; inputs[k].n.value = TUNE[k]; } const c = changed(); out.textContent = Object.keys(c).length ? JSON.stringify(c) : 'defaults'; };
  for (const k in SCHEMA) {
    const s = SCHEMA[k], row = document.createElement('label'); row.title = s.help;
    row.innerHTML = `<span>${k}</span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}"><input type="number" min="${s.min}" max="${s.max}" step="${s.step}">`;
    const [r, n] = row.querySelectorAll('input');
    const set = v => { if (isNaN(v)) return; TUNE[k] = +v; save(); refresh(); onChange?.(k, TUNE[k]); };
    r.oninput = () => set(r.value); n.onchange = () => set(n.value);
    inputs[k] = { r, n }; rows.append(row);
  }
  el.querySelector('#tune-reset').onclick = () => { reset(); refresh(); onChange?.(); };
  el.querySelector('#tune-copy').onclick = () => { const t = JSON.stringify(changed(), null, 1); navigator.clipboard?.writeText(t).catch(() => { }); console.log('TUNE', t); };
  el.querySelector('#tune-x').onclick = () => { el.hidden = true; };
  // keep wheel/keys inside the panel from reaching the stage
  for (const ev of ['wheel', 'pointerdown', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
  root.append(el); refresh();
  return { el, toggle() { el.hidden = !el.hidden; refresh(); }, live(text) { el.querySelector('#tune-live').textContent = text; } };
}
