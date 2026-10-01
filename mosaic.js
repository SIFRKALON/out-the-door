// Mosaic: the tile band up top, the station-tablet border around the countdown,
// the mosaic train lines, and the little colored station-name markers.

// Seeded randomness so the same tiles come out the same way every load.
const rnd = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
function shade(hex, f) {   // f > 0 lighter, < 0 darker
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  return "#" + c.map(v => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)).toString(16).padStart(2, "0")).join("");
}
const tone = (c, i, k = 0.1) => shade(c, (rnd(i) - 0.5) * k);

// Palette after the old IRT/BMT walls: brick, ochre, sage, navy on cream.
const TILE = { grout: "#CFC5B2", brick: "#9A3F2C", ochre: "#C08A2E", sage: "#6E8B6A", navy: "#24427A" };
const GOLD = { a: "#7E5E17", b: "#C9A23E", h: "#FFF0B3" }, TEAL = { a: "#0A3F42", b: "#157A78", h: "#8FE3DA" };
const jewelOf = c => ({ a: shade(c, -0.4), b: c, h: shade(c, 0.62) });
// A shimmering tile. Each glints on its own clock (3–5.5s) so they twinkle instead of flashing together.
const jewel = (w, j, seed, extra = "") =>
  `<i class="jw" style="width:${w}px;${extra}--a:${j.a};--b:${j.b};--h:${j.h};--t:${(3 + rnd(seed) * 2.5).toFixed(1)}s;--d:${(rnd(seed * 3 + 1) * -6).toFixed(2)}s"></i>`;

// Top band: three courses. Brick; an ochre/sage checker with the odd gold or teal jewel; navy.
function buildBand(el) {
  let html = "";
  for (let col = 0; col < 260; col++) for (let row = 0; row < 3; row++) {
    const i = col * 3 + row;
    if (row === 1) {
      const j = rnd(i * 5 + 3);
      html += j < 0.06 ? jewel(9, GOLD, i, "height:9px;")
            : j < 0.10 ? jewel(9, TEAL, i, "height:9px;")
            : `<i style="background:${tone(col % 2 ? TILE.ochre : TILE.sage, i)}"></i>`;
    } else html += `<i style="background:${tone(row === 0 ? TILE.brick : TILE.navy, i)}"></i>`;
  }
  el.innerHTML = html;
}

// The countdown box as a station name tablet: three tile courses, gold-hearted rosettes in the corners,
// and a frosted-glass field so the sky shows through.
function paintPlaque(cv, dark) {
  if (!cv || !cv.parentElement.offsetWidth) return;
  const W = cv.parentElement.offsetWidth, H = cv.parentElement.offsetHeight, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const T = W < 480 ? 7.5 : 9, G = 1.5, S = T + G;
  const cols = Math.floor((W - G) / S), rows = Math.floor((H - G) / S);
  const ox = (W - cols * S - G) / 2 + G, oy = (H - rows * S - G) / 2 + G;
  c.fillStyle = dark ? "#0D1D1E" : TILE.grout; c.fillRect(0, 0, W, H);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const ring = Math.min(x, y, cols - 1 - x, rows - 1 - y);
    if (ring > 2) continue;
    const corner = (x < 3 || x > cols - 4) && (y < 3 || y > rows - 4);
    let col;
    if (corner) {
      const cx = x < 3 ? 1 : cols - 2, cy = y < 3 ? 1 : rows - 2;
      col = x === cx && y === cy ? "#D9B24A" : (Math.abs(x - cx) + Math.abs(y - cy) === 1 ? TILE.brick : TILE.navy);
    } else col = ring === 0 ? TILE.brick : ring === 1 ? ((x + y) % 2 ? TILE.ochre : TILE.sage) : TILE.navy;
    c.fillStyle = tone(col, y * 997 + x, 0.12);
    c.fillRect(ox + x * S, oy + y * S, T, T);
  }
  const fx0 = ox + 3 * S - G, fy0 = oy + 3 * S - G, fw = (cols - 6) * S + G, fh = (rows - 6) * S + G;
  c.clearRect(fx0, fy0, fw, fh);
  c.fillStyle = dark ? "rgba(16,40,40,0.52)" : "rgba(252,249,242,0.5)";
  c.fillRect(fx0, fy0, fw, fh);
  c.strokeStyle = dark ? "rgba(244,235,208,0.07)" : "rgba(160,145,120,0.13)"; c.lineWidth = 1;
  c.beginPath();
  for (let x = 3; x <= cols - 3; x++) { const X = ox + x * S - G / 2; c.moveTo(X, fy0); c.lineTo(X, fy0 + fh); }
  for (let y = 3; y <= rows - 3; y++) { const Y = oy + y * S - G / 2; c.moveTo(fx0, Y); c.lineTo(fx0 + fw, Y); }
  c.stroke();
}

// A train line laid in tesserae of its own color, with the odd jewel.
function mosaicRail(color, seed) {
  let out = "";
  for (let i = 0, x = 0; x < 1000; i++) {
    const w = 6 + Math.floor(rnd(seed * 97 + i) * 7), j = rnd(seed * 53 + i);
    out += j < 0.04 ? jewel(w, GOLD, seed * 131 + i)
         : j < 0.06 ? jewel(w, TEAL, seed * 137 + i)
         : j < 0.17 ? jewel(w, jewelOf(color), seed * 139 + i)
         : `<i style="width:${w}px;background:${shade(color, (rnd(seed * 31 + i) - 0.5) * 0.28)}"></i>`;
    x += w + 2;
  }
  return out;
}

// Each station and place gets its own two-color marker, like the different tablets in each station.
const TABLETS = {
  "Central Av": ["#7A2E2A", "#C08A2E"], "Myrtle Av–Broadway": ["#24427A", "#C08A2E"], "Jefferson St": ["#2F6B5E", "#7A2E2A"], "Morgan Av": ["#8A5A1E", "#24427A"],
  "Astor Place": ["#24427A", "#7A2E2A"], "Hell's Kitchen": ["#2F6B5E", "#C08A2E"], "West Village": ["#7A2E2A", "#2F6B5E"], "Avenue A": ["#8A5A1E", "#2F6B5E"], "Lexington": ["#24427A", "#C08A2E"],
  "Essex Crossing": ["#7A2E2A", "#C08A2E"], "Lower East Side": ["#24427A", "#C08A2E"], "Williamsburg": ["#2F6B5E", "#C08A2E"],
};
const tablet = name => { const [c, b] = TABLETS[name] || ["#2F6B5E", "#C08A2E"]; return `<span class="tablet" style="--tc:${c};--tb:${b}">${esc(name.toUpperCase())}</span>`; };
