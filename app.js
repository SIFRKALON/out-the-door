// The app: works out which train to leave for, draws the page, and handles taps.
// Data comes from data.js (trains, alerts, weather), places from places.js, looks from mosaic.js and fx.js.

const $ = id => document.getElementById(id);
const ROUTE_COLOR = { M: "#FF6319", J: "#996633", Z: "#996633", L: "#A7A9AC" };
const mins = s => Math.max(0, Math.floor(s / 60));
const TRACK_WINDOW = 15 * 60;   // a little car starts its run 15 min before you need to leave

// The walk you see is 2 minutes shorter than the one the math uses: the station feels closer, you still leave on time.
const WALK_FIB_MIN = 2;
const shownWalk = w => Math.max(1, w - WALK_FIB_MIN);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

// ---------- views: trains, TMPL, groceries ----------
const VIEWS = ["trains", "tmpl", "grocery"];
let view = new URLSearchParams(location.search).get("view") || store.get("otd-view", "trains");
if (!VIEWS.includes(view)) view = "trains";
const PLACES = {
  tmpl:    { title: "Time to TMPL", times: (rows, now) => tmplTimes(rows, now) },
  grocery: { title: "Groceries",    times: (rows, now) => destTimes(GROCERIES, rows, now, 0) },
};

// ---------- pinning a train, the chime, keeping the screen on ----------
let pin = null;                       // { i: option index, t: arrival time }
let pinStage = null;                  // "later" | "soon" | "go", to chime once per step
let audio = null;
let keepOn = store.get("otd-awake", "0") === "1";
let wakeLock = null;

function unlockAudio() {   // must happen inside a tap on iPhone
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const o = audio.createOscillator(), g = audio.createGain(); g.gain.value = 0; o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.01);
  } catch (e) {}
}
// A two-tone station chime: one soft note at 2 minutes, the full ding-dong (twice) when it's time to go.
function chime(kind) {
  if (navigator.vibrate) navigator.vibrate(kind === "go" ? [180, 90, 180] : 120);
  if (!audio) return;
  const t0 = audio.currentTime + 0.02;
  const notes = kind === "go" ? [[659.25, 0], [523.25, 0.32], [659.25, 1.0], [523.25, 1.32]] : [[783.99, 0]];
  notes.forEach(([f, at]) => {
    [[1, 0.22], [2, 0.05]].forEach(([mult, vol]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = f * mult;
      g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(vol, t0 + at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.4);
      o.connect(g).connect(audio.destination); o.start(t0 + at); o.stop(t0 + at + 1.5);
    });
  });
}
async function updateWake() {
  const want = keepOn || !!pin;
  if (!("wakeLock" in navigator)) return;
  try {
    if (want && !wakeLock && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!want && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) {}
}

// ---------- moon facts for the moon tap ----------
function moonFacts() {
  if (!window.SunCalc) return "";
  const now = new Date(), { fraction, phase } = SunCalc.getMoonIllumination(now);
  const name = phase < 0.03 || phase > 0.97 ? "New moon" : phase < 0.22 ? "Waxing crescent" : phase < 0.28 ? "First quarter" : phase < 0.47 ? "Waxing gibbous"
    : phase < 0.53 ? "Full moon" : phase < 0.72 ? "Waning gibbous" : phase < 0.78 ? "Last quarter" : "Waning crescent";
  let next = null;   // step ahead until the phase passes full
  for (let h = 3, prev = phase; h < 24 * 31; h += 3) {
    const p = SunCalc.getMoonIllumination(new Date(now.getTime() + h * 3600e3)).phase;
    if (prev < 0.5 && p >= 0.5) { next = new Date(now.getTime() + h * 3600e3); break; }
    prev = p;
  }
  const when = next ? next.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "";
  return `${name} · ${Math.round(fraction * 100)}% lit${name !== "Full moon" && when ? ` · next full moon ${when}` : ""}`;
}
let toastTimer = 0;
function toast(text) {
  const el = $("toast");
  el.textContent = text; el.hidden = false; el.classList.remove("out");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add("out"); setTimeout(() => { el.hidden = true; }, 450); }, 4200);
}

