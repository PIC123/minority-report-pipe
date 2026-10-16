// Mouse + touch fallback that speaks the same intents as GestureEngine, so the
// app logic doesn't care which one is driving. On phones the device tilt
// stands in for head tracking until the camera is enabled.
export class PointerInput {
  constructor(el) {
    this.el = el; this.handlers = {}; this.cursor = { x: 0, y: 0, on: false, pose: 'none' }; this.second = null; this.dwell = 0; this.head = { x: 0, y: 0 };
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.pts = new Map(); this.drag = null; this.pinch = null; this.hist = []; this.tiltOn = false;
    el.addEventListener('pointerdown', e => this._down(e)); el.addEventListener('pointermove', e => this._move(e));
    el.addEventListener('pointerup', e => this._up(e)); el.addEventListener('pointercancel', e => this._up(e));
    el.addEventListener('wheel', e => { e.preventDefault(); this.emit('wheel', { dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey }); }, { passive: false });
    addEventListener('keydown', e => this.emit('key', e.key));
    this.W = innerWidth; this.H = innerHeight;
  }
  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  emit(name, arg) { (this.handlers[name] || []).forEach(f => f(arg)); }
  resize(W, H) { this.W = W; this.H = H; }
  feed() {}  // nothing to poll; events drive it

  async enableTilt() {
    try { if (DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return false; } } catch { return false; }
    let base = null;
    addEventListener('deviceorientation', e => {
      if (e.gamma == null) return;
      const g = e.gamma, b = e.beta; if (!base) base = { g, b };
      const land = Math.abs(screen.orientation?.angle || 0) === 90;
      const x = land ? (b - base.b) / 25 : (g - base.g) / 25, y = land ? (g - base.g) / 25 : (b - base.b) / 25;
      this.head.x = Math.max(-1, Math.min(1, -x)); this.head.y = Math.max(-1, Math.min(1, -y)); this.emit('head', this.head);
    });
    this.tiltOn = true; return true;
  }

  _down(e) {
    if (e.target.closest?.('button,a,input,select,details,summary,label')) return;   // let UI controls get their own click (pointer capture on the stage would steal it)
    this.el.setPointerCapture?.(e.pointerId); this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.cursor.x = e.clientX; this.cursor.y = e.clientY; this.cursor.on = true;
    if (this.pts.size === 2) { const [a, b] = [...this.pts.values()]; this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) }; if (this.drag) { this.emit('dragEnd', { vx: 0, moved: this.drag.moved }); this.drag = null; } this.emit('zoomStart'); return; }
    this.drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false }; this.hist = [];
    this.cursor.pose = 'pinch'; this.emit('dragStart', { x: e.clientX, y: e.clientY, pose: 'pinch' });
  }
  _move(e) {
    if (this.pts.has(e.pointerId)) this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pts.size === 2) { const [a, b] = [...this.pts.values()]; this.emit('zoom', Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d0); return; }
    this.cursor.x = e.clientX; this.cursor.y = e.clientY; this.cursor.on = true;
    if (!this.touch && !this.drag) { this.head.x = (e.clientX / this.W - .5) * 1.2; this.head.y = (e.clientY / this.H - .5) * 1.2; this.emit('head', this.head); this.cursor.pose = 'open'; }
    if (this.drag) {
      const now = performance.now(); this.hist.push({ x: e.clientX, t: now }); this.hist = this.hist.filter(h => now - h.t < 120);
      const dx = e.clientX - this.drag.x0, dy = e.clientY - this.drag.y0; if (Math.hypot(dx, dy) > 8) this.drag.moved = true;
      const h0 = this.hist[0], vx = h0 && now > h0.t ? (e.clientX - h0.x) / ((now - h0.t) / 1000) : 0;
      this.emit('drag', { dx, dy, vx, x: e.clientX, y: e.clientY, pose: 'pinch' });
    }
  }
  _up(e) {
    this.pts.delete(e.pointerId);
    if (this.pinch) { if (this.pts.size < 2) { this.pinch = null; this.emit('zoomEnd'); } return; }
    if (!this.drag) return;
    const now = performance.now(), h0 = this.hist[0], vx = h0 && now > h0.t ? (e.clientX - h0.x) / ((now - h0.t) / 1000) : 0;
    const tap = !this.drag.moved && now - this.drag.t0 < 500, swipeDown = this.drag.moved && (e.clientY - this.drag.y0) > 140 && Math.abs(e.clientX - this.drag.x0) < 80;
    this.emit('dragEnd', { vx, moved: this.drag.moved }); this.drag = null; this.cursor.pose = this.touch ? 'none' : 'open';
    if (tap) this.emit('select', { x: e.clientX, y: e.clientY });
    if (swipeDown) this.emit('push', {});
    if (this.touch) this.cursor.on = false;
  }
}
