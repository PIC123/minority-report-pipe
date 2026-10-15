// Turns tracker frames into interaction intents. Vocabulary:
//   point + dwell      → select (open a memory)
//   pinch / fist + move→ grab & drag the timeline
//   open-hand sweep    → flick (momentum scroll)
//   two hands          → zoom (stretch time) — distance between the two hands
//   palm push          → dismiss (close the memory)
//   head position      → parallax
// Screen-space coordinates come out in CSS px. Hooks: on(name, fn).
export class GestureEngine {
  constructor({ gain = 1.7, dwellMs = 650 } = {}) {
    this.gain = gain; this.dwellMs = dwellMs;
    this.cursor = { x: 0, y: 0, on: false, pose: 'none' };
    this.second = null;                   // second hand marker
    this.dwell = 0;                       // 0..1 progress ring
    this.head = { x: 0, y: 0 };           // -1..1
    this.handlers = {};
    this._drag = null; this._dwell = null; this._zoom = null; this._pushHist = []; this._lastPush = 0; this._lastFlick = 0; this._last = null;
    this.W = 1; this.H = 1;
  }
  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  emit(name, arg) { (this.handlers[name] || []).forEach(f => f(arg)); }
  resize(W, H) { this.W = W; this.H = H; }
  map(p) { return { x: (p.x - .5) * this.gain * this.W + this.W / 2, y: (p.y - .5) * this.gain * this.H + this.H / 2 }; }

  // frame = {hands, head}; now in ms
  feed(frame, now) {
    if (frame.head) { this.head.x = (frame.head.x - .5) * 2; this.head.y = (frame.head.y - .5) * 2; this.emit('head', this.head); }
    const hands = frame.hands;
    if (!hands.length) { this._release(now); this.cursor.on = false; this.second = null; this.dwell = 0; this._last = null; return; }
    // primary = the hand closest to the previous cursor (keeps control stable when two hands are in view)
    const mapped = hands.map(h => ({ h, p: this.map(h.tip) }));
    mapped.sort((a, b) => Math.hypot(a.p.x - this.cursor.x, a.p.y - this.cursor.y) - Math.hypot(b.p.x - this.cursor.x, b.p.y - this.cursor.y));
    const { h, p } = mapped[0];
    const k = .5; const prevOn = this.cursor.on;
    this.cursor.x = prevOn ? this.cursor.x + (p.x - this.cursor.x) * k : p.x;
    this.cursor.y = prevOn ? this.cursor.y + (p.y - this.cursor.y) * k : p.y;
    this.cursor.on = true; this.cursor.pose = h.pose;
    this.second = mapped[1] ? { ...mapped[1].p, pose: mapped[1].h.pose } : null;
    const dt = this._last ? Math.max(1, now - this._last.t) / 1000 : 1 / 30;
    const vx = this._last ? (this.cursor.x - this._last.x) / dt : 0;

    // two-hand zoom: both hands visible, neither dragging → distance between them scales time
    if (mapped[1] && hands.length === 2) {
      const d = Math.hypot(mapped[0].p.x - mapped[1].p.x, mapped[0].p.y - mapped[1].p.y);
      if (!this._zoom) { this._zoom = { d0: d }; this.emit('zoomStart'); }
      else this.emit('zoom', d / this._zoom.d0);
      this._endDrag(); this._dwell = null; this.dwell = 0; this._last = { x: this.cursor.x, y: this.cursor.y, t: now }; return;
    } else if (this._zoom) { this._zoom = null; this.emit('zoomEnd'); }

    // grab (pinch or fist)
    const grabbing = h.pose === 'pinch' || h.pose === 'fist';
    if (grabbing && !this._drag) { this._drag = { x0: this.cursor.x, y0: this.cursor.y, t0: now, moved: false, pose: h.pose }; this.emit('dragStart', { x: this.cursor.x, y: this.cursor.y, pose: h.pose }); }
    else if (grabbing && this._drag) {
      const dx = this.cursor.x - this._drag.x0, dy = this.cursor.y - this._drag.y0;
      if (Math.hypot(dx, dy) > 12) this._drag.moved = true;
      this.emit('drag', { dx, dy, vx, x: this.cursor.x, y: this.cursor.y, pose: h.pose });
    } else if (!grabbing && this._drag) {
      const tap = !this._drag.moved && now - this._drag.t0 < 600;
      this._endDrag(vx);
      if (tap) this.emit('tap', { x: this.cursor.x, y: this.cursor.y });
    }

    // point + dwell → select
    if (h.pose === 'point' && !this._drag) {
      if (!this._dwell || Math.hypot(this.cursor.x - this._dwell.x, this.cursor.y - this._dwell.y) > 48) this._dwell = { x: this.cursor.x, y: this.cursor.y, t: now, fired: false };
      this.dwell = Math.min(1, (now - this._dwell.t) / this.dwellMs);
      if (this.dwell >= 1 && !this._dwell.fired) { this._dwell.fired = true; this.emit('select', { x: this.cursor.x, y: this.cursor.y }); }
    } else { this._dwell = null; this.dwell = 0; }

    // open-hand sweep → flick
    if (h.pose === 'open' && !this._drag && Math.abs(vx) > 2400 && now - this._lastFlick > 500) { this._lastFlick = now; this.emit('flick', { vx }); }

    // palm push → dismiss: open hand grows quickly toward the camera
    this._pushHist.push({ t: now, s: h.palm, open: h.pose === 'open' });
    this._pushHist = this._pushHist.filter(e => now - e.t < 380);
    const first = this._pushHist[0];
    if (first && h.pose === 'open' && first.open && h.palm / first.s > 1.33 && now - this._lastPush > 1000) { this._lastPush = now; this._pushHist = []; this.emit('push', {}); }

    this._last = { x: this.cursor.x, y: this.cursor.y, t: now };
  }
  _endDrag(vx = 0) { if (this._drag) { this.emit('dragEnd', { vx, moved: this._drag.moved }); this._drag = null; } }
  _release(now) { this._endDrag(0); this._dwell = null; if (this._zoom) { this._zoom = null; this.emit('zoomEnd'); } }
}
