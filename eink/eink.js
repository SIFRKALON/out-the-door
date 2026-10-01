// Paper view: a quiet, black-and-white board built for e-ink screens (and old tablets).
// Live data comes from ../data.js, which calls render() whenever trains, weather or alerts arrive.

const $ = id => document.getElementById(id);
const esc2 = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clockText = d => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;

// One row per station; lines that share a platform (M/J/Z at Myrtle) are merged.
function stations(now) {
  const byStation = new Map();
  OPTIONS.forEach((o, i) => {
    const s = byStation.get(o.station) || { name: o.station, routes: [], walk: o.walk, leaves: [] };
    if (!s.routes.includes(o.route)) s.routes.push(o.route);
    for (const x of trains[i] || []) {
      const leave = x.t - (o.walk + BUFFER_MIN) * 60 - now;
      if (leave > -30) s.leaves.push({ leave, route: o.route, terminal: x.terminal, station: o.station });
    }
    byStation.set(o.station, s);
  });
  const list = [...byStation.values()];
  list.forEach(s => s.leaves.sort((a, b) => a.leave - b.leave));
  return list;
}

const mins = s => Math.max(0, Math.floor(s / 60));

function render() {
  const now = Date.now() / 1000;
  $("clock").textContent = clockText(new Date());

  const list = stations(now);
  const best = list.flatMap(s => s.leaves).sort((a, b) => a.leave - b.leave)[0];

  if (best) {
    const m = mins(best.leave);
    $("bestLine").textContent = `Next: ${best.route} from ${best.station} · to ${best.terminal}`;
    $("big").textContent = m === 0 ? "Leave now" : `Leave in ${m} min`;
  } else if (lastError) {
    $("bestLine").textContent = "Can't reach the MTA";
    $("big").textContent = "Retrying…";
  } else if (updated) {
    $("bestLine").textContent = "No Manhattan-bound trains listed";
    $("big").textContent = "—";
  }

  $("rows").innerHTML = list.map(s => {
    const next = s.leaves.slice(0, 3).map(x => mins(x.leave));
    const times = next.length ? `leave ${next.join(", ")} min` : `<span class="dim">no trains</span>`;
    const bullets = s.routes.map(r => `<span class="bullet">${r}</span>`).join("");
    return `<div class="row"><span class="stn"><span class="bullets">${bullets}</span>${esc2(s.name)}</span><span class="times">${times}</span></div>`;
  }).join("");

  // One heads-up at most: late-night M, else the first weather/air warning, else active alerts.
  const h = new Date().getHours();
  const noM = updated && !list.some(s => s.routes.includes("M") && s.leaves.some(x => x.route === "M"));
  const wx = [...(warnings || []), ...(airWarnings || [])][0];
  const active = (alerts || []).filter(a => a.active);
  let note = "";
  if (noM && (h >= 23 || h < 6)) note = "<b>No M into Manhattan overnight.</b> Use the J or L.";
  else if (wx) note = `<b>${esc2(wx[0])}.</b> ${esc2(wx[1])}`;
  else if (active.length) note = `<b>Service change:</b> ${active[0].html}`;
  $("note").innerHTML = note;
  $("note").hidden = !note;

  $("sky").textContent = skyLine(now) || "To Manhattan";
  const age = now - updated;
  $("status").textContent = lastError ? "Offline · retrying" : updated ? `Updated ${clockText(new Date(updated * 1000))}${age > 120 ? " (stale)" : ""}` : "";
}

// A full black-white refresh, like real e-paper. Turn it off with ?flash=0.
const FLASH = new URLSearchParams(location.search).get("flash") !== "0";
function flashThenRender() {
  if (!FLASH) return render();
  const p = $("panel");
  p.classList.add("flash");
  setTimeout(() => { p.classList.remove("flash"); render(); }, 180);
}

// Keep the screen awake where the browser allows it.
async function keepAwake() { try { if ("wakeLock" in navigator && !document.hidden) await navigator.wakeLock.request("screen"); } catch (e) {} }

document.addEventListener("visibilitychange", () => { if (!document.hidden) { refresh(); refreshWeather(); refreshAlerts(); keepAwake(); } });
document.addEventListener("click", () => { refresh(); flashThenRender(); });

refresh(); refreshWeather(); refreshAlerts(); keepAwake();
setInterval(refresh, REFRESH_SEC * 1000);
setInterval(refreshWeather, 10 * 60 * 1000);
setInterval(refreshAlerts, 2 * 60 * 1000);
setInterval(flashThenRender, 30 * 1000);   // redraw every 30s; e-ink doesn't need more
