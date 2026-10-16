// Turns tracker frames into interaction intents. Vocabulary:
//   point + dwell      → select (open a memory)
//   pinch / fist + move→ grab & drag the timeline
//   open-hand sweep    → flick (momentum scroll)
//   two hands          → zoom (stretch time) — distance between the two hands
//   palm push          → dismiss (close the memory)
//   head position      → parallax
// Screen-space coordinates come out in CSS px. Hooks: on(name, fn). Thresholds live in tune.js.
import { TUNE } from './tune.js';

export class GestureEngine {
  constructor() {
    this.cursor = { x: 0, y: 0, on: false, pose: 'none' };
    this.second = null;                   // second hand marker
    this.dwell = 0;                       // 0..1 progress ring
    this.head = { x: 0, y: 0 };           // -1..1
    this.handlers = {};
    this.debug = { push: 1, vx: 0, dwell: 0 };   // numbers for the mirror-view readout
    this._drag = null; this._dwell = null; this._zoom = null; this._pushHist = []; this._lastPush = 0; this._lastFlick = 0; this._hist = []; this._lock = null;
    this.W = 1; this.H = 1;
  }
  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  emit(name, arg) { (this.handlers[name] || []).forEach(f => f(arg)); }
  resize(W, H) { this.W = W; this.H = H; }
  map(p) { return { x: (p.x - .5) * TUNE.gain * this.W + this.W / 2, y: (p.y - .5) * TUNE.gain * this.H + this.H / 2 }; }

  // frame = {hands, head}; now in ms
  feed(frame, now) {
    if (frame.head) { this.head.x = (frame.head.x - .5) * 2 * TUNE.headGain; this.head.y = (frame.head.y - .5) * 2 * TUNE.headGain; this.emit('head', this.head); }
    const hands = frame.hands;
    if (!hands.length) { this._release(); this.cursor.on = false; this.second = null; this.dwell = 0; this._hist = []; this._pushHist = []; this.debug.push = 1; return; }
    // primary = the hand closest to the previous cursor (keeps control stable when two hands are in view)
    const mapped = hands.map(h => ({ h, p: this.map(h.tip) }));
    if (this.cursor.on) mapped.sort((a, b) => Math.hypot(a.p.x - this.cursor.x, a.p.y - this.cursor.y) - Math.hypot(b.p.x - this.cursor.x, b.p.y - this.cursor.y));
    const { h, p } = mapped[0];
    if (this.cursor.on) {
      const dx = p.x - this.cursor.x, dy = p.y - this.cursor.y;
      if (Math.hypot(dx, dy) > TUNE.deadzone) { this.cursor.x += dx * TUNE.smooth; this.cursor.y += dy * TUNE.smooth; }
    } else { this.cursor.x = p.x; this.cursor.y = p.y; }
    this.cursor.on = true; this.cursor.pose = h.pose;
    this.second = mapped[1] ? { ...mapped[1].p, pose: mapped[1].h.pose } : null;
    // velocity over the last ~100 ms (robust to single-frame jitter)
    this._hist.push({ x: this.cursor.x, t: now }); this._hist = this._hist.filter(e => now - e.t < 100);
    const h0 = this._hist[0], vx = h0 && now > h0.t ? (this.cursor.x - h0.x) / ((now - h0.t) / 1000) : 0;
    this.debug.vx = vx;

    // two-hand zoom: both hands visible (and, gated, both open or both grabbing) → distance between them scales time
    const grab = pz => pz === 'pinch' || pz === 'fist';
    const two = mapped[1] && hands.length === 2 && (!TUNE.zoomGate || (h.pose === 'open' && mapped[1].h.pose === 'open') || (grab(h.pose) && grab(mapped[1].h.pose)));
    if (two) {
      const d = Math.hypot(mapped[0].p.x - mapped[1].p.x, mapped[0].p.y - mapped[1].p.y);
      if (!this._zoom) { this._zoom = { d0: d }; this.emit('zoomStart'); }
      else this.emit('zoom', d / this._zoom.d0);
      this._endDrag(); this._dwell = null; this.dwell = 0; this._pushHist = []; return;
    } else if (this._zoom) { this._zoom = null; this.emit('zoomEnd'); }

    // grab (pinch or fist)
    const grabbing = grab(h.pose);
    if (grabbing && !this._drag) { this._drag = { x0: this.cursor.x, y0: this.cursor.y, t0: now, moved: false, pose: h.pose }; this.emit('dragStart', { x: this.cursor.x, y: this.cursor.y, pose: h.pose }); }
    else if (grabbing && this._drag) {
      const dx = this.cursor.x - this._drag.x0, dy = this.cursor.y - this._drag.y0;
      if (Math.hypot(dx, dy) > TUNE.dragDead) this._drag.moved = true;
      this.emit('drag', { dx, dy, vx, x: this.cursor.x, y: this.cursor.y, pose: h.pose });
    } else if (!grabbing && this._drag) {
      const tap = !this._drag.moved && now - this._drag.t0 < 600;
      this._endDrag(vx);
      if (tap) this.emit('tap', { x: this.cursor.x, y: this.cursor.y });
    }

    // point + dwell → select. After a select the dwell is locked until the pose changes (or rearmMs passes),
    // so a finger that keeps pointing after opening a memory doesn't immediately close it again.
    if (this._lock && (h.pose !== 'point' || now - this._lock > TUNE.rearmMs)) this._lock = null;
    if (h.pose === 'point' && !this._drag && !this._lock) {
      if (!this._dwell || Math.hypot(this.cursor.x - this._dwell.x, this.cursor.y - this._dwell.y) > TUNE.dwellRadius) this._dwell = { x: this.cursor.x, y: this.cursor.y, t: now };
      else { this._dwell.x += (this.cursor.x - this._dwell.x) * .1; this._dwell.y += (this.cursor.y - this._dwell.y) * .1; }   // anchor drifts with a slowly settling finger; only a real move resets
      this.dwell = Math.min(1, (now - this._dwell.t) / TUNE.dwellMs);
      if (this.dwell >= 1) { this._lock = now; this._dwell = null; this.dwell = 0; this.emit('select', { x: this.cursor.x, y: this.cursor.y }); }
    } else { this._dwell = null; this.dwell = 0; }
    this.debug.dwell = this.dwell;

    // open-hand sweep → flick
    if (h.pose === 'open' && !this._drag && Math.abs(vx) > TUNE.flickV && now - this._lastFlick > 500) { this._lastFlick = now; this.emit('flick', { vx }); }

    // palm push → dismiss: an open hand grows quickly toward the camera (palm size is aspect-corrected in the tracker)
    this._pushHist.push({ t: now, s: h.palm, open: h.pose === 'open' });
    this._pushHist = this._pushHist.filter(e => now - e.t < TUNE.pushMs);
    const first = this._pushHist[0];
    const ratio = first ? h.palm / first.s : 1; this.debug.push = ratio;
    if (first && h.pose === 'open' && first.open && ratio > TUNE.pushRatio && now - this._lastPush > 1000) { this._lastPush = now; this._pushHist = []; this.emit('push', {}); }
  }
  _endDrag(vx = 0) { if (this._drag) { this.emit('dragEnd', { vx, moved: this._drag.moved }); this._drag = null; } }
  _release() { this._endDrag(0); this._dwell = null; this._lock = null; if (this._zoom) { this._zoom = null; this.emit('zoomEnd'); } }
}
