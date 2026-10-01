// Out the Door: the pixel neighborhood (192 x 108 logical pixels, scaled up crisp).
// Scene.mount(canvas) once, then Scene.set({...}) whenever data changes.
const Scene = (() => {
  const W = 192, H = 108, STATION_X = 182;
  let ctx = null, timer = 0;
  let st = { forceNight: false, rain: false, snow: false, leaving: false, train: null, lat: 40.7, lon: -73.93 };

  const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const stars = Array.from({ length: 46 }, (_, i) => ({ x: Math.floor(rnd(i) * W), y: Math.floor(rnd(i + 99) * 34), p: rnd(i + 7) }));
  const drops = Array.from({ length: 80 }, (_, i) => ({ x: rnd(i + 300) * W, y: rnd(i + 500) * H, v: 2.2 + rnd(i + 700) * 1.6 }));
  const HOUSES = [
    { x: 0,   w: 30, top: 30, c: "#7A3B30" },   // home
    { x: 30,  w: 26, top: 36, c: "#5E4636" },
    { x: 56,  w: 34, top: 27, c: "#8A4A38" },
    { x: 90,  w: 24, top: 34, c: "#4F4A5E" },
    { x: 114, w: 30, top: 30, c: "#7A3B30" },
    { x: 144, w: 48, top: 40, c: "#5E4636" },
  ];
  const LAMPS = [42, 104, 138];

  const px = (c, x, y, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  function glow(x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,190,90,${a})`); g.addColorStop(1, "rgba(255,190,90,0)");
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function disc(cx, cy, r, color, cut) {   // pixel disc; cut(dx,dy) true = skip pixel
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r + 1 && !(cut && cut(dx, dy))) px(color, cx + dx, cy + dy);
  }
  function skyPos(alt, az) {   // azimuth from south, + toward west (SunCalc)
    return { x: Math.round(W / 2 + (az / (Math.PI / 2)) * 80), y: Math.round(Math.max(4, Math.min(40, 40 - (alt / (Math.PI / 3)) * 36))) };
  }

  function draw() {
    if (!ctx) return;
    const now = new Date(), t = now.getTime() / 1000;
    let alt = 0.5;
    if (window.SunCalc) alt = SunCalc.getPosition(now, st.lat, st.lon).altitude;
    const deg = alt * 180 / Math.PI;
    const phase = st.forceNight || deg < -6 ? "night" : deg < 0 ? "dusk" : deg < 10 ? "golden" : "day";
    const night = phase === "night", lit = phase === "night" || phase === "dusk";

    // sky
    const bands = {
      day:    ["#5FA8D3", "#79B8DD", "#94C8E6", "#B4D9EE"],
      golden: ["#7E9CC8", "#E9A98B", "#F2B880", "#F7D59C"],
      dusk:   ["#3E3566", "#6E5A8A", "#C58BA0", "#F2B880"],
      night:  ["#0B0F1F", "#11162B", "#18203A", "#212A4A"],
    }[phase];
    bands.forEach((c, i) => px(c, 0, i * 12, W, i === 3 ? 60 : 12));
    const kind = st.wx?.kind || "clear";
    const overcast = ["cloudy", "rain", "storm", "snow", "fog"].includes(kind);
    if (overcast) { ctx.fillStyle = night ? "rgba(40,44,60,0.55)" : "rgba(120,128,140,0.55)"; ctx.fillRect(0, 0, W, 60); }
    if (night && !overcast) stars.forEach((s, i) => { if ((Math.sin(t * 1.3 + s.p * 20) + 1) / 2 > 0.25) px(s.p > 0.8 ? "#FFF4D6" : "#9AA6D6", s.x, s.y); });

    // sun and moon
    if (window.SunCalc && !st.forceNight && !overcast) {
      const sp = SunCalc.getPosition(now, st.lat, st.lon);
      if (sp.altitude > 0) { const p = skyPos(sp.altitude, sp.azimuth); disc(p.x, p.y, 4, phase === "day" ? "#FFF1B0" : "#FFC97A"); }
    }
    if (window.SunCalc) {
      const mp = SunCalc.getMoonPosition(now, st.lat, st.lon);
      const { fraction, phase: mph } = SunCalc.getMoonIllumination(now);
      const show = mp.altitude > 0 || st.forceNight;
      if (show && fraction > 0.04 && !overcast) {
        const p = st.forceNight && mp.altitude <= 0 ? { x: 150, y: 12 } : skyPos(mp.altitude, mp.azimuth);
        const r = 4, d = (mph < 0.5 ? -1 : 1) * 2 * r * fraction;
        if (night) glow(p.x, p.y, 14, 0.12);
        disc(p.x, p.y, r, night ? "#26305A" : bands[1]);
        disc(p.x, p.y, r, "#F4EBD0", (dx, dy) => (dx - d) * (dx - d) + dy * dy <= r * r);
      }
    }

    // clouds
    const nC = kind === "clear" ? 0 : kind === "partly" ? 3 : 6;
    for (let i = 0; i < nC; i++) {
      const cx = ((rnd(i + 40) * W + t * (1.5 + rnd(i + 41) * 2)) % (W + 40)) - 20, cy = 6 + rnd(i + 42) * 22;
      const col = night ? "#3A4060" : overcast ? "#C9CDD4" : "#FFFFFF";
      px(col, cx, cy, 16, 3); px(col, cx + 3, cy - 2, 9, 2); px(col, cx + 5, cy - 4, 5, 2);
    }
    if (kind === "storm" && Math.sin(t * 0.9) > 0.995) { ctx.fillStyle = "rgba(235,240,255,0.6)"; ctx.fillRect(0, 0, W, H); }

    // houses
    HOUSES.forEach((h, hi) => {
      px(h.c, h.x, h.top, h.w, 92 - h.top);
      px(night ? "#2A1A16" : "#3E2620", h.x, h.top, h.w, 2);                 // cornice
      for (let wy = h.top + 6; wy < 84; wy += 9)
        for (let wx = h.x + 4; wx < h.x + h.w - 4; wx += 7) {
          const k = hi * 100 + wx * 3 + wy;
          const on = lit && rnd(k) < (night ? 0.55 : 0.3);
          px(on ? (rnd(k + 1) < 0.3 ? "#FFE3A3" : "#FFC966") : (night ? "#1A1F33" : "#8FA7BB"), wx, wy, 3, 4);
          if (on && night) glow(wx + 1.5, wy + 2, 6, 0.10);
        }
    });
    // home door + stoop
    px("#2A1810", 11, 84, 6, 8); px("#FFC966", 13, 81, 2, 1); px("#6B5E55", 9, 92, 10, 1);
    // wheatpaste flyers on the gate next door
    px("#6B6F78", 92, 80, 20, 12);
    for (let y = 81; y < 92; y += 2) px("#565A63", 92, y, 20, 1);
    px("#FF48B0", 94, 74, 7, 9); px("#0078BF", 95, 76, 5, 1); px("#0078BF", 95, 78, 4, 1);
    px("#F4F1EA", 103, 76, 6, 7); px("#161616", 104, 78, 4, 1);

    // the el: columns, deck, girder, station canopy
    for (let x = 6; x < W; x += 24) px("#262B37", x, 48, 2, 44);
    px("#2E3340", 0, 44, W, 4);
    for (let x = 0; x < W; x += 3) px("#1D212B", x, 48, 2, 1);
    for (let x = 1; x < W; x += 6) px("#4A5162", x, 45, 1, 1);
    px("#3E5A46", 150, 34, 42, 2); px("#2E3340", 152, 36, 1, 8); px("#2E3340", 190, 36, 1, 8);

    // train (Manhattan-bound M at Central Av), arriving at the station as its countdown runs out
    if (st.train && st.train.secs != null) {
      const s = st.train.secs;
      let head = s > 0 ? STATION_X - s * (210 / 900) : s > -25 ? STATION_X : STATION_X + (-s - 25) * 3;
      if (head > 0 && head - 66 < W) {
        for (let c = 0; c < 3; c++) {
          const x = head - 22 * (c + 1);
          px("#AEB3BC", x, 37, 20, 7);
          for (let wx = x + 2; wx < x + 18; wx += 4) px(night ? "#FFE3A3" : "#4E5868", wx, 38, 2, 2);
          px(st.train.color || "#FF6319", x, 42, 20, 1);
        }
        if (night) glow(head, 40, 10, 0.18);
      }
    }

    // stairs up to the el + green globes
    for (let i = 0; i < 12; i++) px("#3A4050", 164 + i, 91 - i * 3.6, 3, 2);
    [160, 182].forEach(x => { px("#1E2230", x, 84, 1, 8); px("#6FCF7A", x - 1, 81, 3, 3); if (lit) glow(x, 82, 8, 0.14); });

    // sidewalk, curb, street
    px(night ? "#4C4A50" : "#BDB4A6", 0, 92, W, 6);
    px(night ? "#2E2C33" : "#5A5550", 0, 98, W, 1);
    px(night ? "#15141B" : "#2B2A33", 0, 99, W, 9);
    for (let x = 4; x < W; x += 16) px("#C9A64A", x, 103, 7, 1);

    // streetlamps (sodium amber at night)
    LAMPS.forEach(x => {
      px("#1E2230", x, 74, 1, 18); px("#1E2230", x - 2, 73, 5, 1);
      px(lit ? "#FFB347" : "#7B7F8A", x - 1, 74, 3, 1);
      if (lit) { glow(x, 76, 22, night ? 0.32 : 0.18); glow(x, 94, 16, night ? 0.22 : 0.1); }
    });

    // you
    const walkX = st.leaving ? 14 + ((t / 9) % 1) * 148 : 14;
    const bob = Math.floor(t * 2) % 2;
    const y0 = 84 - (st.leaving ? bob : 0);
    if (st.umbrella) { px("#C0492F", walkX - 3, y0 - 3, 9, 1); px("#C0492F", walkX - 2, y0 - 4, 7, 1); px("#1E2230", walkX + 1, y0 - 2, 1, 2); }
    px("#2A1A12", walkX, y0, 4, 1); px("#E8B98A", walkX, y0 + 1, 4, 2);
    px("#3E7D4F", walkX - 1, y0 + 3, 6, 3); px("#26232E", walkX, y0 + 6, 1, 2); px("#26232E", walkX + 3, y0 + 6, 1, 2);

    // weather
    if (st.rain) drops.forEach(d => { const y = (d.y + t * 60 * d.v) % H, x = (d.x - y * 0.25 + W) % W; px("rgba(170,195,230,0.55)", x, y, 1, 3); });
    if (st.snow) drops.forEach(d => { const y = (d.y + t * 9 * d.v) % H, x = (d.x + Math.sin(t + d.v * 3) * 3 + W) % W; px("#F4F4FA", x, y); });

    if (kind === "fog") { ctx.fillStyle = "rgba(220,224,230,0.35)"; ctx.fillRect(0, 30, W, 70); }
    if (night) { ctx.fillStyle = "rgba(10,12,30,0.18)"; ctx.fillRect(0, 0, W, H); }
  }

  function loop() { draw(); }
  return {
    mount(canvas) {
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext("2d");
      clearInterval(timer); timer = setInterval(loop, 100); draw();
    },
    unmount() { clearInterval(timer); timer = 0; },
    set(s) { st = { ...st, ...s }; },
  };
})();
