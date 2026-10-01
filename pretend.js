// Pretend mode (tap SIFRKALON): preview any weather, temperature, time of day, moon or other state,
// and call up the background visitors on demand. Train times stay live; nothing here is saved.

const PRETEND = {};
const PRETEND_OPTIONS = [
  ["sky",  "Weather", [["sunny", "Sunny"], ["partly", "Partly cloudy"], ["cloudy", "Cloudy"], ["rain", "Rain"], ["heavy", "Downpour"], ["storm", "Storm"], ["snow", "Snow"], ["fog", "Fog"]]],
  ["temp", "Temperature", [["cold", "Cold"], ["freezing", "Freezing"], ["hot", "Hot"]]],
  ["time", "Time of day", [["day", "Day"], ["golden", "Golden hour"], ["dusk", "Dusk"], ["night", "Night"]]],
  ["moon", "Moon", [["full", "Full moon"], ["new", "New moon"]]],
  ["extra", "Other", [["go", "Time to go"], ["latenight", "Late night (no M)"], ["alert", "Service alert"], ["air", "Bad air"], ["wind", "Windy"], ["uv", "Strong sun"], ["puddles", "Wet streets"]]],
];
const VISITORS = [["star", "Shooting star"], ["plane", "Plane"], ["pigeon", "Pigeon"], ["steam", "Steam"], ["leaves", "Leaves"], ["rat", "Pizza rat"], ["jogger", "Jogger"],
  ["marathon", "Marathon"], ["balloon", "Parade balloon"], ["cat", "Bodega cat"], ["bats", "Bats"], ["fireworks", "Fireworks"]];
const pretending = () => Object.keys(PRETEND).length > 0;

// Bend SunCalc so the sky, the moon and the sunset line all follow the pretend time and moon.
if (window.SunCalc) {
  const SC = { gp: SunCalc.getPosition, gmi: SunCalc.getMoonIllumination, gmp: SunCalc.getMoonPosition, gmt: SunCalc.getMoonTimes };
  const ALT = { day: 40, golden: 5, dusk: -3, night: -25 };
  SunCalc.getPosition = (d, a, b) => PRETEND.time ? { altitude: ALT[PRETEND.time] * Math.PI / 180, azimuth: 0.7 } : SC.gp(d, a, b);
  SunCalc.getMoonIllumination = d => PRETEND.moon === "full" ? { fraction: 1, phase: 0.5, angle: 0 } : PRETEND.moon === "new" ? { fraction: 0, phase: 0, angle: 0 } : SC.gmi(d);
  SunCalc.getMoonPosition = (d, a, b) => PRETEND.moon === "full" ? { altitude: 0.5, azimuth: -0.4 } : SC.gmp(d, a, b);
  SunCalc.getMoonTimes = (d, a, b) => PRETEND.moon === "full" ? { rise: new Date(Date.now() + 40 * 60e3) } : SC.gmt(d, a, b);
}

// Current conditions, real or pretend.
function wxNow() {
  if (!PRETEND.sky && !PRETEND.temp) return currentWx;
  const w = { ...(currentWx || { kind: "clear", heavy: false, label: "clear", temp: 62, feels: 62, cloud: 10, wind: 6, cold: false, hot: false }) };
  if (PRETEND.sky) {
    const k = { sunny: "clear", heavy: "rain" }[PRETEND.sky] || PRETEND.sky;
    Object.assign(w, { kind: k, heavy: PRETEND.sky === "heavy", cloud: { clear: 5, partly: 45 }[k] ?? 95,
      label: { sunny: "sunny", partly: "partly cloudy", cloudy: "cloudy", rain: "rain", heavy: "heavy rain", storm: "thunderstorms", snow: "snow", fog: "fog" }[PRETEND.sky] });
  }
  if (PRETEND.temp) {
    const f = { cold: 38, freezing: 22, hot: 93 }[PRETEND.temp];
    Object.assign(w, { temp: f, feels: f, cold: f <= 40, hot: f >= 84 });
  } else if (PRETEND.sky === "snow") Object.assign(w, { temp: 29, feels: 24, cold: true, hot: false });
  return w;
}

// Weather and air notes as [title, detail], real or pretend.
function packNow() {
  if (!pretending()) return [...warnings, ...airWarnings];
  const w = wxNow(), out = [];
  if (w && ["rain", "storm"].includes(w.kind)) out.push(w.kind === "storm" ? ["Thunderstorms possible", "Pretend: starting in about 20 min"] : ["Bring an umbrella", `Pretend: ${w.heavy ? "heavy rain" : "rain"} for the next few hours`]);
  if (w && w.kind === "snow") out.push(["Snow: wear boots", "Pretend: about 2 in by evening"]);
  if (PRETEND.puddles) out.push(["Wet streets: waterproof shoes", "Pretend: 0.4 in of rain earlier today"]);
  if (w && w.feels <= 32) out.push(["Freezing: coat, hat, gloves", `Feels like ${w.feels}°F`]);
  else if (w && w.feels <= 45) out.push(["Cold: warm coat", `Feels like ${w.feels}°F`]);
  if (w && w.feels >= 90) out.push(["Very hot: water and light clothes", `Feels like ${w.feels}°F`]);
  if (PRETEND.wind) out.push(["Windy", "Pretend: gusts up to 38 mph"]);
  if (PRETEND.uv) out.push(["Strong sun: sunscreen", "Pretend: UV index 8"]);
  if (PRETEND.air) out.push(["Unhealthy air: consider a mask", "Pretend: air quality index 165"]);
  return out;
}

function alertsNow() {
  if (!PRETEND.alert) return alerts;
  return [{ routes: ["M"], html: "<b>M</b> trains are running with delays while crews work on a signal problem (pretend)", when: "Now", type: "Delays", active: true }, ...alerts];
}

function buildPretend(sheet, badge, onChange) {
  sheet.innerHTML = `<div class="pr-head"><b>Let's pretend it's…</b><button type="button" id="pr-real">Back to real</button><button type="button" id="pr-close">Done</button></div>` +
    PRETEND_OPTIONS.map(([key, label, opts]) => `<div class="pr-group"><span>${label}</span><div>${opts.map(([v, t]) =>
      `<button type="button" class="pr-chip" data-k="${key === "extra" ? v : key}" data-v="${key === "extra" ? "1" : v}">${t}</button>`).join("")}</div></div>`).join("") +
    `<div class="pr-group"><span>Show me now</span><div>${VISITORS.map(([v, t]) => `<button type="button" class="pr-chip" data-egg="${v}">${t}</button>`).join("")}</div></div>`;
  sheet.addEventListener("click", e => {
    const egg = e.target.closest("[data-egg]");
    if (egg) { Fx.trigger(egg.dataset.egg); return; }
    const b = e.target.closest(".pr-chip");
    if (b) { const k = b.dataset.k, v = b.dataset.v; if (PRETEND[k] === v) delete PRETEND[k]; else PRETEND[k] = v; }
    if (e.target.id === "pr-real") for (const k in PRETEND) delete PRETEND[k];
    if (e.target.id === "pr-close") sheet.hidden = true;
    sheet.querySelectorAll(".pr-chip[data-k]").forEach(c => c.setAttribute("aria-pressed", String(PRETEND[c.dataset.k] === c.dataset.v)));
    badge.hidden = !pretending();
    badge.textContent = "Pretending: " + Object.entries(PRETEND).map(([k, v]) => v === "1" ? k : v).join(", ");
    onChange();
  });
}