// ---------- the model ----------
function model() {
  const now = Date.now() / 1000;
  let rows = OPTIONS.map((o, i) => ({
    o, i, color: ROUTE_COLOR[o.route] || "#888",
    catchable: (trains[i] || []).map(x => ({ ...x, leave: x.t - (o.walk + BUFFER_MIN) * 60 - now })).filter(x => x.leave > -30),
  })).filter(r => r.catchable.length).sort((a, b) => a.catchable[0].leave - b.catchable[0].leave);
  if (PRETEND.latenight) rows = rows.filter(r => r.o.route !== "M");
  if (PRETEND.go && rows[0]) rows[0] = { ...rows[0], catchable: [{ ...rows[0].catchable[0], leave: 15 }, ...rows[0].catchable.slice(1)] };

  // the pinned train, followed as its prediction moves; it unpins itself once it's gone
  let pinned = null;
  if (pin) {
    const r = rows.find(r => r.i === pin.i), x = r && r.catchable.find(x => Math.abs(x.t - pin.t) < 180);
    if (x) { pin.t = x.t; pinned = { ...r, catchable: [x] }; } else { pin = null; pinStage = null; updateWake(); }
  }

  // notes: late-night M first, then weather and air
  const notes = [];
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (updated && !rows.some(r => r.o.route === "M") && (h >= 23 || h < 6 || PRETEND.latenight))
    notes.push(["No M to Manhattan right now", "Overnight the M doesn't run into Manhattan. The J and L do, so they're listed.", "blue"]);
  notes.push(...packNow());

  const alertsList = alertsNow();
  const age = now - updated;
  return {
    now, rows, pinned, best: pinned || rows[0], notes, alerts: alertsList,
    alertRoutes: new Set(alertsList.filter(a => a.active).flatMap(a => a.routes || [])),
    sky: skyLine(now),
    status: lastError ? "Can't reach the MTA. Retrying…" : updated ? (age > 120 ? `Data ${Math.round(age / 60)} min old` : `Live · ${Math.round(age)}s ago`) : "",
  };
}

// ---------- drawing ----------
const WALKER = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="2.6" r="1.4" fill="currentColor" stroke="none"/><path d="M8.5 5.5 7 10l-2.5 4.5M7 10l3 1.5 1 3M8.5 5.5l2.5 2 2 .5M8.5 5.5 6 7l-1 2.5"/></svg>';
const setHTML = (el, html) => { if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; } };

function renderSign(m) {
  const b = m.best, head = $("head");
  if (!b) {
    head.className = "head quiet";
    setHTML(head, updated ? "No trains right now" : "Listening for trains…");
    $("what").textContent = ""; $("sub").textContent = "";
    return;
  }
  const x = b.catchable[0], go = x.leave < 60;
  head.className = "head" + (go ? " now" : "");
  setHTML(head, go ? "Time To Go!" : `Leave in <em title="Tap me"><span class="gilt">${mins(x.leave)}</span></em> min`);
  $("what").innerHTML = `for the <b>${b.o.route}</b> at ${esc(b.o.station)}${m.pinned ? '<span class="chip pin">pinned</span>' : ""}`;
  $("sub").textContent = `toward ${x.terminal} · arrives ${hm(x.t)} · ${shownWalk(b.o.walk)} min walk`;

  // chime as the pinned train moves through its steps
  if (m.pinned) {
    const stage = x.leave < 60 ? "go" : x.leave < 120 ? "soon" : "later";
    if (pinStage && stage !== pinStage && stage !== "later") chime(stage);
    pinStage = stage;
  }
}

