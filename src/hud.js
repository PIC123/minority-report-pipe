// 2D overlay: the glowing cursor, dwell ring, second-hand marker, gesture flashes.
export class Hud {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.flash = null; this.resize(); }
  resize() { this.W = this.c.clientWidth; this.H = this.c.clientHeight; const d = Math.min(2, devicePixelRatio || 1); this.c.width = this.W * d; this.c.height = this.H * d; this.g.setTransform(d, 0, 0, d, 0, 0); }
  say(text) { this.flash = { text, t: performance.now() }; }
  draw(cursor, dwell, second, now) {
    const g = this.g; g.clearRect(0, 0, this.W, this.H);
    if (cursor.on) {
      const { x, y, pose } = cursor;
      const col = pose === 'pinch' || pose === 'fist' ? 'rgba(255,180,92,.95)' : pose === 'point' ? 'rgba(255,255,255,.95)' : 'rgba(95,232,255,.9)';
      const r = pose === 'pinch' || pose === 'fist' ? 9 : pose === 'point' ? 14 : 20;
      g.save(); g.shadowColor = col; g.shadowBlur = 18; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.stroke();
      g.beginPath(); g.arc(x, y, 2.5, 0, 6.283); g.fill();
      if (pose === 'open' || pose === 'none') { g.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(x + dx * 24, y + dy * 24); g.lineTo(x + dx * 32, y + dy * 32); } g.stroke(); }
      if (dwell > 0) { g.lineWidth = 3; g.beginPath(); g.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + dwell * 6.283); g.stroke(); }
      g.restore();
    }
    if (second) { g.save(); g.strokeStyle = 'rgba(179,136,255,.85)'; g.shadowColor = g.strokeStyle; g.shadowBlur = 12; g.lineWidth = 1.4; g.beginPath(); g.arc(second.x, second.y, second.pose === 'pinch' || second.pose === 'fist' ? 8 : 16, 0, 6.283); g.stroke(); g.restore(); }
    if (this.flash) {
      const a = 1 - (now - this.flash.t) / 900; if (a <= 0) this.flash = null; else {
        g.save(); g.globalAlpha = a; g.font = '600 13px Rajdhani, sans-serif'; g.letterSpacing = '4px'; g.fillStyle = '#ffb45c'; g.textAlign = 'center'; g.shadowColor = '#ffb45c'; g.shadowBlur = 14;
        g.fillText(this.flash.text.toUpperCase(), this.W / 2, 86 - (1 - a) * 14); g.restore();
      }
    }
  }
}
