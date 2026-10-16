// Every tracking / gesture threshold in one place, live-tunable.
// Precedence: URL query (?pinchOn=0.28) > localStorage (saved from the tuning panel) > defaults below.
// Once a set feels right, paste the JSON the panel prints into the defaults here.
export const SCHEMA = {
  // ---- pose classification (tracker.js) ----
  extRatio:   { v: 1.12, min: 1.0,  max: 1.6,  step: .01, help: 'finger counts as extended when tip is this much farther from the wrist than its PIP joint' },
  pinchOn:    { v: 0.30, min: 0.08, max: 0.7,  step: .01, help: 'thumb–index distance / palm size below which a pinch starts' },
  pinchOff:   { v: 0.42, min: 0.08, max: 0.9,  step: .01, help: 'distance above which the pinch releases (hysteresis, keep > pinchOn)' },
  pinchCurl:  { v: 0.95, min: 0.5,  max: 1.3,  step: .01, help: 'index tip/PIP distance ratio below which the finger is curled into a fist and cannot pinch' },
  minPalm:    { v: 0.06, min: 0.0,  max: 0.3,  step: .005, help: 'ignore hands whose palm is smaller than this (fraction of frame height) — too far away' },
  // ---- cursor (gestures.js) ----
  gain:       { v: 1.7,  min: 1.0,  max: 3.5,  step: .05, help: 'hand travel → screen travel multiplier' },
  smooth:     { v: 0.5,  min: 0.05, max: 1.0,  step: .05, help: 'cursor follow rate per frame (1 = raw, lower = smoother but laggier)' },
  deadzone:   { v: 1.5,  min: 0,    max: 10,   step: .5,  help: 'px of jitter ignored while the hand is still' },
  // ---- select ----
  dwellMs:    { v: 650,  min: 200,  max: 1500, step: 10,  help: 'how long to hold a point before it selects' },
  dwellRadius:{ v: 48,   min: 10,   max: 150,  step: 1,   help: 'px the fingertip may wander during the dwell' },
  rearmMs:    { v: 900,  min: 0,    max: 3000, step: 50,  help: 'after a select, a new dwell cannot start until the pose changed or this much time passed' },
  // ---- grab / flick ----
  dragDead:   { v: 12,   min: 0,    max: 60,   step: 1,   help: 'px of movement before a grab counts as a drag (below = tap)' },
  flickV:     { v: 2400, min: 500,  max: 6000, step: 50,  help: 'open-hand sideways speed (px/s) that fires a flick' },
  momentum:   { v: 0.9,  min: 0,    max: 1.5,  step: .05, help: 'how much of the release velocity carries into the scroll' },
  // ---- two hands ----
  zoomGate:   { v: 1,    min: 0,    max: 1,    step: 1,   help: '1 = both hands must be open (or both grabbing) to stretch time; 0 = any two hands' },
  // ---- push ----
  pushRatio:  { v: 1.33, min: 1.05, max: 2.0,  step: .01, help: 'palm size growth within pushMs that counts as a push toward the camera' },
  pushMs:     { v: 380,  min: 100,  max: 1000, step: 10,  help: 'window over which palm growth is measured' },
  // ---- head ----
  headGain:   { v: 1.0,  min: 0.2,  max: 3.0,  step: .05, help: 'head movement → parallax multiplier' },
};

const KEY = 'portalwall.tune.v1';
export const TUNE = {};
export function defaults() { const o = {}; for (const k in SCHEMA) o[k] = SCHEMA[k].v; return o; }
export function load() {
  Object.assign(TUNE, defaults());
  try { Object.assign(TUNE, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { }
  const q = new URLSearchParams(location.search);
  for (const k in SCHEMA) if (q.has(k) && !isNaN(+q.get(k))) TUNE[k] = +q.get(k);
  return TUNE;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(TUNE)); } catch { } }
export function reset() { Object.assign(TUNE, defaults()); try { localStorage.removeItem(KEY); } catch { } }
export function changed() { const d = defaults(), o = {}; for (const k in SCHEMA) if (TUNE[k] !== d[k]) o[k] = TUNE[k]; return o; }
load();
