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
  // a few loose constellations, placed for the page rather than the real sky (the real ceiling is famously painted backwards too)
  const CONSTELLATIONS = [
    [[0.08, 0.10], [0.13, 0.07], [0.19, 0.11], [0.24, 0.08], [0.29, 0.13]],
    [[0.40, 0.22], [0.45, 0.17], [0.51, 0.20], [0.47, 0.27], [0.40, 0.22]],
    [[0.62, 0.06], [0.66, 0.12], [0.71, 0.09], [0.77, 0.14]],
    [[0.12, 0.38], [0.17, 0.33], [0.22, 0.40], [0.18, 0.46]],
    [[0.70, 0.36], [0.76, 0.31], [0.83, 0.35], [0.88, 0.30], [0.93, 0.34]],
  ];
  function sparkle(x, y, r, a) {   // a small four-point gold star
    ctx.fillStyle = `rgba(240,212,130,${a})`;
    ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r * 0.45, y - r * 0.45); ctx.lineTo(x + r * 2, y); ctx.lineTo(x + r * 0.45, y + r * 0.45);
    ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r * 0.45, y + r * 0.45); ctx.lineTo(x - r * 2, y); ctx.lineTo(x - r * 0.45, y - r * 0.45); ctx.closePath(); ctx.fill();
  }

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

  // ---------- little things that happen now and then ----------
  // Each kind waits a random while, then plays once if the conditions fit (time of day, weather, season).
  const sprites = [];
  const next = {};
  const rand = (a, b) => a + Math.random() * (b - a);
  function md(now) { return (now.getMonth() + 1) * 100 + now.getDate(); }   // e.g. Oct 31 -> 1031
  const EGGS = {
    star:     { every: [45, 110], ok: c => c.night && c.clear },
    plane:    { every: [50, 120], ok: c => c.night || c.phase === "dusk" },
    pigeon:   { every: [60, 150], ok: c => !c.night && c.kind !== "storm" && c.kind !== "snow" },
    steam:    { every: c => c.cold ? [25, 55] : [120, 240], ok: () => true },
    leaves:   { every: [40, 90], ok: c => c.md >= 922 && c.md <= 1130 && c.kind !== "snow" },
    train:    { every: [110, 220], ok: () => true },
    bats:     { every: [35, 70], ok: c => c.night && c.md >= 1024 && c.md <= 1101 },
    fireworks:{ every: [6, 14], ok: c => c.night && (c.md === 704 || c.md === 1231 || c.md === 101) },
  };

  function spawn(kind, c) {
    const now = performance.now() / 1000;
    if (kind === "star") sprites.push({ kind, t0: now, dur: 1.3, x: rand(0.3, 0.95) * w, y: rand(0.03, 0.3) * h, a: rand(2.4, 2.8) });
    if (kind === "plane") { const dir = Math.random() < 0.5 ? 1 : -1; sprites.push({ kind, t0: now, dur: 28, dir, y: rand(0.08, 0.32) * h }); }
    if (kind === "pigeon") { const dir = Math.random() < 0.5 ? 1 : -1; sprites.push({ kind, t0: now, dur: rand(7, 10), dir, y: rand(0.12, 0.45) * h, s: rand(0.8, 1.2) }); }
    if (kind === "steam") sprites.push({ kind, t0: now, dur: 9, x: rand(0.1, 0.9) * w, stack: Math.random() < 0.3 });
    if (kind === "leaves") for (let i = 0; i < 7; i++) sprites.push({ kind: "leaf", t0: now + i * rand(0.4, 1.4), dur: rand(9, 14), x: rand(0, 1) * w, s: rand(0.8, 1.3), hue: i % 3, spin: rand(-2, 2) });
    if (kind === "train") { const dir = Math.random() < 0.5 ? 1 : -1; sprites.push({ kind, t0: now, dur: 16, dir }); }
    if (kind === "bats") for (let i = 0; i < 3; i++) sprites.push({ kind: "bat", t0: now + i * 0.6, dur: 9, dir: 1, y: rand(0.1, 0.35) * h + i * 18 });
    if (kind === "fireworks") sprites.push({ kind: "burst", t0: now, dur: 2.4, x: rand(0.15, 0.85) * w, y: rand(0.08, 0.35) * h, col: ["#F2C14E", "#E8735A", "#7FD6CF", "#F4EBD0"][Math.floor(rand(0, 4))] });
  }

  function schedule(c, now) {
    for (const k in EGGS) {
      const e = EGGS[k], iv = typeof e.every === "function" ? e.every(c) : e.every;
      if (next[k] == null) next[k] = now + rand(8, 30);   // the first ones come soon after opening
      if (now >= next[k]) { if (e.ok(c)) spawn(k, c); next[k] = now + rand(iv[0], iv[1]); }
    }
  }

  function drawSprites(now, night) {
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i], p = (now - s.t0) / s.dur;
      if (p < 0) continue;
      if (p > 1) { sprites.splice(i, 1); continue; }
      ctx.save();
      if (s.kind === "star") {   // shooting star with a fading tail
        const len = 140, dx = Math.cos(s.a), dy = Math.sin(s.a), d = p * Math.max(w, h) * 0.45;
        const x = s.x + dx * d, y = s.y + dy * d;
        const g = ctx.createLinearGradient(x, y, x - dx * len, y - dy * len);
        g.addColorStop(0, `rgba(255,246,214,${1 - p})`); g.addColorStop(1, "rgba(255,246,214,0)");
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * len, y - dy * len); ctx.stroke();
      }
      if (s.kind === "plane") {   // the LaGuardia approach: a red blink and a white strobe crawling across
        const x = s.dir > 0 ? -20 + p * (w + 40) : w + 20 - p * (w + 40), y = s.y - p * 20;
        ctx.fillStyle = "rgba(220,225,235,0.55)"; ctx.fillRect(x - 1, y - 1, 3, 2);
        if (Math.floor(now * 1.2) % 2 === 0) { ctx.fillStyle = "#FF5A4E"; ctx.beginPath(); ctx.arc(x - s.dir * 6, y, 1.6, 0, 6.29); ctx.fill(); }
        if (Math.floor(now * 2.7) % 4 === 0) { ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(x + s.dir * 6, y, 1.8, 0, 6.29); ctx.fill(); }
      }
      if (s.kind === "pigeon") {   // a pigeon crossing, flapping
        const x = s.dir > 0 ? -30 + p * (w + 60) : w + 30 - p * (w + 60), y = s.y + Math.sin(now * 3) * 6, k = 7 * s.s;
        const flap = Math.sin(now * 14) * k * 0.9;
        ctx.fillStyle = night ? "#3A4256" : "#5E6470";
        ctx.beginPath(); ctx.ellipse(x, y, k * 1.3, k * 0.55, 0, 0, 6.29); ctx.fill();
        ctx.beginPath(); ctx.arc(x + s.dir * k * 1.3, y - k * 0.3, k * 0.42, 0, 6.29); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - k * 0.5, y); ctx.lineTo(x - s.dir * k * 0.2, y - flap - k * 0.3); ctx.lineTo(x + k * 0.6, y); ctx.fill();
        ctx.fillStyle = "#6FA58E"; ctx.beginPath(); ctx.arc(x + s.dir * k * 1.05, y - k * 0.05, k * 0.22, 0, 6.29); ctx.fill();   // the green neck sheen
      }
      if (s.kind === "steam") {   // steam from a manhole; sometimes a striped Con Ed stack
        const base = h + 4;
        if (s.stack) {
          const sx = s.x - 9, top = base - 46;
          for (let b = 0; b < 6; b++) { ctx.fillStyle = b % 2 ? "#F4EFE3" : "#E8732F"; ctx.fillRect(sx, top + b * 8, 18, 8); }
        }
        for (let j = 0; j < 9; j++) {
          const q = (p * 1.4 + j / 9) % 1, r = 10 + q * 46, y = base - (s.stack ? 50 : 4) - q * h * 0.35;
          ctx.fillStyle = `rgba(245,245,248,${0.28 * (1 - q) * Math.min(1, (1 - p) * 3)})`;
          ctx.beginPath(); ctx.arc(s.x + Math.sin(now + j) * 14 * q, y, r, 0, 6.29); ctx.fill();
        }
      }
      if (s.kind === "leaf") {   // autumn: a leaf tumbling down
        const y = -20 + p * (h + 40), x = s.x + Math.sin(now * 1.3 + s.spin * 3) * 40;
        ctx.translate(x, y); ctx.rotate(now * s.spin);
        ctx.fillStyle = ["#B5532B", "#C9952C", "#8E3A26"][s.hue];
        ctx.beginPath(); ctx.ellipse(0, 0, 7 * s.s, 3.6 * s.s, 0, 0, 6.29); ctx.fill();
        ctx.strokeStyle = "rgba(60,30,10,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7 * s.s, 0); ctx.lineTo(7 * s.s, 0); ctx.stroke();
      }
      if (s.kind === "train") {   // a little el train gliding along the bottom edge
        const len = 3 * 46, x = s.dir > 0 ? -len + p * (w + len) : w - p * (w + len), y = h - 18;
        ctx.fillStyle = night ? "rgba(20,30,40,0.55)" : "rgba(60,64,72,0.28)"; ctx.fillRect(0, y + 12, w, 3);
        for (let car = 0; car < 3; car++) {
          const cx = x + car * 46;
          ctx.fillStyle = night ? "rgba(30,40,52,0.8)" : "rgba(80,86,96,0.45)"; ctx.fillRect(cx, y, 42, 11);
          ctx.fillStyle = night ? "rgba(255,220,140,0.85)" : "rgba(220,226,232,0.6)";
          for (let wx = cx + 4; wx < cx + 38; wx += 8) ctx.fillRect(wx, y + 3, 5, 3);
        }
      }
      if (s.kind === "bat") {   // Halloween week
        const x = -20 + p * (w + 40), y = s.y + Math.sin(now * 5 + s.t0) * 10, f = Math.sin(now * 18) * 6;
        ctx.fillStyle = "#11141C";
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y - f); ctx.lineTo(x - 5, y + 2); ctx.lineTo(x, y + 4); ctx.lineTo(x + 5, y + 2); ctx.lineTo(x + 10, y - f); ctx.closePath(); ctx.fill();
      }
      if (s.kind === "burst") {   // fireworks
        const r = 10 + p * 70;
        for (let j = 0; j < 22; j++) {
          const a = j / 22 * 6.283, px2 = s.x + Math.cos(a) * r, py2 = s.y + Math.sin(a) * r + p * p * 30;
          ctx.fillStyle = s.col; ctx.globalAlpha = 1 - p; ctx.beginPath(); ctx.arc(px2, py2, 2, 0, 6.29); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // warm nights: fireflies drifting low on the page
  const flies = Array.from({ length: 14 }, (_, i) => ({ x: R(i + 9000), y: 0.55 + R(i + 9100) * 0.4, p: R(i + 9200) * 6.28 }));
  function drawFireflies(t) {
    flies.forEach(f => {
      const x = (f.x + Math.sin(t * 0.3 + f.p) * 0.03) * w, y = (f.y + Math.cos(t * 0.25 + f.p) * 0.03) * h;
      const a = Math.max(0, Math.sin(t * 1.6 + f.p * 3));
      const g = ctx.createRadialGradient(x, y, 0, x, y, 10);
      g.addColorStop(0, `rgba(230,255,140,${0.8 * a})`); g.addColorStop(1, "rgba(230,255,140,0)");
      ctx.fillStyle = g; ctx.fillRect(x - 10, y - 10, 20, 20);
    });
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
    // night: the Grand Central ceiling. Deep teal, gold stars, faint constellation lines.
    if (night) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(18,58,60,0.92)"); g.addColorStop(1, "rgba(12,38,42,0.92)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
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
      ctx.strokeStyle = "rgba(233,200,106,0.22)"; ctx.lineWidth = 1;
      CONSTELLATIONS.forEach(c => { ctx.beginPath(); c.forEach(([x, y], i) => i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)); ctx.stroke(); });
      CONSTELLATIONS.flat().forEach(([x, y], i) => sparkle(x * w, y * h, 2.2 + (i % 3), 0.55 + 0.4 * (Math.sin(t * 1.1 + i) + 1) / 2));
      stars.forEach(s => { ctx.fillStyle = `rgba(233,200,106,${0.2 + 0.55 * (Math.sin(t * 1.4 + s.p) + 1) / 2 * s.s})`; ctx.fillRect(s.x * w, s.y * h, s.s > 0.8 ? 2 : 1.3, s.s > 0.8 ? 2 : 1.3); });
      if (window.SunCalc) {
        const mp = SunCalc.getMoonPosition(now, st.lat, st.lon);
        if (mp.altitude > 0) {
          const { fraction, phase: mph } = SunCalc.getMoonIllumination(now);
          // on phones the moon sits lower, where it glows through the glass panels
          const narrow = w < 600, mx = narrow ? w * 0.74 : w * 0.8, my = narrow ? h * 0.56 : h * 0.12, r = narrow ? 18 : 18;
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

    // the little things
    const ctxInfo = { night, phase, kind: wx.kind, clear: !["cloudy", "rain", "storm", "snow", "fog"].includes(wx.kind), cold: !!wx.cold, md: md(now) };
    if (!reduce) schedule(ctxInfo, t);
    if (night && (wx.feels ?? 0) >= 65 && ctxInfo.clear) drawFireflies(t);
    drawSprites(t, night);

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
    trigger(kind) { if (ctx) spawn(kind, {}); },
    set(s) { st = { ...st, ...s }; if (reduce && ctx) { last = 0; frame(performance.now()); } },
    isNight() { return phaseNow(new Date()).phase === "night"; },
  };
})();
