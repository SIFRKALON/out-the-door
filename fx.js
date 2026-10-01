// Out the Door: living background for the Line theme.
// Time of day (real sun), plus whatever the weather is doing right now: sun, clouds, rain, snow, fog, storms, cold, heat.
// Fx.mount(canvas) / Fx.unmount(); Fx.set({ wx, lat, lon }).
const Fx = (() => {
  let cv = null, ctx = null, raf = 0, w = 0, h = 0, dpr = 1, last = 0;
  let st = { wx: null, lat: 40.7, lon: -73.93 };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const R = i => { const x = Math.sin(i * 91.7 + 13.3) * 43758.5453; return x - Math.floor(x); };
  const stars = Array.from({ length: 140 }, (_, i) => ({ x: R(i), y: R(i + 400) * 0.6, p: R(i + 800) * 6.28, s: R(i + 1200) }));
  const drops = Array.from({ length: 260 }, (_, i) => ({ x: R(i + 2000), y: R(i + 3000), v: 0.7 + R(i + 4000) * 0.6, l: 0.6 + R(i + 5000) * 0.8 }));
  const clouds = Array.from({ length: 9 }, (_, i) => ({ x: R(i + 6000), y: 0.04 + R(i + 6100) * 0.42, s: 0.7 + R(i + 6200) * 0.9, v: 0.004 + R(i + 6300) * 0.006 }));
  let flash = 0, nextFlash = 4, moonCanvas = null;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function phaseNow(now) {
    if (!window.SunCalc) return { phase: "day", alt: 30 };
    const alt = SunCalc.getPosition(now, st.lat, st.lon).altitude * 180 / Math.PI;
    return { alt, phase: alt < -6 ? "night" : alt < 0 ? "dusk" : alt < 10 ? "golden" : "day" };
  }

  function cloud(x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    [[0, 0, 60], [55, -18, 48], [105, 0, 56], [40, 22, 50], [-45, 14, 40]].forEach(([dx, dy, r]) => {
      ctx.moveTo(x + dx * s + r * s, y + dy * s); ctx.arc(x + dx * s, y + dy * s, r * s, 0, 6.29);
    });
    ctx.fill();
  }

  function frame(ts) {
    raf = reduce ? 0 : requestAnimationFrame(frame);
    if (ts - last < 33) return;   // ~30fps is plenty
    last = ts;
    const t = ts / 1000, now = new Date();
    const { phase } = phaseNow(now);
    const wx = st.wx || { kind: "clear", cloud: 0 };
    const night = phase === "night";
    ctx.clearRect(0, 0, w, h);

    // time of day
    if (night) { ctx.fillStyle = "rgba(12,16,36,0.78)"; ctx.fillRect(0, 0, w, h); }
    else if (phase === "dusk" || phase === "golden") {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, phase === "dusk" ? "rgba(92,72,128,0.55)" : "rgba(255,170,100,0.30)");
      g.addColorStop(0.55, phase === "dusk" ? "rgba(214,130,120,0.22)" : "rgba(255,200,140,0.10)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    // overcast dims the day
    const gray = wx.kind === "cloudy" || wx.kind === "rain" || wx.kind === "storm" || wx.kind === "snow" || wx.kind === "fog";
    if (gray && !night) { ctx.fillStyle = "rgba(110,118,130,0.22)"; ctx.fillRect(0, 0, w, h); }

    // sun or stars + moon
    const clearish = wx.kind === "clear" || wx.kind === "partly";
    if (!night && clearish) {
      const sx = w * 0.88, sy = phase === "day" ? 40 : h * 0.18;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.55);
      g.addColorStop(0, phase === "day" ? "rgba(255,236,170,0.55)" : "rgba(255,180,110,0.55)");
      g.addColorStop(1, "rgba(255,230,170,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 0.03);
      ctx.fillStyle = "rgba(255,225,150,0.10)";
      for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, Math.max(w, h)); ctx.lineTo(30, Math.max(w, h)); ctx.fill(); }
      ctx.restore();
    }
    if (night && wx.kind !== "fog" && wx.kind !== "cloudy" && wx.kind !== "rain" && wx.kind !== "storm" && wx.kind !== "snow") {
      stars.forEach(s => { ctx.fillStyle = `rgba(255,244,214,${0.25 + 0.6 * (Math.sin(t * 1.4 + s.p) + 1) / 2 * s.s})`; ctx.fillRect(s.x * w, s.y * h, s.s > 0.8 ? 2 : 1.3, s.s > 0.8 ? 2 : 1.3); });
      if (window.SunCalc) {
        const mp = SunCalc.getMoonPosition(now, st.lat, st.lon);
        if (mp.altitude > 0) {
          const { fraction, phase: mph } = SunCalc.getMoonIllumination(now);
          const mx = w * 0.8, my = h * 0.12, r = 18;
          const g = ctx.createRadialGradient(mx, my, 0, mx, my, 140);
          g.addColorStop(0, "rgba(244,235,208,0.22)"); g.addColorStop(1, "rgba(244,235,208,0)");
          ctx.fillStyle = g; ctx.fillRect(mx - 140, my - 140, 280, 280);
          // lit part only: draw the disc on a scratch canvas, cut the shadow out, stamp it
          const mc = moonCanvas || (moonCanvas = document.createElement("canvas"));
          mc.width = mc.height = r * 2 + 2;
          const m = mc.getContext("2d");
          m.fillStyle = "#F4EBD0"; m.beginPath(); m.arc(r + 1, r + 1, r, 0, 6.29); m.fill();
          m.globalCompositeOperation = "destination-out";
          m.beginPath(); m.arc(r + 1 + (mph < 0.5 ? -1 : 1) * 2 * r * fraction, r + 1, r, 0, 6.29); m.fill();
          ctx.drawImage(mc, mx - r - 1, my - r - 1);
        }
      }
    }

    // clouds
    const nClouds = wx.kind === "clear" ? 0 : wx.kind === "partly" ? 4 : 9;
    clouds.slice(0, nClouds).forEach(c => {
      const x = ((c.x + t * c.v * 0.2) % 1.4 - 0.2) * w, y = c.y * h;
      cloud(x, y, c.s * Math.max(0.8, w / 1200),
        night ? "rgba(70,78,108,0.55)" : gray ? "rgba(200,205,214,0.60)" : "rgba(255,255,255,0.70)");
    });

    // fog
    if (wx.kind === "fog") for (let i = 0; i < 6; i++) {
      const y = h * (0.15 + i * 0.15) + Math.sin(t * 0.2 + i) * 20;
      const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      g.addColorStop(0, "rgba(230,232,236,0)"); g.addColorStop(0.5, `rgba(230,232,236,${night ? 0.18 : 0.45})`); g.addColorStop(1, "rgba(230,232,236,0)");
      ctx.fillStyle = g; ctx.fillRect(0, y - 60, w, 120);
    }

    // rain / storm
    if (wx.kind === "rain" || wx.kind === "storm") {
      const n = wx.heavy || wx.kind === "storm" ? 260 : 140;
      ctx.strokeStyle = night ? "rgba(175,200,235,0.45)" : "rgba(70,95,140,0.38)"; ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const d = drops[i], y = ((d.y + t * d.v * 1.6) % 1.1 - 0.05) * h, x = ((d.x - y / h * 0.18 + 1) % 1) * w;
        ctx.moveTo(x, y); ctx.lineTo(x - 5 * d.l, y + 22 * d.l);
      }
      ctx.stroke();
      if (wx.kind === "storm") {
        if (t > nextFlash) { flash = 1; nextFlash = t + 5 + Math.random() * 9; }
        if (flash > 0) { ctx.fillStyle = `rgba(235,240,255,${flash * 0.55})`; ctx.fillRect(0, 0, w, h); flash -= 0.08; }
      }
    }

    // snow
    if (wx.kind === "snow") {
      ctx.fillStyle = night ? "rgba(240,244,255,0.85)" : "rgba(255,255,255,0.95)";
      for (let i = 0; i < (wx.heavy ? 220 : 120); i++) {
        const d = drops[i], y = ((d.y + t * d.v * 0.12) % 1.05) * h, x = ((d.x + Math.sin(t * 0.8 + i) * 0.01 + 1) % 1) * w;
        ctx.beginPath(); ctx.arc(x, y, 1.5 + d.l * 1.8, 0, 6.29); ctx.fill();
      }
    }

    // cold: frost creeping in from the corners. hot: warm haze.
    if (wx.cold) [[0, 0], [w, 0], [0, h], [w, h]].forEach(([x, y]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.45);
      g.addColorStop(0, "rgba(205,228,255,0.55)"); g.addColorStop(1, "rgba(205,228,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    if (wx.hot) {
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, `rgba(255,120,50,${0.16 + Math.sin(t * 0.7) * 0.04})`); g.addColorStop(1, "rgba(255,170,80,0.04)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
  }

  return {
    mount(canvas) {
      cv = canvas; ctx = cv.getContext("2d"); resize();
      addEventListener("resize", resize);
      cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    },
    unmount() { cancelAnimationFrame(raf); raf = 0; if (ctx) ctx.clearRect(0, 0, w, h); },
    set(s) { st = { ...st, ...s }; if (reduce && ctx) { last = 0; frame(performance.now()); } },
    isNight() { return phaseNow(new Date()).phase === "night"; },
  };
})();