function renderTrains(m) {
  const list = $("list");
  const head = `<div class="sign"><span class="arrow">←</span>Trains to Manhattan<span class="hint">${pin ? "tap again to unpin" : "tap a train to pin it"}</span></div>`;
  if (!m.rows.length) {
    list.dataset.keys = "";
    list.innerHTML = head + `<div class="empty">${updated ? "Nothing catchable right now." : "Loading trains…"}</div>`;
    return;
  }
  // keep rows stable so the little cars glide instead of jumping
  const keys = m.rows.map(r => r.i).join();
  if (list.dataset.keys !== keys) {
    list.innerHTML = head + m.rows.map(r => `<div class="row" data-i="${r.i}" role="button" tabindex="0">
      <div class="bullet" style="background:${r.color}">${r.o.route}</div>
      <div class="track" style="--rt:${(7 + rnd(r.i * 17) * 5).toFixed(1)}s;--rd:${(rnd(r.i * 29) * -8).toFixed(1)}s"><div class="rail">${mosaicRail(r.color, r.i + 1)}</div><div class="stn"></div><div class="car"></div></div>
      <div class="info"><div class="line1"><span class="leave"></span><span class="walk">${WALKER}${shownWalk(r.o.walk)} min walk</span></div><div class="stnname"></div><div class="next"></div></div>
    </div>`).join("");
    list.dataset.keys = keys;
  }
  list.querySelector(".hint").textContent = pin ? "tap again to unpin" : "tap a train to pin it";
  m.rows.forEach(r => {
    const el = list.querySelector(`.row[data-i="${r.i}"]`);
    const isPinned = !!pin && pin.i === r.i;
    const x = isPinned && m.pinned ? m.pinned.catchable[0] : r.catchable[0];
    const p = Math.min(1, Math.max(0, 1 - x.leave / TRACK_WINDOW));
    el.querySelector(".car").style.left = `${p * Math.max(0, el.querySelector(".track").clientWidth - 46)}px`;
    el.classList.toggle("go", x.leave < 60);
    el.classList.toggle("pinned", isPinned);
    el.setAttribute("aria-pressed", String(isPinned));
    el.querySelector(".leave").textContent = x.leave < 60 ? "Leave now" : `Leave in ${mins(x.leave)}`;
    el.querySelector(".stnname").innerHTML = tablet(r.o.station) + (m.alertRoutes.has(r.o.route) ? '<span class="chip">notice</span>' : "");
    const later = r.catchable.filter(y => y.t > x.t).slice(0, 2).map(y => y.leave < 60 ? "now" : mins(y.leave)).join(", ");
    el.querySelector(".next").innerHTML = `${later ? `<b>then ${later} min</b> · ` : ""}to ${esc(x.terminal)}`;
  });
}

function howTo(b) {
  if (b.walkOnly) return "walk from home";
  return `<b>${b.route}</b> from ${b.from} · ${b.leave < 60 ? "leave now" : `leave in ${mins(b.leave)}`} · off at ${b.exit}`;
}
function renderPlaces(m) {
  const P = PLACES[view], places = P.times(m.rows, m.now);
  $("places").innerHTML = `<div class="sign"><span class="arrow">→</span>${P.title} · you could be…</div>` + places.map((c, n) => `<div class="prow${n === 0 && c.best ? " top" : ""}">
      <div class="pmin">${c.best ? c.mins : "–"}<small>min</small></div>
      <div><div class="pdoing">${c.doing}</div><div class="pname">${tablet(c.name)}</div>
      <div class="phow">${c.best ? howTo(c.best) : "No live route right now"}</div></div>
    </div>`).join("");
}

let wasDark = null;
function render() {
  const m = model();
  $("clock").textContent = hm(m.now);
  const wx = wxNow();
  $("wx").innerHTML = wx ? `${wx.temp}°<span class="wxl"> · ${esc(wx.label)}</span>` : "";

  const dark = Fx.isNight();
  document.body.classList.toggle("dark", dark);
  if (dark !== wasDark) { wasDark = dark; paintPlaque($("plaque-bg"), dark); }
  Fx.set({ wx, lat: HOME.lat, lon: HOME.lon, season: PRETEND.season || "" });

  $("notes").innerHTML = m.notes.map(([t, d, k]) => `<div class="note glass${k ? " " + k : ""}"><b>${t}</b><span>${d}</span></div>`).join("");
  $("notices").hidden = !m.alerts.length;
  $("notices-sum").textContent = `SERVICE NOTICES · ${m.alerts.length}`;
  $("alerts").innerHTML = m.alerts.map(a => `<div class="alert"><small>${a.when.toUpperCase()}${a.type ? " · " + esc(a.type).toUpperCase() : ""}</small>${a.html}</div>`).join("");

  const trainsView = view === "trains";
  $("plaque").hidden = !trainsView; $("list").hidden = !trainsView; $("places").hidden = trainsView;
  renderSign(m);   // always, so a pinned train's chime still fires from the other tabs
  if (trainsView) renderTrains(m); else renderPlaces(m);

  document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  $("awake").setAttribute("aria-pressed", String(keepOn));
  $("sound").setAttribute("aria-pressed", String(Sound.on));
  if (Sound.on) Sound.set({ night: dark, wx });
  $("awake").textContent = keepOn ? "Screen stays on" : "Keep screen on";
  $("skyline").textContent = m.sky;
  $("status").textContent = m.status;
}

// ---------- taps ----------
document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => { view = b.dataset.view; store.set("otd-view", view); render(); }));

function togglePin(i) {
  const r = model().rows.find(r => r.i === i);
  if (!r) return;
  if (pin && pin.i === i) { pin = null; pinStage = null; }
  else { pin = { i, t: r.catchable[0].t }; pinStage = null; unlockAudio(); toast(`Pinned the ${r.o.route} at ${r.o.station}. I'll chime at 2 minutes and when it's Time To Go!`); }
  updateWake(); render();
}
$("list").addEventListener("click", e => { const row = e.target.closest(".row"); if (row) togglePin(+row.dataset.i); });
$("list").addEventListener("keydown", e => { const row = e.target.closest(".row"); if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); togglePin(+row.dataset.i); } });

$("head").addEventListener("click", e => {   // the gold number shines when you tap it
  const em = e.target.closest("em");
  if (!em) return;
  em.classList.remove("flash"); void em.offsetWidth; em.classList.add("flash");
});

$("sound").addEventListener("click", () => {
  if (Sound.on) { Sound.stop(); store.set("otd-sound", "0"); toast("Quiet."); }
  else { Sound.start(); Sound.set({ night: Fx.isNight(), wx: wxNow() }); store.set("otd-sound", "1"); toast("Sound on: a soft city hum, a train now and then, rain when it rains."); }
  render();
});
$("awake").addEventListener("click", () => { keepOn = !keepOn; store.set("otd-awake", keepOn ? "1" : "0"); updateWake(); render();
  toast(keepOn ? "The screen will stay on while this is open." : "The screen will lock as usual (unless a train is pinned)."); });
$("skyline").addEventListener("click", () => toast(moonFacts()));
document.addEventListener("click", e => {   // tap the moon itself, wherever it's showing
  if (e.target.closest("button, a, .row, details, .pretend, .plaque, .list")) return;
  if (Fx.moonHit(e.clientX, e.clientY)) toast(moonFacts());
});
$("sig").addEventListener("click", () => { $("pretend").hidden = !$("pretend").hidden; });
document.addEventListener("visibilitychange", () => { Sound.pause(document.hidden); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { refresh(); refreshWeather(); refreshAlerts(); updateWake(); } });

// ---------- start ----------
buildBand($("band"));
buildPretend($("pretend"), $("pr-badge"), render);
Fx.mount($("sky"));
addEventListener("resize", () => paintPlaque($("plaque-bg"), document.body.classList.contains("dark")));
if (window.ResizeObserver) new ResizeObserver(() => paintPlaque($("plaque-bg"), document.body.classList.contains("dark"))).observe($("plaque"));
render();
refresh(); refreshWeather(); refreshAlerts(); updateWake();
setInterval(refresh, REFRESH_SEC * 1000);
setInterval(refreshWeather, 10 * 60 * 1000);
setInterval(refreshAlerts, 2 * 60 * 1000);
setInterval(render, 1000);
